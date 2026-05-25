import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Edit2, ArrowLeft, Cpu, Loader2 } from "lucide-react";

const PROTECTION_LAYERS = ['BPCS','SIS','Mechanical','Procedural','Operator','Relief'] as const;
const FAIL_STATES = ['fail_open','fail_closed','fail_last','deenergize_to_trip','energize_to_trip'] as const;
const EQUIPMENT_TYPES = ['Valve','Transmitter','Switch','Controller','Pump','Motor','Vessel','Heat Exchanger','Other'] as const;

function FailBadge({ f }: { f?: string }) {
  if (!f) return <span className="text-xs text-slate-300">—</span>;
  const cls: Record<string,string> = { fail_open:'bg-blue-50 text-blue-700', fail_closed:'bg-red-50 text-red-700', fail_last:'bg-yellow-50 text-yellow-700', deenergize_to_trip:'bg-red-100 text-red-800 font-semibold', energize_to_trip:'bg-purple-100 text-purple-700' };
  const lbl: Record<string,string> = { fail_open:'FO', fail_closed:'FC', fail_last:'FL', deenergize_to_trip:'DE→Trip', energize_to_trip:'E→Trip' };
  return <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${cls[f]??'bg-gray-50 text-gray-600'}`}>{lbl[f]??f}</span>;
}

interface SceForm {
  tag_ref: string; description: string; equipment_type: string; protection_layer: string;
  fail_state: string; linked_sif_id: string; linked_interlock_id: string;
  proof_test_required: boolean; inspection_interval_days: string; notes: string;
}
const EMPTY: SceForm = { tag_ref:'', description:'', equipment_type:'Valve', protection_layer:'SIS', fail_state:'deenergize_to_trip', linked_sif_id:'', linked_interlock_id:'', proof_test_required:true, inspection_interval_days:'', notes:'' };

export default function HazopSafetyCriticalElementsPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id!);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<SceForm>(EMPTY);

  const { data: study } = useQuery<any>({ queryKey:['/api/hazop/studies',studyId], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}`).then(r=>r.json()) });
  const { data: sces=[], isLoading } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'safety-critical-elements'], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}/safety-critical-elements`).then(r=>r.json()) });
  const { data: sifs=[] } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'safety-functions'], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}/safety-functions`).then(r=>r.json()) });
  const { data: ils=[] } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'interlocks'], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}/interlocks`).then(r=>r.json()) });

  const inv = () => qc.invalidateQueries({ queryKey:['/api/hazop/studies',studyId,'safety-critical-elements'] });
  const createMut = useMutation({ mutationFn:(b:any)=>apiRequest('POST',`/api/hazop/studies/${studyId}/safety-critical-elements`,b).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'SCE created'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const updateMut = useMutation({ mutationFn:({id,body}:{id:number;body:any})=>apiRequest('PATCH',`/api/hazop/safety-critical-elements/${id}`,body).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'SCE updated'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const deleteMut = useMutation({ mutationFn:(sid:number)=>apiRequest('DELETE',`/api/hazop/safety-critical-elements/${sid}`), onSuccess:()=>{inv();toast({title:'Deleted'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });

  function openCreate() { setEditing(null); setForm(EMPTY); setShowDialog(true); }
  function openEdit(s:any) {
    setEditing(s);
    setForm({ tag_ref:s.tag_ref??'', description:s.description??'', equipment_type:s.equipment_type??'Valve', protection_layer:s.protection_layer??'SIS', fail_state:s.fail_state??'deenergize_to_trip', linked_sif_id:s.linked_sif_id?String(s.linked_sif_id):'', linked_interlock_id:s.linked_interlock_id?String(s.linked_interlock_id):'', proof_test_required:s.proof_test_required??true, inspection_interval_days:s.inspection_interval_days?String(s.inspection_interval_days):'', notes:s.notes??'' });
    setShowDialog(true);
  }
  function handleSubmit() {
    const b = { ...form, linked_sif_id:form.linked_sif_id?parseInt(form.linked_sif_id):null, linked_interlock_id:form.linked_interlock_id?parseInt(form.linked_interlock_id):null, inspection_interval_days:form.inspection_interval_days?parseInt(form.inspection_interval_days):null };
    if (editing) updateMut.mutate({id:editing.id,body:b});
    else createMut.mutate(b);
  }

  const total=sces.length; const ptRequired=sces.filter(s=>s.proof_test_required).length; const sisLinked=sces.filter(s=>s.linked_sif_id||s.linked_interlock_id).length;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={()=>setLocation(`/hazop/studies/${studyId}/alarm-trips`)}><ArrowLeft className="h-4 w-4"/></Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Cpu className="h-6 w-6 text-violet-600"/>SCE Registry</h1>
              {study && <p className="text-sm text-slate-500">{study.study_number} — {study.title}</p>}
            </div>
          </div>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={openCreate}><Plus className="h-4 w-4 mr-1"/>New SCE</Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[{label:'Total SCEs',value:total,cls:'text-slate-700'},{label:'Proof Test Required',value:ptRequired,cls:'text-amber-600'},{label:'Linked to SIF/IL',value:sisLinked,cls:'text-violet-600'}].map(k=>(
            <div key={k.label} className="rounded-lg border bg-white p-3 shadow-sm text-center">
              <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div>
        : sces.length===0 ? (
          <div className="text-center py-16 text-slate-400"><Cpu className="h-12 w-12 mx-auto mb-3 opacity-30"/><p className="font-medium">No SCEs yet</p><p className="text-sm mt-1">Add safety critical elements linked to SIFs or interlocks.</p></div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-slate-600 text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-24">SCE No.</th>
                <th className="px-3 py-2 text-left w-24">Tag Ref</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left w-24">Layer</th>
                <th className="px-3 py-2 text-left w-28">Fail State</th>
                <th className="px-3 py-2 text-left w-20">Proof Test</th>
                <th className="px-3 py-2 text-left w-24">Linked SIF</th>
                <th className="px-3 py-2 text-left w-24">Linked IL</th>
                <th className="px-3 py-2 text-right w-20">Actions</th>
              </tr></thead>
              <tbody>
                {sces.map((s,i)=>(
                  <tr key={s.id} className={`border-b last:border-0 hover:bg-slate-50 ${i%2?'bg-slate-50/40':''}`}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-violet-600">{s.sce_number}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{s.tag_ref}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{s.description}</div>
                      {s.equipment_type && <div className="text-xs text-slate-400">{s.equipment_type}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.protection_layer}</td>
                    <td className="px-3 py-2"><FailBadge f={s.fail_state}/></td>
                    <td className="px-3 py-2 text-center">{s.proof_test_required?<span className="text-xs font-semibold text-amber-600">✓ Req</span>:<span className="text-xs text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs font-mono text-red-600">{s.sif_number??'—'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-blue-600">{s.interlock_number??'—'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={()=>openEdit(s)}><Edit2 className="h-3.5 w-3.5 text-slate-500"/></Button>
                        <Button variant="ghost" size="icon" onClick={()=>deleteMut.mutate(s.id)}><Trash2 className="h-3.5 w-3.5 text-red-400"/></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?`Edit ${editing.sce_number}`:'New Safety Critical Element'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tag Reference <span className="text-red-500">*</span></Label><Input placeholder="e.g. XV-101" value={form.tag_ref} onChange={e=>setForm(p=>({...p,tag_ref:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Equipment Type</Label>
                <Select value={form.equipment_type} onValueChange={v=>setForm(p=>({...p,equipment_type:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{EQUIPMENT_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Description <span className="text-red-500">*</span></Label><Textarea placeholder="SCE description and safety function" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Protection Layer</Label>
                <Select value={form.protection_layer} onValueChange={v=>setForm(p=>({...p,protection_layer:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{PROTECTION_LAYERS.map(l=><SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Fail State</Label>
                <Select value={form.fail_state} onValueChange={v=>setForm(p=>({...p,fail_state:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{FAIL_STATES.map(f=><SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Linked SIF</Label>
                <Select value={form.linked_sif_id} onValueChange={v=>setForm(p=>({...p,linked_sif_id:v}))}>
                  <SelectTrigger><SelectValue placeholder="— None —"/></SelectTrigger>
                  <SelectContent><SelectItem value="">— None —</SelectItem>{(sifs as any[]).map(s=><SelectItem key={s.id} value={String(s.id)}>{s.sif_number} — {(s.description??s.sif_description??'').slice(0,40)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Linked Interlock</Label>
                <Select value={form.linked_interlock_id} onValueChange={v=>setForm(p=>({...p,linked_interlock_id:v}))}>
                  <SelectTrigger><SelectValue placeholder="— None —"/></SelectTrigger>
                  <SelectContent><SelectItem value="">— None —</SelectItem>{(ils as any[]).map(il=><SelectItem key={il.id} value={String(il.id)}>{il.interlock_number} — {il.description?.slice(0,40)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Inspection Interval (days)</Label><Input type="number" placeholder="e.g. 365" value={form.inspection_interval_days} onChange={e=>setForm(p=>({...p,inspection_interval_days:e.target.value}))}/></div>
            </div>
            <div className="flex items-center gap-2"><Checkbox id="pt" checked={form.proof_test_required} onCheckedChange={v=>setForm(p=>({...p,proof_test_required:!!v}))}/><Label htmlFor="pt">Proof Test Required</Label></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending||updateMut.isPending||!form.tag_ref||!form.description} className="bg-violet-600 hover:bg-violet-700 text-white">
              {(createMut.isPending||updateMut.isPending)&&<Loader2 className="h-4 w-4 animate-spin mr-1"/>}{editing?'Save Changes':'Create SCE'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

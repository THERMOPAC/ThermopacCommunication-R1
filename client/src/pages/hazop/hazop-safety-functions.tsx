import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Edit2, ArrowLeft, ShieldCheck, RefreshCw, Loader2, Lock, AlertTriangle } from "lucide-react";

const PROTECTION_LAYERS = ['BPCS','SIS','Mechanical','Procedural','Operator','Relief'] as const;
const SEVERITY_LEVELS = [
  { value:'minor',cls:'bg-green-100 text-green-700' },
  { value:'serious',cls:'bg-yellow-100 text-yellow-700' },
  { value:'major',cls:'bg-orange-100 text-orange-700' },
  { value:'critical',cls:'bg-red-100 text-red-700' },
  { value:'catastrophic',cls:'bg-red-200 text-red-900 font-bold' },
] as const;
const EFFECTIVENESS = ['low','medium','high','verified'] as const;
const STATUS_OPTS = ['draft','reviewed','approved'] as const;

function SevBadge({ s }: { s?: string }) {
  if (!s) return null;
  const e = SEVERITY_LEVELS.find(x => x.value === s);
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${e?.cls ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>;
}
function EffBadge({ r }: { r?: string }) {
  if (!r) return null;
  const cls: Record<string,string> = { low:'bg-red-50 text-red-600', medium:'bg-yellow-50 text-yellow-700', high:'bg-green-50 text-green-700', verified:'bg-emerald-100 text-emerald-700 font-semibold' };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls[r] ?? 'bg-gray-50 text-gray-600'}`}>{r}</span>;
}
function PlBadge({ pl }: { pl?: string }) {
  if (!pl) return null;
  const cls: Record<string,string> = { BPCS:'bg-blue-100 text-blue-700', SIS:'bg-red-100 text-red-700', Mechanical:'bg-slate-100 text-slate-700', Procedural:'bg-yellow-100 text-yellow-700', Operator:'bg-orange-100 text-orange-700', Relief:'bg-green-100 text-green-700' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls[pl] ?? 'bg-gray-100 text-gray-600'}`}>{pl}</span>;
}

interface SifForm {
  description: string; process_demand: string; safety_action: string;
  initiating_tag: string; final_element: string; protection_layer: string;
  consequence_severity: string; effectiveness_rating: string;
  is_independent_protection_layer: boolean; sil_target: string;
  response_time_sec: string; notes: string;
}
const EMPTY: SifForm = {
  description:'', process_demand:'', safety_action:'', initiating_tag:'', final_element:'',
  protection_layer:'SIS', consequence_severity:'major', effectiveness_rating:'high',
  is_independent_protection_layer:true, sil_target:'', response_time_sec:'', notes:'',
};

export default function HazopSafetyFunctionsPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id!);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<SifForm>(EMPTY);

  const { data: study } = useQuery<any>({ queryKey:['/api/hazop/studies',studyId], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}`).then(r=>r.json()) });
  const { data: sifs=[], isLoading } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'safety-functions'], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}/safety-functions`).then(r=>r.json()) });

  const inv = () => qc.invalidateQueries({ queryKey:['/api/hazop/studies',studyId,'safety-functions'] });

  const createMut = useMutation({ mutationFn:(b:any)=>apiRequest('POST',`/api/hazop/studies/${studyId}/safety-functions`,b).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'SIF created'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const updateMut = useMutation({ mutationFn:({id,body}:{id:number;body:any})=>apiRequest('PATCH',`/api/hazop/safety-functions/${id}`,body).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'SIF updated'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const deleteMut = useMutation({ mutationFn:(sid:number)=>apiRequest('DELETE',`/api/hazop/safety-functions/${sid}`), onSuccess:()=>{inv();toast({title:'Deleted'});}, onError:(e:any)=>toast({title:e.message?.includes('baselined')?'Locked':'Error',description:e.message,variant:'destructive'}) });
  const baselineMut = useMutation({ mutationFn:(sid:number)=>apiRequest('POST',`/api/hazop/safety-functions/${sid}/set-baseline`).then(r=>r.json()), onSuccess:(d:any)=>{inv();toast({title:`Baseline: ${d.baseline_revision}`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const extractMut = useMutation({ mutationFn:()=>apiRequest('POST',`/api/hazop/studies/${studyId}/safety-functions/extract`).then(r=>r.json()), onSuccess:(d:any)=>{inv();toast({title:`Extracted ${d.created} SIFs (${d.skipped} skipped)`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });

  function openCreate() { setEditing(null); setForm(EMPTY); setShowDialog(true); }
  function openEdit(s:any) {
    setEditing(s);
    setForm({ description:s.description??s.sif_description??'', process_demand:s.process_demand??s.initiating_cause??'', safety_action:s.safety_action??'', initiating_tag:s.initiating_tag??s.initiator_tag??'', final_element:s.final_element??s.final_element_tag??'', protection_layer:s.protection_layer??'SIS', consequence_severity:s.consequence_severity??'major', effectiveness_rating:s.effectiveness_rating??'high', is_independent_protection_layer:s.is_independent_protection_layer??true, sil_target:s.sil_target??'', response_time_sec:s.response_time_sec?String(s.response_time_sec):'', notes:s.notes??'' });
    setShowDialog(true);
  }
  function handleSubmit() {
    const b = { ...form, response_time_sec:form.response_time_sec?parseInt(form.response_time_sec):null };
    if (editing) updateMut.mutate({id:editing.id,body:b});
    else createMut.mutate(b);
  }

  const total=sifs.length; const iplCount=sifs.filter(s=>s.is_independent_protection_layer).length; const blCount=sifs.filter(s=>s.baseline_revision).length; const sisCount=sifs.filter(s=>s.protection_layer==='SIS').length;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={()=>setLocation(`/hazop/studies/${studyId}/scenarios`)}><ArrowLeft className="h-4 w-4"/></Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-red-600"/>Safety Instrumented Functions</h1>
              {study && <p className="text-sm text-slate-500">{study.study_number} — {study.title}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={()=>extractMut.mutate()} disabled={extractMut.isPending}>
              {extractMut.isPending?<Loader2 className="h-4 w-4 animate-spin mr-1"/>:<RefreshCw className="h-4 w-4 mr-1"/>}Extract from SIS Groups
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}><Plus className="h-4 w-4 mr-1"/>New SIF</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{label:'Total SIFs',value:total,cls:'text-slate-700'},{label:'SIS Type',value:sisCount,cls:'text-red-600'},{label:'IPL Designated',value:iplCount,cls:'text-blue-600'},{label:'Baselined',value:blCount,cls:'text-emerald-600'}].map(k=>(
            <div key={k.label} className="rounded-lg border bg-white p-3 shadow-sm text-center">
              <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div>
        : sifs.length===0 ? (
          <div className="text-center py-16 text-slate-400"><ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30"/><p className="font-medium">No SIFs yet</p><p className="text-sm mt-1">Use "Extract from SIS Groups" or add manually.</p></div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-slate-600 text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-24">SIF No.</th>
                <th className="px-3 py-2 text-left">Description / Demand</th>
                <th className="px-3 py-2 text-left w-24">Layer</th>
                <th className="px-3 py-2 text-left w-28">Severity</th>
                <th className="px-3 py-2 text-left w-24">Eff.</th>
                <th className="px-3 py-2 text-left w-12">IPL</th>
                <th className="px-3 py-2 text-left w-28">Baseline</th>
                <th className="px-3 py-2 text-right w-28">Actions</th>
              </tr></thead>
              <tbody>
                {sifs.map((s,i)=>(
                  <tr key={s.id} className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${i%2?'bg-slate-50/40':''}`}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-red-600">{s.sif_number}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{s.description??s.sif_description}</div>
                      {(s.process_demand??s.initiating_cause) && <div className="text-xs text-slate-400 truncate">Demand: {s.process_demand??s.initiating_cause}</div>}
                      {s.safety_action && <div className="text-xs text-blue-500 truncate">Action: {s.safety_action}</div>}
                    </td>
                    <td className="px-3 py-2"><PlBadge pl={s.protection_layer}/></td>
                    <td className="px-3 py-2"><SevBadge s={s.consequence_severity}/></td>
                    <td className="px-3 py-2"><EffBadge r={s.effectiveness_rating}/></td>
                    <td className="px-3 py-2 text-center">{s.is_independent_protection_layer ? <span className="text-emerald-600 font-bold text-xs">✓</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                    <td className="px-3 py-2">
                      {s.baseline_revision && <span className="inline-flex items-center gap-1 text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded"><Lock className="h-3 w-3"/>{s.baseline_revision}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!s.baseline_revision && <Button variant="ghost" size="icon" title="Set baseline" onClick={()=>baselineMut.mutate(s.id)} disabled={baselineMut.isPending}><ShieldCheck className="h-3.5 w-3.5 text-emerald-600"/></Button>}
                        <Button variant="ghost" size="icon" onClick={()=>openEdit(s)}><Edit2 className="h-3.5 w-3.5 text-slate-500"/></Button>
                        <Button variant="ghost" size="icon" onClick={()=>deleteMut.mutate(s.id)} disabled={!!s.baseline_revision}><Trash2 className={`h-3.5 w-3.5 ${s.baseline_revision?'text-slate-300':'text-red-400'}`}/></Button>
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
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-red-600"/>{editing?`Edit ${editing.sif_number}`:'New Safety Instrumented Function'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Description <span className="text-red-500">*</span></Label><Textarea placeholder="SIF description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Process Demand</Label><Input placeholder="Initiating cause / process demand" value={form.process_demand} onChange={e=>setForm(p=>({...p,process_demand:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Safety Action</Label><Input placeholder="Trip / shutdown action" value={form.safety_action} onChange={e=>setForm(p=>({...p,safety_action:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Initiating Tag</Label><Input placeholder="e.g. TSHH-202" value={form.initiating_tag} onChange={e=>setForm(p=>({...p,initiating_tag:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Final Element Tag</Label><Input placeholder="e.g. XV-101" value={form.final_element} onChange={e=>setForm(p=>({...p,final_element:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Protection Layer</Label>
                <Select value={form.protection_layer} onValueChange={v=>setForm(p=>({...p,protection_layer:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{PROTECTION_LAYERS.map(l=><SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Consequence Severity</Label>
                <Select value={form.consequence_severity} onValueChange={v=>setForm(p=>({...p,consequence_severity:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{SEVERITY_LEVELS.map(s=><SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Effectiveness</Label>
                <Select value={form.effectiveness_rating} onValueChange={v=>setForm(p=>({...p,effectiveness_rating:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{EFFECTIVENESS.map(e=><SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Response Time (sec)</Label><Input type="number" placeholder="e.g. 30" value={form.response_time_sec} onChange={e=>setForm(p=>({...p,response_time_sec:e.target.value}))}/></div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="ipl" checked={form.is_independent_protection_layer} onCheckedChange={v=>setForm(p=>({...p,is_independent_protection_layer:!!v}))}/>
              <Label htmlFor="ipl">Designated as Independent Protection Layer (IPL)</Label>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes / LOPA ref" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}/></div>
            {editing?.baseline_revision && <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0"/>Baselined ({editing.baseline_revision}) — changes require MOC.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending||updateMut.isPending||!form.description} className="bg-red-600 hover:bg-red-700 text-white">
              {(createMut.isPending||updateMut.isPending)&&<Loader2 className="h-4 w-4 animate-spin mr-1"/>}{editing?'Save Changes':'Create SIF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

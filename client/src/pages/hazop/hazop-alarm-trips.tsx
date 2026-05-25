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
import { Plus, Trash2, Edit2, ArrowLeft, Loader2, RefreshCw, Bell, ShieldCheck, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";

const ALARM_TYPES = ['alarm','trip','shutdown'] as const;
const PROTECTION_LAYERS = ['BPCS','SIS','Mechanical','Procedural','Operator','Relief'] as const;
const EFFECTIVENESS = ['low','medium','high','verified'] as const;
const HUMAN_DEP_LEVELS = ['none','low','medium','high','critical'] as const;
const CRITICALITY_CLASSES = ['instant','fast','medium','slow','operator_managed'] as const;
const PRIORITIES = ['low','medium','high','critical'] as const;
const RAT_STATUS = ['pending','rationalized','suppressed','deleted'] as const;

function TypeBadge({ t }: { t?: string }) {
  if (!t) return null;
  const cls: Record<string,string> = { alarm:'bg-yellow-100 text-yellow-700', trip:'bg-red-100 text-red-700', shutdown:'bg-red-200 text-red-900 font-bold' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls[t]??'bg-gray-100 text-gray-600'}`}>{t.toUpperCase()}</span>;
}
function PriorityBadge({ p }: { p?: string }) {
  if (!p) return null;
  const cls: Record<string,string> = { low:'bg-green-50 text-green-600', medium:'bg-yellow-50 text-yellow-700', high:'bg-orange-100 text-orange-700', critical:'bg-red-200 text-red-900 font-bold' };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls[p]??'bg-gray-50 text-gray-600'}`}>{p}</span>;
}
function EffBadge({ r }: { r?: string }) {
  if (!r) return null;
  const cls: Record<string,string> = { low:'bg-red-50 text-red-600', medium:'bg-yellow-50 text-yellow-700', high:'bg-green-50 text-green-700', verified:'bg-emerald-100 text-emerald-700 font-semibold' };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls[r]??'bg-gray-50 text-gray-600'}`}>{r}</span>;
}
function HdBadge({ h }: { h?: string }) {
  if (!h || h==='none') return null;
  const cls: Record<string,string> = { low:'bg-green-50 text-green-600', medium:'bg-yellow-50 text-yellow-700', high:'bg-orange-100 text-orange-700', critical:'bg-red-100 text-red-700 font-semibold' };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls[h]??'bg-gray-50 text-gray-600'}`}>HD:{h}</span>;
}

interface AtForm {
  description: string; alarm_type: string; protection_layer: string; criticality_class: string;
  effectiveness_rating: string; human_dependency_level: string; tag_ref: string;
  process_parameter: string; set_point: string; alarm_action: string; trip_action: string;
  response_time_sec: string; operator_action_required: boolean; priority: string;
  rationalization_status: string; notes: string;
}
const EMPTY: AtForm = { description:'', alarm_type:'alarm', protection_layer:'BPCS', criticality_class:'fast', effectiveness_rating:'medium', human_dependency_level:'medium', tag_ref:'', process_parameter:'', set_point:'', alarm_action:'', trip_action:'', response_time_sec:'', operator_action_required:true, priority:'medium', rationalization_status:'pending', notes:'' };

export default function HazopAlarmTripsPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id!);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<AtForm>(EMPTY);
  const [filterType, setFilterType] = useState('');
  const [filterRat, setFilterRat] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const { data: study } = useQuery<any>({ queryKey:['/api/hazop/studies',studyId], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}`).then(r=>r.json()) });
  const { data: ats=[], isLoading } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'alarm-trips',filterType,filterRat,filterPriority], queryFn:()=>{
    const p = new URLSearchParams();
    if (filterType) p.set('alarm_type',filterType);
    if (filterRat) p.set('rationalization_status',filterRat);
    if (filterPriority) p.set('priority',filterPriority);
    return apiRequest('GET',`/api/hazop/studies/${studyId}/alarm-trips?${p}`).then(r=>r.json());
  }});

  const inv = () => qc.invalidateQueries({ queryKey:['/api/hazop/studies',studyId,'alarm-trips'] });
  const createMut = useMutation({ mutationFn:(b:any)=>apiRequest('POST',`/api/hazop/studies/${studyId}/alarm-trips`,b).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'Alarm/Trip created'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const updateMut = useMutation({ mutationFn:({id,body}:{id:number;body:any})=>apiRequest('PATCH',`/api/hazop/alarm-trips/${id}`,body).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'Updated'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const deleteMut = useMutation({ mutationFn:(aid:number)=>apiRequest('DELETE',`/api/hazop/alarm-trips/${aid}`), onSuccess:()=>{inv();toast({title:'Deleted'});}, onError:(e:any)=>toast({title:e.message?.includes('baselined')?'Locked':'Error',description:e.message,variant:'destructive'}) });
  const baselineMut = useMutation({ mutationFn:(aid:number)=>apiRequest('POST',`/api/hazop/alarm-trips/${aid}/set-baseline`).then(r=>r.json()), onSuccess:(d:any)=>{inv();toast({title:`Baseline: ${d.baseline_revision}`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const reviewMut   = useMutation({ mutationFn:(aid:number)=>apiRequest('POST',`/api/hazop/alarm-trips/${aid}/mark-reviewed`).then(r=>r.json()), onSuccess:()=>{inv();toast({title:'Marked as reviewed'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const extractMut = useMutation({ mutationFn:()=>apiRequest('POST',`/api/hazop/studies/${studyId}/alarm-trips/extract`).then(r=>r.json()), onSuccess:(d:any)=>{inv();toast({title:`Extracted ${d.created} alarm/trips (${d.skipped} skipped)`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });

  function openCreate() { setEditing(null); setForm(EMPTY); setShowDialog(true); }
  function openEdit(a:any) {
    setEditing(a);
    setForm({ description:a.description??'', alarm_type:a.alarm_type??'alarm', protection_layer:a.protection_layer??'BPCS', criticality_class:a.criticality_class??'fast', effectiveness_rating:a.effectiveness_rating??'medium', human_dependency_level:a.human_dependency_level??'medium', tag_ref:a.tag_ref??'', process_parameter:a.process_parameter??'', set_point:a.set_point??'', alarm_action:a.alarm_action??'', trip_action:a.trip_action??'', response_time_sec:a.response_time_sec?String(a.response_time_sec):'', operator_action_required:a.operator_action_required??true, priority:a.priority??'medium', rationalization_status:a.rationalization_status??'pending', notes:a.notes??'' });
    setShowDialog(true);
  }
  function handleSubmit() {
    const b = { ...form, response_time_sec:form.response_time_sec?parseInt(form.response_time_sec):null };
    if (editing) updateMut.mutate({id:editing.id,body:b});
    else createMut.mutate(b);
  }

  const total=ats.length; const alarmCount=ats.filter(a=>a.alarm_type==='alarm').length; const tripCount=ats.filter(a=>a.alarm_type==='trip'||a.alarm_type==='shutdown').length; const blCount=ats.filter(a=>a.baseline_revision).length; const critCount=ats.filter(a=>a.priority==='critical'||a.priority==='high').length;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={()=>setLocation(`/hazop/studies/${studyId}/interlocks`)}><ArrowLeft className="h-4 w-4"/></Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Bell className="h-6 w-6 text-yellow-500"/>Alarm & Trip Register</h1>
              {study && <p className="text-sm text-slate-500">{study.study_number} — {study.title}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={()=>extractMut.mutate()} disabled={extractMut.isPending}>
              {extractMut.isPending?<Loader2 className="h-4 w-4 animate-spin mr-1"/>:<RefreshCw className="h-4 w-4 mr-1"/>}Extract from Groups
            </Button>
            <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white" onClick={openCreate}><Plus className="h-4 w-4 mr-1"/>New Alarm/Trip</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{label:'Total',value:total,cls:'text-slate-700'},{label:'Alarms',value:alarmCount,cls:'text-yellow-600'},{label:'Trips/Shutdown',value:tripCount,cls:'text-red-600'},{label:'Baselined',value:blCount,cls:'text-emerald-600'}].map(k=>(
            <div key={k.label} className="rounded-lg border bg-white p-3 shadow-sm text-center">
              <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-slate-500">Filter:</span>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white focus:outline-none">
            <option value="">All Types</option>{ALARM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white focus:outline-none">
            <option value="">All Priorities</option>{PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterRat} onChange={e=>setFilterRat(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white focus:outline-none">
            <option value="">All Status</option>{RAT_STATUS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          {(filterType||filterRat||filterPriority) && <Button variant="ghost" size="sm" onClick={()=>{setFilterType('');setFilterRat('');setFilterPriority('');}}>Clear</Button>}
        </div>

        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div>
        : ats.length===0 ? (
          <div className="text-center py-16 text-slate-400"><Bell className="h-12 w-12 mx-auto mb-3 opacity-30"/><p className="font-medium">No alarms/trips yet</p><p className="text-sm mt-1">Use "Extract from Groups" or add manually.</p></div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-slate-600 text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-28">Number</th>
                <th className="px-3 py-2 text-left w-20">Type</th>
                <th className="px-3 py-2 text-left">Description / Tag</th>
                <th className="px-3 py-2 text-left w-20">Priority</th>
                <th className="px-3 py-2 text-left w-20">Eff.</th>
                <th className="px-3 py-2 text-left w-20">HD</th>
                <th className="px-3 py-2 text-left w-24">Baseline</th>
                <th className="px-3 py-2 text-right w-28">Actions</th>
              </tr></thead>
              <tbody>
                {ats.map((a,i)=>(
                  <tr key={a.id} className={`border-b last:border-0 hover:bg-slate-50 ${i%2?'bg-slate-50/40':''}`}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-yellow-600">{a.alarm_number}</td>
                    <td className="px-3 py-2"><TypeBadge t={a.alarm_type}/></td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{a.description}</div>
                      {a.tag_ref && <div className="text-xs text-slate-400 font-mono">{a.tag_ref}{a.set_point?` @ ${a.set_point}`:''}</div>}
                    </td>
                    <td className="px-3 py-2"><PriorityBadge p={a.priority}/></td>
                    <td className="px-3 py-2"><EffBadge r={a.effectiveness_rating}/></td>
                    <td className="px-3 py-2"><HdBadge h={a.human_dependency_level}/></td>
                    <td className="px-3 py-2 space-y-1">
                      {a.baseline_revision && <span className="inline-flex items-center gap-1 text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded"><Lock className="h-3 w-3"/>{a.baseline_revision}</span>}
                      {a.requires_review && <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold"><AlertTriangle className="h-3 w-3"/>Review</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {a.requires_review && <Button variant="ghost" size="icon" title="Mark as reviewed" onClick={()=>reviewMut.mutate(a.id)} disabled={reviewMut.isPending}><CheckCircle2 className="h-3.5 w-3.5 text-amber-600"/></Button>}
                        {!a.baseline_revision && <Button variant="ghost" size="icon" title="Set baseline" onClick={()=>baselineMut.mutate(a.id)} disabled={baselineMut.isPending}><ShieldCheck className="h-3.5 w-3.5 text-emerald-600"/></Button>}
                        <Button variant="ghost" size="icon" onClick={()=>openEdit(a)}><Edit2 className="h-3.5 w-3.5 text-slate-500"/></Button>
                        <Button variant="ghost" size="icon" onClick={()=>deleteMut.mutate(a.id)} disabled={!!a.baseline_revision}><Trash2 className={`h-3.5 w-3.5 ${a.baseline_revision?'text-slate-300':'text-red-400'}`}/></Button>
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
          <DialogHeader><DialogTitle>{editing?`Edit ${editing.alarm_number}`:'New Alarm / Trip'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Description <span className="text-red-500">*</span></Label><Textarea placeholder="Alarm/trip description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Type <span className="text-red-500">*</span></Label>
                <Select value={form.alarm_type} onValueChange={v=>setForm(p=>({...p,alarm_type:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{ALARM_TYPES.map(t=><SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Protection Layer</Label>
                <Select value={form.protection_layer} onValueChange={v=>setForm(p=>({...p,protection_layer:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{PROTECTION_LAYERS.map(l=><SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Priority</Label>
                <Select value={form.priority} onValueChange={v=>setForm(p=>({...p,priority:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(pr=><SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Criticality Class</Label>
                <Select value={form.criticality_class} onValueChange={v=>setForm(p=>({...p,criticality_class:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{CRITICALITY_CLASSES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Effectiveness</Label>
                <Select value={form.effectiveness_rating} onValueChange={v=>setForm(p=>({...p,effectiveness_rating:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{EFFECTIVENESS.map(e=><SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Human Dependency</Label>
                <Select value={form.human_dependency_level} onValueChange={v=>setForm(p=>({...p,human_dependency_level:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{HUMAN_DEP_LEVELS.map(h=><SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Tag Reference</Label><Input placeholder="e.g. FIA-101" value={form.tag_ref} onChange={e=>setForm(p=>({...p,tag_ref:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Set Point</Label><Input placeholder="e.g. >85°C" value={form.set_point} onChange={e=>setForm(p=>({...p,set_point:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Rationalization Status</Label>
                <Select value={form.rationalization_status} onValueChange={v=>setForm(p=>({...p,rationalization_status:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{RAT_STATUS.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Response Time (sec)</Label><Input type="number" placeholder="e.g. 120" value={form.response_time_sec} onChange={e=>setForm(p=>({...p,response_time_sec:e.target.value}))}/></div>
            </div>
            <div className="flex items-center gap-2"><Checkbox id="oa" checked={form.operator_action_required} onCheckedChange={v=>setForm(p=>({...p,operator_action_required:!!v}))}/><Label htmlFor="oa">Operator Action Required</Label></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}/></div>
            {editing?.baseline_revision && <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0"/>Baselined ({editing.baseline_revision}) — changes require MOC.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending||updateMut.isPending||!form.description||!form.alarm_type} className="bg-yellow-500 hover:bg-yellow-600 text-white">
              {(createMut.isPending||updateMut.isPending)&&<Loader2 className="h-4 w-4 animate-spin mr-1"/>}{editing?'Save Changes':'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

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
import { Plus, Trash2, Edit2, ArrowLeft, Loader2, RefreshCw, ShieldCheck, Lock, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

const PROTECTION_LAYERS = ['BPCS','SIS','Mechanical','Procedural','Operator','Relief'] as const;
const IL_TYPES = ['process','safety','SIS'] as const;
const LOGIC_TYPES = ['parallel','sequential','latched','permissive','voting','manual_reset'] as const;
const CRITICALITY_CLASSES = ['instant','fast','medium','slow','operator_managed'] as const;
const SEVERITY_LEVELS = ['minor','serious','major','critical','catastrophic'] as const;
const EFFECTIVENESS = ['low','medium','high','verified'] as const;
const FAIL_STATES = ['fail_open','fail_closed','fail_last','deenergize_to_trip','energize_to_trip'] as const;
const ACTION_TYPES = ['stop','open','close','alarm','start','cooldown','isolate','de_energise','vent','other'] as const;

function ILTypeBadge({ t }: { t?: string }) {
  if (!t) return null;
  const cls: Record<string,string> = { process:'bg-blue-100 text-blue-700', safety:'bg-orange-100 text-orange-700', SIS:'bg-red-100 text-red-800 font-bold' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls[t]??'bg-gray-100 text-gray-600'}`}>{t}</span>;
}
function PlBadge({ pl }: { pl?: string }) {
  if (!pl) return null;
  const cls: Record<string,string> = { BPCS:'bg-blue-100 text-blue-700', SIS:'bg-red-100 text-red-700', Mechanical:'bg-slate-100 text-slate-700', Procedural:'bg-yellow-100 text-yellow-700', Operator:'bg-orange-100 text-orange-700', Relief:'bg-green-100 text-green-700' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls[pl]??'bg-gray-100 text-gray-600'}`}>{pl}</span>;
}
function SevBadge({ s }: { s?: string }) {
  if (!s) return null;
  const cls: Record<string,string> = { minor:'bg-green-100 text-green-700', serious:'bg-yellow-100 text-yellow-700', major:'bg-orange-100 text-orange-700', critical:'bg-red-100 text-red-700', catastrophic:'bg-red-200 text-red-900 font-bold' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls[s]??'bg-gray-100 text-gray-600'}`}>{s}</span>;
}
function FailBadge({ f }: { f?: string }) {
  if (!f) return <span className="text-xs text-slate-300">—</span>;
  const lbl: Record<string,string> = { fail_open:'FO', fail_closed:'FC', fail_last:'FL', deenergize_to_trip:'DE→Trip', energize_to_trip:'E→Trip' };
  const cls: Record<string,string> = { fail_open:'bg-blue-50 text-blue-700', fail_closed:'bg-red-50 text-red-700', fail_last:'bg-yellow-50 text-yellow-700', deenergize_to_trip:'bg-red-100 text-red-800 font-semibold', energize_to_trip:'bg-purple-100 text-purple-700' };
  return <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${cls[f]??'bg-gray-50 text-gray-600'}`}>{lbl[f]??f}</span>;
}

interface ILForm {
  description: string; interlock_type: string; protection_layer: string; logic_type: string;
  criticality_class: string; consequence_severity: string; effectiveness_rating: string;
  is_independent_protection_layer: boolean; initiating_condition: string; initiating_tag: string;
  final_element_tag: string; set_point: string; reset_type: string; bypass_provision: boolean;
  sil_level: string; notes: string;
}
const EMPTY: ILForm = { description:'', interlock_type:'process', protection_layer:'BPCS', logic_type:'parallel', criticality_class:'fast', consequence_severity:'major', effectiveness_rating:'high', is_independent_protection_layer:false, initiating_condition:'', initiating_tag:'', final_element_tag:'', set_point:'', reset_type:'manual', bypass_provision:false, sil_level:'', notes:'' };

export default function HazopInterlocksPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id!);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<ILForm>(EMPTY);
  const [expanded, setExpanded] = useState<number|null>(null);

  const { data: study } = useQuery<any>({ queryKey:['/api/hazop/studies',studyId], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}`).then(r=>r.json()) });
  const { data: ils=[], isLoading } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'interlocks'], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}/interlocks`).then(r=>r.json()) });

  const inv = () => qc.invalidateQueries({ queryKey:['/api/hazop/studies',studyId,'interlocks'] });
  const createMut = useMutation({ mutationFn:(b:any)=>apiRequest('POST',`/api/hazop/studies/${studyId}/interlocks`,b).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'Interlock created'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const updateMut = useMutation({ mutationFn:({id,body}:{id:number;body:any})=>apiRequest('PATCH',`/api/hazop/interlocks/${id}`,body).then(r=>r.json()), onSuccess:()=>{inv();setShowDialog(false);toast({title:'Updated'});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const deleteMut = useMutation({ mutationFn:(iid:number)=>apiRequest('DELETE',`/api/hazop/interlocks/${iid}`), onSuccess:()=>{inv();toast({title:'Deleted'});}, onError:(e:any)=>toast({title:e.message?.includes('baselined')?'Locked':'Error',description:e.message,variant:'destructive'}) });
  const baselineMut = useMutation({ mutationFn:(iid:number)=>apiRequest('POST',`/api/hazop/interlocks/${iid}/set-baseline`).then(r=>r.json()), onSuccess:(d:any)=>{inv();toast({title:`Baseline: ${d.baseline_revision}`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const extractMut = useMutation({ mutationFn:()=>apiRequest('POST',`/api/hazop/studies/${studyId}/interlocks/extract`).then(r=>r.json()), onSuccess:(d:any)=>{inv();toast({title:`Extracted ${d.created} interlocks (${d.skipped} skipped)`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });

  function openCreate() { setEditing(null); setForm(EMPTY); setShowDialog(true); }
  function openEdit(il:any) {
    setEditing(il);
    setForm({ description:il.description??'', interlock_type:il.interlock_type??'process', protection_layer:il.protection_layer??'BPCS', logic_type:il.logic_type??'parallel', criticality_class:il.criticality_class??'fast', consequence_severity:il.consequence_severity??'major', effectiveness_rating:il.effectiveness_rating??'high', is_independent_protection_layer:il.is_independent_protection_layer??false, initiating_condition:il.initiating_condition??'', initiating_tag:il.initiating_tag??'', final_element_tag:il.final_element_tag??'', set_point:il.set_point??'', reset_type:il.reset_type??'manual', bypass_provision:il.bypass_provision??false, sil_level:il.sil_level?String(il.sil_level):'', notes:il.notes??'' });
    setShowDialog(true);
  }
  function handleSubmit() {
    const b = { ...form, sil_level:form.sil_level?parseInt(form.sil_level):null };
    if (editing) updateMut.mutate({id:editing.id,body:b});
    else createMut.mutate(b);
  }

  const total=ils.length; const sisCount=ils.filter(i=>i.interlock_type==='SIS').length; const blCount=ils.filter(i=>i.baseline_revision).length; const iplCount=ils.filter(i=>i.is_independent_protection_layer).length;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={()=>setLocation(`/hazop/studies/${studyId}/safety-functions`)}><ArrowLeft className="h-4 w-4"/></Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-blue-600"/>Interlock Register
              </h1>
              {study && <p className="text-sm text-slate-500">{study.study_number} — {study.title}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={()=>extractMut.mutate()} disabled={extractMut.isPending}>
              {extractMut.isPending?<Loader2 className="h-4 w-4 animate-spin mr-1"/>:<RefreshCw className="h-4 w-4 mr-1"/>}Extract from Groups
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}><Plus className="h-4 w-4 mr-1"/>New Interlock</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{label:'Total Interlocks',value:total,cls:'text-slate-700'},{label:'SIS Interlocks',value:sisCount,cls:'text-red-600'},{label:'IPL Designated',value:iplCount,cls:'text-blue-600'},{label:'Baselined',value:blCount,cls:'text-emerald-600'}].map(k=>(
            <div key={k.label} className="rounded-lg border bg-white p-3 shadow-sm text-center">
              <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div>
        : ils.length===0 ? (
          <div className="text-center py-16 text-slate-400"><ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30"/><p className="font-medium">No interlocks yet</p><p className="text-sm mt-1">Use "Extract from Groups" or add manually.</p></div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b text-slate-600 text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left w-4"></th>
                <th className="px-3 py-2 text-left w-28">Number</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left w-20">Type</th>
                <th className="px-3 py-2 text-left w-24">Layer</th>
                <th className="px-3 py-2 text-left w-20">Logic</th>
                <th className="px-3 py-2 text-left w-20">Criticality</th>
                <th className="px-3 py-2 text-left w-24">Severity</th>
                <th className="px-3 py-2 text-left w-12">IPL</th>
                <th className="px-3 py-2 text-left w-24">Baseline</th>
                <th className="px-3 py-2 text-right w-28">Actions</th>
              </tr></thead>
              <tbody>
                {ils.map((il,i)=>(
                  <>
                  <tr key={il.id} className={`border-b hover:bg-slate-50 transition-colors ${i%2?'bg-slate-50/40':''} ${expanded===il.id?'bg-blue-50/40':''}`}>
                    <td className="px-2 py-2">
                      {il.actions?.length>0 && <button onClick={()=>setExpanded(expanded===il.id?null:il.id)} className="text-slate-400 hover:text-slate-600">
                        {expanded===il.id?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronRight className="h-3.5 w-3.5"/>}
                      </button>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-blue-600">{il.interlock_number}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{il.description}</div>
                      {il.initiating_tag && <div className="text-xs text-slate-400">Init: {il.initiating_tag} → {il.final_element_tag??'?'}</div>}
                    </td>
                    <td className="px-3 py-2"><ILTypeBadge t={il.interlock_type}/></td>
                    <td className="px-3 py-2"><PlBadge pl={il.protection_layer}/></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{il.logic_type}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-amber-600">{il.criticality_class}</td>
                    <td className="px-3 py-2"><SevBadge s={il.consequence_severity}/></td>
                    <td className="px-3 py-2 text-center">{il.is_independent_protection_layer?<span className="text-xs text-emerald-600 font-bold">✓</span>:<span className="text-xs text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">
                      {il.baseline_revision && <span className="inline-flex items-center gap-1 text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded"><Lock className="h-3 w-3"/>{il.baseline_revision}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!il.baseline_revision && <Button variant="ghost" size="icon" title="Set baseline" onClick={()=>baselineMut.mutate(il.id)} disabled={baselineMut.isPending}><ShieldCheck className="h-3.5 w-3.5 text-emerald-600"/></Button>}
                        <Button variant="ghost" size="icon" onClick={()=>openEdit(il)}><Edit2 className="h-3.5 w-3.5 text-slate-500"/></Button>
                        <Button variant="ghost" size="icon" onClick={()=>deleteMut.mutate(il.id)} disabled={!!il.baseline_revision}><Trash2 className={`h-3.5 w-3.5 ${il.baseline_revision?'text-slate-300':'text-red-400'}`}/></Button>
                      </div>
                    </td>
                  </tr>
                  {expanded===il.id && il.actions?.length>0 && (
                    <tr key={`${il.id}-actions`} className="border-b bg-blue-50/30">
                      <td colSpan={11} className="px-6 py-2">
                        <div className="text-xs font-semibold text-slate-500 mb-2">INTERLOCK ACTIONS ({il.actions.length})</div>
                        <div className="space-y-1">
                          {il.actions.map((a:any)=>(
                            <div key={a.id} className="flex items-center gap-3 text-xs">
                              <span className="font-mono text-slate-400 w-6">{a.sequence_no}.</span>
                              <span className="font-medium text-slate-700 flex-1">{a.action_description}</span>
                              <span className="text-slate-400">{a.action_type}</span>
                              <FailBadge f={a.fail_state}/>
                              {a.tag_ref && <span className="font-mono text-blue-600">{a.tag_ref}</span>}
                              {a.confidence_score!=null && <span className="text-emerald-600">{a.confidence_score}%</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600"/>{editing?`Edit ${editing.interlock_number}`:'New Interlock'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Description <span className="text-red-500">*</span></Label><Textarea placeholder="Interlock description and purpose" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Interlock Type</Label>
                <Select value={form.interlock_type} onValueChange={v=>setForm(p=>({...p,interlock_type:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{IL_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Protection Layer</Label>
                <Select value={form.protection_layer} onValueChange={v=>setForm(p=>({...p,protection_layer:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{PROTECTION_LAYERS.map(l=><SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Logic Type</Label>
                <Select value={form.logic_type} onValueChange={v=>setForm(p=>({...p,logic_type:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{LOGIC_TYPES.map(l=><SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Criticality Class</Label>
                <Select value={form.criticality_class} onValueChange={v=>setForm(p=>({...p,criticality_class:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{CRITICALITY_CLASSES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Consequence Severity</Label>
                <Select value={form.consequence_severity} onValueChange={v=>setForm(p=>({...p,consequence_severity:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{SEVERITY_LEVELS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Effectiveness</Label>
                <Select value={form.effectiveness_rating} onValueChange={v=>setForm(p=>({...p,effectiveness_rating:v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{EFFECTIVENESS.map(e=><SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Initiating Tag</Label><Input placeholder="e.g. TSHH-202" value={form.initiating_tag} onChange={e=>setForm(p=>({...p,initiating_tag:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Final Element Tag</Label><Input placeholder="e.g. XV-101" value={form.final_element_tag} onChange={e=>setForm(p=>({...p,final_element_tag:e.target.value}))}/></div>
              <div className="space-y-1"><Label>Set Point</Label><Input placeholder="e.g. >85°C" value={form.set_point} onChange={e=>setForm(p=>({...p,set_point:e.target.value}))}/></div>
              <div className="space-y-1"><Label>SIL Level</Label>
                <Select value={form.sil_level} onValueChange={v=>setForm(p=>({...p,sil_level:v}))}>
                  <SelectTrigger><SelectValue placeholder="— None —"/></SelectTrigger>
                  <SelectContent><SelectItem value="">— None —</SelectItem>{[1,2,3,4].map(n=><SelectItem key={n} value={String(n)}>SIL {n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2"><Checkbox id="ipl" checked={form.is_independent_protection_layer} onCheckedChange={v=>setForm(p=>({...p,is_independent_protection_layer:!!v}))}/><Label htmlFor="ipl">IPL Designated</Label></div>
              <div className="flex items-center gap-2"><Checkbox id="bp" checked={form.bypass_provision} onCheckedChange={v=>setForm(p=>({...p,bypass_provision:!!v}))}/><Label htmlFor="bp">Bypass Provision</Label></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}/></div>
            {editing?.baseline_revision && <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0"/>Baselined ({editing.baseline_revision}) — changes require MOC.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending||updateMut.isPending||!form.description} className="bg-blue-600 hover:bg-blue-700 text-white">
              {(createMut.isPending||updateMut.isPending)&&<Loader2 className="h-4 w-4 animate-spin mr-1"/>}{editing?'Save Changes':'Create Interlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

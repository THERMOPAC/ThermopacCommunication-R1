import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, ArrowLeft, Loader2, RefreshCw, Grid3X3, ShieldCheck, Lock, AlertTriangle, ChevronRight, CheckSquare, Square } from "lucide-react";

function BaselineBadge({ rev }: { rev?: string }) {
  if (!rev) return null;
  return <span className="inline-flex items-center gap-1 text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded"><Lock className="h-3 w-3"/>{rev}</span>;
}

export default function HazopCeMatrixPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id!);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedMatrix, setSelectedMatrix] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newScope, setNewScope] = useState('');

  const { data: study } = useQuery<any>({ queryKey:['/api/hazop/studies',studyId], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}`).then(r=>r.json()) });
  const { data: matrices=[], isLoading } = useQuery<any[]>({ queryKey:['/api/hazop/studies',studyId,'ce-matrices'], queryFn:()=>apiRequest('GET',`/api/hazop/studies/${studyId}/ce-matrices`).then(r=>r.json()) });
  const { data: matDetail } = useQuery<any>({ queryKey:['/api/hazop/ce-matrices',selectedMatrix], queryFn:()=>apiRequest('GET',`/api/hazop/ce-matrices/${selectedMatrix}`).then(r=>r.json()), enabled:!!selectedMatrix });

  const inv = () => qc.invalidateQueries({ queryKey:['/api/hazop/studies',studyId,'ce-matrices'] });
  const invDetail = () => { qc.invalidateQueries({ queryKey:['/api/hazop/ce-matrices',selectedMatrix] }); inv(); };

  const createMut = useMutation({ mutationFn:(b:any)=>apiRequest('POST',`/api/hazop/studies/${studyId}/ce-matrices`,b).then(r=>r.json()), onSuccess:(d:any)=>{inv();setShowCreateDialog(false);setSelectedMatrix(d.id);toast({title:`Matrix ${d.matrix_number} created`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const populateMut = useMutation({ mutationFn:()=>apiRequest('POST',`/api/hazop/studies/${studyId}/ce-matrices/populate-from-groups`,{}).then(r=>r.json()), onSuccess:(d:any)=>{inv();setSelectedMatrix(d.matrix_id);toast({title:`Matrix ${d.matrix_number}: ${d.row_count} rows, ${d.col_count} cols`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const baselineMut = useMutation({ mutationFn:(mid:number)=>apiRequest('POST',`/api/hazop/ce-matrices/${mid}/set-baseline`).then(r=>r.json()), onSuccess:(d:any)=>{invDetail();toast({title:`Baseline: ${d.baseline_revision}`});}, onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });
  const toggleCellMut = useMutation({ mutationFn:(b:any)=>apiRequest('POST',`/api/hazop/ce-matrices/${selectedMatrix}/cells`,b).then(r=>r.json()), onSuccess:()=>invDetail(), onError:(e:any)=>toast({title:'Error',description:e.message,variant:'destructive'}) });

  function isCellTriggered(rowId: number, colId: number): boolean {
    if (!matDetail?.cells) return false;
    const cell = matDetail.cells.find((c:any) => c.row_id === rowId && c.col_id === colId);
    return cell ? cell.triggered : false;
  }

  function toggleCell(rowId: number, colId: number) {
    const current = isCellTriggered(rowId, colId);
    toggleCellMut.mutate({ row_id: rowId, col_id: colId, triggered: !current });
  }

  return (
    <Layout>
      <div className="p-6 max-w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={()=>setLocation(`/hazop/studies/${studyId}/response-groups`)}><ArrowLeft className="h-4 w-4"/></Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Grid3X3 className="h-6 w-6 text-cyan-600"/>C&E Matrix</h1>
              {study && <p className="text-sm text-slate-500">{study.study_number} — {study.title}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={()=>populateMut.mutate()} disabled={populateMut.isPending}>
              {populateMut.isPending?<Loader2 className="h-4 w-4 animate-spin mr-1"/>:<RefreshCw className="h-4 w-4 mr-1"/>}Populate from Groups
            </Button>
            <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={()=>setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-1"/>New Matrix</Button>
          </div>
        </div>

        <div className="flex gap-4 h-[calc(100vh-180px)]">
          {/* Left panel: matrix list */}
          <div className="w-72 shrink-0 border rounded-lg bg-white shadow-sm overflow-y-auto">
            <div className="p-3 border-b bg-slate-50">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Matrices ({(matrices as any[]).length})</h2>
            </div>
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400"/></div>
            : (matrices as any[]).length===0 ? (
              <div className="text-center py-8 text-slate-400 text-sm px-4">No matrices yet.<br/>Use "Populate from Groups" to auto-create.</div>
            ) : (
              <div className="divide-y">
                {(matrices as any[]).map(m=>(
                  <button key={m.id} onClick={()=>setSelectedMatrix(m.id)}
                    className={`w-full text-left px-3 py-3 hover:bg-slate-50 transition-colors ${selectedMatrix===m.id?'bg-cyan-50 border-l-2 border-cyan-500':''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs font-semibold text-cyan-600">{m.matrix_number}</div>
                        <div className="text-xs text-slate-600 truncate mt-0.5">{m.title??'Untitled'}</div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs text-slate-400">{m.row_count}R × {m.col_count}C</span>
                          {m.baseline_revision && <span className="text-xs text-emerald-600 font-mono">{m.baseline_revision}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0"/>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: matrix detail */}
          <div className="flex-1 border rounded-lg bg-white shadow-sm overflow-auto">
            {!selectedMatrix ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center"><Grid3X3 className="h-16 w-16 mx-auto mb-3 opacity-20"/><p className="font-medium">Select a matrix to view</p></div>
              </div>
            ) : !matDetail ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Matrix header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-bold text-cyan-600">{matDetail.matrix_number}</span>
                      <BaselineBadge rev={matDetail.baseline_revision}/>
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5">{matDetail.title}</div>
                    {matDetail.scope_description && <div className="text-xs text-slate-400 mt-0.5">{matDetail.scope_description}</div>}
                    <div className="text-xs text-slate-500 mt-1">{matDetail.rows?.length??0} causes × {matDetail.columns?.length??0} effects</div>
                  </div>
                  {!matDetail.baseline_revision && (
                    <Button variant="outline" size="sm" onClick={()=>baselineMut.mutate(matDetail.id)} disabled={baselineMut.isPending}>
                      {baselineMut.isPending?<Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>:<ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600"/>}Set Baseline
                    </Button>
                  )}
                </div>

                {/* Grid */}
                {(matDetail.rows?.length??0)===0 || (matDetail.columns?.length??0)===0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40"/>
                    Matrix has no rows or columns yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="border bg-slate-100 px-2 py-1 text-left font-medium text-slate-600 sticky left-0 z-10 min-w-[200px]">
                            Cause \ Effect
                          </th>
                          {matDetail.columns.map((col:any)=>(
                            <th key={col.id} className="border bg-slate-50 px-1 py-1 text-center font-mono text-cyan-700 font-semibold min-w-[80px] max-w-[100px]">
                              <div className="truncate" title={col.description}>{col.tag_ref??col.description?.slice(0,8)}</div>
                              <div className="text-slate-400 font-normal text-xs normal-case truncate">{col.protection_layer}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matDetail.rows.map((row:any)=>(
                          <tr key={row.id}>
                            <td className="border bg-white px-2 py-1 sticky left-0 z-10 font-medium text-slate-700 max-w-[200px]">
                              <div className="truncate" title={row.description}>{row.description}</div>
                              <div className="text-slate-400 text-xs font-mono">{row.event_type}</div>
                            </td>
                            {matDetail.columns.map((col:any)=>{
                              const triggered = isCellTriggered(row.id, col.id);
                              return (
                                <td key={col.id} className="border text-center p-0">
                                  <button
                                    onClick={()=>toggleCell(row.id, col.id)}
                                    disabled={!!matDetail.baseline_revision || toggleCellMut.isPending}
                                    className={`w-full h-full p-2 transition-colors ${triggered?'bg-cyan-100 hover:bg-cyan-200':'hover:bg-slate-50'} ${matDetail.baseline_revision?'cursor-not-allowed opacity-70':''}`}
                                    title={triggered?'Triggered — click to remove':'Not triggered — click to set'}
                                  >
                                    {triggered
                                      ? <CheckSquare className="h-4 w-4 text-cyan-600 mx-auto"/>
                                      : <Square className="h-4 w-4 text-slate-200 mx-auto"/>}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1 mr-4"><CheckSquare className="h-3.5 w-3.5 text-cyan-600"/>Triggered</span>
                      <span className="inline-flex items-center gap-1"><Square className="h-3.5 w-3.5 text-slate-300"/>Not triggered</span>
                      {matDetail.baseline_revision && <span className="ml-4 text-amber-600">⚠ Baselined — grid is read-only</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New C&E Matrix</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Title</Label><Input placeholder="Matrix title (optional)" value={newTitle} onChange={e=>setNewTitle(e.target.value)}/></div>
            <div className="space-y-1"><Label>Scope Description</Label><Textarea placeholder="Scope and coverage of this matrix" value={newScope} onChange={e=>setNewScope(e.target.value)} rows={3}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={()=>createMut.mutate({title:newTitle||null,scope_description:newScope||null})} disabled={createMut.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              {createMut.isPending&&<Loader2 className="h-4 w-4 animate-spin mr-1"/>}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

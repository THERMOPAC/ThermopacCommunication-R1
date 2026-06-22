import { useState } from "react";
import { getProjectDisplayName } from "@/lib/project-utils";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useProjectFilter } from "@/hooks/use-project-filter";
import { 
  Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, 
  ChevronRight, ChevronDown, Clock, Eye, FileWarning, Layers, 
  ShieldAlert, Users, XCircle, Radar, ExternalLink, GitBranch,
  Search, Zap, Target, Timer, Hammer, RefreshCw, HardDrive, Loader2, Archive,
  History, RotateCcw
} from "lucide-react";

function HealthBadge({ health }: { health: string }) {
  const map: Record<string, { label: string; className: string }> = {
    on_track: { label: "On Track", className: "bg-green-100 text-green-800 border-green-300" },
    at_risk: { label: "At Risk", className: "bg-amber-100 text-amber-800 border-amber-300" },
    delayed: { label: "Delayed", className: "bg-red-100 text-red-800 border-red-300" },
    blocked: { label: "Blocked", className: "bg-gray-100 text-gray-800 border-gray-300" },
  };
  const cfg = map[health] || map.on_track;
  return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${cfg.className}`}>{cfg.label}</span>;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineStage({ stage, isLast }: { stage: any; isLast: boolean }) {
  const getBg = () => {
    if (stage.isBlocked) return "bg-red-50 border-red-300";
    if (stage.total === 0) return "bg-gray-50 border-gray-200";
    return "bg-green-50 border-green-300";
  };
  return (
    <div className="flex items-center gap-1">
      <div className={`border rounded-lg p-3 min-w-[130px] text-center ${getBg()}`}>
        <p className="text-xs font-semibold text-muted-foreground">{stage.key}</p>
        <p className="text-2xl font-bold">{stage.total}</p>
        <p className="text-[10px] text-muted-foreground">{stage.label}</p>
        {stage.statusBreakdown?.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {stage.statusBreakdown.slice(0, 3).map((s: any) => (
              <p key={s.status} className="text-[10px]">{s.count} {s.status}</p>
            ))}
          </div>
        )}
        {stage.ageDays !== null && stage.ageDays !== undefined && (
          <p className="text-[10px] mt-1 text-muted-foreground flex items-center justify-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> {stage.ageDays}d oldest
          </p>
        )}
        {stage.hasGap && (
          <div className="mt-1.5 flex items-center justify-center gap-1 text-red-600">
            <AlertTriangle className="h-3 w-3" />
            <span className="text-[10px] font-medium">Gap</span>
          </div>
        )}
      </div>
      {!isLast && <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
    </div>
  );
}

export default function EpcControlTower() {
  const [, navigate] = useLocation();
  const [projectId, setProjectId] = useState<number | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, projectId);

  const qs = projectId ? `?projectId=${projectId}` : '';

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["/api/epc-control-tower/summary", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/summary${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: pipeline, isLoading: loadingPipeline } = useQuery({
    queryKey: ["/api/epc-control-tower/pipeline", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/pipeline${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: bottlenecks, isLoading: loadingBottlenecks } = useQuery({
    queryKey: ["/api/epc-control-tower/bottlenecks", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/bottlenecks${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: ownership, isLoading: loadingOwnership } = useQuery({
    queryKey: ["/api/epc-control-tower/ownership-gaps", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/ownership-gaps${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: stageGates, isLoading: loadingStageGates } = useQuery({
    queryKey: ["/api/epc-control-tower/stage-gates", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/stage-gates${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: blocking, isLoading: loadingBlocking } = useQuery({
    queryKey: ["/api/epc-control-tower/blocking-analysis", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/blocking-analysis${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: riskIndicators, isLoading: loadingRisk } = useQuery({
    queryKey: ["/api/epc-control-tower/risk-indicators", projectId],
    queryFn: async () => { const r = await fetch(`/api/epc-control-tower/risk-indicators${qs}`, { credentials: 'include' }); return r.json(); },
  });

  const { data: docStatus, isLoading: loadingDocs } = useQuery({
    queryKey: ["/api/epc-monitoring/cutover-readiness"],
  });

  const { data: docHealth, isLoading: loadingDocHealth, refetch: refetchDocHealth } = useQuery<{ docs: any[] }>({
    queryKey: ["/api/projects", projectId, "document-health"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/document-health`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch document health');
      return r.json();
    },
    enabled: !!projectId,
    refetchInterval: (q) => {
      const docs = (q.state.data as any)?.docs ?? [];
      const hasActive = docs.some((d: any) => d.mirrorStatus === 'pending' || d.mirrorStatus === 'processing');
      return hasActive ? 30000 : false;
    },
  });

  const { data: pipelineRuns, isLoading: loadingPipelineRuns, refetch: refetchPipelineRuns } = useQuery<{ runs: any[] }>({
    queryKey: ['/api/projects', projectId, 'pipeline-runs'],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/pipeline-runs`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch pipeline runs');
      return r.json();
    },
    enabled: !!projectId,
    refetchInterval: (q) => {
      const runs = (q.state.data as any)?.runs ?? [];
      const hasRunning = runs.some((r: any) => r.status === 'running');
      return hasRunning ? 5000 : false;
    },
  });

  const { data: currentUser } = useQuery<{ id: number; role: string }>({
    queryKey: ['/api/user'],
  });

  const { data: legacyAccess } = useQuery({
    queryKey: ["/api/epc-monitoring/legacy-access"],
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const generateTasksMutation = useMutation({
    mutationFn: async (gapType: string) => {
      const res = await apiRequest('POST', '/api/epc-control-tower/generate-gap-tasks', { gapType });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Gap Tasks", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/blocking-analysis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/risk-indicators"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate tasks", variant: "destructive" });
    },
  });

  const hc = summary?.healthCounts || { on_track: 0, at_risk: 0, delayed: 0, blocked: 0 };
  const ms = summary?.milestones || { total: 0, completed: 0 };
  const pt = summary?.projectTasks || { total: 0, completed: 0, unassigned: 0 };

  return (
    <Layout>
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6" /> EPC Control Tower
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projectId ? (() => { const fp = (projects as any[]).find((p: any) => p.id === projectId); if (!fp) return 'Program-level EPC monitoring — all projects'; return `Filtered: ${getProjectDisplayName(fp)}`; })() : 'Program-level EPC monitoring — all projects'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={projectId?.toString() || "all"}
            onValueChange={(v) => setProjectId(v === "all" ? null : parseInt(v))}
          >
            <SelectTrigger className="w-[600px] h-8 text-xs">
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Projects</SelectItem>
              {filteredProjects.map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()} className="text-xs">
                  {getProjectDisplayName(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Checkbox id="showAllProjects" checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(!!v)} className="h-3.5 w-3.5" />
            <label htmlFor="showAllProjects" className="text-[10px] text-muted-foreground cursor-pointer select-none">Show All</label>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/summary"] });
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/pipeline"] });
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/bottlenecks"] });
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/ownership-gaps"] });
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/stage-gates"] });
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/blocking-analysis"] });
            queryClient.invalidateQueries({ queryKey: ["/api/epc-control-tower/risk-indicators"] });
            if (projectId) { refetchDocHealth(); refetchPipelineRuns(); }
          }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <button onClick={() => navigate("/epc/cutover-dashboard")} className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Cutover Dashboard
          </button>
          <button onClick={() => navigate("/project-dashboard")} className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Project Dashboard
          </button>
        </div>
      </div>

      {/* Section 1: Summary + Risk Health */}
      {loadingSummary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={CheckCircle2} label="On Track" value={hc.on_track} color="bg-green-100 text-green-700" />
            <StatCard icon={AlertTriangle} label="At Risk" value={hc.at_risk} color="bg-amber-100 text-amber-700" />
            <StatCard icon={Clock} label="Delayed" value={hc.delayed} color="bg-red-100 text-red-700" />
            <StatCard icon={XCircle} label="Blocked" value={hc.blocked} color="bg-gray-100 text-gray-700" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Layers} label="Total Projects" value={(summary?.projectsByStatus || []).reduce((a: number, s: any) => a + s.count, 0)}
              sub={(summary?.projectsByStatus || []).map((s: any) => `${s.count} ${s.status}`).join(", ")} color="bg-blue-100 text-blue-700" />
            <StatCard icon={Activity} label="Milestones" value={`${ms.completed}/${ms.total}`} sub={`${ms.total - ms.completed} remaining`} color="bg-purple-100 text-purple-700" />
            <StatCard icon={BarChart3} label="Deliverables" value={(summary?.deliverables || []).reduce((a: number, d: any) => a + d.count, 0)}
              sub={(summary?.deliverables || []).map((d: any) => `${d.count} ${d.status}`).join(", ")} color="bg-indigo-100 text-indigo-700" />
            <StatCard icon={Users} label="Project Tasks" value={`${pt.completed}/${pt.total}`}
              sub={pt.unassigned > 0 ? `${pt.unassigned} unassigned` : "All assigned"} color="bg-teal-100 text-teal-700" />
          </div>

          {/* Project table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Project Risk Health</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 font-medium">Project</th>
                      <th className="text-left py-2 font-medium">Manager</th>
                      <th className="text-center py-2 font-medium">Status</th>
                      <th className="text-center py-2 font-medium">Health</th>
                      <th className="text-center py-2 font-medium">Stages</th>
                      <th className="text-center py-2 font-medium">Overdue Tasks</th>
                      <th className="text-center py-2 font-medium">Unassigned</th>
                      <th className="text-center py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.projects || []).map((p: any) => (
                      <tr key={p.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 font-medium">
                          {getProjectDisplayName(p)}
                          {p.project_origin === 'sales_offer' && (
                            <Badge variant="outline" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]">
                              Order {p.source_order_number}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2">{p.manager_name || "—"}</td>
                        <td className="py-2 text-center"><Badge variant="outline" className="text-[10px]">{p.status}</Badge></td>
                        <td className="py-2 text-center"><HealthBadge health={p.health} /></td>
                        <td className="py-2 text-center">{p.completed_stages}/{p.total_stages}</td>
                        <td className="py-2 text-center">
                          {p.overdue_tasks > 0 ? <span className="text-red-600 font-medium">{p.overdue_tasks}</span> : "0"}
                        </td>
                        <td className="py-2 text-center">
                          {p.unassigned_tasks > 0 ? <span className="text-amber-600 font-medium">{p.unassigned_tasks}</span> : "0"}
                        </td>
                        <td className="py-2 text-center">
                          <button onClick={() => navigate(`/projects/${p.id}`)} className="text-blue-600 hover:underline">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Section 2: Pipeline */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">EPC Pipeline Flow</CardTitle></CardHeader>
        <CardContent>
          {loadingPipeline ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {(pipeline?.pipeline || []).map((stage: any, i: number) => (
                  <PipelineStage key={stage.key} stage={stage} isLast={i === (pipeline?.pipeline || []).length - 1} />
                ))}
              </div>
              {(pipeline?.pipeline || []).filter((s: any) => s.hasGap).length > 0 && (
                <div className="mt-3 space-y-1">
                  {(pipeline?.pipeline || []).filter((s: any) => s.hasGap).map((s: any) => (
                    <div key={s.key} className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{s.gapWarning}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Stage Gate Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-600" /> Pipeline Stage Gates — Per-Item Continuity
            {!loadingStageGates && stageGates && (
              <div className="flex gap-2 ml-auto">
                {(stageGates as any).criticalCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">{(stageGates as any).criticalCount} Critical</Badge>
                )}
                {(stageGates as any).warningCount > 0 && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">{(stageGates as any).warningCount} Warning</Badge>
                )}
                {(stageGates as any).criticalCount === 0 && (stageGates as any).warningCount === 0 && (
                  <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">No Gaps</Badge>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStageGates ? <Skeleton className="h-48" /> : stageGates ? (() => {
            const sg = stageGates as any;
            const sc = sg.stageCounts || {};
            const stageKeys = ['BOM', 'DWG', 'PLN', 'PO', 'WO', 'INS', 'DSP', 'COM', 'INV'];
            const stageLabels: Record<string, string> = {
              BOM: 'BOM', DWG: 'Drawing', PLN: 'Planning', PO: 'Purchase Order',
              WO: 'Work Order', INS: 'Inspection', DSP: 'Dispatch', COM: 'Commissioning', INV: 'Invoice'
            };
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
                  {stageKeys.map(k => {
                    const s = sc[k] || { total: 0, ready: 0, notReady: 0, missing: 0 };
                    const hasIssue = s.notReady > 0 || (s.missing > 0 && !s.na);
                    return (
                      <div key={k} className={`rounded-lg border p-2 text-center ${hasIssue ? 'border-amber-300 bg-amber-50' : s.total > 0 ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                        <p className="text-[10px] font-semibold text-muted-foreground">{k}</p>
                        <p className="text-lg font-bold">{s.total}</p>
                        <div className="text-[9px] space-y-0.5 mt-1">
                          <p className="text-green-700">{s.ready} ready</p>
                          {s.notReady > 0 && <p className="text-amber-700">{s.notReady} pending</p>}
                          {s.missing > 0 && <p className="text-red-700">{s.missing} missing</p>}
                          {s.na > 0 && <p className="text-gray-500">{s.na} n/a</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Tabs defaultValue="gaps">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="gaps">
                      Gaps ({sg.gaps?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="definitions">
                      Stage Definitions
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="gaps">
                    {(!sg.gaps || sg.gaps.length === 0) ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p className="text-sm">No pipeline gaps detected across active projects</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(sg.gapSummary || {}).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(sg.gapSummary || {}).map(([type, count]) => (
                              <Badge key={type} variant="outline" className={`text-[10px] ${
                                sg.gaps.find((g: any) => g.type === type)?.severity === 'critical' 
                                  ? 'text-red-600 border-red-300 bg-red-50' 
                                  : 'text-amber-600 border-amber-300 bg-amber-50'
                              }`}>
                                {type.replace(/_/g, ' ')}: {count as number}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="max-h-[300px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[80px]">Severity</TableHead>
                                <TableHead className="w-[120px]">Gap Type</TableHead>
                                <TableHead className="w-[100px]">Project</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>Issue</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sg.gaps.slice(0, 100).map((g: any, i: number) => (
                                <TableRow key={i}>
                                  <TableCell>
                                    <Badge variant={g.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px]">
                                      {g.severity}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-[10px]">{g.type}</TableCell>
                                  <TableCell className="font-mono text-[10px]">{g.projectCode}</TableCell>
                                  <TableCell className="text-xs">{g.item}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{g.message}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="definitions">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">Stage</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead>Entry Condition</TableHead>
                          <TableHead>Exit Condition</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(sg.stageDefinitions || []).map((d: any) => (
                          <TableRow key={d.key}>
                            <TableCell className="font-mono font-bold text-xs">{d.key}</TableCell>
                            <TableCell className="text-xs">{d.label}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{d.entry}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{d.exit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </div>
            );
          })() : null}
        </CardContent>
      </Card>

      {/* Section: Blocking Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-red-600" /> Stage-Wise Blocking Analysis
            {!loadingBlocking && blocking && (
              <div className="flex gap-2 ml-auto">
                <Badge variant="destructive" className="text-[10px]">
                  {(blocking as any).totalBlocked} / {(blocking as any).totalItems} blocked
                </Badge>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingBlocking ? <Skeleton className="h-48" /> : blocking ? (() => {
            const b = blocking as any;
            const ss = b.stageSummary || {};
            const stageOrder = ['BOM', 'DWG', 'PLN', 'PO_WO', 'INS', 'DSP', 'COM', 'INV'];
            const stageLabels: Record<string, string> = {
              BOM: 'BOM', DWG: 'Drawing', PLN: 'Planning', PO_WO: 'PO / WO',
              INS: 'Inspection', DSP: 'Dispatch', COM: 'Commissioning', INV: 'Invoice'
            };
            const stageColors: Record<string, string> = {
              BOM: 'bg-blue-100 border-blue-300 text-blue-700',
              DWG: 'bg-purple-100 border-purple-300 text-purple-700',
              PLN: 'bg-indigo-100 border-indigo-300 text-indigo-700',
              PO_WO: 'bg-orange-100 border-orange-300 text-orange-700',
              INS: 'bg-amber-100 border-amber-300 text-amber-700',
              DSP: 'bg-teal-100 border-teal-300 text-teal-700',
              COM: 'bg-cyan-100 border-cyan-300 text-cyan-700',
              INV: 'bg-green-100 border-green-300 text-green-700',
            };
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  {stageOrder.map(k => {
                    const s = ss[k] || { blocked: 0 };
                    return (
                      <div key={k} className={`rounded-lg border p-2 text-center ${s.blocked > 0 ? stageColors[k] : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                        <p className="text-[10px] font-semibold">{stageLabels[k]}</p>
                        <p className="text-xl font-bold">{s.blocked}</p>
                        <p className="text-[9px]">blocked</p>
                      </div>
                    );
                  })}
                </div>
                {b.blockedItems?.length > 0 && (
                  <div className="max-h-[350px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[70px]">Stage</TableHead>
                          <TableHead className="w-[80px]">Severity</TableHead>
                          <TableHead className="w-[80px]">Project</TableHead>
                          <TableHead className="w-[100px]">Item</TableHead>
                          <TableHead>Why Blocked</TableHead>
                          <TableHead className="w-[70px] text-right">Stuck</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {b.blockedItems.slice(0, 100).map((item: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${stageColors[item.blockedAtStage] || ''}`}>
                                {item.blockedAtStage}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'outline' : 'secondary'} className="text-[10px]">
                                {item.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[10px]">{item.projectCode}</TableCell>
                            <TableCell className="text-xs">{item.itemCode || 'PI-' + item.projectItemId}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.reasons.map((r: string, ri: number) => (
                                <span key={ri} className="block">{r}</span>
                              ))}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {item.stuckDays !== null ? (
                                <span className={item.stuckDays > 14 ? 'text-red-600 font-medium' : item.stuckDays > 7 ? 'text-amber-600 font-medium' : ''}>{item.stuckDays}d</span>
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {(!b.blockedItems || b.blockedItems.length === 0) && (
                  <div className="text-center py-6 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">All items are progressing — no stage-level blocks detected</p>
                  </div>
                )}
              </div>
            );
          })() : null}
        </CardContent>
      </Card>

      {/* Section: Risk Indicators + Actionable Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-600" /> Delay Risk Indicators
                {!loadingRisk && riskIndicators && (
                  <Badge variant="outline" className="text-[10px] ml-2 border-amber-300 text-amber-700">
                    {(riskIndicators as any).summary?.totalRisks || 0} risks
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRisk ? <Skeleton className="h-48" /> : riskIndicators ? (() => {
                const ri = riskIndicators as any;
                return (
                  <Tabs defaultValue="inspections">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="inspections" className="text-[10px]">
                        Inspections ({ri.pendingInspections?.count || 0})
                      </TabsTrigger>
                      <TabsTrigger value="drawings" className="text-[10px]">
                        Drawings ({ri.missingDrawings?.count || 0})
                      </TabsTrigger>
                      <TabsTrigger value="planning" className="text-[10px]">
                        Planning ({ri.unreleasedPlanning?.count || 0})
                      </TabsTrigger>
                      <TabsTrigger value="stale" className="text-[10px]">
                        Stale PO/WO ({ri.stalePoWo?.count || 0})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="inspections">
                      {ri.pendingInspections?.items?.length > 0 ? (
                        <div className="max-h-[280px] overflow-y-auto space-y-1 mt-2">
                          {ri.pendingInspections.items.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{item.inspection_order_number}</span>
                                <span className="text-muted-foreground ml-2">{item.item_code} — {item.project_code}</span>
                                <span className="ml-2 text-[10px] text-muted-foreground">{item.inspection_type} • {item.status}</span>
                              </div>
                              <span className={`flex-shrink-0 ml-2 font-medium ${item.age_days > 14 ? 'text-red-600' : item.age_days > 7 ? 'text-amber-600' : ''}`}>
                                <Timer className="h-3 w-3 inline mr-0.5" />{item.age_days}d
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground py-6 text-center">No pending inspections</p>}
                    </TabsContent>

                    <TabsContent value="drawings">
                      {ri.missingDrawings?.items?.length > 0 ? (
                        <div className="max-h-[280px] overflow-y-auto space-y-1 mt-2">
                          {ri.missingDrawings.items.map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                              <div>
                                <span className="font-medium">{item.item_code}</span>
                                <span className="text-blue-600 font-medium ml-2">{item.item_description}</span>
                                <span className="text-muted-foreground ml-2">({item.project_code})</span>
                              </div>
                              <Badge variant="outline" className="text-[10px]">{item.make_or_buy}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground py-6 text-center">All Make/Assembly items have drawings</p>}
                    </TabsContent>

                    <TabsContent value="planning">
                      {ri.unreleasedPlanning?.items?.length > 0 ? (
                        <div className="max-h-[280px] overflow-y-auto space-y-1 mt-2">
                          {ri.unreleasedPlanning.items.map((item: any) => (
                            <div key={item.planning_id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{item.item_code || 'PI-' + item.project_item_id}</span>
                                <span className="text-muted-foreground ml-2">{item.project_code}</span>
                                <Badge variant="outline" className="text-[10px] ml-2">{item.planning_status}</Badge>
                                <span className="text-[10px] text-muted-foreground ml-1">({item.planning_type})</span>
                              </div>
                              <span className={`flex-shrink-0 ml-2 font-medium ${item.age_days > 14 ? 'text-red-600' : item.age_days > 7 ? 'text-amber-600' : ''}`}>
                                {item.age_days}d
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground py-6 text-center">All planning records are released</p>}
                    </TabsContent>

                    <TabsContent value="stale">
                      {ri.stalePoWo?.items?.length > 0 ? (
                        <div className="max-h-[280px] overflow-y-auto space-y-1 mt-2">
                          {ri.stalePoWo.items.map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                              <div className="flex-1 min-w-0">
                                <Badge variant="outline" className="text-[10px] mr-1">{item.type}</Badge>
                                <span className="font-medium">{item.doc_number}</span>
                                <span className="text-muted-foreground ml-2">{item.item_code} — {item.project_code}</span>
                                <span className="text-[10px] text-muted-foreground ml-1">quality: {item.quality_status || 'pending'}</span>
                              </div>
                              <span className={`flex-shrink-0 ml-2 font-medium ${item.age_days > 30 ? 'text-red-600' : 'text-amber-600'}`}>
                                {item.age_days}d
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground py-6 text-center">No stale PO/WO records</p>}
                    </TabsContent>
                  </Tabs>
                );
              })() : null}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" /> Actionable Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">Convert critical gaps into assigned tasks automatically. De-duplicated — safe to run multiple times.</p>
                {[
                  { key: 'missing_bom', label: 'Missing BOMs', icon: Layers, count: (blocking as any)?.stageSummary?.BOM?.blocked || 0, color: 'text-blue-600' },
                  { key: 'unreleased_bom', label: 'Unreleased BOMs', icon: GitBranch, count: 0, color: 'text-purple-600' },
                  { key: 'missing_drawing', label: 'Missing Drawings', icon: Eye, count: (riskIndicators as any)?.missingDrawings?.count || 0, color: 'text-purple-600' },
                  { key: 'unreleased_planning', label: 'Unreleased Planning', icon: Timer, count: (riskIndicators as any)?.unreleasedPlanning?.count || 0, color: 'text-indigo-600' },
                  { key: 'pending_inspection', label: 'Stale Inspections (7d+)', icon: Search, count: (riskIndicators as any)?.pendingInspections?.items?.filter((x: any) => x.age_days >= 7).length || 0, color: 'text-amber-600' },
                ].map(action => (
                  <div key={action.key} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <action.icon className={`h-3.5 w-3.5 ${action.color}`} />
                      <div>
                        <p className="text-xs font-medium">{action.label}</p>
                        <p className="text-[10px] text-muted-foreground">{action.count} items</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      disabled={generateTasksMutation.isPending}
                      onClick={() => generateTasksMutation.mutate(action.key)}
                    >
                      <Hammer className="h-3 w-3 mr-1" />
                      Generate
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 3 + 4: Bottlenecks + Ownership */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bottlenecks - 3 cols */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-600" /> Critical Delays & Bottlenecks
                {!loadingBottlenecks && (
                  <Badge variant="destructive" className="text-[10px] ml-2">
                    {(bottlenecks?.counts?.milestones || 0) + (bottlenecks?.counts?.deliverables || 0) + (bottlenecks?.counts?.tasks || 0)}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBottlenecks ? <Skeleton className="h-48" /> : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {bottlenecks?.overdueMilestones?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Overdue Milestones ({bottlenecks.overdueMilestones.length})</p>
                      {bottlenecks.overdueMilestones.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                          <div>
                            <span className="font-medium">{m.stage_name}</span>
                            <span className="text-muted-foreground ml-2">{m.project_code}</span>
                          </div>
                          <span className="text-red-600 font-medium">{m.days_overdue}d overdue</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {bottlenecks?.overdueDeliverables?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Overdue Deliverables ({bottlenecks.overdueDeliverables.length})</p>
                      {bottlenecks.overdueDeliverables.map((d: any) => (
                        <div key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                          <div>
                            <span className="font-medium">{d.name}</span>
                            <span className="text-muted-foreground ml-2">{d.project_code}</span>
                          </div>
                          <span className="text-red-600 font-medium">{d.days_overdue}d overdue</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {bottlenecks?.overdueTasks?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Overdue Tasks ({bottlenecks.overdueTasks.length})</p>
                      {bottlenecks.overdueTasks.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{t.title}</span>
                            <span className="text-muted-foreground">{t.project_code} — {t.assigned_to_name || "Unassigned"}</span>
                          </div>
                          <span className="text-red-600 font-medium flex-shrink-0 ml-2">{t.days_overdue}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(bottlenecks?.counts?.milestones || 0) + (bottlenecks?.counts?.deliverables || 0) + (bottlenecks?.counts?.tasks || 0) === 0 && (
                    <p className="text-xs text-muted-foreground py-8 text-center">No critical delays or bottlenecks detected.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ownership Gaps - 2 cols */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-600" /> Ownership Gaps
                {!loadingOwnership && (
                  <Badge variant="outline" className="text-[10px] ml-2 border-amber-300 text-amber-700">
                    {Object.values(ownership?.counts || {}).reduce((a: number, b: any) => a + (b as number), 0) as number}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingOwnership ? <Skeleton className="h-48" /> : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {ownership?.unassignedTasks?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                        <FileWarning className="h-3 w-3" /> Unassigned Tasks ({ownership.unassignedTasks.length})
                      </p>
                      {ownership.unassignedTasks.map((t: any) => (
                        <div key={t.id} className="text-xs py-1.5 border-b last:border-0">
                          <p className="font-medium">{t.title}</p>
                          <p className="text-muted-foreground">{t.project_code} — {t.priority}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {ownership?.kickoffWarnings?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Kickoff Assignment Warnings ({ownership.kickoffWarnings.length})
                      </p>
                      {ownership.kickoffWarnings.map((w: any) => (
                        <div key={w.id} className="text-xs py-1.5 border-b last:border-0">
                          <p className="font-medium">{w.title}</p>
                          <p className="text-muted-foreground">{w.status} — assigned to {w.assigned_to_name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {ownership?.phasesNoLead?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Phases Without Lead ({ownership.phasesNoLead.length})</p>
                      {ownership.phasesNoLead.slice(0, 10).map((ph: any) => (
                        <div key={ph.id} className="text-xs py-1 border-b last:border-0">
                          <span className="font-medium">{ph.phase_name}</span>
                          <span className="text-muted-foreground ml-2">{ph.project_code}</span>
                        </div>
                      ))}
                      {ownership.phasesNoLead.length > 10 && (
                        <p className="text-[10px] text-muted-foreground mt-1">+{ownership.phasesNoLead.length - 10} more</p>
                      )}
                    </div>
                  )}
                  {ownership?.projectsNoManager?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Projects Without Manager ({ownership.projectsNoManager.length})</p>
                      {ownership.projectsNoManager.map((p: any) => (
                        <div key={p.id} className="text-xs py-1 border-b last:border-0 font-medium">{getProjectDisplayName(p)}</div>
                      ))}
                    </div>
                  )}
                  {ownership?.deliverablesNoOwner?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Deliverables Without Owner ({ownership.deliverablesNoOwner.length})</p>
                      {ownership.deliverablesNoOwner.map((d: any) => (
                        <div key={d.id} className="text-xs py-1 border-b last:border-0">
                          <span className="font-medium">{d.name}</span>
                          <span className="text-muted-foreground ml-2">{d.project_code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.values(ownership?.counts || {}).every((v: any) => v === 0) && (
                    <p className="text-xs text-muted-foreground py-8 text-center">No ownership gaps detected.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 5: Document Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5a: Drawing & Document Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" /> Drawing & Document Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDocs ? <Skeleton className="h-32" /> : (
              <div className="space-y-3">
                {docStatus?.dwg && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">DWG File Status</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'EPC With Files', value: docStatus.dwg.epcWithFiles },
                        { label: 'Pending Upload', value: docStatus.dwg.pendingUpload },
                        { label: 'File Not Available', value: docStatus.dwg.fileNotAvailable },
                        { label: 'Superseded', value: docStatus.dwg.superseded },
                        { label: 'Total', value: docStatus.dwg.total },
                      ].map((item: any) => (
                        <div key={item.label} className="flex justify-between text-xs bg-muted/50 px-3 py-2 rounded">
                          <span>{item.label}</span>
                          <span className="font-medium">{item.value || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {docStatus?.featureFlags && Array.isArray(docStatus.featureFlags) && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Feature Flags</p>
                    <div className="space-y-1">
                      {(docStatus.featureFlags as any[]).map((f: any) => (
                        <div key={f.flag_name || f.flag} className="flex items-center justify-between text-xs">
                          <span className="font-mono text-[10px]">{f.flag_name || f.flag}</span>
                          <Badge variant={f.enabled || f.value ? "default" : "outline"} className="text-[10px]">{f.enabled || f.value ? "ON" : "OFF"}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {docStatus?.dsp && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">DSP Adoption</p>
                    <div className="text-xs">
                      <span>Records: <strong>{docStatus.dsp.totalEpcDispatches || 0}</strong></span>
                      <span className="ml-3">Status: <strong>{docStatus.dsp.status || 'inactive'}</strong></span>
                      {docStatus.dsp.firstCreated && (
                        <span className="ml-3 text-muted-foreground">First used: {fmtDate(docStatus.dsp.firstCreated)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5b: Legacy Dependence */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-amber-600" /> Legacy Dependence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDocs ? <Skeleton className="h-32" /> : (
              <div className="space-y-3">
                {docStatus?.legacyTrend7Day && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Legacy Access — Last 7 Days</p>
                    <div className="flex items-end gap-1 h-16">
                      {(docStatus.legacyTrend7Day as any[]).map((d: any, i: number) => {
                        const max = Math.max(...(docStatus.legacyTrend7Day as any[]).map((x: any) => parseInt(x.accesses) || 0), 1);
                        const h = Math.max(((parseInt(d.accesses) || 0) / max) * 100, 4);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            <div className="w-full bg-amber-200 rounded-t" style={{ height: `${h}%` }} title={`${d.accesses || 0} reads`} />
                            <span className="text-[9px] text-muted-foreground mt-0.5">{d.day?.slice(5) || ''}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Total: {(docStatus.legacyTrend7Day as any[]).reduce((a: number, d: any) => a + (parseInt(d.accesses) || 0), 0)} legacy reads
                    </p>
                  </div>
                )}

                {legacyAccess && Array.isArray(legacyAccess) && legacyAccess.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Top Active Legacy Path Families</p>
                    {legacyAccess.slice(0, 5).map((la: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <span className="font-mono text-[10px] truncate max-w-[200px]">{la.path_family || la.pathFamily}</span>
                        <div className="flex items-center gap-2">
                          <span>{la.access_count || la.accessCount} reads</span>
                          <span className="text-muted-foreground">{la.unique_users || la.uniqueUsers} users</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {docStatus?.cutoverBlockers && (docStatus.cutoverBlockers as any[]).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-2">Cutover Blockers</p>
                    {(docStatus.cutoverBlockers as any[]).map((b: any, i: number) => (
                      <div key={i} className="text-xs bg-red-50 px-3 py-1.5 rounded mb-1 flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                        <span>{b.description || b}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(!docStatus?.legacyTrend7Day || (docStatus.legacyTrend7Day as any[]).every((d: any) => (parseInt(d.accesses) || 0) === 0)) &&
                 (!legacyAccess || !Array.isArray(legacyAccess) || legacyAccess.length === 0) && (
                  <p className="text-xs text-muted-foreground py-8 text-center">No legacy access detected in the monitoring period.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Document Health — project-scoped conversion archive status */}
      {projectId && (
        <DocHealthCard
          projectId={projectId}
          data={docHealth}
          isLoading={loadingDocHealth}
          onRefetch={refetchDocHealth}
        />
      )}
      {/* Pipeline Run History — last 5 runs with phase-level retry */}
      {projectId && (
        <PipelineRunHistoryCard
          projectId={projectId}
          runs={pipelineRuns?.runs ?? []}
          isLoading={loadingPipelineRuns}
          canRetry={['Superuser', 'General Manager', 'Senior Manager'].includes(currentUser?.role ?? '')}
          onRetrySuccess={() => {
            refetchPipelineRuns();
            queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'automation-status'] });
          }}
        />
      )}
    </div>
    </Layout>
  );
}

// ── DocHealthCard ─────────────────────────────────────────────────────────────
function DocHealthCard({
  projectId,
  data,
  isLoading,
  onRefetch,
}: {
  projectId: number;
  data: { docs: any[] } | undefined;
  isLoading: boolean;
  onRefetch: () => void;
}) {
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const { toast } = useToast();

  const docs: any[] = data?.docs ?? [];
  const pending   = docs.filter(d => d.present && (d.mirrorStatus === 'pending' || d.mirrorStatus === 'processing')).length;
  const failed    = docs.filter(d => d.present && d.mirrorStatus === 'failed').length;
  const mirrored  = docs.filter(d => d.present && d.mirrorStatus === 'completed').length;

  const handleRetry = async (jobId: number) => {
    setRetryingId(jobId);
    try {
      const res = await apiRequest('POST', `/api/mirror-health/jobs/${jobId}/retry`);
      if (res.ok) {
        toast({ title: 'Mirror retry queued', description: 'The mirror job has been re-queued.' });
        onRefetch();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Retry failed', description: (err as any).error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Retry failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setRetryingId(null);
    }
  };

  const mirrorChip = (status: string | null, retryCount: number) => {
    if (!status)                  return <span className="text-[10px] text-muted-foreground italic">No job</span>;
    if (status === 'completed')   return <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">Mirrored</Badge>;
    if (status === 'failed')      return <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-50">Failed{retryCount > 0 ? ` ×${retryCount}` : ''}</Badge>;
    if (status === 'processing')  return <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50"><Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />Mirroring</Badge>;
    return                               <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50"><Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />Pending</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-blue-600" />
          Document Archive Status
          <div className="flex gap-1.5 ml-auto">
            {pending > 0 && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                {pending} mirroring
              </Badge>
            )}
            {failed > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {failed} failed
              </Badge>
            )}
            {failed === 0 && pending === 0 && docs.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{mirrored}/{docs.filter(d => d.present).length} mirrored
              </Badge>
            )}
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-1" onClick={onRefetch} title="Refresh">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Archive className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm">No conversion documents found for this project.</p>
            <p className="text-xs mt-1">Documents are created when an offer is converted to a project.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc: any) => (
              <div key={doc.docType} className={`rounded-lg border px-4 py-3 ${
                !doc.present
                  ? 'bg-muted/10 border-dashed border-muted-foreground/20'
                  : doc.mirrorStatus === 'failed'
                  ? 'bg-red-50 border-red-200'
                  : doc.mirrorStatus === 'completed'
                  ? 'bg-green-50/50 border-green-200'
                  : doc.mirrorStatus
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-muted/10 border-muted'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${!doc.present ? 'text-muted-foreground' : ''}`}>{doc.docType}</p>
                      {doc.present && (
                        <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> GCS ✓
                        </Badge>
                      )}
                      {doc.present && mirrorChip(doc.mirrorStatus, doc.retryCount)}
                      {!doc.present && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Not provided</Badge>
                      )}
                    </div>
                    {doc.present && doc.gcsPath && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate mt-1">{doc.gcsPath}</p>
                    )}
                    {doc.present && doc.windowsRelPath && (
                      <p className="text-[11px] text-muted-foreground/70 font-mono truncate">
                        <span className="text-muted-foreground not-italic mr-1">⊞</span>{doc.windowsRelPath}
                      </p>
                    )}
                    {doc.present && doc.mirrorStatus === 'completed' && doc.mirroredAt && (
                      <p className="text-[10px] text-green-700 mt-0.5">Mirrored {fmtDateTime(doc.mirroredAt)}</p>
                    )}
                    {doc.present && doc.failedReason && (
                      <p className="text-[11px] text-red-700 mt-1 break-words">{doc.failedReason}</p>
                    )}
                  </div>
                  {doc.present && doc.mirrorStatus === 'failed' && doc.mirrorJobId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-3 shrink-0 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => handleRetry(doc.mirrorJobId)}
                      disabled={retryingId === doc.mirrorJobId}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1.5 ${retryingId === doc.mirrorJobId ? 'animate-spin' : ''}`} />
                      Retry Mirror
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground mt-1">
              GCS is the authoritative archive. Windows mirror is a secondary copy — mirror failure does not affect document availability.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ── PipelineRunHistoryCard ────────────────────────────────────────────────────
const PHASE_NAMES = [
  'DO/PO Approval',
  'WO Approval',
  'Activation & Release',
  'Quality Plans',
  'Verification',
];

function getFailedPhase(run: any): number | null {
  if (!run.failure_step) return null;
  const m1 = run.failure_step.match(/^phase(\d+)_/);
  if (m1) return parseInt(m1[1]);
  const m2 = run.failure_step.match(/^retry_init_phase(\d+)/);
  if (m2) return parseInt(m2[1]);
  return 1;
}

function phaseStatus(run: any, phase: number): 'pass' | 'fail' | 'running' | 'skip' {
  if (run.status === 'completed') return 'pass';
  if (run.status === 'running') {
    if (phase < run.current_phase) return 'pass';
    if (phase === run.current_phase) return 'running';
    return 'skip';
  }
  if (run.status === 'failed' || run.status === 'stale') {
    const fp = getFailedPhase(run);
    if (fp === null) return 'skip';
    if (phase < fp) return 'pass';
    if (phase === fp) return 'fail';
    return 'skip';
  }
  return 'skip';
}

function isPhaseSkippedRetry(run: any, phase: number): boolean {
  if (!run.step_results || !Array.isArray(run.step_results)) return false;
  return run.step_results.some((s: any) => s.phase === phase && s.skipped && s.skipReason === 'retry_resume');
}

function PipelineRunHistoryCard({
  projectId,
  runs,
  isLoading,
  canRetry,
  onRetrySuccess,
}: {
  projectId: number;
  runs: any[];
  isLoading: boolean;
  canRetry: boolean;
  onRetrySuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: async ({ runId }: { runId: string }) => {
      const res = await apiRequest('POST', `/api/projects/${projectId}/pipeline-runs/${runId}/retry`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Retry failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      const outcome = data.success ? 'Completed successfully.' : 'Pipeline failed — check run history.';
      toast({
        title: `Pipeline retry complete — Phase ${data.fromPhase}`,
        description: outcome,
        variant: data.success ? 'default' : 'destructive',
      });
      onRetrySuccess();
    },
    onError: (err: any) => {
      toast({ title: 'Retry failed', description: err.message || 'Unknown error', variant: 'destructive' });
    },
  });

  const mostRecentRun = runs[0] ?? null;
  const isLatestFailed = mostRecentRun?.status === 'failed' || mostRecentRun?.status === 'stale';
  const retryPhase = isLatestFailed ? (getFailedPhase(mostRecentRun) ?? 1) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Pipeline Run History
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pipeline runs for this project yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run: any, idx: number) => {
              const isFirst = idx === 0;
              const failed = run.status === 'failed' || run.status === 'stale';
              const completed = run.status === 'completed';
              const running = run.status === 'running';
              const fp = getFailedPhase(run);
              const phaseName = fp ? (PHASE_NAMES[fp - 1] ?? `Phase ${fp}`) : '';
              const startedAt = run.started_at ? new Date(run.started_at) : null;
              const endedAt = run.completed_at
                ? new Date(run.completed_at)
                : run.failed_at
                ? new Date(run.failed_at)
                : null;
              const durationMs = startedAt && endedAt ? endedAt.getTime() - startedAt.getTime() : null;
              const durationStr = durationMs !== null
                ? durationMs > 60000 ? `${Math.round(durationMs / 60000)}m` : `${Math.round(durationMs / 1000)}s`
                : null;
              const isRetryRun = !!run.parent_run_id;

              return (
                <div
                  key={run.run_id}
                  className={`rounded-lg border p-3 ${
                    failed ? 'border-red-200 bg-red-50/50' :
                    completed ? 'border-green-200 bg-green-50/30' :
                    running ? 'border-blue-200 bg-blue-50/30' :
                    'border-muted bg-muted/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Run #{runs.length - idx}
                          {isRetryRun && (
                            <span className="ml-1 text-[10px] text-blue-600 font-normal">(retry)</span>
                          )}
                        </span>
                        <Badge
                          variant={failed ? 'destructive' : 'outline'}
                          className={`text-[10px] ${completed ? 'bg-green-600 text-white border-green-600' : running ? 'border-blue-400 text-blue-700' : ''}`}
                        >
                          {run.status}
                        </Badge>
                        {startedAt && (
                          <span className="text-[10px] text-muted-foreground">
                            {fmtDateTime(run.started_at)}
                            {durationStr && <span className="ml-1">· {durationStr}</span>}
                          </span>
                        )}
                        {run.trigger_username && (
                          <span className="text-[10px] text-muted-foreground">by {run.trigger_username}</span>
                        )}
                      </div>

                      {/* Phase dots */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {[1, 2, 3, 4, 5].map(ph => {
                          const skippedRetry = isPhaseSkippedRetry(run, ph);
                          const st = skippedRetry ? 'skip_resume' : phaseStatus(run, ph);
                          return (
                            <span key={ph} className="flex items-center gap-0.5">
                              {st === 'pass' && (
                                <span title={`Ph${ph}: ${PHASE_NAMES[ph - 1]} — passed`} className="text-[10px] font-mono text-green-700 flex items-center gap-0.5">
                                  <CheckCircle2 className="h-3 w-3 shrink-0" />Ph{ph}
                                </span>
                              )}
                              {st === 'fail' && (
                                <span title={`Ph${ph}: ${PHASE_NAMES[ph - 1]} — failed`} className="text-[10px] font-mono text-red-700 flex items-center gap-0.5">
                                  <XCircle className="h-3 w-3 shrink-0" />Ph{ph}
                                </span>
                              )}
                              {st === 'running' && (
                                <span title={`Ph${ph}: ${PHASE_NAMES[ph - 1]} — in progress`} className="text-[10px] font-mono text-blue-600 flex items-center gap-0.5">
                                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />Ph{ph}
                                </span>
                              )}
                              {st === 'skip' && (
                                <span title={`Ph${ph}: ${PHASE_NAMES[ph - 1]} — not reached`} className="text-[10px] font-mono text-muted-foreground/40">
                                  Ph{ph}
                                </span>
                              )}
                              {st === 'skip_resume' && (
                                <span title={`Ph${ph}: ${PHASE_NAMES[ph - 1]} — skipped (completed in parent run)`} className="text-[10px] font-mono text-blue-500/70 flex items-center gap-0.5">
                                  ↻Ph{ph}
                                </span>
                              )}
                              {ph < 5 && <span className="text-muted-foreground/20 text-[10px]">·</span>}
                            </span>
                          );
                        })}
                      </div>

                      {/* Failure message */}
                      {failed && run.failure_message && (
                        <p className="text-[10px] text-red-600 mt-1 line-clamp-2">
                          {fp && <span className="font-semibold">Ph{fp} error: </span>}
                          {run.failure_message}
                        </p>
                      )}
                    </div>

                    {/* Retry button — most recent failed run, authorized users only */}
                    {isFirst && isLatestFailed && canRetry && retryPhase !== null && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2.5 shrink-0 border-amber-400 text-amber-700 hover:bg-amber-50"
                            disabled={retryMutation.isPending}
                          >
                            {retryMutation.isPending
                              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              : <RotateCcw className="h-3 w-3 mr-1" />
                            }
                            Retry Ph{retryPhase}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Retry Pipeline from Phase {retryPhase}?</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-2 text-sm">
                                <p>
                                  This will resume the EPC Execution Pipeline from{' '}
                                  <strong>Phase {retryPhase} — {phaseName}</strong>.
                                </p>
                                <p>
                                  Work completed in Phases 1–{retryPhase - 1} will be skipped.
                                  Idempotent skip checks ensure no duplicate DOs, WOs, BOMs, POs, or Inspection Orders are created.
                                </p>
                                <p className="text-muted-foreground">
                                  This may take several minutes. The pipeline runs synchronously — do not close this page while it is in progress.
                                </p>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => retryMutation.mutate({ runId: run.run_id })}
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              Retry from Phase {retryPhase}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground mt-1">
              Retry resumes from the exact failed phase. Phases completed in the parent run are skipped automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

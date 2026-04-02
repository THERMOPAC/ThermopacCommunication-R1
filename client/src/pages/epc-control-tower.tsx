import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2, 
  ChevronRight, Clock, Eye, FileWarning, Layers, 
  ShieldAlert, Users, XCircle, Radar, ExternalLink
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

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["/api/epc-control-tower/summary"],
  });

  const { data: pipeline, isLoading: loadingPipeline } = useQuery({
    queryKey: ["/api/epc-control-tower/pipeline"],
  });

  const { data: bottlenecks, isLoading: loadingBottlenecks } = useQuery({
    queryKey: ["/api/epc-control-tower/bottlenecks"],
  });

  const { data: ownership, isLoading: loadingOwnership } = useQuery({
    queryKey: ["/api/epc-control-tower/ownership-gaps"],
  });

  const { data: docStatus, isLoading: loadingDocs } = useQuery({
    queryKey: ["/api/epc-monitoring/cutover-readiness"],
  });

  const { data: legacyAccess } = useQuery({
    queryKey: ["/api/epc-monitoring/legacy-access"],
  });

  const hc = summary?.healthCounts || { on_track: 0, at_risk: 0, delayed: 0, blocked: 0 };
  const ms = summary?.milestones || { total: 0, completed: 0 };
  const pt = summary?.projectTasks || { total: 0, completed: 0, unassigned: 0 };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6" /> EPC Control Tower
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Program-level EPC monitoring — all projects</p>
        </div>
        <div className="flex gap-2">
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
                        <td className="py-2 font-medium">{p.code} — {p.name}</td>
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
                        <div key={p.id} className="text-xs py-1 border-b last:border-0 font-medium">{p.code} — {p.name}</div>
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
                        <span className="ml-3 text-muted-foreground">First used: {new Date(docStatus.dsp.firstCreated).toLocaleDateString()}</span>
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
    </div>
  );
}

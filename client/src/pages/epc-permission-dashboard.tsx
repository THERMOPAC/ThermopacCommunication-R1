import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, ShieldCheck, ShieldAlert, Eye, EyeOff, Check, X, AlertTriangle, Info, ChevronDown, ChevronRight, FileText, Lock, Users, Database } from "lucide-react";

const ROLE_LABELS: Record<number, string> = { 0: "Superuser", 1: "General Manager", 2: "Senior Manager", 3: "Manager", 4: "Employee" };
const ROLE_SHORT: Record<number, string> = { 0: "SU", 1: "GM", 2: "SM", 3: "Mgr", 4: "Emp" };
const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  low: "bg-blue-100 text-blue-600 border-blue-300",
};
const CATEGORY_LABELS: Record<string, string> = {
  data_visibility: "Data Visibility",
  frontend_only: "Frontend-Only",
  missing_backend: "Missing Backend",
  pattern_mismatch: "Pattern Mismatch",
  self_action: "Self-Action",
  visibility_scope: "Visibility Scope",
};

export default function EpcPermissionDashboard() {
  const { user } = useAuth();
  const [simulateRole, setSimulateRole] = useState<string>("none");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [gapSeverityFilter, setGapSeverityFilter] = useState<string>("all");
  const [gapCategoryFilter, setGapCategoryFilter] = useState<string>("all");

  const roleParam = simulateRole !== "none" ? `?role=${encodeURIComponent(simulateRole)}` : "";

  const { data: matrix, isLoading: matrixLoading } = useQuery<any>({
    queryKey: ["/api/epc-permissions/matrix", simulateRole],
    queryFn: async () => {
      const res = await fetch(`/api/epc-permissions/matrix${roleParam}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/epc-permissions/summary"],
  });

  const moduleGroups = useMemo(() => {
    if (!matrix?.actions) return {};
    const groups: Record<string, any[]> = {};
    for (const action of matrix.actions) {
      if (!groups[action.pageId]) groups[action.pageId] = [];
      groups[action.pageId].push(action);
    }
    return groups;
  }, [matrix?.actions]);

  const pageMap = useMemo(() => {
    if (!matrix?.pages) return {};
    const m: Record<string, any> = {};
    for (const p of matrix.pages) m[p.id] = p;
    return m;
  }, [matrix?.pages]);

  const filteredGaps = useMemo(() => {
    if (!matrix?.gaps) return [];
    return matrix.gaps.filter((g: any) => {
      if (gapSeverityFilter !== "all" && g.severity !== gapSeverityFilter) return false;
      if (gapCategoryFilter !== "all" && g.category !== gapCategoryFilter) return false;
      return true;
    });
  }, [matrix?.gaps, gapSeverityFilter, gapCategoryFilter]);

  if (!user || (user.role !== "Superuser" && user.role !== "General Manager")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">This dashboard is available to General Manager and Superuser roles only.</p>
        </Card>
      </div>
    );
  }

  const isLoading = matrixLoading || summaryLoading;

  const simulationSummary = useMemo(() => {
    if (!matrix || simulateRole === "none") return null;
    const visiblePages = matrix.pages?.filter((p: any) => p.simulatedVisible).length || 0;
    const allowedActions = matrix.actions?.filter((a: any) => a.simulatedAllowed).length || 0;
    const totalActions = matrix.actions?.length || 0;
    const visibleData = matrix.dataRules?.filter((d: any) => d.simulatedVisible).length || 0;
    const totalData = matrix.dataRules?.length || 0;
    return { visiblePages, allowedActions, totalActions, visibleData, totalData };
  }, [matrix, simulateRole]);

  return (
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">EPC Permission Control Dashboard</h1>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">Phase 1 — Read Only</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Simulate Role:</span>
            <Select value={simulateRole} onValueChange={setSimulateRole}>
              <SelectTrigger className="w-[160px] h-7 text-xs">
                <SelectValue placeholder="No simulation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No simulation</SelectItem>
                <SelectItem value="Superuser">Superuser</SelectItem>
                <SelectItem value="General Manager">General Manager</SelectItem>
                <SelectItem value="Senior Manager">Senior Manager</SelectItem>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Employee">Employee</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {simulationSummary && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-4 text-xs">
              <Eye className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">Simulating: {simulateRole}</span>
              <span className="text-blue-600">Pages: {simulationSummary.visiblePages}/{matrix?.pages?.length || 0}</span>
              <span className="text-blue-600">Actions: {simulationSummary.allowedActions}/{simulationSummary.totalActions}</span>
              <span className="text-blue-600">Data Access: {simulationSummary.visibleData}/{simulationSummary.totalData}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={FileText} label="Pages Covered" value={summary?.totalPages || 0} color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={Lock} label="Actions Mapped" value={summary?.totalActions || 0} color="text-green-600" bg="bg-green-50" />
        <StatCard icon={AlertTriangle} label="Gaps Found" value={summary?.totalGaps || 0} color="text-amber-600" bg="bg-amber-50" sub={summary ? `${summary.gapsBySeverity?.high || 0}H / ${summary.gapsBySeverity?.medium || 0}M / ${summary.gapsBySeverity?.low || 0}L` : ""} />
        <StatCard icon={Database} label="Data Rules" value={summary?.totalDataRules || 0} color="text-purple-600" bg="bg-purple-50" />
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <div className="animate-pulse text-sm text-muted-foreground">Loading permission matrix...</div>
        </Card>
      ) : (
        <Tabs defaultValue="pages" className="w-full">
          <TabsList className="h-8">
            <TabsTrigger value="pages" className="text-xs h-7 px-3">Page Visibility</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs h-7 px-3">Action Matrix <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">{summary?.totalActions || 0}</Badge></TabsTrigger>
            <TabsTrigger value="data" className="text-xs h-7 px-3">Data Rules</TabsTrigger>
            <TabsTrigger value="gaps" className="text-xs h-7 px-3">Gaps & Inconsistencies <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0 bg-amber-100 text-amber-700">{summary?.totalGaps || 0}</Badge></TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="mt-3">
            <PageVisibilityTab pages={matrix?.pages || []} simulateRole={simulateRole} />
          </TabsContent>

          <TabsContent value="actions" className="mt-3">
            <ActionMatrixTab
              moduleGroups={moduleGroups}
              pageMap={pageMap}
              simulateRole={simulateRole}
              expandedModule={expandedModule}
              setExpandedModule={setExpandedModule}
              expandedAction={expandedAction}
              setExpandedAction={setExpandedAction}
            />
          </TabsContent>

          <TabsContent value="data" className="mt-3">
            <DataRulesTab dataRules={matrix?.dataRules || []} simulateRole={simulateRole} />
          </TabsContent>

          <TabsContent value="gaps" className="mt-3">
            <GapsTab
              gaps={filteredGaps}
              allGaps={matrix?.gaps || []}
              severityFilter={gapSeverityFilter}
              setSeverityFilter={setGapSeverityFilter}
              categoryFilter={gapCategoryFilter}
              setCategoryFilter={setGapCategoryFilter}
            />
          </TabsContent>
        </Tabs>
      )}

      <div className="text-[9px] text-muted-foreground text-center mt-2">
        Registry snapshot: {matrix?.registryTimestamp || "—"} | {matrix?.registryNote || ""}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg, sub }: { icon: any; label: string; value: number; color: string; bg: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${bg}`}><Icon className={`h-3.5 w-3.5 ${color}`} /></div>
          <div>
            <div className="text-lg font-bold">{value}</div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
            {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleCell({ allowed, simulated }: { allowed: boolean; simulated: boolean | null }) {
  const highlight = simulated !== null;
  const dimmed = highlight && !simulated;
  return (
    <TableCell className={`text-center py-1 px-1 ${dimmed ? "opacity-30" : ""} ${highlight && simulated ? "bg-blue-50" : ""}`}>
      {allowed ? <Check className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <X className="h-3.5 w-3.5 text-red-400 mx-auto" />}
    </TableCell>
  );
}

function PageVisibilityTab({ pages, simulateRole }: { pages: any[]; simulateRole: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Page Visibility by Role</h3>
          <Badge variant="outline" className="text-[8px] px-1 py-0">All pages gated by "Project Management" module permission</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] w-[200px]">Page</TableHead>
                <TableHead className="text-[10px] w-[140px]">Route</TableHead>
                <TableHead className="text-[10px] w-[100px]">Module Gate</TableHead>
                {[4, 3, 2, 1, 0].map(level => (
                  <TableHead key={level} className="text-[10px] text-center w-[60px]">{ROLE_SHORT[level]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-[10px] font-medium py-1.5">{p.label}</TableCell>
                  <TableCell className="text-[10px] font-mono py-1.5 text-muted-foreground">{p.route}</TableCell>
                  <TableCell className="text-[10px] py-1.5">
                    <Badge variant="outline" className="text-[8px] px-1 py-0">{p.moduleGate}</Badge>
                  </TableCell>
                  {[4, 3, 2, 1, 0].map(level => (
                    <RoleCell key={level} allowed={p.visibilityByRole?.[level]} simulated={simulateRole !== "none" ? p.simulatedVisible : null} />
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          All EPC pages use a single "Project Management" module gate. There is no per-page visibility control — if a user has the module permission, they see all pages.
        </div>
      </CardContent>
    </Card>
  );
}

function ActionMatrixTab({
  moduleGroups, pageMap, simulateRole, expandedModule, setExpandedModule, expandedAction, setExpandedAction
}: {
  moduleGroups: Record<string, any[]>; pageMap: Record<string, any>; simulateRole: string;
  expandedModule: string | null; setExpandedModule: (m: string | null) => void;
  expandedAction: string | null; setExpandedAction: (a: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {Object.entries(moduleGroups).map(([moduleId, actions]) => {
        const page = pageMap[moduleId];
        const isExpanded = expandedModule === moduleId;
        const smActions = actions.filter(a => a.minRoleLevel <= 2 && a.minRoleLevel > 1).length;
        const gmActions = actions.filter(a => a.minRoleLevel <= 1).length;
        const misaligned = actions.filter(a => !a.aligned).length;
        const withSelfAction = actions.filter(a => a.selfActionPrevention).length;

        return (
          <Card key={moduleId}>
            <div
              className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-muted/30"
              onClick={() => setExpandedModule(isExpanded ? null : moduleId)}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="text-xs font-semibold">{page?.label || moduleId}</span>
              <Badge variant="outline" className="text-[8px] px-1 py-0">{actions.length} actions</Badge>
              {smActions > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-purple-50 text-purple-600 border-purple-200">{smActions} SM+</Badge>}
              {gmActions > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-red-50 text-red-600 border-red-200">{gmActions} GM+</Badge>}
              {misaligned > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-red-100 text-red-700 border-red-300">{misaligned} misaligned</Badge>}
              {withSelfAction > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-green-50 text-green-600 border-green-200">{withSelfAction} self-check</Badge>}
            </div>
            {isExpanded && (
              <CardContent className="p-2 pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-[180px]">Action</TableHead>
                      <TableHead className="text-[10px] w-[80px]">Min Role</TableHead>
                      <TableHead className="text-[10px] w-[140px]">Status Required</TableHead>
                      {[4, 3, 2, 1, 0].map(level => (
                        <TableHead key={level} className="text-[10px] text-center w-[50px]">{ROLE_SHORT[level]}</TableHead>
                      ))}
                      <TableHead className="text-[10px] text-center w-[60px]">Aligned</TableHead>
                      <TableHead className="text-[10px] text-center w-[60px]">Self-Check</TableHead>
                      <TableHead className="text-[10px] w-[30px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actions.map((a: any) => {
                      const isActionExpanded = expandedAction === a.id;
                      return (
                        <TooltipProvider key={a.id}>
                          <TableRow className={`${isActionExpanded ? "bg-muted/20" : ""} hover:bg-muted/30`}>
                            <TableCell className="text-[10px] font-medium py-1.5">{a.label}</TableCell>
                            <TableCell className="py-1.5">
                              <Badge variant="outline" className={`text-[8px] px-1 py-0 ${a.minRoleLevel <= 1 ? "bg-red-50 text-red-600 border-red-200" : a.minRoleLevel <= 2 ? "bg-purple-50 text-purple-600 border-purple-200" : "bg-gray-50 text-gray-600"}`}>
                                {ROLE_LABELS[a.minRoleLevel]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[9px] py-1.5 font-mono text-muted-foreground">
                              {a.statusRequired.join(", ")}
                            </TableCell>
                            {[4, 3, 2, 1, 0].map(level => (
                              <RoleCell key={level} allowed={a.allowedByRole?.[level]} simulated={simulateRole !== "none" ? a.simulatedAllowed : null} />
                            ))}
                            <TableCell className="text-center py-1.5">
                              {a.aligned ? (
                                <Tooltip><TooltipTrigger><ShieldCheck className="h-3.5 w-3.5 text-green-600 mx-auto" /></TooltipTrigger>
                                <TooltipContent className="text-[10px]">Frontend and backend checks are aligned</TooltipContent></Tooltip>
                              ) : (
                                <Tooltip><TooltipTrigger><ShieldAlert className="h-3.5 w-3.5 text-red-500 mx-auto" /></TooltipTrigger>
                                <TooltipContent className="text-[10px]">Misalignment detected between frontend and backend</TooltipContent></Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-center py-1.5">
                              {a.selfActionPrevention ? (
                                <Tooltip><TooltipTrigger><Check className="h-3.5 w-3.5 text-green-600 mx-auto" /></TooltipTrigger>
                                <TooltipContent className="text-[10px] max-w-[200px]">{a.selfActionDetail || "Self-action prevention enabled"}</TooltipContent></Tooltip>
                              ) : (
                                <span className="text-[9px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExpandedAction(isActionExpanded ? null : a.id)}>
                                <Info className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isActionExpanded && (
                            <TableRow className="bg-muted/10">
                              <TableCell colSpan={11} className="py-2 px-4">
                                <div className="grid grid-cols-2 gap-3 text-[10px]">
                                  <div>
                                    <span className="font-semibold text-muted-foreground">Frontend Check:</span>
                                    <div className="font-mono mt-0.5">{a.frontendCheck}</div>
                                    <div className="text-muted-foreground mt-0.5">Source: {a.frontendSource}</div>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-muted-foreground">Backend Check:</span>
                                    <div className="font-mono mt-0.5">{a.backendCheck}</div>
                                    <div className="text-muted-foreground mt-0.5">Route: {a.backendRoute}</div>
                                    <div className="text-muted-foreground">Source: {a.backendSource}</div>
                                  </div>
                                  {a.extraConditions && (
                                    <div className="col-span-2">
                                      <span className="font-semibold text-muted-foreground">Extra Conditions:</span>
                                      <div className="mt-0.5">{a.extraConditions}</div>
                                    </div>
                                  )}
                                  {a.selfActionPrevention && a.selfActionDetail && (
                                    <div className="col-span-2">
                                      <span className="font-semibold text-muted-foreground">Self-Action Detail:</span>
                                      <div className="mt-0.5">{a.selfActionDetail}</div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TooltipProvider>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function DataRulesTab({ dataRules, simulateRole }: { dataRules: any[]; simulateRole: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <EyeOff className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Sensitive Data Visibility Rules</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] w-[200px]">Data Type</TableHead>
              <TableHead className="text-[10px] w-[200px]">Location</TableHead>
              <TableHead className="text-[10px] w-[80px]">Min View Role</TableHead>
              {[4, 3, 2, 1, 0].map(level => (
                <TableHead key={level} className="text-[10px] text-center w-[50px]">{ROLE_SHORT[level]}</TableHead>
              ))}
              <TableHead className="text-[10px] text-center w-[50px]">FE</TableHead>
              <TableHead className="text-[10px] text-center w-[50px]">BE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataRules.map((d: any) => (
              <TooltipProvider key={d.id}>
                <TableRow>
                  <TableCell className="text-[10px] font-medium py-1.5">{d.label}</TableCell>
                  <TableCell className="text-[10px] py-1.5 text-muted-foreground">{d.location}</TableCell>
                  <TableCell className="py-1.5">
                    <Badge variant="outline" className={`text-[8px] px-1 py-0 ${d.minViewRole <= 1 ? "bg-red-50 text-red-600" : d.minViewRole <= 2 ? "bg-purple-50 text-purple-600" : d.minViewRole <= 3 ? "bg-gray-50 text-gray-600" : "bg-green-50 text-green-600"}`}>
                      {ROLE_LABELS[d.minViewRole] || `Level ${d.minViewRole}`}
                    </Badge>
                  </TableCell>
                  {[4, 3, 2, 1, 0].map(level => (
                    <RoleCell key={level} allowed={d.visibleByRole?.[level]} simulated={simulateRole !== "none" ? d.simulatedVisible : null} />
                  ))}
                  <TableCell className="text-center py-1.5">
                    <Tooltip>
                      <TooltipTrigger>
                        {d.frontendEnforced ? <ShieldCheck className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-500 mx-auto" />}
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] max-w-[250px]">{d.frontendSource}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center py-1.5">
                    <Tooltip>
                      <TooltipTrigger>
                        {d.backendEnforced ? <ShieldCheck className="h-3.5 w-3.5 text-green-600 mx-auto" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-500 mx-auto" />}
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] max-w-[250px]">{d.backendSource}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell colSpan={10} className="py-1 px-4">
                    <span className="text-[9px] text-muted-foreground italic">{d.note}</span>
                  </TableCell>
                </TableRow>
              </TooltipProvider>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function GapsTab({
  gaps, allGaps, severityFilter, setSeverityFilter, categoryFilter, setCategoryFilter
}: {
  gaps: any[]; allGaps: any[]; severityFilter: string; setSeverityFilter: (v: string) => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
}) {
  const categories = [...new Set(allGaps.map((g: any) => g.category))];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Gaps & Inconsistencies</h3>
            <div className="flex-1" />
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px] h-7 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {gaps.length === 0 ? (
        <Card className="p-6 text-center">
          <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No gaps match the current filters.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {gaps.map((g: any) => (
            <Card key={g.id} className={`border-l-4 ${g.severity === "high" ? "border-l-red-500" : g.severity === "medium" ? "border-l-amber-500" : "border-l-blue-400"}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <Badge variant="outline" className={`text-[8px] px-1 py-0 shrink-0 ${SEVERITY_COLORS[g.severity]}`}>
                    {g.severity.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">
                    {CATEGORY_LABELS[g.category] || g.category}
                  </Badge>
                </div>
                <h4 className="text-xs font-semibold mb-1">{g.title}</h4>
                <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">{g.description}</p>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                  <span>Modules: {g.affectedModules.join(", ")}</span>
                  {g.affectedRoles.length > 0 && (
                    <span>Roles: {g.affectedRoles.map((r: number) => ROLE_LABELS[r]).join(", ")}</span>
                  )}
                </div>
                <div className="mt-2 p-1.5 bg-green-50 border border-green-200 rounded text-[9px] text-green-700">
                  <strong>Recommendation:</strong> {g.recommendation}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

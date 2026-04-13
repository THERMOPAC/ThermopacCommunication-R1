import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Shield, ShieldCheck, ShieldAlert, Eye, EyeOff, Check, X, AlertTriangle, Info, ChevronDown, ChevronRight, FileText, Lock, Users, Database, Settings, UserCog, Trash2, Clock, CheckCircle2, XCircle, RotateCcw, Download, History, GitBranch, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABELS: Record<number, string> = { 0: "Superuser", 1: "General Manager", 2: "Senior Manager", 3: "Manager", 4: "Senior Executive", 5: "Employee" };
const ROLE_SHORT: Record<number, string> = { 0: "SU", 1: "GM", 2: "SM", 3: "Mgr", 4: "SE", 5: "Emp" };
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

interface StatCardProps {
  icon: any;
  label: string;
  value: number;
  color: string;
  bg: string;
  sub?: string;
}

export default function EpcPermissionDashboard() {
  const { user } = useAuth();
  const [simulateRole, setSimulateRole] = useState<string>("none");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const { data: availableRoles = [] } = useQuery<string[]>({
    queryKey: ["/api/users/roles"],
  });
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [gapSeverityFilter, setGapSeverityFilter] = useState<string>("all");
  const [gapCategoryFilter, setGapCategoryFilter] = useState<string>("all");
  const [gapStatusFilter, setGapStatusFilter] = useState<string>("all");

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
      if (gapStatusFilter !== "all" && g.status !== gapStatusFilter) return false;
      return true;
    });
  }, [matrix?.gaps, gapSeverityFilter, gapCategoryFilter, gapStatusFilter]);

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
    <Layout>
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">EPC Permission Control Dashboard</h1>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">Phase 2 — Editable + Approval Workflow</Badge>
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
                {availableRoles.map(role => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
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
        <StatCard icon={AlertTriangle} label="Open Gaps" value={summary?.openGaps ?? summary?.totalGaps ?? 0} color={summary?.openGaps > 0 ? "text-amber-600" : "text-green-600"} bg={summary?.openGaps > 0 ? "bg-amber-50" : "bg-green-50"} sub={summary ? `${summary.resolvedGaps || 0} resolved / ${summary.gapsBySeverity?.high || 0}H ${summary.gapsBySeverity?.medium || 0}M ${summary.gapsBySeverity?.low || 0}L open` : ""} />
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
            <TabsTrigger value="gaps" className="text-xs h-7 px-3">Gaps & Inconsistencies <Badge variant="secondary" className={`ml-1 text-[9px] px-1 py-0 ${(summary?.openGaps || 0) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{summary?.openGaps ?? summary?.totalGaps ?? 0} open</Badge></TabsTrigger>
            <TabsTrigger value="page-permissions" className="text-xs h-7 px-3"><Settings className="h-3 w-3 mr-1" />Page Access Control</TabsTrigger>
            <TabsTrigger value="change-requests" className="text-xs h-7 px-3"><GitBranch className="h-3 w-3 mr-1" />Change Requests {(summary?.pendingChangeRequests || 0) > 0 && <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0 bg-amber-100 text-amber-700">{summary.pendingChangeRequests}</Badge>}</TabsTrigger>
            <TabsTrigger value="audit-history" className="text-xs h-7 px-3"><History className="h-3 w-3 mr-1" />Audit History</TabsTrigger>
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
              statusFilter={gapStatusFilter}
              setStatusFilter={setGapStatusFilter}
            />
          </TabsContent>

          <TabsContent value="page-permissions" className="mt-3">
            <PageAccessControlTab />
          </TabsContent>

          <TabsContent value="change-requests" className="mt-3">
            <ChangeRequestsTab currentUserId={(user as any)?.id} />
          </TabsContent>

          <TabsContent value="audit-history" className="mt-3">
            <AuditHistoryTab />
          </TabsContent>
        </Tabs>
      )}

      <div className="text-[9px] text-muted-foreground text-center mt-2">
        Registry snapshot: {matrix?.registryTimestamp || "—"} | {matrix?.registryNote || ""}
      </div>
    </div>
    </Layout>
  );
}

function StatCard(props: StatCardProps) {
  const { icon: Icon, label, value, color, bg, sub } = props;
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
                {[5, 4, 3, 2, 1, 0].map(level => (
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
                  {[5, 4, 3, 2, 1, 0].map(level => (
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
                      {[5, 4, 3, 2, 1, 0].map(level => (
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
                            {[5, 4, 3, 2, 1, 0].map(level => (
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
              {[5, 4, 3, 2, 1, 0].map(level => (
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
                  {[5, 4, 3, 2, 1, 0].map(level => (
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
  gaps, allGaps, severityFilter, setSeverityFilter, categoryFilter, setCategoryFilter,
  statusFilter, setStatusFilter
}: {
  gaps: any[]; allGaps: any[]; severityFilter: string; setSeverityFilter: (v: string) => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
}) {
  const [expandedGap, setExpandedGap] = useState<string | null>(null);
  const categories = [...new Set(allGaps.map((g: any) => g.category))];
  const openCount = allGaps.filter((g: any) => g.status === "open").length;
  const resolvedCount = allGaps.filter((g: any) => g.status === "resolved").length;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Gaps & Inconsistencies</h3>
            <div className="flex items-center gap-2 text-[10px]">
              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[9px]">{openCount} open</Badge>
              <Badge className="bg-green-100 text-green-700 border-green-300 text-[9px]">{resolvedCount} resolved</Badge>
              <Badge variant="outline" className="text-[9px]">{allGaps.length} total</Badge>
            </div>
            <div className="flex-1" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[110px] h-7 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
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
        <div className="space-y-2">
          {gaps.map((g: any) => {
            const isExpanded = expandedGap === g.id;
            const isResolved = g.status === "resolved";
            return (
              <Card key={g.id} className={`border-l-4 ${isResolved ? "border-l-green-500 opacity-90" : g.severity === "high" ? "border-l-red-500" : g.severity === "medium" ? "border-l-amber-500" : "border-l-blue-400"}`}>
                <CardContent className="p-0">
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedGap(isExpanded ? null : g.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 shrink-0 ${isResolved ? "bg-green-100 text-green-700 border-green-300" : SEVERITY_COLORS[g.severity]}`}>
                      {g.severity.toUpperCase()}
                    </Badge>
                    {isResolved ? (
                      <Badge className="text-[8px] px-1.5 py-0 shrink-0 bg-green-100 text-green-700 border-green-300">RESOLVED</Badge>
                    ) : (
                      <Badge className="text-[8px] px-1.5 py-0 shrink-0 bg-amber-100 text-amber-700 border-amber-300">OPEN</Badge>
                    )}
                    <Badge variant="outline" className="text-[8px] px-1.5 py-0 shrink-0">
                      {CATEGORY_LABELS[g.category] || g.category}
                    </Badge>
                    <span className="text-xs font-medium truncate">{g.title}</span>
                    <div className="flex-1" />
                    <span className="text-[9px] text-muted-foreground shrink-0">{g.affectedModules.join(", ")}</span>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div>
                          <h5 className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Issue Details</h5>
                          <p className="text-[11px] text-foreground leading-relaxed">{g.description}</p>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <h5 className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Affected</h5>
                            <div className="flex flex-wrap gap-1.5">
                              {g.affectedModules.map((m: string) => (
                                <Badge key={m} variant="outline" className="text-[9px] px-1.5 py-0">{PAGE_LABELS[m] || m}</Badge>
                              ))}
                              {g.affectedRoles.length > 0 && g.affectedRoles.map((r: number) => (
                                <Badge key={r} variant="outline" className="text-[9px] px-1.5 py-0 bg-slate-50">{ROLE_LABELS[r]}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-800">
                        <strong>Recommended Fix:</strong> {g.recommendation}
                      </div>

                      {isResolved && g.fixApplied && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded text-[10px] text-green-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <strong>Fix Applied</strong>
                          </div>
                          {g.fixApplied}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DEPARTMENTS = ["Accounts", "Administration", "After Sales", "Design", "Marketing", "Production", "Projects", "Purchase", "Quality Control", "Stores"];
const PAGE_LABELS: Record<string, string> = {
  "project-dashboard": "Project Dashboard",
  "projects": "Projects",
  "item-master": "Item Master",
  "execution-control": "Execution Control",
  "drawing-controls": "Drawing Controls",
  "bom-controls": "BOM Controls",
  "purchase-orders": "Purchase Orders",
  "work-orders": "Work Orders",
  "planning-control": "Planning Control",
  "procurement-production": "Procurement & Production",
  "quality-inspection": "Quality & Inspection",
  "dispatch-logistics": "Dispatch & Logistics",
  "commissioning-handover": "Commissioning & Handover",
  "invoices": "Invoices",
  "epc-risks": "EPC Risks",
  "permission-control": "Permission Control",
};

function PageAccessControlTab() {
  const { user } = useAuth();
  const isSuperuser = (user as any)?.role === 'Superuser';
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Array<{ requestType: string; targetEntity: string; targetId: string; pageKey: string; currentValue: any; requestedValue: any }>>([]);
  const [overrideUserId, setOverrideUserId] = useState<string>("");
  const [overridePageKey, setOverridePageKey] = useState<string>("");
  const [overrideGranted, setOverrideGranted] = useState<boolean>(true);
  const [overrideReason, setOverrideReason] = useState<string>("");

  const { data: deptMatrix, isLoading: matrixLoading } = useQuery<any[]>({
    queryKey: ["/api/page-permissions/department-matrix"],
    queryFn: async () => {
      const res = await fetch("/api/page-permissions/department-matrix");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: userOverrides, isLoading: overridesLoading } = useQuery<any[]>({
    queryKey: ["/api/page-permissions/user-overrides"],
    queryFn: async () => {
      const res = await fetch("/api/page-permissions/user-overrides");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: serverPendingRequests } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/epc-permissions/change-requests", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/epc-permissions/change-requests?status=pending");
      if (!res.ok) return { requests: [] };
      return res.json();
    },
  });

  const submitChangeRequests = useMutation({
    mutationFn: async (changes: any[]) => {
      const body: any = { changes };
      if (isSuperuser) {
        body.emergencyOverride = true;
        body.emergencyReason = "Superuser direct override";
      }
      const res = await apiRequest("POST", "/api/epc-permissions/change-requests", body);
      const data = await res.json();
      if (isSuperuser && data.changeIds?.length) {
        await apiRequest("POST", `/api/epc-permissions/change-requests/${data.changeIds[0]}/apply`, {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-page-permissions"] });
      setPendingChanges([]);
      setEditMode(false);
      toast({
        title: isSuperuser ? "Permissions updated" : "Change request submitted",
        description: isSuperuser
          ? "Changes applied immediately (Superuser override)."
          : "Changes require approval by another authorized user before they take effect.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to submit", variant: "destructive" });
    },
  });

  const addOverride = useMutation({
    mutationFn: async ({ userId, pageKey, granted, auditReason }: { userId: number; pageKey: string; granted: boolean; auditReason: string }) => {
      await apiRequest("PUT", "/api/page-permissions/user-override", { userId, pageKey, canView: granted, auditReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/page-permissions/user-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-page-permissions"] });
      setOverrideUserId("");
      setOverridePageKey("");
      setOverrideReason("");
      toast({ title: "Override saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save", variant: "destructive" });
    },
  });

  const [deleteReasonDialog, setDeleteReasonDialog] = useState<{ userId: number; pageKey: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const deleteOverride = useMutation({
    mutationFn: async ({ userId, pageKey, auditReason }: { userId: number; pageKey: string; auditReason: string }) => {
      await apiRequest("DELETE", "/api/page-permissions/user-override", { userId, pageKey, auditReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/page-permissions/user-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-page-permissions"] });
      setDeleteReasonDialog(null);
      setDeleteReason("");
      toast({ title: "Override removed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to remove", variant: "destructive" });
    },
  });

  const matrixMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    if (deptMatrix) {
      for (const row of deptMatrix) {
        m[`${row.department}::${row.pageKey}`] = row.canView ?? row.granted ?? false;
      }
    }
    return m;
  }, [deptMatrix]);

  const pendingMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const c of pendingChanges) {
      if (c.targetEntity === 'department' && c.pageKey) {
        m[`${c.targetId}::${c.pageKey}`] = c.requestedValue.granted;
      }
    }
    return m;
  }, [pendingChanges]);

  const serverPendingMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    if (serverPendingRequests?.requests) {
      for (const r of serverPendingRequests.requests) {
        if (r.status === 'pending' && r.targetEntity === 'department' && r.pageKey) {
          m[`${r.targetId}::${r.pageKey}`] = true;
        }
      }
    }
    return m;
  }, [serverPendingRequests]);

  const allPageKeys = Object.keys(PAGE_LABELS);

  const handleEditModeToggle = (newValue: boolean) => {
    if (!newValue && pendingChanges.length > 0) {
      setShowDiscardDialog(true);
      return;
    }
    setEditMode(newValue);
    if (!newValue) setPendingChanges([]);
  };

  const confirmDiscard = () => {
    setPendingChanges([]);
    setEditMode(false);
    setShowDiscardDialog(false);
  };

  const handleEditToggle = (dept: string, pk: string, currentGranted: boolean) => {
    if (!editMode) {
      toast({ title: "Edit Mode required", description: "Enable Edit Mode to make permission changes through the approval workflow.", variant: "destructive" });
      return;
    }
    const existing = pendingChanges.findIndex(c => c.targetEntity === 'department' && c.targetId === dept && c.pageKey === pk);
    if (existing >= 0) {
      setPendingChanges(prev => prev.filter((_, i) => i !== existing));
    } else {
      setPendingChanges(prev => [...prev, {
        requestType: 'page_access',
        targetEntity: 'department',
        targetId: dept,
        pageKey: pk,
        currentValue: { granted: currentGranted },
        requestedValue: { granted: !currentGranted },
      }]);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Department × Page Matrix</h3>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">SM+ bypass — always see all pages</Badge>
            </div>
            <div className="flex items-center gap-2">
              {isSuperuser && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Edit Mode</span>
                  <Switch checked={editMode} onCheckedChange={handleEditModeToggle} className="scale-75" />
                </div>
              )}
            </div>
          </div>

          {editMode && (
            <div className="p-2 mb-3 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Edit Mode: {isSuperuser ? "Changes apply immediately (Superuser override)." : "Changes are queued and require approval."} {pendingChanges.length} change{pendingChanges.length !== 1 ? "s" : ""} queued.</span>
              </div>
              <div className="flex items-center gap-1.5">
                {pendingChanges.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setPendingChanges([])}>Clear</Button>
                    <Button size="sm" className="h-6 text-[10px] px-2" disabled={submitChangeRequests.isPending} onClick={() => submitChangeRequests.mutate(pendingChanges)}>
                      {submitChangeRequests.isPending ? "Applying..." : isSuperuser ? "Apply Now" : "Submit for Approval"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mb-3">
            {editMode
              ? "Click toggles to queue changes. Submit them as a batch for approval by another authorized user."
              : "Toggle which EPC pages each department can access. Manager and Employee roles are filtered by their department. Senior Manager and above always have full access."}
          </p>
          {matrixLoading ? (
            <div className="text-xs text-muted-foreground p-4 text-center">Loading department matrix...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-semibold w-[140px] sticky left-0 bg-background z-10">Page</TableHead>
                    {DEPARTMENTS.map(dept => (
                      <TableHead key={dept} className="text-[10px] font-semibold text-center px-2 min-w-[70px]">
                        {dept.replace("After Sales", "A.Sales").replace("Quality Control", "QC").replace("Administration", "Admin")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPageKeys.map(pk => (
                    <TableRow key={pk}>
                      <TableCell className="text-[10px] font-medium sticky left-0 bg-background z-10">{PAGE_LABELS[pk]}</TableCell>
                      {DEPARTMENTS.map(dept => {
                        const key = `${dept}::${pk}`;
                        const currentGranted = matrixMap[key] ?? false;
                        const hasPending = pendingMap[key] !== undefined;
                        const hasServerPending = serverPendingMap[key] === true;
                        const displayValue = hasPending ? pendingMap[key] : currentGranted;
                        return (
                          <TableCell key={dept} className={`text-center px-2 relative ${hasPending ? "bg-amber-50" : hasServerPending ? "bg-orange-50" : ""}`}>
                            <div className="flex items-center justify-center gap-0.5">
                              <Switch
                                checked={displayValue}
                                onCheckedChange={() => handleEditToggle(dept, pk, currentGranted)}
                                className="scale-75"
                                disabled={!editMode && !isSuperuser}
                              />
                              {hasServerPending && !hasPending && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Clock className="h-3 w-3 text-orange-500 absolute top-1 right-1" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-[10px]">
                                      <p>Pending change request awaiting approval</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCog className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Per-User Overrides</h3>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">Overrides department defaults</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mb-3">
            Grant or deny specific page access for individual users. These take priority over department-level settings.
          </p>

          <div className="flex items-end gap-3 mb-4 p-3 bg-muted/30 rounded-lg border">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium">User</label>
              <Select value={overrideUserId} onValueChange={setOverrideUserId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select user..." />
                </SelectTrigger>
                <SelectContent>
                  {(allUsers || [])
                    .filter((u: any) => u.isActive)
                    .sort((a: any, b: any) => (a.firstName || a.username).localeCompare(b.firstName || b.username))
                    .map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                        {u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.username} — {u.department || "N/A"} ({u.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium">Page</label>
              <Select value={overridePageKey} onValueChange={setOverridePageKey}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select page..." />
                </SelectTrigger>
                <SelectContent>
                  {allPageKeys.map(pk => (
                    <SelectItem key={pk} value={pk} className="text-xs">{PAGE_LABELS[pk]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium">Access</label>
              <Select value={overrideGranted ? "grant" : "deny"} onValueChange={(v) => setOverrideGranted(v === "grant")}>
                <SelectTrigger className="h-8 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grant" className="text-xs">Grant</SelectItem>
                  <SelectItem value="deny" className="text-xs">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium">Reason (required)</label>
              <Input
                className="h-8 text-xs"
                placeholder="Audit reason..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!overrideUserId || !overridePageKey || !overrideReason.trim() || addOverride.isPending}
              onClick={() => addOverride.mutate({ userId: Number(overrideUserId), pageKey: overridePageKey, granted: overrideGranted, auditReason: overrideReason.trim() })}
            >
              {addOverride.isPending ? "Saving..." : "Save Override"}
            </Button>
          </div>

          {overridesLoading ? (
            <div className="text-xs text-muted-foreground p-4 text-center">Loading overrides...</div>
          ) : !userOverrides?.length ? (
            <div className="text-xs text-muted-foreground p-4 text-center border rounded">No user overrides configured.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">User</TableHead>
                  <TableHead className="text-[10px]">Department</TableHead>
                  <TableHead className="text-[10px]">Role</TableHead>
                  <TableHead className="text-[10px]">Page</TableHead>
                  <TableHead className="text-[10px]">Access</TableHead>
                  <TableHead className="text-[10px] w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userOverrides.map((ov: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="text-[10px]">{ov.userName || ov.username || `User #${ov.userId}`}</TableCell>
                    <TableCell className="text-[10px]">{ov.department || "—"}</TableCell>
                    <TableCell className="text-[10px]">{ov.role || "—"}</TableCell>
                    <TableCell className="text-[10px]">{PAGE_LABELS[ov.pageKey] || ov.pageKey}</TableCell>
                    <TableCell>
                      <Badge variant={ov.canView ? "default" : "destructive"} className="text-[9px] px-1.5 py-0">
                        {ov.canView ? "Granted" : "Denied"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setDeleteReasonDialog({ userId: ov.userId, pageKey: ov.pageKey })}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleteReasonDialog} onOpenChange={(v) => { if (!v) { setDeleteReasonDialog(null); setDeleteReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason for removing override</DialogTitle>
            <DialogDescription>
              An audit reason is required for direct permission changes.
            </DialogDescription>
          </DialogHeader>
          <Input
            className="text-xs"
            placeholder="Enter audit reason..."
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteReasonDialog(null); setDeleteReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!deleteReason.trim() || deleteOverride.isPending}
              onClick={() => {
                if (deleteReasonDialog) {
                  deleteOverride.mutate({ userId: deleteReasonDialog.userId, pageKey: deleteReasonDialog.pageKey, auditReason: deleteReason.trim() });
                }
              }}
            >
              {deleteOverride.isPending ? "Removing..." : "Remove Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have {pendingChanges.length} queued permission change{pendingChanges.length !== 1 ? "s" : ""} that {pendingChanges.length !== 1 ? "have" : "has"} not been submitted for approval. Leaving Edit Mode will discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscardDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDiscard}>Discard Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  pending: { icon: Clock, color: "text-amber-700", bg: "bg-amber-100 border-amber-300", label: "Pending" },
  approved: { icon: CheckCircle2, color: "text-blue-700", bg: "bg-blue-100 border-blue-300", label: "Approved" },
  rejected: { icon: XCircle, color: "text-red-700", bg: "bg-red-100 border-red-300", label: "Rejected" },
  applied: { icon: Check, color: "text-green-700", bg: "bg-green-100 border-green-300", label: "Applied" },
};

function ChangeRequestsTab({ currentUserId }: { currentUserId: number }) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/epc-permissions/change-requests", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/epc-permissions/change-requests${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/epc-permissions/change-requests/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/audit-log"] });
      toast({ title: "Change request approved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to approve", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      await apiRequest("POST", `/api/epc-permissions/change-requests/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/audit-log"] });
      setRejectDialogOpen(false);
      setRejectReason("");
      toast({ title: "Change request rejected" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reject", variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/epc-permissions/change-requests/${id}/apply`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/page-permissions/department-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["/api/page-permissions/user-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-page-permissions"] });
      toast({ title: "Changes applied", description: "Permission changes have been applied and a snapshot was created." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to apply", variant: "destructive" });
    },
  });

  const batches = data?.batches || {};
  const batchEntries = Object.entries(batches).sort((a: any, b: any) => {
    const aDate = a[1][0]?.requestedAt || "";
    const bDate = b[1][0]?.requestedAt || "";
    return bDate.localeCompare(aDate);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Permission Change Requests</h3>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-[10px] text-muted-foreground mb-3">
            Permission changes follow a workflow: Create → Approve (by different user) → Apply. Emergency overrides skip approval (Superuser only). A snapshot is captured before each apply for rollback capability.
          </p>

          {isLoading ? (
            <div className="text-xs text-muted-foreground p-6 text-center">Loading change requests...</div>
          ) : batchEntries.length === 0 ? (
            <div className="text-xs text-muted-foreground p-6 text-center border rounded">No change requests found.</div>
          ) : (
            <div className="space-y-2">
              {batchEntries.map(([batchKey, items]: [string, any[]]) => {
                const first = items[0];
                const status = first.status;
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                const StatusIcon = config.icon;
                const isExpanded = expandedBatch === batchKey;
                const isSelfRequest = first.requestedBy === currentUserId;
                const canApprove = status === "pending" && !isSelfRequest;
                const canReject = status === "pending";
                const canApply = status === "approved";
                const isEmergency = first.emergencyOverride;

                return (
                  <Card key={batchKey} className={`border ${status === 'pending' ? 'border-amber-200' : ''}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => setExpandedBatch(isExpanded ? null : batchKey)}>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <Badge className={`text-[9px] px-1.5 py-0 ${config.bg} ${config.color} border`}>
                            <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                            {config.label}
                          </Badge>
                          {isEmergency && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 border border-red-300">
                              <Zap className="h-2.5 w-2.5 mr-0.5" />Emergency
                            </Badge>
                          )}
                          <span className="text-[10px] font-medium">{items.length} change{items.length > 1 ? "s" : ""}</span>
                          <span className="text-[10px] text-muted-foreground">by {first.requestedByName}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(first.requestedAt).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {canApprove && (
                            <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => approveMutation.mutate(first.id)} disabled={approveMutation.isPending}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />Approve
                            </Button>
                          )}
                          {isSelfRequest && status === "pending" && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">Awaiting other approver</Badge>
                          )}
                          {canReject && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600" onClick={() => { setRejectTargetId(first.id); setRejectDialogOpen(true); }}>
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          )}
                          {canApply && (
                            <Button size="sm" className="h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700" onClick={() => applyMutation.mutate(first.id)} disabled={applyMutation.isPending}>
                              <Check className="h-3 w-3 mr-1" />Apply
                            </Button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-1.5">
                          {first.rejectionReason && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-800">
                              <strong>Rejection Reason:</strong> {first.rejectionReason}
                            </div>
                          )}
                          {first.approvedByName && status !== 'pending' && (
                            <div className="text-[10px] text-muted-foreground">
                              {status === 'rejected' ? 'Rejected' : 'Approved'} by: {first.approvedByName} on {first.approvedAt ? new Date(first.approvedAt).toLocaleString() : '—'}
                            </div>
                          )}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[10px]">Type</TableHead>
                                <TableHead className="text-[10px]">Target</TableHead>
                                <TableHead className="text-[10px]">Page</TableHead>
                                <TableHead className="text-[10px]">Current</TableHead>
                                <TableHead className="text-[10px]">Proposed</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((item: any) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-[10px]">
                                    <Badge variant="outline" className="text-[8px] px-1 py-0">{item.requestType}</Badge>
                                  </TableCell>
                                  <TableCell className="text-[10px]">{item.targetEntity}: {item.targetId}</TableCell>
                                  <TableCell className="text-[10px]">{PAGE_LABELS[item.pageKey] || item.pageKey || "—"}</TableCell>
                                  <TableCell className="text-[10px]">
                                    {item.currentValue ? (
                                      <Badge variant={item.currentValue.granted ? "default" : "destructive"} className="text-[8px] px-1 py-0">
                                        {item.currentValue.granted ? "Granted" : "Denied"}
                                      </Badge>
                                    ) : "—"}
                                  </TableCell>
                                  <TableCell className="text-[10px]">
                                    {item.requestedValue ? (
                                      <Badge variant={item.requestedValue.granted ? "default" : "destructive"} className="text-[8px] px-1 py-0">
                                        {item.requestedValue.granted ? "Grant" : "Deny"}
                                      </Badge>
                                    ) : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SnapshotsPanel />

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Change Request</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this permission change request. All items in the batch will be rejected.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => { if (rejectTargetId) rejectMutation.mutate({ id: rejectTargetId, reason: rejectReason }); }}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnapshotsPanel() {
  const { toast } = useToast();
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreTargetId, setRestoreTargetId] = useState<number | null>(null);

  const { data: snapshots, isLoading } = useQuery<any[]>({
    queryKey: ["/api/epc-permissions/snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/epc-permissions/snapshots");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createSnapshot = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/epc-permissions/snapshots", { description: "Manual snapshot" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/audit-log"] });
      toast({ title: "Snapshot captured" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed", variant: "destructive" });
    },
  });

  const restoreSnapshot = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/epc-permissions/snapshots/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-permissions/audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/page-permissions/department-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["/api/page-permissions/user-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-page-permissions"] });
      setRestoreDialogOpen(false);
      toast({ title: "Snapshot restored", description: "Permissions have been rolled back." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to restore", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Permission Snapshots</h3>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">Superuser can restore</Badge>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => createSnapshot.mutate()} disabled={createSnapshot.isPending}>
            {createSnapshot.isPending ? "Capturing..." : "Capture Snapshot"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Snapshots are automatically created before applying changes. You can also capture manual snapshots and restore them to rollback permission changes.
        </p>
        {isLoading ? (
          <div className="text-xs text-muted-foreground p-4 text-center">Loading snapshots...</div>
        ) : !snapshots?.length ? (
          <div className="text-xs text-muted-foreground p-4 text-center border rounded">No snapshots captured yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">ID</TableHead>
                <TableHead className="text-[10px]">Type</TableHead>
                <TableHead className="text-[10px]">Description</TableHead>
                <TableHead className="text-[10px]">Created By</TableHead>
                <TableHead className="text-[10px]">Date</TableHead>
                <TableHead className="text-[10px] w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((snap: any) => (
                <TableRow key={snap.id}>
                  <TableCell className="text-[10px] font-mono">#{snap.id}</TableCell>
                  <TableCell className="text-[10px]"><Badge variant="outline" className="text-[8px] px-1 py-0">{snap.snapshotType}</Badge></TableCell>
                  <TableCell className="text-[10px]">{snap.description || "—"}</TableCell>
                  <TableCell className="text-[10px]">{snap.createdByName}</TableCell>
                  <TableCell className="text-[10px]">{new Date(snap.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => { setRestoreTargetId(snap.id); setRestoreDialogOpen(true); }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Snapshot</DialogTitle>
            <DialogDescription>This will replace all current department page permissions and user overrides with the snapshot data. A backup snapshot will be created first. This action requires Superuser role.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={restoreSnapshot.isPending}
              onClick={() => { if (restoreTargetId) restoreSnapshot.mutate(restoreTargetId); }}
            >
              {restoreSnapshot.isPending ? "Restoring..." : "Restore Snapshot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const AUDIT_ACTION_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  create: { icon: GitBranch, color: "text-blue-600", label: "Created" },
  approve: { icon: CheckCircle2, color: "text-green-600", label: "Approved" },
  reject: { icon: XCircle, color: "text-red-600", label: "Rejected" },
  apply: { icon: Check, color: "text-green-700", label: "Applied" },
  rollback: { icon: RotateCcw, color: "text-amber-600", label: "Rollback" },
  emergency_override: { icon: Zap, color: "text-red-600", label: "Emergency" },
  snapshot: { icon: Database, color: "text-purple-600", label: "Snapshot" },
};

function AuditHistoryTab() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/epc-permissions/audit-log", actionFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      if (actionFilter !== "all") params.set("action", actionFilter);
      const res = await fetch(`/api/epc-permissions/audit-log?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Permission Audit Trail</h3>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">{total} entries</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">Created</SelectItem>
                  <SelectItem value="approve">Approved</SelectItem>
                  <SelectItem value="reject">Rejected</SelectItem>
                  <SelectItem value="apply">Applied</SelectItem>
                  <SelectItem value="rollback">Rollback</SelectItem>
                  <SelectItem value="emergency_override">Emergency</SelectItem>
                  <SelectItem value="snapshot">Snapshot</SelectItem>
                </SelectContent>
              </Select>
              <a href="/api/epc-permissions/audit-log/export" download>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <Download className="h-3 w-3 mr-1" />Export CSV
                </Button>
              </a>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground mb-3">
            Complete audit trail of all permission changes. Every create, approve, reject, apply, rollback, and emergency override is permanently logged.
          </p>

          {isLoading ? (
            <div className="text-xs text-muted-foreground p-6 text-center">Loading audit history...</div>
          ) : entries.length === 0 ? (
            <div className="text-xs text-muted-foreground p-6 text-center border rounded">No audit entries found.</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] w-[40px]">#</TableHead>
                    <TableHead className="text-[10px]">Action</TableHead>
                    <TableHead className="text-[10px]">User</TableHead>
                    <TableHead className="text-[10px]">Role</TableHead>
                    <TableHead className="text-[10px]">Batch</TableHead>
                    <TableHead className="text-[10px]">Details</TableHead>
                    <TableHead className="text-[10px]">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry: any) => {
                    const config = AUDIT_ACTION_CONFIG[entry.action] || AUDIT_ACTION_CONFIG.create;
                    const ActionIcon = config.icon;
                    const details = entry.details || {};
                    const detailSummary = details.changeCount ? `${details.changeCount} changes` :
                      details.appliedCount ? `${details.appliedCount} applied` :
                      details.reason ? `Reason: ${details.reason}` :
                      details.snapshotType ? `${details.snapshotType} snapshot` :
                      details.batchSize ? `${details.batchSize} items` : "";

                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-[10px] font-mono">{entry.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ActionIcon className={`h-3 w-3 ${config.color}`} />
                            <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">{entry.username}</TableCell>
                        <TableCell className="text-[10px]"><Badge variant="outline" className="text-[8px] px-1 py-0">{entry.role}</Badge></TableCell>
                        <TableCell className="text-[10px] font-mono">{entry.batchId ? entry.batchId.slice(0, 16) + "..." : "—"}</TableCell>
                        <TableCell className="text-[10px] max-w-[200px] truncate">{detailSummary || "—"}</TableCell>
                        <TableCell className="text-[10px]">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages} ({total} total)</span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

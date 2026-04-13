import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, CheckCircle, AlertTriangle, XCircle, FlaskConical, Pencil, ShieldCheck } from "lucide-react";

const GATE_LABELS: Record<string, string> = {
  BOM: "BOM — Bill of Materials",
  DWG: "DWG — Drawing",
  PLN: "PLN — Execution Plan",
  PO:  "PO — Purchase Order",
  WO:  "WO — Work Order",
  INS: "INS — Inspection",
  DSP: "DSP — Dispatch",
  COM: "COM — Commissioning",
  INV: "INV — Invoice",
};

const GATE_ORDER = ["BOM", "DWG", "PLN", "PO", "WO", "INS", "DSP", "COM", "INV"];

const WIRED_GATES = new Set(["BOM", "DWG", "PLN", "PO", "WO", "INS", "DSP", "COM", "INV"]);

function ModeBadge({ mode }: { mode: string }) {
  if (mode === "auto")
    return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">Auto</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Manual</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "primary") return <Badge className="bg-green-100 text-green-800 border-green-200">✅ Primary</Badge>;
  if (status === "fallback") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">⚠ Fallback</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200">❌ Unassigned</Badge>;
}

function WiredBadge({ gate }: { gate: string }) {
  return WIRED_GATES.has(gate)
    ? <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Wired</Badge>
    : <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs">Seeded</Badge>;
}

export default function EpcAssignmentControlPage() {
  const { toast } = useToast();
  const [openGates, setOpenGates] = useState<Set<string>>(new Set(["DWG", "WO", "PO"]));
  const [editingRule, setEditingRule] = useState<any>(null);
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [auditFilters, setAuditFilters] = useState({ stageGate: "all", method: "all", limit: "50" });

  const { data: currentUser } = useQuery<any>({ queryKey: ['/api/user'] });
  const canEdit = ['Superuser', 'General Manager'].includes(currentUser?.role);
  const canViewAudit = ['Superuser', 'General Manager', 'Senior Executive'].includes(currentUser?.role);

  const { data: rules = [], isLoading: rulesLoading } = useQuery<any[]>({
    queryKey: ["/api/epc-assignment-rules"],
  });

  const { data: preflight, isLoading: preflightLoading } = useQuery<any>({
    queryKey: ["/api/epc-assignment-rules/preflight"],
  });

  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["/api/epc-assignment-departments"],
  });

  const { data: roles = [] } = useQuery<string[]>({
    queryKey: ["/api/epc-assignment-roles"],
  });

  const { data: auditLog } = useQuery<any>({
    queryKey: ["/api/epc-assignment-audit-log", auditFilters],
    queryFn: async () => {
      const params = new URLSearchParams(auditFilters as any);
      const res = await fetch(`/api/epc-assignment-audit-log?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/epc-assignment-rules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/epc-assignment-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-assignment-rules/preflight"] });
      setEditingRule(null);
      toast({ title: "Rule updated", description: "Assignment rule saved successfully." });
    },
    onError: async (err: any) => {
      const body = await err.response?.json?.().catch(() => ({}));
      toast({ title: "Update failed", description: body?.error || err.message, variant: "destructive" });
    },
  });

  const groupedByGate: Record<string, any[]> = {};
  for (const rule of rules) {
    if (!groupedByGate[rule.stage_gate]) groupedByGate[rule.stage_gate] = [];
    groupedByGate[rule.stage_gate].push(rule);
  }

  const toggleGate = (gate: string) => {
    setOpenGates(prev => {
      const next = new Set(prev);
      next.has(gate) ? next.delete(gate) : next.add(gate);
      return next;
    });
  };

  const handleTest = async (workflowCode: string) => {
    try {
      const res = await fetch(`/api/epc-assignment-rules/test/${workflowCode}`, { credentials: "include" });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [workflowCode]: data }));
    } catch {
      toast({ title: "Test failed", variant: "destructive" });
    }
  };

  const handleSaveRule = () => {
    if (!editingRule) return;
    updateMutation.mutate({
      id: editingRule.id,
      data: {
        department: editingRule.department,
        role: editingRule.role,
        fallbackDepartment: editingRule.fallback_department || null,
        fallbackRole: editingRule.fallback_role || null,
        isActive: editingRule.is_active,
        executionMode: editingRule.execution_mode || 'manual',
        description: editingRule.description,
      },
    });
  };

  const preflightSummary = preflight?.gates
    ? Object.values(preflight.gates).flat() as any[]
    : [];
  const preflightUnassigned = preflightSummary.filter((r: any) => r.status === "unassigned").length;
  const preflightFallback = preflightSummary.filter((r: any) => r.status === "fallback").length;

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">EPC Assignment Control</h1>
              <p className="text-sm text-muted-foreground">DB-driven department + role assignment rules for all pipeline gates</p>
            </div>
          </div>
          {!preflightLoading && (
            <div className="flex items-center gap-2">
              {preflightUnassigned > 0
                ? <Badge className="bg-red-100 text-red-800 border-red-200 text-sm px-3 py-1">❌ {preflightUnassigned} unassigned</Badge>
                : <Badge className="bg-green-100 text-green-800 border-green-200 text-sm px-3 py-1">✅ All rules resolve</Badge>
              }
              {preflightFallback > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-sm px-3 py-1">⚠ {preflightFallback} on fallback</Badge>
              )}
            </div>
          )}
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Assignment Rules</TabsTrigger>
            <TabsTrigger value="preflight">Pre-flight Check</TabsTrigger>
            {canViewAudit && <TabsTrigger value="audit">Audit Log</TabsTrigger>}
          </TabsList>

          <TabsContent value="rules" className="space-y-3 mt-4">
            {rulesLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading rules...</div>
            ) : (
              GATE_ORDER.map(gate => {
                const gateRules = groupedByGate[gate] || [];
                if (gateRules.length === 0) return null;
                const isOpen = openGates.has(gate);

                return (
                  <Collapsible key={gate} open={isOpen} onOpenChange={() => toggleGate(gate)}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <CardTitle className="text-base">{GATE_LABELS[gate] || gate}</CardTitle>
                              <WiredBadge gate={gate} />
                            </div>
                            <span className="text-sm text-muted-foreground">{gateRules.length} rule{gateRules.length !== 1 ? "s" : ""}</span>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-left py-2 font-medium w-24">Action</th>
                                <th className="text-left py-2 font-medium">Department</th>
                                <th className="text-left py-2 font-medium">Role</th>
                                <th className="text-left py-2 font-medium">Fallback Dept</th>
                                <th className="text-left py-2 font-medium">Fallback Role</th>
                                <th className="text-center py-2 font-medium w-20">Mode</th>
                                <th className="text-center py-2 font-medium w-16">Active</th>
                                <th className="text-right py-2 font-medium w-32">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gateRules.map((rule: any) => (
                                <>
                                  <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="py-2">
                                      <Badge variant="outline" className="capitalize">{rule.action_type}</Badge>
                                    </td>
                                    <td className="py-2 font-medium">{rule.department}</td>
                                    <td className="py-2 text-blue-700">{rule.role}</td>
                                    <td className="py-2 text-muted-foreground">{rule.fallback_department || "—"}</td>
                                    <td className="py-2 text-muted-foreground">{rule.fallback_role || "—"}</td>
                                    <td className="py-2 text-center">
                                      <ModeBadge mode={rule.execution_mode || "manual"} />
                                    </td>
                                    <td className="py-2 text-center">
                                      {rule.is_active
                                        ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                        : <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                                      }
                                    </td>
                                    <td className="py-2 text-right">
                                      <div className="flex items-center gap-1 justify-end">
                                        <Button size="sm" variant="ghost" onClick={() => handleTest(rule.workflow_code)} title="Test resolution">
                                          <FlaskConical className="h-3.5 w-3.5" />
                                        </Button>
                                        {canEdit && (
                                          <Button size="sm" variant="ghost" onClick={() => setEditingRule({ ...rule })}>
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                  {testResult[rule.workflow_code] && (
                                    <tr key={`test-${rule.id}`} className="bg-muted/30">
                                      <td colSpan={8} className="px-3 py-2 text-sm">
                                        {testResult[rule.workflow_code].resolution === "primary" && (
                                          <span className="text-green-700">✅ {testResult[rule.workflow_code].message}</span>
                                        )}
                                        {testResult[rule.workflow_code].resolution === "fallback" && (
                                          <span className="text-amber-700">⚠ {testResult[rule.workflow_code].message}</span>
                                        )}
                                        {testResult[rule.workflow_code].resolution === "unassigned" && (
                                          <span className="text-red-700">❌ {testResult[rule.workflow_code].message}</span>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                </>
                              ))}
                            </tbody>
                          </table>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="preflight" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pre-flight Resolution Check</CardTitle>
                <p className="text-sm text-muted-foreground">Shows which user would be assigned for each active rule right now, based on current users in the database.</p>
              </CardHeader>
              <CardContent>
                {preflightLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Running pre-flight check...</div>
                ) : (
                  <div className="space-y-4">
                    {GATE_ORDER.map(gate => {
                      const gateResults = preflight?.gates?.[gate];
                      if (!gateResults) return null;
                      return (
                        <div key={gate}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-sm">{GATE_LABELS[gate] || gate}</span>
                            <WiredBadge gate={gate} />
                          </div>
                          <table className="w-full text-sm border rounded-lg overflow-hidden">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium">Action</th>
                                <th className="text-left px-3 py-2 font-medium">Rule (Dept / Role)</th>
                                <th className="text-left px-3 py-2 font-medium">Status</th>
                                <th className="text-left px-3 py-2 font-medium">Resolved User</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gateResults.map((r: any, i: number) => (
                                <tr key={i} className="border-t">
                                  <td className="px-3 py-2 capitalize">{r.actionType}</td>
                                  <td className="px-3 py-2">
                                    <span className="font-medium">{r.department}</span>
                                    <span className="text-muted-foreground"> / {r.role}</span>
                                    {r.fallbackDepartment && (
                                      <span className="text-xs text-muted-foreground ml-2">→ fallback: {r.fallbackDepartment} / {r.fallbackRole}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                                  <td className="px-3 py-2">
                                    {r.resolvedUser
                                      ? <span className="font-medium">{(r.resolvedUser as any).username} <span className="text-muted-foreground text-xs">({(r.resolvedUser as any).role})</span></span>
                                      : <span className="text-red-600 text-xs">No user found — will be unassigned</span>
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assignment Audit Log</CardTitle>
                <div className="flex gap-3 mt-2">
                  <Select value={auditFilters.stageGate} onValueChange={v => setAuditFilters(f => ({ ...f, stageGate: v }))}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="All gates" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All gates</SelectItem>
                      {GATE_ORDER.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={auditFilters.method} onValueChange={v => setAuditFilters(f => ({ ...f, method: v }))}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="All methods" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All methods</SelectItem>
                      <SelectItem value="primary">Primary</SelectItem>
                      <SelectItem value="fallback">Fallback</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {!auditLog?.logs?.length ? (
                  <div className="text-center py-8 text-muted-foreground">No audit log entries yet. Entries appear when the pipeline assigns tasks.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 font-medium">Date</th>
                        <th className="text-left py-2 font-medium">Project</th>
                        <th className="text-left py-2 font-medium">Gate / Action</th>
                        <th className="text-left py-2 font-medium">Method</th>
                        <th className="text-left py-2 font-medium">Resolved Dept / Role</th>
                        <th className="text-left py-2 font-medium">Resolved User</th>
                        <th className="text-left py-2 font-medium">Triggered By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.logs.map((log: any) => (
                        <tr key={log.id} className={`border-b last:border-0 ${log.resolution_method === "unassigned" ? "bg-red-50" : log.resolution_method === "fallback" ? "bg-amber-50" : ""}`}>
                          <td className="py-2 text-xs text-muted-foreground">{new Date(log.logged_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="py-2 text-xs">{log.project_code || "—"}</td>
                          <td className="py-2">
                            <span className="font-medium">{log.stage_gate}</span>
                            <span className="text-muted-foreground text-xs"> / {log.action_type}</span>
                          </td>
                          <td className="py-2"><StatusBadge status={log.resolution_method} /></td>
                          <td className="py-2 text-xs">{log.resolved_department ? `${log.resolved_department} / ${log.resolved_role}` : "—"}</td>
                          <td className="py-2 text-xs font-medium">{log.resolved_user_name || <span className="text-red-600">Unassigned</span>}</td>
                          <td className="py-2 text-xs text-muted-foreground">{log.triggered_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {editingRule && (
          <Dialog open={true} onOpenChange={() => setEditingRule(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Assignment Rule</DialogTitle>
                <p className="text-sm text-muted-foreground">{editingRule.workflow_code} — {editingRule.description}</p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Primary Department</Label>
                    <Select value={editingRule.department} onValueChange={v => setEditingRule((r: any) => ({ ...r, department: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Primary Role</Label>
                    <Select value={editingRule.role} onValueChange={v => setEditingRule((r: any) => ({ ...r, role: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Fallback Department <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Select value={editingRule.fallback_department || "none"} onValueChange={v => setEditingRule((r: any) => ({ ...r, fallback_department: v === "none" ? null : v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Fallback Role <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Select value={editingRule.fallback_role || "none"} onValueChange={v => setEditingRule((r: any) => ({ ...r, fallback_role: v === "none" ? null : v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Execution Mode</Label>
                  <Select value={editingRule.execution_mode || "manual"} onValueChange={v => setEditingRule((r: any) => ({ ...r, execution_mode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual — triggered by user action</SelectItem>
                      <SelectItem value="auto">Auto — triggered by pipeline engine</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Auto = pipeline creates and assigns task automatically; Manual = user must initiate</p>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={editingRule.description || ""} onChange={e => setEditingRule((r: any) => ({ ...r, description: e.target.value }))} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={editingRule.is_active} onCheckedChange={v => setEditingRule((r: any) => ({ ...r, is_active: v }))} />
                  <Label>Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingRule(null)}>Cancel</Button>
                <Button onClick={handleSaveRule} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Rule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}

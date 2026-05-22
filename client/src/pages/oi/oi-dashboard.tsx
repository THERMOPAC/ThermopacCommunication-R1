import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, CheckCircle, Clock, TrendingUp, ShieldAlert, AlertCircle,
  Zap, Plus, BarChart3, Activity, Eye, DollarSign, Link2, Users, Truck, SearchCode, BookOpen,
} from "lucide-react";
import { CAPA_STATUS_LABELS, CAPA_STATUS_COLORS } from "./oi-capa-constants";

function CapaDashboardPanels() {
  const { data: summary } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/capa-summary"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/capa-summary?periodDays=90"); if (!r.ok) return null; return r.json(); },
  });
  const { data: sla } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/capa-sla"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/capa-sla?periodDays=90"); if (!r.ok) return null; return r.json(); },
  });
  const { data: effectiveness } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/capa-effectiveness"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/capa-effectiveness?periodDays=365"); if (!r.ok) return null; return r.json(); },
  });
  const { data: byType } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/capa-by-type"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/capa-by-type?periodDays=180"); if (!r.ok) return []; return r.json(); },
  });

  if (!summary && !sla && !effectiveness) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mt-2">
        <ShieldAlert className="h-4 w-4 text-indigo-600" />
        <h2 className="text-base font-bold text-gray-800">Corrective & Preventive Actions (CAPA)</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {/* Summary panel */}
        {summary && (
          <Card className="border-l-4 border-l-indigo-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-indigo-600" /> CAPA Overview (90 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                <div><p className="text-xl font-bold text-gray-800">{summary.totalCapa}</p><p className="text-xs text-gray-400">Total</p></div>
                <div><p className="text-xl font-bold text-yellow-700">{summary.openCount + summary.inProgressCount}</p><p className="text-xs text-gray-400">Active</p></div>
                <div><p className="text-xl font-bold text-green-600">{summary.closedCount}</p><p className="text-xs text-gray-400">Closed</p></div>
                <div><p className={`text-xl font-bold ${summary.overdueCount > 0 ? "text-red-700" : "text-gray-400"}`}>{summary.overdueCount}</p><p className="text-xs text-gray-400">Overdue</p></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs">
                {[
                  { label: 'Pending Verify', val: summary.pendingVerificationCount, cls: 'text-orange-600' },
                  { label: 'Eff. Review',    val: summary.effectivenessReviewCount, cls: 'text-purple-600' },
                  { label: 'Cancelled',      val: summary.cancelledCount,          cls: 'text-gray-500'   },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="text-center">
                    <p className={`font-semibold ${cls}`}>{val}</p><p className="text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* SLA panel */}
        {sla && (
          <Card className="border-l-4 border-l-amber-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" /> CAPA SLA (90 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div><p className="text-xl font-bold text-green-600">{sla.closedOnTime ?? 0}</p><p className="text-xs text-gray-400">On Time</p></div>
                <div><p className="text-xl font-bold text-red-600">{sla.closedOverdue ?? 0}</p><p className="text-xs text-gray-400">Overdue Close</p></div>
                <div>
                  <p className={`text-xl font-bold ${sla.slaAdherencePct != null ? (sla.slaAdherencePct >= 80 ? "text-green-600" : sla.slaAdherencePct >= 60 ? "text-yellow-600" : "text-red-600") : "text-gray-400"}`}>
                    {sla.slaAdherencePct != null ? `${sla.slaAdherencePct}%` : "—"}
                  </p>
                  <p className="text-xs text-gray-400">SLA Rate</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center bg-gray-50 rounded p-2">
                  <p className="font-semibold text-teal-700">{sla.avgDaysToClose != null ? `${sla.avgDaysToClose}d` : "—"}</p>
                  <p className="text-gray-400">Avg Close Time</p>
                </div>
                <div className="text-center bg-gray-50 rounded p-2">
                  <p className={`font-semibold ${sla.currentlyOverdue > 0 ? "text-red-700" : "text-gray-500"}`}>{sla.currentlyOverdue ?? 0}</p>
                  <p className="text-gray-400">Currently Overdue</p>
                </div>
              </div>
              {(sla.l1EscalationsFired > 0 || sla.l2EscalationsFired > 0 || sla.l3EscalationsFired > 0) && (
                <div className="flex gap-2 mt-2 text-xs">
                  <span className="bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">L1: {sla.l1EscalationsFired}</span>
                  <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">L2: {sla.l2EscalationsFired}</span>
                  <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">L3: {sla.l3EscalationsFired}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Effectiveness panel */}
        {effectiveness && (
          <Card className="border-l-4 border-l-green-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" /> CAPA Effectiveness (12 months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div><p className="text-xl font-bold text-green-600">{effectiveness.effectiveCount ?? 0}</p><p className="text-xs text-gray-400">Effective</p></div>
                <div><p className="text-xl font-bold text-red-600">{effectiveness.ineffectiveCount ?? 0}</p><p className="text-xs text-gray-400">Ineffective</p></div>
                <div><p className={`text-xl font-bold ${(effectiveness.effectivenessRatePct ?? 0) >= 80 ? "text-green-600" : "text-orange-600"}`}>{effectiveness.effectivenessRatePct != null ? `${effectiveness.effectivenessRatePct}%` : "—"}</p><p className="text-xs text-gray-400">Rate</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center bg-gray-50 rounded p-2">
                  <p className="font-semibold text-teal-700">{effectiveness.avgScore != null ? effectiveness.avgScore : "—"}</p>
                  <p className="text-gray-400">Avg Score /5</p>
                </div>
                <div className="text-center bg-gray-50 rounded p-2">
                  <p className={`font-semibold ${effectiveness.recurrenceObservedCount > 0 ? "text-amber-700" : "text-gray-500"}`}>{effectiveness.recurrenceObservedCount ?? 0}</p>
                  <p className="text-gray-400">Recurrences</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* By-type panel */}
        {byType && byType.length > 0 && (
          <Card className="border-l-4 border-l-blue-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" /> CAPA by Type (6 months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {byType.map((t: any) => (
                  <div key={t.capaType}>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span className="font-medium">{t.capaTypeLabel}</span>
                      <span>{t.closedCount}/{t.total} closed{t.overdueCount > 0 ? `, ${t.overdueCount} OD` : ""}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${t.capaType === 'corrective' ? 'bg-red-400' : t.capaType === 'preventive' ? 'bg-blue-400' : 'bg-purple-400'}`}
                        style={{ width: t.total > 0 ? `${Math.round((t.closedCount / t.total) * 100)}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  captured:       "bg-gray-100 text-gray-800",
  classified:     "bg-blue-100 text-blue-800",
  investigating:  "bg-yellow-100 text-yellow-800",
  verified:       "bg-purple-100 text-purple-800",
  closed:         "bg-green-100 text-green-800",
  reopened:       "bg-orange-100 text-orange-800",
  withdrawn:      "bg-slate-100 text-slate-500",
};

const SEV_COLORS: Record<string, string> = {
  S1: "bg-red-600 text-white",
  S2: "bg-orange-500 text-white",
  S3: "bg-yellow-400 text-gray-900",
  S4: "bg-blue-400 text-white",
};

const BAR_COLORS = ["#3b82f6","#f59e0b","#ef4444","#10b981","#6366f1","#f97316","#06b6d4","#8b5cf6","#ec4899","#84cc16"];

function SummaryCard({ title, value, icon: Icon, color, loading }: {
  title: string; value: number | string; icon: any; color: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`rounded-full p-3 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          {loading ? <Skeleton className="h-7 w-12 mt-1" /> : (
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatHours(h: number | null) {
  if (h == null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function SopDashboardPanels() {
  const { data: sopSummary } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/sop-summary"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/sop-summary?periodDays=30"); if (!r.ok) return null; return r.json(); },
  });
  const { data: sopByDept } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/sop-by-department"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/sop-by-department"); if (!r.ok) return []; return r.json(); },
  });

  if (!sopSummary && (!sopByDept || sopByDept.length === 0)) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mt-2">
        <BookOpen className="h-4 w-4 text-blue-600" />
        <h2 className="text-base font-bold text-gray-800">Standard Operating Procedures (SOP)</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {sopSummary && (
          <Card className="border-l-4 border-l-blue-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-600" /> SOP Overview (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                <div><p className="text-xl font-bold text-gray-800">{sopSummary.totalSop}</p><p className="text-xs text-gray-400">Total</p></div>
                <div><p className="text-xl font-bold text-green-600">{sopSummary.activeCount}</p><p className="text-xs text-gray-400">Active</p></div>
                <div><p className={`text-xl font-bold ${sopSummary.reviewOverdueCount > 0 ? "text-red-700" : "text-gray-400"}`}>{sopSummary.reviewOverdueCount}</p><p className="text-xs text-gray-400">Review Due</p></div>
                <div><p className={`text-xl font-bold ${sopSummary.pendingAckCount > 0 ? "text-orange-600" : "text-gray-400"}`}>{sopSummary.pendingAckCount}</p><p className="text-xs text-gray-400">Pending Acks</p></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs text-center">
                <div className="p-1 bg-gray-50 rounded"><p className="font-semibold">{sopSummary.draftCount}</p><p className="text-gray-400">Draft</p></div>
                <div className="p-1 bg-yellow-50 rounded"><p className="font-semibold text-yellow-700">{sopSummary.underReviewCount}</p><p className="text-gray-400">Under Review</p></div>
                <div className="p-1 bg-blue-50 rounded"><p className="font-semibold text-blue-700">{sopSummary.approvedCount}</p><p className="text-gray-400">Approved</p></div>
              </div>
              <div className="mt-2 text-center">
                <a href="/oi/sop" className="text-xs text-blue-600 hover:underline">View SOP Register →</a>
              </div>
            </CardContent>
          </Card>
        )}
        {sopByDept && sopByDept.length > 0 && (
          <Card className="border-l-4 border-l-teal-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="h-4 w-4 text-teal-600" /> SOPs by Department
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {(sopByDept as any[]).slice(0, 8).map((row: any) => (
                  <div key={row.department} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate">{row.department}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-green-700">{row.active_count} active</span>
                      {Number(row.review_overdue_count) > 0 && <span className="text-red-600">{row.review_overdue_count} overdue</span>}
                      {Number(row.pending_ack_count) > 0 && <span className="text-orange-600">{row.pending_ack_count} acks</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function OiDashboardPage() {
  const { data: summary,  isLoading: sumLoading }     = useQuery<any>({ queryKey: ["/api/oi/dashboard/summary"] });
  const { data: byStatus, isLoading: statusLoading }  = useQuery<any[]>({ queryKey: ["/api/oi/dashboard/by-status"] });
  const { data: recentIssues, isLoading: issuesLoading } = useQuery<any[]>({ queryKey: ["/api/oi/issues"] });

  // Phase 1C: RCA dashboard queries
  const { data: rcaCompletion } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/rca-completion"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/rca-completion");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });
  const { data: rcaByRootCause } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/rca-by-root-cause"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/rca-by-root-cause");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });
  const { data: rcaMttr } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/rca-time-to-complete"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/rca-time-to-complete");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });
  const { data: rcaRecurrence } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/recurrence-rate"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/recurrence-rate");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  // Phase 1B dashboard queries — fetch but handle 403 gracefully
  const { data: financialExposure } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/financial-exposure"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/financial-exposure");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const { data: mttr } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/mttr"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/mttr");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const { data: byCustomer } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/by-customer"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/by-customer");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const { data: byVendor } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/by-vendor"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/by-vendor");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const { data: linkageCoverage } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/linkage-coverage"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/linkage-coverage");
      if (res.status === 403) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Operational Intelligence</h1>
            <p className="text-sm text-gray-500 mt-0.5">Issue Lifecycle Management</p>
          </div>
          <Link href="/oi/issues/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Report Issue
            </Button>
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard title="Open Issues"   value={summary?.totalOpen ?? 0}    icon={Activity}     color="bg-blue-100 text-blue-600"    loading={sumLoading} />
          <SummaryCard title="Critical (S1)" value={summary?.criticalOpen ?? 0} icon={ShieldAlert}  color="bg-red-100 text-red-600"      loading={sumLoading} />
          <SummaryCard title="Major (S2)"    value={summary?.majorOpen ?? 0}    icon={AlertTriangle} color="bg-orange-100 text-orange-600" loading={sumLoading} />
          <SummaryCard title="SLA Breaches"  value={summary?.slaBreaches ?? 0}  icon={Clock}        color="bg-yellow-100 text-yellow-700" loading={sumLoading} />
          <SummaryCard title="My Issues"     value={summary?.myOpenIssues ?? 0} icon={Eye}          color="bg-purple-100 text-purple-600" loading={sumLoading} />
        </div>

        {/* Financial Exposure (SM+ only — null if no access) */}
        {financialExposure && (
          <Card className="border-l-4 border-l-red-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-red-500" /> Financial Exposure Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Est. Loss (Total)</p>
                  <p className="text-lg font-bold text-gray-800">{formatINR(financialExposure.totalEstimatedLoss)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Actual Loss</p>
                  <p className="text-lg font-bold text-red-700">{formatINR(financialExposure.totalActualLoss)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Recovered</p>
                  <p className="text-lg font-bold text-green-700">{formatINR(financialExposure.totalRecovery)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Net Exposure</p>
                  <p className="text-lg font-bold text-orange-700">{formatINR(financialExposure.totalNetExposure)}</p>
                </div>
              </div>
              {financialExposure.byCategory?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Net Exposure by Category</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={financialExposure.byCategory.slice(0,8)} layout="vertical" margin={{ left: 50, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => formatINR(v)} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={50} />
                      <Tooltip formatter={(v: any) => formatINR(Number(v))} />
                      <Bar dataKey="totalNetExposure" radius={[0,3,3,0]}>
                        {financialExposure.byCategory.slice(0,8).map((_: any, i: number) => (
                          <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {/* Status Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> By Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {statusLoading ? (
                Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
              ) : (
                (byStatus ?? []).map(row => (
                  <div key={row.status} className="flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {row.status.replace(/_/g, " ")}
                    </span>
                    <span className="font-semibold text-gray-800">{row.n}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Issues */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2"><Zap className="h-4 w-4" /> Recent Issues</span>
                <Link href="/oi/issues">
                  <Button variant="ghost" size="sm" className="text-xs h-6">View all</Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {issuesLoading ? (
                Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
              ) : (recentIssues ?? []).slice(0, 8).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No issues yet. <Link href="/oi/issues/new"><span className="text-blue-500 underline cursor-pointer">Report the first one.</span></Link></p>
              ) : (
                (recentIssues ?? []).slice(0, 8).map((issue: any) => (
                  <Link key={issue.id} href={`/oi/issues/${issue.id}`}>
                    <div className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer group">
                      <Badge className={`text-xs shrink-0 ${SEV_COLORS[issue.severity] ?? ""}`}>{issue.severity}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{issue.issueNumber} — {issue.title}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[issue.status] ?? "bg-gray-100 text-gray-500"} shrink-0`}>
                        {issue.status}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* MTTR Trend (Manager+ only) */}
        {mttr && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" /> Mean Time to Resolution (MTTR)
                {mttr.overallMttrHours != null && (
                  <span className="ml-auto text-xs font-normal text-gray-400">
                    Overall avg: <strong className="text-gray-700">{formatHours(mttr.overallMttrHours)}</strong>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mttr.trend?.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={mttr.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weekStart" tick={{ fontSize: 9 }}
                      tickFormatter={v => new Date(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}h`} />
                    <Tooltip formatter={(v: any) => formatHours(Number(v))} labelFormatter={v => `Week of ${new Date(v).toLocaleDateString("en-GB")}`} />
                    <Line type="monotone" dataKey="avgMttrHours" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg MTTR" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No closed issues in selected period — MTTR data will appear once issues are closed.</p>
              )}
              {mttr.bySeverity?.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {mttr.bySeverity.map((r: any) => (
                    <div key={r.severity} className="text-center border rounded p-2">
                      <p className="text-xs font-bold text-gray-600">{r.severity}</p>
                      <p className="text-sm font-semibold text-blue-700">{formatHours(r.avgMttrHours)}</p>
                      <p className="text-xs text-gray-400">{r.closedCount} closed</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* By Customer + By Vendor */}
        {(byCustomer || byVendor) && (
          <div className="grid md:grid-cols-2 gap-4">
            {byCustomer && byCustomer.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-500" /> Issues by Customer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={byCustomer.slice(0,10)} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="customerName" tick={{ fontSize: 9 }} width={80}
                        tickFormatter={v => v?.length > 12 ? v.slice(0,12) + "…" : v} />
                      <Tooltip />
                      <Bar dataKey="openCount" name="Open" fill="#6366f1" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            {byVendor && byVendor.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-orange-500" /> Issues by Vendor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={byVendor.slice(0,10)} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 9 }} width={80}
                        tickFormatter={v => v?.length > 12 ? v.slice(0,12) + "…" : v} />
                      <Tooltip />
                      <Bar dataKey="openCount" name="Open" fill="#f97316" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Linkage Coverage (Manager+) */}
        {linkageCoverage && linkageCoverage.totalOpenIssues > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-teal-500" /> Linkage Coverage — {linkageCoverage.totalOpenIssues} open issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { key: "project",             label: "Project" },
                  { key: "customer",            label: "Customer" },
                  { key: "vendor",              label: "Vendor" },
                  { key: "drawing",             label: "Drawing" },
                  { key: "po",                  label: "PO" },
                  { key: "wo",                  label: "WO" },
                  { key: "io",                  label: "IO" },
                  { key: "contract",            label: "Contract" },
                  { key: "riskScored",          label: "Risk Scored" },
                  { key: "financialQuantified", label: "Financial" },
                ].map(({ key, label }) => {
                  const pct = linkageCoverage.coveragePct?.[key] ?? 0;
                  const color = pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";
                  return (
                    <div key={key} className="text-center">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div className={`absolute left-0 top-0 h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs font-semibold text-gray-700">{pct}%</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Phase 1C: RCA Panels */}
        {(rcaCompletion || rcaByRootCause || rcaMttr || rcaRecurrence) && (
          <>
            {/* Section header */}
            <div className="flex items-center gap-2 pt-2">
              <SearchCode className="h-5 w-5 text-purple-600" />
              <h2 className="text-base font-bold text-gray-800">Root Cause Analysis</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {/* RCA Completion */}
              {rcaCompletion && (
                <Card className="border-l-4 border-l-purple-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-purple-600" /> RCA Completion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 text-center mb-3">
                      <div><p className="text-2xl font-bold text-gray-800">{rcaCompletion.totalRcaRequired ?? 0}</p><p className="text-xs text-gray-400">Required</p></div>
                      <div><p className="text-2xl font-bold text-green-600">{rcaCompletion.rcaApprovedCount ?? 0}</p><p className="text-xs text-gray-400">Approved</p></div>
                      <div><p className="text-2xl font-bold text-red-600">{rcaCompletion.overdueCount ?? 0}</p><p className="text-xs text-gray-400">Overdue</p></div>
                    </div>
                    {(rcaCompletion.totalRcaRequired ?? 0) > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Completion rate</span>
                          <span className="font-semibold">{rcaCompletion.completionPct ?? 0}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, rcaCompletion.completionPct ?? 0)}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                      {[
                        { label: 'Draft', val: rcaCompletion.rcaDraftCount ?? 0, cls: 'text-gray-600' },
                        { label: 'In Review', val: (rcaCompletion.rcaSubmittedCount ?? 0) + (rcaCompletion.rcaUnderReviewCount ?? 0), cls: 'text-blue-600' },
                        { label: 'Rejected', val: rcaCompletion.rcaRejectedCount ?? 0, cls: 'text-red-600' },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="text-center">
                          <p className={`font-semibold ${cls}`}>{val}</p>
                          <p className="text-gray-400">{label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Root Cause Breakdown */}
              {rcaByRootCause && rcaByRootCause.length > 0 && (
                <Card className="border-l-4 border-l-indigo-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-indigo-600" /> Root Cause Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={rcaByRootCause.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={120} />
                        <Tooltip formatter={(v: any) => [`${v} issues`, 'Count']} />
                        <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                          {rcaByRootCause.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* RCA Time-to-Complete KPIs */}
              {rcaMttr && (
                <Card className="border-l-4 border-l-teal-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-teal-600" /> RCA Time-to-Complete
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xl font-bold text-teal-700">{rcaMttr.avgDaysToApproval != null ? `${Number(rcaMttr.avgDaysToApproval).toFixed(1)}d` : '—'}</p>
                        <p className="text-xs text-gray-400">Avg Days</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-gray-800">{rcaMttr.medianDaysToApproval != null ? `${Number(rcaMttr.medianDaysToApproval).toFixed(1)}d` : '—'}</p>
                        <p className="text-xs text-gray-400">Median Days</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-orange-600">{rcaMttr.maxDaysToApproval != null ? `${Number(rcaMttr.maxDaysToApproval).toFixed(1)}d` : '—'}</p>
                        <p className="text-xs text-gray-400">Max Days</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3 text-center">Based on {rcaMttr.approvedInPeriod ?? 0} approved RCA(s)</p>
                    {!rcaMttr.approvedInPeriod && <p className="text-xs text-muted-foreground text-center mt-1 italic">No approved RCAs yet.</p>}
                  </CardContent>
                </Card>
              )}

              {/* Recurrence Rate Table */}
              {rcaRecurrence && (rcaRecurrence as any[]).length > 0 && (
                <Card className="border-l-4 border-l-orange-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-orange-600" /> Recurrence Radar
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(rcaRecurrence as any[]).slice(0, 6).map((row: any) => {
                        const recRate = row.issueCount > 1 ? Math.round((row.recurrenceCount / (row.issueCount - 1)) * 100) : 0;
                        return (
                          <div key={row.rootCauseCode} className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{row.rootCauseLabel}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-500">{row.issueCount} issues</span>
                              <span className={`text-xs font-bold ${recRate > 50 ? 'text-red-600' : recRate > 25 ? 'text-orange-500' : 'text-green-600'}`}>
                                {recRate}% rec.
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Phase 1D: CAPA Dashboard Panels */}
        <CapaDashboardPanels />

        {/* Phase 2A: SOP Dashboard Panels */}
        <SopDashboardPanels />

        {/* Quick actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              <Link href="/oi/issues/new"><Button size="sm" className="gap-2"><Plus className="h-3 w-3" /> Report Issue</Button></Link>
              <Link href="/oi/issues"><Button size="sm" variant="outline" className="gap-2"><Activity className="h-3 w-3" /> Issue Register</Button></Link>
              <Link href="/oi/issues?slaBreached=response"><Button size="sm" variant="outline" className="gap-2 border-yellow-400 text-yellow-700"><Clock className="h-3 w-3" /> SLA Breaches</Button></Link>
              <Link href="/oi/issues?severity=S1"><Button size="sm" variant="outline" className="gap-2 border-red-400 text-red-700"><ShieldAlert className="h-3 w-3" /> S1 Critical</Button></Link>
              <Link href="/oi/issues?rcaRequired=true"><Button size="sm" variant="outline" className="gap-2 border-amber-400 text-amber-700"><SearchCode className="h-3 w-3" /> RCA Required</Button></Link>
              <Link href="/oi/capa"><Button size="sm" variant="outline" className="gap-2 border-indigo-400 text-indigo-700"><ShieldAlert className="h-3 w-3" /> CAPA Register</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

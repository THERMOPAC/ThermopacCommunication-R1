import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, CheckCircle, Clock, TrendingUp, ShieldAlert, AlertCircle,
  Zap, Plus, BarChart3, Activity, Eye
} from "lucide-react";

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

export default function OiDashboardPage() {
  const { data: summary, isLoading: sumLoading } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/summary"],
  });
  const { data: byStatus, isLoading: statusLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/dashboard/by-status"],
  });
  const { data: recentIssues, isLoading: issuesLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/issues"],
  });

  const openStatuses = ["captured","classified","investigating"];
  const openByStatus = (byStatus ?? []).filter(r => openStatuses.includes(r.status));

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Operational Intelligence</h1>
            <p className="text-sm text-gray-500 mt-0.5">Issue Lifecycle Management — Phase 1A</p>
          </div>
          <Link href="/oi/issues/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Report Issue
            </Button>
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard title="Open Issues"   value={summary?.totalOpen ?? 0}    icon={Activity}     color="bg-blue-100 text-blue-600"   loading={sumLoading} />
          <SummaryCard title="Critical (S1)" value={summary?.criticalOpen ?? 0}  icon={ShieldAlert}  color="bg-red-100 text-red-600"     loading={sumLoading} />
          <SummaryCard title="Major (S2)"    value={summary?.majorOpen ?? 0}     icon={AlertTriangle} color="bg-orange-100 text-orange-600" loading={sumLoading} />
          <SummaryCard title="SLA Breaches"  value={summary?.slaBreaches ?? 0}   icon={Clock}        color="bg-yellow-100 text-yellow-700" loading={sumLoading} />
          <SummaryCard title="My Issues"     value={summary?.myOpenIssues ?? 0}  icon={Eye}          color="bg-purple-100 text-purple-600" loading={sumLoading} />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Status Breakdown */}
          <Card className="md:col-span-1">
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

        {/* Quick actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              <Link href="/oi/issues/new"><Button size="sm" className="gap-2"><Plus className="h-3 w-3" /> Report Issue</Button></Link>
              <Link href="/oi/issues"><Button size="sm" variant="outline" className="gap-2"><Activity className="h-3 w-3" /> Issue Register</Button></Link>
              <Link href="/oi/issues?slaBreached=response"><Button size="sm" variant="outline" className="gap-2 border-yellow-400 text-yellow-700"><Clock className="h-3 w-3" /> SLA Breaches</Button></Link>
              <Link href="/oi/issues?severity=S1"><Button size="sm" variant="outline" className="gap-2 border-red-400 text-red-700"><ShieldAlert className="h-3 w-3" /> S1 Critical</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

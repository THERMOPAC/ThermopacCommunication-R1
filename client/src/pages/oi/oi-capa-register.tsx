import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ShieldCheck, Plus, Search, Filter, RefreshCw, AlertCircle, Clock,
  ChevronRight, CheckCircle2, XCircle, Activity, AlertTriangle,
  ArrowUpDown, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate } from "@/lib/date-format";
import {
  CAPA_STATUS_LABELS, CAPA_STATUS_COLORS, CAPA_PRIORITY_COLORS, CAPA_PRIORITY_LABELS,
  CAPA_TYPE_LABELS, CAPA_TYPE_COLORS,
} from "./oi-capa-constants";

const ALLOWED_ROLES = ["Manager","Senior Manager","General Manager","Superuser"];

export default function OiCapaRegisterPage() {
  const { user } = useAuth();
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("all");
  const [priorityFilter, setPri]  = useState("all");
  const [typeFilter, setType]     = useState("all");
  const [overdueOnly, setOverdue] = useState(false);
  const [sortField, setSortField] = useState<"createdAt"|"dueDate"|"priority">("createdAt");

  const params = new URLSearchParams();
  if (search)                  params.set("search", search);
  if (statusFilter !== "all")  params.set("status", statusFilter);
  if (priorityFilter !== "all") params.set("priority", priorityFilter);
  if (typeFilter !== "all")    params.set("capaType", typeFilter);
  if (overdueOnly)             params.set("overdueOnly", "true");
  params.set("limit", "200");

  const { data: capas = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["/api/oi/capa", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/oi/capa?${params}`);
      if (!res.ok) throw new Error("Failed to fetch CAPAs");
      return res.json();
    },
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/capa-summary"],
    queryFn: async () => {
      const res = await fetch("/api/oi/dashboard/capa-summary?periodDays=90");
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  if (!ALLOWED_ROLES.includes(user?.role ?? "")) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-600">You do not have access to CAPA records.</p>
        </div>
      </div>
    );
  }

  const PRIORITY_ORDER: Record<string,number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...capas].sort((a, b) => {
    if (sortField === "priority") return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (sortField === "dueDate") {
      const da = a.extendedDueDate ?? a.dueDate; const db2 = b.extendedDueDate ?? b.dueDate;
      if (!da && !db2) return 0; if (!da) return 1; if (!db2) return -1;
      return new Date(da).getTime() - new Date(db2).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg"><ShieldCheck className="h-6 w-6 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CAPA Register</h1>
            <p className="text-sm text-gray-500">Corrective & Preventive Action management</p>
          </div>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* KPI strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Total",           value: summary.totalCapa,               color: "text-gray-800" },
            { label: "Open",            value: summary.openCount,               color: "text-blue-700" },
            { label: "In Progress",     value: summary.inProgressCount,         color: "text-yellow-700" },
            { label: "Pending Verify",  value: summary.pendingVerificationCount, color: "text-orange-700" },
            { label: "Effectiveness",   value: summary.effectivenessReviewCount, color: "text-purple-700" },
            { label: "Closed",          value: summary.closedCount,             color: "text-green-700" },
            { label: "Cancelled",       value: summary.cancelledCount,          color: "text-red-600" },
            { label: "Overdue",         value: summary.overdueCount,            color: "text-red-800 font-bold" },
          ].map(k => (
            <Card key={k.label} className="text-center py-3">
              <CardContent className="p-0">
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search CAPA number or title…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(CAPA_STATUS_LABELS).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPri}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Priorities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {["critical","high","medium","low"].map(p => <SelectItem key={p} value={p}>{CAPA_PRIORITY_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setType}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {["corrective","preventive","combined"].map(t => <SelectItem key={t} value={t}>{CAPA_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortField} onValueChange={v => setSortField(v as any)}>
              <SelectTrigger className="w-[160px]">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Newest First</SelectItem>
                <SelectItem value="dueDate">Due Date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={overdueOnly ? "default" : "outline"}
              size="sm"
              className={overdueOnly ? "bg-red-600 hover:bg-red-700 text-white" : "border-red-300 text-red-700"}
              onClick={() => setOverdue(o => !o)}
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              {overdueOnly ? "Showing Overdue" : "Overdue Only"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-700">{sorted.length} record{sorted.length !== 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No CAPA records match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["CAPA #","Issue","Type","Title","Priority","Status","Assignee","Due Date","Actions",""].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((capa: any) => {
                    const effectiveDue = capa.extendedDueDate ?? capa.dueDate;
                    return (
                      <tr key={capa.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700 whitespace-nowrap">{capa.capaNumber}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {capa.issueCode ? (
                            <Link href={`/oi/issues/${capa.issueId}`}>
                              <span className="text-blue-600 hover:underline cursor-pointer font-mono text-xs">{capa.issueCode}</span>
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CAPA_TYPE_COLORS[capa.capaType]}`}>
                            {CAPA_TYPE_LABELS[capa.capaType] ?? capa.capaType}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <p className="truncate font-medium text-gray-900">{capa.title}</p>
                          {capa.description && <p className="truncate text-xs text-gray-400">{capa.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CAPA_PRIORITY_COLORS[capa.priority]}`}>
                            {CAPA_PRIORITY_LABELS[capa.priority] ?? capa.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CAPA_STATUS_COLORS[capa.status]}`}>
                            {CAPA_STATUS_LABELS[capa.status] ?? capa.status}
                          </span>
                          {capa.isOverdue && (
                            <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold">OD</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{capa.assignedToName ?? "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {effectiveDue ? (
                            <span className={`text-xs ${capa.isOverdue ? "text-red-700 font-semibold" : "text-gray-600"}`}>
                              {capa.isOverdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                              {fmtDate(effectiveDue)}
                              {capa.extendedDueDate && <span className="ml-1 text-gray-400">(ext)</span>}
                            </span>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {capa.actionSummary && (
                            <span className="text-xs text-gray-600">
                              <CheckCircle2 className="inline h-3 w-3 text-green-500 mr-0.5" />
                              {capa.actionSummary.completed}/{capa.actionSummary.total}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/oi/capa/${capa.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <Eye className="h-3.5 w-3.5 text-gray-500" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

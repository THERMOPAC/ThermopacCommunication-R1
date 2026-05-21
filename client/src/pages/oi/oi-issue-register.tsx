import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Clock, AlertTriangle, Filter } from "lucide-react";
import { fmtDate } from "@/lib/date-format";

const STATUS_COLORS: Record<string, string> = {
  captured:      "bg-gray-100 text-gray-800 border-gray-200",
  classified:    "bg-blue-100 text-blue-800 border-blue-200",
  investigating: "bg-yellow-100 text-yellow-800 border-yellow-200",
  verified:      "bg-purple-100 text-purple-800 border-purple-200",
  closed:        "bg-green-100 text-green-800 border-green-200",
  reopened:      "bg-orange-100 text-orange-800 border-orange-200",
  withdrawn:     "bg-slate-100 text-slate-500 border-slate-200",
};

const SEV_COLORS: Record<string, string> = {
  S1: "bg-red-600 text-white",
  S2: "bg-orange-500 text-white",
  S3: "bg-yellow-400 text-gray-900",
  S4: "bg-blue-400 text-white",
};

const CATEGORIES = ["QC","DWG","PROC","MFG","SITE","COMM","LOG","DOC","SAP","COMP","SAFETY","FIN","LEGAL","HR","CUST","SYS","INT","OTHER"];
const STATUSES = ["captured","classified","investigating","verified","closed","reopened","withdrawn"];

export default function OiIssueRegisterPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");

  const params = new URLSearchParams();
  if (statusFilter   !== "all") params.set("status",   statusFilter);
  if (severityFilter !== "all") params.set("severity", severityFilter);
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  if (slaFilter      !== "all") params.set("slaBreached", slaFilter);
  if (search)                   params.set("search",   search);
  params.set("limit", "50");

  const { data: issues, isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/issues", statusFilter, severityFilter, categoryFilter, slaFilter, search],
    queryFn: async () => {
      const res = await fetch(`/api/oi/issues?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Issue Register</h1>
            <p className="text-sm text-gray-500">All operational issues</p>
          </div>
          <Link href="/oi/issues/new">
            <Button className="gap-2"><Plus className="h-4 w-4" /> Report Issue</Button>
          </Link>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by number or title..."
                  className="pl-8 h-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-9 w-28"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sev.</SelectItem>
                  {["S1","S2","S3","S4"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={slaFilter} onValueChange={setSlaFilter}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="SLA" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All SLA</SelectItem>
                  <SelectItem value="response">Response breached</SelectItem>
                  <SelectItem value="closure">Closure breached</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Issue list */}
        <div className="space-y-2">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
          ) : (issues ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-400">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No issues found.</p>
                <Link href="/oi/issues/new">
                  <Button variant="link" className="mt-1">Report the first issue</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            (issues ?? []).map((issue: any) => (
              <Link key={issue.id} href={`/oi/issues/${issue.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <Badge className={`text-xs shrink-0 px-2 py-0.5 ${SEV_COLORS[issue.severity]}`}>
                        {issue.severity}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-mono shrink-0">{issue.issueNumber}</span>
                          <span className="text-sm font-medium text-gray-900 truncate">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>{issue.category}</span>
                          <span>·</span>
                          <span>{issue.projectPhase}</span>
                          <span>·</span>
                          <span>{fmtDate(issue.createdAt)}</span>
                          {issue.responseSlaBreached && (
                            <><span>·</span><span className="text-red-600 flex items-center gap-0.5"><Clock className="h-3 w-3" /> Response SLA breached</span></>
                          )}
                          {issue.closureSlaBreached && (
                            <><span>·</span><span className="text-orange-600 flex items-center gap-0.5"><Clock className="h-3 w-3" /> Closure SLA breached</span></>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[issue.status] ?? "bg-gray-100 text-gray-700"} shrink-0`}>
                        {issue.status.replace(/_/g," ")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

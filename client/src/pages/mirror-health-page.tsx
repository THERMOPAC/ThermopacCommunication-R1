import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fmtDateTime } from "@/lib/date-format";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCcw,
  ServerCrash,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface MirrorSummary {
  totals: { pending: number; processing: number; completed: number; failed: number };
  byModule: Array<{
    module: string;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>;
}

interface MirrorJob {
  id: number;
  status: string;
  relative_path: string;
  file_name: string | null;
  expected_sha256: string | null;
  actual_sha256: string | null;
  source_module: string | null;
  source_record_id: number | null;
  agent_code: string | null;
  failed_reason: string | null;
  retry_count: number;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  completed_at: string | null;
  claimed_at: string | null;
}

interface JobsResponse {
  jobs: MirrorJob[];
  total: number;
  page: number;
  pages: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed:  "bg-green-100 text-green-800 border-green-200",
  failed:     "bg-red-100 text-red-800 border-red-200",
};

const MODULE_LABELS: Record<string, string> = {
  company_documents: "Company Documents",
};

function moduleLabel(mod: string | null) {
  if (!mod) return "—";
  return MODULE_LABELS[mod] ?? mod;
}

export default function MirrorHealthPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [page, setPage]                 = useState(1);
  const limit = 20;

  const { data: summary, isLoading: summaryLoading } = useQuery<MirrorSummary>({
    queryKey: ["/api/mirror-health/summary"],
    refetchInterval: 30_000,
  });

  const jobsParams = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (statusFilter !== "all") jobsParams.set("status", statusFilter);
  if (moduleFilter !== "all") jobsParams.set("module", moduleFilter);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/mirror-health/jobs", statusFilter, moduleFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/mirror-health/jobs?${jobsParams}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json() as Promise<JobsResponse>;
    },
    refetchInterval: 15_000,
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: number) =>
      apiRequest("POST", `/api/mirror-health/jobs/${jobId}/retry`),
    onSuccess: () => {
      toast({ title: "Mirror job re-queued", description: "The file will be mirrored on the next agent poll." });
      qc.invalidateQueries({ queryKey: ["/api/mirror-health/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/mirror-health/jobs"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Retry failed", description: err.message ?? "Unknown error" });
    },
  });

  const totals = summary?.totals ?? { pending: 0, processing: 0, completed: 0, failed: 0 };

  const kpiCards = [
    {
      label: "Pending",
      value: totals.pending,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50 border-yellow-200",
    },
    {
      label: "In Progress",
      value: totals.processing,
      icon: Loader2,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200",
    },
    {
      label: "Mirrored",
      value: totals.completed,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50 border-green-200",
    },
    {
      label: "Failed",
      value: totals.failed,
      icon: ServerCrash,
      color: "text-red-600",
      bg: "bg-red-50 border-red-200",
    },
  ];

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mirror Health Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            GCS → Windows file server mirror status across all governed modules
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`border ${card.bg}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {card.label}
                    </p>
                    <p className={`text-3xl font-bold mt-1 ${card.color}`}>
                      {summaryLoading ? "—" : card.value.toLocaleString()}
                    </p>
                  </div>
                  <Icon className={`h-8 w-8 opacity-70 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-module breakdown */}
      {summary?.byModule && summary.byModule.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-700">By Module</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.byModule.map((row) => (
                <div
                  key={row.module}
                  className="border rounded-lg p-3 bg-gray-50 space-y-1"
                >
                  <p className="text-xs font-semibold text-gray-700">{moduleLabel(row.module)}</p>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span className="text-yellow-700 font-medium">{row.pending} pending</span>
                    <span className="text-blue-700 font-medium">{row.processing} processing</span>
                    <span className="text-green-700 font-medium">{row.completed} done</span>
                    {row.failed > 0 && (
                      <span className="text-red-700 font-medium">{row.failed} failed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium text-gray-700">Mirror Jobs</CardTitle>
            <div className="flex gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={moduleFilter}
                onValueChange={(v) => { setModuleFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="All modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  <SelectItem value="company_documents">Company Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading jobs…
            </div>
          ) : !jobsData?.jobs?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-300" />
              <p className="text-sm">No mirror jobs match this filter.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-12">ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead className="max-w-xs">File Path</TableHead>
                      <TableHead>SHA-256 match</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="w-20">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsData.jobs.map((job) => {
                      const shaMatch =
                        job.expected_sha256 && job.actual_sha256
                          ? job.expected_sha256 === job.actual_sha256
                            ? "match"
                            : "mismatch"
                          : null;
                      return (
                        <TableRow key={job.id} className="text-xs">
                          <TableCell className="font-mono text-gray-500">{job.id}</TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
                            >
                              {job.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-600">{moduleLabel(job.source_module)}</TableCell>
                          <TableCell className="max-w-xs">
                            <span
                              className="block truncate font-mono text-gray-600"
                              title={job.relative_path}
                            >
                              {job.relative_path}
                            </span>
                            {job.file_name && (
                              <span className="text-gray-400 truncate block" title={job.file_name}>
                                {job.file_name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {shaMatch === "match" && (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> OK
                              </span>
                            )}
                            {shaMatch === "mismatch" && (
                              <span className="text-red-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Mismatch
                              </span>
                            )}
                            {!shaMatch && <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell className="font-mono text-gray-500">
                            {job.agent_code ?? "—"}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {fmtDateTime(job.created_at)}
                            {job.created_by_name && (
                              <span className="block text-gray-400">{job.created_by_name}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {job.completed_at ? fmtDateTime(job.completed_at) : "—"}
                          </TableCell>
                          <TableCell>
                            {job.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={retryMutation.isPending}
                                onClick={() => retryMutation.mutate(job.id)}
                              >
                                <RefreshCcw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {jobsData.pages > 1 && (
                <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                  <span>
                    Showing {(page - 1) * limit + 1}–
                    {Math.min(page * limit, jobsData.total)} of {jobsData.total}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="px-3 py-1 border rounded text-xs">
                      {page} / {jobsData.pages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={page >= jobsData.pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Failed job reason tooltip area */}
              {jobsData.jobs.some((j) => j.status === "failed" && j.failed_reason) && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-600">Failure Details</p>
                  {jobsData.jobs
                    .filter((j) => j.status === "failed" && j.failed_reason)
                    .map((j) => (
                      <div
                        key={j.id}
                        className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
                      >
                        <span className="font-medium">Job #{j.id}</span>
                        {" — "}
                        {j.failed_reason}
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

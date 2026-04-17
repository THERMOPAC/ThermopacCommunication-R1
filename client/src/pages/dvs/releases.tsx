import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BadgeCheck,
  Search,
  ExternalLink,
  Lock,
  Hash,
  Calendar,
  User,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DrawingRevision = {
  id: number;
  projectId: number;
  projectCode: string | null;
  drawingControlId: number | null;
  drawingNumber: string;
  revision: string;
  title: string | null;
  itemCode: string | null;
  discipline: string | null;
  uploadedBy: string;
  uploadedAt: string;
  status: string;
};

type Project = { id: number; code: string; name?: string };

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return s;
  }
}

const disciplineColors: Record<string, string> = {
  Mechanical: "bg-blue-100 text-blue-700",
  Civil: "bg-amber-100 text-amber-700",
  Electrical: "bg-yellow-100 text-yellow-700",
  Instrumentation: "bg-purple-100 text-purple-700",
  Piping: "bg-teal-100 text-teal-700",
};

export default function ReleaseRegisterPage() {
  const [filterProject, setFilterProject] = useState("all");
  const [search, setSearch] = useState("");

  const { data: revisions = [], isLoading } = useQuery<DrawingRevision[]>({
    queryKey: ["/api/drawing-revisions"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const released = revisions.filter((r) => r.status === "released");

  const filtered = released.filter((r) => {
    if (filterProject !== "all" && String(r.projectId) !== filterProject) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.drawingNumber.toLowerCase().includes(q) &&
        !(r.title ?? "").toLowerCase().includes(q) &&
        !(r.projectCode ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-700" />
            <h1 className="text-xl font-bold text-gray-900">Release Register</h1>
            <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
              CONTROLLED
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            All drawings that have been verified, approved, and released to the controlled zone.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-700">{released.length}</div>
          <div className="text-xs text-gray-500">controlled drawings</div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b bg-white px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search drawing number or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="h-8 text-sm w-48">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 px-8">
            <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
              <BadgeCheck className="h-7 w-7 text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-600">No released drawings yet</h3>
            <p className="text-sm text-gray-400 mt-1 max-w-sm">
              Drawings that complete the full verification pipeline will appear here as controlled documents.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 w-10">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Drawing Number</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Rev</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Discipline</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Item Code</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">EPC Link</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Released</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900">{r.drawingNumber}</span>
                      <Lock className="h-3 w-3 text-emerald-600" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs px-1.5 py-0.5 bg-gray-100 rounded border text-gray-700">
                      {r.revision}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{r.title ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-700">{r.projectCode ?? `#${r.projectId}`}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.discipline ? (
                      <span
                        className={cn(
                          "text-xs font-medium px-1.5 py-0.5 rounded",
                          disciplineColors[r.discipline] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {r.discipline}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.itemCode ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.drawingControlId ? (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        EPC #{r.drawingControlId}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(r.uploadedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

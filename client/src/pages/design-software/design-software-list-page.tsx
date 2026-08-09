import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Layers, RefreshCw,
  Eye, Pencil, Trash2, FlaskConical,
  AlertTriangle,
} from "lucide-react";
import ReferencePapersSection from "./reference-papers-section";

// ── Status colour map ─────────────────────────────────────────────────────────
const STATUS_COLOURS: Record<string, string> = {
  draft:               "bg-slate-100 text-slate-700",
  under_review:        "bg-yellow-100 text-yellow-800",
  checked:             "bg-blue-100 text-blue-800",
  approved:            "bg-green-100 text-green-800",
  issued_for_enquiry:  "bg-purple-100 text-purple-800",
  superseded:          "bg-orange-100 text-orange-800",
  archived:            "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft:               "Draft",
  under_review:        "Under Review",
  checked:             "Checked",
  approved:            "Approved",
  issued_for_enquiry:  "Issued for Enquiry",
  superseded:          "Superseded",
  archived:            "Archived",
};

interface Design {
  id: number;
  design_number: string;
  module_type: string;
  design_type: string;
  title: string;
  current_status: string;
  revision_number: number | null;
  revision_status: string | null;
  is_frozen: boolean | null;
  project_code: string | null;
  created_by_name: string | null;
  capacity: string | null;
  updated_at: string;
}

interface DesignListResponse {
  designs: Design[];
  total: number;
  page: number;
  limit: number;
}

// Module config injected at the list-page level — one entry per discipline
const MODULE_CONFIG = {
  llx: {
    route: "/design-software/liquid-liquid-extraction",
    label: "Liquid-Liquid Extraction",
    description: "Extraction column hydraulics and design calculations",
  },
} as const;

type ModuleKey = keyof typeof MODULE_CONFIG;

export default function DesignSoftwareListPage({ moduleType = "llx" }: { moduleType?: ModuleKey }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const mod = MODULE_CONFIG[moduleType];

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterModule] = useState(moduleType);

  // Dialogs
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Design | null>(null);

  const [form, setForm] = useState({
    moduleType: "llx",
    designType: "rnd",
    title: "",
    capacity: "",
    rndReference: "",
    rndCustomerName: "",
    rndLocation: "",
    rndNotes: "",
  });

  const query = useQuery<DesignListResponse>({
    queryKey: ["/api/design-software/designs", { search, filterStatus, filterType, filterModule }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("designType", filterType);
      if (filterModule !== "all") params.set("moduleType", filterModule);
      return apiRequest("GET", `/api/design-software/designs?${params}`) as Promise<DesignListResponse>;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/design-software/designs", data) as Promise<any>,
    onSuccess: (design) => {
      qc.invalidateQueries({ queryKey: ["/api/design-software/designs"] });
      setShowNew(false);
      setForm({ moduleType: "llx", designType: "rnd", title: "", capacity: "", rndReference: "", rndCustomerName: "", rndLocation: "", rndNotes: "" });
      toast({ title: "Design created", description: design.design_number });
      navigate(`${mod.route}/${design.id}`);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/design-software/designs/${id}`) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/design-software/designs"] });
      setDeleteTarget(null);
      toast({ title: "Design deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const designs = query.data?.designs ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FlaskConical className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{mod.label}</h1>
              <p className="text-sm text-gray-500">{mod.description}</p>
            </div>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New LLX Design
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by number or title…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="rnd">R&amp;D</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["/api/design-software/designs"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Count */}
        {query.data && (
          <p className="text-xs text-gray-500">
            {query.data.total} design{query.data.total !== 1 ? "s" : ""}
          </p>
        )}

        {/* ── Design Table ─────────────────────────────────────────────────────── */}
        {query.isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : designs.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-xl text-gray-400">
            <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No designs found</p>
            <p className="text-sm mt-1">Create your first engineering design to get started.</p>
            <Button className="mt-4 gap-2" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> New LLX Design
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-0 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div className="px-4 py-3">Design</div>
              <div className="px-4 py-3">Type</div>
              <div className="px-4 py-3">Revision</div>
              <div className="px-4 py-3">Status</div>
              <div className="px-4 py-3 text-right">Actions</div>
            </div>

            {/* Table rows */}
            {designs.map((d, idx) => (
              <div
                key={d.id}
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-0 items-center border-b last:border-b-0 hover:bg-blue-50/30 transition-colors ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
              >
                {/* Design number + title */}
                <div className="px-4 py-3 min-w-0">
                  <p className="text-[11px] font-mono text-gray-400">{d.design_number}</p>
                  <p
                    className="font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors mt-0.5"
                    onClick={() => navigate(`${mod.route}/${d.id}`)}
                    title={d.title}
                  >
                    {d.title}
                  </p>
                  {d.capacity && (
                    <p className="text-xs text-gray-400 mt-0.5">{d.capacity}</p>
                  )}
                  {(d.project_code || d.created_by_name) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[d.project_code, d.created_by_name].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                {/* Type */}
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-600 capitalize">
                    {d.design_type === "rnd" ? "R&D" : "Project"}
                  </span>
                </div>

                {/* Revision */}
                <div className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    Rev {d.revision_number ?? 0}
                    {d.is_frozen ? " 🔒" : ""}
                  </span>
                </div>

                {/* Status */}
                <div className="px-4 py-3">
                  <Badge className={`text-xs ${STATUS_COLOURS[d.current_status] ?? "bg-gray-100 text-gray-700"}`}>
                    {STATUS_LABELS[d.current_status] ?? d.current_status}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="px-4 py-3 flex items-center gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                    title="View"
                    onClick={() => navigate(`${mod.route}/${d.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-500 hover:text-amber-600"
                    title="Edit"
                    onClick={() => navigate(`${mod.route}/${d.id}`)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                    title="Delete"
                    onClick={() => setDeleteTarget(d)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Reference Papers — controlled literature library (global) ────────── */}
        <ReferencePapersSection />

        {/* ── New Design Dialog ─────────────────────────────────────────────────── */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Engineering Design</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Module</Label>
                  <Select value={form.moduleType} onValueChange={v => setForm(f => ({ ...f, moduleType: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llx">Liquid-Liquid Extraction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.designType} onValueChange={v => setForm(f => ({ ...f, designType: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rnd">R&amp;D</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Title <span className="text-red-500">*</span></Label>
                <Input
                  className="mt-1.5"
                  placeholder="e.g. UOR LLX Extraction Column Design"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Capacity</Label>
                <Input
                  className="mt-1.5"
                  placeholder="e.g. 1500 LPH"
                  value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                />
              </div>
              {form.designType === "rnd" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>R&amp;D Reference</Label>
                      <Input className="mt-1.5" placeholder="Internal ref" value={form.rndReference} onChange={e => setForm(f => ({ ...f, rndReference: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Customer / Client</Label>
                      <Input className="mt-1.5" placeholder="Customer name" value={form.rndCustomerName} onChange={e => setForm(f => ({ ...f, rndCustomerName: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input className="mt-1.5" placeholder="Plant / site" value={form.rndLocation} onChange={e => setForm(f => ({ ...f, rndLocation: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea className="mt-1.5" rows={2} placeholder="Background / context" value={form.rndNotes} onChange={e => setForm(f => ({ ...f, rndNotes: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.title.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create Design"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
        <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" /> Delete Design
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-700 py-2">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold">{deleteTarget?.design_number} — {deleteTarget?.title}</span>?
              <br />
              <span className="text-gray-500 text-xs">All revisions, inputs and results will be deleted. This cannot be undone.</span>
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}

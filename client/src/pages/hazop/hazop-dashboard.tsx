import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldAlert, Plus, Trash2, Loader2 } from "lucide-react";
import { fmtDate } from "@/lib/date-format";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HazopStudy {
  id: number;
  study_number: string;
  title: string;
  concept_title: string | null;
  study_mode: string;
  status: string;
  revision: string;
  study_date: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: number;
  code: string;
  customer_name: string;
  project_display_name?: string;
  offer_subject?: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StudyStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 border-gray-200",
    reviewed: "bg-blue-100 text-blue-700 border-blue-200",
    proposal: "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-green-100 text-green-700 border-green-200",
    released: "bg-emerald-700 text-white border-emerald-700",
    converted: "bg-blue-700 text-white border-blue-700",
    closed: "bg-gray-800 text-white border-gray-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Create Study Dialog ───────────────────────────────────────────────────────

interface CreateStudyDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (mode: string) => void;
}

function CreateStudyDialog({ open, onClose, onSuccess }: CreateStudyDialogProps) {
  const { toast } = useToast();
  const [studyMode, setStudyMode] = useState<"project_based" | "concept_expected_project">("project_based");
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [conceptTitle, setConceptTitle] = useState("");
  const [processDescription, setProcessDescription] = useState("");
  const [studyDate, setStudyDate] = useState("");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      apiRequest("POST", "/api/hazop/studies", body),
    onSuccess: (_data) => {
      toast({ title: "Study created successfully" });
      onSuccess(studyMode);
      handleClose();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create study", description: err.message, variant: "destructive" });
    },
  });

  function handleClose() {
    setStudyMode("project_based");
    setProjectId("");
    setTitle("");
    setConceptTitle("");
    setProcessDescription("");
    setStudyDate("");
    onClose();
  }

  function handleSubmit() {
    if (!title.trim()) {
      toast({ title: "Study title is required", variant: "destructive" });
      return;
    }
    if (studyMode === "project_based" && !projectId) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    if (studyMode === "concept_expected_project" && !conceptTitle.trim()) {
      toast({ title: "Concept title is required", variant: "destructive" });
      return;
    }

    const body: Record<string, any> = {
      study_mode: studyMode,
      title: title.trim(),
    };
    if (studyMode === "project_based") body.project_id = parseInt(projectId);
    if (studyMode === "concept_expected_project") body.concept_title = conceptTitle.trim();
    if (processDescription.trim()) body.process_description = processDescription.trim();
    if (studyDate) body.study_date = studyDate;

    createMutation.mutate(body);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New HAZOP Study</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Study Mode</Label>
            <Select value={studyMode} onValueChange={(v) => setStudyMode(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project_based">Project-Based</SelectItem>
                <SelectItem value="concept_expected_project">Concept / Expected Project</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {studyMode === "project_based" && (
            <div className="space-y-1.5">
              <Label>Project <span className="text-red-500">*</span></Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.code} — {p.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {studyMode === "concept_expected_project" && (
            <div className="space-y-1.5">
              <Label>Concept Title <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Thermal Oil System HAZOP"
                value={conceptTitle}
                onChange={(e) => setConceptTitle(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Study Title <span className="text-red-500">*</span></Label>
            <Input
              placeholder="e.g. HAZOP Study Rev A"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Process Description <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Textarea
              placeholder="Brief description of the process being studied…"
              rows={3}
              value={processDescription}
              onChange={(e) => setProcessDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Study Date <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Input type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Study
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Project Studies Tab ───────────────────────────────────────────────────────

function ProjectStudiesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<HazopStudy | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: studies = [], isLoading } = useQuery<HazopStudy[]>({
    queryKey: ["/api/hazop/projects", selectedProjectId, "studies"],
    queryFn: async () => {
      const res = await fetch(`/api/hazop/projects/${selectedProjectId}/studies`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load studies");
      return res.json();
    },
    enabled: !!selectedProjectId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/studies/${id}`),
    onSuccess: () => {
      toast({ title: "Study deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/projects", selectedProjectId, "studies"] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a project to view studies…" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.code} — {p.customer_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedProjectId && (
        <div className="text-center py-16 text-gray-400">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Select a project to view its HAZOP studies.</p>
        </div>
      )}

      {selectedProjectId && isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {selectedProjectId && !isLoading && studies.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No HAZOP studies for this project yet. Create one to get started.</p>
        </div>
      )}

      {selectedProjectId && !isLoading && studies.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Study Number</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rev</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Study Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created By</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {studies.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.study_number}</td>
                  <td className="px-4 py-3 text-gray-900">{s.title}</td>
                  <td className="px-4 py-3"><StudyStatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{s.revision}</td>
                  <td className="px-4 py-3 text-gray-500">{s.study_date ? fmtDate(s.study_date) : "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{s.created_by_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {s.status === "draft" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete HAZOP Study?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete study <strong>{deleteTarget?.study_number}</strong> and all its associated records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Concept Studies Tab ───────────────────────────────────────────────────────

function ConceptStudiesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<HazopStudy | null>(null);

  const { data: studies = [], isLoading } = useQuery<HazopStudy[]>({
    queryKey: ["/api/hazop/concept-studies"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/studies/${id}`),
    onSuccess: () => {
      toast({ title: "Study deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/concept-studies"] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>No concept studies yet.</p>
        <p className="text-xs mt-1">Use concept mode to explore HAZOP before a project is created.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Study Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Concept Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Study Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Rev</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Study Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created By</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {studies.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.study_number}</td>
                <td className="px-4 py-3 text-gray-900 font-medium">{s.concept_title ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{s.title}</td>
                <td className="px-4 py-3"><StudyStatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-gray-500">{s.revision}</td>
                <td className="px-4 py-3 text-gray-500">{s.study_date ? fmtDate(s.study_date) : "—"}</td>
                <td className="px-4 py-3 text-gray-500">{s.created_by_name ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {s.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Concept Study?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.study_number}</strong> and all its records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HazopDashboardPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("project");
  const queryClient = useQueryClient();

  function handleStudyCreated(mode: string) {
    if (mode === "concept_expected_project") {
      setActiveTab("concept");
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/concept-studies"] });
    } else {
      setActiveTab("project");
    }
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 border border-red-100">
              <ShieldAlert className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">HAZOP</h1>
              <p className="text-sm text-gray-500 mt-0.5">Process Safety &amp; Risk Analysis</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Study
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="project">Project Studies</TabsTrigger>
            <TabsTrigger value="concept">Concept Studies</TabsTrigger>
          </TabsList>

          <TabsContent value="project">
            <ProjectStudiesTab />
          </TabsContent>

          <TabsContent value="concept">
            <ConceptStudiesTab />
          </TabsContent>
        </Tabs>
      </div>

      <CreateStudyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleStudyCreated}
      />
    </Layout>
  );
}

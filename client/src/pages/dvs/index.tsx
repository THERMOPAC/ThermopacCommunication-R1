import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Upload,
  FileCheck,
  Cpu,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Search,
  RefreshCw,
  BadgeCheck,
  Layers,
  FileText,
  Hash,
  Clock,
  User,
  Database,
  ArrowRight,
  XCircle,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Clipboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
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
  fileType: string;
  checksum: string;
  storageZone: string;
  uploadedBy: string;
  uploadedAt: string;
  originalFilename: string | null;
  gcsStagingPath: string;
  fileSizeBytes: number | null;
  status: string;
  uploaderNotes: string | null;
};

type Project = { id: number; code: string; name?: string };

type EpcDrawingControl = {
  id: number;
  dwgControlNumber: string;
  drawingNumber: string | null;
  drawingTitle: string | null;
  revisionCode: string;
  status: string;
};

type ExtractionData = {
  id: number;
  drawnBy: string | null;
  checkedBy: string | null;
  scaleInfo: string | null;
  sheetSize: string | null;
  drawingNumberExtracted: string | null;
  revisionExtracted: string | null;
  descriptionLine1: string | null;
  descriptionLine2: string | null;
  extractedAt: string | null;
  extractionMethod: string | null;
  rawMetadata: any;
};

type RuleResult = {
  ruleCode: string;
  ruleName: string;
  verdict: "PASS" | "WARN" | "FAIL";
  detail: string | null;
};

type EvaluationData = {
  id: number;
  overallVerdict: string;
  ruleResults: RuleResult[];
  evaluatedAt: string | null;
};

type AgentReport = {
  id: number;
  recommendation: string;
  summary: string | null;
  confidence: number | null;
  flaggedIssues: any[];
  qualityScore: number | null;
  generatedAt: string | null;
};

type ApprovalData = {
  id: number;
  decision: string;
  approvedBy: string;
  approvedAt: string;
  comments: string | null;
};

type ReleaseData = {
  id: number;
  releasedBy: string;
  releasedAt: string;
  gcsControlledPath: string | null;
  pdfCertificatePath: string | null;
  releaseNotes: string | null;
  immutableChecksum: string | null;
};

// ─────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────
const STATUS_ORDER = ["uploaded", "extracted", "evaluated", "approved", "released"];

function stageIndex(status: string): number {
  return STATUS_ORDER.indexOf(status);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    uploaded: { label: "Uploaded", className: "bg-blue-100 text-blue-800 border-blue-200" },
    extracted: { label: "Extracted", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    evaluated: { label: "Evaluated", className: "bg-amber-100 text-amber-800 border-amber-200" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    released: { label: "Released", className: "bg-green-100 text-green-800 border-green-200" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-gray-100 text-gray-800 border-gray-200" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded border", cfg.className)}>
      {cfg.label}
    </span>
  );
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === "PASS") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (verdict === "WARN") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return s;
  }
}

// ─────────────────────────────────────────────────────────────
// Pipeline Step Node
// ─────────────────────────────────────────────────────────────
type StepState = "done" | "active" | "locked";

const PIPELINE_STEPS = ["Upload", "Extract", "Evaluate", "Approve", "Release"];

function PipelineTracker({ currentStatus }: { currentStatus: string }) {
  const idx = stageIndex(currentStatus);
  return (
    <div className="flex items-center gap-0 py-3">
      {PIPELINE_STEPS.map((label, i) => {
        const state: StepState = i <= idx ? "done" : i === idx + 1 ? "active" : "locked";
        const isLast = i === PIPELINE_STEPS.length - 1;
        return (
          <div key={label} className="flex items-center gap-0 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                  state === "done" && "bg-emerald-600 border-emerald-600 text-white",
                  state === "active" && "bg-blue-600 border-blue-600 text-white animate-pulse",
                  state === "locked" && "bg-gray-100 border-gray-300 text-gray-400",
                )}
              >
                {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap",
                  state === "done" && "text-emerald-700",
                  state === "active" && "text-blue-700",
                  state === "locked" && "text-gray-400",
                )}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "flex-1 h-0.5 mt-[-14px] mx-1",
                  i < idx ? "bg-emerald-400" : "bg-gray-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stage Accordion Card
// ─────────────────────────────────────────────────────────────
function StageCard({
  title,
  icon: Icon,
  state,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  state: StepState;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        state === "done" && "border-emerald-200 bg-emerald-50/30",
        state === "active" && "border-blue-200 bg-blue-50/20",
        state === "locked" && "border-gray-200 bg-gray-50/40 opacity-60",
      )}
    >
      <button
        onClick={() => state !== "locked" && setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 text-left",
          state === "locked" ? "cursor-not-allowed" : "cursor-pointer hover:bg-black/5",
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon
            className={cn(
              "h-4 w-4",
              state === "done" && "text-emerald-600",
              state === "active" && "text-blue-600",
              state === "locked" && "text-gray-400",
            )}
          />
          <span
            className={cn(
              "text-sm font-semibold",
              state === "done" && "text-emerald-800",
              state === "active" && "text-blue-800",
              state === "locked" && "text-gray-500",
            )}
          >
            {title}
          </span>
          {state === "done" && (
            <span className="text-xs text-emerald-600 font-medium bg-emerald-100 px-1.5 py-0.5 rounded">
              Complete
            </span>
          )}
          {state === "active" && (
            <span className="text-xs text-blue-600 font-medium bg-blue-100 px-1.5 py-0.5 rounded">
              Ready
            </span>
          )}
          {state === "locked" && <Lock className="h-3 w-3 text-gray-400" />}
        </div>
        {state !== "locked" &&
          (open ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          ))}
      </button>
      {open && state !== "locked" && (
        <div className="px-4 pb-4 border-t border-inherit">{children}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Row detail: key / value table
// ─────────────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0 border-gray-100">
      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
      <span className="text-xs text-gray-900 font-medium break-all">{value ?? "—"}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Upload Dialog
// ─────────────────────────────────────────────────────────────
function UploadDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState("");
  const [drawingControlId, setDrawingControlId] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [revision, setRevision] = useState("");
  const [title, setTitle] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: drawingControls = [] } = useQuery<EpcDrawingControl[]>({
    queryKey: ["/api/projects", projectId, "drawing-controls"],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/drawing-controls`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const reset = () => {
    setProjectId("");
    setDrawingControlId("");
    setDrawingNumber("");
    setRevision("");
    setTitle("");
    setItemCode("");
    setDiscipline("");
    setNotes("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!projectId || !drawingNumber.trim() || !revision.trim() || !file) {
      toast({ title: "Missing fields", description: "Project, drawing number, revision, and file are required.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", projectId);
      fd.append("drawingNumber", drawingNumber.trim());
      fd.append("revision", revision.trim());
      if (drawingControlId && drawingControlId !== "none") fd.append("drawingControlId", drawingControlId);
      if (title.trim()) fd.append("title", title.trim());
      if (itemCode.trim()) fd.append("itemCode", itemCode.trim());
      if (discipline.trim()) fd.append("discipline", discipline.trim());
      if (notes.trim()) fd.append("uploaderNotes", notes.trim());

      const res = await fetch("/api/drawing-revisions/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");

      toast({ title: "Drawing uploaded", description: `${drawingNumber} Rev ${revision} is now in STAGING.` });
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions"] });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" /> Upload Drawing Revision
          </DialogTitle>
          <DialogDescription>
            Upload a SolidWorks .slddrw file to begin the verification pipeline. The file will be placed in STAGING.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={(v) => { setProjectId(v); setDrawingControlId(""); }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.code}{p.name ? ` — ${p.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {projectId && drawingControls.length > 0 && (
              <div className="col-span-2">
                <Label>EPC Drawing Control (optional)</Label>
                <Select value={drawingControlId} onValueChange={setDrawingControlId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Link to EPC drawing control…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (no EPC link)</SelectItem>
                    {drawingControls.map((dc) => (
                      <SelectItem key={dc.id} value={String(dc.id)}>
                        {dc.dwgControlNumber} — {dc.drawingTitle ?? dc.drawingNumber ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Links this revision to an EPC drawing control record for compatibility.</p>
              </div>
            )}

            <div>
              <Label>Drawing Number *</Label>
              <Input className="mt-1" placeholder="e.g. TPEL-2627-ME-001" value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} />
            </div>
            <div>
              <Label>Revision *</Label>
              <Input className="mt-1" placeholder="e.g. A, B, 1" value={revision} onChange={(e) => setRevision(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Title</Label>
              <Input className="mt-1" placeholder="Drawing title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Item Code</Label>
              <Input className="mt-1" placeholder="e.g. ITEM-001" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
            </div>
            <div>
              <Label>Discipline</Label>
              <Input className="mt-1" placeholder="e.g. Mechanical" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} placeholder="Optional notes for this upload" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>File (.slddrw) *</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".slddrw"
                className="mt-1"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-gray-500 mt-1">{file.name} — {fmtBytes(file.size)}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={uploading}>
            {uploading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4 mr-2" /> Upload to STAGING</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Pipeline Detail Panel (right panel)
// ─────────────────────────────────────────────────────────────
function PipelinePanel({ revision }: { revision: DrawingRevision }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveDecision, setApproveDecision] = useState<"approved" | "rejected">("approved");
  const [approveComment, setApproveComment] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [showReleaseForm, setShowReleaseForm] = useState(false);

  const idx = stageIndex(revision.status);

  const { data: extraction, isLoading: loadingExtract } = useQuery<ExtractionData>({
    queryKey: ["/api/drawing-revisions", revision.id, "extraction"],
    enabled: idx >= 1,
    retry: false,
  });

  const { data: evaluation, isLoading: loadingEval } = useQuery<EvaluationData>({
    queryKey: ["/api/drawing-revisions", revision.id, "evaluation"],
    enabled: idx >= 2,
    retry: false,
  });

  const { data: agentReport, isLoading: loadingAgent } = useQuery<AgentReport>({
    queryKey: ["/api/drawing-revisions", revision.id, "agent-report"],
    enabled: idx >= 2,
    retry: false,
  });

  const { data: approval, isLoading: loadingApproval } = useQuery<ApprovalData>({
    queryKey: ["/api/drawing-revisions", revision.id, "approval"],
    enabled: idx >= 3,
    retry: false,
  });

  const { data: releaseRecord, isLoading: loadingRelease } = useQuery<ReleaseData>({
    queryKey: ["/api/drawing-revisions", revision.id, "release"],
    enabled: idx >= 4,
    retry: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions", revision.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions", revision.id, "extraction"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions", revision.id, "evaluation"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions", revision.id, "agent-report"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions", revision.id, "approval"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions", revision.id, "release"] });
  };

  const extractMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drawing-revisions/${revision.id}/extract`),
    onSuccess: () => { toast({ title: "Extraction complete" }); invalidate(); },
    onError: (e: any) => toast({ title: "Extraction failed", description: e.message, variant: "destructive" }),
  });

  const evaluateMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drawing-revisions/${revision.id}/evaluate`),
    onSuccess: () => { toast({ title: "Rule engine complete" }); invalidate(); },
    onError: (e: any) => toast({ title: "Evaluation failed", description: e.message, variant: "destructive" }),
  });

  const agentMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drawing-revisions/${revision.id}/agent-review`),
    onSuccess: () => { toast({ title: "Agent review complete" }); invalidate(); },
    onError: (e: any) => toast({ title: "Agent review failed", description: e.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/drawing-revisions/${revision.id}/approve`, {
        decision: approveDecision,
        comments: approveComment.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: approveDecision === "approved" ? "Drawing approved ✓" : "Drawing rejected" });
      setApproveOpen(false);
      setApproveComment("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  const releaseMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/drawing-revisions/${revision.id}/release`, {
        releaseNotes: releaseNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Drawing released to CONTROLLED ✓" });
      setShowReleaseForm(false);
      setReleaseNotes("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Release failed", description: e.message, variant: "destructive" }),
  });

  const canApprove = user?.role === "Superuser" || user?.role === "General Manager" || user?.role === "Senior Manager" || user?.role === "Manager";

  return (
    <div className="flex flex-col h-full">
      {/* Drawing header */}
      <div className="px-5 pt-4 pb-3 border-b bg-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-gray-900">{revision.drawingNumber}</span>
              <span className="text-xs font-mono font-semibold px-1.5 py-0.5 bg-gray-100 rounded border text-gray-700">
                Rev {revision.revision}
              </span>
              <StatusBadge status={revision.status} />
              <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 font-medium">
                {revision.storageZone}
              </span>
            </div>
            {revision.title && <p className="text-sm text-gray-600 mt-0.5">{revision.title}</p>}
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>Project: <span className="font-medium text-gray-700">{revision.projectCode ?? revision.projectId}</span></span>
              {revision.drawingControlId && (
                <span className="text-blue-600 font-medium">EPC-linked #{revision.drawingControlId}</span>
              )}
              {revision.discipline && <span>Discipline: <span className="font-medium text-gray-700">{revision.discipline}</span></span>}
            </div>
          </div>
        </div>

        {/* Pipeline progress tracker */}
        <PipelineTracker currentStatus={revision.status} />
      </div>

      {/* Stage cards */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">

          {/* ── Stage 1: Upload ── */}
          <StageCard title="Upload" icon={Upload} state="done" defaultOpen={idx === 0}>
            <div className="mt-3 space-y-0.5">
              <DetailRow label="Original filename" value={revision.originalFilename} />
              <DetailRow label="File size" value={fmtBytes(revision.fileSizeBytes)} />
              <DetailRow label="SHA-256 checksum" value={
                <span className="font-mono text-[10px] break-all">{revision.checksum}</span>
              } />
              <DetailRow label="Uploaded by" value={revision.uploadedBy} />
              <DetailRow label="Uploaded at" value={fmtDate(revision.uploadedAt)} />
              <DetailRow label="GCS path (STAGING)" value={
                <span className="font-mono text-[10px] break-all">{revision.gcsStagingPath}</span>
              } />
              {revision.uploaderNotes && <DetailRow label="Notes" value={revision.uploaderNotes} />}
            </div>
          </StageCard>

          {/* ── Stage 2: Extract ── */}
          <StageCard
            title="Extract"
            icon={Cpu}
            state={idx >= 1 ? "done" : idx === 0 ? "active" : "locked"}
            defaultOpen={idx === 0 || idx === 1}
          >
            <div className="mt-3">
              {idx === 0 && !extraction && (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600 mb-3">
                    Run the OLE extractor to pull metadata from the SolidWorks binary.
                  </p>
                  <Button
                    onClick={() => extractMut.mutate()}
                    disabled={extractMut.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {extractMut.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Extracting…</>
                    ) : (
                      <><Cpu className="h-4 w-4 mr-2" /> Run Extraction</>
                    )}
                  </Button>
                </div>
              )}
              {loadingExtract && <Skeleton className="h-20 w-full" />}
              {extraction && (
                <div className="space-y-0.5">
                  <DetailRow label="Drawn by" value={extraction.drawnBy} />
                  <DetailRow label="Checked by" value={extraction.checkedBy} />
                  <DetailRow label="Scale" value={extraction.scaleInfo} />
                  <DetailRow label="Sheet size" value={extraction.sheetSize} />
                  <DetailRow label="Drawing number (embedded)" value={extraction.drawingNumberExtracted} />
                  <DetailRow label="Revision (embedded)" value={extraction.revisionExtracted} />
                  <DetailRow label="Description line 1" value={extraction.descriptionLine1} />
                  <DetailRow label="Description line 2" value={extraction.descriptionLine2} />
                  <DetailRow label="Method" value={extraction.extractionMethod} />
                  <DetailRow label="Extracted at" value={fmtDate(extraction.extractedAt)} />
                </div>
              )}
            </div>
          </StageCard>

          {/* ── Stage 3: Evaluate ── */}
          <StageCard
            title="Evaluate"
            icon={FileCheck}
            state={idx >= 2 ? "done" : idx === 1 ? "active" : "locked"}
            defaultOpen={idx === 1 || idx === 2}
          >
            <div className="mt-3">
              {idx === 1 && !evaluation && (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600 mb-3">
                    Run the rule engine to validate the drawing against 13 automated checks.
                  </p>
                  <Button
                    onClick={() => evaluateMut.mutate()}
                    disabled={evaluateMut.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {evaluateMut.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Evaluating…</>
                    ) : (
                      <><FileCheck className="h-4 w-4 mr-2" /> Run Rule Engine</>
                    )}
                  </Button>
                </div>
              )}
              {loadingEval && <Skeleton className="h-32 w-full" />}
              {evaluation && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-600">Overall verdict:</span>
                    <span
                      className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded",
                        evaluation.overallVerdict === "PASS" && "bg-emerald-100 text-emerald-700",
                        evaluation.overallVerdict === "WARN" && "bg-amber-100 text-amber-700",
                        evaluation.overallVerdict === "FAIL" && "bg-red-100 text-red-700",
                      )}
                    >
                      {evaluation.overallVerdict}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">{fmtDate(evaluation.evaluatedAt)}</span>
                  </div>
                  <div className="rounded border divide-y text-xs overflow-hidden">
                    <div className="grid grid-cols-[auto,1fr,auto] gap-2 px-3 py-1.5 bg-gray-50 font-semibold text-gray-600">
                      <span>Rule</span><span>Name</span><span>Verdict</span>
                    </div>
                    {(evaluation.ruleResults ?? []).map((r, i) => (
                      <div key={i} className="grid grid-cols-[auto,1fr,auto] gap-2 px-3 py-1.5 items-center">
                        <span className="font-mono text-[10px] text-gray-500">{r.ruleCode}</span>
                        <div>
                          <div className="font-medium text-gray-800">{r.ruleName}</div>
                          {r.detail && <div className="text-gray-500">{r.detail}</div>}
                        </div>
                        <VerdictIcon verdict={r.verdict} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </StageCard>

          {/* ── Stage 4: Approve ── */}
          <StageCard
            title="Approve"
            icon={ShieldCheck}
            state={idx >= 3 ? "done" : idx === 2 ? "active" : "locked"}
            defaultOpen={idx === 2 || idx === 3}
          >
            <div className="mt-3 space-y-3">
              {/* Agent report */}
              {idx >= 2 && (
                <div>
                  {loadingAgent && <Skeleton className="h-16 w-full" />}
                  {!agentReport && !loadingAgent && idx === 2 && (
                    <div className="bg-blue-50 rounded border border-blue-200 p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-blue-800">AI Agent Review</p>
                        <p className="text-xs text-blue-600">Run the AI agent to get an independent assessment before approval.</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => agentMut.mutate()}
                        disabled={agentMut.isPending}
                        className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
                      >
                        {agentMut.isPending ? (
                          <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Running…</>
                        ) : (
                          <><Cpu className="h-3 w-3 mr-1.5" /> Run Agent</>
                        )}
                      </Button>
                    </div>
                  )}
                  {agentReport && (
                    <div
                      className={cn(
                        "rounded border p-3 text-xs",
                        agentReport.recommendation === "APPROVE"
                          ? "bg-emerald-50 border-emerald-200"
                          : agentReport.recommendation === "REJECT"
                          ? "bg-red-50 border-red-200"
                          : "bg-amber-50 border-amber-200",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-800">Agent Recommendation:</span>
                        <span
                          className={cn(
                            "font-bold",
                            agentReport.recommendation === "APPROVE" && "text-emerald-700",
                            agentReport.recommendation === "REJECT" && "text-red-700",
                            agentReport.recommendation === "REVIEW" && "text-amber-700",
                          )}
                        >
                          {agentReport.recommendation}
                        </span>
                        {agentReport.confidence != null && (
                          <span className="text-gray-500 ml-auto">
                            Confidence: {Math.round(agentReport.confidence * 100)}%
                          </span>
                        )}
                      </div>
                      {agentReport.summary && <p className="text-gray-700 leading-relaxed">{agentReport.summary}</p>}
                      {agentReport.flaggedIssues?.length > 0 && (
                        <div className="mt-1.5">
                          <span className="font-medium text-gray-600">Flagged issues:</span>
                          <ul className="list-disc ml-4 mt-0.5 space-y-0.5">
                            {agentReport.flaggedIssues.map((issue: any, i: number) => (
                              <li key={i} className="text-gray-600">{typeof issue === "string" ? issue : JSON.stringify(issue)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Approval form */}
              {idx === 2 && canApprove && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { setApproveDecision("approved"); setApproveOpen(true); }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => { setApproveDecision("rejected"); setApproveOpen(true); }}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              )}
              {idx === 2 && !canApprove && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Approval requires Manager or above role.
                </p>
              )}

              {/* Approval record */}
              {loadingApproval && <Skeleton className="h-16 w-full" />}
              {approval && (
                <div
                  className={cn(
                    "rounded border p-3 text-xs",
                    approval.decision === "approved" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200",
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    {approval.decision === "approved" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={approval.decision === "approved" ? "text-emerald-800" : "text-red-800"}>
                      {approval.decision === "approved" ? "Approved" : "Rejected"} by {approval.approvedBy}
                    </span>
                    <span className="text-gray-500 font-normal ml-auto">{fmtDate(approval.approvedAt)}</span>
                  </div>
                  {approval.comments && <p className="text-gray-700">{approval.comments}</p>}
                </div>
              )}
            </div>
          </StageCard>

          {/* ── Stage 5: Release ── */}
          <StageCard
            title="Release"
            icon={Lock}
            state={idx >= 4 ? "done" : idx === 3 ? "active" : "locked"}
            defaultOpen={idx >= 3}
          >
            <div className="mt-3 space-y-3">
              {idx === 3 && !showReleaseForm && (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600 mb-1">
                    Release this drawing to the CONTROLLED zone. This action is irreversible.
                  </p>
                  <p className="text-xs text-amber-700 mb-3">A PDF release certificate will be generated and the drawing will be stamped.</p>
                  {canApprove ? (
                    <Button
                      className="bg-emerald-700 hover:bg-emerald-800"
                      onClick={() => setShowReleaseForm(true)}
                    >
                      <Lock className="h-4 w-4 mr-2" /> Release to CONTROLLED
                    </Button>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      Release requires Manager or above role.
                    </p>
                  )}
                </div>
              )}
              {idx === 3 && showReleaseForm && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Release Notes (optional)</Label>
                    <Textarea
                      className="mt-1 text-xs"
                      rows={3}
                      placeholder="Add any notes for this release…"
                      value={releaseNotes}
                      onChange={(e) => setReleaseNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowReleaseForm(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      className="bg-emerald-700 hover:bg-emerald-800 flex-1"
                      onClick={() => releaseMut.mutate()}
                      disabled={releaseMut.isPending}
                    >
                      {releaseMut.isPending ? (
                        <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> Releasing…</>
                      ) : (
                        <><Lock className="h-3 w-3 mr-1.5" /> Confirm Release</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
              {loadingRelease && <Skeleton className="h-20 w-full" />}
              {releaseRecord && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-green-800 mb-2">
                    <BadgeCheck className="h-4 w-4" /> Released by {releaseRecord.releasedBy}
                    <span className="font-normal text-gray-500 ml-auto">{fmtDate(releaseRecord.releasedAt)}</span>
                  </div>
                  <DetailRow label="CONTROLLED path" value={
                    <span className="font-mono text-[10px] break-all">{releaseRecord.gcsControlledPath ?? "—"}</span>
                  } />
                  <DetailRow label="PDF Certificate" value={
                    releaseRecord.pdfCertificatePath ? (
                      <a
                        href={`/api/drawing-revisions/${revision.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline flex items-center gap-1"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "—"
                  } />
                  <DetailRow label="Release checksum" value={
                    <span className="font-mono text-[10px] break-all">{releaseRecord.immutableChecksum ?? "—"}</span>
                  } />
                  {releaseRecord.releaseNotes && <DetailRow label="Notes" value={releaseRecord.releaseNotes} />}
                </div>
              )}
            </div>
          </StageCard>
        </div>
      </ScrollArea>

      {/* Approval dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {approveDecision === "approved" ? "Approve Drawing?" : "Reject Drawing?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {approveDecision === "approved"
                ? `You are approving ${revision.drawingNumber} Rev ${revision.revision}. The drawing will be ready for release.`
                : `You are rejecting ${revision.drawingNumber} Rev ${revision.revision}. Please provide a reason.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Label className="text-xs">{approveDecision === "rejected" ? "Rejection reason *" : "Comments (optional)"}</Label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder={approveDecision === "rejected" ? "State the reason for rejection…" : "Any notes for this approval…"}
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={approveDecision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending || (approveDecision === "rejected" && !approveComment.trim())}
            >
              {approveMut.isPending ? "Processing…" : approveDecision === "approved" ? "Confirm Approval" : "Confirm Rejection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function DrawingVerificationPage() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: revisions = [], isLoading } = useQuery<DrawingRevision[]>({
    queryKey: ["/api/drawing-revisions"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const filtered = revisions.filter((r) => {
    if (filterProject !== "all" && String(r.projectId) !== filterProject) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.drawingNumber.toLowerCase().includes(q) &&
        !(r.title ?? "").toLowerCase().includes(q) &&
        !(r.discipline ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const selected = revisions.find((r) => r.id === selectedId) ?? null;

  const disciplineColors: Record<string, string> = {
    Mechanical: "bg-blue-100 text-blue-700",
    Civil: "bg-amber-100 text-amber-700",
    Electrical: "bg-yellow-100 text-yellow-700",
    Instrumentation: "bg-purple-100 text-purple-700",
    Piping: "bg-teal-100 text-teal-700",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Page header */}
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-blue-700" />
            <h1 className="text-xl font-bold text-gray-900">Drawing Verification</h1>
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
              STAGING → CONTROLLED
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Full verification pipeline: Upload → Extract → Evaluate → Approve → Release
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="bg-blue-700 hover:bg-blue-800">
          <Upload className="h-4 w-4 mr-2" /> Upload Drawing
        </Button>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel — revisions list */}
        <div className="w-[400px] shrink-0 border-r flex flex-col bg-gray-50/50">
          {/* Filters */}
          <div className="p-3 border-b bg-white space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search drawing number or title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="h-7 text-xs flex-1">
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
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="extracted">Extracted</SelectItem>
                  <SelectItem value="evaluated">Evaluated</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="released">Released</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Revisions list */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                <Layers className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">No drawing revisions found</p>
                <p className="text-xs text-gray-400 mt-1">Upload a .slddrw file to start the verification pipeline.</p>
                <Button size="sm" className="mt-4" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Drawing
                </Button>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm",
                      r.id === selectedId
                        ? "border-blue-400 bg-blue-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-gray-900 truncate">{r.drawingNumber}</span>
                          <span className="text-xs font-mono px-1 py-0.5 bg-gray-100 rounded text-gray-600">
                            Rev {r.revision}
                          </span>
                        </div>
                        {r.title && <p className="text-xs text-gray-600 truncate mt-0.5">{r.title}</p>}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <StatusBadge status={r.status} />
                          {r.projectCode && (
                            <span className="text-[10px] font-medium text-gray-500">{r.projectCode}</span>
                          )}
                          {r.discipline && (
                            <span
                              className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                disciplineColors[r.discipline] ?? "bg-gray-100 text-gray-600",
                              )}
                            >
                              {r.discipline}
                            </span>
                          )}
                          {r.drawingControlId && (
                            <span className="text-[10px] font-medium text-blue-600">EPC</span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 shrink-0 text-right">
                        {fmtDate(r.uploadedAt)}
                      </div>
                    </div>

                    {/* Mini pipeline progress */}
                    <div className="flex items-center gap-0.5 mt-2">
                      {STATUS_ORDER.map((s, i) => (
                        <div
                          key={s}
                          className={cn(
                            "h-1 flex-1 rounded-full",
                            i <= stageIndex(r.status) ? "bg-emerald-500" : "bg-gray-200",
                          )}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer stats */}
          <div className="border-t bg-white px-3 py-2 flex items-center gap-4 text-xs text-gray-500">
            <span>{filtered.length} revision{filtered.length !== 1 ? "s" : ""}</span>
            <Separator orientation="vertical" className="h-3" />
            <span>{revisions.filter((r) => r.status === "released").length} released</span>
            <Separator orientation="vertical" className="h-3" />
            <span>{revisions.filter((r) => r.status === "uploaded" || r.status === "extracted" || r.status === "evaluated").length} in pipeline</span>
          </div>
        </div>

        {/* Right panel — pipeline detail */}
        <div className="flex-1 min-w-0 bg-white">
          {selected ? (
            <PipelinePanel key={selected.id} revision={selected} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="h-16 w-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
                <BadgeCheck className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700">Select a drawing revision</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm">
                Click any revision on the left to view its full verification pipeline — Upload, Extract, Evaluate, Approve, and Release.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-400">
                {PIPELINE_STEPS.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="px-2 py-1 bg-gray-100 rounded border text-gray-500">{s}</span>
                    {i < PIPELINE_STEPS.length - 1 && <ArrowRight className="h-3 w-3" />}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => {}}
      />
    </div>
  );
}

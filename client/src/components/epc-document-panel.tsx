import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Upload, Download, History, Trash2, RotateCcw,
  Loader2, Shield, AlertTriangle,
  Paperclip, FileSearch, ChevronLeft, ChevronRight, ChevronDown,
  CheckCircle2, XCircle, ExternalLink, ShieldCheck,
} from "lucide-react";
import { getLabelOptions, getDocTypeLabelFamily } from "@shared/gcs-label-vocabulary";

const UPLOAD_ROLES = ["Senior Executive", "Manager", "Senior Manager", "General Manager", "Superuser"];
const WITHDRAW_RELEASED_ROLES = ["Senior Manager", "General Manager", "Superuser"];
const ACCESS_LOG_ROLES = ["General Manager", "Superuser"];
const REVISION_CONTROLLED_TYPES = new Set(["DWG", "BOM"]);

function getEpcLabelOptions(docType: string): Array<{ value: string; label: string }> {
  return getLabelOptions(getDocTypeLabelFamily(docType.toUpperCase()));
}

type EpcDocumentPanelProps = {
  projectId: number;
  docType: string;
  parentEntityId: number;
  documentNumber?: string;
  parentStatus?: string;
  userRole: string;
  compact?: boolean;
  gcsPathPreview?: string;
};

type Attachment = {
  id: number;
  label: string;
  seq: number;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  gcsPath?: string;
  status: string;
  uploadedAt: string;
  uploadedBy: string;
};

type RevisionGroup = {
  revisionCode: string;
  isCurrent: boolean;
  status: string;
  attachments: Attachment[];
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-700 border-green-300",
    withdrawn: "bg-red-50 text-red-600 border-red-300",
    superseded: "bg-orange-50 text-orange-600 border-orange-300",
  };
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${styles[status] || "bg-gray-50 text-gray-600 border-gray-300"}`}>
      {status}
    </Badge>
  );
}

function getMimeIcon(mimeType: string) {
  if (mimeType?.includes("pdf")) return "📄";
  if (mimeType?.includes("image")) return "🖼️";
  if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) return "📊";
  if (mimeType?.includes("dwg") || mimeType?.includes("autocad")) return "📐";
  return "📎";
}

export default function EpcDocumentPanel({
  projectId,
  docType,
  parentEntityId,
  documentNumber,
  parentStatus,
  userRole,
  compact = false,
  gcsPathPreview,
}: EpcDocumentPanelProps) {
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [withdrawDialog, setWithdrawDialog] = useState<{ open: boolean; attachmentId: number; label: string }>({ open: false, attachmentId: 0, label: "" });
  const [withdrawReason, setWithdrawReason] = useState("");
  const [downloadContext, setDownloadContext] = useState<string>("general");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [accessLogOpen, setAccessLogOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [accessLogActionFilter, setAccessLogActionFilter] = useState<string>("all");
  const [accessLogPage, setAccessLogPage] = useState(1);

  // DWG 2-step verification state
  const [dwgVerifyStep, setDwgVerifyStep] = useState<"pick" | "result">("pick");
  const [dwgVerificationResult, setDwgVerificationResult] = useState<any>(null);
  const [dwgVerificationId, setDwgVerificationId] = useState<number | null>(null);
  const [dwgGateError, setDwgGateError] = useState<string | null>(null);

  const isRevControlled = REVISION_CONTROLLED_TYPES.has(docType.toUpperCase());
  const canUpload = UPLOAD_ROLES.includes(userRole);
  const canWithdrawReleased = WITHDRAW_RELEASED_ROLES.includes(userRole);
  const canViewAccessLog = ACCESS_LOG_ROLES.includes(userRole);
  const isParentReleased = ["released", "approved", "completed"].includes(parentStatus || "");
  const canWithdraw = isParentReleased ? canWithdrawReleased : canUpload;
  const isPhantomRecord = ["pending_upload", "file_not_available"].includes(parentStatus || "");

  const queryKey = ["/api/projects", projectId, "epc-documents", docType, parentEntityId, "attachments"];

  const { data: attachmentData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/epc-documents/${docType}/${parentEntityId}/attachments`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to load attachments");
      }
      return res.json();
    },
    enabled: !!projectId && !!parentEntityId,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "epc-documents", documentNumber, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/epc-documents/${documentNumber}/history`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: historyDialogOpen && !!documentNumber,
  });

  const { data: accessLogData, isLoading: accessLogLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "epc-documents", documentNumber, "access-log", accessLogActionFilter, accessLogPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accessLogActionFilter && accessLogActionFilter !== "all") params.set("action", accessLogActionFilter);
      params.set("page", String(accessLogPage));
      params.set("limit", "50");
      const res = await fetch(`/api/projects/${projectId}/epc-documents/${documentNumber}/access-log?${params}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 403) return { accessLog: [], totalEntries: 0, totalPages: 0, page: 1 };
        throw new Error("Failed to load access log");
      }
      return res.json();
    },
    enabled: accessLogOpen && !!documentNumber && canViewAccessLog,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(`/api/projects/${projectId}/epc-documents/${docType}/${parentEntityId}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "File uploaded", description: data.warning || `Attachment added successfully` });
      queryClient.invalidateQueries({ queryKey });
      setUploadDialogOpen(false);
      setUploadLabel("");
      setUploadFile(null);
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const dwgVerifyMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("pdf", file);
      const res = await fetch(`/api/epc-drawing-controls/${parentEntityId}/verify-pdf`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || "Verification failed"), { data });
      return data;
    },
    onSuccess: (data) => {
      setDwgVerificationResult(data);
      setDwgVerificationId(data.verificationId);
      setDwgGateError(null);
      setDwgVerifyStep("result");
    },
    onError: (err: any) => {
      const data = err?.data;
      if (data?.gateError) {
        setDwgGateError(data.gateError.message);
        setDwgVerifyStep("result");
        setDwgVerificationResult(null);
      } else {
        toast({ title: "Verification failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async ({ attachmentId, reason }: { attachmentId: number; reason: string }) => {
      return apiRequest("POST", `/api/projects/${projectId}/epc-documents/attachments/${attachmentId}/withdraw`, { reason });
    },
    onSuccess: () => {
      toast({ title: "Attachment withdrawn" });
      queryClient.invalidateQueries({ queryKey });
      setWithdrawDialog({ open: false, attachmentId: 0, label: "" });
      setWithdrawReason("");
    },
    onError: (err: any) => {
      toast({ title: "Withdraw failed", description: err.message, variant: "destructive" });
    },
  });

  const reinstateMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      return apiRequest("POST", `/api/projects/${projectId}/epc-documents/attachments/${attachmentId}/reinstate`, {});
    },
    onSuccess: () => {
      toast({ title: "Attachment reinstated" });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: any) => {
      toast({ title: "Reinstate failed", description: err.message, variant: "destructive" });
    },
  });

  function handleUpload(verificationIdToAccept?: number) {
    const dt = docType.toUpperCase();
    const label = REVISION_CONTROLLED_TYPES.has(dt)
      ? (dt === "BOM" ? "Bill of Materials" : "Drawing PDF")
      : uploadLabel.trim();
    if (!uploadFile || !label) return;
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("attachment_label", label);
    uploadMutation.mutate(formData, {
      onSuccess: async (data) => {
        if (verificationIdToAccept) {
          try {
            await fetch(`/api/epc-drawing-verifications/${verificationIdToAccept}/accept`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ attachmentId: data?.attachmentId ?? null }),
            });
          } catch { /* non-critical */ }
        }
        setDwgVerifyStep("pick");
        setDwgVerificationResult(null);
        setDwgVerificationId(null);
        setDwgGateError(null);
      },
    });
  }

  function resetDwgDialog() {
    setDwgVerifyStep("pick");
    setDwgVerificationResult(null);
    setDwgVerificationId(null);
    setDwgGateError(null);
    setUploadFile(null);
    setUploadLabel("");
  }

  async function handleDownload(attachmentId?: number, context?: string) {
    try {
      let url: string;
      if (attachmentId) {
        url = `/api/projects/${projectId}/epc-documents/attachments/${attachmentId}/download`;
      } else if (documentNumber) {
        const ctx = context || downloadContext;
        url = `/api/projects/${projectId}/epc-documents/${documentNumber}/download?context=${ctx}`;
      } else {
        return;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(err.error || "Download failed");
      }
      const data = await res.json();
      if (data.attachment?.downloadUrl) {
        window.open(data.attachment.downloadUrl, "_blank");
        if (!data.attachment.isCurrentRevision) {
          toast({
            title: "Older revision downloaded",
            description: `You downloaded Rev ${data.attachment.revisionCode}. Current revision is ${data.attachment.currentRevisionCode || "unknown"}.`,
            variant: "destructive",
          });
        }
      }
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }

  const revisions: RevisionGroup[] = attachmentData?.revisions || [];
  const flatAttachments: Attachment[] = attachmentData?.attachments || [];
  const hasAnyAttachments = isRevControlled
    ? revisions.some((r) => r.attachments.length > 0)
    : flatAttachments.length > 0;
  const totalCount = isRevControlled
    ? revisions.reduce((sum, r) => sum + r.attachments.length, 0)
    : flatAttachments.length;
  const activeCount = isRevControlled
    ? revisions.reduce((sum, r) => sum + r.attachments.filter((a) => a.status === "active").length, 0)
    : flatAttachments.filter((a) => a.status === "active").length;

  function renderAttachmentRow(att: Attachment, showRevBadge?: string, isCurrentRevision?: boolean) {
    const isActive = att.status === "active";
    const rowClass = isCurrentRevision
      ? "border-l-2 border-l-emerald-400 bg-emerald-50/40"
      : isActive ? "" : "opacity-50";
    return (
      <TableRow key={att.id} className={rowClass}>
        <TableCell className="text-[10px] py-1.5">
          <div className="flex items-center gap-1.5">
            <span>{getMimeIcon(att.mimeType)}</span>
            <div className="min-w-0">
              <div className="font-medium truncate max-w-[340px]">{att.label}</div>
              <div className="text-[9px] text-muted-foreground truncate max-w-[340px]">{att.fileName}</div>
              {att.gcsPath && (
                <div className="text-[8px] text-blue-600/70 font-mono break-all whitespace-normal leading-tight mt-0.5">{att.gcsPath}</div>
              )}
            </div>
          </div>
        </TableCell>
        {showRevBadge !== undefined && (
          <TableCell className="text-center py-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <Badge
                variant="outline"
                className={`text-[8px] px-1 py-0 ${isCurrentRevision ? "bg-emerald-50 text-emerald-700 border-emerald-300" : ""}`}
              >
                {showRevBadge}
              </Badge>
              {isCurrentRevision && (
                <span className="text-[7px] text-emerald-600 font-semibold tracking-wide">current</span>
              )}
            </div>
          </TableCell>
        )}
        <TableCell className="text-[9px] text-center py-1.5">{formatFileSize(att.fileSizeBytes)}</TableCell>
        <TableCell className="text-center py-1.5">{getStatusBadge(att.status)}</TableCell>
        <TableCell className="text-[9px] text-muted-foreground py-1.5">
          <div>{att.uploadedBy}</div>
          <div className="text-[8px]">{att.uploadedAt ? new Date(att.uploadedAt).toLocaleDateString() : ""}</div>
        </TableCell>
        <TableCell className="py-1.5">
          <div className="flex items-center gap-0.5">
            {isActive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(att.id)}>
                    <Download className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Download</TooltipContent>
              </Tooltip>
            )}
            {isActive && canWithdraw && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    onClick={() => setWithdrawDialog({ open: true, attachmentId: att.id, label: att.label })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Withdraw</TooltipContent>
              </Tooltip>
            )}
            {att.status === "withdrawn" && canWithdrawReleased && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                    onClick={() => reinstateMutation.mutate(att.id)}
                    disabled={reinstateMutation.isPending}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Reinstate</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  function renderAccessLogDialog() {
    const actionStyles: Record<string, string> = {
      upload: "bg-blue-50 text-blue-700 border-blue-300",
      download: "bg-green-50 text-green-700 border-green-300",
      stream: "bg-teal-50 text-teal-700 border-teal-300",
      withdraw: "bg-red-50 text-red-600 border-red-300",
      reinstate: "bg-amber-50 text-amber-700 border-amber-300",
    };
    const logs = accessLogData?.accessLog || [];
    const totalPages = accessLogData?.totalPages || 1;
    const totalEntries = accessLogData?.totalEntries || 0;

    return (
      <Dialog open={accessLogOpen} onOpenChange={(open) => { setAccessLogOpen(open); if (!open) { setAccessLogActionFilter("all"); setAccessLogPage(1); } }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4" />
              Document Access Log — {documentNumber}
            </DialogTitle>
            <DialogDescription>
              {docType} • {totalEntries} record{totalEntries !== 1 ? "s" : ""} • GM/Superuser audit view
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 py-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Action:</span>
              <Select value={accessLogActionFilter} onValueChange={(v) => { setAccessLogActionFilter(v); setAccessLogPage(1); }}>
                <SelectTrigger className="h-7 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Actions</SelectItem>
                  <SelectItem value="upload" className="text-xs">Upload</SelectItem>
                  <SelectItem value="download" className="text-xs">Download</SelectItem>
                  <SelectItem value="stream" className="text-xs">Stream</SelectItem>
                  <SelectItem value="withdraw" className="text-xs">Withdraw</SelectItem>
                  <SelectItem value="reinstate" className="text-xs">Reinstate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1 ml-auto">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={accessLogPage <= 1} onClick={() => setAccessLogPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground px-1">
                  {accessLogPage} / {totalPages}
                </span>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={accessLogPage >= totalPages} onClick={() => setAccessLogPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {accessLogLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
            </div>
          ) : logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Timestamp</TableHead>
                  <TableHead className="text-[10px]">User</TableHead>
                  <TableHead className="text-[10px]">Role</TableHead>
                  <TableHead className="text-[10px] text-center">Action</TableHead>
                  <TableHead className="text-[10px]">Rev</TableHead>
                  <TableHead className="text-[10px]">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry: any) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-[10px] py-1.5 whitespace-nowrap">
                      {entry.accessedAt ? new Date(entry.accessedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] py-1.5 font-medium">{entry.accessedBy || "—"}</TableCell>
                    <TableCell className="text-[10px] py-1.5 text-muted-foreground">{entry.accessedByRole || "—"}</TableCell>
                    <TableCell className="text-center py-1.5">
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${actionStyles[entry.action] || "bg-gray-50 text-gray-600 border-gray-300"}`}>
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] py-1.5 font-mono">{entry.revisionCode || "—"}</TableCell>
                    <TableCell className="text-[10px] py-1.5 text-muted-foreground font-mono">{entry.ipAddress || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No access records found.</p>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Paperclip className="h-3 w-3 text-muted-foreground" />
        <span className="text-[9px] text-muted-foreground">
          {isLoading ? "..." : activeCount > 0 ? `${activeCount} file${activeCount !== 1 ? "s" : ""}` : "No files"}
        </span>
        {canUpload && (
          <Button size="sm" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-2.5 w-2.5 mr-0.5" /> Add
          </Button>
        )}
        {hasAnyAttachments && documentNumber && (
          <Button size="sm" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => setHistoryDialogOpen(true)}>
            <History className="h-2.5 w-2.5 mr-0.5" /> History
          </Button>
        )}
        {canViewAccessLog && documentNumber && (
          <Button size="sm" variant="ghost" className="h-5 px-1 text-[8px]" onClick={() => setAccessLogOpen(true)}>
            <FileSearch className="h-2.5 w-2.5 mr-0.5" /> Audit
          </Button>
        )}

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document Attachment</DialogTitle>
              <DialogDescription>
                {docType} — {documentNumber || `Entity #${parentEntityId}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {gcsPathPreview && (
                <div className="bg-slate-50 border rounded px-3 py-2">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GCS Upload Path</label>
                  <div className="font-mono text-[11px] text-slate-700 break-all mt-0.5">{gcsPathPreview}</div>
                </div>
              )}
              {!REVISION_CONTROLLED_TYPES.has(docType.toUpperCase()) && (
                <div>
                  <label className="text-sm font-medium block mb-1">Attachment Label <span className="text-red-500">*</span></label>
                  <Select value={uploadLabel} onValueChange={setUploadLabel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select label..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getEpcLabelOptions(docType).map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Select from the approved label vocabulary for this document type.</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium block mb-1">File {docType === "DWG" && <span className="text-muted-foreground font-normal">(PDF only)</span>}</label>
                <Input type="file" accept={docType === "DWG" ? ".pdf,application/pdf" : undefined} onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                {uploadFile && <p className="text-xs text-muted-foreground mt-1">{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploadMutation.isPending || !uploadFile || !(docType === "DWG" || uploadLabel.trim())}>
                {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {renderHistoryDialog()}
        {canViewAccessLog && renderAccessLogDialog()}
      </div>
    );
  }

  function renderHistoryDialog() {
    return (
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document History — {documentNumber}</DialogTitle>
            <DialogDescription>
              {historyData?.docType} • {historyData?.totalAttachments || 0} total attachment(s)
              {historyData?.isRevisionControlled && " • Revision controlled"}
            </DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
            </div>
          ) : historyData?.history?.length > 0 ? (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    {historyData.isRevisionControlled && <TableHead className="text-[10px]">Rev</TableHead>}
                    <TableHead className="text-[10px]">Label</TableHead>
                    <TableHead className="text-[10px]">File</TableHead>
                    <TableHead className="text-[10px] text-center">Status</TableHead>
                    <TableHead className="text-[10px]">Uploaded</TableHead>
                    <TableHead className="text-[10px]">Changed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.history.map((h: any) => (
                    <TableRow key={h.id} className={h.status !== "active" ? "opacity-60" : ""}>
                      {historyData.isRevisionControlled && (
                        <TableCell className="text-[10px] py-1.5">
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-medium">{h.revisionCode}</span>
                            {h.isCurrent && (
                              <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-green-50 text-green-600 border-green-200">current</Badge>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-[10px] py-1.5 font-medium">{h.label}</TableCell>
                      <TableCell className="text-[10px] py-1.5">
                        <div className="break-all whitespace-normal">{h.fileName}</div>
                        <div className="text-[8px] text-muted-foreground">{formatFileSize(h.fileSizeBytes)}</div>
                      </TableCell>
                      <TableCell className="text-center py-1.5">{getStatusBadge(h.status)}</TableCell>
                      <TableCell className="text-[9px] py-1.5">
                        <div>{h.uploadedBy}</div>
                        <div className="text-[8px] text-muted-foreground">
                          {h.uploadedAt ? new Date(h.uploadedAt).toLocaleString() : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-[9px] py-1.5">
                        {h.status === "withdrawn" && (
                          <div className="text-red-600">
                            <div>Withdrawn by {h.withdrawnBy}</div>
                            {h.withdrawReason && <div className="text-[8px] italic">"{h.withdrawReason}"</div>}
                            <div className="text-[8px]">{h.withdrawnAt ? new Date(h.withdrawnAt).toLocaleString() : ""}</div>
                          </div>
                        )}
                        {h.status === "superseded" && (
                          <div className="text-orange-600">
                            <div>Superseded by {h.supersededBy || "system"}</div>
                            <div className="text-[8px]">{h.supersededAt ? new Date(h.supersededAt).toLocaleString() : ""}</div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No history found.</p>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <TooltipProvider>
    <Card className="shadow-sm">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[11px] font-medium flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            <span>{docType} Attachments</span>
            {isRevControlled && attachmentData?.currentRevision && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-green-50 text-green-600 border-green-200">
                Rev {attachmentData.currentRevision}
              </Badge>
            )}
            {totalCount > 0 && (
              <Badge variant="outline" className="text-[8px] px-1 py-0">
                {activeCount}/{totalCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasAnyAttachments && documentNumber && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleDownload()}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Download latest attachment
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setHistoryDialogOpen(true)}>
                      <History className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Full history</TooltipContent>
                </Tooltip>
              </>
            )}
            {canViewAccessLog && documentNumber && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setAccessLogOpen(true)}>
                    <FileSearch className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Access Log</TooltipContent>
              </Tooltip>
            )}
            {canUpload && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setUploadDialogOpen(true)}>
                    <Upload className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Upload attachment</TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        {isPhantomRecord && !hasAnyAttachments ? (
          <div className="py-2 px-2 text-center rounded bg-amber-50 border border-amber-200">
            <p className="text-[10px] text-amber-700 font-medium">
              {parentStatus === "pending_upload"
                ? "⏳ This record was migrated without a source file. Upload the drawing to activate it."
                : "This record references a file that was never uploaded and is no longer expected."}
            </p>
          </div>
        ) : isLoading ? (
          <div className="py-3 text-center">
            <Loader2 className="h-4 w-4 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : !hasAnyAttachments ? (
          <p className="text-[10px] text-muted-foreground text-center py-2 italic">No attachments yet</p>
        ) : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[9px] font-medium">File</TableHead>
                  {isRevControlled && <TableHead className="text-[9px] font-medium text-center w-[50px]">Rev</TableHead>}
                  <TableHead className="text-[9px] font-medium text-center w-[55px]">Size</TableHead>
                  <TableHead className="text-[9px] font-medium text-center w-[65px]">Status</TableHead>
                  <TableHead className="text-[9px] font-medium w-[80px]">By</TableHead>
                  <TableHead className="text-[9px] font-medium w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRevControlled ? (() => {
                  const currentRevGroup = revisions.find(r => r.isCurrent);
                  const historyGroups = revisions.filter(r => !r.isCurrent);
                  const historyCount = historyGroups.reduce((n, r) => n + r.attachments.length, 0);
                  return (
                    <>
                      {currentRevGroup?.attachments.map(att =>
                        renderAttachmentRow(att, currentRevGroup.revisionCode, true)
                      )}
                      {historyGroups.length > 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-0 px-0 border-t border-dashed border-muted-foreground/20 bg-muted/20"
                          >
                            <button
                              onClick={() => setShowHistory(h => !h)}
                              className="flex items-center gap-1.5 w-full px-3 py-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showHistory
                                ? <ChevronDown className="h-3 w-3 shrink-0" />
                                : <ChevronRight className="h-3 w-3 shrink-0" />
                              }
                              <span>
                                {showHistory ? "Hide" : "Show"} revision history
                                &nbsp;·&nbsp;
                                {historyGroups.length} previous revision{historyGroups.length > 1 ? "s" : ""}
                                {historyCount > historyGroups.length && ` (${historyCount} files)`}
                              </span>
                            </button>
                          </TableCell>
                        </TableRow>
                      )}
                      {showHistory && historyGroups.map(rev =>
                        rev.attachments.map(att => renderAttachmentRow(att, rev.revisionCode, false))
                      )}
                    </>
                  );
                })() : (
                  flatAttachments.map((att) => renderAttachmentRow(att))
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </CardContent>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document Attachment</DialogTitle>
            <DialogDescription>
              {docType} — {documentNumber || `Entity #${parentEntityId}`}
              {isRevControlled && attachmentData?.currentRevision && ` • Rev ${attachmentData.currentRevision}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!REVISION_CONTROLLED_TYPES.has(docType.toUpperCase()) && (
              <div>
                <label className="text-sm font-medium block mb-1">Attachment Label <span className="text-red-500">*</span></label>
                <Select value={uploadLabel} onValueChange={setUploadLabel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select label..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getEpcLabelOptions(docType).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Select from the approved label vocabulary for this document type.</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium block mb-1">File {docType === "DWG" && <span className="text-muted-foreground font-normal">(PDF only)</span>}</label>
              <Input type="file" accept={docType === "DWG" ? ".pdf,application/pdf" : undefined} onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              {uploadFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  {uploadFile.name} ({formatFileSize(uploadFile.size)})
                </p>
              )}
            </div>
            {!canUpload && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
                <Shield className="h-4 w-4" />
                Your role ({userRole}) does not have upload permission.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setUploadLabel(""); setUploadFile(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !uploadFile || !(REVISION_CONTROLLED_TYPES.has(docType.toUpperCase()) || uploadLabel) || !canUpload}
            >
              {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={withdrawDialog.open} onOpenChange={(open) => { if (!open) { setWithdrawDialog({ open: false, attachmentId: 0, label: "" }); setWithdrawReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Attachment</DialogTitle>
            <DialogDescription>
              Withdrawing "{withdrawDialog.label}" — this will make it inaccessible by default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isParentReleased && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
                <AlertTriangle className="h-4 w-4" />
                This document's parent entity is released. Withdrawal reason is mandatory.
              </div>
            )}
            <div>
              <label className="text-sm font-medium block mb-1">Reason {isParentReleased ? "(required)" : "(optional)"}</label>
              <Textarea
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="Why is this attachment being withdrawn?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWithdrawDialog({ open: false, attachmentId: 0, label: "" }); setWithdrawReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => withdrawMutation.mutate({ attachmentId: withdrawDialog.attachmentId, reason: withdrawReason })}
              disabled={withdrawMutation.isPending || (isParentReleased && withdrawReason.trim().length < 5)}
            >
              {withdrawMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {renderHistoryDialog()}
      {canViewAccessLog && renderAccessLogDialog()}
    </Card>
    </TooltipProvider>
  );
}

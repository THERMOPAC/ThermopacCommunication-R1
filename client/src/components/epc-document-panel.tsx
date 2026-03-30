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
  Paperclip,
} from "lucide-react";

const UPLOAD_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const WITHDRAW_RELEASED_ROLES = ["Senior Manager", "General Manager", "Superuser"];
const ACCESS_LOG_ROLES = ["General Manager", "Superuser"];
const REVISION_CONTROLLED_TYPES = new Set(["DWG", "BOM"]);

type EpcDocumentPanelProps = {
  projectId: number;
  docType: string;
  parentEntityId: number;
  documentNumber?: string;
  parentStatus?: string;
  userRole: string;
  compact?: boolean;
};

type Attachment = {
  id: number;
  label: string;
  seq: number;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
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
}: EpcDocumentPanelProps) {
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [withdrawDialog, setWithdrawDialog] = useState<{ open: boolean; attachmentId: number; label: string }>({ open: false, attachmentId: 0, label: "" });
  const [withdrawReason, setWithdrawReason] = useState("");
  const [downloadContext, setDownloadContext] = useState<string>("general");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const isRevControlled = REVISION_CONTROLLED_TYPES.has(docType.toUpperCase());
  const canUpload = UPLOAD_ROLES.includes(userRole);
  const canWithdrawReleased = WITHDRAW_RELEASED_ROLES.includes(userRole);
  const canViewAccessLog = ACCESS_LOG_ROLES.includes(userRole);
  const isParentReleased = ["released", "approved", "completed"].includes(parentStatus || "");
  const canWithdraw = isParentReleased ? canWithdrawReleased : canUpload;

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

  function handleUpload() {
    if (!uploadFile || !uploadLabel.trim()) return;
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("attachment_label", uploadLabel.trim());
    uploadMutation.mutate(formData);
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

  function renderAttachmentRow(att: Attachment, showRevBadge?: string) {
    const isActive = att.status === "active";
    return (
      <TableRow key={att.id} className={!isActive ? "opacity-60" : ""}>
        <TableCell className="text-[10px] py-1.5">
          <div className="flex items-center gap-1.5">
            <span>{getMimeIcon(att.mimeType)}</span>
            <div>
              <div className="font-medium truncate max-w-[180px]">{att.label}</div>
              <div className="text-[9px] text-muted-foreground truncate max-w-[180px]">{att.fileName}</div>
            </div>
          </div>
        </TableCell>
        {showRevBadge !== undefined && (
          <TableCell className="text-center py-1.5">
            <Badge variant="outline" className="text-[8px] px-1 py-0">{showRevBadge}</Badge>
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

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document Attachment</DialogTitle>
              <DialogDescription>
                {docType} — {documentNumber || `Entity #${parentEntityId}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium block mb-1">Label</label>
                <Input value={uploadLabel} onChange={(e) => setUploadLabel(e.target.value)} placeholder="e.g. GA Drawing, Material Spec..." />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">File</label>
                <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                {uploadFile && <p className="text-xs text-muted-foreground mt-1">{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploadMutation.isPending || !uploadFile || !uploadLabel.trim()}>
                {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {renderHistoryDialog()}
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
                        <div className="truncate max-w-[160px]">{h.fileName}</div>
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
            {isRevControlled && documentNumber && (
              <Select value={downloadContext} onValueChange={setDownloadContext}>
                <SelectTrigger className="h-5 text-[8px] w-[90px] px-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general" className="text-[10px]">General</SelectItem>
                  <SelectItem value="procurement" className="text-[10px]">Procurement</SelectItem>
                  <SelectItem value="manufacturing" className="text-[10px]">Manufacturing</SelectItem>
                  <SelectItem value="inspection" className="text-[10px]">Inspection</SelectItem>
                </SelectContent>
              </Select>
            )}
            {hasAnyAttachments && documentNumber && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleDownload()}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Download ({downloadContext} context)
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
        {isLoading ? (
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
                {isRevControlled ? (
                  revisions.map((rev) => (
                    rev.attachments.map((att) => renderAttachmentRow(att, rev.revisionCode))
                  ))
                ) : (
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
            <div>
              <label className="text-sm font-medium block mb-1">Attachment Label</label>
              <Input
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="e.g. GA Drawing, Material Specification, Weld Map..."
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">File</label>
              <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
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
              disabled={uploadMutation.isPending || !uploadFile || !uploadLabel.trim() || !canUpload}
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
    </Card>
  );
}

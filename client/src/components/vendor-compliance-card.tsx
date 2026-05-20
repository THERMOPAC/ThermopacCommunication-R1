import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Download,
  Eye,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  History,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtDate } from "@/lib/date-format";

// ── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { key: "GST_CERTIFICATE",        label: "GST Certificate",                mandatory: true  },
  { key: "PAN_CARD",               label: "PAN Card",                       mandatory: true  },
  { key: "MSME_CERTIFICATE",       label: "MSME Certificate",               mandatory: false },
  { key: "CANCELLED_CHEQUE",       label: "Cancelled Cheque / Bank Proof",  mandatory: true  },
  { key: "VENDOR_REGISTRATION_FORM", label: "Vendor Registration Form",     mandatory: false },
  { key: "CONTACT_DETAILS_SHEET",  label: "Contact Details Sheet",          mandatory: false },
  { key: "ADDRESS_PROOF",          label: "Address Proof",                  mandatory: false },
] as const;

type DocType = typeof DOC_TYPES[number]["key"];

interface ComplianceDoc {
  id: number;
  vendor_id: number;
  bp_code: string;
  doc_type: string;
  revision_number: number;
  file_name: string;
  gcs_path: string;
  content_type: string;
  size_bytes: number;
  status: "uploaded" | "expired" | "pending_approval";
  expiry_date: string | null;
  is_active: boolean;
  uploaded_by: number | null;
  notes: string | null;
  created_at: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function getEffectiveStatus(doc: ComplianceDoc | undefined): "missing" | "uploaded" | "expired" | "pending_approval" {
  if (!doc) return "missing";
  if (doc.status === "expired") return "expired";
  if (doc.expiry_date) {
    const expiry = new Date(doc.expiry_date);
    if (expiry < new Date()) return "expired";
  }
  return doc.status as any;
}

function StatusBadge({ status }: { status: ReturnType<typeof getEffectiveStatus> }) {
  if (status === "missing")
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] font-semibold">Missing</Badge>;
  if (status === "expired")
    return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] font-semibold">Expired</Badge>;
  if (status === "pending_approval")
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] font-semibold">Pending Approval</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] font-semibold">Uploaded</Badge>;
}

function StatusIcon({ status }: { status: ReturnType<typeof getEffectiveStatus> }) {
  if (status === "missing")    return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (status === "expired")    return <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />;
  if (status === "pending_approval") return <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />;
}

// ── Upload Dialog ─────────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onClose,
  vendorId,
  docType,
  docLabel,
  existing,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: number;
  docType: DocType;
  docLabel: string;
  existing: ComplianceDoc | undefined;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleSubmit = async () => {
    if (!file) { toast({ title: "Select a file first", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (expiryDate) fd.append("expiryDate", expiryDate);
      if (notes) fd.append("notes", notes);

      const res = await fetch(`/api/vendor-compliance/${vendorId}/${docType}`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      toast({ title: "Document uploaded", description: `${docLabel} saved successfully.` });
      onSuccess();
      onClose();
      setFile(null); setExpiryDate(""); setNotes("");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{existing ? "Replace" : "Upload"} — {docLabel}</DialogTitle>
          <DialogDescription>
            {existing
              ? `Current: ${existing.file_name} (rev-${String(existing.revision_number).padStart(2, "0")}). Uploading creates a new revision.`
              : "Upload the document file. Accepted: PDF, JPG, PNG, DOCX."}
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${dragging ? "border-violet-400 bg-violet-50" : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/40"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-violet-500" />
              <p className="text-sm font-medium text-violet-700">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              <Button type="button" variant="ghost" size="sm" className="text-xs"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-600">Drop file here or click to browse</p>
              <p className="text-xs text-muted-foreground">PDF, JPG, PNG, DOCX — max 20 MB</p>
            </div>
          )}
        </div>

        {/* Expiry date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Expiry Date (optional)</label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
            <Input
              placeholder="Any notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={uploading || !file}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── History Dialog ─────────────────────────────────────────────────────────────

function HistoryDialog({
  open,
  onClose,
  vendorId,
  docType,
  docLabel,
}: {
  open: boolean;
  onClose: () => void;
  vendorId: number;
  docType: DocType;
  docLabel: string;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ history: ComplianceDoc[] }>({
    queryKey: ["/api/vendor-compliance", vendorId, "history", docType],
    queryFn: () => apiRequest("GET", `/api/vendor-compliance/${vendorId}/history/${docType}`),
    enabled: open,
  });

  const handleDownload = async (doc: ComplianceDoc) => {
    try {
      const res = await apiRequest("GET", `/api/vendor-compliance/doc/${doc.id}/download`);
      if (res?.url) window.open(res.url, "_blank");
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Revision History — {docLabel}</DialogTitle>
          <DialogDescription>All uploaded revisions, newest first. Active revision is highlighted.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.history?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No revisions uploaded yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.history.map((doc) => (
              <div key={doc.id}
                className={`flex items-center justify-between p-3 rounded-lg border text-sm
                  ${doc.is_active ? "border-green-200 bg-green-50" : "border-gray-100 bg-gray-50"}`}>
                <div className="space-y-0.5">
                  <p className="font-medium text-gray-800">
                    rev-{String(doc.revision_number).padStart(2, "0")} — {doc.file_name}
                    {doc.is_active && <span className="ml-2 text-green-600 text-[10px] font-semibold uppercase">(Active)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {fmtDate(doc.created_at)}
                    {doc.expiry_date && ` · Expires ${fmtDate(doc.expiry_date)}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)}
                  title="Download this revision">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function VendorComplianceCard({ vendorId }: { vendorId?: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadTarget, setUploadTarget] = useState<DocType | null>(null);
  const [historyTarget, setHistoryTarget] = useState<DocType | null>(null);

  const { data, isLoading, refetch } = useQuery<{ docs: ComplianceDoc[] }>({
    queryKey: ["/api/vendor-compliance", vendorId],
    queryFn: () => apiRequest("GET", `/api/vendor-compliance/${vendorId}`),
    enabled: !!vendorId,
  });

  const docMap: Record<string, ComplianceDoc> = {};
  for (const doc of data?.docs ?? []) {
    docMap[doc.doc_type] = doc;
  }

  const completedCount = DOC_TYPES.filter((d) => {
    const status = getEffectiveStatus(docMap[d.key]);
    return status === "uploaded" || status === "pending_approval";
  }).length;

  const handleDownload = async (doc: ComplianceDoc) => {
    try {
      const res = await apiRequest("GET", `/api/vendor-compliance/doc/${doc.id}/download`);
      if (res?.url) window.open(res.url, "_blank");
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    }
  };

  const handleView = async (doc: ComplianceDoc) => {
    try {
      const res = await apiRequest("GET", `/api/vendor-compliance/doc/${doc.id}/view`);
      if (res?.url) window.open(res.url, "_blank");
    } catch (e: any) {
      toast({ title: "View failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-600" />
          <h4 className="text-sm font-semibold text-teal-700">Mandatory Compliance Documents</h4>
        </div>
        {vendorId ? (
          isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
          ) : (
            <Badge
              className={`text-xs font-semibold ${
                completedCount === DOC_TYPES.length
                  ? "bg-green-100 text-green-700 border-green-200"
                  : completedCount >= 3
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-red-100 text-red-700 border-red-200"
              }`}
            >
              {completedCount} / {DOC_TYPES.length} Completed
            </Badge>
          )
        ) : null}
      </div>

      {/* Create-mode placeholder */}
      {!vendorId ? (
        <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-white p-4">
          <AlertCircle className="h-5 w-5 text-teal-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-teal-700">Compliance documents can be uploaded after the vendor is created.</p>
            <p className="text-xs text-teal-500 mt-0.5">Save the vendor first, then open Edit to upload documents.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Mandatory docs missing warning */}
          {(() => {
            const missingMandatory = DOC_TYPES.filter(
              (d) => d.mandatory && getEffectiveStatus(docMap[d.key]) === "missing",
            );
            if (missingMandatory.length === 0) return null;
            return (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">
                  <span className="font-semibold">Vendor approval blocked.</span>{" "}
                  Missing mandatory: {missingMandatory.map((d) => d.label).join(", ")}.
                </p>
              </div>
            );
          })()}

          {/* Document table */}
          <div className="rounded-lg border border-teal-100 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-teal-100 bg-teal-50/60">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-teal-700 w-6"></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-teal-700">Document</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-teal-700">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-teal-700">File</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-teal-700">Uploaded</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-teal-700">Expiry</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-teal-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {DOC_TYPES.map((docDef) => {
                    const doc = docMap[docDef.key];
                    const status = getEffectiveStatus(doc);
                    const isMissing = status === "missing";

                    return (
                      <tr
                        key={docDef.key}
                        className={`transition-colors ${
                          isMissing && docDef.mandatory
                            ? "bg-red-50/60 hover:bg-red-50"
                            : isMissing
                            ? "hover:bg-gray-50"
                            : "hover:bg-teal-50/30"
                        }`}
                      >
                        {/* Status icon */}
                        <td className="px-3 py-2.5">
                          <StatusIcon status={status} />
                        </td>

                        {/* Name */}
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-gray-800">{docDef.label}</span>
                          {docDef.mandatory && (
                            <span className="ml-1 text-red-500 text-[10px] font-semibold">*</span>
                          )}
                        </td>

                        {/* Status badge */}
                        <td className="px-3 py-2.5">
                          <StatusBadge status={status} />
                        </td>

                        {/* File name */}
                        <td className="px-3 py-2.5 max-w-[160px]">
                          {doc ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-gray-600 truncate block">
                                    {doc.file_name}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{doc.file_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    rev-{String(doc.revision_number).padStart(2, "0")}
                                    {doc.size_bytes ? ` · ${(doc.size_bytes / 1024).toFixed(0)} KB` : ""}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-gray-400 italic">—</span>
                          )}
                        </td>

                        {/* Upload date */}
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-gray-500">
                            {doc ? fmtDate(doc.created_at) : "—"}
                          </span>
                        </td>

                        {/* Expiry */}
                        <td className="px-3 py-2.5">
                          {doc?.expiry_date ? (
                            <span className={`text-xs font-medium ${
                              status === "expired" ? "text-orange-600" : "text-gray-600"
                            }`}>
                              {fmtDate(doc.expiry_date)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {/* Upload / Replace */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className={`h-7 w-7 p-0 ${
                                      isMissing
                                        ? "text-teal-600 hover:bg-teal-100"
                                        : "text-gray-500 hover:bg-gray-100"
                                    }`}
                                    onClick={() => setUploadTarget(docDef.key)}
                                  >
                                    <Upload className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{doc ? "Replace (new revision)" : "Upload"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {/* Download */}
                            {doc && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                                      onClick={() => handleDownload(doc)}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">Download</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {/* View */}
                            {doc && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                                      onClick={() => handleView(doc)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">View</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}

                            {/* History */}
                            {doc && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100"
                                      onClick={() => setHistoryTarget(docDef.key)}
                                    >
                                      <History className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">Revision history</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-teal-600/70 leading-tight">
            * Mandatory documents. Vendor approval blocked until GST Certificate, PAN Card, and Cancelled Cheque are uploaded.
            All uploads are stored as immutable revisions in GCS.
          </p>
        </>
      )}

      {/* Upload dialog */}
      {uploadTarget && vendorId && (
        <UploadDialog
          open={!!uploadTarget}
          onClose={() => setUploadTarget(null)}
          vendorId={vendorId}
          docType={uploadTarget}
          docLabel={DOC_TYPES.find((d) => d.key === uploadTarget)?.label ?? uploadTarget}
          existing={docMap[uploadTarget]}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/vendor-compliance", vendorId] });
          }}
        />
      )}

      {/* History dialog */}
      {historyTarget && vendorId && (
        <HistoryDialog
          open={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
          vendorId={vendorId}
          docType={historyTarget}
          docLabel={DOC_TYPES.find((d) => d.key === historyTarget)?.label ?? historyTarget}
        />
      )}
    </div>
  );
}

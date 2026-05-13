import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtDateTime } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, FileText, Trash2, Loader2, ExternalLink } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlcDocument {
  id: number; plcLineId: number | null; poGroupId: number | null; epcPoId: number | null;
  documentType: string; fileName: string; fileSize: number | null;
  mimeType: string | null; gcsPath: string; sha256Hash: string | null;
  isCurrent: boolean; uploadedBy: number | null; uploadedByName: string | null;
  createdAt: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  po: "Purchase Order", grn: "GRN", inspection: "Inspection Report",
  certification: "Certification", vendor_doc: "Vendor Document", other: "Other",
};

const DOC_TYPE_BADGE: Record<string, string> = {
  po: "bg-indigo-100 text-indigo-700",
  grn: "bg-green-100 text-green-700",
  inspection: "bg-blue-100 text-blue-700",
  certification: "bg-amber-100 text-amber-700",
  vendor_doc: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

function fileSizeLabel(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlcDocumentManager({
  plcLineId,
  poGroupId,
  epcPoId,
}: {
  plcLineId?: number;
  poGroupId?: number;
  epcPoId?: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("other");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (plcLineId) params.set("plcLineId", String(plcLineId));
    if (poGroupId) params.set("poGroupId", String(poGroupId));
    if (epcPoId) params.set("epcPoId", String(epcPoId));
    return params.toString();
  };

  const { data: docs = [], isLoading } = useQuery<PlcDocument[]>({
    queryKey: ["/api/plc-documents", { plcLineId, poGroupId, epcPoId }],
    queryFn: () => apiRequest("GET", `/api/plc-documents?${buildQuery()}`),
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", docType);
      if (plcLineId) formData.append("plcLineId", String(plcLineId));
      if (poGroupId) formData.append("poGroupId", String(poGroupId));
      if (epcPoId) formData.append("epcPoId", String(epcPoId));

      const r = await fetch("/api/plc-documents/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Upload failed"); }
      qc.invalidateQueries({ queryKey: ["/api/plc-documents"] });
      toast({ title: "File uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(id: number) {
    try {
      const r = await apiRequest("DELETE", `/api/plc-documents/${id}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Delete failed"); }
      qc.invalidateQueries({ queryKey: ["/api/plc-documents"] });
      toast({ title: "Document removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload toolbar */}
      <div className="flex items-center gap-2">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="cursor-pointer">
          <input type="file" className="sr-only" onChange={handleFileUpload} disabled={uploading} />
          <Button size="sm" asChild disabled={uploading}>
            <span>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Upload
            </span>
          </Button>
        </label>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : docs.filter((d) => d.isCurrent).length === 0 ? (
        <div className="text-center py-6 border rounded-lg text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No documents attached yet.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">File</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Size</TableHead>
                <TableHead className="text-xs">Uploaded By</TableHead>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.filter((d) => d.isCurrent).map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span className="max-w-[200px] truncate">{doc.fileName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${DOC_TYPE_BADGE[doc.documentType] ?? "bg-gray-100 text-gray-600"}`}>
                      {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{fileSizeLabel(doc.fileSize)}</TableCell>
                  <TableCell className="text-xs">{doc.uploadedByName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDateTime(doc.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Download"
                        onClick={() => window.open(`/api/plc-documents/${doc.id}/download`, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500 hover:text-red-700"
                        title="Remove"
                        onClick={() => setDeletingId(doc.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <AlertDialog open onOpenChange={() => setDeletingId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Document?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark the document as inactive. The file on storage is not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDelete(deletingId)}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

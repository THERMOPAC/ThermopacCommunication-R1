import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Eye, FileCode, Loader2, Filter } from "lucide-react";
import type { DrawingRevision } from "@shared/schema";

const DISCIPLINES = [
  "Mechanical",
  "Piping",
  "Electrical",
  "Instrumentation",
  "Civil",
  "Structural",
  "Other",
];

const KNOWN_INCOMPATIBLE_EXTS = ["pdf", "png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp", "svg", "txt", "html", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip"];

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function DrawingVerificationPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDiscipline, setFilterDiscipline] = useState<string>("all");

  const [form, setForm] = useState({
    projectId: "",
    drawingNumber: "",
    revision: "",
    title: "",
    itemCode: "",
    discipline: "",
    uploaderNotes: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>("");

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const params = new URLSearchParams();
  if (filterProjectId && filterProjectId !== "all") params.set("projectId", filterProjectId);
  if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
  if (filterDiscipline && filterDiscipline !== "all") params.set("discipline", filterDiscipline);

  const { data: revisions = [], isLoading } = useQuery<DrawingRevision[]>({
    queryKey: ["/api/drawing-revisions", filterProjectId, filterStatus, filterDiscipline],
    queryFn: async () => {
      const res = await fetch(`/api/drawing-revisions?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: detailRecord } = useQuery<DrawingRevision>({
    queryKey: ["/api/drawing-revisions", detailId],
    queryFn: async () => {
      const res = await fetch(`/api/drawing-revisions/${detailId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: detailId !== null,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected.");
      const data = new FormData();
      data.append("file", selectedFile);
      data.append("projectId", form.projectId);
      data.append("drawingNumber", form.drawingNumber.trim());
      data.append("revision", form.revision.trim());
      if (form.title.trim()) data.append("title", form.title.trim());
      if (form.itemCode.trim()) data.append("itemCode", form.itemCode.trim());
      if (form.discipline) data.append("discipline", form.discipline);
      if (form.uploaderNotes.trim()) data.append("uploaderNotes", form.uploaderNotes.trim());

      const res = await fetch("/api/drawing-revisions/upload", {
        method: "POST",
        body: data,
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Upload failed.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Drawing uploaded successfully", description: `${form.drawingNumber} Rev ${form.revision} staged to STAGING zone.` });
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-revisions"] });
      handleCloseUpload();
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setFileError("");
    if (!file) { setSelectedFile(null); return; }
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (ext !== "slddrw") {
      setFileError(`Invalid file type. Only .slddrw files are accepted. Got: .${ext || "unknown"}`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (KNOWN_INCOMPATIBLE_EXTS.includes(ext)) {
      setFileError("File type is not accepted.");
      setSelectedFile(null);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setFileError("File size exceeds 50 MB limit.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
  }

  function handleCloseUpload() {
    setUploadOpen(false);
    setSelectedFile(null);
    setFileError("");
    setForm({ projectId: "", drawingNumber: "", revision: "", title: "", itemCode: "", discipline: "", uploaderNotes: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function canSubmit() {
    return (
      form.projectId &&
      form.drawingNumber.trim() &&
      form.revision.trim() &&
      selectedFile &&
      !fileError &&
      !uploadMutation.isPending
    );
  }

  async function handleDownload(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/drawing-revisions/${id}/file`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get download URL.");
      const { url, filename } = await res.json();
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "drawing.slddrw";
      a.target = "_blank";
      a.click();
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  }

  function getProjectName(projectId: number): string {
    const p = (projects as any[]).find((x: any) => x.id === projectId);
    return p ? `${p.code} — ${p.name}` : String(projectId);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drawing Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staging zone — uploaded revisions pending verification
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Drawing
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={filterProjectId} onValueChange={setFilterProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {(projects as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.clientName || p.client_name || p.name}{(p.clientName || p.client_name) && (p.clientName || p.client_name) !== p.name ? ` — ${p.name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="uploaded">uploaded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Discipline</Label>
              <Select value={filterDiscipline} onValueChange={setFilterDiscipline}>
                <SelectTrigger>
                  <SelectValue placeholder="All disciplines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All disciplines</SelectItem>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : revisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileCode className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No drawing revisions found.</p>
              <p className="text-xs text-muted-foreground mt-1">Upload a .slddrw file to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drawing No</TableHead>
                  <TableHead>Rev</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Discipline</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(r.id)}>
                    <TableCell className="font-mono text-xs font-medium">{r.drawingNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{r.revision}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">{r.title || "—"}</TableCell>
                    <TableCell className="text-sm">{r.discipline || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.projectCode || r.projectId}</TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.uploadedBy}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(r.uploadedAt)}</TableCell>
                    <TableCell className="text-xs">{formatBytes(r.fileSizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => handleDownload(r.id, e)}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) handleCloseUpload(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Drawing Revision
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Project <span className="text-destructive">*</span></Label>
              <Select value={form.projectId} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {(projects as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.clientName || p.client_name || p.name}{(p.clientName || p.client_name) && (p.clientName || p.client_name) !== p.name ? ` — ${p.name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Drawing Number <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. TPEL-2627-013-ME-001"
                  value={form.drawingNumber}
                  onChange={(e) => setForm((f) => ({ ...f, drawingNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Revision <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. A"
                  value={form.revision}
                  onChange={(e) => setForm((f) => ({ ...f, revision: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                placeholder="Drawing title or description"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Item Code</Label>
                <Input
                  placeholder="Optional"
                  value={form.itemCode}
                  onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Discipline</Label>
                <Select value={form.discipline} onValueChange={(v) => setForm((f) => ({ ...f, discipline: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCIPLINES.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>File <span className="text-destructive">*</span></Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="space-y-1">
                    <FileCode className="h-6 w-6 mx-auto text-primary" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to select file</p>
                    <p className="text-xs text-muted-foreground">.slddrw only · max 50 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".slddrw"
                className="hidden"
                onChange={handleFileChange}
              />
              {fileError && (
                <p className="text-xs text-destructive mt-1">{fileError}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes about this revision…"
                value={form.uploaderNotes}
                onChange={(e) => setForm((f) => ({ ...f, uploaderNotes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseUpload} disabled={uploadMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!canSubmit()}
              className="gap-2"
            >
              {uploadMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="h-4 w-4" /> Upload</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailId !== null} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Drawing Revision Detail
            </DialogTitle>
          </DialogHeader>
          {detailRecord ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Drawing Number</p>
                  <p className="font-mono font-medium">{detailRecord.drawingNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revision</p>
                  <Badge variant="outline" className="font-mono">{detailRecord.revision}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p>{detailRecord.title || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discipline</p>
                  <p>{detailRecord.discipline || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p>{detailRecord.projectCode || detailRecord.projectId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Item Code</p>
                  <p>{detailRecord.itemCode || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">{detailRecord.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Storage Zone</p>
                  <Badge variant="secondary" className="text-xs">{detailRecord.storageZone}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">File Type</p>
                  <p className="font-mono">.{detailRecord.fileType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">File Size</p>
                  <p>{formatBytes(detailRecord.fileSizeBytes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uploaded By</p>
                  <p>{detailRecord.uploadedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uploaded At</p>
                  <p>{formatDate(detailRecord.uploadedAt)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SHA-256 Checksum</p>
                <p className="font-mono text-xs break-all bg-muted rounded p-2 mt-1">{detailRecord.checksum}</p>
              </div>
              {detailRecord.uploaderNotes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm bg-muted rounded p-2 mt-1">{detailRecord.uploaderNotes}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">GCS Staging Path</p>
                <p className="font-mono text-xs break-all bg-muted rounded p-2 mt-1">{detailRecord.gcsStagingPath}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <DialogFooter>
            {detailRecord && (
              <Button variant="outline" className="gap-2" onClick={(e) => handleDownload(detailRecord.id, e)}>
                <Download className="h-4 w-4" /> Download
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

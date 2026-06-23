import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FolderOpen,
  FileText,
  Upload,
  Download,
  ChevronLeft,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  History,
  Shield,
  Loader2,
  File,
  FileSpreadsheet,
  FileImage,
  FileCog,
  Info,
} from "lucide-react";
import { format } from "date-fns";

interface FolderStatus {
  docType: string;
  folderCode: string;
  name: string;
  description: string | null;
  uploadMode: string;
  maxFileSizeMb: number;
  allowedExtensions: string[];
  hasDocument: boolean;
  currentRevision: string | null;
  lastUpdated: string | null;
}

interface DocumentRecord {
  id: number;
  projectId: number;
  docType: string;
  folderCode: string | null;
  revision: string;
  status: string;
  title: string;
  fileName: string;
  fileSize: number | null;
  contentType: string | null;
  gcsObjectPath: string;
  checksumSha256: string | null;
  seqNumber: number;
  uploadedBy: number | null;
  uploadedAt: string;
  supersededAt: string | null;
  supersededById: number | null;
  uploaderName: string | null;
}

interface DocTypeInfo {
  id: number;
  code: string;
  name: string;
  description: string | null;
  folderCode: string | null;
  allowedExtensions: string[];
  uploadMode: string;
  maxFileSizeMb: number;
  isSlot: boolean;
  sortOrder: number;
  isActive: boolean;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return <FileText className="h-4 w-4 text-red-500" />;
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (["jpg", "jpeg", "png", "bmp", "tif", "tiff"].includes(ext)) return <FileImage className="h-4 w-4 text-blue-500" />;
  if (["dwg", "dxf", "stp", "step", "igs", "sldprt", "sldasm", "catpart", "ipt"].includes(ext)) return <FileCog className="h-4 w-4 text-orange-500" />;
  if (["docx", "doc"].includes(ext)) return <FileText className="h-4 w-4 text-blue-700" />;
  return <File className="h-4 w-4 text-gray-500" />;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FOLDER_COLORS: Record<string, string> = {
  "1_BEDD": "bg-blue-50 border-blue-200",
  "2_STD": "bg-indigo-50 border-indigo-200",
  "3_PID": "bg-violet-50 border-violet-200",
  "4_MHB": "bg-purple-50 border-purple-200",
  "5_QAP": "bg-green-50 border-green-200",
  "6_HAZ": "bg-orange-50 border-orange-200",
  "7_TIE": "bg-yellow-50 border-yellow-200",
  "8_GA": "bg-cyan-50 border-cyan-200",
  "9_FDN": "bg-stone-50 border-stone-200",
  "10_ELC": "bg-amber-50 border-amber-200",
  "11_PRG": "bg-lime-50 border-lime-200",
  "12_CEF": "bg-teal-50 border-teal-200",
  "13_DSA": "bg-sky-50 border-sky-200",
  "14_INR": "bg-rose-50 border-rose-200",
  "15_OMM": "bg-emerald-50 border-emerald-200",
  "16_3D_Model": "bg-fuchsia-50 border-fuchsia-200",
  "17_DCA": "bg-slate-50 border-slate-200",
};

export default function DocumentControl({ projectId }: { projectId: number }) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: folders = [], isLoading: foldersLoading } = useQuery<FolderStatus[]>({
    queryKey: ["/api/document-control/projects", projectId, "folders"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/document-control/projects/${projectId}/folders`);
      return res;
    },
  });

  const { data: folderDetail, isLoading: detailLoading } = useQuery<{
    docType: DocTypeInfo;
    documents: DocumentRecord[];
  }>({
    queryKey: ["/api/document-control/projects", projectId, "documents", selectedFolder],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/document-control/projects/${projectId}/documents/${selectedFolder}`);
      return res;
    },
    enabled: !!selectedFolder,
  });

  const completedCount = folders.filter((f) => f.hasDocument).length;
  const totalCount = folders.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleUpload = useCallback(async () => {
    if (!uploadFiles || uploadFiles.length === 0 || !selectedFolder) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < uploadFiles.length; i++) {
        formData.append("files", uploadFiles[i]);
      }
      if (uploadTitle.trim()) {
        formData.append("title", uploadTitle.trim());
      }

      const response = await fetch(`/api/document-control/projects/${projectId}/upload/${selectedFolder}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      toast({
        title: "Upload Successful",
        description: `Revision ${result.revision} created with ${result.documents.length} file(s). ${result.supersededCount > 0 ? `${result.supersededCount} previous revision(s) superseded.` : ""}`,
      });

      setUploadDialogOpen(false);
      setUploadFiles(null);
      setUploadTitle("");
      queryClient.invalidateQueries({ queryKey: ["/api/document-control/projects", projectId] });
    } catch (err: any) {
      toast({
        title: "Upload Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [uploadFiles, selectedFolder, uploadTitle, projectId, queryClient, toast]);

  const handleDownload = useCallback(async (documentId: number) => {
    try {
      const res = await apiRequest("GET", `/api/document-control/projects/${projectId}/download/${documentId}`);
      window.open(res.url, "_blank");
    } catch (err: any) {
      toast({
        title: "Download Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  }, [projectId, toast]);

  if (foldersLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading document control...</span>
      </div>
    );
  }

  if (selectedFolder && folderDetail) {
    return (
      <FolderDetailView
        folder={folders.find((f) => f.folderCode === selectedFolder)!}
        docType={folderDetail.docType}
        documents={folderDetail.documents}
        isLoading={detailLoading}
        onBack={() => setSelectedFolder(null)}
        onUpload={() => {
          const folder = folders.find((f) => f.folderCode === selectedFolder);
          setUploadFiles(null);
          setUploadTitle(folder?.name || "");
          setUploadKey(k => k + 1);
          setUploadDialogOpen(true);
        }}
        onDownload={handleDownload}
        uploadDialog={
          <UploadDialog
            key={uploadKey}
            open={uploadDialogOpen}
            onOpenChange={(open) => {
              setUploadDialogOpen(open);
              if (!open) {
                setUploadFiles(null);
                setUploadTitle("");
              }
            }}
            folder={folders.find((f) => f.folderCode === selectedFolder)!}
            files={uploadFiles}
            onFilesChange={setUploadFiles}
            title={uploadTitle}
            onTitleChange={setUploadTitle}
            uploading={uploading}
            onUpload={handleUpload}
          />
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Document Control
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            17 controlled document folders with revision tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{completedCount}/{totalCount} folders populated</p>
            <Progress value={completionPct} className="w-32 h-2 mt-1" />
          </div>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Code</TableHead>
              <TableHead>Folder Name</TableHead>
              <TableHead className="w-[100px]">Mode</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[130px]">Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {folders.map((folder) => {
              const colorClass = FOLDER_COLORS[folder.folderCode] || "";
              return (
                <TableRow
                  key={folder.folderCode}
                  className={`cursor-pointer hover:bg-muted/50 ${colorClass}`}
                  onClick={() => setSelectedFolder(folder.folderCode)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
                      <span className="text-sm">{folder.docType}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{folder.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {folder.uploadMode === "multi" ? "Multi-file" : "Single"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {folder.hasDocument ? (
                      <Badge variant="default" className="bg-green-600 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Rev {folder.currentRevision}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Empty
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {folder.lastUpdated ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(folder.lastUpdated), "dd MMM yyyy")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/** Derive system-format filename from the GCS path (last path segment). */
function systemFileName(gcsPath: string): string {
  return gcsPath.split('/').pop() || gcsPath;
}

function DocRevisionTable({ revDocs, onDownload }: { revDocs: DocumentRecord[]; onDownload: (id: number) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead className="py-1">File</TableHead>
          <TableHead className="py-1">Size</TableHead>
          <TableHead className="py-1">Uploaded By</TableHead>
          <TableHead className="py-1">Date</TableHead>
          <TableHead className="py-1 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {revDocs.map((doc, idx) => {
          const sysName = systemFileName(doc.gcsObjectPath);
          const displayName = doc.title || sysName;
          return (
            <TableRow key={doc.id} className={`text-xs ${idx < revDocs.length - 1 ? "border-b-0" : ""}`}>
              <TableCell className="py-2 pb-1">
                <div className="flex items-center gap-2">
                  {getFileIcon(sysName)}
                  <span className="font-medium truncate max-w-[240px]" title={sysName}>
                    {displayName}
                  </span>
                  {revDocs.length > 1 && (
                    <Badge variant="outline" className="text-[10px]">#{doc.seqNumber}</Badge>
                  )}
                </div>
                <code className="text-[10px] text-muted-foreground font-mono break-all whitespace-pre-wrap block mt-1">{doc.gcsObjectPath}</code>
              </TableCell>
              <TableCell className="py-2">{formatFileSize(doc.fileSize)}</TableCell>
              <TableCell className="py-2">{doc.uploaderName || "—"}</TableCell>
              <TableCell className="py-2">{format(new Date(doc.uploadedAt), "dd MMM yyyy HH:mm")}</TableCell>
              <TableCell className="py-2 text-right">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onDownload(doc.id)}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function FolderDetailView({
  folder,
  docType,
  documents,
  isLoading,
  onBack,
  onUpload,
  onDownload,
  uploadDialog,
}: {
  folder: FolderStatus;
  docType: DocTypeInfo;
  documents: DocumentRecord[];
  isLoading: boolean;
  onBack: () => void;
  onUpload: () => void;
  onDownload: (id: number) => void;
  uploadDialog: React.ReactNode;
}) {
  const [showHistory, setShowHistory] = useState(false);

  const activeDocs = documents.filter((d) => d.status === "active");
  const supersededDocs = documents.filter((d) => d.status === "superseded");
  const activeRevision = activeDocs[0]?.revision || null;

  // Group superseded docs by revision for history display
  const supersededRevGroups: Record<string, DocumentRecord[]> = {};
  for (const doc of supersededDocs) {
    if (!supersededRevGroups[doc.revision]) supersededRevGroups[doc.revision] = [];
    supersededRevGroups[doc.revision].push(doc);
  }
  const supersededRevisions = Object.keys(supersededRevGroups).sort((a, b) => parseInt(b) - parseInt(a));
  const previousRevisionCount = supersededRevisions.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary/70" />
              {docType.name}
              <Badge variant="outline" className="text-xs">{docType.code}</Badge>
            </h3>
            {docType.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{docType.description}</p>
            )}
          </div>
        </div>
        <Button onClick={onUpload} size="sm">
          <Upload className="h-4 w-4 mr-1" />
          {activeDocs.length > 0 ? "Upload New Revision" : "Upload Document"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Current Revision</p>
            <p className="text-lg font-bold mt-1">{activeRevision ? `Rev ${activeRevision}` : "—"}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Active Files</p>
            <p className="text-lg font-bold mt-1">{activeDocs.length}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Revisions</p>
            <p className="text-lg font-bold mt-1">{previousRevisionCount + (activeDocs.length > 0 ? 1 : 0)}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Upload Mode</p>
            <p className="text-lg font-bold mt-1 capitalize">{docType.uploadMode}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main card: active revision only */}
      <Card className="border">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              {activeDocs.length > 0 ? `Current — Rev ${activeRevision}` : "Documents"}
            </CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                    <Info className="h-3 w-3" />
                    Extensions: {docType.allowedExtensions.map((e) => `.${e}`).join(", ")}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Max file size: {docType.maxFileSizeMb} MB</p>
                  <p>Upload mode: {docType.uploadMode}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents uploaded yet</p>
              <p className="text-xs mt-1">Upload the first revision to begin document control</p>
            </div>
          ) : activeDocs.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">No active revision found</p>
            </div>
          ) : (
            <div className="rounded-lg border border-green-300 bg-green-50/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-green-600">Rev {activeRevision}</Badge>
                <Badge variant="outline" className="text-xs">Active</Badge>
              </div>
              <DocRevisionTable revDocs={activeDocs} onDownload={onDownload} />
            </div>
          )}

          {/* Revision history toggle */}
          {previousRevisionCount > 0 && (
            <div className="mt-4">
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowHistory((v) => !v)}
              >
                <History className="h-3.5 w-3.5" />
                {showHistory
                  ? "Hide revision history"
                  : `Show revision history · ${previousRevisionCount} previous revision${previousRevisionCount !== 1 ? "s" : ""}`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>

              {showHistory && (
                <div className="space-y-3 mt-3 border-t pt-3">
                  {supersededRevisions.map((rev) => {
                    const revDocs = supersededRevGroups[rev];
                    return (
                      <div key={rev} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary">Rev {rev}</Badge>
                          <Badge variant="outline" className="text-xs text-gray-500">Superseded</Badge>
                          {revDocs[0].supersededAt && (
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              Superseded {format(new Date(revDocs[0].supersededAt), "dd MMM yyyy HH:mm")}
                            </span>
                          )}
                        </div>
                        <DocRevisionTable revDocs={revDocs} onDownload={onDownload} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {uploadDialog}
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  folder,
  files,
  onFilesChange,
  title,
  onTitleChange,
  uploading,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderStatus;
  files: FileList | null;
  onFilesChange: (files: FileList | null) => void;
  title: string;
  onTitleChange: (title: string) => void;
  uploading: boolean;
  onUpload: () => void;
}) {
  const isMulti = folder.uploadMode === "multi";
  const acceptStr = folder.allowedExtensions.map((e) => `.${e}`).join(",");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {folder.hasDocument ? "Upload New Revision" : "Upload Document"}
          </DialogTitle>
          <DialogDescription>
            {folder.name} ({folder.docType})
            {folder.hasDocument && ` — Current: Rev ${folder.currentRevision}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 text-center">
            <Input
              type="file"
              multiple={isMulti}
              accept={acceptStr}
              onChange={(e) => onFilesChange(e.target.files)}
              className="mb-2"
            />
            <p className="text-xs text-muted-foreground">
              Accepted: {folder.allowedExtensions.map((e) => `.${e}`).join(", ")}
              {" · "}Max {folder.maxFileSizeMb} MB per file
              {isMulti && " · Multiple files allowed"}
            </p>
          </div>

          {files && files.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Selected files ({files.length})</Label>
              <div className="rounded border bg-muted/30 p-2 max-h-24 overflow-y-auto">
                {Array.from(files).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5">
                    <span className="flex items-center gap-1.5 truncate">
                      {getFileIcon(f.name)}
                      {f.name}
                    </span>
                    <span className="text-muted-foreground ml-2">{formatFileSize(f.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="upload-title" className="text-xs">
              Document Title (optional)
            </Label>
            <Input
              id="upload-title"
              placeholder={folder.name}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>

          {folder.hasDocument && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                Uploading will create a new revision and supersede the current Rev {folder.currentRevision}. 
                The previous revision will be preserved in history.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={onUpload} disabled={uploading || !files || files.length === 0}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

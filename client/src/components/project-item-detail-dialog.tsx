import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Boxes,
  FileText,
  CheckCircle,
  Plus,
  Loader2,
  Trash2,
  Upload,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProjectItemDetailDialogProps {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProjectItemDetailDialog({ item, open, onOpenChange }: ProjectItemDetailDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeDetailTab, setActiveDetailTab] = useState("details");
  const [isAddDrawingOpen, setIsAddDrawingOpen] = useState(false);
  const [isAddEcrOpen, setIsAddEcrOpen] = useState(false);
  const [isAddEcnOpen, setIsAddEcnOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [drawingForm, setDrawingForm] = useState({
    title: "",
    revision: "00",
    status: "Draft",
    sheetSize: "",
    scale: "",
    notes: "",
  });

  const [ecrForm, setEcrForm] = useState({
    description: "",
    reason: "",
    notes: "",
  });

  const [ecnForm, setEcnForm] = useState({
    description: "",
    implementationDetails: "",
    resultingRevision: "",
    notes: "",
  });

  const gcsPathQuery = useQuery({
    queryKey: ['/api/project-items', item.id, 'gcs-path'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-items/${item.id}/gcs-path`);
      return res as any;
    },
    enabled: open,
  });

  const drawingsQuery = useQuery({
    queryKey: ['/api/project-items', item.id, 'drawings'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-items/${item.id}/drawings`);
      return res as any[];
    },
    enabled: open,
  });

  const ecrQuery = useQuery({
    queryKey: ['/api/project-items', item.id, 'ecr'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-items/${item.id}/ecr`);
      return res as any[];
    },
    enabled: open,
  });

  const ecnQuery = useQuery({
    queryKey: ['/api/project-items', item.id, 'ecn'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-items/${item.id}/ecn`);
      return res as any[];
    },
    enabled: open,
  });

  const addDrawingMutation = useMutation({
    mutationFn: async (data: { title: string; revision: string; status: string; sheetSize: string; scale: string; notes: string; file: File | null }) => {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('revision', data.revision);
      formData.append('status', data.status);
      if (data.sheetSize) formData.append('sheetSize', data.sheetSize);
      if (data.scale) formData.append('scale', data.scale);
      if (data.notes) formData.append('notes', data.notes);
      if (data.file) formData.append('file', data.file);

      const res = await fetch(`/api/project-items/${item.id}/drawings`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-items', item.id, 'drawings'] });
      setIsAddDrawingOpen(false);
      setDrawingForm({ title: "", revision: "00", status: "Draft", sheetSize: "", scale: "", notes: "" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast({ title: "Drawing uploaded successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error uploading drawing", description: err.message, variant: "destructive" });
    },
  });

  const deleteDrawingMutation = useMutation({
    mutationFn: async (drawingId: number) => {
      return apiRequest("DELETE", `/api/project-items/drawings/${drawingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-items', item.id, 'drawings'] });
      toast({ title: "Drawing deleted" });
    },
  });

  const addEcrMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/project-items/${item.id}/ecr`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-items', item.id, 'ecr'] });
      setIsAddEcrOpen(false);
      setEcrForm({ description: "", reason: "", notes: "" });
      toast({ title: "ECR created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error creating ECR", description: err.message, variant: "destructive" });
    },
  });

  const addEcnMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/project-items/${item.id}/ecn`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-items', item.id, 'ecn'] });
      setIsAddEcnOpen(false);
      setEcnForm({ description: "", implementationDetails: "", resultingRevision: "", notes: "" });
      toast({ title: "ECN created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error creating ECN", description: err.message, variant: "destructive" });
    },
  });

  const drawings = drawingsQuery.data || [];
  const ecrs = ecrQuery.data || [];
  const ecns = ecnQuery.data || [];
  const gcsInfo = gcsPathQuery.data;

  const previewGcsPath = gcsInfo
    ? `${gcsInfo.basePath}/${gcsInfo.codeBars}_rev-${drawingForm.revision}.pdf`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-amber-500" />
            Project Item: {item.itemCode || item.masterItem?.itemCode || "N/A"}
          </DialogTitle>
          <DialogDescription>
            {item.description || item.masterItem?.description || "No description"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="details">Item Details</TabsTrigger>
            <TabsTrigger value="drawings">
              Drawing Management
              {drawings.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{drawings.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ecr-ecn">
              ECR & ECN
              {(ecrs.length + ecns.length) > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{ecrs.length + ecns.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Item Details Tab */}
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Item Code</label>
                <div className="mt-1 font-mono text-sm bg-muted rounded px-3 py-2 break-all">
                  {item.itemCode || item.masterItem?.itemCode || "N/A"}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CodeBars (SAP BarCode)</label>
                <div className="mt-1 font-mono text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {item.codeBars || "-"}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">
                {item.description || item.masterItem?.description || "N/A"}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantity</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.quantity || "0"}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UOM</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.uom || item.masterItem?.uom || "N/A"}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Make / Buy</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.makeOrBuy || item.masterItem?.makeOrBuy || "N/A"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                <div className="mt-1">
                  <Badge variant={
                    item.status === "Completed" ? "default" :
                    item.status === "Under Construction" ? "secondary" :
                    item.status === "Cancelled" ? "destructive" :
                    "outline"
                  }>
                    {item.status || "Not Started"}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.source || "-"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">BP Code</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.bpCode || "-"}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Product Code</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.productCode || "-"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Order</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.sourceOrderNumber || "-"}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CodeBars (SAP BarCode)</label>
                <div className="mt-1 font-mono text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">{item.codeBars || "-"}</div>
              </div>
            </div>

            {item.notes && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
                <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.notes}</div>
              </div>
            )}

            <div className="border-t pt-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SAP Sync Status</label>
              <div className="mt-1 flex items-center gap-2">
                {item.sapSynced ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" /> Synced
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Not Synced</Badge>
                )}
                {item.sapSyncedAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(item.sapSyncedAt), "dd MMM yyyy HH:mm")}
                  </span>
                )}
                {item.sapSyncError && (
                  <span className="text-xs text-red-600">{item.sapSyncError}</span>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Drawing Management Tab */}
          <TabsContent value="drawings" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold">Drawing Revisions</h3>
              <Button size="sm" onClick={() => setIsAddDrawingOpen(!isAddDrawingOpen)}>
                <Plus className="h-4 w-4 mr-1" /> Add Drawing
              </Button>
            </div>

            {isAddDrawingOpen && (
              <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Drawing No (CodeBars)</label>
                    <Input
                      value={item.codeBars || ""}
                      disabled
                      className="bg-muted cursor-not-allowed font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Title *</label>
                    <Input
                      value={drawingForm.title}
                      onChange={(e) => setDrawingForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Drawing title"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium">Revision *</label>
                    <Input
                      value={drawingForm.revision}
                      onChange={(e) => setDrawingForm(f => ({ ...f, revision: e.target.value }))}
                      placeholder="00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Status</label>
                    <Select value={drawingForm.status} onValueChange={(v) => setDrawingForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="For Review">For Review</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Released">Released</SelectItem>
                        <SelectItem value="Superseded">Superseded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Sheet Size</label>
                    <Select value={drawingForm.sheetSize} onValueChange={(v) => setDrawingForm(f => ({ ...f, sheetSize: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A0">A0</SelectItem>
                        <SelectItem value="A1">A1</SelectItem>
                        <SelectItem value="A2">A2</SelectItem>
                        <SelectItem value="A3">A3</SelectItem>
                        <SelectItem value="A4">A4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Scale</label>
                    <Input
                      value={drawingForm.scale}
                      onChange={(e) => setDrawingForm(f => ({ ...f, scale: e.target.value }))}
                      placeholder="e.g., 1:1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium">Upload Drawing File</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="flex-1"
                    />
                    {selectedFile && (
                      <Badge variant="outline" className="whitespace-nowrap">
                        {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                      </Badge>
                    )}
                  </div>
                </div>
                {previewGcsPath && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-2">
                    <label className="text-xs font-medium text-blue-700">GCS Path Preview</label>
                    <div className="mt-0.5 font-mono text-xs text-blue-900 break-all">{previewGcsPath}</div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium">Notes</label>
                  <Textarea
                    value={drawingForm.notes}
                    onChange={(e) => setDrawingForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setIsAddDrawingOpen(false); setSelectedFile(null); }}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={!drawingForm.title || !selectedFile || addDrawingMutation.isPending}
                    onClick={() => addDrawingMutation.mutate({ ...drawingForm, file: selectedFile })}
                  >
                    {addDrawingMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-1" /> Upload Drawing</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {drawingsQuery.isLoading ? (
              <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
            ) : drawings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No drawings registered for this item yet.</p>
                <p className="text-sm">Click "Add Drawing" to upload a drawing revision.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Drawing No</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Rev</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drawings.map((dwg: any) => (
                    <TableRow key={dwg.id}>
                      <TableCell className="font-mono text-xs">{dwg.drawingNumber}</TableCell>
                      <TableCell>{dwg.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{dwg.revision}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          dwg.status === "Released" ? "default" :
                          dwg.status === "Approved" ? "secondary" :
                          dwg.status === "Superseded" ? "destructive" :
                          "outline"
                        }>
                          {dwg.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {dwg.fileName ? (
                          <span className="text-blue-600">{dwg.fileName}</span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {dwg.revisionDate ? format(new Date(dwg.revisionDate), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 h-7"
                          onClick={() => deleteDrawingMutation.mutate(dwg.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* GCS Path at bottom */}
            <div className="mt-4 border-t pt-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">GCS Storage Path</label>
              </div>
              {gcsPathQuery.isLoading ? (
                <div className="text-xs text-muted-foreground">Loading...</div>
              ) : gcsInfo ? (
                <div className="font-mono text-xs bg-slate-50 border rounded px-3 py-2 break-all text-slate-700">
                  {gcsInfo.basePath}/{gcsInfo.codeBars}_rev-XX.pdf
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Path not available</div>
              )}
            </div>
          </TabsContent>

          {/* ECR & ECN Tab */}
          <TabsContent value="ecr-ecn" className="mt-4">
            {/* ECR Section */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Engineering Change Requests (ECR)
                </h3>
                <Button size="sm" onClick={() => setIsAddEcrOpen(!isAddEcrOpen)}>
                  <Plus className="h-4 w-4 mr-1" /> New ECR
                </Button>
              </div>

              {isAddEcrOpen && (
                <div className="border rounded-lg p-4 mb-3 bg-muted/30 space-y-3">
                  <div>
                    <label className="text-xs font-medium">Description *</label>
                    <Input
                      value={ecrForm.description}
                      onChange={(e) => setEcrForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Describe the requested change"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Reason *</label>
                    <Textarea
                      value={ecrForm.reason}
                      onChange={(e) => setEcrForm(f => ({ ...f, reason: e.target.value }))}
                      placeholder="Reason for the change"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Notes</label>
                    <Textarea
                      value={ecrForm.notes}
                      onChange={(e) => setEcrForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional notes"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setIsAddEcrOpen(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      disabled={!ecrForm.description || !ecrForm.reason || addEcrMutation.isPending}
                      onClick={() => addEcrMutation.mutate(ecrForm)}
                    >
                      {addEcrMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Submit ECR
                    </Button>
                  </div>
                </div>
              )}

              {ecrQuery.isLoading ? (
                <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : ecrs.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No ECRs for this item.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ecrs.map((ecr: any) => (
                      <TableRow key={ecr.id}>
                        <TableCell className="font-mono text-sm">{ecr.document_number}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{ecr.description}</TableCell>
                        <TableCell>
                          <Badge variant={
                            ecr.status === "Approved" ? "default" :
                            ecr.status === "Rejected" ? "destructive" :
                            ecr.status === "Submitted" ? "secondary" :
                            "outline"
                          }>
                            {ecr.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {ecr.requestedByUser ? `${ecr.requestedByUser.firstName || ecr.requestedByUser.username}` : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ecr.requested_date ? format(new Date(ecr.requested_date), "dd MMM yyyy") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* ECN Section */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-blue-500" />
                  Engineering Change Notices (ECN)
                </h3>
                <Button size="sm" onClick={() => setIsAddEcnOpen(!isAddEcnOpen)}>
                  <Plus className="h-4 w-4 mr-1" /> New ECN
                </Button>
              </div>

              {isAddEcnOpen && (
                <div className="border rounded-lg p-4 mb-3 bg-muted/30 space-y-3">
                  <div>
                    <label className="text-xs font-medium">Description *</label>
                    <Input
                      value={ecnForm.description}
                      onChange={(e) => setEcnForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Describe the change notice"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Implementation Details *</label>
                    <Textarea
                      value={ecnForm.implementationDetails}
                      onChange={(e) => setEcnForm(f => ({ ...f, implementationDetails: e.target.value }))}
                      placeholder="How will this change be implemented?"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">Resulting Revision</label>
                      <Input
                        value={ecnForm.resultingRevision}
                        onChange={(e) => setEcnForm(f => ({ ...f, resultingRevision: e.target.value }))}
                        placeholder="e.g., 01"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Notes</label>
                      <Input
                        value={ecnForm.notes}
                        onChange={(e) => setEcnForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setIsAddEcnOpen(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      disabled={!ecnForm.description || !ecnForm.implementationDetails || addEcnMutation.isPending}
                      onClick={() => addEcnMutation.mutate(ecnForm)}
                    >
                      {addEcnMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Issue ECN
                    </Button>
                  </div>
                </div>
              )}

              {ecnQuery.isLoading ? (
                <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : ecns.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No ECNs for this item.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rev</TableHead>
                      <TableHead>Issued By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ecns.map((ecn: any) => (
                      <TableRow key={ecn.id}>
                        <TableCell className="font-mono text-sm">{ecn.document_number}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{ecn.description}</TableCell>
                        <TableCell>
                          <Badge variant={
                            ecn.status === "Implemented" || ecn.status === "Closed" ? "default" :
                            ecn.status === "Issued" ? "secondary" :
                            "outline"
                          }>
                            {ecn.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ecn.resulting_revision ? <Badge variant="outline">{ecn.resulting_revision}</Badge> : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ecn.issuedByUser ? `${ecn.issuedByUser.firstName || ecn.issuedByUser.username}` : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ecn.issued_date ? format(new Date(ecn.issued_date), "dd MMM yyyy") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

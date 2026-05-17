import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FolderTree,
  FileCode2,
  Eye,
  Plus,
  ToggleLeft,
  ToggleRight,
  Copy,
  Shield,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────
interface DocPathTemplate {
  id: number;
  templateCode: string;
  documentType: string;
  documentCategory: string | null;
  relativePathTemplate: string;
  fileNameTemplate: string | null;
  revisionMode: string;
  fileExtension: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FolderTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  description: string | null;
  companyCode: string;
  active: boolean;
  version: string;
}

interface FolderNode {
  id: number;
  folderTemplateId: number;
  parentId: number | null;
  folderCode: string;
  folderNameTemplate: string;
  sequence: number;
  module: string | null;
  isDynamic: boolean;
  dynamicSource: string | null;
  isRevisionControlled: boolean;
  autoCreate: boolean;
  active: boolean;
}

interface PreviewNode {
  nodeId: number | null;
  folderCode: string;
  relativePath: string;
  isDynamic: boolean;
  children: PreviewNode[];
}

interface FolderTreePreview {
  templateCode: string;
  templateName: string;
  rootPath: string;
  nodes: PreviewNode[];
  totalFolders: number;
}

// ─── Doc Governance Page ──────────────────────────────────────────────────
export default function DocGovernancePage() {
  const { toast } = useToast();
  const [docSubTab, setDocSubTab] = useState<"path-templates" | "folder-templates">("path-templates");

  // ── Path Templates state ──
  const [showAddPath, setShowAddPath] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ fullPath: string; tokenErrors: string[]; valid: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [newPath, setNewPath] = useState({
    templateCode: '', documentType: '', documentCategory: '',
    relativePathTemplate: '', fileNameTemplate: '', revisionMode: 'folder', fileExtension: 'pdf',
  });

  // ── Folder Templates state ──
  const [selectedFolderTemplate, setSelectedFolderTemplate] = useState<FolderTemplate | null>(null);
  const [folderPreview, setFolderPreview] = useState<FolderTreePreview | null>(null);
  const [folderPreviewLoading, setFolderPreviewLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // ── Queries ──
  const { data: pathTemplates = [], isLoading: ptLoading, refetch: refetchPt } = useQuery<DocPathTemplate[]>({
    queryKey: ["/api/doc-path-templates"],
  });

  const { data: folderTemplates = [], isLoading: ftLoading } = useQuery<FolderTemplate[]>({
    queryKey: ["/api/folder-templates"],
  });

  const { data: folderNodes = [] } = useQuery<FolderNode[]>({
    queryKey: ["/api/folder-templates", selectedFolderTemplate?.id, "nodes"],
    queryFn: selectedFolderTemplate
      ? () => fetch(`/api/folder-templates/${selectedFolderTemplate.id}/nodes`).then(r => r.json())
      : undefined,
    enabled: !!selectedFolderTemplate,
  });

  // ── Mutations ──
  const toggleActiveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/doc-path-templates/${id}/toggle-active`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/doc-path-templates"] }); },
  });

  const createPathMutation = useMutation({
    mutationFn: (data: typeof newPath) => apiRequest("POST", "/api/doc-path-templates", data),
    onSuccess: () => {
      refetchPt();
      setShowAddPath(false);
      setNewPath({ templateCode: '', documentType: '', documentCategory: '', relativePathTemplate: '', fileNameTemplate: '', revisionMode: 'folder', fileExtension: 'pdf' });
      toast({ title: "Template created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Preview handler ──
  const handlePreview = async (pathTemplate: DocPathTemplate) => {
    setPreviewLoading(true);
    try {
      const data = await apiRequest("POST", "/api/doc-path-templates/preview", {
        relativePathTemplate: pathTemplate.relativePathTemplate,
        fileNameTemplate: pathTemplate.fileNameTemplate ?? undefined,
      });
      setPreviewResult(data);
    } catch {
      toast({ title: "Preview failed", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Folder tree preview ──
  const handleFolderPreview = async (ft: FolderTemplate) => {
    setFolderPreviewLoading(true);
    setSelectedFolderTemplate(ft);
    setFolderPreview(null);
    try {
      const data = await apiRequest("POST", `/api/folder-templates/${ft.templateCode}/preview`, {
        companyCode: "TPEL", cc: "EPC", co: "C10357", cust: "ApolloRefinery",
        fy: "2627", nnn: "017", assemblies: ["Assembly_1", "Assembly_2"],
      });
      setFolderPreview(data);
      const topKeys = new Set((data.nodes ?? []).map((n: PreviewNode) => n.relativePath));
      setExpandedNodes(topKeys as Set<string>);
    } catch (e: any) {
      const msg = e?.body?.error ?? e?.message ?? "Server error";
      toast({ title: "Preview failed", description: msg, variant: "destructive" });
    } finally {
      setFolderPreviewLoading(false);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const toggleExpand = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  function renderFolderNodes(nodes: PreviewNode[], depth = 0): JSX.Element[] {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedNodes.has(node.relativePath);
      const indent = depth * 16;
      return (
        <div key={node.relativePath}>
          <div
            className="flex items-center gap-1.5 py-0.5 px-2 rounded hover:bg-accent/50 group cursor-pointer text-sm"
            style={{ paddingLeft: `${8 + indent}px` }}
            onClick={() => hasChildren && toggleExpand(node.relativePath)}
          >
            {hasChildren ? (
              isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <FolderTree className={`h-3.5 w-3.5 shrink-0 ${node.isDynamic ? 'text-amber-500' : 'text-blue-500'}`} />
            <span className={`font-mono text-xs ${node.isDynamic ? 'text-amber-700 font-medium' : ''}`}>
              {node.folderCode}
            </span>
            {node.isDynamic && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">dynamic</Badge>
            )}
            <button
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); handleCopyPath(node.relativePath); }}
              title="Copy relative path"
            >
              {copiedPath === node.relativePath
                ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          </div>
          {hasChildren && isExpanded && (
            <div>{renderFolderNodes(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  const categoryColors: Record<string, string> = {
    Sales: "bg-blue-50 text-blue-700 border-blue-200",
    Design: "bg-purple-50 text-purple-700 border-purple-200",
    Purchase: "bg-orange-50 text-orange-700 border-orange-200",
    Production: "bg-green-50 text-green-700 border-green-200",
    Accounts: "bg-red-50 text-red-700 border-red-200",
  };

  const uniqueCategories = [...new Set(pathTemplates.map(pt => pt.documentCategory).filter(Boolean) as string[])].sort();

  const filteredPathTemplates = pathTemplates.filter(pt => {
    if (filterCategory !== "all" && pt.documentCategory !== filterCategory) return false;
    if (filterStatus === "active" && !pt.active) return false;
    if (filterStatus === "inactive" && pt.active) return false;
    return true;
  });

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <FolderTree className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Doc Governance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Document path templates and folder structure governance</p>
          </div>
        </div>

        {/* ERP-only notice */}
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Document Path Governance — ERP Phase Only</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  ERP stores only relative paths. No UNC paths, no drive letters, no local filesystem writes.
                  The Local Windows Document Agent (future phase) will prepend the physical root and create actual folders.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sub-tabs */}
        <Tabs value={docSubTab} onValueChange={(v) => setDocSubTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="path-templates" className="flex items-center gap-1.5">
              <FileCode2 className="h-4 w-4" />
              Path Templates
              <Badge variant="secondary" className="ml-1 text-xs">{pathTemplates.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="folder-templates" className="flex items-center gap-1.5">
              <FolderTree className="h-4 w-4" />
              Folder Templates
              <Badge variant="secondary" className="ml-1 text-xs">{folderTemplates.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* ── Path Templates ── */}
          <TabsContent value="path-templates" className="mt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold">Document Path Templates</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define relative path and filename patterns for each document type. Tokens like &#123;COMPANY&#125;, &#123;FY&#125;, &#123;NNN&#125; are resolved at runtime.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All modules" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All modules</SelectItem>
                    {uniqueCategories.map(cat => (
                      <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All status</SelectItem>
                    <SelectItem value="active" className="text-xs">Active only</SelectItem>
                    <SelectItem value="inactive" className="text-xs">Inactive only</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-slate-400">{filteredPathTemplates.length} template{filteredPathTemplates.length !== 1 ? "s" : ""}</span>
                <Button size="sm" onClick={() => setShowAddPath(true)} className="flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Template
                </Button>
              </div>
            </div>

            {/* Token legend */}
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="py-2.5 px-3">
                <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Available Tokens</p>
                <div className="flex flex-wrap gap-1">
                  {['{COMPANY}','{CC}','{CO}','{Cust}','{FY}','{NNN}','{PROJECT_CODE}','{DocNum}','{rev}','{ItemCode}','{CodeBars}','{Assembly}','{DocumentType}','{YYMMDD}','{ext}'].map(tok => (
                    <code key={tok} className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-mono">{tok}</code>
                  ))}
                </div>
              </CardContent>
            </Card>

            {ptLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading templates…</div>
            ) : filteredPathTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No templates match the current filters.</div>
            ) : (
              <div className="space-y-2">
                {filteredPathTemplates.map((pt) => (
                  <Card key={pt.id} className={`transition-opacity ${pt.active ? '' : 'opacity-50'}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{pt.templateCode}</span>
                            {pt.documentCategory && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${categoryColors[pt.documentCategory] ?? ''}`}>
                                {pt.documentCategory}
                              </Badge>
                            )}
                            <Badge variant={pt.active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                              {pt.active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                              {pt.revisionMode === 'folder' ? 'rev-in-folder' : 'rev-in-filename'}
                            </Badge>
                          </div>
                          <p className="text-xs font-mono text-blue-700 mt-1.5 bg-blue-50 rounded px-2 py-1 break-all">
                            📁 {pt.relativePathTemplate}
                          </p>
                          {pt.fileNameTemplate && (
                            <p className="text-xs font-mono text-purple-700 mt-1 bg-purple-50 rounded px-2 py-1 break-all">
                              📄 {pt.fileNameTemplate}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handlePreview(pt)}
                            disabled={previewLoading}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => toggleActiveMutation.mutate(pt.id)}
                            title={pt.active ? "Deactivate" : "Activate"}
                          >
                            {pt.active
                              ? <ToggleRight className="h-4 w-4 text-green-600" />
                              : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Preview result */}
            {previewResult && (
              <Card className={`border-2 ${previewResult.valid ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {previewResult.valid
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <AlertTriangle className="h-4 w-4 text-red-600" />}
                    Sample Resolved Path
                    <Button size="sm" variant="ghost" className="ml-auto h-6 w-6 p-0" onClick={() => setPreviewResult(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-3 space-y-1.5">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Folder Path</p>
                    <code className="text-xs font-mono bg-white rounded px-2 py-1 block break-all border">
                      {previewResult.fullPath.split('/').slice(0, -1).join('/')}
                    </code>
                  </div>
                  {previewResult.fullPath.includes('/') && previewResult.fullPath.split('/').pop() && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">File Name</p>
                      <code className="text-xs font-mono bg-white rounded px-2 py-1 block border">
                        {previewResult.fullPath.split('/').pop()}
                      </code>
                    </div>
                  )}
                  {previewResult.tokenErrors.length > 0 && (
                    <div className="text-xs text-red-700">
                      Unknown tokens: {previewResult.tokenErrors.map(t => `{${t}}`).join(', ')}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleCopyPath(previewResult.fullPath)}
                    >
                      <Copy className="h-3 w-3" />
                      {copiedPath === previewResult.fullPath ? "Copied!" : "Copy full path"}
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add Template Dialog */}
            <Dialog open={showAddPath} onOpenChange={setShowAddPath}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileCode2 className="h-5 w-5" />
                    Add Document Path Template
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Template Code *</Label>
                      <Input
                        placeholder="e.g. OFFER, DDS, DWG"
                        value={newPath.templateCode}
                        onChange={(e) => setNewPath(p => ({ ...p, templateCode: e.target.value.toUpperCase() }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Document Type *</Label>
                      <Input
                        placeholder="e.g. OFFER"
                        value={newPath.documentType}
                        onChange={(e) => setNewPath(p => ({ ...p, documentType: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Category</Label>
                      <Select value={newPath.documentCategory} onValueChange={(v) => setNewPath(p => ({ ...p, documentCategory: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {['Sales','Design','Purchase','Production','Accounts','After Sales'].map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Revision Mode</Label>
                      <Select value={newPath.revisionMode} onValueChange={(v) => setNewPath(p => ({ ...p, revisionMode: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="folder">folder (rev-&#123;rev&#125; in path)</SelectItem>
                          <SelectItem value="suffix">suffix (rev in filename)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Relative Path Template * <span className="text-muted-foreground">(use tokens like &#123;COMPANY&#125;, &#123;FY&#125;, &#123;rev&#125;)</span></Label>
                    <Textarea
                      placeholder="{COMPANY}/{CC}/{CO}/{Cust}/{FY}/{NNN}/1_Sales/2_Final_Offer/rev-{rev}"
                      value={newPath.relativePathTemplate}
                      onChange={(e) => setNewPath(p => ({ ...p, relativePathTemplate: e.target.value }))}
                      className="font-mono text-xs h-16 resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">File Name Template <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      placeholder="OFR-{FY}-{NNN}-rev-{rev}.pdf"
                      value={newPath.fileNameTemplate}
                      onChange={(e) => setNewPath(p => ({ ...p, fileNameTemplate: e.target.value }))}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddPath(false)}>Cancel</Button>
                  <Button
                    onClick={() => createPathMutation.mutate(newPath)}
                    disabled={createPathMutation.isPending || !newPath.templateCode || !newPath.relativePathTemplate}
                  >
                    {createPathMutation.isPending ? "Saving…" : "Save Template"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Folder Templates ── */}
          <TabsContent value="folder-templates" className="mt-4 space-y-4">
            <div>
              <h3 className="font-semibold">Folder Templates</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Named versioned folder hierarchies. Click Preview to see the full resolved tree for a sample project with 2 assemblies.
              </p>
            </div>

            {ftLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
            ) : (
              <div className="space-y-3">
                {folderTemplates.map((ft) => (
                  <Card key={ft.id} className={`transition-opacity ${ft.active ? '' : 'opacity-50'}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{ft.templateCode}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{ft.version}</Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ft.companyCode}</Badge>
                            <Badge variant={ft.active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                              {ft.active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{ft.templateName}</p>
                          {ft.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ft.description}</p>
                          )}
                          <div className="mt-1.5 text-xs text-slate-500 font-mono bg-slate-50 rounded px-2 py-1 inline-block">
                            Root: &#123;COMPANY&#125;/&#123;CC&#125;/&#123;CO&#125;/&#123;Cust&#125;/&#123;FY&#125;/&#123;NNN&#125;
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0"
                          onClick={() => handleFolderPreview(ft)}
                          disabled={folderPreviewLoading && selectedFolderTemplate?.id === ft.id}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          {folderPreviewLoading && selectedFolderTemplate?.id === ft.id ? "Loading…" : "Preview Tree"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Folder Tree Preview */}
            {folderPreview && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-blue-600" />
                        Folder Tree Preview — {folderPreview.templateCode}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Sample project: TPEL/EPC/C10357/ApolloRefinery/2627/017 · {folderPreview.totalFolders} folders · 2 assemblies
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => {
                          const allPaths: string[] = [];
                          function collect(nodes: PreviewNode[]) {
                            for (const n of nodes) { allPaths.push(n.relativePath); collect(n.children); }
                          }
                          collect(folderPreview.nodes);
                          navigator.clipboard.writeText(JSON.stringify({ ...folderPreview, flatPaths: allPaths }, null, 2));
                          toast({ title: "Copied JSON to clipboard" });
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Export JSON
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setFolderPreview(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="pt-2 pb-3 px-2">
                  <div className="text-xs text-muted-foreground px-2 mb-2 font-mono">
                    📁 {folderPreview.rootPath}/
                  </div>
                  <ScrollArea className="h-[420px]">
                    {renderFolderNodes(folderPreview.nodes)}
                  </ScrollArea>
                </CardContent>
                <Separator />
                <CardContent className="py-2 px-4">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FolderTree className="h-3 w-3 text-blue-500" />
                      Static folder
                    </span>
                    <span className="flex items-center gap-1">
                      <FolderTree className="h-3 w-3 text-amber-500" />
                      Dynamic (per assembly)
                    </span>
                    <span className="ml-auto">
                      Hover any folder → <Copy className="h-3 w-3 inline" /> to copy relative path
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Folder Node Table */}
            {selectedFolderTemplate && folderNodes.length > 0 && !folderPreview && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm">
                    Folder Nodes — {selectedFolderTemplate.templateCode}
                    <Badge variant="secondary" className="ml-2 text-xs">{folderNodes.length} nodes</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Code</th>
                          <th className="text-left px-3 py-2 font-medium">Name Template</th>
                          <th className="text-left px-3 py-2 font-medium">Module</th>
                          <th className="text-center px-3 py-2 font-medium">Dynamic</th>
                          <th className="text-center px-3 py-2 font-medium">Rev-Ctrl</th>
                          <th className="text-center px-3 py-2 font-medium">Auto-Create</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folderNodes.map((n) => (
                          <tr key={n.id} className="border-b last:border-b-0 hover:bg-accent/30">
                            <td className="px-3 py-1.5 font-mono">{n.folderCode}</td>
                            <td className="px-3 py-1.5 font-mono text-blue-700">{n.folderNameTemplate}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{n.module ?? '—'}</td>
                            <td className="px-3 py-1.5 text-center">
                              {n.isDynamic
                                ? <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">Yes — {n.dynamicSource}</Badge>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {n.isRevisionControlled
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {n.autoCreate
                                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                : <X className="h-3.5 w-3.5 text-red-400 mx-auto" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

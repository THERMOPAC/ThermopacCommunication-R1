import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Database, Files, FolderTree, HardDrive, RefreshCw, Search,
  ChevronRight, ChevronDown, FileText, AlertTriangle, Shield,
  Clock, Filter, Eye, EyeOff, Loader2, FolderOpen, Globe,
  MapPin, Building2, Calendar, FileWarning, Activity
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TreeNode {
  code: string;
  name: string;
  fileCount: number;
  totalSize: number;
  children: Record<string, TreeNode>;
}

function TreeItem({ node, depth, onSelect, selectedPath, showRawCodes }: {
  node: TreeNode; depth: number; onSelect: (filters: Record<string, string>) => void;
  selectedPath: string; showRawCodes: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const childKeys = Object.keys(node.children);
  const hasChildren = childKeys.length > 0;
  const label = showRawCodes ? `${node.name} [${node.code}]` : node.name;
  const icons = [Database, Globe, MapPin, Building2, Calendar, FolderOpen];
  const Icon = icons[Math.min(depth, icons.length - 1)];

  const filterKeys = ["", "continent", "country", "customer", "fy", "project"];
  const getFilterPath = () => {
    const parts: string[] = [];
    return node.code;
  };

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1.5 py-1.5 px-2 text-sm rounded-md hover:bg-accent transition-colors ${
          selectedPath === node.code ? "bg-accent font-medium" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          if (depth > 0 && depth <= 5) {
            const key = filterKeys[depth];
            if (key) onSelect({ [key]: node.code });
          }
        }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : <span className="w-3.5" />}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 text-left">{label}</span>
        <span className="text-xs text-muted-foreground shrink-0">{node.fileCount}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {childKeys.map(key => (
            <TreeItem key={key} node={node.children[key]} depth={depth + 1} onSelect={onSelect} selectedPath={selectedPath} showRawCodes={showRawCodes} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GcsDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperuser = user?.role === "Superuser";

  const [activeTab, setActiveTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showRawCodes, setShowRawCodes] = useState(false);
  const [showTechPath, setShowTechPath] = useState(false);
  const [selectedTreeNode, setSelectedTreeNode] = useState("");
  const [flagFilter, setFlagFilter] = useState("all");

  const summaryQuery = useQuery<any>({ queryKey: ["/api/gcs-dashboard/summary"] });
  const treeQuery = useQuery<TreeNode>({ queryKey: ["/api/gcs-dashboard/tree"] });
  const filterOptionsQuery = useQuery<any>({ queryKey: ["/api/gcs-dashboard/filters"] });

  const filesQuery = useQuery<any>({
    queryKey: ["/api/gcs-dashboard/files", page, filters, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (search) params.set("search", search);
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await fetch(`/api/gcs-dashboard/files?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
  });

  const healthQuery = useQuery<any>({
    queryKey: ["/api/gcs-dashboard/health"],
    enabled: isSuperuser,
  });

  const flaggedQuery = useQuery<any>({
    queryKey: ["/api/gcs-dashboard/flagged", flagFilter],
    queryFn: async () => {
      const res = await fetch(`/api/gcs-dashboard/flagged?flag=${flagFilter}&limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isSuperuser && activeTab === "assurance",
  });

  const permissionsQuery = useQuery<any[]>({
    queryKey: ["/api/gcs-access/permissions"],
    enabled: isSuperuser && activeTab === "access",
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gcs-dashboard/sync"),
    onSuccess: () => {
      toast({ title: "Sync completed" });
      queryClient.invalidateQueries({ queryKey: ["/api/gcs-dashboard"] });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const handleTreeSelect = (newFilters: Record<string, string>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setSelectedTreeNode(Object.values(newFilters)[0] || "");
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearch("");
    setSelectedTreeNode("");
    setPage(1);
  };

  const summary = summaryQuery.data;
  const filterOptions = filterOptionsQuery.data;
  const tree = treeQuery.data;
  const health = healthQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                GCS Document Control Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Document assurance & visibility layer over Google Cloud Storage
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="raw-codes" checked={showRawCodes} onCheckedChange={setShowRawCodes} />
                <Label htmlFor="raw-codes" className="text-xs">Raw Codes</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="tech-path" checked={showTechPath} onCheckedChange={setShowTechPath} />
                <Label htmlFor="tech-path" className="text-xs">Tech Path</Label>
              </div>
              {isSuperuser && (
                <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Sync Now
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5"><Files className="h-4 w-4" /> Dashboard</TabsTrigger>
            {isSuperuser && <TabsTrigger value="assurance" className="gap-1.5"><AlertTriangle className="h-4 w-4" /> Assurance</TabsTrigger>}
            {isSuperuser && <TabsTrigger value="access" className="gap-1.5"><Shield className="h-4 w-4" /> Access Control</TabsTrigger>}
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950"><Files className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{summary?.totalFiles?.toLocaleString() || "—"}</p>
                      <p className="text-xs text-muted-foreground">Total Files</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950"><HardDrive className="h-5 w-5 text-green-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{summary ? formatBytes(summary.totalSizeBytes) : "—"}</p>
                      <p className="text-xs text-muted-foreground">Total Storage</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950"><FolderTree className="h-5 w-5 text-purple-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{summary?.projectsCovered || "—"}</p>
                      <p className="text-xs text-muted-foreground">Projects Covered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950"><Clock className="h-5 w-5 text-orange-600" /></div>
                    <div>
                      <p className="text-sm font-medium">{summary?.lastSyncTime ? formatDate(summary.lastSyncTime) : "Never"}</p>
                      <p className="text-xs text-muted-foreground">Last Sync</p>
                      {summary?.syncInProgress && <Badge variant="outline" className="text-xs mt-1">Syncing...</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {isSuperuser && health && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <Card className={health.unresolvedCount > 0 ? "border-amber-300" : ""}>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-amber-600">{health.unresolvedCount}</p>
                    <p className="text-xs text-muted-foreground">Unresolved</p>
                  </CardContent>
                </Card>
                <Card className={health.orphanCount > 0 ? "border-red-300" : ""}>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-red-600">{health.orphanCount}</p>
                    <p className="text-xs text-muted-foreground">Orphan Files</p>
                  </CardContent>
                </Card>
                <Card className={health.nonTpelCount > 0 ? "border-orange-300" : ""}>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-orange-600">{health.nonTpelCount}</p>
                    <p className="text-xs text-muted-foreground">Non-TPEL Path</p>
                  </CardContent>
                </Card>
                <Card className={health.misplacedCount > 0 ? "border-yellow-300" : ""}>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-yellow-600">{health.misplacedCount}</p>
                    <p className="text-xs text-muted-foreground">Misplaced</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 text-center">
                    <p className="text-lg font-bold text-blue-600">{health.noProjectLinkCount}</p>
                    <p className="text-xs text-muted-foreground">No Project Link</p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex gap-4">
              <div className="w-72 shrink-0">
                <Card className="sticky top-4">
                  <CardHeader className="py-3 px-3">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <FolderTree className="h-4 w-4" /> Document Tree
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-1 pb-2 max-h-[calc(100vh-320px)] overflow-y-auto">
                    {treeQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : tree ? (
                      <TreeItem node={tree} depth={0} onSelect={handleTreeSelect} selectedPath={selectedTreeNode} showRawCodes={showRawCodes} />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No data yet. Run sync first.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex-1 min-w-0">
                <Card>
                  <CardHeader className="py-3 px-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Search file name, project, or path..." className="pl-9 h-9" value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }} />
                        </div>
                        {Object.keys(filters).length > 0 && (
                          <Button size="sm" variant="ghost" onClick={clearFilters}>Clear Filters</Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {filterOptions && (
                          <>
                            <Select value={filters.continent || ""} onValueChange={v => { setFilters(f => ({ ...f, continent: v })); setPage(1); }}>
                              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Continent" /></SelectTrigger>
                              <SelectContent>{filterOptions.continents?.map((c: any) => <SelectItem key={c.code} value={c.code}>{showRawCodes ? `${c.name} [${c.code}]` : c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filters.country || ""} onValueChange={v => { setFilters(f => ({ ...f, country: v })); setPage(1); }}>
                              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Country" /></SelectTrigger>
                              <SelectContent>{filterOptions.countries?.map((c: any) => <SelectItem key={c.code} value={c.code}>{showRawCodes ? `${c.name} [${c.code}]` : c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filters.customer || ""} onValueChange={v => { setFilters(f => ({ ...f, customer: v })); setPage(1); }}>
                              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Customer" /></SelectTrigger>
                              <SelectContent>{filterOptions.customers?.map((c: any) => <SelectItem key={c.code} value={c.code}>{showRawCodes ? `${c.name} [${c.code}]` : c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filters.fy || ""} onValueChange={v => { setFilters(f => ({ ...f, fy: v })); setPage(1); }}>
                              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="FY" /></SelectTrigger>
                              <SelectContent>{filterOptions.financialYears?.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filters.project || ""} onValueChange={v => { setFilters(f => ({ ...f, project: v })); setPage(1); }}>
                              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
                              <SelectContent>{filterOptions.projects?.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={filters.docType || ""} onValueChange={v => { setFilters(f => ({ ...f, docType: v })); setPage(1); }}>
                              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Doc Type" /></SelectTrigger>
                              <SelectContent>{filterOptions.docTypes?.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {filesQuery.isLoading ? (
                      <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : filesQuery.data?.files?.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>No files found. {summary?.totalFiles === 0 ? "Run a sync to index GCS files." : "Adjust your filters."}</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left py-2 px-3 font-medium">File Name</th>
                                <th className="text-left py-2 px-3 font-medium">Project</th>
                                {!showRawCodes && <th className="text-left py-2 px-3 font-medium">Continent</th>}
                                {!showRawCodes && <th className="text-left py-2 px-3 font-medium">Country</th>}
                                {!showRawCodes && <th className="text-left py-2 px-3 font-medium">Customer</th>}
                                <th className="text-left py-2 px-3 font-medium">FY</th>
                                <th className="text-left py-2 px-3 font-medium">Doc Type</th>
                                <th className="text-right py-2 px-3 font-medium">Size</th>
                                <th className="text-left py-2 px-3 font-medium">Updated</th>
                                {showTechPath && <th className="text-left py-2 px-3 font-medium">Path</th>}
                                <th className="text-center py-2 px-3 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filesQuery.data?.files?.map((f: any) => (
                                <tr key={f.id} className="border-b hover:bg-muted/30 transition-colors">
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="truncate max-w-[200px]" title={f.file_name}>{f.file_name}</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono text-xs">{f.project_code || "—"}</td>
                                  {!showRawCodes && <td className="py-2 px-3 text-xs">{f.continent_name || "—"}</td>}
                                  {!showRawCodes && <td className="py-2 px-3 text-xs">{f.country_name || "—"}</td>}
                                  {!showRawCodes && <td className="py-2 px-3 text-xs truncate max-w-[140px]" title={f.customer_name}>{f.customer_name || "—"}</td>}
                                  <td className="py-2 px-3 text-xs">{showRawCodes ? f.fy_code : (f.fy_label || f.fy_code || "—")}</td>
                                  <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{f.doc_type || "—"}</Badge></td>
                                  <td className="py-2 px-3 text-right text-xs text-muted-foreground">{f.size_bytes ? formatBytes(Number(f.size_bytes)) : "—"}</td>
                                  <td className="py-2 px-3 text-xs text-muted-foreground">{formatDate(f.gcs_updated_at)}</td>
                                  {showTechPath && <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground truncate max-w-[300px]" title={f.file_path}>{f.file_path}</td>}
                                  <td className="py-2 px-3 text-center">
                                    {f.is_resolved ? (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">OK</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                        <AlertTriangle className="h-3 w-3 mr-0.5" /> Unresolved
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {filesQuery.data && filesQuery.data.totalPages > 1 && (
                          <div className="flex items-center justify-between px-4 py-3 border-t">
                            <p className="text-xs text-muted-foreground">
                              Page {filesQuery.data.page} of {filesQuery.data.totalPages} ({filesQuery.data.total} files)
                            </p>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                              <Button size="sm" variant="outline" disabled={page >= filesQuery.data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {isSuperuser && (
            <TabsContent value="assurance" className="mt-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" /> Document Assurance Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Files flagged for attention during sync. These require review but do not block normal operations.
                    </p>
                    <div className="flex gap-2 mb-4">
                      {[
                        { val: "all", label: "All Flags" },
                        { val: "orphan", label: "Orphan" },
                        { val: "non_tpel", label: "Non-TPEL" },
                        { val: "misplaced", label: "Misplaced" },
                        { val: "unresolved", label: "Unresolved" },
                      ].map(f => (
                        <Button key={f.val} size="sm" variant={flagFilter === f.val ? "default" : "outline"}
                          onClick={() => setFlagFilter(f.val)}>{f.label}</Button>
                      ))}
                    </div>
                    {flaggedQuery.isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : flaggedQuery.data?.files?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>No flagged files found. All clear.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left py-2 px-3 font-medium">File Path</th>
                              <th className="text-left py-2 px-3 font-medium">Project</th>
                              <th className="text-left py-2 px-3 font-medium">Flags</th>
                              <th className="text-left py-2 px-3 font-medium">Unresolved</th>
                            </tr>
                          </thead>
                          <tbody>
                            {flaggedQuery.data?.files?.map((f: any) => (
                              <tr key={f.id} className="border-b hover:bg-muted/30">
                                <td className="py-2 px-3 font-mono text-xs truncate max-w-[400px]" title={f.file_path}>{f.file_path}</td>
                                <td className="py-2 px-3 text-xs">{f.project_code || "—"}</td>
                                <td className="py-2 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {(f.assurance_flags || []).map((flag: string) => (
                                      <Badge key={flag} variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">{flag.replace(/_/g, " ")}</Badge>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {(f.unresolved_fields || []).map((field: string) => (
                                      <Badge key={field} variant="outline" className="text-[10px] bg-amber-50 text-amber-700">{field}</Badge>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {flaggedQuery.data && flaggedQuery.data.total > 100 && (
                          <p className="text-xs text-muted-foreground px-3 py-2">Showing first 100 of {flaggedQuery.data.total} flagged files</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {isSuperuser && (
            <TabsContent value="access" className="mt-4">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> GCS Access Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manage user access to GCS document control data. By default, users see only files belonging to projects they are assigned to.
                    Additional project-level access can be granted here.
                  </p>
                  {permissionsQuery.isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : (permissionsQuery.data || []).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>No additional GCS access permissions configured.</p>
                      <p className="text-xs mt-1">Users rely on project membership for access.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left py-2 px-3 font-medium">User</th>
                            <th className="text-left py-2 px-3 font-medium">Role</th>
                            <th className="text-left py-2 px-3 font-medium">Project</th>
                            <th className="text-left py-2 px-3 font-medium">Access Level</th>
                            <th className="text-left py-2 px-3 font-medium">Granted By</th>
                            <th className="text-left py-2 px-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(permissionsQuery.data || []).map((p: any) => (
                            <tr key={p.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-3">{p.first_name} {p.last_name} ({p.username})</td>
                              <td className="py-2 px-3 text-xs">{p.role}</td>
                              <td className="py-2 px-3 text-xs">{p.project_code ? `${p.project_code} — ${p.project_name}` : "All Projects"}</td>
                              <td className="py-2 px-3"><Badge variant="outline">{p.access_level}</Badge></td>
                              <td className="py-2 px-3 text-xs">{p.granted_by_name}</td>
                              <td className="py-2 px-3">
                                <Badge variant={p.is_active ? "default" : "secondary"}>
                                  {p.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

import { useState } from "react";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  Database, Files, FolderTree, HardDrive, RefreshCw, Search,
  ChevronRight, ChevronDown, FileText, AlertTriangle, Shield,
  Clock, Loader2, FolderOpen, Folder, Home,
  Building2, Calendar, Activity, CheckCircle2, XCircle,
  ArrowLeft, ArrowRight, LayoutGrid, List, Eye,
  Download, FileWarning, Info, ChevronLeft, BarChart3
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(d: string | null): string {
  return fmtDate(d);
}

function formatDateTime(d: string | null): string {
  if (!d) return "Never";
  return fmtDateTime(d);
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const iconColors: Record<string, string> = {
    pdf: "text-red-500", xlsx: "text-green-600", xls: "text-green-600",
    doc: "text-blue-600", docx: "text-blue-600", dwg: "text-orange-500",
    dxf: "text-orange-500", jpg: "text-purple-500", jpeg: "text-purple-500",
    png: "text-purple-500", zip: "text-yellow-600", rar: "text-yellow-600",
  };
  return iconColors[ext] || "text-gray-400";
}

function getDocTypeLabel(docType: string | null): string {
  if (!docType) return "";
  const labels: Record<string, string> = {
    '3D': '3D Model', 'BEDD': 'Basic Engineering', 'STD': 'Standard Drawing',
    'PID': 'P&ID', 'MHB': 'Material Handling', 'HAZ': 'Hazard Analysis',
    'QAP': 'Quality Plan', 'TIE': 'Tie-In', 'GA': 'General Arrangement',
    'FDN': 'Foundation', 'ELC': 'Electrical', 'PRG': 'Progress Report',
    'CEF': 'Cost Estimate', 'DSA': 'Design Safety', 'INR': 'Inspection Report',
    'DCA': 'Document Change', 'OMM': 'O&M Manual', 'DWG': 'Drawing',
    'ECR': 'Engineering Change Request', 'ECN': 'Engineering Change Notice',
    'IAT': 'Inspection & Test', 'INS': 'Inspection', 'QTN': 'Quotation',
    'BOM': 'Bill of Materials', 'WO': 'Work Order', 'PO': 'Purchase Order',
  };
  return labels[docType] || docType;
}

interface TreeNode {
  code: string;
  name: string;
  fileCount: number;
  totalSize: number;
  children: Record<string, TreeNode>;
  isNonTpel?: boolean;
}

function SidebarTree({ node, depth, onSelect, selectedPath }: {
  node: TreeNode; depth: number; onSelect: (code: string, depth: number, isNonTpel?: boolean) => void;
  selectedPath: string;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const childKeys = Object.keys(node.children);
  const hasChildren = childKeys.length > 0;
  const isSelected = selectedPath === node.code;
  const depthColors = [
    "text-blue-600", "text-emerald-600", "text-violet-600",
    "text-amber-600", "text-cyan-600", "text-rose-600"
  ];
  const iconColor = depthColors[Math.min(depth, depthColors.length - 1)];

  return (
    <div>
      <button
        className={`w-full flex items-center gap-2 py-2 px-3 text-sm rounded-lg transition-all duration-150 ${
          isSelected
            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
            : "hover:bg-muted/80 text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect(node.code, depth, node.isNonTpel);
        }}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : <span className="w-3.5" />}
        {depth === 0
          ? <Database className={`h-4 w-4 shrink-0 ${iconColor}`} />
          : hasChildren
            ? <FolderOpen className={`h-4 w-4 shrink-0 ${iconColor}`} />
            : <Folder className={`h-4 w-4 shrink-0 ${iconColor}`} />
        }
        <span className="truncate flex-1 text-left">{node.name}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0 font-normal">
          {node.fileCount.toLocaleString()}
        </Badge>
      </button>
      {expanded && hasChildren && (
        <div className="mt-0.5">
          {childKeys.sort((a, b) => {
            const na = node.children[a].name;
            const nb = node.children[b].name;
            return na.localeCompare(nb);
          }).map(key => (
            <SidebarTree
              key={key}
              node={node.children[key]}
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
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

  const [activeTab, setActiveTab] = useState("browse");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedTreeNode, setSelectedTreeNode] = useState("");
  const [flagFilter, setFlagFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

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
      toast({ title: "Sync completed successfully", description: "All files have been indexed from Google Cloud Storage." });
      queryClient.invalidateQueries({ queryKey: ["/api/gcs-dashboard"] });
    },
    onError: () => toast({ title: "Sync failed", description: "Could not sync with Google Cloud Storage. Please try again.", variant: "destructive" }),
  });

  const handleTreeSelect = (code: string, depth: number, isNonTpel?: boolean) => {
    if (isNonTpel || (depth === 1 && code !== 'TPEL' && tree?.children?.[code]?.isNonTpel)) {
      setFilters({ rootFolder: code + '/' });
      setSelectedTreeNode(code);
      setPage(1);
      return;
    }
    if (depth === 1 && code === 'TPEL') {
      setFilters({});
      setSelectedTreeNode(code);
      setPage(1);
      return;
    }
    const tpelFilterKeys = ["", "", "continent", "country", "customer", "fy", "project"];
    const key = tpelFilterKeys[depth];
    if (key) {
      setFilters(prev => ({ ...prev, [key]: code }));
      setSelectedTreeNode(code);
      setPage(1);
    }
  };

  const clearFilters = () => {
    setFilters({});
    setSearch("");
    setSelectedTreeNode("");
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);

  const summary = summaryQuery.data;
  const filterOptions = filterOptionsQuery.data;
  const tree = treeQuery.data;
  const health = healthQuery.data;

  const healthScore = health
    ? Math.max(0, Math.round(((health.totalFiles - health.unresolvedCount) / Math.max(health.totalFiles, 1)) * 100))
    : null;

  return (
    <Layout>
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Document Storage</h1>
                <p className="text-sm text-muted-foreground">
                  Browse and manage files across Google Cloud Storage
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {summary?.lastSyncTime && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                        <Clock className="h-3.5 w-3.5" />
                        Last synced {formatDateTime(summary.lastSyncTime)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Files are automatically synced every 10 minutes</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isSuperuser && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4" />
                  }
                  {syncMutation.isPending ? "Syncing..." : "Sync Now"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">
                    {summaryQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (summary?.totalFiles?.toLocaleString() || "0")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Total Files</p>
                </div>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                  <Files className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                    {summaryQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (summary ? formatBytes(summary.totalSizeBytes) : "0 B")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Storage Used</p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                  <HardDrive className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/30 dark:to-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold text-violet-700 dark:text-violet-400">
                    {summaryQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (summary?.projectsCovered || "0")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Projects</p>
                </div>
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50">
                  <FolderTree className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {isSuperuser && healthScore !== null ? (
            <Card className={`border-0 shadow-sm ${
              healthScore >= 90
                ? "bg-gradient-to-br from-green-50 to-white dark:from-green-950/30 dark:to-card"
                : healthScore >= 70
                  ? "bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-card"
                  : "bg-gradient-to-br from-red-50 to-white dark:from-red-950/30 dark:to-card"
            }`}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-3xl font-bold ${
                      healthScore >= 90 ? "text-green-700 dark:text-green-400"
                        : healthScore >= 70 ? "text-amber-700 dark:text-amber-400"
                          : "text-red-700 dark:text-red-400"
                    }`}>{healthScore}%</p>
                    <p className="text-sm text-muted-foreground mt-1">Health Score</p>
                  </div>
                  <div className={`p-2 rounded-lg ${
                    healthScore >= 90 ? "bg-green-100 dark:bg-green-900/50"
                      : healthScore >= 70 ? "bg-amber-100 dark:bg-amber-900/50"
                        : "bg-red-100 dark:bg-red-900/50"
                  }`}>
                    {healthScore >= 90
                      ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    }
                  </div>
                </div>
                <Progress
                  value={healthScore}
                  className="mt-2 h-1.5"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/30 dark:to-card">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold text-orange-700 dark:text-orange-400">
                      {summary?.lastSyncTime ? formatDate(summary.lastSyncTime) : "Not synced"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Last Sync</p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/50">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="browse" className="gap-1.5 data-[state=active]:bg-background">
                <FolderOpen className="h-4 w-4" /> Browse Files
              </TabsTrigger>
              {isSuperuser && (
                <TabsTrigger value="assurance" className="gap-1.5 data-[state=active]:bg-background">
                  <Activity className="h-4 w-4" /> Assurance
                  {health && (health.orphanCount + health.unresolvedCount + health.nonTpelCount + health.misplacedCount) > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                      {health.orphanCount + health.unresolvedCount + health.nonTpelCount + health.misplacedCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {isSuperuser && (
                <TabsTrigger value="access" className="gap-1.5 data-[state=active]:bg-background">
                  <Shield className="h-4 w-4" /> Access Control
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="browse" className="mt-0">
            <div className="flex gap-5">
              <div className="w-72 shrink-0">
                <Card className="border-0 shadow-sm sticky top-20">
                  <CardHeader className="py-3 px-4 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <FolderTree className="h-4 w-4 text-primary" /> Folder Tree
                      </CardTitle>
                      {selectedTreeNode && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={clearFilters}>
                          <Home className="h-3 w-3 mr-1" /> Reset
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                    {treeQuery.isLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Loading folders...</p>
                      </div>
                    ) : tree ? (
                      <SidebarTree
                        node={tree}
                        depth={0}
                        onSelect={handleTreeSelect}
                        selectedPath={selectedTreeNode}
                      />
                    ) : (
                      <div className="text-center py-10">
                        <FolderOpen className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No folders yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Click "Sync Now" to index files</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex-1 min-w-0">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="py-3 px-4 border-b">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search files by name, project code, or path..."
                            className="pl-9 h-9 border-muted"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                          />
                        </div>
                        <div className="flex items-center border rounded-md">
                          <Button
                            size="sm"
                            variant={viewMode === "table" ? "secondary" : "ghost"}
                            className="h-9 px-2.5 rounded-r-none"
                            onClick={() => setViewMode("table")}
                          >
                            <List className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            className="h-9 px-2.5 rounded-l-none"
                            onClick={() => setViewMode("grid")}
                          >
                            <LayoutGrid className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {filterOptions && (
                          <>
                            <Select value={filters.continent || ""} onValueChange={v => { setFilters(f => ({ ...f, continent: v === "all" ? "" : v })); setPage(1); }}>
                              <SelectTrigger className="w-[130px] h-8 text-xs border-dashed">
                                <SelectValue placeholder="Region" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Regions</SelectItem>
                                {filterOptions.continents?.map((c: any) => (
                                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={filters.country || ""} onValueChange={v => { setFilters(f => ({ ...f, country: v === "all" ? "" : v })); setPage(1); }}>
                              <SelectTrigger className="w-[140px] h-8 text-xs border-dashed">
                                <SelectValue placeholder="Country" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Countries</SelectItem>
                                {filterOptions.countries?.map((c: any) => (
                                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={filters.customer || ""} onValueChange={v => { setFilters(f => ({ ...f, customer: v === "all" ? "" : v })); setPage(1); }}>
                              <SelectTrigger className="w-[160px] h-8 text-xs border-dashed">
                                <SelectValue placeholder="Customer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Customers</SelectItem>
                                {filterOptions.customers?.map((c: any) => (
                                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={filters.fy || ""} onValueChange={v => { setFilters(f => ({ ...f, fy: v === "all" ? "" : v })); setPage(1); }}>
                              <SelectTrigger className="w-[110px] h-8 text-xs border-dashed">
                                <SelectValue placeholder="Year" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Years</SelectItem>
                                {filterOptions.financialYears?.map((c: any) => (
                                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={filters.docType || ""} onValueChange={v => { setFilters(f => ({ ...f, docType: v === "all" ? "" : v })); setPage(1); }}>
                              <SelectTrigger className="w-[130px] h-8 text-xs border-dashed">
                                <SelectValue placeholder="Doc Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {filterOptions.docTypes?.map((c: any) => (
                                  <SelectItem key={c.code} value={c.code}>{getDocTypeLabel(c.name) !== c.name ? `${getDocTypeLabel(c.name)} (${c.name})` : c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </>
                        )}
                        {activeFilterCount > 0 && (
                          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={clearFilters}>
                            <XCircle className="h-3.5 w-3.5" />
                            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {filesQuery.isLoading ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                        <p className="text-sm text-muted-foreground">Loading files...</p>
                      </div>
                    ) : filesQuery.data?.files?.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                          <FileText className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                        <h3 className="font-medium text-foreground mb-1">No files found</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                          {summary?.totalFiles === 0
                            ? "The file index is empty. Click \"Sync Now\" to scan and index all files from Google Cloud Storage."
                            : "No files match your current filters. Try adjusting or clearing the filters."}
                        </p>
                        {activeFilterCount > 0 && (
                          <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>
                            Clear All Filters
                          </Button>
                        )}
                      </div>
                    ) : viewMode === "grid" ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                          {filesQuery.data?.files?.map((f: any) => (
                            <Card key={f.id} className="border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group">
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <FileText className={`h-8 w-8 shrink-0 mt-0.5 ${getFileIcon(f.file_name)}`} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors" title={f.file_name}>
                                      {f.file_name}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {f.doc_type && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                          {f.doc_type}
                                        </Badge>
                                      )}
                                      <span className="text-[10px] text-muted-foreground">
                                        {f.size_bytes ? formatBytes(Number(f.size_bytes)) : ""}
                                      </span>
                                    </div>
                                    {f.project_code && (
                                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                                        {f.project_code}
                                      </p>
                                    )}
                                    <div className="flex items-center justify-between mt-2">
                                      <span className="text-[10px] text-muted-foreground">{formatDate(f.gcs_updated_at)}</span>
                                      {!f.is_resolved && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                            </TooltipTrigger>
                                            <TooltipContent>This file has unresolved mapping issues</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                        {filesQuery.data && filesQuery.data.totalPages > 1 && (
                          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                            <p className="text-sm text-muted-foreground">
                              Showing {((filesQuery.data.page - 1) * filesQuery.data.limit) + 1}–{Math.min(filesQuery.data.page * filesQuery.data.limit, filesQuery.data.total)} of {filesQuery.data.total.toLocaleString()} files
                            </p>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
                                <ChevronLeft className="h-4 w-4" /> Previous
                              </Button>
                              <div className="px-3 text-sm text-muted-foreground">
                                {filesQuery.data.page} / {filesQuery.data.totalPages}
                              </div>
                              <Button size="sm" variant="outline" disabled={page >= filesQuery.data.totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
                                Next <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">File Name</th>
                                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Project</th>
                                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Customer</th>
                                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                                <th className="text-right py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Size</th>
                                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Modified</th>
                                <th className="text-center py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {filesQuery.data?.files?.map((f: any) => (
                                <tr key={f.id} className="hover:bg-muted/20 transition-colors group">
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <FileText className={`h-4 w-4 shrink-0 ${getFileIcon(f.file_name)}`} />
                                      <span className="truncate max-w-[220px] font-medium group-hover:text-primary transition-colors" title={f.file_name}>
                                        {f.file_name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    {f.project_code ? (
                                      <span className="text-xs font-mono bg-muted/50 px-2 py-0.5 rounded">
                                        {f.project_code}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground/50">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <span className="text-xs truncate max-w-[140px] block" title={f.customer_name}>
                                      {f.customer_name || <span className="text-muted-foreground/50">—</span>}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    {f.doc_type ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Badge variant="outline" className="text-[11px] font-mono">
                                              {f.doc_type}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>{getDocTypeLabel(f.doc_type)}</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <span className="text-muted-foreground/50">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 text-right">
                                    <span className="text-xs text-muted-foreground">
                                      {f.size_bytes ? formatBytes(Number(f.size_bytes)) : "—"}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <span className="text-xs text-muted-foreground">{formatDate(f.gcs_updated_at)}</span>
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    {f.is_resolved ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                          </TooltipTrigger>
                                          <TooltipContent>All fields resolved</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            Unresolved fields: {(f.unresolved_fields || []).join(', ')}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {filesQuery.data && filesQuery.data.totalPages > 1 && (
                          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                            <p className="text-sm text-muted-foreground">
                              Showing {((filesQuery.data.page - 1) * filesQuery.data.limit) + 1}–{Math.min(filesQuery.data.page * filesQuery.data.limit, filesQuery.data.total)} of {filesQuery.data.total.toLocaleString()} files
                            </p>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
                                <ChevronLeft className="h-4 w-4" /> Previous
                              </Button>
                              <div className="px-3 text-sm text-muted-foreground">
                                {filesQuery.data.page} / {filesQuery.data.totalPages}
                              </div>
                              <Button size="sm" variant="outline" disabled={page >= filesQuery.data.totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
                                Next <ChevronRight className="h-4 w-4" />
                              </Button>
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
            <TabsContent value="assurance" className="mt-0">
              <div className="space-y-5">
                {health && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: "Unresolved Mappings", count: health.unresolvedCount, color: "amber", icon: FileWarning, desc: "Files where customer, project, or region could not be auto-identified" },
                      { label: "Orphan Files", count: health.orphanCount, color: "red", icon: XCircle, desc: "Files referencing a project code that doesn't exist in the system" },
                      { label: "Non-TPEL Path", count: health.nonTpelCount, color: "orange", icon: AlertTriangle, desc: "Files stored outside the standard TPEL folder hierarchy" },
                      { label: "Misplaced", count: health.misplacedCount, color: "yellow", icon: Info, desc: "Files in TPEL but missing expected folder depth" },
                      { label: "No Project Link", count: health.noProjectLinkCount, color: "blue", icon: Eye, desc: "TPEL files that could not be linked to a system project" },
                    ].map(item => {
                      const colorMap: Record<string, string> = {
                        amber: "from-amber-50 dark:from-amber-950/30",
                        red: "from-red-50 dark:from-red-950/30",
                        orange: "from-orange-50 dark:from-orange-950/30",
                        yellow: "from-yellow-50 dark:from-yellow-950/30",
                        blue: "from-blue-50 dark:from-blue-950/30",
                      };
                      const textColor: Record<string, string> = {
                        amber: "text-amber-700 dark:text-amber-400",
                        red: "text-red-700 dark:text-red-400",
                        orange: "text-orange-700 dark:text-orange-400",
                        yellow: "text-yellow-700 dark:text-yellow-400",
                        blue: "text-blue-700 dark:text-blue-400",
                      };
                      return (
                        <TooltipProvider key={item.label}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Card className={`border-0 shadow-sm bg-gradient-to-br ${colorMap[item.color]} to-white dark:to-card cursor-help`}>
                                <CardContent className="pt-4 pb-3 text-center">
                                  <item.icon className={`h-5 w-5 mx-auto mb-1.5 ${textColor[item.color]}`} />
                                  <p className={`text-2xl font-bold ${textColor[item.color]}`}>{item.count}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                                </CardContent>
                              </Card>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[250px]">{item.desc}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                )}

                <Card className="border-0 shadow-sm">
                  <CardHeader className="py-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" /> Flagged Files
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Files that need attention — these don't block operations but should be reviewed.
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {[
                        { val: "all", label: "All Issues", icon: BarChart3 },
                        { val: "orphan", label: "Orphan", icon: XCircle },
                        { val: "non_tpel", label: "Non-TPEL", icon: AlertTriangle },
                        { val: "misplaced", label: "Misplaced", icon: Info },
                        { val: "unresolved", label: "Unresolved", icon: FileWarning },
                      ].map(f => (
                        <Button
                          key={f.val}
                          size="sm"
                          variant={flagFilter === f.val ? "default" : "outline"}
                          className="gap-1.5 text-xs"
                          onClick={() => setFlagFilter(f.val)}
                        >
                          <f.icon className="h-3.5 w-3.5" />
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {flaggedQuery.isLoading ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                        <p className="text-sm text-muted-foreground">Loading flagged files...</p>
                      </div>
                    ) : flaggedQuery.data?.files?.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 className="h-8 w-8 text-green-500" />
                        </div>
                        <h3 className="font-medium text-foreground mb-1">All Clear</h3>
                        <p className="text-sm text-muted-foreground">No flagged files found for the selected category.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">File</th>
                              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Location</th>
                              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Project</th>
                              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Issues</th>
                              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Missing Fields</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {flaggedQuery.data?.files?.map((f: any) => {
                              const pathParts = (f.file_path || '').split('/');
                              const fileName = pathParts.pop() || '';
                              const folderPath = pathParts.join('/');
                              return (
                                <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <FileText className={`h-4 w-4 shrink-0 ${getFileIcon(fileName)}`} />
                                      <span className="truncate max-w-[200px] font-medium" title={fileName}>{fileName}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[250px] block" title={folderPath}>
                                      {folderPath || '/'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    {f.project_code ? (
                                      <span className="text-xs font-mono bg-muted/50 px-2 py-0.5 rounded">{f.project_code}</span>
                                    ) : (
                                      <span className="text-muted-foreground/50 text-xs">None</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex flex-wrap gap-1">
                                      {(f.assurance_flags || []).map((flag: string) => {
                                        const flagColors: Record<string, string> = {
                                          orphan_no_project_match: "bg-red-50 text-red-700 border-red-200",
                                          non_tpel_path: "bg-orange-50 text-orange-700 border-orange-200",
                                          misplaced_no_project_folder: "bg-yellow-50 text-yellow-700 border-yellow-200",
                                          unresolved_mapping: "bg-amber-50 text-amber-700 border-amber-200",
                                        };
                                        const flagLabels: Record<string, string> = {
                                          orphan_no_project_match: "Orphan",
                                          non_tpel_path: "Non-TPEL",
                                          misplaced_no_project_folder: "Misplaced",
                                          unresolved_mapping: "Unresolved",
                                        };
                                        return (
                                          <Badge key={flag} variant="outline" className={`text-[10px] ${flagColors[flag] || ""}`}>
                                            {flagLabels[flag] || flag.replace(/_/g, " ")}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex flex-wrap gap-1">
                                      {(f.unresolved_fields || []).map((field: string) => (
                                        <Badge key={field} variant="secondary" className="text-[10px] capitalize">{field}</Badge>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {flaggedQuery.data && flaggedQuery.data.total > 100 && (
                          <div className="px-4 py-3 border-t bg-muted/20">
                            <p className="text-xs text-muted-foreground">
                              Showing first 100 of {flaggedQuery.data.total.toLocaleString()} flagged files
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {isSuperuser && (
            <TabsContent value="access" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Access Permissions
                  </CardTitle>
                  <CardDescription>
                    By default, users see files from projects they're assigned to. Additional access can be granted below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {permissionsQuery.isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                      <p className="text-sm text-muted-foreground">Loading permissions...</p>
                    </div>
                  ) : (permissionsQuery.data || []).length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                        <Shield className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                      <h3 className="font-medium text-foreground mb-1">No Extra Permissions</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        No additional access permissions configured. Users can see files from their assigned projects.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">User</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Department</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Project</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Access</th>
                            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Granted By</th>
                            <th className="text-center py-2.5 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(permissionsQuery.data || []).map((p: any) => (
                            <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                              <td className="py-2.5 px-4">
                                <div>
                                  <p className="font-medium">{p.first_name} {p.last_name}</p>
                                  <p className="text-xs text-muted-foreground">{p.role}</p>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-xs">{p.department || "—"}</td>
                              <td className="py-2.5 px-4">
                                {p.project_code ? (
                                  <div>
                                    <span className="text-xs font-mono bg-muted/50 px-2 py-0.5 rounded">{p.project_code}</span>
                                    {p.project_name && <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[200px]">{p.project_name}</p>}
                                  </div>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">All Projects</Badge>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                <Badge variant="outline" className="capitalize">{p.access_level}</Badge>
                              </td>
                              <td className="py-2.5 px-4 text-xs text-muted-foreground">{p.granted_by_name}</td>
                              <td className="py-2.5 px-4 text-center">
                                {p.is_active ? (
                                  <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Active</Badge>
                                ) : (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
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
    </Layout>
  );
}

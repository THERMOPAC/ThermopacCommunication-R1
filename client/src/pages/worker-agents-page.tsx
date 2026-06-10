import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Timer,
  ListChecks,
  Users,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
  Radio,
  Info,
  Download,
  ScanSearch,
  FilePen,
  ShieldCheck,
  FolderTree,
  FileCode2,
  Eye,
  Plus,
  ToggleLeft,
  ToggleRight,
  Copy,
  Shield,
  GitBranch,
  HardDrive,
  FolderOpen,
  FileCheck2,
  FilePlus,
  ServerCrash,
  Wifi,
  WifiOff,
  Hash,
  Trash2,
  ServerOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const SOLIDWORKS_EXTRACTOR_PY = `"""
solidworks_extractor.py — Opens a dedicated SolidWorks instance and runs all
10 extraction modules sequentially.

Safety contract (from baseline v3):
  - Always DispatchEx() — never attaches to user's running session
  - swApp.Visible = False always
  - OpenDoc6 with ReadOnly | Silent flags
  - CloseDoc + ExitApp always in finally block
  - Never calls Save / SaveAs
  - Works on temp copy only
  - Checks cancel_event between modules
"""

from __future__ import annotations
import os
import threading
import time

try:
    import win32com.client
    import pythoncom
    PYWIN32_AVAILABLE = True
except ImportError:
    PYWIN32_AVAILABLE = False

from extractor.extract_properties    import ExtractProperties
from extractor.extract_sheets        import ExtractSheets
from extractor.extract_views         import ExtractViews
from extractor.extract_dimensions    import ExtractDimensions
from extractor.extract_annotations   import ExtractAnnotations
from extractor.extract_tables        import ExtractTables
from extractor.extract_references    import ExtractReferences
from extractor.extract_health        import ExtractHealth
from extractor.extract_nozzles       import ExtractNozzles
from extractor.extract_design_data   import ExtractDesignDataTable, DesignDataNotFoundError

# SolidWorks constants
SW_DOC_DRAWING           = 3
SW_OPEN_SILENT           = 1
SW_OPEN_READ_ONLY        = 2
SW_OPEN_VIEW_ONLY        = 4
SW_OPEN_RAPID_DRAFT      = 8
SW_OPEN_LOAD_MODEL       = 16
SW_OPEN_OVERRIDE_DEFAULT = 64
SW_OPEN_LOAD_LIGHTWEIGHT = 128


def run_extraction(temp_path: str, config, cancel_event: threading.Event,
                   logger) -> dict:
    """
    Main entry point called by job_runner in a worker thread.
    Returns the full extraction result dict (without agent metadata — runner stamps that).
    Raises on hard failure (DesignDataNotFoundError, SW launch failure, etc.).
    """
    if not PYWIN32_AVAILABLE:
        raise RuntimeError(
            "pywin32 not available — this agent must run on Windows with pywin32 installed."
        )

    import hashlib
    file_size = os.path.getsize(temp_path)
    sha256    = _sha256(temp_path)
    filename  = os.path.basename(temp_path)

    logger.info(f"[Extractor] Starting: file={filename} size={file_size:,} bytes")
    logger.info(f"[Extractor] Using ProgID: {config.sw_progid}")

    result = {
        "schema_version": "1.0",
        "agent":          {},        # stamped by runner
        "file": {
            "original_filename": filename,
            "file_size_bytes":   file_size,
            "sha256":            sha256,
        },
        "properties":         {},
        "sheets":             [],
        "views":              [],
        "dimensions":         {},
        "annotations":        {},
        "tables":             {},
        "references":         {},
        "health":             {},
        "nozzles":            {},
        "design_data_table":  {},
        "extraction_errors": {
            "properties":        None,
            "sheets":            None,
            "views":             None,
            "dimensions":        None,
            "annotations":       None,
            "tables":            None,
            "references":        None,
            "health":            None,
            "nozzles":           None,
            "design_data_table": None,
        },
    }

    swApp  = None
    swModel = None

    try:
        # -- COM initialisation (must be called in each thread) -----------------
        pythoncom.CoInitialize()

        # -- Launch dedicated SW instance ---------------------------------------
        _check_cancel(cancel_event, "before SW launch")
        logger.info(f"[Extractor] Launching SolidWorks ({config.sw_progid})...")
        t_launch = time.monotonic()
        swApp = win32com.client.DispatchEx(config.sw_progid)
        swApp.Visible = config.sw_visible
        swApp.UserControlBackground = True
        logger.info(f"[Extractor] SolidWorks ready ({time.monotonic() - t_launch:.1f}s)")

        # -- Open document (read-only, silent) ----------------------------------
        _check_cancel(cancel_event, "before OpenDoc6")
        options = SW_OPEN_READ_ONLY | SW_OPEN_SILENT | SW_OPEN_RAPID_DRAFT
        errors   = 0
        warnings = 0
        logger.info(f"[Extractor] Opening: {temp_path}")
        # OpenDoc6(FileName, Type, Options, Configuration, Errors, Warnings)
        swModel = swApp.OpenDoc6(temp_path, SW_DOC_DRAWING, options, "", errors, warnings)
        if swModel is None:
            raise RuntimeError(f"OpenDoc6 returned None — cannot open {filename}. "
                               f"Errors={errors} Warnings={warnings}")
        logger.info(f"[Extractor] Document open (errors={errors} warnings={warnings})")

        # SolidWorks DrawingDoc interface
        swDraw = swModel  # IDrawingDoc is the same COM object for .slddrw

        # -- Run modules -------------------------------------------------------
        modules = [
            ("properties",        lambda: ExtractProperties(swApp, swModel, logger)),
            ("sheets",            lambda: ExtractSheets(swApp, swModel, swDraw, logger)),
            ("views",             lambda: ExtractViews(swApp, swModel, swDraw, logger)),
            ("dimensions",        lambda: ExtractDimensions(swApp, swModel, swDraw, logger)),
            ("annotations",       lambda: ExtractAnnotations(swApp, swModel, swDraw, logger)),
            ("tables",            lambda: ExtractTables(swApp, swModel, swDraw, logger)),
            ("references",        lambda: ExtractReferences(swApp, swModel, swDraw, logger)),
            ("health",            lambda: ExtractHealth(swApp, swModel, swDraw, logger)),
            ("nozzles",           lambda: ExtractNozzles(swApp, swModel, swDraw, logger)),
            ("design_data_table", lambda: ExtractDesignDataTable(swApp, swModel, swDraw, logger)),
        ]

        for key, fn in modules:
            _check_cancel(cancel_event, f"before {key}")
            t0 = time.monotonic()
            try:
                result[key] = fn()
                logger.debug(f"[Extractor] {key} OK ({time.monotonic() - t0:.2f}s)")
            except DesignDataNotFoundError:
                # Hard failure -- re-raise to caller
                raise
            except Exception as e:
                err_msg = f"{type(e).__name__}: {e}"
                logger.error(f"[Extractor] {key} SOFT FAIL: {err_msg}")
                result["extraction_errors"][key] = err_msg

        logger.info("[Extractor] All modules complete")
        return result

    finally:
        # Always close document and quit the dedicated SW instance
        if swModel is not None:
            try:
                swApp.CloseDoc(temp_path)
                logger.info("[Extractor] Document closed")
            except Exception as e:
                logger.warning(f"[Extractor] CloseDoc error: {e}")
        if swApp is not None:
            try:
                swApp.ExitApp()
                logger.info("[Extractor] SolidWorks instance exited")
            except Exception as e:
                logger.warning(f"[Extractor] ExitApp error: {e}")
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


def _check_cancel(cancel_event: threading.Event, stage: str) -> None:
    if cancel_event.is_set():
        raise InterruptedError(f"Job cancelled at stage: {stage}")


def _sha256(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()
`;

function StructuringAgentRow() {
  const { data: status, isLoading } = useQuery<{ ok: boolean; filenamePattern?: string; error?: string }>({
    queryKey: ["/api/agent-downloads/structuring-agent-status"],
    refetchInterval: false,
    staleTime: 60_000,
  });

  const verified = status?.ok === true;
  const blocked  = status?.ok === false;

  return (
    <tr className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <FilePen className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <p className="font-medium">Thermopac Drawing Structuring Agent</p>
            <p className="text-xs text-muted-foreground">
              Creates / updates .slddrw from DDS data — writes custom properties, saves to staging path
            </p>
            {verified && (
              <p className="text-xs text-green-600 dark:text-green-400 font-mono mt-0.5">
                filename: {"{DrawingNo}.slddrw"} — no revision suffix
              </p>
            )}
            {blocked && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {status?.error}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-3">
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-300">
            WRITE ONLY
          </Badge>
          {isLoading && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              checking…
            </Badge>
          )}
          {verified && (
            <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> VERIFIED
            </Badge>
          )}
          {blocked && (
            <Badge variant="outline" className="text-xs border-red-500 text-red-600">
              BUILD BLOCKED
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-3">
        <span className="text-xs font-mono text-muted-foreground">v1.0.36</span>
      </td>
      <td className="py-3 px-3">
        <div className="flex flex-wrap gap-1.5">
          {blocked ? (
            <Button variant="outline" size="sm" className="h-7 text-xs border-red-400 text-red-500" disabled>
              <Download className="h-3 w-3 mr-1" />
              Download Blocked
            </Button>
          ) : (
            <a href="/api/agent-downloads/structuring-agent" download="ThermopacStructuringAgent-v1.0.36-full.zip">
              <Button variant="default" size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                <Download className="h-3 w-3 mr-1" />
                Full Package v1.0.36
                {verified && <CheckCircle2 className="h-3 w-3 ml-1" />}
              </Button>
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function computeRelativePath(fullPath: string, rootPath: string): string {
  if (!rootPath) return fullPath;
  const root = rootPath.replace(/[\\\/]+$/, "");
  if (fullPath.toLowerCase().startsWith(root.toLowerCase())) {
    const rel = fullPath.slice(root.length).replace(/^[\\\/]+/, "");
    return rel || ".";
  }
  return fullPath;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function DocAgentRow() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "Superuser";
  const [expanded, setExpanded] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regCode, setRegCode] = useState("");
  const [regApiKey, setRegApiKey] = useState("");
  const [regRootPath, setRegRootPath] = useState("\\\\Server\\d\\THERMOPAC");
  const [regMachine, setRegMachine] = useState("");
  const [testPath, setTestPath] = useState("\\\\SERVER\\d\\THERMOPAC\\GM");
  const [testJobId, setTestJobId] = useState<number | null>(null);

  const { data: docStatus, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/local-agent/status"],
    refetchInterval: expanded ? 20000 : false,
    enabled: expanded,
  });
  const { data: docJobs = [], refetch: refetchJobs } = useQuery<any[]>({
    queryKey: ["/api/local-agent/jobs/recent"],
    refetchInterval: expanded ? 5000 : false,
    enabled: expanded,
  });
  const { data: pkgInfo } = useQuery<any>({
    queryKey: ["/api/local-agent/package-info"],
    staleTime: 60_000,
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { agentCode: string; apiKey: string; allowedRootPath: string; machineName?: string }) =>
      apiRequest("POST", "/api/local-agent/admin/register", data),
    onSuccess: () => {
      toast({ title: "Agent registered successfully" });
      setShowRegister(false);
      setRegCode(""); setRegApiKey(""); setRegMachine("");
      refetchStatus();
    },
    onError: (e: any) => toast({ title: e?.message || "Registration failed", variant: "destructive" }),
  });

  const enqueueMutation = useMutation({
    mutationFn: async (payload: { jobType: string; relativePath: string }) =>
      apiRequest("POST", "/api/local-agent/admin/enqueue", payload),
    onSuccess: (data: any) => {
      setTestJobId(data.job.id);
      refetchJobs();
      toast({ title: `Test job #${data.job.id} enqueued`, description: "Agent will pick it up within 20 s" });
    },
    onError: (e: any) => toast({ title: e?.message || "Enqueue failed", variant: "destructive" }),
  });

  function enqueueTest(jobType: "VERIFY_FOLDER_EXISTS" | "LIST_DIRECTORY" | "SAVE_TEST_FILE") {
    const root = docStatus?.nodes?.[0]?.allowedRootPath || "";
    const relativePath = computeRelativePath(testPath, root);
    enqueueMutation.mutate({ jobType, relativePath });
  }

  const pendingCount = docStatus?.counts?.pending || 0;

  return (
    <>
      {/* Main row */}
      <tr className={`border-b last:border-b-0 hover:bg-accent/30 transition-colors cursor-pointer ${expanded ? "bg-accent/20" : ""}`}
          onClick={() => setExpanded(e => !e)}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-4 w-4 text-primary shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">Thermopac Local Windows Document Agent</p>
                {pendingCount > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500 text-white">{pendingCount} pending</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Background Windows service for ERP document storage, folder orchestration, and local filesystem synchronization
              </p>
              {docStatus?.nodes?.length > 0 && (() => {
                const node = docStatus.nodes[0];
                const heartbeatAge = node.lastHeartbeatAt
                  ? Math.floor((Date.now() - new Date(node.lastHeartbeatAt).getTime()) / 1000)
                  : null;
                const online = node.agentState && node.agentState !== "OFFLINE" && node.agentState !== "ERROR" && (heartbeatAge === null || heartbeatAge <= 60);
                return (
                  <p className={`text-xs mt-0.5 flex items-center gap-1 ${online ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {node.agentCode} — {node.agentState || "OFFLINE"}{heartbeatAge !== null ? ` (${heartbeatAge}s ago)` : ""}
                  </p>
                );
              })()}
            </div>
          </div>
        </td>
        <td className="py-3 px-3">
          <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 dark:text-purple-300">
            INFRASTRUCTURE
          </Badge>
        </td>
        <td className="py-3 px-3">
          <span className="text-xs font-mono text-muted-foreground">{pkgInfo?.version ? `v${pkgInfo.version}` : "v1.0.x"}</span>
        </td>
        <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-1.5">
            {isAdmin ? (
              <a href="/api/local-agent/download-package" download onClick={e => e.stopPropagation()}>
                <Button variant="default" size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white">
                  <Download className="h-3 w-3 mr-1" /> Full Package{pkgInfo?.version ? ` v${pkgInfo.version}` : ""}
                </Button>
              </a>
            ) : (
              <Button variant="default" size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white" disabled>
                <Download className="h-3 w-3 mr-1" /> Full Package{pkgInfo?.version ? ` v${pkgInfo.version}` : ""}
              </Button>
            )}
            {isAdmin ? (
              <a href="/api/local-agent/download-source-package" download onClick={e => e.stopPropagation()}>
                <Button variant="outline" size="sm" className="h-7 text-xs border-purple-400 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950">
                  <GitBranch className="h-3 w-3 mr-1" /> Source ZIP
                </Button>
              </a>
            ) : null}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
              {expanded ? "Collapse" : "Details"}
            </Button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr>
          <td colSpan={4} className="p-0 border-b bg-muted/10">
            <div className="p-5 space-y-5">

              {/* Architecture note */}
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span><strong>Architecture:</strong> Cloud ERP → <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">document_agent_jobs</code> table → Agent polls every 20 s → <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">\\Server\d\THERMOPAC</code> — outbound HTTPS only, no inbound ports.</span>
              </div>

              {/* Stats + Download row */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                {[
                  { label: "Pending",    count: docStatus?.counts?.pending    || 0, icon: Clock,        color: "text-amber-500"  },
                  { label: "Processing", count: docStatus?.counts?.processing || 0, icon: RefreshCw,    color: "text-blue-500"   },
                  { label: "Completed",  count: docStatus?.counts?.completed  || 0, icon: CheckCircle2, color: "text-green-500"  },
                  { label: "Failed",     count: docStatus?.counts?.failed     || 0, icon: AlertTriangle,color: "text-red-500"    },
                ].map(({ label, count, icon: Icon, color }) => (
                  <div key={label} className="flex items-center gap-2 border rounded-lg p-3 bg-background">
                    <Icon className={`h-4 w-4 ${color} shrink-0`} />
                    <div>
                      <p className="text-lg font-bold leading-none">{count}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  </div>
                ))}

                {/* Download + Heartbeat quick actions */}
                <div className="col-span-2 flex flex-col gap-2">
                  {isAdmin && (
                    <a href="/api/local-agent/download-package" download>
                      <Button className="w-full h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                        <Download className="h-3.5 w-3.5" />
                        Download Package {pkgInfo ? `v${pkgInfo.version}` : ""}
                      </Button>
                    </a>
                  )}
                  <div className="flex gap-2">
                    {isAdmin && (
                      <Button size="sm" className="h-8 text-xs flex-1" onClick={() => setShowRegister(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Register Agent
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { refetchStatus(); }}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Registered Agents */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Registered Agents
                </p>
                {(!docStatus?.nodes || docStatus.nodes.length === 0) ? (
                  <div className="text-center py-5 text-muted-foreground border rounded-lg bg-background text-sm">
                    <HardDrive className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                    <p className="text-xs">No agents registered yet — register one, download the package, and install on your Windows server.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {docStatus.nodes.map((node: any) => {
                      const heartbeatAge = node.lastHeartbeatAt
                        ? Math.floor((Date.now() - new Date(node.lastHeartbeatAt).getTime()) / 1000) : null;
                      const stale = heartbeatAge !== null && heartbeatAge > 60;
                      const online = node.agentState && node.agentState !== "OFFLINE" && node.agentState !== "ERROR" && !stale;
                      return (
                        <div key={node.id} className="flex items-center gap-3 border rounded-lg px-4 py-2.5 bg-background text-sm">
                          {online ? <Wifi className="h-4 w-4 text-green-500 shrink-0" /> : <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{node.agentCode}</span>
                              {node.machineName && <span className="text-xs text-muted-foreground">{node.machineName}</span>}
                              {node.agentVersion && <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{node.agentVersion}</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span className="font-mono">{node.allowedRootPath}</span>
                              <span>{node.lastHeartbeatAt ? `Heartbeat: ${heartbeatAge}s ago${stale ? " ⚠" : ""}` : "No heartbeat yet"}</span>
                            </div>
                            {node.lastError && <p className="text-xs text-red-500 mt-0.5">{node.lastError}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-purple-400 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
                                title="Generates a new API key and downloads config.json. Copy this file to the agent install directory."
                                onClick={async () => {
                                  try {
                                    const r = await fetch(`/api/local-agent/admin/agents/${encodeURIComponent(node.agentCode)}/rotate-key`, { method: 'POST' });
                                    if (!r.ok) { const e = await r.json().catch(() => ({})); toast({ title: e.error || 'Failed to generate config', variant: 'destructive' }); return; }
                                    const blob = await r.blob();
                                    const url  = URL.createObjectURL(blob);
                                    const a    = document.createElement('a');
                                    a.href = url; a.download = 'config.json'; a.click();
                                    URL.revokeObjectURL(url);
                                    toast({ title: `config.json downloaded for ${node.agentCode}`, description: 'New API key generated. Copy this file to C:\\ThermopacDocAgent\\config.json on the agent machine.' });
                                    refetchStatus();
                                  } catch { toast({ title: 'Download failed', variant: 'destructive' }); }
                                }}
                              >
                                <Download className="h-3 w-3 mr-1" /> config.json
                              </Button>
                            )}
                            <Badge className={`text-[10px] ${
                              node.agentState === "IDLE"       ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" :
                              node.agentState === "PROCESSING" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" :
                              node.agentState === "CONNECTING" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200" :
                              node.agentState === "ERROR"      ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" :
                              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                            }`}>{node.agentState || "OFFLINE"}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Read-Only Test ────────────────────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <ScanSearch className="h-3.5 w-3.5" /> Read-Only Test
                </p>
                <div className="border rounded-lg bg-background p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                    <div className="flex-1 w-full">
                      <Label className="text-xs mb-1 block text-muted-foreground">Path on Windows server</Label>
                      <Input
                        value={testPath}
                        onChange={e => setTestPath(e.target.value)}
                        className="font-mono text-xs h-8"
                        placeholder="\\SERVER\d\THERMOPAC\GM"
                      />
                      {docStatus?.nodes?.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Root: <span className="font-mono">{docStatus.nodes[0].allowedRootPath}</span>
                          {" → relative: "}
                          <span className="font-mono font-medium">{computeRelativePath(testPath, docStatus.nodes[0].allowedRootPath)}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-blue-400 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                        disabled={enqueueMutation.isPending}
                        onClick={() => enqueueTest("VERIFY_FOLDER_EXISTS")}
                      >
                        <FolderOpen className="h-3 w-3 mr-1" />
                        Verify Folder
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-purple-400 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
                        disabled={enqueueMutation.isPending}
                        onClick={() => enqueueTest("LIST_DIRECTORY")}
                      >
                        <FolderTree className="h-3 w-3 mr-1" />
                        List Directory
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-green-500 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                        disabled={enqueueMutation.isPending}
                        onClick={() => enqueueTest("SAVE_TEST_FILE")}
                      >
                        <FilePlus className="h-3 w-3 mr-1" />
                        Save Test File
                      </Button>
                    </div>
                  </div>

                  {testJobId !== null && (() => {
                    const job = docJobs.find((j: any) => j.id === testJobId);
                    if (!job) return (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Waiting for agent to claim job #{testJobId}…
                      </div>
                    );
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="text-muted-foreground">Job #{job.id}</span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            job.status === "completed"   ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" :
                            job.status === "failed"      ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" :
                            job.status === "processing"  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                          }`}>{job.status}</Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{job.jobType}</Badge>
                          {(job.status === "pending" || job.status === "processing") && (
                            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>

                        {job.status === "failed" && (
                          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
                            {job.failedReason || "Unknown error"}
                          </p>
                        )}

                        {job.status === "completed" && job.jobType === "VERIFY_FOLDER_EXISTS" && (
                          <div className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            <span className="text-green-700 dark:text-green-300">
                              Folder accessible — <span className="font-mono">{job.resultPayload?.fullPath || job.relativePath}</span>
                            </span>
                          </div>
                        )}

                        {job.status === "completed" && job.jobType === "SAVE_TEST_FILE" && job.resultPayload && (
                          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded px-3 py-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                              <span className="text-xs font-medium text-green-700 dark:text-green-300">File created successfully</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <span className="text-muted-foreground">File name</span>
                              <span className="font-mono">{job.resultPayload.fileName}</span>
                              <span className="text-muted-foreground">Full path</span>
                              <span className="font-mono truncate" title={job.resultPayload.filePath}>{job.resultPayload.filePath}</span>
                              <span className="text-muted-foreground">File size</span>
                              <span className="font-mono">{job.resultPayload.fileSize != null ? formatBytes(job.resultPayload.fileSize) : "—"}</span>
                              <span className="text-muted-foreground">Created at</span>
                              <span className="font-mono">{job.resultPayload.createdAt ? format(new Date(job.resultPayload.createdAt), "dd/MM/yyyy HH:mm:ss") + " UTC" : "—"}</span>
                            </div>
                            <a href={`/api/local-agent/jobs/${job.id}/test-file`} download={job.resultPayload.fileName} target="_blank">
                              <Button size="sm" variant="outline" className="h-7 text-xs mt-1 border-green-500 text-green-700 dark:text-green-300">
                                <Download className="h-3 w-3 mr-1" /> Download PDF to verify
                              </Button>
                            </a>
                          </div>
                        )}

                        {job.status === "completed" && job.jobType === "LIST_DIRECTORY" && job.resultPayload?.entries && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1.5">
                              {job.resultPayload.total} item{job.resultPayload.total !== 1 ? "s" : ""} in{" "}
                              <span className="font-mono">{job.resultPayload.path}</span>
                              {job.resultPayload.truncated ? " — showing first 100" : ""}
                            </p>
                            <div className="border rounded overflow-hidden">
                              <ScrollArea className="max-h-64">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                                    <tr>
                                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Name</th>
                                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground w-14">Type</th>
                                      <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-20">Size</th>
                                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground w-28">Modified</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {job.resultPayload.entries.map((entry: any, i: number) => (
                                      <tr key={i} className="border-t hover:bg-muted/30">
                                        <td className="py-1 px-2">
                                          <div className="flex items-center gap-1.5">
                                            {entry.isDirectory
                                              ? <FolderOpen className="h-3 w-3 text-amber-500 shrink-0" />
                                              : <FileCheck2 className="h-3 w-3 text-blue-400 shrink-0" />}
                                            <span className="font-mono truncate max-w-[200px]" title={entry.name}>{entry.name}</span>
                                          </div>
                                        </td>
                                        <td className="py-1 px-2 text-muted-foreground">{entry.isDirectory ? "Folder" : "File"}</td>
                                        <td className="py-1 px-2 text-right text-muted-foreground font-mono">
                                          {entry.size != null ? formatBytes(entry.size) : "—"}
                                        </td>
                                        <td className="py-1 px-2 text-muted-foreground">
                                          {entry.lastModified ? format(new Date(entry.lastModified), "dd/MM/yy HH:mm") : "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </ScrollArea>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> Recent Activity
                  <span className="font-normal normal-case">(last 50 jobs)</span>
                </p>
                {docJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4 border rounded-lg bg-background">No jobs yet — activity appears here once the agent is online</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">ID</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Path</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docJobs.slice(0, 15).map((job: any) => (
                          <tr key={job.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-1.5 px-3 text-muted-foreground">#{job.id}</td>
                            <td className="py-1.5 px-3">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                job.jobType === "SAVE_PDF" || job.jobType === "SAVE_FILE" ? "bg-purple-100 text-purple-700" :
                                job.jobType === "CREATE_FOLDER" ? "bg-amber-100 text-amber-700" :
                                job.jobType.includes("VERIFY") ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                              }`}>{job.jobType}</Badge>
                            </td>
                            <td className="py-1.5 px-3 max-w-[220px]">
                              <span className="font-mono truncate block" title={job.relativePath}>{job.relativePath}</span>
                              {job.fileName && <span className="text-muted-foreground">{job.fileName}</span>}
                            </td>
                            <td className="py-1.5 px-3">
                              <Badge className={`text-[10px] px-1.5 py-0 ${
                                job.status === "completed"  ? "bg-green-100 text-green-700" :
                                job.status === "failed"     ? "bg-red-100 text-red-700" :
                                job.status === "processing" ? "bg-blue-100 text-blue-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>{job.status}</Badge>
                              {job.actualSha256 && (
                                <span className="text-muted-foreground ml-1 font-mono">{job.actualSha256.substring(0, 8)}…</span>
                              )}
                              {job.failedReason && <p className="text-red-500 truncate max-w-[160px]" title={job.failedReason}>{job.failedReason}</p>}
                            </td>
                            <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                              {job.updatedAt ? new Date(job.updatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Setup Instructions */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                  <FileCode2 className="h-3.5 w-3.5" /> Setup Instructions
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    {[
                      { n: "1", t: "Register agent in ERP", d: "Click Register Agent, enter Agent Code + API Key. Save the API key." },
                      { n: "2", t: "Download the package", d: "Click Download Package above — ready-to-run ZIP, no build step needed." },
                      { n: "3", t: "Install Node.js 18 LTS", d: "Only prerequisite on the Windows server. Download from nodejs.org." },
                      { n: "4", t: "Configure", d: "Unzip to C:\\ThermopacDocAgent\\. Copy config.json.example → config.json, fill in agentCode, erpBaseUrl, apiKey, allowedRootPath." },
                      { n: "5", t: "Install service", d: "Run install-service.bat as Administrator — registers auto-start Windows Service." },
                      { n: "6", t: "Verify online", d: "Run start-service.bat. Agent appears Online in this panel within 20 seconds." },
                    ].map(({ n, t, d }) => (
                      <div key={n} className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{n}</span>
                        <div>
                          <p className="text-xs font-medium">{t}</p>
                          <p className="text-xs text-muted-foreground">{d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <div className="bg-muted rounded-lg p-3 space-y-1.5 text-xs font-mono">
                      <p className="font-sans font-semibold text-xs mb-1">API Endpoints (outbound from agent)</p>
                      {[
                        { m: "POST", p: "/api/local-agent/heartbeat" },
                        { m: "POST", p: "/api/local-agent/jobs/claim" },
                        { m: "POST", p: "/api/local-agent/jobs/result" },
                      ].map(({ m, p }) => (
                        <div key={p} className="flex items-center gap-1.5">
                          <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 shrink-0">{m}</Badge>
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-green-50 dark:bg-green-950/20 rounded text-xs border border-green-200 dark:border-green-800">
                        <p className="font-semibold text-green-700 dark:text-green-300 mb-0.5">Allowed</p>
                        <p className="font-mono text-green-600 dark:text-green-400">.pdf .docx .xlsx .csv .txt .png .jpg .jpeg .zip .dwg .dxf</p>
                      </div>
                      <div className="p-2.5 bg-red-50 dark:bg-red-950/20 rounded text-xs border border-red-200 dark:border-red-800">
                        <p className="font-semibold text-red-700 dark:text-red-300 mb-0.5">Blocked</p>
                        <p className="font-mono text-red-600 dark:text-red-400">.exe .bat .cmd .ps1 .vbs .msi .dll</p>
                      </div>
                    </div>

                    {/* Package file list */}
                    {pkgInfo?.files && (
                      <div>
                        <p className="text-xs font-semibold mb-1.5">Package Contents</p>
                        <div className="space-y-0.5">
                          {pkgInfo.files.map((f: any) => (
                            <div key={f.name} className="flex items-center gap-1.5 text-xs">
                              <FileCheck2 className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-mono text-foreground">{f.name}</span>
                              {f.sizeKb ? <span className="text-muted-foreground">({f.sizeKb} KB)</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </td>
        </tr>
      )}

      {/* Register Agent Dialog — portal renders outside table */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" /> Register Local Document Agent
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Agent Code <span className="text-destructive">*</span></Label>
              <Input value={regCode} onChange={e => setRegCode(e.target.value)} placeholder="THERMOPAC-DOC-AGENT-01" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Must exactly match the agentCode in config.json on the Windows server</p>
            </div>
            <div>
              <Label>API Key <span className="text-destructive">*</span></Label>
              <Input value={regApiKey} onChange={e => setRegApiKey(e.target.value)} placeholder="min 16 characters" type="password" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Copy this into config.json on the Windows server (min 16 chars)</p>
            </div>
            <div>
              <Label>Allowed Root Path <span className="text-destructive">*</span></Label>
              <Input value={regRootPath} onChange={e => setRegRootPath(e.target.value)} placeholder="\\Server\d\THERMOPAC" className="mt-1 font-mono text-sm" />
            </div>
            <div>
              <Label>Machine Name</Label>
              <Input value={regMachine} onChange={e => setRegMachine(e.target.value)} placeholder="e.g. TPEL-SERVER-01" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button
              disabled={registerMutation.isPending || !regCode || !regApiKey || regApiKey.length < 16 || !regRootPath}
              onClick={() => registerMutation.mutate({ agentCode: regCode, apiKey: regApiKey, allowedRootPath: regRootPath, machineName: regMachine || undefined })}
            >
              {registerMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Register Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function downloadExtractor() {
  const blob = new Blob([SOLIDWORKS_EXTRACTOR_PY], { type: "text/x-python" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "solidworks_extractor.py";
  a.click();
  URL.revokeObjectURL(url);
}
import { formatDistanceToNow, format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

type L1Worker = {
  id: number;
  workerKey: string;
  displayName: string;
  description: string | null;
  listenEvents: string[];
  checks: string[] | null;
  module: string | null;
  phase: string | null;
  isEnabled: boolean;
  isSuspended: boolean;
  eventsConsumed: number;
  actionsCreated: number;
  actionsResolved: number;
  avgResponseMs: number;
  consecutiveErrors: number;
  lastEventAt: string | null;
  createdAt: string;
};

type DashboardSummary = {
  workers: L1Worker[];
  stats: {
    totalWorkers: number;
    activeWorkers: number;
    errorWorkers: number;
    eventsToday: number;
    actionsGenerated: number;
    openActions: number;
    resolvedToday: number;
    avgResponseMs: number;
  };
};

type L1Event = {
  id: number;
  eventType: string;
  workerKey: string;
  userId: number | null;
  userName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  checksRun: number;
  checksPassed: number;
  actionsGenerated: number;
  resultStatus: string;
  resultSummary: string | null;
  processingMs: number;
  metadata: any;
  createdAt: string;
};

type L1Action = {
  id: number;
  eventId: number | null;
  workerKey: string;
  userId: number;
  userName: string | null;
  priority: string;
  what: string;
  where: string | null;
  whenTo: string | null;
  why: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  status: string;
  warningType: string | null;
  dismissCount: number;
  resolvedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

type MyActionsResponse = {
  open: L1Action[];
  resolved: L1Action[];
  dismissed: L1Action[];
  weekSummary: {
    total: number;
    resolved: number;
    open: number;
    dismissed: number;
  };
};

type TeamResponse = {
  teamMembers: { userName: string; userId: number; open: number; oldest: L1Action | null }[];
  totalOpen: number;
};

type EffectivenessResponse = {
  warnings: { warning: string; shown: number; acted: number; dismissed: number }[];
  eventFlow: { eventType: string; count: number }[];
};

function workerKeyLabel(key: string) {
  return key
    .replace("l1-", "")
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function workerKeyColor(key: string) {
  const colors: Record<string, string> = {
    "l1-task-quality": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "l1-task-completion": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "l1-agent-enricher": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "l1-dwar-presubmit": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    "l1-dwar-attendance-sync": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    "l1-leave-overlap": "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
    "l1-appraisal-chain": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    "l1-attendance-checkout": "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  };
  return colors[key] || "bg-gray-100 text-gray-800";
}

function resultBadge(status: string, actionsGenerated: number) {
  if (status === "error") return <Badge variant="destructive" className="text-xs">Error</Badge>;
  if (actionsGenerated > 0)
    return <Badge variant="default" className="bg-orange-500 text-xs">⚠ {actionsGenerated} action{actionsGenerated > 1 ? "s" : ""}</Badge>;
  return <Badge variant="default" className="bg-green-600 text-xs">✓ Passed</Badge>;
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "P1": return <Badge variant="destructive" className="text-xs">P1</Badge>;
    case "P2": return <Badge variant="default" className="bg-orange-500 text-xs">P2</Badge>;
    case "P3": return <Badge variant="secondary" className="text-xs">P3</Badge>;
    default: return <Badge variant="outline" className="text-xs">{priority}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "open": return <Badge variant="default" className="bg-yellow-600 text-xs">Open</Badge>;
    case "resolved": return <Badge variant="default" className="bg-green-600 text-xs">Resolved</Badge>;
    case "dismissed": return <Badge variant="secondary" className="text-xs">Dismissed</Badge>;
    case "expired": return <Badge variant="outline" className="text-xs">Expired</Badge>;
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function eventTypeBadge(eventType: string) {
  const typeMap: Record<string, { label: string; className: string }> = {
    "task.created": { label: "Task Created", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" },
    "task.updated": { label: "Task Updated", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" },
    "task.completed": { label: "Task Completed", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" },
    "dwar.submitted": { label: "DWAR Submitted", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200" },
    "agent.task.created": { label: "Agent Task", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200" },
    "leave.requested": { label: "Leave Request", className: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200" },
    "leave.approved": { label: "Leave Approved", className: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200" },
    "appraisal.status_changed": { label: "Appraisal", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200" },
    "attendance.checkout": { label: "Checkout", className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200" },
  };
  const info = typeMap[eventType] || { label: eventType, className: "bg-gray-100 text-gray-700" };
  return <Badge variant="outline" className={`${info.className} text-[10px] px-1.5 py-0`}>{info.label}</Badge>;
}

// ── Agent Jobs Monitor types ──────────────────────────────────────────────────
interface AgentJobRow {
  agent: 'extraction' | 'structuring' | 'document';
  agent_name: string;
  id: number;
  job_type: string | null;
  reference: string | null;
  status: string;
  created_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  retry_count: number;
  error_message: string | null;
  is_stuck: boolean;
}

function agentJobStatusBadge(status: string, isStuck: boolean) {
  if (isStuck) return <Badge className="bg-orange-500 text-white text-xs">Stuck</Badge>;
  switch (status) {
    case 'pending':  return <Badge className="bg-yellow-500 text-white text-xs">Pending</Badge>;
    case 'failed':   return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    case 'claimed':  return <Badge className="bg-blue-500 text-white text-xs">Claimed</Badge>;
    default:         return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function agentIcon(agent: string) {
  switch (agent) {
    case 'extraction':  return <ScanSearch className="h-3.5 w-3.5 text-blue-500" />;
    case 'structuring': return <FolderTree className="h-3.5 w-3.5 text-purple-500" />;
    case 'document':    return <FilePen className="h-3.5 w-3.5 text-teal-500" />;
    default:            return <ServerOff className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export default function WorkerAgentsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("activity");
  const [eventFilter, setEventFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<AgentJobRow | null>(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);

  const isAdmin = user?.role === "Superuser";

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/l1-workers/dashboard/summary"],
    refetchInterval: 30000,
  });

  const { data: events } = useQuery<L1Event[]>({
    queryKey: ["/api/l1-workers/events", eventFilter, workerFilter],
    refetchInterval: 30000,
  });

  const { data: myActions } = useQuery<MyActionsResponse>({
    queryKey: ["/api/l1-workers/actions/my"],
    refetchInterval: 15000,
  });

  const { data: teamData } = useQuery<TeamResponse>({
    queryKey: ["/api/l1-workers/actions/team"],
    enabled: isAdmin || (user?.role === "Manager"),
    refetchInterval: 30000,
  });

  const { data: effectiveness } = useQuery<EffectivenessResponse>({
    queryKey: ["/api/l1-workers/effectiveness"],
    enabled: isAdmin,
  });

  const { data: agentJobsData, isLoading: agentJobsLoading, refetch: refetchAgentJobs } = useQuery<{ jobs: AgentJobRow[] }>({
    queryKey: ["/api/admin/agent-jobs"],
    refetchInterval: 30000,
  });

  const agentJobs = agentJobsData?.jobs ?? [];

  const purgeJobMutation = useMutation({
    mutationFn: async (job: AgentJobRow) =>
      apiRequest("DELETE", `/api/admin/agent-jobs/${job.agent}/${job.id}`),
    onSuccess: (_data, job) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent-jobs"] });
      toast({ title: "Job purged", description: `Job #${job.id} (${job.agent}) removed from queue.` });
      setConfirmPurge(null);
    },
    onError: (err: any) => {
      toast({ title: "Purge failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/l1-workers"] });
  };

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/l1-workers/actions/${id}/dismiss`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Action dismissed" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/l1-workers/actions/${id}/resolve`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Action resolved" });
    },
  });

  const enableWorkerMutation = useMutation({
    mutationFn: async (workerKey: string) => apiRequest("POST", `/api/l1-workers/workers/${workerKey}/enable`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Worker enabled" });
    },
  });

  const disableWorkerMutation = useMutation({
    mutationFn: async (workerKey: string) => apiRequest("POST", `/api/l1-workers/workers/${workerKey}/disable`),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Worker disabled" });
    },
  });

  const stats = summary?.stats;

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-7 w-7 text-primary" />
              Worker Agents
            </h1>
            <p className="text-muted-foreground mt-1">
              Event-driven L1 workers — real-time validation & actions
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={invalidateAll}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalWorkers || 0}</p>
                  <p className="text-xs text-muted-foreground">Workers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.activeWorkers || 0}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.eventsToday || 0}</p>
                  <p className="text-xs text-muted-foreground">Events Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.openActions || 0}</p>
                  <p className="text-xs text-muted-foreground">Open Actions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.resolvedToday || 0}</p>
                  <p className="text-xs text-muted-foreground">Resolved Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.avgResponseMs || 0}ms</p>
                  <p className="text-xs text-muted-foreground">Avg Response</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Local Windows Agents ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Local Windows Agents
            </CardTitle>
            <CardDescription>
              Windows-side agents — run on engineer machines, poll for jobs, interface with SolidWorks
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Agent</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Version</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Downloads</th>
                </tr>
              </thead>
              <tbody>
                {/* Row 1: Extraction Agent */}
                <tr className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <ScanSearch className="h-4 w-4 text-blue-500 shrink-0" />
                      <div>
                        <p className="font-medium">Thermopac Extraction Agent</p>
                        <p className="text-xs text-muted-foreground">
                          Reads .slddrw files — extracts custom properties, runs Layer 1 verification, uploads JSON
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:text-blue-300">
                      READ ONLY
                    </Badge>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-mono text-muted-foreground">v1.0.72</span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1.5">
                      <a href="/ThermopacAgentInstaller-v1.0.72.zip" download="ThermopacAgentInstaller-v1.0.72.zip">
                        <Button variant="default" size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                          <Download className="h-3 w-3 mr-1" />
                          Full Package v1.0.72
                        </Button>
                      </a>
                      <a href="/ThermopacAgent-v1.0.72.zip" download="ThermopacAgent-v1.0.72.zip">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Download className="h-3 w-3 mr-1" />
                          Source ZIP
                        </Button>
                      </a>
                    </div>
                  </td>
                </tr>

                {/* Row 2: Drawing Structuring Agent */}
                <StructuringAgentRow />

                {/* Row 3: Local Windows Document Agent */}
                <DocAgentRow />
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="activity" className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Live Activity</span>
            </TabsTrigger>
            <TabsTrigger value="my-actions" className="flex items-center gap-1.5">
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">My Actions</span>
              {(myActions?.open?.length || 0) > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                  {myActions?.open?.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
            <TabsTrigger value="workers" className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Workers</span>
            </TabsTrigger>
            <TabsTrigger value="effectiveness" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Effectiveness</span>
            </TabsTrigger>
            <TabsTrigger value="job-queue" className="flex items-center gap-1.5">
              <ServerCrash className="h-4 w-4" />
              <span className="hidden sm:inline">Job Queue</span>
              {agentJobs.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                  {agentJobs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Live Activity */}
          <TabsContent value="activity" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Live Activity
                </CardTitle>
                <CardDescription>Real-time event processing feed</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="px-4 pb-3 flex gap-3">
                  <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="All Events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="task.created">task.created</SelectItem>
                      <SelectItem value="task.completed">task.completed</SelectItem>
                      <SelectItem value="dwar.submitted">dwar.submitted</SelectItem>
                      <SelectItem value="agent.task.created">agent.task.created</SelectItem>
                      <SelectItem value="leave.requested">leave.requested</SelectItem>
                      <SelectItem value="leave.approved">leave.approved</SelectItem>
                      <SelectItem value="appraisal.status_changed">appraisal.status_changed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={workerFilter} onValueChange={setWorkerFilter}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="All Workers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Workers</SelectItem>
                      {(summary?.workers || []).map(w => (
                        <SelectItem key={w.workerKey} value={w.workerKey}>{w.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground w-16">Time</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Event</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Worker</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">User</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Result</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground w-12">ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(events || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">
                            No events processed today
                          </td>
                        </tr>
                      ) : (
                        (events || []).map(evt => (
                          <Fragment key={evt.id}>
                            <tr
                              className="border-b last:border-b-0 hover:bg-accent/50 transition-colors cursor-pointer"
                              onClick={() => setExpandedEventId(expandedEventId === evt.id ? null : evt.id)}
                            >
                              <td className="py-3 px-4">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(evt.createdAt), "HH:mm")}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                {eventTypeBadge(evt.eventType)}
                              </td>
                              <td className="py-3 px-3">
                                <Badge variant="outline" className={`${workerKeyColor(evt.workerKey)} text-xs`}>
                                  {workerKeyLabel(evt.workerKey)}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                <span className="text-sm">{evt.userName || "System"}</span>
                              </td>
                              <td className="py-3 px-3">
                                {resultBadge(evt.resultStatus, evt.actionsGenerated)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="text-xs text-muted-foreground">{evt.processingMs}</span>
                              </td>
                            </tr>
                            {expandedEventId === evt.id && (
                              <tr key={`${evt.id}-detail`}>
                                <td colSpan={6} className="bg-muted/30 px-6 py-4 border-b">
                                  <div className="space-y-2 text-sm">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      <div>
                                        <p className="text-xs text-muted-foreground">Event</p>
                                        <p className="font-medium">{evt.eventType}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Entity</p>
                                        <p className="font-medium">{evt.entityType ? `${evt.entityType} #${evt.entityId}` : "—"}</p>
                                        {evt.entityLabel && <p className="text-xs text-muted-foreground">{evt.entityLabel}</p>}
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Processing</p>
                                        <p className="font-medium">{evt.processingMs}ms</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Checks</p>
                                        <p className="font-medium">{evt.checksPassed}/{evt.checksRun} passed</p>
                                      </div>
                                    </div>
                                    {evt.resultSummary && (
                                      <p className="text-xs text-muted-foreground mt-2">{evt.resultSummary}</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                  Showing {(events || []).length} events today · {stats?.actionsGenerated || 0} actions generated · {stats?.resolvedToday || 0} resolved
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: My Actions */}
          <TabsContent value="my-actions" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  My Actions
                </CardTitle>
                <CardDescription>Your pending and recently resolved actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(myActions?.open?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Open ({myActions?.open?.length})</h3>
                    {myActions?.open?.map(action => (
                      <div key={action.id} className="p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${action.priority === "P1" ? "text-red-500" : "text-orange-500"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              {priorityBadge(action.priority)}
                              <Badge variant="outline" className={`${workerKeyColor(action.workerKey)} text-xs`}>
                                {workerKeyLabel(action.workerKey)}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium">{action.what}</p>
                            {action.where && (
                              <p className="text-xs text-muted-foreground">{action.where}</p>
                            )}
                            {action.whenTo && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                When to: {action.whenTo}
                              </p>
                            )}
                            {action.why && (
                              <p className="text-xs text-muted-foreground mt-0.5">{action.why}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {action.actionUrl && (
                                <Button size="sm" variant="default" className="h-7 text-xs" asChild>
                                  <a href={action.actionUrl}>
                                    {action.actionLabel || "Take Action"}
                                    <ExternalLink className="h-3 w-3 ml-1" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => resolveMutation.mutate(action.id)}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => dismissMutation.mutate(action.id)}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                              </Button>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(myActions?.open?.length || 0) === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>No open actions</p>
                  </div>
                )}

                {(myActions?.resolved?.length || 0) > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Recently Resolved ({myActions?.resolved?.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {myActions?.resolved?.slice(0, 10).map(action => (
                            <tr key={action.id} className="border-b last:border-b-0">
                              <td className="py-2 px-2 w-16">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(action.resolvedAt || action.createdAt), "HH:mm")}
                                </span>
                              </td>
                              <td className="py-2 px-2">
                                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {action.what}
                                </span>
                              </td>
                              <td className="py-2 px-2">
                                <span className="text-xs text-muted-foreground">{action.where || ""}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="border-t pt-3 text-xs text-muted-foreground">
                  This week: {myActions?.weekSummary?.total || 0} actions · {myActions?.weekSummary?.resolved || 0} resolved · {myActions?.weekSummary?.open || 0} open · {myActions?.weekSummary?.dismissed || 0} dismissed
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Team */}
          <TabsContent value="team" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Workflow Health
                </CardTitle>
                <CardDescription>Open actions by team member</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Employee</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Open</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Oldest Open</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(teamData?.teamMembers || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-muted-foreground">
                            No open actions across team
                          </td>
                        </tr>
                      ) : (
                        (teamData?.teamMembers || []).map(member => (
                          <tr key={member.userId} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${member.open > 3 ? 'bg-red-500' : member.open > 0 ? 'bg-yellow-500' : 'bg-green-500'}`} />
                                <span className="font-medium text-sm">{member.userName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <Badge variant={member.open > 3 ? "destructive" : member.open > 0 ? "default" : "secondary"} className="text-xs">
                                {member.open}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs text-muted-foreground">
                                {member.oldest ? `"${member.oldest.what}"` : "—"}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs text-muted-foreground">
                                {member.oldest ? formatDistanceToNow(new Date(member.oldest.createdAt), { addSuffix: false }) : "—"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                  Total open: {teamData?.totalOpen || 0} actions
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Workers (Config-style) */}
          <TabsContent value="workers" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(() => {
                const workers = summary?.workers || [];
                const moduleOrder = ["Task Management", "DWAR", "Leave Management", "Appraisal", "Attendance"];
                const grouped: Record<string, L1Worker[]> = {};
                workers.forEach(w => {
                  const mod = w.module || "Other";
                  if (!grouped[mod]) grouped[mod] = [];
                  grouped[mod].push(w);
                });
                const sortedModules = moduleOrder.filter(m => grouped[m]).concat(
                  Object.keys(grouped).filter(m => !moduleOrder.includes(m))
                );

                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Worker Registry
                      </CardTitle>
                      <CardDescription>Enable or disable workers</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-5">
                        {sortedModules.map(mod => (
                          <div key={mod}>
                            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">{mod}</p>
                            <div className="space-y-2">
                              {grouped[mod].map(worker => (
                                <div key={worker.workerKey} className="flex items-center justify-between p-3 rounded-lg border">
                                  <div>
                                    <p className="font-medium text-sm">{worker.displayName}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <p className="text-xs text-muted-foreground">
                                        {worker.eventsConsumed} events · {worker.actionsCreated} actions
                                      </p>
                                      {worker.phase === "phase2" && (
                                        <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">Phase 2</Badge>
                                      )}
                                    </div>
                                    {worker.consecutiveErrors > 0 && (
                                      <p className="text-xs text-red-500 mt-0.5">{worker.consecutiveErrors} consecutive errors</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={worker.isEnabled}
                                      onCheckedChange={(checked) => {
                                        if (checked) enableWorkerMutation.mutate(worker.workerKey);
                                        else disableWorkerMutation.mutate(worker.workerKey);
                                      }}
                                      className={worker.isEnabled ? 'data-[state=checked]:bg-green-600' : 'data-[state=unchecked]:bg-red-500'}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Event Listeners
                  </CardTitle>
                  <CardDescription>Events each worker listens to and checks performed</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {(summary?.workers || []).map(worker => (
                      <div key={worker.workerKey} className="flex items-start justify-between p-3 rounded-lg border text-sm">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={workerKeyColor(worker.workerKey)} variant="outline">
                              {workerKeyLabel(worker.workerKey)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {worker.listenEvents.join(", ")}
                          </p>
                        </div>
                        <div className="text-right text-xs shrink-0 ml-3">
                          {worker.checks && worker.checks.length > 0 ? (
                            <div className="flex flex-col gap-1 items-end">
                              {worker.checks.map(check => (
                                <Badge key={check} variant="secondary" className="text-xs">
                                  {check.replace(/_/g, " ")}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No checks</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 5: Effectiveness */}
          <TabsContent value="effectiveness" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Warning Tuning
                </CardTitle>
                <CardDescription>Which warnings are working and which need adjustment</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Warning</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Shown</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Acted</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Dismissed</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(effectiveness?.warnings || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            No warning data available yet
                          </td>
                        </tr>
                      ) : (
                        (effectiveness?.warnings || []).map((w, i) => {
                          const actRate = w.shown > 0 ? Math.round((w.acted / w.shown) * 100) : 0;
                          const dismissRate = w.shown > 0 ? Math.round((w.dismissed / w.shown) * 100) : 0;
                          return (
                            <tr key={i} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                              <td className="py-3 px-4">
                                <span className="text-sm font-medium">{w.warning}</span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="text-sm">{w.shown}</span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`text-sm font-medium ${actRate >= 70 ? "text-green-600" : actRate >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                                  {actRate}%
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`text-sm ${dismissRate > 60 ? "text-red-500" : "text-muted-foreground"}`}>
                                  {dismissRate}%
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                {actRate >= 70 ? (
                                  <Badge variant="default" className="bg-green-600 text-xs">Working Well</Badge>
                                ) : actRate >= 40 ? (
                                  <Badge variant="default" className="bg-yellow-600 text-xs">Review</Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">Needs Tuning</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Radio className="h-5 w-5" />
                  Event Flow
                </CardTitle>
                <CardDescription>Events processed by type</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Event</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Processed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(effectiveness?.eventFlow || []).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-8 text-center text-muted-foreground">
                            No event flow data yet
                          </td>
                        </tr>
                      ) : (
                        (effectiveness?.eventFlow || []).map((ef, i) => (
                          <tr key={i} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                            <td className="py-3 px-4">
                              {eventTypeBadge(ef.eventType)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="text-sm font-medium">{ef.count}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 6: Job Queue — Agent Jobs Monitor */}
          <TabsContent value="job-queue" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ServerCrash className="h-5 w-5 text-destructive" />
                      Agent Jobs Monitor
                    </CardTitle>
                    <CardDescription>
                      Pending, failed, and stuck jobs across all Local Windows Agents — auto-refreshes every 30 s
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchAgentJobs()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {agentJobsLoading ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading jobs…
                  </div>
                ) : agentJobs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground space-y-2">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-green-500" />
                    <p className="font-medium">All clear — no pending or failed jobs</p>
                    <p className="text-xs">All three agents have an empty queue.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Agent</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Job ID</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Job Type</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Reference</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Created</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Claimed By</th>
                          <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Retries</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Error</th>
                          {isAdmin && (
                            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {agentJobs.map((job) => (
                          <tr key={`${job.agent}-${job.id}`} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {agentIcon(job.agent)}
                                <span className="text-xs font-medium leading-tight">{job.agent_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-mono text-xs text-muted-foreground">#{job.id}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{job.job_type ?? '—'}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs max-w-[160px] truncate block" title={job.reference ?? ''}>
                                {job.reference ?? '—'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {agentJobStatusBadge(job.status, Boolean(job.is_stuck))}
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(job.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs text-muted-foreground">{job.claimed_by ?? '—'}</span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`text-xs font-medium ${job.retry_count > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                                {job.retry_count}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {job.error_message ? (
                                <span className="text-xs text-destructive max-w-[200px] truncate block" title={job.error_message}>
                                  {job.error_message}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="py-3 px-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => setConfirmPurge(job)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Purge
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent queue summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { agent: 'extraction',  label: 'Extraction Agent',   icon: <ScanSearch className="h-4 w-4 text-blue-500" /> },
                { agent: 'structuring', label: 'Structuring Agent',  icon: <FolderTree className="h-4 w-4 text-purple-500" /> },
                { agent: 'document',    label: 'Document Agent',     icon: <FilePen className="h-4 w-4 text-teal-500" /> },
              ].map(({ agent, label, icon }) => {
                const count = agentJobs.filter(j => j.agent === agent).length;
                const failed = agentJobs.filter(j => j.agent === agent && j.status === 'failed').length;
                const stuck = agentJobs.filter(j => j.agent === agent && j.is_stuck).length;
                return (
                  <Card key={agent}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        {icon}
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className={`font-semibold ${count === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                          {count} pending/failed
                        </span>
                        {failed > 0 && <span className="text-destructive">{failed} failed</span>}
                        {stuck > 0 && <span className="text-orange-600">{stuck} stuck</span>}
                        {count === 0 && <span className="text-muted-foreground">Queue clear</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {!isAdmin && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
                <Shield className="h-4 w-4 shrink-0" />
                <span>Purge actions are restricted to Superuser. Contact your administrator to remove stuck or failed jobs.</span>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>

      {/* Purge confirmation dialog */}
      <Dialog open={!!confirmPurge} onOpenChange={(open) => { if (!open) setConfirmPurge(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirm Job Purge
            </DialogTitle>
          </DialogHeader>
          {confirmPurge && (
            <div className="space-y-3 text-sm">
              <p>You are about to permanently delete this job from the queue. This cannot be undone.</p>
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <div className="flex gap-2"><span className="font-medium w-24">Agent:</span><span>{confirmPurge.agent_name}</span></div>
                <div className="flex gap-2"><span className="font-medium w-24">Job ID:</span><span className="font-mono">#{confirmPurge.id}</span></div>
                <div className="flex gap-2"><span className="font-medium w-24">Job Type:</span><span className="font-mono">{confirmPurge.job_type ?? '—'}</span></div>
                <div className="flex gap-2"><span className="font-medium w-24">Reference:</span><span>{confirmPurge.reference ?? '—'}</span></div>
                <div className="flex gap-2"><span className="font-medium w-24">Status:</span>{agentJobStatusBadge(confirmPurge.status, Boolean(confirmPurge.is_stuck))}</div>
              </div>
              <p className="text-xs text-muted-foreground">This purge will be recorded in the audit log.</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPurge(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmPurge && purgeJobMutation.mutate(confirmPurge)}
              disabled={purgeJobMutation.isPending}
            >
              {purgeJobMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Purge Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}

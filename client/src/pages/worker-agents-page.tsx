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
  ServerCrash,
  Wifi,
  WifiOff,
  Hash,
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

export default function WorkerAgentsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("activity");
  const [eventFilter, setEventFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
  const [showRegisterAgent, setShowRegisterAgent] = useState(false);
  const [regCode, setRegCode] = useState("");
  const [regApiKey, setRegApiKey] = useState("");
  const [regRootPath, setRegRootPath] = useState("\\\\\\\\Server\\\\d\\\\THERMOPAC");
  const [regMachine, setRegMachine] = useState("");

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

  const { data: docAgentStatus, refetch: refetchDocAgent } = useQuery<any>({
    queryKey: ["/api/local-agent/status"],
    refetchInterval: 20000,
  });

  const { data: docAgentJobs = [] } = useQuery<any[]>({
    queryKey: ["/api/local-agent/jobs/recent"],
    refetchInterval: 20000,
  });

  const { data: pkgInfo } = useQuery<any>({
    queryKey: ["/api/local-agent/package-info"],
  });

  const registerAgentMutation = useMutation({
    mutationFn: async (data: { agentCode: string; apiKey: string; allowedRootPath: string; machineName?: string }) =>
      apiRequest("POST", "/api/local-agent/admin/register", data),
    onSuccess: () => {
      toast({ title: "Agent registered successfully" });
      setShowRegisterAgent(false);
      setRegCode(""); setRegApiKey(""); setRegMachine("");
      refetchDocAgent();
    },
    onError: (e: any) => toast({ title: e?.message || "Registration failed", variant: "destructive" }),
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
            <TabsTrigger value="doc-agent" className="flex items-center gap-1.5">
              <HardDrive className="h-4 w-4" />
              <span className="hidden sm:inline">Doc Agent</span>
              {(docAgentStatus?.counts?.pending || 0) > 0 && (
                <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0 bg-blue-100 text-blue-700">
                  {docAgentStatus.counts.pending}
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

          {/* Tab 6: Local Windows Document Agent */}
          <TabsContent value="doc-agent" className="mt-4 space-y-5">

            {/* Page header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-primary" />
                  Local Windows Document Agent
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Background service on the office server — saves ERP files to <code className="text-xs bg-muted px-1 rounded">\\Server\d\THERMOPAC</code> automatically.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchDocAgent()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
              </Button>
            </div>

            {/* Architecture banner */}
            <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Architecture:</strong> Cloud ERP → <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">document_agent_jobs</code> table → Local Agent polls every 20 s → <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">\\Server\d\THERMOPAC</code> — outbound HTTPS only, no inbound ports required.
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* ── SECTION 1: Download Agent Package ─────────────────────── */}
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Download className="h-4 w-4 text-primary" /> Download Agent Package
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Pre-compiled Windows package — no build step needed on your server.
                    </CardDescription>
                  </div>
                  {pkgInfo && (
                    <Badge variant="outline" className="text-sm px-3 py-1 bg-primary/5 text-primary border-primary/30 font-mono shrink-0">
                      v{pkgInfo.version}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Download button */}
                {isAdmin ? (
                  <a href="/api/local-agent/download-package" download>
                    <Button className="w-full sm:w-auto gap-2" size="lg">
                      <Download className="h-5 w-5" />
                      Download Local Document Agent Package
                      {pkgInfo?.distSizeKb ? (
                        <span className="ml-1 text-xs opacity-70">~{Math.round((pkgInfo.distSizeKb + 50) / 1024 * 10) / 10} MB zip</span>
                      ) : null}
                    </Button>
                  </a>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    <Shield className="h-4 w-4 shrink-0" />
                    <span>Only Superusers can download the agent package.</span>
                  </div>
                )}

                {/* Package file list */}
                {pkgInfo?.files && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Package Contents</p>
                    <div className="border rounded-lg overflow-hidden">
                      {pkgInfo.files.map((f: any, i: number) => (
                        <div key={f.name} className={`flex items-start gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t' : ''} ${i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                          <FileCode2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-foreground">{f.name}</span>
                            {f.sizeKb ? <span className="text-muted-foreground ml-2 text-xs">({f.sizeKb} KB)</span> : null}
                            <p className="text-xs text-muted-foreground">{f.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Release notes */}
                {pkgInfo?.releaseNotes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Release Notes</p>
                    <ul className="space-y-1">
                      {pkgInfo.releaseNotes.map((note: string) => (
                        <li key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* ── SECTION 2: Registered Agents ──────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Registered Agents
                  </CardTitle>
                  {isAdmin && (
                    <Button size="sm" onClick={() => setShowRegisterAgent(true)}>
                      <Plus className="h-4 w-4 mr-1.5" /> Register Agent
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>

                {/* Job stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Pending",    count: docAgentStatus?.counts?.pending    || 0, icon: Clock,        color: "text-amber-500"  },
                    { label: "Processing", count: docAgentStatus?.counts?.processing || 0, icon: RefreshCw,    color: "text-blue-500"   },
                    { label: "Completed",  count: docAgentStatus?.counts?.completed  || 0, icon: CheckCircle2, color: "text-green-500"  },
                    { label: "Failed",     count: docAgentStatus?.counts?.failed     || 0, icon: AlertTriangle,color: "text-red-500"    },
                  ].map(({ label, count, icon: Icon, color }) => (
                    <div key={label} className="flex items-center gap-2 border rounded-lg p-3">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <div>
                        <p className="text-xl font-bold leading-none">{count}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Agent node cards */}
                {(!docAgentStatus?.nodes || docAgentStatus.nodes.length === 0) ? (
                  <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/20">
                    <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No agents registered yet</p>
                    <p className="text-xs mt-1">Download the package, set it up on your Windows server, then register it here.</p>
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowRegisterAgent(true)}>
                        <Plus className="h-3 w-3 mr-1" /> Register First Agent
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {docAgentStatus.nodes.map((node: any) => {
                      const isOnline = node.agentState && node.agentState !== 'OFFLINE' && node.agentState !== 'ERROR';
                      const heartbeatAge = node.lastHeartbeatAt
                        ? Math.floor((Date.now() - new Date(node.lastHeartbeatAt).getTime()) / 1000)
                        : null;
                      const stale = heartbeatAge !== null && heartbeatAge > 60;
                      return (
                        <div key={node.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {isOnline && !stale
                                ? <Wifi className="h-5 w-5 text-green-500" />
                                : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                              <div>
                                <p className="font-medium text-sm">{node.agentCode}</p>
                                {node.machineName && <p className="text-xs text-muted-foreground">{node.machineName}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {node.agentVersion && (
                                <Badge variant="outline" className="text-xs">v{node.agentVersion}</Badge>
                              )}
                              <Badge className={`text-xs ${
                                node.agentState === 'IDLE'       ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                                node.agentState === 'PROCESSING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' :
                                node.agentState === 'CONNECTING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200' :
                                node.agentState === 'ERROR'      ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}>
                                {node.agentState || 'OFFLINE'}
                              </Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-mono truncate">{node.allowedRootPath || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {node.lastHeartbeatAt
                                  ? `Last heartbeat: ${heartbeatAge}s ago${stale ? ' ⚠ stale' : ''}`
                                  : 'No heartbeat yet'}
                              </span>
                            </div>
                          </div>
                          {node.lastError && (
                            <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5">
                              <ServerCrash className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span className="break-all">{node.lastError}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── SECTION 3: Recent Job Activity ────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Recent Job Activity
                </CardTitle>
                <CardDescription>Last 50 jobs processed by the agent</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {docAgentJobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No jobs yet — jobs appear here once the agent is online and processing</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">ID</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Path</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docAgentJobs.map((job: any) => (
                          <tr key={job.id} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                            <td className="py-2.5 px-4 text-muted-foreground text-xs">#{job.id}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                job.jobType === 'SAVE_PDF' || job.jobType === 'SAVE_FILE' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' :
                                job.jobType === 'CREATE_FOLDER' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200' :
                                job.jobType.includes('VERIFY') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' :
                                'bg-gray-100 text-gray-700'
                              }`}>{job.jobType}</Badge>
                            </td>
                            <td className="py-2.5 px-3 max-w-[280px]">
                              <span className="font-mono text-xs truncate block" title={job.relativePath}>{job.relativePath}</span>
                              {job.fileName && <span className="text-xs text-muted-foreground">{job.fileName}</span>}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge className={`text-[10px] px-1.5 py-0 ${
                                job.status === 'completed'  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                                job.status === 'failed'     ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                                job.status === 'processing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' :
                                'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                              }`}>{job.status}</Badge>
                              {job.failedReason && (
                                <p className="text-xs text-red-500 mt-0.5 max-w-[200px] truncate" title={job.failedReason}>{job.failedReason}</p>
                              )}
                              {job.actualSha256 && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono flex items-center gap-1">
                                  <Hash className="h-2.5 w-2.5" />{job.actualSha256.substring(0, 12)}…
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                              {job.updatedAt ? new Date(job.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── SECTION 4: Setup Instructions ─────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCode2 className="h-4 w-4" /> Setup Instructions
                </CardTitle>
                <CardDescription>How to deploy the agent on the Windows server</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Flow diagram */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {[
                    "1. Register in ERP",
                    "→",
                    "2. Download Package",
                    "→",
                    "3. Edit config.json",
                    "→",
                    "4. install-service.bat",
                    "→",
                    "5. Agent Online",
                  ].map((step, i) => (
                    <span key={i} className={step === "→" ? "text-muted-foreground/40 font-bold" : "bg-muted rounded px-2 py-1 font-medium text-foreground"}>
                      {step}
                    </span>
                  ))}
                </div>

                {/* Step-by-step */}
                <div className="space-y-3">
                  {[
                    { step: "1", title: "Register the agent in ERP", text: "Click Register Agent (above), enter an Agent Code and API Key. Keep the API Key — you'll need it in config.json." },
                    { step: "2", title: "Download the package", text: "Click the Download button above. You'll get thermopac-doc-agent-v1.0.0.zip — a ready-to-run package, no build step needed." },
                    { step: "3", title: "Install Node.js on the Windows server", text: "Install Node.js 18 LTS (x64) from nodejs.org. This is the only prerequisite." },
                    { step: "4", title: "Copy and configure", text: "Unzip to C:\\ThermopacDocAgent\\. Copy config.json.example → config.json. Fill in agentCode, erpBaseUrl, apiKey, allowedRootPath." },
                    { step: "5", title: "Install as Windows Service", text: "Right-click install-service.bat → Run as Administrator. It will install node-windows, register the service, and set startup to Automatic." },
                    { step: "6", title: "Start and verify", text: "Run start-service.bat. Within 20 seconds the agent appears Online in this dashboard. Heartbeat test: node dist\\index.js (Ctrl+C to stop)." },
                  ].map(({ step, title, text }) => (
                    <div key={step} className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{step}</span>
                      <div>
                        <p className="text-sm font-medium">{title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* API endpoints for tech reference */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Agent API Paths (for reference / firewall rules)</p>
                  <div className="bg-muted rounded-lg p-3 space-y-1.5 font-mono text-xs">
                    {[
                      { method: "POST", path: "/api/local-agent/heartbeat",  desc: "Agent sends state every poll cycle" },
                      { method: "POST", path: "/api/local-agent/jobs/claim", desc: "Agent claims next pending job" },
                      { method: "POST", path: "/api/local-agent/jobs/result",desc: "Agent submits job result + SHA-256" },
                    ].map(({ method, path: p, desc }) => (
                      <div key={p} className="flex items-center gap-2">
                        <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 shrink-0">{method}</Badge>
                        <span className="text-foreground">{p}</span>
                        <span className="text-muted-foreground hidden md:inline">— {desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Allowed extensions */}
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg text-xs border border-green-200 dark:border-green-800">
                    <p className="font-semibold text-green-700 dark:text-green-300 mb-1">Allowed extensions</p>
                    <p className="font-mono text-green-600 dark:text-green-400">.pdf .docx .xlsx .csv .txt .png .jpg .jpeg .zip .dwg .dxf</p>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg text-xs border border-red-200 dark:border-red-800">
                    <p className="font-semibold text-red-700 dark:text-red-300 mb-1">Blocked (security)</p>
                    <p className="font-mono text-red-600 dark:text-red-400">.exe .bat .cmd .ps1 .vbs .msi .dll</p>
                  </div>
                </div>

              </CardContent>
            </Card>

          </TabsContent>

        </Tabs>

        {/* Register Agent Dialog */}
        <Dialog open={showRegisterAgent} onOpenChange={setShowRegisterAgent}>
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
                <p className="text-xs text-muted-foreground mt-1">Unique identifier — must match config.json on the Windows server</p>
              </div>
              <div>
                <Label>API Key <span className="text-destructive">*</span></Label>
                <Input value={regApiKey} onChange={e => setRegApiKey(e.target.value)} placeholder="min 16 characters" type="password" className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Secret key — copy this to config.json on the Windows server (min 16 chars)</p>
              </div>
              <div>
                <Label>Allowed Root Path <span className="text-destructive">*</span></Label>
                <Input value={regRootPath} onChange={e => setRegRootPath(e.target.value)} placeholder="\\Server\d\THERMOPAC" className="mt-1 font-mono text-sm" />
                <p className="text-xs text-muted-foreground mt-1">UNC path on the Windows server where files will be saved</p>
              </div>
              <div>
                <Label>Machine Name</Label>
                <Input value={regMachine} onChange={e => setRegMachine(e.target.value)} placeholder="e.g. TPEL-SERVER-01" className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRegisterAgent(false)}>Cancel</Button>
              <Button
                disabled={registerAgentMutation.isPending || !regCode || !regApiKey || regApiKey.length < 16 || !regRootPath}
                onClick={() => registerAgentMutation.mutate({ agentCode: regCode, apiKey: regApiKey, allowedRootPath: regRootPath, machineName: regMachine || undefined })}
              >
                {registerAgentMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                Register Agent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}


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
} from "lucide-react";

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
SW_OPEN_READ_ONLY        = 2
SW_OPEN_SILENT           = 64
SW_OPEN_LOAD_MODEL       = 128


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
        options = SW_OPEN_READ_ONLY | SW_OPEN_SILENT | SW_OPEN_LOAD_MODEL
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
          <div className="flex gap-2">
            <a href="/ThermopacAgent-v1.0.13.zip" download="ThermopacAgent-v1.0.13.zip">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download Agent ZIP (v1.0.13)
              </Button>
            </a>
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
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

        </Tabs>
      </div>
    </Layout>
  );
}

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, ArrowLeft, AlertTriangle, CheckCircle2, Clock, Users, CalendarDays,
  FileText, Package, Wrench, Plus, Edit, Trash2, ChevronDown, ChevronRight,
  Shield, HardHat, History, AlertOctagon, CheckCircle, XCircle, BarChart3,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2,
  Manager: 3, "Senior Executive": 4, Employee: 5,
};
function canDo(role: string, minRole: string) {
  return (roleHierarchy[role] ?? 99) <= (roleHierarchy[minRole] ?? 99);
}

const HOLD_TYPE_LABELS: Record<string, string> = {
  material_shortage: "Material Shortage", drawing_issue: "Drawing Issue",
  machine_breakdown: "Machine Breakdown", quality_hold: "Quality Hold",
  customer_hold: "Customer Hold", other: "Other",
};
const HOLD_TYPE_COLORS: Record<string, string> = {
  material_shortage: "bg-orange-100 text-orange-800", drawing_issue: "bg-purple-100 text-purple-800",
  machine_breakdown: "bg-red-100 text-red-800", quality_hold: "bg-yellow-100 text-yellow-800",
  customer_hold: "bg-blue-100 text-blue-800", other: "bg-gray-100 text-gray-700",
};
const ROLE_TYPE_LABELS: Record<string, string> = {
  team_leader: "Team Leader", fitter: "Fitter", welder: "Welder",
  helper: "Helper", qc_person: "QC Person",
};
const ROLE_GROUP: Record<string, string> = {
  team_leader: "Production", fitter: "Production", welder: "Production",
  helper: "Production", qc_person: "Quality",
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; border: string }> = {
    released:            { bg: "bg-green-100 text-green-800",   border: "border border-green-300" },
    approved:            { bg: "bg-blue-100 text-blue-800",     border: "border border-blue-300" },
    draft:               { bg: "bg-gray-100 text-gray-600",     border: "border border-gray-300" },
    cancelled:           { bg: "bg-red-100 text-red-700",       border: "border border-red-300" },
    under_review:        { bg: "bg-amber-100 text-amber-800",   border: "border border-amber-300" },
    active:              { bg: "bg-green-100 text-green-800",   border: "border border-green-300" },
    cleared:             { bg: "bg-emerald-100 text-emerald-800", border: "border border-emerald-300" },
    pending_inspection:  { bg: "bg-yellow-100 text-yellow-800", border: "border border-yellow-300" },
    failed:              { bg: "bg-red-100 text-red-700",       border: "border border-red-300" },
    submitted:           { bg: "bg-blue-100 text-blue-800",     border: "border border-blue-300" },
    open:                { bg: "bg-red-100 text-red-800",       border: "border border-red-400" },
    resolved:            { bg: "bg-green-100 text-green-800",   border: "border border-green-300" },
  };
  const style = map[status] || { bg: "bg-gray-100 text-gray-600", border: "border border-gray-300" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold capitalize tracking-wide ${style.bg} ${style.border}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: any }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="font-medium break-all">{value ?? "—"}</span>
    </div>
  );
}

function SectionToggle({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border border-border shadow-sm overflow-hidden">
      <button
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${open ? "bg-muted/40" : "hover:bg-muted/20"}`}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2 text-xs font-bold text-foreground">
          <span className="flex items-center justify-center h-5 w-5 rounded bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          {label}
        </span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <>
          <div className="h-px bg-border" />
          <CardContent className="pt-3 pb-4 px-4">{children}</CardContent>
        </>
      )}
    </Card>
  );
}

export default function EpcWoManagePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const userRole = (user as any)?.role || "Employee";
  const isManager = canDo(userRole, "Manager");
  const isSeniorExec = canDo(userRole, "Senior Executive");

  const woId = parseInt(id || "0");

  const { data: wo, isLoading: woLoading } = useQuery<any>({ queryKey: ["/api/epc/work-orders", woId, "manage"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/manage`).then(r => r.json()) });
  const { data: crew = [], refetch: refetchCrew } = useQuery<any[]>({ queryKey: ["/api/epc/work-orders", woId, "crew"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/crew`).then(r => r.json()) });
  const { data: schedule, refetch: refetchSchedule } = useQuery<any>({ queryKey: ["/api/epc/work-orders", woId, "schedule"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/schedule`).then(r => r.json()) });
  const { data: dailyLogs = [], refetch: refetchLogs } = useQuery<any[]>({ queryKey: ["/api/epc/work-orders", woId, "daily-logs"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/daily-logs`).then(r => r.json()) });
  const { data: holds = [], refetch: refetchHolds } = useQuery<any[]>({ queryKey: ["/api/epc/work-orders", woId, "holds"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/holds`).then(r => r.json()) });
  const { data: inspections = [] } = useQuery<any[]>({ queryKey: ["/api/epc/work-orders", woId, "inspections"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/inspections`).then(r => r.json()) });
  const { data: manpower } = useQuery<any>({ queryKey: ["/api/epc/work-orders", woId, "manpower-summary"], queryFn: () => fetch(`/api/epc/work-orders/${woId}/manpower-summary`).then(r => r.json()) });

  // ── Schedule mutation ──
  const [schedForm, setSchedForm] = useState<any>(null);
  const [schedOpen, setSchedOpen] = useState(false);
  const schedMutation = useMutation({ mutationFn: (body: any) => apiRequest("PUT", `/api/epc/work-orders/${woId}/schedule`, body), onSuccess: () => { refetchSchedule(); queryClient.invalidateQueries({ queryKey: ["/api/epc/work-orders", woId, "manage"] }); setSchedOpen(false); toast({ title: "Schedule saved" }); }, onError: () => toast({ title: "Save failed", variant: "destructive" }) });

  // ── Crew mutations ──
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [crewForm, setCrewForm] = useState({ role_type: "fitter", assigned_name: "" });
  const [editSlotId, setEditSlotId] = useState<number | null>(null);
  const [editSlotName, setEditSlotName] = useState("");
  const [editSlotOpen, setEditSlotOpen] = useState(false);
  const addCrewMutation = useMutation({ mutationFn: (body: any) => apiRequest("POST", `/api/epc/work-orders/${woId}/crew/slots`, body), onSuccess: () => { refetchCrew(); setCrewDialogOpen(false); setCrewForm({ role_type: "fitter", assigned_name: "" }); toast({ title: "Crew slot added" }); }, onError: (e: any) => toast({ title: e?.message || "Failed", variant: "destructive" }) });
  const editCrewMutation = useMutation({ mutationFn: ({ slotId, name }: any) => apiRequest("PUT", `/api/epc/work-orders/${woId}/crew/slots/${slotId}`, { assigned_name: name }), onSuccess: () => { refetchCrew(); setEditSlotOpen(false); toast({ title: "Name updated" }); }, onError: () => toast({ title: "Update failed", variant: "destructive" }) });
  const removeCrewMutation = useMutation({ mutationFn: (slotId: number) => apiRequest("DELETE", `/api/epc/work-orders/${woId}/crew/slots/${slotId}`), onSuccess: () => { refetchCrew(); toast({ title: "Slot removed" }); } });

  // ── Daily log mutations ──
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editLogId, setEditLogId] = useState<number | null>(null);
  const [logForm, setLogForm] = useState<any>({ log_date: new Date().toISOString().slice(0, 10), progress_percent: 0, work_done_today: "", manpower_count: 0, manpower_breakdown: { team_leaders: 0, fitters: 0, welders: 0, helpers: 0, qc_persons: 0 }, hours_worked: 0, issues_encountered: "", next_day_plan: "", crew_note: "" });
  const addLogMutation = useMutation({ mutationFn: (body: any) => editLogId ? apiRequest("PUT", `/api/epc/work-orders/${woId}/daily-logs/${editLogId}`, body) : apiRequest("POST", `/api/epc/work-orders/${woId}/daily-logs`, body), onSuccess: () => { refetchLogs(); queryClient.invalidateQueries({ queryKey: ["/api/epc/work-orders", woId, "manage"] }); queryClient.invalidateQueries({ queryKey: ["/api/epc/work-orders", woId, "manpower-summary"] }); setLogDialogOpen(false); setEditLogId(null); toast({ title: "Log saved" }); }, onError: (e: any) => toast({ title: e?.message || "Failed", variant: "destructive" }) });
  const submitLogMutation = useMutation({ mutationFn: (logId: number) => apiRequest("POST", `/api/epc/work-orders/${woId}/daily-logs/${logId}/submit`), onSuccess: () => { refetchLogs(); toast({ title: "Log submitted" }); } });

  // ── Hold mutations ──
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdForm, setHoldForm] = useState({ hold_type: "material_shortage", hold_reason: "" });
  const [resolveHoldId, setResolveHoldId] = useState<number | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const addHoldMutation = useMutation({ mutationFn: (body: any) => apiRequest("POST", `/api/epc/work-orders/${woId}/holds`, body), onSuccess: () => { refetchHolds(); queryClient.invalidateQueries({ queryKey: ["/api/epc/work-orders", woId, "manage"] }); setHoldDialogOpen(false); setHoldForm({ hold_type: "material_shortage", hold_reason: "" }); toast({ title: "Hold raised" }); }, onError: () => toast({ title: "Failed", variant: "destructive" }) });
  const resolveHoldMutation = useMutation({ mutationFn: ({ holdId, notes }: any) => apiRequest("POST", `/api/epc/work-orders/${woId}/holds/${holdId}/resolve`, { resolution_notes: notes }), onSuccess: () => { refetchHolds(); queryClient.invalidateQueries({ queryKey: ["/api/epc/work-orders", woId, "manage"] }); setResolveOpen(false); toast({ title: "Hold resolved" }); } });

  if (woLoading) return <Layout><div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></Layout>;
  if (!wo || wo.error) return <Layout><div className="p-6 text-sm text-muted-foreground">Work order not found.</div></Layout>;

  const openHoldCount = wo.open_hold_count || 0;
  const latestPct = wo.latest_progress_percent || 0;
  const productIdentity = [wo.product_p1_label, wo.product_p2_label, wo.product_p3].filter(Boolean).join(" · ");

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLogExists = dailyLogs.some((l: any) => l.log_date === todayStr);

  const crewProduction = crew.filter((c: any) => ROLE_GROUP[c.role_type] === "Production");
  const crewQuality = crew.filter((c: any) => ROLE_GROUP[c.role_type] === "Quality");

  function openEditLog(log: any) {
    setEditLogId(log.id);
    setLogForm({ log_date: log.log_date, progress_percent: log.progress_percent, work_done_today: log.work_done_today || "", manpower_count: log.manpower_count, manpower_breakdown: log.manpower_breakdown || { team_leaders: 0, fitters: 0, welders: 0, helpers: 0, qc_persons: 0 }, hours_worked: log.hours_worked || 0, issues_encountered: log.issues_encountered || "", next_day_plan: log.next_day_plan || "", crew_note: log.crew_note || "" });
    setLogDialogOpen(true);
  }

  function openNewLog() {
    setEditLogId(null);
    setLogForm({ log_date: todayStr, progress_percent: latestPct, work_done_today: "", manpower_count: 0, manpower_breakdown: { team_leaders: 0, fitters: 0, welders: 0, helpers: 0, qc_persons: 0 }, hours_worked: 0, issues_encountered: "", next_day_plan: "", crew_note: "" });
    setLogDialogOpen(true);
  }

  function openScheduleEdit() {
    setSchedForm({
      target_start_date: schedule?.target_start_date || wo?.project_start_date?.slice(0, 10) || "",
      target_completion_date: schedule?.target_completion_date || wo?.project_target_end_date?.slice(0, 10) || "",
      actual_start_date: schedule?.actual_start_date || "",
      actual_completion_date: schedule?.actual_completion_date || "",
    });
    setSchedOpen(true);
  }

  function daysBetween(a: string | null, b: string | null): number | null {
    if (!a || !b) return null;
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  }

  function varianceBadge(targetDate: string | null, actualDate: string | null) {
    const diff = daysBetween(targetDate, actualDate);
    if (diff === null) return null;
    if (diff === 0) return <span className="text-[10px] text-green-600 font-medium">On time</span>;
    if (diff > 0) return <span className="text-[10px] text-red-600 font-medium">+{diff}d late</span>;
    return <span className="text-[10px] text-green-600 font-medium">{Math.abs(diff)}d early</span>;
  }

  return (
    <Layout>
      <div className="p-5 space-y-4 max-w-7xl mx-auto">

        {/* Back */}
        <button onClick={() => navigate("/epc/work-orders")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Work Orders
        </button>

        {/* ── WO Identity Header ── */}
        <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50/60 to-slate-50/40 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-start gap-3 justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono font-bold text-base tracking-tight">{wo.wo_number}</span>
                <StatusPill status={wo.status} />
                <StatusPill status={wo.quality_status || "pending_inspection"} />
              </div>
              <div className="text-xs text-muted-foreground font-medium">{wo.item_code} — {wo.item_description}</div>
              {productIdentity && <div className="text-xs font-bold text-blue-700">{productIdentity}</div>}
              <div className="text-[10px] text-muted-foreground">Qty: <span className="font-semibold text-foreground">{wo.quantity} {wo.uom}</span></div>
            </div>
            <div className="text-right text-[10px] text-muted-foreground space-y-0.5">
              <div>Released by <span className="font-medium text-foreground">{wo.released_by_name || "—"}</span> on {fmtDate(wo.released_at)}</div>
              {wo.approved_by_name && <div>Approved by <span className="font-medium text-foreground">{wo.approved_by_name}</span></div>}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="font-medium text-muted-foreground">Production Progress</span>
              <span className="font-bold text-blue-700">{latestPct}%</span>
            </div>
            <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden border border-blue-200">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${latestPct}%`, background: latestPct === 100 ? "#16a34a" : latestPct >= 60 ? "#2563eb" : "#60a5fa" }}
              />
            </div>
          </div>
        </div>

        {/* ── Open Hold Banner ── */}
        {openHoldCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 shadow-sm">
            <AlertOctagon className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div className="text-xs text-red-900 space-y-0.5">
              <div className="font-bold">{openHoldCount} open hold{openHoldCount > 1 ? "s" : ""}</div>
              <div>
                {wo.open_hold_type && <span className="font-semibold">[{HOLD_TYPE_LABELS[wo.open_hold_type] || wo.open_hold_type}]</span>}{" "}
                {wo.open_hold_reason}
                {wo.oldest_open_held_at && <span className="ml-1 text-red-700">· Since {fmtDate(wo.oldest_open_held_at)}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Row A: Schedule + Drawing ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Schedule */}
          <Card className="border border-blue-200 border-l-4 border-l-blue-400 bg-blue-50/20 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-blue-100 bg-blue-50/40">
              <h4 className="text-xs font-bold flex items-center gap-2 text-blue-900">
                <CalendarDays className="h-4 w-4 text-blue-500" /> Schedule
              </h4>
              {isManager && <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={openScheduleEdit}><Edit className="h-3 w-3 mr-0.5" /> Edit</Button>}
            </div>
            <div className="p-4 space-y-2">
              {/* Project timeline reference */}
              {(wo?.project_start_date || wo?.project_target_end_date) && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-700">
                  <CalendarDays className="h-3 w-3 shrink-0 text-blue-400" />
                  <span className="font-semibold">Project timeline:</span>
                  <span>{fmtDate(wo.project_start_date)}</span>
                  <span className="text-blue-400">→</span>
                  <span>{fmtDate(wo.project_target_end_date)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="space-y-1">
                  <div className="text-[9px] font-bold text-blue-700 uppercase tracking-wide">Target (WO)</div>
                  {(() => {
                    const tStart = schedule?.target_start_date;
                    const fromProj = !tStart && !!wo?.project_start_date;
                    return (
                      <div>
                        <DetailRow label="Start" value={
                          <span className={fromProj ? "text-blue-500 italic" : ""}>
                            {fmtDate(tStart || wo?.project_start_date)}
                            {fromProj && <span className="ml-1 text-[9px] text-blue-400">(project)</span>}
                          </span>
                        } />
                      </div>
                    );
                  })()}
                  {(() => {
                    const tEnd = schedule?.target_completion_date;
                    const fromProj = !tEnd && !!wo?.project_target_end_date;
                    return (
                      <div>
                        <DetailRow label="Completion" value={
                          <span className={fromProj ? "text-blue-500 italic" : ""}>
                            {fmtDate(tEnd || wo?.project_target_end_date)}
                            {fromProj && <span className="ml-1 text-[9px] text-blue-400">(project)</span>}
                          </span>
                        } />
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] font-bold text-blue-700 uppercase tracking-wide">Actual</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><DetailRow label="Start" value={fmtDate(schedule?.actual_start_date)} /></div>
                    {varianceBadge(schedule?.target_start_date || wo?.project_start_date, schedule?.actual_start_date)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><DetailRow label="Completion" value={fmtDate(schedule?.actual_completion_date)} /></div>
                    {varianceBadge(schedule?.target_completion_date || wo?.project_target_end_date, schedule?.actual_completion_date)}
                  </div>
                </div>
              </div>
              {holds.filter((h: any) => h.resolved_at).length > 0 && (
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-blue-100">
                  Total hold days: <span className="font-semibold">{holds.filter((h: any) => h.resolved_at).reduce((acc: number, h: any) => acc + Math.round(parseFloat(h.impact_days) || 0), 0)}d</span>
                </div>
              )}
            </div>
          </Card>

          {/* Drawing & Mfg */}
          <Card className="border border-emerald-200 border-l-4 border-l-emerald-400 bg-emerald-50/20 shadow-sm overflow-hidden">
            <div className="px-4 pt-3 pb-2.5 border-b border-emerald-100 bg-emerald-50/40">
              <h4 className="text-xs font-bold flex items-center gap-2 text-emerald-900">
                <FileText className="h-4 w-4 text-emerald-500" /> Drawing & Manufacturing
              </h4>
            </div>
            <div className="p-4 space-y-1.5">
              <DetailRow label="Drawing No" value={wo.drawing_no ? <span className="font-bold text-blue-600">{wo.drawing_no}</span> : "—"} />
              <DetailRow label="Revision" value={wo.drawing_revision_text} />
              <DetailRow label="Drawing Status" value={wo.drawing_control_status ? <StatusPill status={wo.drawing_control_status} /> : "—"} />
              <DetailRow label="Released for Mfg" value={wo.released_for_manufacturing ? <span className="text-green-600 font-semibold">✓ Yes</span> : <span className="text-amber-600 font-semibold">✗ Not yet</span>} />
              {wo.dds_id && <DetailRow label="DDS" value={<a href={`/epc/drawing-controls`} className="text-blue-600 underline text-[10px]">View DDS</a>} />}
              {wo.source_bom_header_id && <DetailRow label="BOM" value={<a href={`/epc/bom-controls`} className="text-blue-600 underline text-[10px]">View BOM</a>} />}
              <DetailRow label="Classification" value={wo.make_classification} />
              {wo.manufacturing_notes && (
                <div className="mt-1.5 p-2 bg-emerald-50 border border-emerald-100 rounded text-[10px]">
                  <div className="text-[9px] font-bold text-emerald-700 uppercase mb-0.5">Mfg Notes</div>
                  {wo.manufacturing_notes}
                </div>
              )}
              {wo.wo_notes && (
                <div className="mt-1.5 p-2 bg-muted/40 rounded text-[10px]">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase mb-0.5">WO Notes</div>
                  {wo.wo_notes}
                </div>
              )}
              {!wo.released_for_manufacturing && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Drawing not yet released for manufacturing.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Crew Assignment ── */}
        <Card className="border border-indigo-200 border-l-4 border-l-indigo-400 bg-indigo-50/10 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-indigo-100 bg-indigo-50/30">
            <h4 className="text-xs font-bold flex items-center gap-2 text-indigo-900">
              <HardHat className="h-4 w-4 text-indigo-500" /> Crew Assignment
            </h4>
            {isManager && (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setCrewDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-0.5" /> Add Member
              </Button>
            )}
          </div>
          <div className="p-4">
            {crew.length === 0 ? (
              <div className="text-[11px] text-muted-foreground py-4 text-center">No crew assigned yet.</div>
            ) : (
              <div className="space-y-3">
                {crewProduction.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold text-indigo-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" /> Production
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="h-6 bg-indigo-50/40">
                          <TableHead className="text-[9px] py-0.5">Slot</TableHead>
                          <TableHead className="text-[9px] py-0.5">Assigned To</TableHead>
                          <TableHead className="text-[9px] py-0.5">Added By</TableHead>
                          {isManager && <TableHead className="text-[9px] py-0.5 text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {crewProduction.map((slot: any) => (
                          <TableRow key={slot.id} className="h-7">
                            <TableCell className="text-[10px] py-0.5 font-medium">{slot.slot_label}</TableCell>
                            <TableCell className="text-[10px] py-0.5">{slot.assigned_name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                            <TableCell className="text-[10px] py-0.5 text-muted-foreground">{slot.added_by_name}</TableCell>
                            {isManager && (
                              <TableCell className="py-0.5 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => { setEditSlotId(slot.id); setEditSlotName(slot.assigned_name || ""); setEditSlotOpen(true); }}><Edit className="h-2.5 w-2.5" /></Button>
                                  <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px] text-red-500" onClick={() => removeCrewMutation.mutate(slot.id)}><Trash2 className="h-2.5 w-2.5" /></Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {crewQuality.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold text-purple-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <Shield className="h-3 w-3" /> Quality
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="h-6 bg-purple-50/40">
                          <TableHead className="text-[9px] py-0.5">Slot</TableHead>
                          <TableHead className="text-[9px] py-0.5">Assigned To</TableHead>
                          <TableHead className="text-[9px] py-0.5">Added By</TableHead>
                          {isManager && <TableHead className="text-[9px] py-0.5 text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {crewQuality.map((slot: any) => (
                          <TableRow key={slot.id} className="h-7">
                            <TableCell className="text-[10px] py-0.5 font-medium">{slot.slot_label}</TableCell>
                            <TableCell className="text-[10px] py-0.5">{slot.assigned_name || <span className="text-muted-foreground italic">—</span>}</TableCell>
                            <TableCell className="text-[10px] py-0.5 text-muted-foreground">{slot.added_by_name}</TableCell>
                            {isManager && (
                              <TableCell className="py-0.5 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => { setEditSlotId(slot.id); setEditSlotName(slot.assigned_name || ""); setEditSlotOpen(true); }}><Edit className="h-2.5 w-2.5" /></Button>
                                  <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px] text-red-500" onClick={() => removeCrewMutation.mutate(slot.id)}><Trash2 className="h-2.5 w-2.5" /></Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* ── Quality Plan & Inspection ── */}
        <Card className="border border-purple-200 border-l-4 border-l-purple-400 bg-purple-50/10 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-2.5 border-b border-purple-100 bg-purple-50/30">
            <h4 className="text-xs font-bold flex items-center gap-2 text-purple-900">
              <CheckCircle2 className="h-4 w-4 text-purple-500" /> Quality Plan & Inspection
            </h4>
          </div>
          <div className="p-4">
            {wo.quality_plan ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-purple-50/40 rounded-lg border border-purple-100">
                  <DetailRow label="Plan No" value={wo.quality_plan.quality_plan_number} />
                  <DetailRow label="Status" value={<StatusPill status={wo.quality_plan.status} />} />
                  <DetailRow label="Type" value={wo.quality_plan.quality_requirement_type} />
                  <DetailRow label="QC Inspector" value={<span className="font-semibold text-purple-700">{wo.quality_plan.assigned_to_name || "—"}</span>} />
                </div>
                {inspections.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow className="h-6 bg-purple-50/40">
                        <TableHead className="text-[9px] py-0.5">Inspection No</TableHead>
                        <TableHead className="text-[9px] py-0.5">Type</TableHead>
                        <TableHead className="text-[9px] py-0.5">Status</TableHead>
                        <TableHead className="text-[9px] py-0.5">Scheduled</TableHead>
                        <TableHead className="text-[9px] py-0.5">Completed</TableHead>
                        <TableHead className="text-[9px] py-0.5">Inspector</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inspections.map((ins: any) => (
                        <TableRow key={ins.id} className="h-7">
                          <TableCell className="text-[10px] py-0.5 font-mono">{ins.inspection_number}</TableCell>
                          <TableCell className="text-[10px] py-0.5">{ins.inspection_type}</TableCell>
                          <TableCell className="text-[10px] py-0.5"><StatusPill status={ins.status} /></TableCell>
                          <TableCell className="text-[10px] py-0.5">{fmtDate(ins.scheduled_at)}</TableCell>
                          <TableCell className="text-[10px] py-0.5">{fmtDate(ins.completed_at || ins.failed_at)}</TableCell>
                          <TableCell className="text-[10px] py-0.5">{ins.assigned_to_name || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground py-3">No quality plan linked to this WO.</div>
            )}
          </div>
        </Card>

        {/* ── Daily Production Log ── */}
        <Card className="border border-sky-200 border-l-4 border-l-sky-400 bg-sky-50/10 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-sky-100 bg-sky-50/30">
            <h4 className="text-xs font-bold flex items-center gap-2 text-sky-900">
              <Clock className="h-4 w-4 text-sky-500" /> Daily Production Log
            </h4>
            {isSeniorExec && (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={openNewLog} disabled={todayLogExists} title={todayLogExists ? "Already logged today" : ""}>
                <Plus className="h-3 w-3 mr-0.5" /> {todayLogExists ? "Already logged today" : "Add Today's Log"}
              </Button>
            )}
          </div>
          <div className="p-4">
            {dailyLogs.length === 0 ? (
              <div className="text-[11px] text-muted-foreground py-4 text-center">No production logs yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-6 bg-sky-50/40">
                    <TableHead className="text-[9px] py-0.5">Date</TableHead>
                    <TableHead className="text-[9px] py-0.5">Progress</TableHead>
                    <TableHead className="text-[9px] py-0.5">Work Done</TableHead>
                    <TableHead className="text-[9px] py-0.5">Manpower</TableHead>
                    <TableHead className="text-[9px] py-0.5">Hours</TableHead>
                    <TableHead className="text-[9px] py-0.5">Issues</TableHead>
                    <TableHead className="text-[9px] py-0.5">By</TableHead>
                    <TableHead className="text-[9px] py-0.5">Status</TableHead>
                    {isSeniorExec && <TableHead className="text-[9px] py-0.5 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyLogs.map((log: any) => (
                    <TableRow key={log.id} className="h-7">
                      <TableCell className="text-[10px] py-0.5 font-mono">{fmtDate(log.log_date)}</TableCell>
                      <TableCell className="text-[10px] py-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 h-1.5 bg-sky-100 rounded-full overflow-hidden border border-sky-200">
                            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${log.progress_percent}%` }} />
                          </div>
                          <span className="font-semibold">{log.progress_percent}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] py-0.5 max-w-[140px] truncate" title={log.work_done_today}>{log.work_done_today || "—"}</TableCell>
                      <TableCell className="text-[10px] py-0.5">{log.manpower_count}</TableCell>
                      <TableCell className="text-[10px] py-0.5">{log.hours_worked}</TableCell>
                      <TableCell className="text-[10px] py-0.5 max-w-[120px] truncate" title={log.issues_encountered}>{log.issues_encountered || "—"}</TableCell>
                      <TableCell className="text-[10px] py-0.5 text-muted-foreground">{log.reported_by_name}</TableCell>
                      <TableCell className="text-[10px] py-0.5"><StatusPill status={log.status} /></TableCell>
                      {isSeniorExec && (
                        <TableCell className="py-0.5 text-right">
                          <div className="flex justify-end gap-1">
                            {log.status === "draft" && <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => openEditLog(log)}><Edit className="h-2.5 w-2.5" /></Button>}
                            {log.status === "draft" && <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px] text-green-600" onClick={() => submitLogMutation.mutate(log.id)}>Submit</Button>}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* ── Hold & Delay Records ── */}
        <Card className="border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50/10 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-orange-100 bg-orange-50/30">
            <h4 className="text-xs font-bold flex items-center gap-2 text-orange-900">
              <AlertTriangle className="h-4 w-4 text-orange-500" /> Hold & Delay Records
            </h4>
            {isManager && (
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setHoldDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-0.5" /> Raise Hold
              </Button>
            )}
          </div>
          <div className="p-4">
            {holds.length === 0 ? (
              <div className="text-[11px] text-muted-foreground py-4 text-center">No holds or delays recorded.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-6 bg-orange-50/40">
                    <TableHead className="text-[9px] py-0.5">#</TableHead>
                    <TableHead className="text-[9px] py-0.5">Type</TableHead>
                    <TableHead className="text-[9px] py-0.5">Reason</TableHead>
                    <TableHead className="text-[9px] py-0.5">Raised By</TableHead>
                    <TableHead className="text-[9px] py-0.5">Held Since</TableHead>
                    <TableHead className="text-[9px] py-0.5">Status</TableHead>
                    <TableHead className="text-[9px] py-0.5">Impact</TableHead>
                    {isManager && <TableHead className="text-[9px] py-0.5 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holds.map((h: any, i: number) => (
                    <TableRow key={h.id} className="h-7">
                      <TableCell className="text-[10px] py-0.5">{i + 1}</TableCell>
                      <TableCell className="text-[10px] py-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold border ${HOLD_TYPE_COLORS[h.hold_type] || "bg-gray-100 text-gray-600 border-gray-300"}`}>{HOLD_TYPE_LABELS[h.hold_type] || h.hold_type}</span>
                      </TableCell>
                      <TableCell className="text-[10px] py-0.5 max-w-[140px] truncate" title={h.hold_reason}>{h.hold_reason}</TableCell>
                      <TableCell className="text-[10px] py-0.5 text-muted-foreground">{h.held_by_name}</TableCell>
                      <TableCell className="text-[10px] py-0.5">{fmtDate(h.held_at)}</TableCell>
                      <TableCell className="text-[10px] py-0.5"><StatusPill status={h.resolved_at ? "resolved" : "open"} /></TableCell>
                      <TableCell className="text-[10px] py-0.5 font-semibold">{Math.round(parseFloat(h.impact_days) || 0)}d</TableCell>
                      {isManager && (
                        <TableCell className="py-0.5 text-right">
                          {!h.resolved_at && (
                            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] text-green-600" onClick={() => { setResolveHoldId(h.id); setResolveNotes(""); setResolveOpen(true); }}>Resolve</Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* ── Manpower Utilization ── */}
        <SectionToggle label="Manpower Utilization" icon={BarChart3}>
          {manpower && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Days Logged", val: manpower.days_logged || 0 },
                { label: "Total Man-Days", val: manpower.total_man_days || 0 },
                { label: "Total Man-Hours", val: parseFloat(manpower.total_man_hours || 0).toFixed(1) },
                { label: "Avg Daily Headcount", val: manpower.avg_daily_headcount || "—" },
                { label: "Peak Headcount", val: manpower.peak_headcount || 0 },
                { label: "Team Leaders", val: manpower.total_team_leaders || 0 },
                { label: "Fitters", val: manpower.total_fitters || 0 },
                { label: "Welders", val: manpower.total_welders || 0 },
                { label: "Helpers", val: manpower.total_helpers || 0 },
                { label: "QC Persons", val: manpower.total_qc_persons || 0 },
              ].map(({ label, val }) => (
                <div key={label} className="bg-muted/40 border border-border rounded-lg p-2.5">
                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
                  <div className="text-sm font-bold mt-0.5">{val}</div>
                </div>
              ))}
            </div>
          )}
        </SectionToggle>

        {/* ── WO Component Items ── */}
        {wo.items?.length > 0 && (
          <SectionToggle label={`WO Component Items (${wo.items.length})`} icon={Package}>
            <Table>
              <TableHeader>
                <TableRow className="h-6">
                  <TableHead className="text-[9px] py-0.5">Line</TableHead>
                  <TableHead className="text-[9px] py-0.5">Item Code</TableHead>
                  <TableHead className="text-[9px] py-0.5">Description</TableHead>
                  <TableHead className="text-[9px] py-0.5">Spec</TableHead>
                  <TableHead className="text-[9px] py-0.5">Qty</TableHead>
                  <TableHead className="text-[9px] py-0.5">UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wo.items.map((item: any) => (
                  <TableRow key={item.id} className="h-7">
                    <TableCell className="text-[10px] py-0.5">{item.line_number}</TableCell>
                    <TableCell className="text-[10px] py-0.5 font-mono">{item.item_code}</TableCell>
                    <TableCell className="text-[10px] py-0.5">{item.item_description}</TableCell>
                    <TableCell className="text-[10px] py-0.5 text-muted-foreground truncate max-w-[100px]">{item.item_specification}</TableCell>
                    <TableCell className="text-[10px] py-0.5">{item.quantity}</TableCell>
                    <TableCell className="text-[10px] py-0.5">{item.uom}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionToggle>
        )}

        {/* ── Cost & Audit Trail ── */}
        <SectionToggle label="Cost & Audit Trail" icon={FileText}>
          <div className="space-y-1 pt-1">
            <DetailRow label="Est. Unit Cost" value={wo.estimated_unit_cost ? `INR ${parseFloat(wo.estimated_unit_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"} />
            <DetailRow label="Est. Total Cost" value={wo.estimated_total_cost ? `INR ${parseFloat(wo.estimated_total_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"} />
            <Separator className="my-1.5" />
            <DetailRow label="Approved By" value={wo.approved_by_name} />
            <DetailRow label="Approved At" value={fmtDateTime(wo.approved_at)} />
            {wo.approval_note && <DetailRow label="Approval Note" value={wo.approval_note} />}
            <Separator className="my-1.5" />
            <DetailRow label="Released By" value={wo.released_by_name} />
            <DetailRow label="Released At" value={fmtDateTime(wo.released_at)} />
            {wo.release_note && <DetailRow label="Release Note" value={wo.release_note} />}
            <Separator className="my-1.5" />
            <DetailRow label="Created From" value={wo.created_source_type} />
            {wo.created_source_ref && <DetailRow label="Source Ref" value={wo.created_source_ref} />}
            <DetailRow label="Created At" value={fmtDateTime(wo.created_at)} />
          </div>
        </SectionToggle>

      </div>

      {/* ── Schedule Dialog ── */}
      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Edit WO Schedule</DialogTitle></DialogHeader>
          {schedForm && (
            <div className="space-y-4">
              {/* Project reference banner */}
              {(wo?.project_start_date || wo?.project_target_end_date) && (
                <div className="flex items-center gap-2 px-2.5 py-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-700">
                  <CalendarDays className="h-3 w-3 shrink-0 text-blue-400" />
                  <span><span className="font-semibold">Project:</span> {fmtDate(wo.project_start_date)} → {fmtDate(wo.project_target_end_date)}</span>
                </div>
              )}
              {/* Target dates */}
              <div className="space-y-2">
                <div className="text-[9px] font-bold uppercase tracking-wide text-blue-700">Target Dates</div>
                <div className="space-y-1">
                  <Label className="text-xs">Target Start</Label>
                  <Input type="date" className="h-8 text-xs" value={schedForm.target_start_date || ""} onChange={e => setSchedForm({ ...schedForm, target_start_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Target Completion</Label>
                  <Input type="date" className="h-8 text-xs" value={schedForm.target_completion_date || ""} onChange={e => setSchedForm({ ...schedForm, target_completion_date: e.target.value })} />
                </div>
              </div>
              <Separator />
              {/* Actual dates */}
              <div className="space-y-2">
                <div className="text-[9px] font-bold uppercase tracking-wide text-green-700">Actual Dates <span className="text-muted-foreground font-normal normal-case">(fill when work occurs)</span></div>
                <div className="space-y-1">
                  <Label className="text-xs">Actual Start</Label>
                  <Input type="date" className="h-8 text-xs" value={schedForm.actual_start_date || ""} onChange={e => setSchedForm({ ...schedForm, actual_start_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Actual Completion</Label>
                  <Input type="date" className="h-8 text-xs" value={schedForm.actual_completion_date || ""} onChange={e => setSchedForm({ ...schedForm, actual_completion_date: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSchedOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => schedMutation.mutate(schedForm)} disabled={schedMutation.isPending}>
              {schedMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Crew Dialog ── */}
      <Dialog open={crewDialogOpen} onOpenChange={setCrewDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Add Crew Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={crewForm.role_type} onValueChange={v => setCrewForm({ ...crewForm, role_type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Person Name (optional)</Label>
              <Input className="h-8 text-xs" placeholder="Enter name" value={crewForm.assigned_name} onChange={e => setCrewForm({ ...crewForm, assigned_name: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCrewDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => addCrewMutation.mutate(crewForm)} disabled={addCrewMutation.isPending}>
              {addCrewMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Crew Name Dialog ── */}
      <Dialog open={editSlotOpen} onOpenChange={setEditSlotOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">Edit Assigned Name</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Person Name</Label>
            <Input className="h-8 text-xs" value={editSlotName} onChange={e => setEditSlotName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditSlotOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => editCrewMutation.mutate({ slotId: editSlotId, name: editSlotName })} disabled={editCrewMutation.isPending}>
              {editCrewMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Daily Log Dialog ── */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-sm">{editLogId ? "Edit" : "Add"} Production Log</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-8 text-xs" value={logForm.log_date} onChange={e => setLogForm({ ...logForm, log_date: e.target.value })} disabled={!!editLogId} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Progress % (0–100)</Label>
                <Input type="number" min={0} max={100} className="h-8 text-xs" value={logForm.progress_percent} onChange={e => setLogForm({ ...logForm, progress_percent: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Work Done Today</Label>
              <Textarea className="text-xs min-h-[60px]" value={logForm.work_done_today} onChange={e => setLogForm({ ...logForm, work_done_today: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Total Manpower Count</Label>
                <Input type="number" min={0} className="h-8 text-xs" value={logForm.manpower_count} onChange={e => setLogForm({ ...logForm, manpower_count: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hours Worked</Label>
                <Input type="number" min={0} step={0.5} className="h-8 text-xs" value={logForm.hours_worked} onChange={e => setLogForm({ ...logForm, hours_worked: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Manpower Breakdown</Label>
              <div className="grid grid-cols-3 gap-2">
                {[["team_leaders", "Team Leaders"], ["fitters", "Fitters"], ["welders", "Welders"], ["helpers", "Helpers"], ["qc_persons", "QC Persons"]].map(([k, label]) => (
                  <div key={k} className="space-y-0.5">
                    <Label className="text-[9px] text-muted-foreground">{label}</Label>
                    <Input type="number" min={0} className="h-7 text-xs" value={logForm.manpower_breakdown[k] || 0} onChange={e => setLogForm({ ...logForm, manpower_breakdown: { ...logForm.manpower_breakdown, [k]: parseInt(e.target.value) || 0 } })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Issues Encountered</Label>
              <Textarea className="text-xs min-h-[50px]" value={logForm.issues_encountered} onChange={e => setLogForm({ ...logForm, issues_encountered: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Next Day Plan</Label>
              <Textarea className="text-xs min-h-[50px]" value={logForm.next_day_plan} onChange={e => setLogForm({ ...logForm, next_day_plan: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Crew Note (optional)</Label>
              <Input className="h-8 text-xs" placeholder="Who was on site today" value={logForm.crew_note} onChange={e => setLogForm({ ...logForm, crew_note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => addLogMutation.mutate(logForm)} disabled={addLogMutation.isPending}>
              {addLogMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Raise Hold Dialog ── */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Raise Hold / Delay</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Hold Type</Label>
              <Select value={holdForm.hold_type} onValueChange={v => setHoldForm({ ...holdForm, hold_type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(HOLD_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason (required)</Label>
              <Textarea className="text-xs min-h-[70px]" value={holdForm.hold_reason} onChange={e => setHoldForm({ ...holdForm, hold_reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHoldDialogOpen(false)}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={() => addHoldMutation.mutate(holdForm)} disabled={addHoldMutation.isPending || !holdForm.hold_reason.trim()}>
              {addHoldMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Raise Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Hold Dialog ── */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Resolve Hold</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Resolution Notes</Label>
            <Textarea className="text-xs min-h-[70px]" value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => resolveHoldMutation.mutate({ holdId: resolveHoldId, notes: resolveNotes })} disabled={resolveHoldMutation.isPending}>
              {resolveHoldMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}

import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, fetchWithProjectAccess } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";
import EpcDocumentPanel from "@/components/epc-document-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Search, Filter, AlertTriangle, Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, RefreshCw, FileText, Package, ClipboardCheck,
  ShoppingCart, Factory, Eye, Truck, Wrench, Receipt, DollarSign,
  ArrowRight, Minus, PenTool, List, ExternalLink, Scale, Link2,
} from "lucide-react";
import { roleHierarchy } from "@shared/roles";

type PipelineRecord = {
  id: number;
  status: string;
  planning_type?: string;
  source_context?: string;
  inspection_type?: string;
  classification_snapshot?: string;
  item_code?: string;
  item_description?: string;
  quality_requirement_type?: string;
  dr_number?: string;
  dispatch_number?: string;
  cr_number?: string;
  br_number?: string;
  invoice_number?: string;
  billing_basis?: string;
  gross_amount?: string;
  amount_paid?: string;
  amount_outstanding?: string;
  total_amount?: string;
  [key: string]: any;
};

type ProjectItem = {
  id: number;
  project_id: number;
  item_id: number;
  quantity: string;
  status: string;
  notes: string;
  masterItem?: { item_code: string; description: string; make_or_buy: string; uom: string };
};

type ActionDialogState = {
  open: boolean;
  action: string;
  layer: string;
  recordId: number;
  recordStatus: string;
  itemDesc: string;
  needsNote: boolean;
  noteLabel: string;
  endpoint: string;
  bodyKey: string;
  extraBody?: Record<string, any>;
};

const PHASE_GROUPS = {
  engineering: { label: "Engineering", phases: ["planning", "execution", "quality"] },
  procurement: { label: "Procurement/Production", phases: ["preparation", "inspection"] },
  logistics: { label: "Logistics", phases: ["dispatch", "commissioning"] },
  commercial: { label: "Commercial", phases: ["billing", "invoice"] },
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  under_review: "bg-blue-100 text-blue-700 border-blue-300",
  released: "bg-green-100 text-green-700 border-green-300",
  under_preparation: "bg-yellow-100 text-yellow-700 border-yellow-300",
  ready_for_po: "bg-emerald-100 text-emerald-700 border-emerald-300",
  ready_for_wo: "bg-emerald-100 text-emerald-700 border-emerald-300",
  ready_for_inspection_setup: "bg-teal-100 text-teal-700 border-teal-300",
  ready_for_po_creation: "bg-lime-100 text-lime-700 border-lime-300",
  ready_for_wo_creation: "bg-lime-100 text-lime-700 border-lime-300",
  scheduled: "bg-indigo-100 text-indigo-700 border-indigo-300",
  in_progress: "bg-purple-100 text-purple-700 border-purple-300",
  completed: "bg-green-100 text-green-700 border-green-300",
  failed: "bg-red-100 text-red-700 border-red-300",
  superseded: "bg-orange-100 text-orange-600 border-orange-300",
  cancelled: "bg-red-50 text-red-500 border-red-200",
  ready_for_dispatch: "bg-cyan-100 text-cyan-700 border-cyan-300",
  dispatched: "bg-teal-100 text-teal-700 border-teal-300",
  confirmed: "bg-blue-100 text-blue-700 border-blue-300",
  shipped: "bg-indigo-100 text-indigo-700 border-indigo-300",
  delivered: "bg-green-100 text-green-700 border-green-300",
  ready_for_commissioning: "bg-cyan-100 text-cyan-700 border-cyan-300",
  commissioned: "bg-emerald-100 text-emerald-700 border-emerald-300",
  handed_over: "bg-green-100 text-green-700 border-green-300",
  punch_list_open: "bg-orange-100 text-orange-700 border-orange-300",
  ready_for_handover: "bg-indigo-100 text-indigo-700 border-indigo-300",
  closed: "bg-violet-100 text-violet-700 border-violet-300",
  ready_for_invoice: "bg-lime-100 text-lime-700 border-lime-300",
  invoiced: "bg-green-100 text-green-700 border-green-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
  issued: "bg-blue-100 text-blue-700 border-blue-300",
  partially_paid: "bg-amber-100 text-amber-700 border-amber-300",
  paid: "bg-green-100 text-green-700 border-green-300",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground italic">—</span>;
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <Badge variant="outline" className={`${style} text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap border`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function ExceptionBadge({ type, label }: { type: string; label: string }) {
  const styles: Record<string, string> = {
    stuck: "bg-red-50 text-red-600 border-red-200",
    pending: "bg-amber-50 text-amber-600 border-amber-200",
    blocked: "bg-orange-50 text-orange-600 border-orange-200",
    quality_fail: "bg-red-50 text-red-700 border-red-300",
    overdue: "bg-red-100 text-red-800 border-red-300",
    gap: "bg-purple-50 text-purple-600 border-purple-200",
  };
  const icons: Record<string, any> = { stuck: Clock, pending: AlertTriangle, blocked: XCircle, quality_fail: XCircle, overdue: Clock, gap: ArrowRight };
  const Icon = icons[type] || AlertTriangle;
  return (
    <Badge variant="outline" className={`${styles[type] || styles.blocked} text-[9px] px-1 py-0 border gap-0.5`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

function PipelineProgressBar({ row }: { row: any }) {
  const execAppKey = row.isBuy ? "procurement_execution" : "production_execution";
  const prepAppKey = row.isBuy ? "po_preparation" : "wo_preparation";
  const layers = [
    { key: "plan", terminal: ["released", "completed"], appKey: "planning" },
    { key: "exec", terminal: ["ready_for_po", "ready_for_wo", "completed"], appKey: execAppKey },
    { key: "qp", terminal: ["ready_for_inspection_setup", "completed"], appKey: "quality" },
    { key: "prep", terminal: ["ready_for_po_creation", "ready_for_wo_creation", "completed"], appKey: prepAppKey },
    { key: "insp", terminal: ["completed"], appKey: "inspection" },
    { key: "disp", terminal: ["dispatched"], appKey: "dispatch" },
    { key: "comm", terminal: ["handed_over", "closed"], appKey: "commissioning" },
    { key: "bill", terminal: ["ready_for_invoice", "invoiced"], appKey: "billing" },
    { key: "inv", terminal: ["issued", "paid"], appKey: "invoice" },
  ];
  const applicableLayers = layers.filter(l => row.applicability?.[l.appKey]?.applicable !== false);
  const total = applicableLayers.length;
  let done = 0;
  for (const l of applicableLayers) {
    const rec = row[l.key];
    if (rec && l.terminal.includes(rec.status)) done++;
    else break;
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

type ReconciliationFinding = {
  type: "shortage" | "overage" | "missing_downstream" | "orphan" | "stage_mismatch" | "amount_mismatch";
  severity: "critical" | "warning" | "info";
  layer: string;
  label: string;
  sourceRef?: string;
  sourceQty?: number;
  targetRef?: string;
  targetQty?: number;
  sourceAmount?: number;
  targetAmount?: number;
};

const RECON_STYLES: Record<string, { bg: string; icon: any }> = {
  shortage: { bg: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
  overage: { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: Scale },
  missing_downstream: { bg: "bg-orange-50 text-orange-700 border-orange-200", icon: Link2 },
  orphan: { bg: "bg-purple-50 text-purple-700 border-purple-200", icon: XCircle },
  stage_mismatch: { bg: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: ArrowRight },
  amount_mismatch: { bg: "bg-pink-50 text-pink-700 border-pink-200", icon: DollarSign },
};

function getReconciliationFindings(row: any): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const { plan, exec, prep, po, wo, insp, disp, dispRec, comm, bill, inv, bom, isBuy, item } = row;
  const itemQty = parseFloat(item?.quantity || plan?.quantity || "0") || 0;
  if (itemQty === 0) return findings;

  const orderRecord = isBuy ? po : wo;
  const orderQty = orderRecord ? (parseFloat(orderRecord.quantity || "0") || 0) : 0;
  const orderRef = orderRecord ? (orderRecord.po_number || orderRecord.wo_number || `#${orderRecord.id}`) : null;

  if (prep && !["superseded", "canceled"].includes(prep.status)) {
    const readyStatuses = isBuy
      ? ["ready_for_po_creation", "completed"]
      : ["ready_for_wo_creation", "completed"];
    if (readyStatuses.includes(prep.status) && !orderRecord) {
      findings.push({
        type: "missing_downstream",
        severity: "warning",
        layer: isBuy ? "purchase_order" : "work_order",
        label: `${isBuy ? "PO" : "WO"} Prep ready but no ${isBuy ? "PO" : "WO"} created`,
        sourceRef: prep.po_prep_number || prep.wo_prep_number || `Prep #${prep.id}`,
      });
    }
  }

  if (orderRecord && !["superseded", "canceled"].includes(orderRecord.status)) {
    if (orderQty > 0 && itemQty > 0) {
      if (orderQty < itemQty) {
        findings.push({
          type: "shortage",
          severity: "critical",
          layer: isBuy ? "purchase_order" : "work_order",
          label: `${isBuy ? "PO" : "WO"} qty ${orderQty} < item qty ${itemQty}`,
          sourceRef: `Item: ${itemQty}`,
          sourceQty: itemQty,
          targetRef: orderRef || undefined,
          targetQty: orderQty,
        });
      } else if (orderQty > itemQty * 1.1) {
        findings.push({
          type: "overage",
          severity: "warning",
          layer: isBuy ? "purchase_order" : "work_order",
          label: `${isBuy ? "PO" : "WO"} qty ${orderQty} > item qty ${itemQty} (+${Math.round(((orderQty - itemQty) / itemQty) * 100)}%)`,
          sourceRef: `Item: ${itemQty}`,
          sourceQty: itemQty,
          targetRef: orderRef || undefined,
          targetQty: orderQty,
        });
      }
    }
  }

  if (orderRecord && !["superseded", "canceled", "draft"].includes(orderRecord.status) && !insp) {
    if (["approved", "issued", "released"].includes(orderRecord.status)) {
      findings.push({
        type: "missing_downstream",
        severity: "info",
        layer: "inspection",
        label: `${isBuy ? "PO" : "WO"} ${orderRecord.status} but no inspection`,
        sourceRef: orderRef || undefined,
      });
    }
  }

  const dispQty = disp ? (parseFloat(disp.dispatch_quantity || disp.quantity || "0") || 0) : 0;
  if (disp && !["superseded", "canceled"].includes(disp.status)) {
    if (dispQty > 0 && orderQty > 0 && dispQty > orderQty * 1.1) {
      findings.push({
        type: "overage",
        severity: "warning",
        layer: "dispatch",
        label: `Dispatch qty ${dispQty} > ${isBuy ? "PO" : "WO"} qty ${orderQty}`,
        sourceRef: orderRef || undefined,
        sourceQty: orderQty,
        targetRef: disp.dr_number || `DR #${disp.id}`,
        targetQty: dispQty,
      });
    }
    if (dispQty > 0 && dispQty < itemQty * 0.9 && disp.status === "dispatched") {
      findings.push({
        type: "shortage",
        severity: "warning",
        layer: "dispatch",
        label: `Partial dispatch: ${dispQty} of ${itemQty}`,
        sourceRef: `Item: ${itemQty}`,
        sourceQty: itemQty,
        targetRef: disp.dr_number || `DR #${disp.id}`,
        targetQty: dispQty,
      });
    }
    if (disp.status === "dispatched" && !dispRec) {
      findings.push({
        type: "missing_downstream",
        severity: "warning",
        layer: "dispatch_record",
        label: "Dispatched but no dispatch record",
        sourceRef: disp.dr_number || `DR #${disp.id}`,
      });
    }
  }

  if (dispRec && !["superseded", "canceled"].includes(dispRec.status)) {
    const recQty = parseFloat(dispRec.dispatch_quantity || dispRec.quantity || "0") || 0;
    if (recQty > 0 && dispQty > 0 && Math.abs(recQty - dispQty) > 0.01) {
      findings.push({
        type: "stage_mismatch",
        severity: recQty < dispQty ? "warning" : "info",
        layer: "dispatch_record",
        label: `Record qty ${recQty} ≠ readiness qty ${dispQty}`,
        sourceRef: disp?.dr_number || undefined,
        sourceQty: dispQty,
        targetRef: dispRec.dispatch_number || `DSP #${dispRec.id}`,
        targetQty: recQty,
      });
    }
    if (["delivered"].includes(dispRec.status) && !comm) {
      findings.push({
        type: "missing_downstream",
        severity: "warning",
        layer: "commissioning",
        label: "Delivered but no commissioning record",
        sourceRef: dispRec.dispatch_number || `DSP #${dispRec.id}`,
      });
    }
  }

  if (comm && !["superseded", "canceled"].includes(comm.status)) {
    const commQty = parseFloat(comm.quantity || "0") || 0;
    const sourceQty = dispRec ? (parseFloat(dispRec.dispatch_quantity || dispRec.quantity || "0") || 0) : dispQty;
    if (commQty > 0 && sourceQty > 0 && Math.abs(commQty - sourceQty) > 0.01) {
      findings.push({
        type: "stage_mismatch",
        severity: "info",
        layer: "commissioning",
        label: `Comm qty ${commQty} ≠ dispatch qty ${sourceQty}`,
        sourceRef: dispRec?.dispatch_number || disp?.dr_number || undefined,
        sourceQty: sourceQty,
        targetRef: comm.cr_number || `CR #${comm.id}`,
        targetQty: commQty,
      });
    }
    if (["handed_over", "closed"].includes(comm.status) && !bill) {
      findings.push({
        type: "missing_downstream",
        severity: "critical",
        layer: "billing",
        label: "Handed over but no billing record",
        sourceRef: comm.cr_number || `CR #${comm.id}`,
      });
    }
  }

  if (bill && !["superseded", "canceled"].includes(bill.status)) {
    if (["ready_for_invoice", "invoiced"].includes(bill.status) && !inv) {
      findings.push({
        type: "missing_downstream",
        severity: "critical",
        layer: "invoice",
        label: "Billing ready but no invoice created",
        sourceRef: bill.br_number || `BR #${bill.id}`,
      });
    }
  }

  if (bill && inv && !["superseded", "canceled"].includes(bill.status) && !["superseded", "canceled"].includes(inv.status)) {
    const billAmt = parseFloat(bill.gross_amount || bill.total_amount || "0") || 0;
    const invAmt = parseFloat(inv.gross_amount || inv.total_amount || "0") || 0;
    if (billAmt > 0 && invAmt > 0 && Math.abs(billAmt - invAmt) > 1) {
      findings.push({
        type: "amount_mismatch",
        severity: Math.abs(billAmt - invAmt) / Math.max(billAmt, invAmt) > 0.05 ? "warning" : "info",
        layer: "invoice",
        label: `Bill ₹${Math.round(billAmt).toLocaleString("en-IN")} ≠ Inv ₹${Math.round(invAmt).toLocaleString("en-IN")}`,
        sourceRef: bill.br_number || `BR #${bill.id}`,
        sourceAmount: billAmt,
        targetRef: inv.invoice_number || `INV #${inv.id}`,
        targetAmount: invAmt,
      });
    }
  }

  if (inv && !["superseded", "canceled"].includes(inv.status) && ["issued", "partially_paid"].includes(inv.status)) {
    const outstanding = parseFloat(inv.amount_outstanding || "0") || 0;
    const totalAmt = parseFloat(inv.gross_amount || inv.total_amount || "0") || 0;
    const paid = parseFloat(inv.amount_paid || "0") || 0;
    if (totalAmt > 0 && paid > totalAmt) {
      findings.push({
        type: "overage",
        severity: "warning",
        layer: "payment",
        label: `Overpaid: ₹${Math.round(paid).toLocaleString("en-IN")} on ₹${Math.round(totalAmt).toLocaleString("en-IN")}`,
        sourceRef: inv.invoice_number || `INV #${inv.id}`,
        sourceAmount: totalAmt,
        targetAmount: paid,
      });
    }
  }

  if (orderRecord && !["superseded", "canceled"].includes(orderRecord.status) && !prep) {
    findings.push({
      type: "orphan",
      severity: "info",
      layer: isBuy ? "purchase_order" : "work_order",
      label: `${isBuy ? "PO" : "WO"} exists without preparation record`,
      sourceRef: orderRef || undefined,
    });
  }

  if (disp && !orderRecord && !["superseded", "canceled"].includes(disp.status)) {
    findings.push({
      type: "orphan",
      severity: "warning",
      layer: "dispatch",
      label: `Dispatch without ${isBuy ? "PO" : "WO"}`,
      sourceRef: disp.dr_number || `DR #${disp.id}`,
    });
  }

  if (bill && !comm && !["superseded", "canceled"].includes(bill.status) && bill.billing_basis !== "milestone") {
    findings.push({
      type: "orphan",
      severity: "info",
      layer: "billing",
      label: "Billing without commissioning",
      sourceRef: bill.br_number || `BR #${bill.id}`,
    });
  }

  return findings;
}

const AGING_THRESHOLD_DAYS = 3;
const OVERDUE_THRESHOLD_DAYS = 7;

function daysSince(d: any): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function getExceptions(row: any) {
  const exceptions: { type: "stuck" | "pending" | "blocked" | "quality_fail" | "overdue" | "gap"; label: string; layer: string }[] = [];
  const { plan, exec, insp, disp, dispRec, comm, bill, inv, classification } = row;
  if (!classification || classification === "unclassified") {
    exceptions.push({ type: "blocked", label: "No classification", layer: "planning" });
  }
  if (plan?.status === "draft") {
    const age = daysSince(plan.created_at);
    if (age > OVERDUE_THRESHOLD_DAYS) {
      exceptions.push({ type: "overdue", label: `Plan draft ${age}d`, layer: "planning" });
    } else if (age > AGING_THRESHOLD_DAYS) {
      exceptions.push({ type: "stuck", label: "Stuck in draft", layer: "planning" });
    }
  }
  if (plan?.status === "under_review" && !plan.reviewed_by) {
    exceptions.push({ type: "pending", label: "Awaiting review", layer: "planning" });
  }
  if (exec?.status === "draft" && daysSince(exec.created_at) > OVERDUE_THRESHOLD_DAYS) {
    exceptions.push({ type: "overdue", label: `Exec draft ${daysSince(exec.created_at)}d`, layer: "execution" });
  }
  if (insp?.status === "failed") {
    exceptions.push({ type: "quality_fail", label: "Inspection failed", layer: "inspection" });
  }
  if (insp?.status === "scheduled" && daysSince(insp.scheduled_date) > AGING_THRESHOLD_DAYS) {
    exceptions.push({ type: "stuck", label: "Inspection overdue", layer: "inspection" });
  }
  if (disp?.status === "ready_for_dispatch" && daysSince(disp.ready_marked_at || disp.updated_at) > OVERDUE_THRESHOLD_DAYS) {
    exceptions.push({ type: "overdue", label: "Dispatch overdue", layer: "dispatch" });
  }
  if (dispRec?.status === "shipped" && daysSince(dispRec.shipped_at || dispRec.updated_at) > OVERDUE_THRESHOLD_DAYS * 2) {
    exceptions.push({ type: "overdue", label: "Delivery overdue", layer: "dispatch_record" });
  }
  if (comm?.status === "punch_list_open") {
    exceptions.push({ type: "blocked", label: "Punch list open", layer: "commissioning" });
  }
  if (comm?.status === "commissioned" && daysSince(comm.commissioned_at || comm.updated_at) > OVERDUE_THRESHOLD_DAYS) {
    exceptions.push({ type: "pending", label: "Handover pending", layer: "commissioning" });
  }
  if (comm?.status === "handed_over" && !bill) {
    exceptions.push({ type: "gap", label: "No billing after H/O", layer: "billing" });
  }
  if (dispRec && ["shipped", "delivered"].includes(dispRec.status) && !comm) {
    exceptions.push({ type: "gap", label: "No commissioning", layer: "commissioning" });
  }
  if (bill?.status === "ready_for_invoice" && !inv) {
    exceptions.push({ type: "gap", label: "No invoice created", layer: "invoice" });
  }
  if (inv?.status === "issued" && daysSince(inv.issued_at || inv.invoice_date) > 30) {
    exceptions.push({ type: "overdue", label: "Payment overdue", layer: "invoice" });
  }
  return exceptions;
}

function getAvailableActions(layer: string, status: string | null, record: PipelineRecord | null, userLevel: number = 99): { label: string; action: string; variant: "default" | "outline" | "destructive"; endpoint: string; needsNote: boolean; noteLabel: string; bodyKey: string; extraBody?: Record<string, any> }[] {
  if (!status || !record) return [];
  const id = record.id;
  const M = 3;
  const SM = 2;

  type ActionDef = { label: string; action: string; variant: "default" | "outline" | "destructive"; endpoint: string; needsNote: boolean; noteLabel: string; bodyKey: string; extraBody?: Record<string, any>; minLevel: number };
  let raw: ActionDef[] = [];

  if (layer === "planning") {
    if (status === "draft") raw = [
      { label: "Submit", action: "submit", variant: "default", endpoint: `/api/planning-records/${id}/submit-for-review`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    else if (status === "under_review" && !record.reviewed_by) raw = [
      { label: "Review", action: "review", variant: "default", endpoint: `/api/planning-records/${id}/review`, needsNote: true, noteLabel: "Review Note", bodyKey: "reviewNote", minLevel: M },
    ];
    else if (status === "under_review" && record.reviewed_by) raw = [
      { label: "Release", action: "release", variant: "default", endpoint: `/api/planning-records/${id}/release`, needsNote: true, noteLabel: "Release Note", bodyKey: "releaseNote", minLevel: SM },
    ];
    else if (!["superseded", "canceled"].includes(status)) raw = [
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/planning-records/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason", minLevel: M },
    ];
  }

  if (layer === "execution") {
    const isProc = record.planning_type === "procurement" || record.source_context === "procurement" || !record.drawing_revision;
    const prefix = isProc ? "procurement-executions" : "production-executions";
    if (status === "draft") raw = [
      { label: "Start Prep", action: "prepare", variant: "default", endpoint: `/api/${prefix}/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "under_preparation") raw = [
      { label: "Ready", action: "mark-ready", variant: "default", endpoint: `/api/${prefix}/${id}/mark-ready`, needsNote: true, noteLabel: "Preparation Note", bodyKey: "preparationNote", minLevel: M },
    ];
  }

  if (layer === "quality") {
    if (status === "draft") raw = [
      { label: "Start Prep", action: "start-prep", variant: "default", endpoint: `/api/quality-plans/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "under_preparation") raw = [
      { label: "Ready", action: "mark-ready", variant: "default", endpoint: `/api/quality-plans/${id}/mark-ready`, needsNote: true, noteLabel: "Preparation Note", bodyKey: "preparationNote", minLevel: M },
    ];
  }

  if (layer === "po_preparation" || layer === "wo_preparation") {
    const prefix = layer === "po_preparation" ? "po-preparations" : "wo-preparations";
    if (status === "draft") raw = [
      { label: "Submit", action: "submit", variant: "default", endpoint: `/api/${prefix}/${id}/submit-for-review`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "under_review") raw = [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/${prefix}/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
  }

  if (layer === "inspection") {
    if (status === "draft") raw = [
      { label: "Schedule", action: "schedule", variant: "default", endpoint: `/api/inspection-executions/${id}/schedule`, needsNote: true, noteLabel: "Scheduled Date (YYYY-MM-DD)", bodyKey: "scheduledDate", minLevel: M },
    ];
    if (status === "scheduled") raw = [
      { label: "Start", action: "start", variant: "default", endpoint: `/api/inspection-executions/${id}/start`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "in_progress") raw = [
      { label: "Pass", action: "complete-pass", variant: "default", endpoint: `/api/inspection-executions/${id}/complete`, needsNote: false, noteLabel: "", bodyKey: "", extraBody: { result: "pass" }, minLevel: M },
      { label: "Fail", action: "fail", variant: "destructive", endpoint: `/api/inspection-executions/${id}/fail`, needsNote: true, noteLabel: "Failure Reason", bodyKey: "failureReason", minLevel: M },
    ];
  }

  if (layer === "dispatch") {
    if (status === "draft") raw = [
      { label: "Start Prep", action: "start-prep", variant: "default", endpoint: `/api/dispatch-readiness/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "under_preparation") raw = [
      { label: "Mark Ready", action: "mark-ready", variant: "default", endpoint: `/api/dispatch-readiness/${id}/mark-ready`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "ready_for_dispatch") raw = [
      { label: "Dispatch", action: "dispatch", variant: "default", endpoint: `/api/dispatch-readiness/${id}/dispatch`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
  }

  if (layer === "dispatch_record") {
    if (status === "draft") raw = [
      { label: "Confirm", action: "confirm", variant: "default", endpoint: `/api/dispatch-records/${id}/confirm`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "confirmed") raw = [
      { label: "Ship", action: "ship", variant: "default", endpoint: `/api/dispatch-records/${id}/ship`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "shipped") raw = [
      { label: "Deliver", action: "deliver", variant: "default", endpoint: `/api/dispatch-records/${id}/deliver`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
  }

  if (layer === "commissioning") {
    if (status === "draft") raw = [
      { label: "Start Prep", action: "start-prep", variant: "default", endpoint: `/api/commissioning-readiness/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "under_preparation") raw = [
      { label: "Mark Ready", action: "mark-ready", variant: "default", endpoint: `/api/commissioning-readiness/${id}/mark-ready`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "ready_for_commissioning") raw = [
      { label: "Commission", action: "commission", variant: "default", endpoint: `/api/commissioning-readiness/${id}/commission`, needsNote: true, noteLabel: "Commissioning Note", bodyKey: "commissioningNote", minLevel: M },
    ];
    if (status === "commissioned") raw = [
      { label: "Punch List", action: "open-punch-list", variant: "outline", endpoint: `/api/commissioning-readiness/${id}/open-punch-list`, needsNote: true, noteLabel: "Punch List Items", bodyKey: "punchListNote", minLevel: M },
      { label: "Handover", action: "handover", variant: "default", endpoint: `/api/commissioning-readiness/${id}/handover`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: SM },
    ];
    if (status === "punch_list_open") raw = [
      { label: "Resolve", action: "resolve-punch-list", variant: "default", endpoint: `/api/commissioning-readiness/${id}/resolve-punch-list`, needsNote: true, noteLabel: "Resolution Note", bodyKey: "resolutionNote", minLevel: M },
    ];
    if (status === "ready_for_handover") raw = [
      { label: "Handover", action: "handover", variant: "default", endpoint: `/api/commissioning-readiness/${id}/handover`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: SM },
    ];
    if (status === "handed_over") raw = [
      { label: "Close", action: "close", variant: "outline", endpoint: `/api/commissioning-readiness/${id}/close`, needsNote: true, noteLabel: "Closing Note", bodyKey: "closingNote", minLevel: SM },
    ];
  }

  if (layer === "billing") {
    if (status === "draft") raw = [
      { label: "Submit Review", action: "submit-review", variant: "default", endpoint: `/api/billing-readiness/${id}/submit-review`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: M },
    ];
    if (status === "under_review") raw = [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/billing-readiness/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: SM },
    ];
  }

  if (layer === "invoice") {
    if (status === "draft") raw = [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/epc-invoices/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: SM },
    ];
    if (status === "approved") raw = [
      { label: "Issue", action: "issue", variant: "default", endpoint: `/api/epc-invoices/${id}/issue`, needsNote: false, noteLabel: "", bodyKey: "", minLevel: SM },
    ];
    if (status === "issued" || status === "partially_paid") raw = [
      { label: "Record Payment", action: "record-payment", variant: "default", endpoint: `/api/epc-invoices/${id}/record-payment`, needsNote: true, noteLabel: "Payment Amount", bodyKey: "paymentAmount", minLevel: M },
    ];
  }

  return raw.filter(a => userLevel <= a.minLevel);
}

export default function ExecutionControlDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPageAccess } = usePagePermissions();
  const [, navigate] = useLocation();
  const userRole = user?.role || "Viewer";
  const userLevel = roleHierarchy[userRole] ?? 99;
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [layerStatusFilter, setLayerStatusFilter] = useState<string>("all");
  const [exceptionFilter, setExceptionFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<string>("pipeline");
  const [reconTypeFilter, setReconTypeFilter] = useState<string>("all");
  const [reconSeverityFilter, setReconSeverityFilter] = useState<string>("all");
  const [reconLayerFilter, setReconLayerFilter] = useState<string>("all");
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    open: false, action: "", layer: "", recordId: 0, recordStatus: "",
    itemDesc: "", needsNote: false, noteLabel: "", endpoint: "", bodyKey: "",
  });
  const [actionNote, setActionNote] = useState("");
  const [explosionDialog, setExplosionDialog] = useState<{ open: boolean; bomHeaderId: number | null; bomNumber: string }>({ open: false, bomHeaderId: null, bomNumber: "" });
  const [explosionPreview, setExplosionPreview] = useState<any>(null);
  const [explosionLoading, setExplosionLoading] = useState(false);
  const [selectedExplosionLines, setSelectedExplosionLines] = useState<number[]>([]);

  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: itemCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/projects/item-counts"],
  });

  const [showAllExecProjects, setShowAllExecProjects] = useState(false);
  const activeProjects = useMemo(() => {
    const base = showAllExecProjects ? projects : projects.filter((p: any) => p.status === "active" || p.status === "planning");
    if (!showAllExecProjects && selectedProjectId && !base.find((p: any) => String(p.id) === selectedProjectId)) {
      const selected = projects.find((p: any) => String(p.id) === selectedProjectId);
      if (selected) base.push(selected);
    }
    base.sort((a: any, b: any) => ((itemCounts[b.id] || 0) - (itemCounts[a.id] || 0)));
    return base;
  }, [projects, itemCounts, showAllExecProjects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId && activeProjects.length > 0) {
      const withItems = activeProjects.find((p: any) => (itemCounts[p.id] || 0) > 0);
      if (withItems) setSelectedProjectId(String(withItems.id));
    }
  }, [activeProjects, itemCounts, selectedProjectId]);

  const projectId = selectedProjectId ? parseInt(selectedProjectId) : null;

  const { data: projectItems = [], isLoading: loadingItems, error: itemsError } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "items"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/items`),
    enabled: !!projectId,
  });

  const { data: planningRecords = [], isLoading: loadingPlanning } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "planning-records"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/planning-records`),
    enabled: !!projectId,
  });

  const { data: procExecs = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "procurement-executions"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/procurement-executions`),
    enabled: !!projectId,
  });

  const { data: prodExecs = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "production-executions"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/production-executions`),
    enabled: !!projectId,
  });

  const { data: qualityPlans = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "quality-plans"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/quality-plans`),
    enabled: !!projectId,
  });

  const { data: poPreps = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "po-preparations"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/po-preparations`),
    enabled: !!projectId,
  });

  const { data: woPreps = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "wo-preparations"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/wo-preparations`),
    enabled: !!projectId,
  });

  const { data: inspExecs = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "inspection-executions"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/inspection-executions`),
    enabled: !!projectId,
  });

  const { data: dispatchReadiness = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "dispatch-readiness"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/dispatch-readiness`),
    enabled: !!projectId,
  });

  const { data: dispatchRecords = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "dispatch-records"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/dispatch-records`),
    enabled: !!projectId,
  });

  const { data: commissioningReadiness = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "commissioning-readiness"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/commissioning-readiness`),
    enabled: !!projectId,
  });

  const { data: billingReadiness = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "billing-readiness"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/billing-readiness`),
    enabled: !!projectId,
  });

  const { data: epcInvoices = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "epc-invoices"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/epc-invoices`),
    enabled: !!projectId,
  });

  const { data: drawingControls = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "drawing-controls"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/drawing-controls`),
    enabled: !!projectId,
  });

  const { data: bomHeaders = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "bom-headers"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/bom-headers`),
    enabled: !!projectId,
  });

  const { data: epcPurchaseOrders = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "epc-purchase-orders"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/epc-purchase-orders`),
    enabled: !!projectId,
  });

  const { data: epcWorkOrders = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "epc-work-orders"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/epc-work-orders`),
    enabled: !!projectId,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ endpoint, body }: { endpoint: string; body: any }) => {
      return apiRequest("POST", endpoint, body);
    },
    onSuccess: () => {
      toast({ title: "Action completed", description: "Pipeline record updated successfully." });
      invalidateAll();
      setActionDialog(prev => ({ ...prev, open: false }));
      setActionNote("");
    },
    onError: (error: any) => {
      toast({ title: "Action failed", description: error.message || "Something went wrong", variant: "destructive" });
    },
  });

  function invalidateAll() {
    if (!projectId) return;
    const keys = [
      "planning-records", "procurement-executions", "production-executions",
      "quality-plans", "po-preparations", "wo-preparations", "inspection-executions",
      "dispatch-readiness", "dispatch-records", "commissioning-readiness",
      "billing-readiness", "epc-invoices", "drawing-controls", "bom-headers",
      "epc-purchase-orders", "epc-work-orders",
    ];
    keys.forEach(k => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, k] }));
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "items"] });
  }

  async function openExplosionDialog(bomHeaderId: number, bomNumber: string) {
    setExplosionDialog({ open: true, bomHeaderId, bomNumber });
    setExplosionLoading(true);
    setExplosionPreview(null);
    setSelectedExplosionLines([]);
    try {
      const resp = await fetch(`/api/bom-headers/${bomHeaderId}/explosion-preview`);
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Preview failed", description: data.message || "Could not load explosion preview", variant: "destructive" });
        setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" });
        return;
      }
      setExplosionPreview(data);
      const explodable = (data.lines || []).filter((l: any) => ['create', 'reuse', 'needs_review'].includes(l.action)).map((l: any) => l.lineId);
      setSelectedExplosionLines(explodable);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" });
    } finally {
      setExplosionLoading(false);
    }
  }

  async function executeExplosion() {
    if (!explosionDialog.bomHeaderId || selectedExplosionLines.length === 0) return;
    setExplosionLoading(true);
    try {
      const data: any = await apiRequest("POST", `/api/bom-headers/${explosionDialog.bomHeaderId}/explode`, {
        lineIds: selectedExplosionLines, confirm: true,
      });
      toast({ title: "Explosion complete", description: data.message || `${data.summary?.created || 0} child records created` });
      setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" });
      setExplosionPreview(null);
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Explosion failed", description: e.message, variant: "destructive" });
    } finally {
      setExplosionLoading(false);
    }
  }

  function findActive(records: PipelineRecord[], itemId: number) {
    if (!Array.isArray(records)) return null;
    return records.find((r) => r.project_item_id === itemId && !["superseded", "canceled"].includes(r.status))
      || records.find((r) => r.project_item_id === itemId)
      || null;
  }

  function findActiveDc(records: any[], itemId: number) {
    if (!Array.isArray(records)) return null;
    return records.find((r: any) => r.project_item_id === itemId && !["superseded", "canceled"].includes(r.status))
      || records.find((r: any) => r.project_item_id === itemId)
      || null;
  }

  function getStepApplicability(classification: string | null): Record<string, { applicable: boolean; reason?: string }> {
    const isBuy = classification === "Buy";
    const isMake = classification === "Make";
    return {
      planning: { applicable: true },
      procurement_execution: { applicable: isBuy || (!isBuy && !isMake), reason: isMake ? "Make items use Production Execution" : undefined },
      production_execution: { applicable: isMake || (!isBuy && !isMake), reason: isBuy ? "Buy items use Procurement Execution" : undefined },
      execution: { applicable: true },
      quality: { applicable: true },
      po_preparation: { applicable: isBuy || (!isBuy && !isMake), reason: isMake ? "Make items use WO Preparation" : undefined },
      wo_preparation: { applicable: isMake || (!isBuy && !isMake), reason: isBuy ? "Buy items use PO Preparation" : undefined },
      epc_po: { applicable: isBuy || (!isBuy && !isMake), reason: isMake ? "Make items use Work Orders" : undefined },
      epc_wo: { applicable: isMake || (!isBuy && !isMake), reason: isBuy ? "Buy items use Purchase Orders" : undefined },
      inspection: { applicable: true },
      dispatch: { applicable: true },
      dispatch_record: { applicable: true },
      commissioning: { applicable: true },
      billing: { applicable: true },
      invoice: { applicable: true },
    };
  }

  function getEngineeringWarnings(dc: any, bom: any, classification: string | null) {
    const warnings: { type: string; label: string }[] = [];
    const isBuy = classification === "Buy";
    const isMake = classification === "Make";

    if (!dc) {
      warnings.push({ type: "eng_missing", label: "No drawing control" });
    } else if (dc.status !== "released") {
      if (isBuy && !dc.released_for_procurement) {
        warnings.push({ type: "eng_gate", label: "DWG not released for procurement" });
      }
      if (isMake && !dc.released_for_manufacturing) {
        warnings.push({ type: "eng_gate", label: "DWG not released for manufacturing" });
      }
      if (!isBuy && !isMake && dc.status !== "released") {
        warnings.push({ type: "eng_gate", label: `DWG: ${dc.status.replace(/_/g, " ")}` });
      }
    }

    if (!bom) {
      warnings.push({ type: "eng_missing", label: "No BOM" });
    } else if (bom.status !== "released") {
      if (bom.status === "approved") {
        warnings.push({ type: "eng_gate", label: "BOM approved, not released" });
      } else {
        warnings.push({ type: "eng_gate", label: `BOM: ${bom.status.replace(/_/g, " ")}` });
      }
    }

    return warnings;
  }

  const pipelineRows = useMemo(() => {
    if (!projectItems.length) return [];

    return projectItems.map((item: any) => {
      const itemId = item.id;
      const plan = findActive(planningRecords, itemId);
      const classification = plan?.classification_snapshot || item.masterItem?.make_or_buy || null;
      const isBuy = classification === "Buy";

      const exec = isBuy ? findActive(procExecs, itemId) : findActive(prodExecs, itemId);
      const qp = findActive(qualityPlans, itemId);
      const prep = isBuy ? findActive(poPreps, itemId) : findActive(woPreps, itemId);
      const po = isBuy ? findActive(epcPurchaseOrders, itemId) : null;
      const wo = !isBuy ? findActive(epcWorkOrders, itemId) : null;
      const insp = findActive(inspExecs, itemId);
      const disp = findActive(dispatchReadiness, itemId);
      const dispRec = findActive(dispatchRecords, itemId);
      const comm = findActive(commissioningReadiness, itemId);
      const bill = findActive(billingReadiness, itemId);
      const inv = findActive(epcInvoices, itemId);

      const dc = findActiveDc(drawingControls, itemId);
      const bom = findActiveDc(bomHeaders, itemId);
      const engWarnings = getEngineeringWarnings(dc, bom, classification);
      const applicability = getStepApplicability(classification);

      const itemCode = plan?.item_code || exec?.item_code || item.masterItem?.item_code || `Item #${itemId}`;
      const itemDesc = plan?.item_description || exec?.item_description || item.masterItem?.description || "";

      const row = {
        itemId, item, plan, exec, qp, prep, po, wo, insp, disp, dispRec, comm, bill, inv,
        dc, bom, engWarnings, applicability,
        classification, isBuy, itemCode, itemDesc,
        exceptions: [] as any[],
        reconciliation: [] as ReconciliationFinding[],
      };
      row.exceptions = getExceptions(row);
      row.reconciliation = getReconciliationFindings(row);
      return row;
    });
  }, [projectItems, planningRecords, procExecs, prodExecs, qualityPlans, poPreps, woPreps, inspExecs, dispatchReadiness, dispatchRecords, commissioningReadiness, billingReadiness, epcInvoices, drawingControls, bomHeaders, epcPurchaseOrders, epcWorkOrders]);

  const filteredRows = useMemo(() => {
    return pipelineRows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!row.itemCode.toLowerCase().includes(q) && !row.itemDesc.toLowerCase().includes(q)) return false;
      }
      if (classificationFilter !== "all" && row.classification !== classificationFilter) return false;
      if (exceptionFilter !== "all") {
        if (exceptionFilter === "stuck" && !row.exceptions.some((e: any) => e.type === "stuck")) return false;
        if (exceptionFilter === "overdue" && !row.exceptions.some((e: any) => e.type === "overdue")) return false;
        if (exceptionFilter === "pending" && !row.exceptions.some((e: any) => e.type === "pending")) return false;
        if (exceptionFilter === "blocked" && !row.exceptions.some((e: any) => e.type === "blocked")) return false;
        if (exceptionFilter === "gap" && !row.exceptions.some((e: any) => e.type === "gap")) return false;
        if (exceptionFilter === "quality_fail" && !row.exceptions.some((e: any) => e.type === "quality_fail")) return false;
        if (exceptionFilter === "eng_warning" && row.engWarnings.length === 0) return false;
        if (exceptionFilter === "none" && row.exceptions.length > 0) return false;
      }
      if (layerStatusFilter !== "all") {
        const allStatuses = [
          row.plan?.status, row.exec?.status, row.qp?.status, row.prep?.status, row.insp?.status,
          row.disp?.status, row.dispRec?.status, row.comm?.status, row.bill?.status, row.inv?.status,
        ].filter(Boolean);
        if (!allStatuses.includes(layerStatusFilter)) return false;
      }
      if (phaseFilter !== "all") {
        if (phaseFilter === "no_planning" && row.plan) return false;
        if (phaseFilter === "no_dispatch" && row.disp) return false;
        if (phaseFilter === "no_invoice" && row.inv) return false;
        if (phaseFilter === "dispatched" && row.disp?.status !== "dispatched") return false;
        if (phaseFilter === "commissioned" && !["commissioned", "punch_list_open", "ready_for_handover", "handed_over", "closed"].includes(row.comm?.status || "")) return false;
        if (phaseFilter === "invoiced" && !["issued", "partially_paid", "paid"].includes(row.inv?.status || "")) return false;
      }
      return true;
    });
  }, [pipelineRows, searchQuery, classificationFilter, layerStatusFilter, exceptionFilter, phaseFilter]);

  const summaryStats = useMemo(() => {
    const total = pipelineRows.length;
    const withExceptions = pipelineRows.filter(r => r.exceptions.length > 0).length;
    const overdueCount = pipelineRows.filter(r => r.exceptions.some((e: any) => e.type === "overdue")).length;
    const gapCount = pipelineRows.filter(r => r.exceptions.some((e: any) => e.type === "gap")).length;
    const blockedCount = pipelineRows.filter(r => r.exceptions.some((e: any) => e.type === "blocked")).length;
    const buyCount = pipelineRows.filter(r => r.classification === "Buy").length;
    const makeCount = pipelineRows.filter(r => r.classification === "Make").length;
    const completedInsp = pipelineRows.filter(r => r.insp?.status === "completed").length;
    const failedInsp = pipelineRows.filter(r => r.insp?.status === "failed").length;
    const dispatchedCount = pipelineRows.filter(r => r.disp?.status === "dispatched" || r.dispRec).length;
    const shippedCount = pipelineRows.filter(r => r.dispRec?.status === "shipped").length;
    const deliveredCount = pipelineRows.filter(r => r.dispRec?.status === "delivered").length;
    const commissionedCount = pipelineRows.filter(r => ["commissioned", "ready_for_handover", "handed_over", "closed"].includes(r.comm?.status || "")).length;
    const punchListCount = pipelineRows.filter(r => r.comm?.status === "punch_list_open").length;
    const handedOverCount = pipelineRows.filter(r => ["handed_over", "closed"].includes(r.comm?.status || "")).length;
    const invoicedCount = pipelineRows.filter(r => ["issued", "partially_paid", "paid"].includes(r.inv?.status || "")).length;
    const paidCount = pipelineRows.filter(r => r.inv?.status === "paid").length;
    const outstandingAmount = pipelineRows.reduce((sum, r) => sum + (r.inv?.amount_outstanding ? parseFloat(r.inv.amount_outstanding) : 0), 0);
    const engWarningCount = pipelineRows.filter(r => r.engWarnings.length > 0).length;
    const dwgReleasedCount = pipelineRows.filter(r => r.dc?.status === "released").length;
    const bomReleasedCount = pipelineRows.filter(r => r.bom?.status === "released").length;
    const reconTotal = pipelineRows.reduce((s, r) => s + r.reconciliation.length, 0);
    const reconCritical = pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.severity === "critical").length, 0);
    const reconWarning = pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.severity === "warning").length, 0);
    const reconInfo = pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.severity === "info").length, 0);
    const reconByType = {
      shortage: pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.type === "shortage").length, 0),
      overage: pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.type === "overage").length, 0),
      missing_downstream: pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.type === "missing_downstream").length, 0),
      orphan: pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.type === "orphan").length, 0),
      stage_mismatch: pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.type === "stage_mismatch").length, 0),
      amount_mismatch: pipelineRows.reduce((s, r) => s + r.reconciliation.filter((f: ReconciliationFinding) => f.type === "amount_mismatch").length, 0),
    };
    const itemsWithFindings = pipelineRows.filter(r => r.reconciliation.length > 0).length;
    return { total, withExceptions, overdueCount, gapCount, blockedCount, buyCount, makeCount, completedInsp, failedInsp, dispatchedCount, shippedCount, deliveredCount, commissionedCount, punchListCount, handedOverCount, invoicedCount, paidCount, outstandingAmount, engWarningCount, dwgReleasedCount, bomReleasedCount, reconTotal, reconCritical, reconWarning, reconInfo, reconByType, itemsWithFindings };
  }, [pipelineRows]);

  const reconFilteredRows = useMemo(() => {
    return pipelineRows.filter(r => r.reconciliation.length > 0).map(r => ({
      ...r,
      filteredFindings: r.reconciliation.filter((f: ReconciliationFinding) => {
        if (reconTypeFilter !== "all" && f.type !== reconTypeFilter) return false;
        if (reconSeverityFilter !== "all" && f.severity !== reconSeverityFilter) return false;
        if (reconLayerFilter !== "all" && f.layer !== reconLayerFilter) return false;
        return true;
      }),
    })).filter(r => r.filteredFindings.length > 0);
  }, [pipelineRows, reconTypeFilter, reconSeverityFilter, reconLayerFilter]);

  function openActionDialog(action: any, layer: string, record: PipelineRecord, itemDesc: string) {
    setActionDialog({
      open: true, action: action.label, layer, recordId: record.id,
      recordStatus: record.status, itemDesc, needsNote: action.needsNote,
      noteLabel: action.noteLabel, endpoint: action.endpoint, bodyKey: action.bodyKey,
      extraBody: action.extraBody,
    });
    setActionNote("");
  }

  function executeAction() {
    const body: any = { ...(actionDialog.extraBody || {}) };
    if (actionDialog.bodyKey && actionNote) {
      body[actionDialog.bodyKey] = actionNote;
    }
    actionMutation.mutate({ endpoint: actionDialog.endpoint, body });
  }

  const isLoading = loadingProjects || (projectId && loadingItems) || (projectId && loadingPlanning);
  const projectAccessDenied = isProjectAccessDenied(itemsError);

  function toggleRow(itemId: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function renderLayerCell(layer: string, record: PipelineRecord | null, itemDesc: string, isApplicable: boolean = true) {
    if (!isApplicable) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-[8px] px-1.5 py-0.5 bg-slate-50 text-slate-400 border-slate-200">
              N/A
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Not applicable for this item's classification</TooltipContent>
        </Tooltip>
      );
    }
    if (!record) return <span className="text-[10px] text-muted-foreground">—</span>;
    const actions = getAvailableActions(layer, record.status, record, userLevel);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <StatusBadge status={record.status} />
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-0.5">
            {actions.slice(0, 2).map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.variant}
                className="h-5 text-[8px] px-1 py-0"
                onClick={(e) => { e.stopPropagation(); openActionDialog(a, layer, record, itemDesc); }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderDwgCell(dc: any, classification: string | null) {
    if (!dc) return <span className="text-[10px] text-muted-foreground">—</span>;
    const isBuy = classification === "Buy";
    const isMake = classification === "Make";

    const statusStyle = dc.status === "released" ? "bg-green-100 text-green-700 border-green-300"
      : dc.status === "approved" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : dc.status === "under_review" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

    const hasGateWarning = dc.status === "released" && (
      (isBuy && !dc.released_for_procurement) ||
      (isMake && !dc.released_for_manufacturing)
    );

    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex flex-col items-center gap-0.5">
            <Badge variant="outline" className={`${statusStyle} text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap border`}>
              {dc.status.replace(/_/g, " ")}
            </Badge>
            {dc.dwg_control_number && (
              <span className="text-[8px] text-muted-foreground font-mono">{dc.dwg_control_number}</span>
            )}
            {dc.status === "released" && !hasGateWarning && (
              <div className="flex gap-0.5">
                {dc.released_for_procurement && <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-green-50 text-green-600 border-green-200">P</Badge>}
                {dc.released_for_manufacturing && <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-green-50 text-green-600 border-green-200">M</Badge>}
              </div>
            )}
            {hasGateWarning && (
              <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-orange-50 text-orange-600 border-orange-200">
                <AlertTriangle className="h-2 w-2 mr-0.5" />
                {isBuy ? "P gate" : "M gate"}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <p className="font-medium">{dc.dwg_control_number}</p>
          <p>Status: {dc.status.replace(/_/g, " ")}</p>
          {dc.drawing_number && <p>Drawing: {dc.drawing_number} Rev {dc.drawing_revision || "—"}</p>}
          <p>Procurement: {dc.released_for_procurement ? "Released" : "Not released"}</p>
          <p>Manufacturing: {dc.released_for_manufacturing ? "Released" : "Not released"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  function renderBomCell(bom: any) {
    if (!bom) return <span className="text-[10px] text-muted-foreground">—</span>;

    const statusStyle = bom.status === "released" ? "bg-green-100 text-green-700 border-green-300"
      : bom.status === "approved" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : bom.status === "under_review" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

    const typeLabel = bom.bom_type === "procurement" ? "Proc"
      : bom.bom_type === "manufacturing" ? "Mfg"
      : "Assy";

    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex flex-col items-center gap-0.5">
            <Badge variant="outline" className={`${statusStyle} text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap border`}>
              {bom.status.replace(/_/g, " ")}
            </Badge>
            {bom.bom_number && (
              <span className="text-[8px] text-muted-foreground font-mono">{bom.bom_number}</span>
            )}
            <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-slate-50 text-slate-600 border-slate-200">
              {typeLabel}
            </Badge>
            {bom.total_line_count > 0 && (
              <span className="text-[7px] text-muted-foreground">{bom.total_line_count} lines</span>
            )}
            {bom.status === "released" && bom.total_line_count > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-4 text-[7px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                onClick={(e) => { e.stopPropagation(); openExplosionDialog(bom.id, bom.bom_number); }}
              >
                Explode
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <p className="font-medium">{bom.bom_number} (Rev {bom.bom_revision || "A"})</p>
          <p>Type: {bom.bom_type}</p>
          <p>Status: {bom.status.replace(/_/g, " ")}</p>
          <p>Lines: {bom.total_line_count}</p>
          {bom.total_estimated_cost && <p>Est. Cost: {parseFloat(bom.total_estimated_cost).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  function renderDispatchCell(row: any) {
    const dr = row.disp;
    const rec = row.dispRec;
    if (!dr && !rec) return <span className="text-[10px] text-muted-foreground">—</span>;
    return (
      <div className="flex flex-col items-center gap-0.5">
        {dr && (
          <Tooltip>
            <TooltipTrigger>
              <StatusBadge status={dr.status} />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>DR: {dr.dr_number || `#${dr.id}`}</p>
              <p>Status: {dr.status?.replace(/_/g, " ")}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {rec && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-teal-50 text-teal-700 border-teal-200">
                {rec.status?.replace(/_/g, " ")}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>Dispatch: {rec.dispatch_number || `#${rec.id}`}</p>
              <p>Status: {rec.status?.replace(/_/g, " ")}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {dr && !rec && getAvailableActions("dispatch", dr.status, dr, userLevel).slice(0, 1).map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant}
            className="h-5 text-[8px] px-1 py-0"
            onClick={(e) => { e.stopPropagation(); openActionDialog(a, "dispatch", dr, row.itemCode); }}
          >
            {a.label}
          </Button>
        ))}
        {rec && getAvailableActions("dispatch_record", rec.status, rec, userLevel).slice(0, 1).map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant}
            className="h-5 text-[8px] px-1 py-0"
            onClick={(e) => { e.stopPropagation(); openActionDialog(a, "dispatch_record", rec, row.itemCode); }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    );
  }

  function renderFinancialCell(layer: string, record: PipelineRecord | null, itemDesc: string) {
    if (!record) return <span className="text-[10px] text-muted-foreground">—</span>;
    const actions = getAvailableActions(layer, record.status, record, userLevel);
    const amt = record.gross_amount || record.total_amount;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <StatusBadge status={record.status} />
        {amt && (
          <span className="text-[8px] text-muted-foreground font-mono">
            {parseFloat(amt).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
          </span>
        )}
        {layer === "invoice" && record.status === "partially_paid" && record.amount_outstanding && (
          <span className="text-[8px] text-amber-600 font-mono">
            Due: {parseFloat(record.amount_outstanding).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        )}
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-0.5">
            {actions.slice(0, 1).map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.variant}
                className="h-5 text-[8px] px-1 py-0"
                onClick={(e) => { e.stopPropagation(); openActionDialog(a, layer, record, itemDesc); }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderExpandedDetails(row: typeof pipelineRows[0]) {
    const execApplicabilityKey = row.isBuy ? "procurement_execution" : "production_execution";
    const prepApplicabilityKey = row.isBuy ? "po_preparation" : "wo_preparation";
    const LAYER_DOC_TYPE: Record<string, string> = {
      planning: "PLN", execution: "BUY", production: "MFG",
      quality: "QPL", po_preparation: "POP", wo_preparation: "WOP",
      inspection: "INS", dispatch: "DR", dispatch_record: "DSP",
      commissioning: "CR", billing: "BR", invoice: "INV",
    };
    const layers = [
      { key: "planning", record: row.plan, label: "Planning", icon: FileText, applicabilityKey: "planning", docType: "PLN", deepLink: "/epc/planning-control", pageKey: "planning-control" },
      { key: "execution", record: row.exec, label: row.isBuy ? "Procurement" : "Production", icon: Package, applicabilityKey: execApplicabilityKey, docType: row.isBuy ? "BUY" : "MFG", deepLink: "/epc/execution-control", pageKey: "procurement-production" },
      { key: "quality", record: row.qp, label: "Quality Plan", icon: ClipboardCheck, applicabilityKey: "quality", docType: "QPL", deepLink: "/epc/quality-inspection", pageKey: "quality-inspection" },
      { key: row.isBuy ? "po_preparation" : "wo_preparation", record: row.prep, label: row.isBuy ? "PO Prep" : "WO Prep", icon: ShoppingCart, applicabilityKey: prepApplicabilityKey, docType: row.isBuy ? "POP" : "WOP", deepLink: row.isBuy ? "/epc/purchase-orders" : "/epc/work-orders", pageKey: row.isBuy ? "purchase-orders" : "work-orders" },
      { key: "inspection", record: row.insp, label: "Inspection", icon: Eye, applicabilityKey: "inspection", docType: "INS", deepLink: "/epc/quality-inspection", pageKey: "quality-inspection" },
      { key: "dispatch", record: row.disp, label: "Dispatch Readiness", icon: Truck, applicabilityKey: "dispatch", docType: "DR", deepLink: "/epc/dispatch-logistics", pageKey: "dispatch-logistics" },
      { key: "dispatch_record", record: row.dispRec, label: "Dispatch Record", icon: Truck, applicabilityKey: "dispatch_record", docType: "DSP", deepLink: "/epc/dispatch-logistics", pageKey: "dispatch-logistics" },
      { key: "commissioning", record: row.comm, label: "Commissioning", icon: Wrench, applicabilityKey: "commissioning", docType: "CR", deepLink: "/epc/commissioning-handover", pageKey: "commissioning-handover" },
      { key: "billing", record: row.bill, label: "Billing", icon: Receipt, applicabilityKey: "billing", docType: "BR", deepLink: "/epc/invoices", pageKey: "invoices" },
      { key: "invoice", record: row.inv, label: "Invoice", icon: DollarSign, applicabilityKey: "invoice", docType: "INV", deepLink: "/epc/invoices", pageKey: "invoices" },
    ];

    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={14} className="p-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Full Pipeline:</span>
              <PipelineProgressBar row={row} />
            </div>
            {row.engWarnings.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-orange-700">Engineering Warnings:</span>
                {row.engWarnings.map((w: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {w.label}
                  </Badge>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {[
                { key: "drawing_control", record: row.dc, label: "Drawing Control", icon: PenTool, isEng: true, deepLink: "/epc/drawing-controls", pageKey: "drawing-controls" },
                { key: "bom", record: row.bom, label: "BOM", icon: List, isEng: true, deepLink: "/epc/bom-controls", pageKey: "bom-controls" },
              ].map(({ key, record, label, icon: Icon, isEng, deepLink, pageKey }) => (
                <Card key={key} className={`shadow-sm ${!record ? "opacity-50" : ""}`}>
                  <CardHeader className="py-1.5 px-2.5">
                    <CardTitle className="text-[10px] font-medium flex items-center gap-1">
                      <Icon className="h-3 w-3" /> {label}
                      {record && deepLink && hasPageAccess(pageKey) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-4 w-4 p-0 ml-auto" onClick={(e) => { e.stopPropagation(); navigate(deepLink); }}>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[9px]">Open {label} page</TooltipContent>
                        </Tooltip>
                      )}
                      {record?.revision_code && (
                        <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-blue-50 text-blue-600 border-blue-200 ml-auto">
                          Rev {record.revision_code}
                        </Badge>
                      )}
                      {record?.is_current === false && (
                        <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-orange-50 text-orange-600 border-orange-200">
                          superseded
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2.5 pb-2 space-y-0.5">
                    {!record ? (
                      <p className="text-[10px] text-muted-foreground italic">Not created</p>
                    ) : (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-muted-foreground">Status</span>
                          <StatusBadge status={record.status} />
                        </div>
                        {(record.dwg_control_number || record.bom_number) && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Ref</span>
                            <span className="text-[9px] font-mono">{record.dwg_control_number || record.bom_number}</span>
                          </div>
                        )}
                        {record.drawing_number && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Drawing</span>
                            <span className="text-[9px] font-mono truncate ml-1">{record.drawing_number}</span>
                          </div>
                        )}
                        {record.bom_type && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Type</span>
                            <span className="text-[9px]">{record.bom_type}</span>
                          </div>
                        )}
                        {record.bom_revision && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Rev</span>
                            <span className="text-[9px]">{record.bom_revision}</span>
                          </div>
                        )}
                        {record.total_line_count > 0 && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Lines</span>
                            <span className="text-[9px]">{record.total_line_count}</span>
                          </div>
                        )}
                        {record.total_estimated_cost && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Est. Cost</span>
                            <span className="text-[9px] font-mono">{parseFloat(record.total_estimated_cost).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {record.released_for_procurement !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">P-Release</span>
                            <span className={`text-[9px] ${record.released_for_procurement ? "text-green-600" : "text-gray-400"}`}>{record.released_for_procurement ? "Yes" : "No"}</span>
                          </div>
                        )}
                        {record.released_for_manufacturing !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">M-Release</span>
                            <span className={`text-[9px] ${record.released_for_manufacturing ? "text-green-600" : "text-gray-400"}`}>{record.released_for_manufacturing ? "Yes" : "No"}</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {projectId && (row.dc || row.bom) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {row.dc && (
                  <EpcDocumentPanel
                    projectId={projectId}
                    docType="DWG"
                    parentEntityId={row.dc.id}
                    documentNumber={row.dc.dwg_control_number}
                    parentStatus={row.dc.status}
                    userRole={userRole}
                  />
                )}
                {row.bom && (
                  <EpcDocumentPanel
                    projectId={projectId}
                    docType="BOM"
                    parentEntityId={row.bom.id}
                    documentNumber={row.bom.bom_number}
                    parentStatus={row.bom.status}
                    userRole={userRole}
                  />
                )}
              </div>
            )}
            {row.reconciliation.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[10px] font-semibold text-amber-700">Reconciliation ({row.reconciliation.length})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.reconciliation.map((f: ReconciliationFinding, i: number) => {
                    const style = RECON_STYLES[f.type] || RECON_STYLES.stage_mismatch;
                    const Icon = style.icon;
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 gap-0.5 cursor-default ${style.bg}`}>
                            <Icon className="h-2.5 w-2.5" />
                            {f.label.length > 35 ? f.label.substring(0, 33) + "..." : f.label}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px] max-w-[300px]">
                          <div className="space-y-1">
                            <div><strong>Type:</strong> {f.type.replace(/_/g, " ")} | <strong>Severity:</strong> {f.severity}</div>
                            <div><strong>Stage:</strong> {f.layer.replace(/_/g, " ")}</div>
                            <div>{f.label}</div>
                            {f.sourceRef && <div><strong>Source:</strong> {f.sourceRef}{f.sourceQty != null ? ` (Qty: ${f.sourceQty})` : ""}</div>}
                            {f.targetRef && <div><strong>Target:</strong> {f.targetRef}{f.targetQty != null ? ` (Qty: ${f.targetQty})` : ""}</div>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {layers.map(({ key, record, label, icon: Icon, applicabilityKey, docType, deepLink, pageKey }) => {
                const stepApplicable = row.applicability[applicabilityKey]?.applicable !== false;
                const actions = record && stepApplicable ? getAvailableActions(key, record.status, record, userLevel) : [];
                const refNum = record?.planning_number || record?.procurement_number || record?.production_number || record?.quality_plan_number || record?.po_prep_number || record?.wo_prep_number || record?.inspection_number || record?.dr_number || record?.dispatch_number || record?.cr_number || record?.br_number || record?.invoice_number;
                return (
                  <Card key={key} className={`shadow-sm ${!stepApplicable ? "opacity-40 border-dashed" : !record ? "opacity-50" : ""}`}>
                    <CardHeader className="py-1.5 px-2.5">
                      <CardTitle className="text-[10px] font-medium flex items-center gap-1">
                        <Icon className="h-3 w-3" /> {label}
                        {!stepApplicable && <Badge variant="outline" className="text-[7px] px-1 py-0 ml-1 bg-slate-50 text-slate-400 border-slate-200">N/A</Badge>}
                        {record && deepLink && hasPageAccess(pageKey) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-4 w-4 p-0 ml-auto" onClick={(e) => { e.stopPropagation(); navigate(deepLink); }}>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[9px]">Open {label} page</TooltipContent>
                          </Tooltip>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2.5 pb-2 space-y-0.5">
                      {!stepApplicable ? (
                        <p className="text-[9px] text-slate-400 italic">{row.applicability[applicabilityKey]?.reason || "Not applicable"}</p>
                      ) : !record ? (
                        <p className="text-[10px] text-muted-foreground italic">Not created</p>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-muted-foreground">Status</span>
                            <StatusBadge status={record.status} />
                          </div>
                          {(record.dr_number || record.dispatch_number || record.cr_number || record.br_number || record.invoice_number) && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Ref</span>
                              <span className="text-[9px] font-mono">{record.dr_number || record.dispatch_number || record.cr_number || record.br_number || record.invoice_number}</span>
                            </div>
                          )}
                          {record.item_code && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Item</span>
                              <span className="text-[9px] font-mono truncate ml-1">{record.item_code}</span>
                            </div>
                          )}
                          {record.quantity && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Qty</span>
                              <span className="text-[9px]">{record.quantity} {record.uom || ""}</span>
                            </div>
                          )}
                          {record.gross_amount && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Amount</span>
                              <span className="text-[9px] font-mono">{parseFloat(record.gross_amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          {record.billing_basis && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Basis</span>
                              <span className="text-[9px]">{record.billing_basis}</span>
                            </div>
                          )}
                          {actions.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1 pt-1 border-t">
                              {actions.map((a) => (
                                <Button
                                  key={a.action}
                                  size="sm"
                                  variant={a.variant}
                                  className="h-5 text-[8px] px-1.5 py-0"
                                  onClick={() => openActionDialog(a, key, record, row.itemCode)}
                                >
                                  {a.label}
                                </Button>
                              ))}
                            </div>
                          )}
                          {projectId && record && docType && (
                            <div className="mt-1 pt-1 border-t">
                              <EpcDocumentPanel
                                projectId={projectId}
                                docType={docType}
                                parentEntityId={record.id}
                                documentNumber={refNum}
                                parentStatus={record.status}
                                userRole={userRole}
                                compact
                              />
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <Layout>
      <Helmet><title>Execution Control Dashboard | THERMOPAC QMS</title></Helmet>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Execution Control Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Full EPC pipeline: Planning through Invoice for each project item</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-1" /> Filters
            </Button>
            <Button variant="outline" size="sm" onClick={invalidateAll} disabled={!projectId}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-[600px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Project</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProjects.map((p: any) => {
                      const count = itemCounts[p.id] || 0;
                      return (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name || p.code} — {count} item{count !== 1 ? "s" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 mt-1">
                  <Checkbox id="showAllExecProjects" checked={showAllExecProjects} onCheckedChange={(v) => setShowAllExecProjects(!!v)} className="h-3.5 w-3.5" />
                  <label htmlFor="showAllExecProjects" className="text-[10px] text-muted-foreground cursor-pointer select-none">Show All Projects</label>
                </div>
              </div>
              <div className="w-[350px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Search Items</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by item code or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Make / Buy</label>
                  <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Buy">Buy</SelectItem>
                      <SelectItem value="Make">Make</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={layerStatusFilter} onValueChange={setLayerStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="released">Released</SelectItem>
                      <SelectItem value="under_preparation">Under Preparation</SelectItem>
                      <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="commissioned">Commissioned</SelectItem>
                      <SelectItem value="punch_list_open">Punch List Open</SelectItem>
                      <SelectItem value="ready_for_handover">Ready for Handover</SelectItem>
                      <SelectItem value="handed_over">Handed Over</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="ready_for_invoice">Ready for Invoice</SelectItem>
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Exceptions</label>
                  <Select value={exceptionFilter} onValueChange={setExceptionFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="stuck">Stuck / Aging</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="pending">Pending Action</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="gap">Cross-Stage Gap</SelectItem>
                      <SelectItem value="quality_fail">Quality Failed</SelectItem>
                      <SelectItem value="eng_warning">Engineering Warnings</SelectItem>
                      <SelectItem value="none">No Exceptions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phase</label>
                  <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Phases</SelectItem>
                      <SelectItem value="no_planning">No Planning Yet</SelectItem>
                      <SelectItem value="no_dispatch">Not Dispatched</SelectItem>
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                      <SelectItem value="commissioned">Commissioned / Handed Over</SelectItem>
                      <SelectItem value="invoiced">Invoiced</SelectItem>
                      <SelectItem value="no_invoice">No Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {projectId && pipelineRows.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {[
                { label: "Total Items", value: summaryStats.total, color: "" },
                { label: "Buy", value: summaryStats.buyCount, color: "text-blue-600" },
                { label: "Make", value: summaryStats.makeCount, color: "text-violet-600" },
                { label: "DWG Released", value: summaryStats.dwgReleasedCount, color: "text-cyan-600" },
                { label: "BOM Released", value: summaryStats.bomReleasedCount, color: "text-sky-600" },
                { label: "Inspected", value: summaryStats.completedInsp, color: "text-green-600" },
                { label: "Dispatched", value: summaryStats.dispatchedCount, color: "text-teal-600" },
                { label: "Delivered", value: summaryStats.deliveredCount, color: "text-emerald-600" },
                { label: "Commissioned", value: summaryStats.commissionedCount, color: "text-blue-600" },
                { label: "Handed Over", value: summaryStats.handedOverCount, color: "text-emerald-700" },
                { label: "Invoiced", value: summaryStats.invoicedCount, color: "text-indigo-600" },
                { label: "Paid", value: summaryStats.paidCount, color: "text-green-700" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="shadow-sm">
                  <CardContent className="pt-2 pb-1.5 px-2 text-center">
                    <div className={`text-lg font-bold ${color}`}>{value}</div>
                    <div className="text-[9px] text-muted-foreground">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {(summaryStats.withExceptions > 0 || summaryStats.engWarningCount > 0) && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { label: "Exceptions", value: summaryStats.withExceptions, color: "text-amber-600", bg: "border-amber-200 bg-amber-50/30" },
                  { label: "Overdue", value: summaryStats.overdueCount, color: "text-red-600", bg: "border-red-200 bg-red-50/30" },
                  { label: "Blocked", value: summaryStats.blockedCount, color: "text-orange-600", bg: "border-orange-200 bg-orange-50/30" },
                  { label: "Gaps", value: summaryStats.gapCount, color: "text-purple-600", bg: "border-purple-200 bg-purple-50/30" },
                  { label: "Eng Warnings", value: summaryStats.engWarningCount, color: "text-orange-600", bg: "border-orange-200 bg-orange-50/30" },
                  { label: "Punch List", value: summaryStats.punchListCount, color: "text-orange-700", bg: "border-orange-200 bg-orange-50/30" },
                ].filter(s => s.value > 0).map(({ label, value, color, bg }) => (
                  <Card key={label} className={`shadow-sm ${bg}`}>
                    <CardContent className="pt-2 pb-1.5 px-2 text-center">
                      <div className={`text-lg font-bold ${color}`}>{value}</div>
                      <div className="text-[9px] text-muted-foreground">{label}</div>
                    </CardContent>
                  </Card>
                ))}
                {summaryStats.outstandingAmount > 0 && (
                  <Card className="shadow-sm border-amber-200 bg-amber-50/30">
                    <CardContent className="pt-2 pb-1.5 px-2 text-center">
                      <div className="text-sm font-bold text-amber-700 font-mono">
                        {summaryStats.outstandingAmount.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[9px] text-muted-foreground">Outstanding</div>
                    </CardContent>
                  </Card>
                )}
                {summaryStats.failedInsp > 0 && (
                  <Card className="shadow-sm border-red-200 bg-red-50/30">
                    <CardContent className="pt-2 pb-1.5 px-2 text-center">
                      <div className="text-lg font-bold text-red-600">{summaryStats.failedInsp}</div>
                      <div className="text-[9px] text-muted-foreground">Insp. Failed</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {!projectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">Select a Project</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose a project above to view its execution control pipeline</p>
            </CardContent>
          </Card>
        ) : projectAccessDenied ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Loading pipeline data...</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={dashboardTab} onValueChange={setDashboardTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="pipeline" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Pipeline
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">{filteredRows.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="reconciliation" className="gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Reconciliation
                {summaryStats.reconTotal > 0 && (
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ml-1 ${summaryStats.reconCritical > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {summaryStats.reconTotal}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pipeline">
          {filteredRows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">No Items Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {pipelineRows.length === 0 ? "This project has no items yet." : "No items match the current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-6 px-1"></TableHead>
                        <TableHead className="text-[10px] font-semibold min-w-[140px] sticky left-0 bg-muted/50 z-10">Item</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center w-[50px]">Class</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[80px]">
                          <div className="flex items-center justify-center gap-0.5"><PenTool className="h-3 w-3" /> DWG</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[80px]">
                          <div className="flex items-center justify-center gap-0.5"><List className="h-3 w-3" /> BOM</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><FileText className="h-3 w-3" /> Plan</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Package className="h-3 w-3" /> Exec</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><ClipboardCheck className="h-3 w-3" /> Quality</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><ShoppingCart className="h-3 w-3" /> Prep</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Eye className="h-3 w-3" /> Inspect</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Truck className="h-3 w-3" /> Dispatch</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Wrench className="h-3 w-3" /> Comm</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Receipt className="h-3 w-3" /> Billing</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><DollarSign className="h-3 w-3" /> Invoice</div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => {
                        const isExpanded = expandedRows.has(row.itemId);
                        return (
                          <TooltipProvider key={row.itemId}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => toggleRow(row.itemId)}
                            >
                              <TableCell className="w-6 px-1">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="sticky left-0 bg-background z-10">
                                <div className="space-y-0.5">
                                  <div className="text-[10px] font-medium truncate max-w-[160px]">{row.itemCode}</div>
                                  <div className="text-[9px] text-muted-foreground truncate max-w-[160px]">{row.itemDesc}</div>
                                  {row.exceptions.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5">
                                      {row.exceptions.map((ex: any, i: number) => (
                                        <ExceptionBadge key={i} type={ex.type} label={ex.label} />
                                      ))}
                                    </div>
                                  )}
                                  {row.engWarnings.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5">
                                      {row.engWarnings.slice(0, 2).map((w: any, i: number) => (
                                        <Badge key={`ew-${i}`} variant="outline" className="text-[8px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-200 gap-0.5">
                                          <AlertTriangle className="h-2 w-2" />
                                          {w.label.length > 20 ? w.label.substring(0, 18) + "..." : w.label}
                                        </Badge>
                                      ))}
                                      {row.engWarnings.length > 2 && (
                                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-200">
                                          +{row.engWarnings.length - 2}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={`text-[9px] px-1 ${row.classification === "Buy" ? "bg-blue-50 text-blue-700 border-blue-200" : row.classification === "Make" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                  {row.classification || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {renderDwgCell(row.dc, row.classification)}
                              </TableCell>
                              <TableCell className="text-center">
                                {renderBomCell(row.bom)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("planning", row.plan, row.itemCode, row.applicability.planning.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("execution", row.exec, row.itemCode, row.isBuy ? row.applicability.procurement_execution.applicable : row.applicability.production_execution.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("quality", row.qp, row.itemCode, row.applicability.quality.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell(row.isBuy ? "po_preparation" : "wo_preparation", row.prep, row.itemCode, row.isBuy ? row.applicability.po_preparation.applicable : row.applicability.wo_preparation.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("inspection", row.insp, row.itemCode, row.applicability.inspection.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderDispatchCell(row)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("commissioning", row.comm, row.itemCode, row.applicability.commissioning.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderFinancialCell("billing", row.bill, row.itemCode)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderFinancialCell("invoice", row.inv, row.itemCode)}
                              </TableCell>
                            </TableRow>
                            {isExpanded && renderExpandedDetails(row)}
                          </TooltipProvider>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        )}
            </TabsContent>

            <TabsContent value="reconciliation">
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {[
                    { label: "Total Findings", value: summaryStats.reconTotal, color: "", bg: "" },
                    { label: "Critical", value: summaryStats.reconCritical, color: "text-red-700", bg: summaryStats.reconCritical > 0 ? "border-red-200 bg-red-50/30" : "" },
                    { label: "Warning", value: summaryStats.reconWarning, color: "text-amber-700", bg: summaryStats.reconWarning > 0 ? "border-amber-200 bg-amber-50/30" : "" },
                    { label: "Info", value: summaryStats.reconInfo, color: "text-blue-600", bg: "" },
                    { label: "Shortages", value: summaryStats.reconByType.shortage, color: "text-red-600", bg: summaryStats.reconByType.shortage > 0 ? "border-red-200 bg-red-50/30" : "" },
                    { label: "Missing Links", value: summaryStats.reconByType.missing_downstream, color: "text-orange-600", bg: summaryStats.reconByType.missing_downstream > 0 ? "border-orange-200 bg-orange-50/30" : "" },
                    { label: "Mismatches", value: summaryStats.reconByType.stage_mismatch + summaryStats.reconByType.amount_mismatch, color: "text-yellow-700", bg: "" },
                    { label: "Items Affected", value: summaryStats.itemsWithFindings, color: "text-purple-600", bg: "" },
                  ].map(({ label, value, color, bg }) => (
                    <Card key={label} className={`shadow-sm ${bg}`}>
                      <CardContent className="pt-2 pb-1.5 px-2 text-center">
                        <div className={`text-lg font-bold ${color}`}>{value}</div>
                        <div className="text-[9px] text-muted-foreground">{label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardContent className="pt-3 pb-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Finding Type</label>
                        <Select value={reconTypeFilter} onValueChange={setReconTypeFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="shortage">Shortage</SelectItem>
                            <SelectItem value="overage">Overage</SelectItem>
                            <SelectItem value="missing_downstream">Missing Downstream</SelectItem>
                            <SelectItem value="orphan">Orphan Record</SelectItem>
                            <SelectItem value="stage_mismatch">Stage Mismatch</SelectItem>
                            <SelectItem value="amount_mismatch">Amount Mismatch</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Severity</label>
                        <Select value={reconSeverityFilter} onValueChange={setReconSeverityFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Severities</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="warning">Warning</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Stage</label>
                        <Select value={reconLayerFilter} onValueChange={setReconLayerFilter}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Stages</SelectItem>
                            <SelectItem value="purchase_order">Purchase Order</SelectItem>
                            <SelectItem value="work_order">Work Order</SelectItem>
                            <SelectItem value="inspection">Inspection</SelectItem>
                            <SelectItem value="dispatch">Dispatch</SelectItem>
                            <SelectItem value="dispatch_record">Dispatch Record</SelectItem>
                            <SelectItem value="commissioning">Commissioning</SelectItem>
                            <SelectItem value="billing">Billing</SelectItem>
                            <SelectItem value="invoice">Invoice</SelectItem>
                            <SelectItem value="payment">Payment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {reconFilteredRows.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
                      <h3 className="text-lg font-medium">No Reconciliation Findings</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {summaryStats.reconTotal === 0 ? "All stages are reconciled. No shortages, mismatches, or missing records detected." : "No findings match the current filters."}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-[10px] font-semibold min-w-[140px]">Item</TableHead>
                              <TableHead className="text-[10px] font-semibold w-[60px] text-center">Class</TableHead>
                              <TableHead className="text-[10px] font-semibold w-[60px] text-center">Qty</TableHead>
                              <TableHead className="text-[10px] font-semibold min-w-[80px] text-center">Severity</TableHead>
                              <TableHead className="text-[10px] font-semibold min-w-[100px]">Type</TableHead>
                              <TableHead className="text-[10px] font-semibold min-w-[80px]">Stage</TableHead>
                              <TableHead className="text-[10px] font-semibold min-w-[200px]">Finding</TableHead>
                              <TableHead className="text-[10px] font-semibold min-w-[120px]">Source → Target</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reconFilteredRows.flatMap((row) =>
                              row.filteredFindings.map((f: ReconciliationFinding, fi: number) => {
                                const style = RECON_STYLES[f.type] || RECON_STYLES.stage_mismatch;
                                const Icon = style.icon;
                                const sevColor = f.severity === "critical" ? "bg-red-100 text-red-800 border-red-300"
                                  : f.severity === "warning" ? "bg-amber-100 text-amber-800 border-amber-300"
                                  : "bg-blue-100 text-blue-700 border-blue-300";
                                const isCommercial = ["billing", "invoice", "payment"].includes(f.layer);
                                const hideAmounts = isCommercial && userLevel > 3;
                                return (
                                  <TableRow key={`${row.itemId}-${fi}`} className="hover:bg-muted/20">
                                    {fi === 0 && (
                                      <>
                                        <TableCell rowSpan={row.filteredFindings.length} className="align-top border-r">
                                          <div className="text-[10px] font-medium">{row.itemCode}</div>
                                          <div className="text-[9px] text-muted-foreground truncate max-w-[140px]">{row.itemDesc}</div>
                                        </TableCell>
                                        <TableCell rowSpan={row.filteredFindings.length} className="text-center align-top border-r">
                                          <Badge variant="outline" className={`text-[9px] px-1 ${row.classification === "Buy" ? "bg-blue-50 text-blue-700 border-blue-200" : row.classification === "Make" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                            {row.classification || "—"}
                                          </Badge>
                                        </TableCell>
                                        <TableCell rowSpan={row.filteredFindings.length} className="text-center align-top border-r text-[10px] font-mono">
                                          {row.item?.quantity || "—"}
                                        </TableCell>
                                      </>
                                    )}
                                    <TableCell className="text-center">
                                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${sevColor}`}>
                                        {f.severity}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 gap-0.5 ${style.bg}`}>
                                        <Icon className="h-2.5 w-2.5" />
                                        {f.type.replace(/_/g, " ")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-[10px] text-muted-foreground">
                                      {f.layer.replace(/_/g, " ")}
                                    </TableCell>
                                    <TableCell className="text-[10px]">
                                      {hideAmounts ? <span className="italic text-muted-foreground">Restricted</span> : f.label}
                                    </TableCell>
                                    <TableCell className="text-[9px] font-mono text-muted-foreground">
                                      {hideAmounts ? "—" : (
                                        <div className="space-y-0.5">
                                          {f.sourceRef && <div>{f.sourceRef}{f.sourceQty != null ? ` (${f.sourceQty})` : ""}</div>}
                                          {f.targetRef && <div className="flex items-center gap-0.5"><ArrowRight className="h-2.5 w-2.5" />{f.targetRef}{f.targetQty != null ? ` (${f.targetQty})` : ""}</div>}
                                          {f.sourceAmount != null && <div>₹{Math.round(f.sourceAmount).toLocaleString("en-IN")}</div>}
                                          {f.targetAmount != null && <div className="flex items-center gap-0.5"><ArrowRight className="h-2.5 w-2.5" />₹{Math.round(f.targetAmount).toLocaleString("en-IN")}</div>}
                                        </div>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionDialog.action}</DialogTitle>
              <DialogDescription>
                {actionDialog.layer.replace(/_/g, " ")} record for: {actionDialog.itemDesc}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current Status:</span>
                <StatusBadge status={actionDialog.recordStatus} />
              </div>
              {actionDialog.needsNote && (
                <div>
                  <label className="text-sm font-medium block mb-1">{actionDialog.noteLabel}</label>
                  <Textarea
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder={`Enter ${actionDialog.noteLabel.toLowerCase()}...`}
                    rows={3}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(prev => ({ ...prev, open: false }))}>
                Cancel
              </Button>
              <Button
                onClick={executeAction}
                disabled={actionMutation.isPending || (actionDialog.needsNote && !actionNote.trim())}
                variant={actionDialog.action === "Cancel" || actionDialog.action.includes("Fail") ? "destructive" : "default"}
              >
                {actionMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={explosionDialog.open} onOpenChange={(open) => { if (!open) { setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" }); setExplosionPreview(null); } }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>BOM Explosion — {explosionDialog.bomNumber}</DialogTitle>
              <DialogDescription>
                Preview and confirm child planning record creation from BOM lines.
              </DialogDescription>
            </DialogHeader>
            {explosionLoading && !explosionPreview && (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading explosion preview...</p>
              </div>
            )}
            {explosionPreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="outline" className={
                    explosionPreview.explosionState === "fully_exploded" ? "bg-green-50 text-green-700 border-green-300"
                    : explosionPreview.explosionState === "partially_exploded" ? "bg-amber-50 text-amber-700 border-amber-300"
                    : "bg-slate-50 text-slate-600 border-slate-300"
                  }>
                    {explosionPreview.explosionState.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-muted-foreground">Parent Qty: <strong>{explosionPreview.parentQuantity}</strong></span>
                  <span className="text-muted-foreground">Lines: <strong>{explosionPreview.summary.totalLines}</strong></span>
                  <span className="text-green-600">Explodable: <strong>{explosionPreview.summary.explodableLines}</strong></span>
                  <span className="text-blue-600">Existing: <strong>{explosionPreview.summary.skipExisting}</strong></span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-[10px]">Sel</TableHead>
                      <TableHead className="text-[10px]">#</TableHead>
                      <TableHead className="text-[10px]">Component</TableHead>
                      <TableHead className="text-[10px] text-center">Class</TableHead>
                      <TableHead className="text-[10px] text-right">Qty/Unit</TableHead>
                      <TableHead className="text-[10px] text-right">Total Qty</TableHead>
                      <TableHead className="text-[10px] text-center">Action</TableHead>
                      <TableHead className="text-[10px]">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(explosionPreview.lines || []).map((line: any) => {
                      const isSelectable = ['create', 'reuse', 'needs_review'].includes(line.action);
                      const isSelected = selectedExplosionLines.includes(line.lineId);
                      const actionColor = line.action === 'create' ? 'bg-green-50 text-green-700 border-green-300'
                        : line.action === 'reuse' ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : line.action === 'skip_existing' ? 'bg-gray-50 text-gray-500 border-gray-300'
                        : line.action === 'skipped_not_required' ? 'bg-slate-50 text-slate-400 border-slate-200'
                        : line.action === 'needs_review' ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-red-50 text-red-700 border-red-300';
                      return (
                        <TableRow key={line.lineId} className={!isSelectable ? "opacity-60" : ""}>
                          <TableCell className="text-center">
                            {isSelectable && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedExplosionLines(prev => [...prev, line.lineId]);
                                  } else {
                                    setSelectedExplosionLines(prev => prev.filter(id => id !== line.lineId));
                                  }
                                }}
                                className="h-3 w-3"
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">{line.lineNumber}</TableCell>
                          <TableCell>
                            <div className="text-[10px] font-medium">{line.componentItemCode}</div>
                            <div className="text-[9px] text-muted-foreground truncate max-w-[200px]">{line.componentDescription}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
                              line.classification === 'Buy' ? 'bg-blue-50 text-blue-700' : line.classification === 'Make' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {line.classification || "?"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{line.quantityPerUnit}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono font-semibold">{line.computedQuantity} {line.uom || ""}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${actionColor}`}>
                              {line.action.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[9px] text-muted-foreground max-w-[180px] truncate">{line.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" }); setExplosionPreview(null); }}>
                Cancel
              </Button>
              {explosionPreview && selectedExplosionLines.length > 0 && (
                <Button onClick={executeExplosion} disabled={explosionLoading}>
                  {explosionLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirm Explosion ({selectedExplosionLines.length} lines)
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

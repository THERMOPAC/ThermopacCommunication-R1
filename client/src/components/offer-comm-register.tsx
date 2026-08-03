/**
 * OfferCommRegister — Offer Communication Register
 *
 * Flat table. Row actions via dropdown: Download, Edit, Upload New Revision, Delete.
 * File upload for new records is in the New Communication Record form.
 * File replacement / revision upload is in the Edit Communication Record form.
 */

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  MessageSquare, Plus, Download, Loader2, FileText, FileSpreadsheet,
  File, AlertCircle, CheckCircle2, Clock, UploadCloud, ChevronsUpDown,
  Check, Wand2, FileImage, MonitorPlay, RefreshCw, Pencil, Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommCategory {
  id: number;
  categoryCode: string;
  categoryPath: string;
  displayLabel: string;
  section: string;
  sortOrder: number;
}

interface CommRecord {
  id: number;
  offerId: number;
  communicationCategoryId: number;
  commDate: string;
  title: string;
  direction: string;
  channel: string;
  customerContact?: string;
  customerQuestion?: string;
  summary?: string;
  actionRequired: boolean;
  responsibleUserId?: number;
  dueDate?: string;
  status: string;
  responseType?: string;
  categoryLabel: string;
  categoryPath: string;
  categorySection: string;
  createdByName: string;
  responsibleName?: string;
  docCount: number;
}

interface CommDoc {
  id: number;
  communicationId: number;
  documentType: string;
  fileName: string;
  gcsPath: string;
  revision: string;
  isCurrent: boolean;
  fileSizeBytes?: number;
  mimeType?: string;
  mirrorStatus: string;
  mirrorJobId?: number;
  templateId?: number;
  uploadedAt: string;
  uploadedByName: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const commFormSchema = z.object({
  communicationCategoryId: z.string().min(1, "Category is required"),
  responseType: z.string().min(1, "Response Type is required"),
  commDate: z.string().min(1, "Date is required"),
  title: z.string().min(1, "Subject is required"),
  direction: z.string().min(1, "Direction is required"),
  channel: z.string().min(1, "Channel is required"),
  customerContact: z.string().optional(),
  fromParty: z.string().optional(),
  toParty: z.string().optional(),
  ccParty: z.string().optional(),
  customerQuestion: z.string().optional(),
  summary: z.string().optional(),
  actionRequired: z.boolean().default(false),
  responsibleUserId: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.string().default("Open"),
});

type CommFormValues = z.infer<typeof commFormSchema>;

// ── Category → Default Subject map ────────────────────────────────────────────

const CATEGORY_SUBJECT_DEFAULTS: Record<string, string> = {
  SALES_CONTRACT_PO:        'Contract Clarification',
  SALES_LC_BANK:            'Letter of Credit Clarification',
  SALES_ORDER_CONFIRMATION: 'Order Confirmation Discussion',
  SALES_DP_PROFORMA:        'Proforma Invoice Clarification',
  SALES_MOM:                'Meeting Minutes',
  SALES_DOC_SUBMISSION:     'Document Submission',
  DESIGN_BEDD:              'BEDD Clarification',
  DESIGN_STD:               'Relevant Standards Clarification',
  DESIGN_PID:               'P&ID Clarification',
  DESIGN_MHB:               'Material & Heat Balance Clarification',
  DESIGN_HAZOP:             'HAZOP Clarification',
  DESIGN_QAP:               'QAP Clarification',
  DESIGN_TIEIN:             'Tie-in Point Clarification',
  DESIGN_GA:                'General Arrangement Clarification',
  DESIGN_FOUNDATION:        'Foundation Clarification',
  DESIGN_ELECTRICAL:        'Electrical Clarification',
  DESIGN_PROGRESS:          'Progress Report',
  DESIGN_CAUSE_EFFECT:      'Cause & Effect Clarification',
  DESIGN_DATA_SHEET:        'Data Sheet for Approval',
  DESIGN_CALC_STRUCTURAL:   'Structural Design Clarification',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    'Open': 'bg-blue-100 text-blue-800',
    'Closed': 'bg-green-100 text-green-800',
    'For Information': 'bg-slate-100 text-slate-700',
    'Awaiting Customer': 'bg-amber-100 text-amber-800',
    'Awaiting Thermopac': 'bg-orange-100 text-orange-800',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

function directionBadge(dir: string) {
  const map: Record<string, string> = {
    'Incoming': 'bg-purple-100 text-purple-800',
    'Outgoing': 'bg-sky-100 text-sky-800',
    'Internal': 'bg-slate-100 text-slate-600',
  };
  return map[dir] || 'bg-slate-100 text-slate-700';
}

function mirrorIcon(status: string) {
  if (status === 'mirrored') return <CheckCircle2 className="h-3 w-3 text-green-600" />;
  if (status === 'failed') return <AlertCircle className="h-3 w-3 text-red-500" />;
  return <Clock className="h-3 w-3 text-slate-400" />;
}

function docTypeIcon(type: string) {
  if (type === 'Word')  return <FileText className="h-3.5 w-3.5 text-blue-600" />;
  if (type === 'Excel') return <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />;
  if (type === 'PDF')   return <File className="h-3.5 w-3.5 text-red-500" />;
  if (type === 'PPT')   return <MonitorPlay className="h-3.5 w-3.5 text-orange-500" />;
  if (type === 'Image' || type === 'Drawing') return <FileImage className="h-3.5 w-3.5 text-violet-500" />;
  return <File className="h-3.5 w-3.5 text-slate-400" />;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════

interface CustomerContact {
  name: string;
  email?: string;
  phone?: string;
}

interface OfferCommRegisterProps {
  offerId: number;
  offerStatus?: string;
  offerContactPerson?: string;
  customerContacts?: CustomerContact[];
}

export function OfferCommRegister({ offerId, offerStatus, offerContactPerson, customerContacts = [] }: OfferCommRegisterProps) {
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [contactOpen, setContactOpen]   = useState(false);

  // Tracks whether the user has manually edited the Subject field.
  const subjectUserEdited = useRef(false);

  const [filterCategory, setFilterCategory]   = useState('');
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterDirection, setFilterDirection] = useState('');

  // Pending file for "attach on create" flow (new record only)
  const [pendingFile, setPendingFile]         = useState<File | null>(null);
  const formUploadRef                         = useRef<HTMLInputElement>(null);

  // Pending file for revision in edit form
  const [pendingRevisionFile, setPendingRevisionFile] = useState<File | null>(null);
  const revisionUploadRef                             = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // Download state
  const [downloadingComm, setDownloadingComm] = useState<number | null>(null);

  // ── Categories ────────────────────────────────────────────────────────────
  const { data: categories = [] } = useQuery<CommCategory[]>({
    queryKey: ['/api/sales-marketing/offer-comm-categories'],
    queryFn: () => fetch('/api/sales-marketing/offer-comm-categories', { credentials: 'include' }).then(r => r.json()),
  });

  // ── Users (for responsible person) ───────────────────────────────────────
  const { data: usersData = [] } = useQuery<{ id: number; firstName: string; lastName: string }[]>({
    queryKey: ['/api/users'],
    queryFn: () => fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
  });

  // ── Communications list ───────────────────────────────────────────────────
  const { data: comms = [], isLoading } = useQuery<CommRecord[]>({
    queryKey: ['/api/sales-marketing/offers', offerId, 'communications'],
    queryFn: () =>
      fetch(`/api/sales-marketing/offers/${offerId}/communications`, { credentials: 'include' })
        .then(r => r.json()),
  });

  // ── Current docs for the comm being edited ───────────────────────────────
  const { data: editCommData } = useQuery<{ documents: CommDoc[] }>({
    queryKey: ['/api/sales-marketing/offers', offerId, 'communications', editingId],
    queryFn: () =>
      fetch(`/api/sales-marketing/offers/${offerId}/communications/${editingId}`, { credentials: 'include' })
        .then(r => r.json()),
    enabled: !!editingId,
  });
  const editCurrentDocs = (editCommData?.documents ?? []).filter(
    (d: any) => d.isCurrent === true || d.is_current === true
  );

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = useForm<CommFormValues>({
    resolver: zodResolver(commFormSchema),
    defaultValues: {
      communicationCategoryId: '',
      commDate: new Date().toISOString().split('T')[0],
      title: '', direction: '', channel: '',
      status: 'Open', actionRequired: false,
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CommFormValues) =>
      apiRequest('POST', `/api/sales-marketing/offers/${offerId}/communications`, data),
    onSuccess: async (data: any) => {
      // If user attached a file in the form, upload it now
      if (data?.id && pendingFile) {
        try {
          const fd = new FormData();
          fd.append('file', pendingFile);
          fd.append('label', pendingFile.name.replace(/\.[^.]+$/, ''));
          const uploadRes = await fetch(
            `/api/sales-marketing/offers/${offerId}/communications/${data.id}/documents/upload`,
            { method: 'POST', credentials: 'include', body: fd }
          );
          if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({}));
            throw new Error(errBody.error || `Upload failed (${uploadRes.status})`);
          }
          toast({ title: 'Record created and document uploaded' });
        } catch (uploadErr: any) {
          toast({
            title: 'Record created — document upload failed',
            description: uploadErr.message || 'You can upload from the Edit form.',
            variant: 'destructive',
          });
        }
        setPendingFile(null);
      } else {
        toast({ title: 'Communication record created' });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      setDrawerOpen(false);
      form.reset();
    },
    onError: (err: Error) => toast({ title: 'Failed to create', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CommFormValues }) =>
      apiRequest('PATCH', `/api/sales-marketing/offers/${offerId}/communications/${id}`, data),
    onSuccess: async (_, { id }) => {
      // If user attached a revision file in the edit form, upload/revise it now
      if (pendingRevisionFile) {
        try {
          const fd = new FormData();
          fd.append('file', pendingRevisionFile);
          fd.append('label', pendingRevisionFile.name.replace(/\.[^.]+$/, ''));

          let uploadUrl: string;
          let method = 'POST';

          if (editCurrentDocs.length > 0) {
            // Revise the first current document
            const docId = editCurrentDocs[0].id;
            uploadUrl = `/api/sales-marketing/offers/${offerId}/communications/${id}/documents/${docId}/revise`;
          } else {
            // No existing doc — upload as first document
            uploadUrl = `/api/sales-marketing/offers/${offerId}/communications/${id}/documents/upload`;
          }

          const uploadRes = await fetch(uploadUrl, { method, credentials: 'include', body: fd });
          if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({}));
            throw new Error(errBody.error || `File upload failed (${uploadRes.status})`);
          }
          toast({ title: 'Record updated and document uploaded' });
        } catch (uploadErr: any) {
          toast({
            title: 'Record updated — document upload failed',
            description: (uploadErr as Error).message,
            variant: 'destructive',
          });
        }
        setPendingRevisionFile(null);
      } else {
        toast({ title: 'Communication updated' });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications', id] });
      setDrawerOpen(false);
      setEditingId(null);
      form.reset();
    },
    onError: (err: Error) => toast({ title: 'Failed to update', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (commId: number) =>
      apiRequest('POST', `/api/sales-marketing/offers/${offerId}/communications/${commId}/delete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      toast({ title: 'Communication record deleted' });
    },
    onError: (err: Error) => toast({ title: 'Failed to delete', description: err.message, variant: 'destructive' }),
  });

  // ── Drawer open helpers ────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setPendingFile(null);
    setPendingRevisionFile(null);
    subjectUserEdited.current = false;
    const defaultContact = (() => {
      if (customerContacts.length === 0) return '';
      if (offerContactPerson) {
        const matched = customerContacts.find(c => c.name === offerContactPerson);
        if (matched) return matched.name;
      }
      return customerContacts[0]?.name ?? '';
    })();
    form.reset({
      communicationCategoryId: '',
      responseType: '',
      commDate: new Date().toISOString().split('T')[0],
      title: '', direction: '', channel: '',
      status: 'Open', actionRequired: false,
      customerContact: defaultContact,
    });
    setDrawerOpen(true);
  }

  function openEdit(comm: CommRecord) {
    setEditingId(comm.id);
    setPendingFile(null);
    setPendingRevisionFile(null);
    subjectUserEdited.current = true;
    form.reset({
      communicationCategoryId: String(comm.communicationCategoryId),
      responseType: comm.responseType ?? '',
      commDate: comm.commDate?.split('T')[0] ?? '',
      title: comm.title,
      direction: comm.direction,
      channel: comm.channel,
      customerContact: comm.customerContact ?? '',
      customerQuestion: comm.customerQuestion ?? '',
      summary: comm.summary ?? '',
      actionRequired: comm.actionRequired,
      responsibleUserId: comm.responsibleUserId ? String(comm.responsibleUserId) : '',
      dueDate: comm.dueDate ?? '',
      status: comm.status,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setPendingFile(null);
    setPendingRevisionFile(null);
    form.reset();
  }

  function onSubmit(data: CommFormValues) {
    if (editingId) updateMutation.mutate({ id: editingId, data });
    else createMutation.mutate(data);
  }

  // ── Download helper ───────────────────────────────────────────────────────

  async function handleCommDocDownload(commId: number) {
    setDownloadingComm(commId);
    try {
      const res = await fetch(
        `/api/sales-marketing/offers/${offerId}/communications/${commId}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      const currentDocs: CommDoc[] = (data.documents ?? []).filter(
        (d: any) => d.isCurrent === true || d.is_current === true
      );
      if (currentDocs.length === 0) {
        toast({ title: 'No documents found', variant: 'destructive' });
        return;
      }
      for (const doc of currentDocs) {
        const dlRes = await fetch(
          `/api/sales-marketing/offers/${offerId}/communications/${commId}/documents/${doc.id}/download`,
          { credentials: 'include' }
        );
        if (!dlRes.ok) { toast({ title: `Download failed for ${doc.fileName}`, variant: 'destructive' }); continue; }
        const { url, fileName } = await dlRes.json();
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' });
    } finally {
      setDownloadingComm(null);
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = comms.filter(c => {
    if (filterCategory && String(c.communicationCategoryId) !== filterCategory) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterDirection && c.direction !== filterDirection) return false;
    return true;
  });

  const categoriesBySales  = categories.filter(c => c.section === 'Sales');
  const categoriesByDesign = categories.filter(c => c.section === 'Design');
  const watchActionRequired = form.watch('actionRequired');

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-slate-50/70">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
          <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Communication Register</h3>
          {comms.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{comms.length}</Badge>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openNew}>
          <Plus className="h-3 w-3" /> New Communication
        </Button>
      </div>

      {/* Filters */}
      {comms.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-b bg-white flex-wrap">
          <Select value={filterCategory || '__all__'} onValueChange={v => setFilterCategory(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.displayLabel}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {['Open','Closed','For Information','Awaiting Customer','Awaiting Thermopac'].map(s =>
                <SelectItem key={s} value={s}>{s}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={filterDirection || '__all__'} onValueChange={v => setFilterDirection(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="All directions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All directions</SelectItem>
              {['Incoming','Outgoing','Internal'].map(d =>
                <SelectItem key={d} value={d}>{d}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {(filterCategory || filterStatus || filterDirection) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => { setFilterCategory(''); setFilterStatus(''); setFilterDirection(''); }}>
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Register table */}
      {isLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-muted-foreground">
            {comms.length === 0 ? 'No communications recorded yet.' : 'No records match the current filters.'}
          </p>
          {comms.length === 0 && (
            <Button size="sm" variant="outline" className="mt-3 text-xs gap-1" onClick={openNew}>
              <Plus className="h-3 w-3" /> New Communication
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2 pl-4">Date</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Subject</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Category</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Direction</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Channel</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Status</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2 text-center w-14">Docs</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2 w-52">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(comm => (
              <TableRow key={comm.id} className="hover:bg-slate-50/60">
                <TableCell className="py-2.5 text-xs tabular-nums whitespace-nowrap pl-4">{fmtDate(comm.commDate)}</TableCell>
                <TableCell className="py-2.5 text-xs font-medium max-w-[200px] truncate" title={comm.title}>
                  {comm.title}
                  {comm.actionRequired && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange-400" title="Action required" />
                  )}
                </TableCell>
                <TableCell className="py-2.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    {comm.categoryLabel}
                  </Badge>
                </TableCell>
                <TableCell className="py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${directionBadge(comm.direction)}`}>
                    {comm.direction}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-xs text-muted-foreground">{comm.channel}</TableCell>
                <TableCell className="py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(comm.status)}`}>
                    {comm.status}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-xs text-center tabular-nums text-muted-foreground">
                  {comm.docCount > 0 ? comm.docCount : '—'}
                </TableCell>
                <TableCell className="py-2 pr-3">
                  <div className="flex items-center gap-0.5">
                    {/* Docs / Download */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-1.5 text-[10px] gap-1 ${
                        comm.docCount > 0
                          ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                          : 'text-slate-300 cursor-not-allowed'
                      }`}
                      disabled={comm.docCount === 0 || downloadingComm === comm.id}
                      title={comm.docCount === 0 ? 'No document attached' : `Download document (${comm.docCount})`}
                      onClick={() => handleCommDocDownload(comm.id)}
                    >
                      {downloadingComm === comm.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Download className="h-3 w-3" />}
                      Docs
                    </Button>

                    {/* Edit */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5 text-[10px] gap-1 text-slate-600 hover:text-slate-900"
                      title="Edit communication record"
                      onClick={() => openEdit(comm)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>

                    {/* Upload Revision */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5 text-[10px] gap-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      title={comm.docCount > 0 ? 'Upload new revision' : 'Attach document'}
                      onClick={() => openEdit(comm)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Revise
                    </Button>

                    {/* Delete */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1.5 text-[10px] gap-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Delete communication record"
                      onClick={() => setPendingDeleteId(comm.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── New / Edit Communication Drawer ─────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={open => { if (!open) closeDrawer(); }}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">
              {editingId ? 'Edit Communication Record' : 'New Communication Record'}
            </SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Communication Category */}
              <FormField control={form.control} name="communicationCategoryId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Communication Category <span className="text-red-500">*</span></FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (!editingId && !subjectUserEdited.current) {
                        const cat = categories.find(c => String(c.id) === value);
                        const defaultSubject = cat ? (CATEGORY_SUBJECT_DEFAULTS[cat.categoryCode] ?? '') : '';
                        if (defaultSubject) form.setValue('title', defaultSubject, { shouldValidate: true });
                      }
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select category…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sales</div>
                      {categoriesBySales.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.displayLabel}</SelectItem>
                      ))}
                      <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Design</div>
                      {categoriesByDesign.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.displayLabel}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      GCS: …/{categories.find(c => String(c.id) === field.value)?.categoryPath}/
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              {/* Response Type */}
              <FormField control={form.control} name="responseType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Response Type <span className="text-red-500">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select response type…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="upload_existing">Upload Response File</SelectItem>
                      <SelectItem value="drawing_image">Drawing / Image</SelectItem>
                      <SelectItem value="other_document">Other Document</SelectItem>
                      <SelectItem value="note_text">Note / Text Response</SelectItem>
                    </SelectContent>
                  </Select>
                  {field.value === 'note_text' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                      The Response / Summary field below is required for Note type records.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                {/* Date */}
                <FormField control={form.control} name="commDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Date <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Input type="date" {...field} className="text-sm" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Status */}
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="text-sm"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {['Open','Closed','For Information','Awaiting Customer','Awaiting Thermopac'].map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Subject */}
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Subject / Title <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. P&ID Clarification — Sheet 3"
                      className="text-sm"
                      onChange={(e) => {
                        field.onChange(e);
                        subjectUserEdited.current = true;
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                {/* Direction */}
                <FormField control={form.control} name="direction" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Direction <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Incoming">Incoming</SelectItem>
                        <SelectItem value="Outgoing">Outgoing</SelectItem>
                        <SelectItem value="Internal">Internal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Channel */}
                <FormField control={form.control} name="channel" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">Channel <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Meeting">Meeting</SelectItem>
                        <SelectItem value="Phone">Phone</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        <SelectItem value="Letter">Letter</SelectItem>
                        <SelectItem value="Internal Note">Internal Note</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Customer Contact Person */}
              <FormField control={form.control} name="customerContact" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Customer Contact Person</FormLabel>
                  {customerContacts.length > 0 ? (
                    <Popover open={contactOpen} onOpenChange={setContactOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={contactOpen}
                            className={cn(
                              "w-full justify-between text-sm font-normal h-9",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value || "Select contact person…"}
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search contacts…" className="h-8 text-sm" />
                          <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                            No contact found.
                          </CommandEmpty>
                          <CommandGroup>
                            {customerContacts.map((c) => (
                              <CommandItem
                                key={c.name}
                                value={c.name}
                                onSelect={() => { field.onChange(c.name); setContactOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-3.5 w-3.5", field.value === c.name ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span className="text-sm">{c.name}</span>
                                  {c.email && <span className="text-[11px] text-muted-foreground">{c.email}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="Contact name" className="text-sm" />
                    </FormControl>
                  )}
                </FormItem>
              )} />

              {/* Customer Question */}
              <FormField control={form.control} name="customerQuestion" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Customer Question</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} className="text-sm resize-none" placeholder="Exact customer query or request…" />
                  </FormControl>
                </FormItem>
              )} />

              {/* Response */}
              <FormField control={form.control} name="summary" render={({ field }) => {
                const rt = form.watch('responseType');
                const isNote = rt === 'note_text';
                return (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">
                      {isNote ? <>Response / Note <span className="text-red-500">*</span></> : 'Response / Summary'}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={isNote ? 5 : 3}
                        className={cn("text-sm resize-none", isNote && "border-amber-300 focus:border-amber-500")}
                        placeholder={isNote ? 'Enter the text response or note (required)…' : 'Our response or summary of discussion…'}
                      />
                    </FormControl>
                    {isNote && !field.value && <p className="text-[11px] text-red-500">Required for Note type</p>}
                  </FormItem>
                );
              }} />

              {/* Action Required toggle */}
              <FormField control={form.control} name="actionRequired" render={({ field }) => (
                <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div>
                    <FormLabel className="text-xs font-medium cursor-pointer">Action Required</FormLabel>
                    <p className="text-[11px] text-muted-foreground">Assign to a team member with a due date</p>
                  </div>
                </FormItem>
              )} />

              {watchActionRequired && (
                <div className="grid grid-cols-2 gap-3 pl-3 border-l-2 border-orange-300">
                  <FormField control={form.control} name="responsibleUserId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Responsible Person</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl><SelectTrigger className="text-sm"><SelectValue placeholder="Select user…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {usersData.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.firstName} {u.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="dueDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Due Date</FormLabel>
                      <FormControl><Input type="date" {...field} className="text-sm" /></FormControl>
                    </FormItem>
                  )} />
                </div>
              )}

              {/* ── Document section ─────────────────────────────────────── */}
              {!editingId ? (
                /* New record: optional initial attach */
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">
                    Attach Document <span className="text-slate-400 font-normal">(optional)</span>
                  </p>
                  {pendingFile ? (
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-700 truncate flex-1">{pendingFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5 text-red-500 hover:text-red-700"
                        onClick={() => { setPendingFile(null); if (formUploadRef.current) formUploadRef.current.value = ''; }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => formUploadRef.current?.click()}
                    >
                      <UploadCloud className="h-3 w-3" />
                      Choose File
                    </Button>
                  )}
                  <input
                    ref={formUploadRef}
                    type="file"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f); }}
                  />
                </div>
              ) : (
                /* Edit record: show current doc + upload revision */
                <div className="rounded-md border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-3 space-y-2">
                  <p className="text-xs font-medium text-slate-600">
                    {editCurrentDocs.length > 0 ? 'Upload New Revision' : 'Attach Document'}{' '}
                    <span className="text-slate-400 font-normal">(optional)</span>
                  </p>

                  {/* Current doc summary */}
                  {editCurrentDocs.length > 0 && (
                    <div className="flex items-center gap-2 rounded border bg-white px-2 py-1.5 text-xs">
                      {docTypeIcon(editCurrentDocs[0].documentType)}
                      <span className="flex-1 font-mono truncate text-slate-700" title={editCurrentDocs[0].fileName}>
                        {editCurrentDocs[0].fileName}
                      </span>
                      {editCurrentDocs[0].templateId && (
                        <Wand2 className="h-2.5 w-2.5 text-indigo-400 shrink-0" title="Generated from template" />
                      )}
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        rev-{editCurrentDocs[0].revision}
                      </Badge>
                      {mirrorIcon(editCurrentDocs[0].mirrorStatus)}
                    </div>
                  )}

                  {/* File picker */}
                  {pendingRevisionFile ? (
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="text-xs text-slate-700 truncate flex-1">{pendingRevisionFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5 text-red-500 hover:text-red-700"
                        onClick={() => { setPendingRevisionFile(null); if (revisionUploadRef.current) revisionUploadRef.current.value = ''; }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => revisionUploadRef.current?.click()}
                    >
                      <UploadCloud className="h-3 w-3" />
                      {editCurrentDocs.length > 0 ? 'Choose New Revision' : 'Choose File'}
                    </Button>
                  )}
                  <input
                    ref={revisionUploadRef}
                    type="file"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPendingRevisionFile(f); }}
                  />
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={closeDrawer}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  )}
                  {editingId
                    ? (updateMutation.isPending ? 'Saving…' : 'Save Changes')
                    : (createMutation.isPending ? 'Creating…' : 'Create Record')
                  }
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* ── Delete confirmation dialog ──────────────────────────────────── */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={open => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Communication Record</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the record and all its uploaded documents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (pendingDeleteId !== null) deleteMutation.mutate(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

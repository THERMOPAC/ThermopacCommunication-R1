/**
 * OfferCommRegister — Offer Communication Register
 *
 * Renders the Communications section on the Offer detail view.
 * Primary business object: Communication Record.
 * Communication Category is a mandatory attribute on each record.
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
import { Label } from "@/components/ui/label";
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
  MessageSquare, Plus, ChevronDown, ChevronRight, Upload, Download,
  RefreshCw, Loader2, FileText, FileSpreadsheet, File, AlertCircle,
  CheckCircle2, Clock, UploadCloud, ChevronsUpDown, Check,
  Wand2, FileImage, MonitorPlay, MoreVertical,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
// Document panel — shown inside expanded row
// ══════════════════════════════════════════════════════════════════════════════

interface DocumentPanelProps {
  offerId: number;
  commId: number;
  responseType?: string;
  communicationCategoryId?: number;
}

function DocumentPanel({ offerId, commId, responseType, communicationCategoryId }: DocumentPanelProps) {
  const { toast } = useToast();
  const uploadRef   = useRef<HTMLInputElement>(null);
  const reviseRef   = useRef<HTMLInputElement>(null);
  const [revisingDocId, setRevisingDocId] = useState<number | null>(null);
  const [labelInput, setLabelInput]       = useState('');
  const [downloading, setDownloading]     = useState<number | null>(null);

  const { data: comm, isLoading } = useQuery<{ documents: CommDoc[] }>({
    queryKey: ['/api/sales-marketing/offers', offerId, 'communications', commId],
    queryFn: () =>
      fetch(`/api/sales-marketing/offers/${offerId}/communications/${commId}`, { credentials: 'include' })
        .then(r => r.json()),
  });

  const documents  = comm?.documents ?? [];
  const currentDocs = documents.filter(d => d.isCurrent);

  // ── Mutations ────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({ file, label }: { file: File; label: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', label);
      const res = await fetch(`/api/sales-marketing/offers/${offerId}/communications/${commId}/documents/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications', commId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      toast({ title: 'Document uploaded successfully' });
      setLabelInput('');
    },
    onError: (err: Error) => toast({ title: 'Upload failed', description: err.message, variant: 'destructive' }),
  });

  const reviseMutation = useMutation({
    mutationFn: async ({ file, docId, label }: { file: File; docId: number; label: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', label);
      const res = await fetch(`/api/sales-marketing/offers/${offerId}/communications/${commId}/documents/${docId}/revise`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Revision failed'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications', commId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      toast({ title: 'New revision added' });
      setRevisingDocId(null);
    },
    onError: (err: Error) => toast({ title: 'Revision failed', description: err.message, variant: 'destructive' }),
  });

  function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = labelInput.trim() || file.name.replace(/\.[^.]+$/, '');
    uploadMutation.mutate({ file, label });
    e.target.value = '';
  }

  function handleReviseFile(e: React.ChangeEvent<HTMLInputElement>, docId: number, currentLabel: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    reviseMutation.mutate({ file, docId, label: currentLabel });
    e.target.value = '';
  }

  async function handleDownload(docId: number, fileName: string) {
    setDownloading(docId);
    try {
      const res = await fetch(
        `/api/sales-marketing/offers/${offerId}/communications/${commId}/documents/${docId}/download`,
        { credentials: 'include' }
      );
      const { url } = await res.json();
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) return <div className="p-3 text-xs text-muted-foreground">Loading documents…</div>;

  return (
    <div className="px-4 pb-4">
      {/* ── Action bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={labelInput}
          onChange={e => setLabelInput(e.target.value)}
          placeholder="Document label (e.g. PID Clarification)"
          className="h-7 text-xs max-w-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => uploadRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
          Upload Document
        </Button>
        <input ref={uploadRef} type="file" className="hidden" onChange={handleUploadFile} />
      </div>

      {/* ── Document list ───────────────────────────────────────────────────── */}
      {currentDocs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {currentDocs.map(doc => {
            const docLabel = doc.fileName.replace(/^\d+-/, '').replace(/-rev-\d+\.\w+$/, '');
            const isGenerated = !!doc.templateId;
            return (
              <div key={doc.id} className="flex items-center gap-2 rounded border bg-slate-50 px-3 py-1.5 text-xs">
                {docTypeIcon(doc.documentType)}
                <span className="flex-1 font-mono truncate max-w-[280px]" title={doc.fileName}>{doc.fileName}</span>
                {doc.templateId && (
                  <span title="Generated from template">
                    <Wand2 className="h-2.5 w-2.5 text-indigo-400" />
                  </span>
                )}
                <Badge variant="outline" className="text-[9px] px-1 py-0">rev-{doc.revision}</Badge>
                <span className="text-muted-foreground hidden sm:inline">{fmtDate(doc.uploadedAt)}</span>
                {mirrorIcon(doc.mirrorStatus)}

                {/* Upload Revision */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-1.5"
                  onClick={() => {
                    setRevisingDocId(doc.id);
                    setTimeout(() => reviseRef.current?.click(), 50);
                  }}
                  disabled={reviseMutation.isPending}
                  title="Upload new revision"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                </Button>

                {/* Download */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-1.5"
                  onClick={() => handleDownload(doc.id, doc.fileName)}
                  disabled={downloading === doc.id}
                >
                  {downloading === doc.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                </Button>
              </div>
            );
          })}
          {/* Hidden file input for upload-revise */}
          <input
            type="file"
            className="hidden"
            ref={reviseRef}
            onChange={e => {
              if (revisingDocId == null) return;
              const doc = currentDocs.find(d => d.id === revisingDocId);
              const label = doc?.fileName.replace(/^\d+-/, '').replace(/-rev-\d+\.\w+$/, '') ?? 'doc';
              handleReviseFile(e, revisingDocId, label);
            }}
          />
        </div>
      )}
    </div>
  );
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  // Tracks whether the user has manually edited the Subject field.
  // When true, category changes no longer overwrite the subject.
  const subjectUserEdited = useRef(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [filterCategory, setFilterCategory]   = useState('');
  const [filterStatus, setFilterStatus]       = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  // Pending file for "attach on create" flow
  const [pendingFile, setPendingFile]         = useState<File | null>(null);
  const formUploadRef                         = useRef<HTMLInputElement>(null);
  // Delete confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  // Downloading docs from row-level button
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

  const createMutation = useMutation({
    mutationFn: (data: CommFormValues) =>
      apiRequest('POST', `/api/sales-marketing/offers/${offerId}/communications`, data),
    onSuccess: async (data: any) => {
      // If user attached a file in the form, upload it now before closing
      if (data?.id && pendingFile) {
        try {
          const fd = new FormData();
          fd.append('file', pendingFile);
          fd.append('label', pendingFile.name.replace(/\.[^.]+$/, ''));
          await fetch(
            `/api/sales-marketing/offers/${offerId}/communications/${data.id}/documents/upload`,
            { method: 'POST', credentials: 'include', body: fd }
          );
          toast({ title: 'Record created and document uploaded' });
        } catch {
          toast({ title: 'Record created', description: 'Document upload failed — you can retry from the row.', variant: 'destructive' });
        }
        setPendingFile(null);
      } else {
        toast({ title: 'Communication record created' });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });

      // Auto-expand the new record and scroll it into view
      if (data?.id) {
        setExpandedIds(prev => { const n = new Set(prev); n.add(data.id); return n; });
        setTimeout(() => {
          const el = document.getElementById(`comm-expanded-${data.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 600);
      }

      setDrawerOpen(false);
      form.reset();
    },
    onError: (err: Error) => toast({ title: 'Failed to create', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CommFormValues }) =>
      apiRequest('PATCH', `/api/sales-marketing/offers/${offerId}/communications/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      toast({ title: 'Communication updated' });
      setDrawerOpen(false);
      setEditingId(null);
      form.reset();
    },
    onError: (err: Error) => toast({ title: 'Failed to update', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (commId: number) =>
      apiRequest('POST', `/api/sales-marketing/offers/${offerId}/communications/${commId}/delete`),
    onSuccess: (_data, commId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'communications'] });
      setExpandedIds(prev => { const n = new Set(prev); n.delete(commId); return n; });
      toast({ title: 'Communication record deleted' });
    },
    onError: (err: Error) => toast({ title: 'Failed to delete', description: err.message, variant: 'destructive' }),
  });

  function openNew() {
    setEditingId(null);
    subjectUserEdited.current = false;
    // Default contact: match offer's contact person against known contacts,
    // fall back to the customer's primary contact, then blank.
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
      title: '',
      direction: '', channel: '',
      status: 'Open', actionRequired: false,
      customerContact: defaultContact,
    });
    setDrawerOpen(true);
  }

  function openEdit(comm: CommRecord) {
    setEditingId(comm.id);
    // Editing an existing record — subject is already user-controlled.
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

  function onSubmit(data: CommFormValues) {
    if (editingId) updateMutation.mutate({ id: editingId, data });
    else createMutation.mutate(data);
  }

  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function handleCommDocDownload(commId: number) {
    setDownloadingComm(commId);
    try {
      const res = await fetch(
        `/api/sales-marketing/offers/${offerId}/communications/${commId}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      // The single-comm endpoint returns raw pg rows (snake_case), so check both forms
      const currentDocs: CommDoc[] = (data.documents ?? []).filter(
        (d: any) => d.isCurrent === true || d.is_current === true
      );
      if (currentDocs.length === 0) {
        toast({ title: 'No documents found', variant: 'destructive' });
        return;
      }
      // Download each current doc via its signed GCS URL
      for (const doc of currentDocs) {
        const dlRes = await fetch(
          `/api/sales-marketing/offers/${offerId}/communications/${commId}/documents/${doc.id}/download`,
          { credentials: 'include' }
        );
        if (!dlRes.ok) { toast({ title: `Download failed for ${doc.fileName}`, variant: 'destructive' }); continue; }
        const { url, fileName } = await dlRes.json();
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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

  const categoriesBySales = categories.filter(c => c.section === 'Sales');
  const categoriesByDesign = categories.filter(c => c.section === 'Design');

  const watchActionRequired = form.watch('actionRequired');

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
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFilterCategory(''); setFilterStatus(''); setFilterDirection(''); }}>
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
              <TableHead className="w-6 px-3" />
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Date</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Subject</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Category</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Direction</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Channel</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Status</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2">Docs</TableHead>
              <TableHead className="text-[11px] font-semibold text-slate-500 py-2 w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(comm => (
              <>
                <TableRow
                  key={comm.id}
                  className="cursor-pointer hover:bg-slate-50/80"
                  onClick={() => toggleExpand(comm.id)}
                >
                  <TableCell className="px-3 py-2.5 w-6">
                    {expandedIds.has(comm.id)
                      ? <ChevronDown className="h-3 w-3 text-slate-400" />
                      : <ChevronRight className="h-3 w-3 text-slate-400" />}
                  </TableCell>
                  <TableCell className="py-2.5 text-xs tabular-nums whitespace-nowrap">{fmtDate(comm.commDate)}</TableCell>
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
                  <TableCell className="py-2.5 text-xs text-muted-foreground tabular-nums">
                    {comm.docCount > 0 ? comm.docCount : '—'}
                  </TableCell>
                  <TableCell className="py-2.5 w-36">
                    <div className="flex items-center gap-1">
                      {comm.docCount > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          title="Download attached document(s)"
                          disabled={downloadingComm === comm.id}
                          onClick={e => { e.stopPropagation(); handleCommDocDownload(comm.id); }}
                        >
                          {downloadingComm === comm.id
                            ? <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                            : <Download className="h-3 w-3 mr-0.5" />}
                          Docs
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5"
                        onClick={e => { e.stopPropagation(); openEdit(comm); }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-1.5 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={e => {
                          e.stopPropagation();
                          setPendingDeleteId(comm.id);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded panel */}
                {expandedIds.has(comm.id) && (
                  <TableRow key={`exp-${comm.id}`} id={`comm-expanded-${comm.id}`} className="bg-slate-50/40">
                    <TableCell colSpan={9} className="p-0">
                      <div className="px-4 pt-3 pb-1 text-xs text-slate-600 grid grid-cols-2 gap-x-8 gap-y-1">
                        {comm.customerQuestion && (
                          <div className="col-span-2">
                            <span className="font-medium text-slate-500">Customer Question: </span>
                            {comm.customerQuestion}
                          </div>
                        )}
                        {(comm as any).summary && (
                          <div className="col-span-2">
                            <span className="font-medium text-slate-500">Response / Summary: </span>
                            {(comm as any).summary}
                          </div>
                        )}
                        {comm.responsibleName && (
                          <div>
                            <span className="font-medium text-slate-500">Responsible: </span>
                            {comm.responsibleName}
                            {comm.dueDate && <span className="ml-2 text-amber-700">Due: {fmtDate(comm.dueDate)}</span>}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── New / Edit Communication Drawer ─────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={open => { setDrawerOpen(open); if (!open) { setEditingId(null); form.reset(); } }}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">
              {editingId ? 'Edit Communication Record' : 'New Communication Record'}
            </SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Communication Category — mandatory */}
              <FormField control={form.control} name="communicationCategoryId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Communication Category <span className="text-red-500">*</span></FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Auto-populate Subject only when creating a new record and the
                      // user has not manually modified the Subject field yet.
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

              {/* Response Type — mandatory */}
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
                  {/* Contextual hints */}
                  {(field.value === 'upload_existing' || field.value === 'drawing_image' || field.value === 'other_document') && (
                    <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1 mt-1">
                      After clicking <strong>Create Record</strong>, the new row will open automatically — click <strong>Upload Document</strong> there to attach your file.
                    </p>
                  )}
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
                        // Mark as user-edited so subsequent category changes
                        // no longer overwrite what the user typed.
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
                    <FormLabel className="text-xs font-medium">Channel <span className="text-xs font-medium">*</span></FormLabel>
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
                                onSelect={() => {
                                  field.onChange(c.name);
                                  setContactOpen(false);
                                }}
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
                    /* Fallback: free-text when no contacts are loaded */
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
                      {isNote ? (
                        <>Response / Note <span className="text-red-500">*</span></>
                      ) : 'Response / Summary'}
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

              {/* Attach document — only on create, not on edit */}
              {!editingId && (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">Attach Document <span className="text-slate-400 font-normal">(optional)</span></p>
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
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => { setDrawerOpen(false); setEditingId(null); setPendingFile(null); form.reset(); }}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  {editingId
                    ? 'Save Changes'
                    : createMutation.isPending ? 'Creating…' : 'Create Record'
                  }
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* ── Delete confirmation dialog ──────────────────────────────────────── */}
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

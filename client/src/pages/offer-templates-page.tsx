import { useState, useRef, useMemo } from "react";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Download, Upload,
  Search, RefreshCw, History, RotateCcw, GitBranch, Shield,
  CheckCircle2, Clock, ChevronRight
} from "lucide-react";
import type { OfferTemplate, OfferTemplateRevision, OfferTemplateAuditEntry } from "@shared/schema";

const defaultSubjectOptions = [
  "Used Engine Oil Refinery Fully Automated PLC SCADA Control",
  "Continuous Polishing System By Regenerative Adsorption",
  "Spares for Refinery Equipment",
];

const languageOptions = ["English", "Spanish", "French", "Arabic", "Portuguese", "Russian"];

function versionBadge(seq: number | null | undefined) {
  const v = seq ?? 1;
  if (v === 1) return <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono border-slate-300 text-slate-500">v1</Badge>;
  if (v === 2) return <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono border-blue-300 text-blue-600">v{v}</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono border-green-400 text-green-700">v{v}</Badge>;
}

function statusChip(status: string) {
  switch (status) {
    case 'superseded':  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-500">Superseded</Badge>;
    case 'rolled_back': return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">Rolled Back</Badge>;
    case 'active':      return <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">Active</Badge>;
    default:            return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>;
  }
}

function actionChip(action: string) {
  switch (action) {
    case 'template_created': return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700">Created</Badge>;
    case 'version_uploaded':  return <Badge className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700">New Version</Badge>;
    case 'rollback':         return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700">Rollback</Badge>;
    case 'archived':         return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600">Archived</Badge>;
    case 'deactivated':      return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-600">Deactivated</Badge>;
    default:                 return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{action}</Badge>;
  }
}

export default function OfferTemplatesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OfferTemplate | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLanguage, setFormLanguage] = useState("English");
  const [formStartPage, setFormStartPage] = useState("");
  const [formEndPage, setFormEndPage] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // History panel
  const [historyTemplate, setHistoryTemplate] = useState<OfferTemplate | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<OfferTemplateRevision | null>(null);


  const { data: templates = [], isLoading } = useQuery<OfferTemplate[]>({
    queryKey: ['/api/sales-marketing/offer-templates'],
  });

  const { data: offerSubjects = [] } = useQuery<string[]>({
    queryKey: ['/api/sales-marketing/offer-subjects'],
  });

  const { data: revisions = [], isLoading: revisionsLoading } = useQuery<OfferTemplateRevision[]>({
    queryKey: ['/api/sales-marketing/offer-templates', historyTemplate?.id, 'revisions'],
    queryFn: () => apiRequest('GET', `/api/sales-marketing/offer-templates/${historyTemplate!.id}/revisions`),
    enabled: !!historyTemplate,
  });

  const { data: auditLog = [] } = useQuery<OfferTemplateAuditEntry[]>({
    queryKey: ['/api/sales-marketing/offer-templates', historyTemplate?.id, 'audit'],
    queryFn: () => apiRequest('GET', `/api/sales-marketing/offer-templates/${historyTemplate!.id}/audit`),
    enabled: !!historyTemplate,
  });

  const subjectOptions = useMemo(() => {
    const merged = new Set([...defaultSubjectOptions, ...offerSubjects]);
    return Array.from(merged).sort();
  }, [offerSubjects]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/sales-marketing/offer-templates/${id}`),
    onSuccess: () => {
      toast({ title: "Template deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest('PATCH', `/api/sales-marketing/offer-templates/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ templateId, revisionId }: { templateId: number; revisionId: number }) =>
      apiRequest('POST', `/api/sales-marketing/offer-templates/${templateId}/rollback/${revisionId}`),
    onSuccess: (data: any) => {
      toast({ title: `Rolled back to v${data.targetRevision?.versionSeq} — now at v${data.rollbackSeq}` });
      setRollbackConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates', historyTemplate?.id, 'revisions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates', historyTemplate?.id, 'audit'] });
      // Refresh the history template ref
      if (historyTemplate) {
        const fresh = (queryClient.getQueryData<OfferTemplate[]>(['/api/sales-marketing/offer-templates']) || []).find(t => t.id === historyTemplate.id);
        if (fresh) setHistoryTemplate(fresh);
      }
    },
    onError: (e: any) => toast({ title: e?.message || "Rollback failed", variant: "destructive" }),
  });

  const resetForm = () => {
    setFormName(""); setFormSubject(""); setFormDescription(""); setFormLanguage("English");
    setFormStartPage(""); setFormEndPage(""); setSelectedFile(null);
    setEditingTemplate(null); setIsFormOpen(false); setShowAddSubject(false); setNewSubjectInput("");
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreate = async () => {
    if (!formName || !formSubject) { toast({ title: "Name and Subject are required", variant: "destructive" }); return; }
    if (!selectedFile) { toast({ title: "Please select a PDF file", variant: "destructive" }); return; }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('template', selectedFile);
      formData.append('name', formName);
      formData.append('subject', formSubject);
      formData.append('description', formDescription);
      formData.append('position', 'middle');
      formData.append('language', formLanguage);
      if (formStartPage) formData.append('startPage', formStartPage);
      if (formEndPage) formData.append('endPage', formEndPage);
      const res = await fetch('/api/sales-marketing/offer-templates', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to create template');
      toast({ title: "Template created — v1" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
      resetForm();
    } catch {
      toast({ title: "Failed to create template", variant: "destructive" });
    } finally { setIsUploading(false); }
  };

  const handleUpdate = async () => {
    if (!editingTemplate || !formName || !formSubject) { toast({ title: "Name and Subject are required", variant: "destructive" }); return; }
    setIsUploading(true);
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('template', selectedFile);
        const res = await fetch(`/api/sales-marketing/offer-templates/${editingTemplate.id}/replace`, { method: 'POST', body: formData });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to replace PDF'); }
      }
      await apiRequest('PATCH', `/api/sales-marketing/offer-templates/${editingTemplate.id}`, {
        name: formName, subject: formSubject, description: formDescription,
        position: 'middle', language: formLanguage,
        startPage: formStartPage ? parseInt(formStartPage) : null,
        endPage: formEndPage ? parseInt(formEndPage) : null,
      });
      toast({ title: selectedFile ? `New revision uploaded — v${(editingTemplate.versionSeq ?? 1) + 1}` : "Template updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
      resetForm();
    } catch (err: any) {
      toast({ title: err?.message || "Failed to update template", variant: "destructive" });
    } finally { setIsUploading(false); }
  };

  const handleReplaceFile = async (templateId: number, file: File) => {
    setIsReplacing(true);
    try {
      const formData = new FormData();
      formData.append('template', file);
      const res = await fetch(`/api/sales-marketing/offer-templates/${templateId}/replace`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed');
      const updated: OfferTemplate = await res.json();
      toast({ title: `New revision uploaded — v${updated.versionSeq}` });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
    } catch {
      toast({ title: "Failed to replace file", variant: "destructive" });
    } finally {
      setIsReplacing(false);
      if (replaceFileRef.current) replaceFileRef.current.value = '';
    }
  };

  const handleEdit = (template: OfferTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormSubject(template.subject);
    setFormDescription(template.description || "");
    setFormLanguage(template.language || "English");
    setFormStartPage(template.startPage ? String(template.startPage) : "");
    setFormEndPage(template.endPage ? String(template.endPage) : "");
    setIsFormOpen(true);
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.fileName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = subjectFilter === "all" || t.subject === subjectFilter;
    return matchesSearch && matchesSubject;
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uniqueSubjects = [...new Set(templates.map(t => t.subject))];

  // Keep historyTemplate ref fresh after query cache updates
  const liveHistoryTemplate = historyTemplate
    ? (templates.find(t => t.id === historyTemplate.id) || historyTemplate)
    : null;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6" /> Offer Templates
            </h1>
            <p className="text-muted-foreground">Manage PDF templates with full revision control — every version is preserved in GCS</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAddSubject(!showAddSubject)}>
              <Plus className="mr-2 h-4 w-4" /> {showAddSubject ? "Cancel" : "Add Subject"}
            </Button>
            <Button onClick={() => { resetForm(); setIsFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Template
            </Button>
          </div>
        </div>

        {showAddSubject && (
          <Card>
            <CardContent className="py-4">
              <Label className="mb-2 block">Add New Offer Subject</Label>
              <div className="flex gap-2">
                <Input
                  value={newSubjectInput}
                  onChange={(e) => setNewSubjectInput(e.target.value)}
                  placeholder="Enter new offer subject..."
                  className="flex-1"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newSubjectInput.trim()) {
                      e.preventDefault();
                      const trimmed = newSubjectInput.trim();
                      try {
                        await apiRequest('POST', '/api/sales-marketing/offer-subjects', { subject: trimmed });
                        queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-subjects'] });
                        setNewSubjectInput(""); setShowAddSubject(false);
                        toast({ title: "Subject added" });
                      } catch { toast({ title: "Failed to add subject", variant: "destructive" }); }
                    }
                  }}
                />
                <Button onClick={async () => {
                  const trimmed = newSubjectInput.trim();
                  if (!trimmed) return;
                  try {
                    await apiRequest('POST', '/api/sales-marketing/offer-subjects', { subject: trimmed });
                    queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-subjects'] });
                    setNewSubjectInput(""); setShowAddSubject(false);
                    toast({ title: "Subject added" });
                  } catch { toast({ title: "Failed to add subject", variant: "destructive" }); }
                }}>Add Subject</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="w-full sm:w-[320px]"><SelectValue placeholder="Filter by subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">No templates found</p>
                <p className="text-sm">Upload PDF templates to merge with your offers</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Pages</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{template.name}</span>
                              {versionBadge(template.versionSeq)}
                            </div>
                            {template.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{template.description}</p>
                            )}
                            {template.gcsObjectPath && (
                              <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[220px]" title={template.gcsObjectPath}>
                                {template.gcsObjectPath}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap max-w-[250px] truncate block">
                          {template.subject}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3 text-red-500" />
                          <span className="text-sm truncate max-w-[150px]">{template.fileName}</span>
                        </div>
                        {template.checksumSha256 && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            SHA256: {template.checksumSha256.substring(0, 12)}…
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatFileSize(template.fileSize)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{template.language || "English"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {template.startPage || template.endPage ? `${template.startPage || 1} - ${template.endPage || 'end'}` : 'All'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={template.isActive}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: template.id, isActive: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {template.createdAt ? fmtDate(template.createdAt) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"
                            onClick={() => window.open(`/api/sales-marketing/offer-templates/${template.id}/download`, '_blank')}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Version History"
                            onClick={() => setHistoryTemplate(template)}>
                            <History className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Upload New Revision"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file'; input.accept = '.pdf';
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (file) handleReplaceFile(template.id, file);
                              };
                              input.click();
                            }}>
                            <RefreshCw className={`h-4 w-4 ${isReplacing ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => handleEdit(template)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete"
                            onClick={() => { if (confirm(`Delete template "${template.name}"?`)) deleteMutation.mutate(template.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Create / Edit Dialog ── */}
        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate
                  ? <span className="flex items-center gap-2">Edit Template <span className="text-sm font-normal text-muted-foreground">— currently {versionBadge(editingTemplate.versionSeq)}</span></span>
                  : "Add New Template"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template Name <span className="text-destructive">*</span></Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. UOR Standard Offer" />
              </div>
              <div>
                <Label>Offer Subject <span className="text-destructive">*</span></Label>
                <Select value={formSubject} onValueChange={setFormSubject}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{subjectOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Language <span className="text-destructive">*</span></Label>
                <Select value={formLanguage} onValueChange={setFormLanguage}>
                  <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                  <SelectContent>{languageOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Page</Label>
                  <Input type="number" min="1" value={formStartPage} onChange={(e) => setFormStartPage(e.target.value)} placeholder="Default: 1" />
                </div>
                <div>
                  <Label>End Page</Label>
                  <Input type="number" min="1" value={formEndPage} onChange={(e) => setFormEndPage(e.target.value)} placeholder="Default: last" />
                </div>
              </div>
              <div>
                <Label>PDF File {!editingTemplate && <span className="text-destructive">*</span>}</Label>
                {editingTemplate && (
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                    <GitBranch className="h-3 w-3" />
                    Current: <span className="font-medium">{editingTemplate.fileName}</span>
                    {versionBadge(editingTemplate.versionSeq)}
                    — uploading a new PDF creates {versionBadge((editingTemplate.versionSeq ?? 1) + 1)}
                  </div>
                )}
                <div className="mt-1">
                  <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1" /> {editingTemplate ? "Upload Revised PDF" : "Choose PDF"}
                    </Button>
                    {selectedFile && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3 text-red-500" />
                        {selectedFile.name} ({formatFileSize(selectedFile.size)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button disabled={isUploading} onClick={editingTemplate ? handleUpdate : handleCreate}>
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingTemplate ? "Update Template" : "Save Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Version History Dialog ── */}
        <Dialog open={!!historyTemplate} onOpenChange={(open) => { if (!open) { setHistoryTemplate(null); setRollbackConfirm(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-500" />
                Version History
                {liveHistoryTemplate && (
                  <span className="font-normal text-base text-muted-foreground ml-1">
                    — {liveHistoryTemplate.name} {versionBadge(liveHistoryTemplate.versionSeq)}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {liveHistoryTemplate && (
              <div className="space-y-4">
                {/* Current live version banner */}
                <div className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Current live version</span>
                      {versionBadge(liveHistoryTemplate.versionSeq)}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{liveHistoryTemplate.gcsObjectPath || liveHistoryTemplate.fileName}</p>
                    {liveHistoryTemplate.checksumSha256 && (
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">SHA256: {liveHistoryTemplate.checksumSha256}</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => window.open(`/api/sales-marketing/offer-templates/${liveHistoryTemplate.id}/download`, '_blank')}>
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>

                <Tabs defaultValue="revisions">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="revisions" className="text-xs">
                      <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                      Revision History {revisions.length > 0 && `(${revisions.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="text-xs">
                      <Shield className="h-3.5 w-3.5 mr-1.5" />
                      Audit Log {auditLog.length > 0 && `(${auditLog.length})`}
                    </TabsTrigger>
                  </TabsList>

                  {/* Revisions tab */}
                  <TabsContent value="revisions" className="mt-3">
                    {revisionsLoading ? (
                      <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                    ) : revisions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
                        <Clock className="h-6 w-6 mx-auto mb-2 opacity-30" />
                        <p>No previous revisions. Upload a new PDF to create the first revision history entry.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {revisions.map((rev) => (
                          <div key={rev.id} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                            <div className="shrink-0 mt-0.5">{versionBadge(rev.versionSeq)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{rev.fileName}</span>
                                {statusChip(rev.status)}
                                {rev.label && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rev.label}</Badge>}
                              </div>
                              {rev.gcsObjectPath && (
                                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate" title={rev.gcsObjectPath}>{rev.gcsObjectPath}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                {rev.checksumSha256 && <span className="font-mono">SHA256: {rev.checksumSha256.substring(0, 16)}…</span>}
                                {rev.fileSize && <span>{formatFileSize(rev.fileSize)}</span>}
                                {rev.uploadedAt && <span>{fmtDateTime(rev.uploadedAt)}</span>}
                              </div>
                              {rev.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{rev.notes}</p>}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50"
                              onClick={() => setRollbackConfirm(rev)}
                              disabled={rollbackMutation.isPending}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Audit tab */}
                  <TabsContent value="audit" className="mt-3">
                    {auditLog.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">No audit entries yet.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {auditLog.map((entry) => {
                          let meta: any = {};
                          try { meta = entry.meta ? JSON.parse(entry.meta) : {}; } catch {}
                          return (
                            <div key={entry.id} className="flex items-start gap-3 px-3 py-2 border rounded text-sm">
                              <div className="shrink-0 mt-0.5">{actionChip(entry.action)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {entry.versionSeq && versionBadge(entry.versionSeq)}
                                  {meta.fileName && <span className="text-xs text-muted-foreground truncate">{meta.fileName}</span>}
                                  {meta.rolledBackToVersion && (
                                    <span className="text-xs text-muted-foreground">
                                      → rolled back to v{meta.rolledBackToVersion} from v{meta.previousLiveVersion}
                                    </span>
                                  )}
                                </div>
                                {meta.gcsObjectPath && (
                                  <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{meta.gcsObjectPath}</p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                                {entry.performedAt ? fmtDateTime(entry.performedAt) : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setHistoryTemplate(null); setRollbackConfirm(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Rollback Confirmation Dialog ── */}
        <Dialog open={!!rollbackConfirm} onOpenChange={(open) => { if (!open) setRollbackConfirm(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-500" /> Confirm Rollback
              </DialogTitle>
            </DialogHeader>
            {rollbackConfirm && liveHistoryTemplate && (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">This will:</p>
                  <ul className="mt-2 space-y-1 text-amber-700 dark:text-amber-300">
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Archive current {versionBadge(liveHistoryTemplate.versionSeq)} as rolled-back</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Restore {versionBadge(rollbackConfirm.versionSeq)} content as the new current version</li>
                    <li className="flex items-start gap-1.5"><ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" /> New seq = {versionBadge((liveHistoryTemplate.versionSeq ?? 1) + 1)} (monotonic — no version is ever deleted)</li>
                  </ul>
                </div>
                <div className="border rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">Target revision:</p>
                  <p className="font-mono text-xs text-muted-foreground">{rollbackConfirm.gcsObjectPath || rollbackConfirm.fileName}</p>
                  {rollbackConfirm.checksumSha256 && <p className="font-mono text-xs text-muted-foreground">SHA256: {rollbackConfirm.checksumSha256.substring(0, 24)}…</p>}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRollbackConfirm(null)}>Cancel</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={rollbackMutation.isPending}
                onClick={() => {
                  if (rollbackConfirm && liveHistoryTemplate) {
                    rollbackMutation.mutate({ templateId: liveHistoryTemplate.id, revisionId: rollbackConfirm.id });
                  }
                }}
              >
                {rollbackMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Rollback
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}

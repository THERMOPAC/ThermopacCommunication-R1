import { useState, useRef } from "react";
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
import {
  FileText, Plus, Pencil, Trash2, Loader2, Download, Upload, Search, RefreshCw
} from "lucide-react";
import type { OfferTemplate } from "@shared/schema";

const subjectOptions = [
  "Used Engine Oil Refinery Fully Automated PLC SCADA Control",
  "Continuous Polishing System By Regenerative Adsorption",
  "Spares for Refinery Equipment",
];

export default function OfferTemplatesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OfferTemplate | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPosition, setFormPosition] = useState("after");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: templates = [], isLoading } = useQuery<OfferTemplate[]>({
    queryKey: ['/api/sales-marketing/offer-templates'],
  });

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

  const resetForm = () => {
    setFormName("");
    setFormSubject("");
    setFormDescription("");
    setFormPosition("after");
    setSelectedFile(null);
    setEditingTemplate(null);
    setIsFormOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreate = async () => {
    if (!formName || !formSubject) {
      toast({ title: "Name and Subject are required", variant: "destructive" });
      return;
    }
    if (!selectedFile) {
      toast({ title: "Please select a PDF file", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('template', selectedFile);
      formData.append('name', formName);
      formData.append('subject', formSubject);
      formData.append('description', formDescription);
      formData.append('position', formPosition);

      const res = await fetch('/api/sales-marketing/offer-templates', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to create template');
      toast({ title: "Template created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
      resetForm();
    } catch {
      toast({ title: "Failed to create template", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate || !formName || !formSubject) {
      toast({ title: "Name and Subject are required", variant: "destructive" });
      return;
    }

    try {
      await apiRequest('PATCH', `/api/sales-marketing/offer-templates/${editingTemplate.id}`, {
        name: formName,
        subject: formSubject,
        description: formDescription,
        position: formPosition,
      });
      toast({ title: "Template updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offer-templates'] });
      resetForm();
    } catch {
      toast({ title: "Failed to update template", variant: "destructive" });
    }
  };

  const handleReplaceFile = async (templateId: number, file: File) => {
    setIsReplacing(true);
    try {
      const formData = new FormData();
      formData.append('template', file);
      const res = await fetch(`/api/sales-marketing/offer-templates/${templateId}/replace`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: "Template file replaced" });
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
    setFormPosition(template.position);
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

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6" /> Offer Templates
            </h1>
            <p className="text-muted-foreground">Manage PDF templates by offer subject for automatic merging with quotations</p>
          </div>
          <Button onClick={() => { resetForm(); setIsFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Template
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="w-full sm:w-[320px]">
                  <SelectValue placeholder="Filter by subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
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
                    <TableHead>Position</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{template.name}</span>
                          {template.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{template.description}</p>
                          )}
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
                      </TableCell>
                      <TableCell className="text-sm">{formatFileSize(template.fileSize)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {template.position === 'before' ? 'Before offer' : 'After offer'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={template.isActive}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: template.id, isActive: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Download"
                            onClick={() => window.open(`/api/sales-marketing/offer-templates/${template.id}/download`, '_blank')}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Replace File"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.pdf';
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

        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Template" : "Add New Template"}</DialogTitle>
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
                  <SelectContent>
                    {subjectOptions.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" rows={2} />
              </div>
              <div>
                <Label>Merge Position</Label>
                <Select value={formPosition} onValueChange={setFormPosition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after">After offer pages</SelectItem>
                    <SelectItem value="before">Before offer pages</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Where the template pages appear relative to the generated offer in the final PDF
                </p>
              </div>
              {!editingTemplate && (
                <div>
                  <Label>PDF File <span className="text-destructive">*</span></Label>
                  <div className="mt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-3 w-3 mr-1" /> Choose PDF
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
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button
                disabled={isUploading}
                onClick={editingTemplate ? handleUpdate : handleCreate}
              >
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingTemplate ? "Save Changes" : "Upload Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

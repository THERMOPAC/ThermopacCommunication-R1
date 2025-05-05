import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DownloadCloud, FileText, RefreshCw, Trash2, Plus, Eye, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { queryClient, apiRequest } from "../lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "../lib/utils";
import Layout from "@/components/layout";

// Define form schema for WPQR document upload
const wpqrFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  welderProcess: z.string().min(1, "Welder process is required"),
  baseMetalGrade: z.string().min(1, "Base metal grade is required"),
  jointType: z.string().min(1, "Joint type is required"),
  certificateNo: z.string().optional(),
  inspectionAuthority: z.string().optional(),
  document: z.instanceof(FileList).refine(files => files.length > 0, {
    message: "Document file is required",
  }),
});

type WpqrFormValues = z.infer<typeof wpqrFormSchema>;

// WPQR document type matching our database schema
type WpqrDocument = {
  id: number;
  documentId: string;
  title: string;
  description: string | null;
  welderProcess: string;
  baseMetalGrade: string;
  jointType: string;
  certificateNo?: string | null;
  inspectionAuthority?: string | null;
  filePath: string | null;
  fileUrl: string | null;
  status: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  createdByUser?: string;
};

export default function WpqrPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<WpqrDocument | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<WpqrDocument | null>(null);

  // Fetch WPQR documents
  const { data: wpqrDocuments, isLoading, error } = useQuery<WpqrDocument[]>({
    queryKey: ['/api/quality/wpqr'],
    retry: 1,
  });
  
  // For the document ID display, we'll count the documents ourselves
  // This avoids issues with authentication on the next-document-id endpoint
  const nextDocumentIdNumber = (wpqrDocuments?.length || 0) + 1;
  const nextDocumentId = `WPQR-${nextDocumentIdNumber}`;

  // Form setup for creating new WPQR document
  const form = useForm<WpqrFormValues>({
    resolver: zodResolver(wpqrFormSchema),
    defaultValues: {
      title: "",
      description: "",
      welderProcess: "",
      baseMetalGrade: "",
      jointType: "",
      certificateNo: "",
      inspectionAuthority: "",
    },
  });

  // Edit form setup
  const editForm = useForm<WpqrFormValues>({
    resolver: zodResolver(wpqrFormSchema.extend({
      // Override document to make it optional for the edit form
      document: z.instanceof(FileList).optional(),
    })),
    defaultValues: {
      title: "",
      description: "",
      welderProcess: "",
      baseMetalGrade: "",
      jointType: "",
      certificateNo: "",
      inspectionAuthority: "",
    },
  });

  // Create new WPQR document mutation
  const createMutation = useMutation({
    mutationFn: async (values: WpqrFormValues) => {
      const formData = new FormData();
      formData.append("title", values.title);
      if (values.description) formData.append("description", values.description);
      formData.append("welderProcess", values.welderProcess);
      formData.append("baseMetalGrade", values.baseMetalGrade);
      formData.append("jointType", values.jointType);
      if (values.certificateNo) formData.append("certificateNo", values.certificateNo);
      if (values.inspectionAuthority) formData.append("inspectionAuthority", values.inspectionAuthority);
      
      // Append the document file
      if (values.document && values.document.length > 0) {
        formData.append("document", values.document[0]);
      }
      
      const response = await fetch("/api/quality/wpqr", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create WPQR document");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "WPQR Document Created",
        description: "The document was uploaded successfully.",
      });
      setIsCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/quality/wpqr'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Update WPQR document mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; values: Omit<WpqrFormValues, 'document'> & { document?: FileList } }) => {
      // Check if we're dealing with a file upload or just metadata update
      if (data.values.document && data.values.document.length > 0) {
        // If we have a new document file, use FormData for the update
        const formData = new FormData();
        formData.append("title", data.values.title);
        if (data.values.description) formData.append("description", data.values.description);
        formData.append("welderProcess", data.values.welderProcess);
        formData.append("baseMetalGrade", data.values.baseMetalGrade);
        formData.append("jointType", data.values.jointType);
        if (data.values.certificateNo) formData.append("certificateNo", data.values.certificateNo);
        if (data.values.inspectionAuthority) formData.append("inspectionAuthority", data.values.inspectionAuthority);
        
        // Append the new document file
        formData.append("document", data.values.document[0]);
        
        // Use fetch with FormData
        const response = await fetch(`/api/quality/wpqr/${data.id}`, {
          method: 'PATCH',
          body: formData,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || "Failed to update WPQR document";
          } catch (e) {
            errorMessage = errorText || "Failed to update WPQR document";
          }
          throw new Error(errorMessage);
        }
        
        const responseText = await response.text();
        return responseText ? JSON.parse(responseText) : {};
      } else {
        // If no new document file, use JSON for metadata update only
        const updateData = {
          title: data.values.title,
          description: data.values.description,
          welderProcess: data.values.welderProcess,
          baseMetalGrade: data.values.baseMetalGrade,
          jointType: data.values.jointType,
          certificateNo: data.values.certificateNo,
          inspectionAuthority: data.values.inspectionAuthority
        };
        
        // Use fetch with JSON
        const response = await fetch(`/api/quality/wpqr/${data.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
      
        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || "Failed to update WPQR document";
          } catch (e) {
            errorMessage = errorText || "Failed to update WPQR document";
          }
          throw new Error(errorMessage);
        }
        
        const responseText = await response.text();
        return responseText ? JSON.parse(responseText) : {};
      }
    },
    onSuccess: () => {
      toast({
        title: "WPQR Document Updated",
        description: "The document was updated successfully.",
      });
      setIsEditOpen(false);
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/quality/wpqr'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Delete WPQR document mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/quality/wpqr/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete WPQR document");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "WPQR Document Deleted",
        description: "The document was deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quality/wpqr'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (values: WpqrFormValues) => {
    createMutation.mutate(values);
  };

  // Download document
  const handleDownload = (id: number) => {
    window.open(`/api/quality/wpqr/${id}/download`, '_blank');
  };

  // Delete document confirmation
  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  // View document details
  const handleViewDocument = (document: WpqrDocument) => {
    setSelectedDocument(document);
  };

  // Close document details dialog
  const handleCloseDetails = () => {
    setSelectedDocument(null);
  };

  // Handle edit document
  const handleEditDocument = (document: WpqrDocument) => {
    setEditingDocument(document);
    // Populate the edit form with the document data
    editForm.reset({
      title: document.title,
      description: document.description || "",
      welderProcess: document.welderProcess,
      baseMetalGrade: document.baseMetalGrade,
      jointType: document.jointType,
      certificateNo: document.certificateNo || "",
      inspectionAuthority: document.inspectionAuthority || "",
    });
    setIsEditOpen(true);
  };

  // Handle edit form submission
  const onSubmitEdit = (values: WpqrFormValues) => {
    if (editingDocument) {
      updateMutation.mutate({
        id: editingDocument.id,
        values
      });
    }
  };

  // Search functionality
  const [searchTerm, setSearchTerm] = useState("");

  // Filter documents based on search term
  const filteredDocuments = wpqrDocuments ? wpqrDocuments.filter(doc => 
    doc.documentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.welderProcess.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.baseMetalGrade.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.jointType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.certificateNo && doc.certificateNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (doc.inspectionAuthority && doc.inspectionAuthority.toLowerCase().includes(searchTerm.toLowerCase()))
  ) : [];

  return (
    <Layout>
      <div className="w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">WPQR Documents</h1>
            <p className="text-muted-foreground">
              Manage Welding Procedure Qualification Records
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add New WPQR
          </Button>
        </div>

        <div className="flex items-center mb-6">
          <Input
            placeholder="Search WPQR documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              onClick={() => setSearchTerm("")}
              className="ml-2"
            >
              Clear
            </Button>
          )}
        </div>

        <Separator className="my-6" />

        {/* WPQR Documents List */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="bg-destructive/10 p-4 rounded-md">
            <p className="text-center text-destructive">
              Error loading WPQR documents. Please try again.
            </p>
          </div>
        ) : !wpqrDocuments || wpqrDocuments.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-md">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <h3 className="text-lg font-semibold">No WPQR Documents</h3>
            <p className="text-muted-foreground">
              Create your first WPQR document by clicking the "Add New WPQR" button.
            </p>
          </div>
        ) : (
          <div className="w-full">
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium w-[15%]">Document ID</th>
                    <th className="p-2 text-left font-medium w-[12%]">Welding Process</th>
                    <th className="p-2 text-left font-medium w-[15%]">Base Metal Grade</th>
                    <th className="p-2 text-left font-medium w-[10%]">Joint Type</th>
                    <th className="p-2 text-left font-medium w-[25%]">Certificate No</th>
                    <th className="p-2 text-left font-medium w-[13%]">Inspection Authority</th>
                    <th className="p-2 text-right font-medium w-[10%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((document) => (
                    <tr key={document.id} className="border-b">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {document.documentId}
                          </Badge>
                          <span className="text-xs font-medium">{document.title}</span>
                        </div>
                      </td>
                      <td className="p-2">{document.welderProcess}</td>
                      <td className="p-2">{document.baseMetalGrade}</td>
                      <td className="p-2">{document.jointType}</td>
                      <td className="p-2 break-words">{document.certificateNo || "-"}</td>
                      <td className="p-2">{document.inspectionAuthority || "-"}</td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDocument(document)}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditDocument(document)}
                            title="Edit Document"
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(document.id)}
                            title="Download Document"
                          >
                            <DownloadCloud className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(document.id)}
                            title="Delete Document"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create WPQR Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create WPQR Document</DialogTitle>
              <DialogDescription>
                Add a new Welding Procedure Qualification Record.
                <div className="mt-2 text-sm font-medium">
                  <div className="flex items-center space-x-2">
                    <span>Document ID:</span>
                    <span className="font-bold text-primary">{nextDocumentId}</span>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter document title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="welderProcess"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Welding Process</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select process" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="SMAW">SMAW</SelectItem>
                            <SelectItem value="GMAW">GMAW</SelectItem>
                            <SelectItem value="GTAW">GTAW</SelectItem>
                            <SelectItem value="FCAW">FCAW</SelectItem>
                            <SelectItem value="SAW">SAW</SelectItem>
                            <SelectItem value="GTAW (141) + SMAW (111)">GTAW (141) + SMAW (111)</SelectItem>
                            <SelectItem value="GTAW (141) + GMAW (135)">GTAW (141) + GMAW (135)</SelectItem>
                            <SelectItem value="GTAW (141) + FCAW (136/137)">GTAW (141) + FCAW (136/137)</SelectItem>
                            <SelectItem value="SMAW (111) + GMAW (135)">SMAW (111) + GMAW (135)</SelectItem>
                            <SelectItem value="SMAW (111) + FCAW (136/137)">SMAW (111) + FCAW (136/137)</SelectItem>
                            <SelectItem value="SMAW (111) + SAW (121)">SMAW (111) + SAW (121)</SelectItem>
                            <SelectItem value="GTAW (141) + SAW (121)">GTAW (141) + SAW (121)</SelectItem>
                            <SelectItem value="GMAW (135) + FCAW (136/137)">GMAW (135) + FCAW (136/137)</SelectItem>
                            <SelectItem value="GMAW (135) + SAW (121)">GMAW (135) + SAW (121)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="baseMetalGrade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Metal Grade</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="A106 Gr. B">A106 Gr. B</SelectItem>
                            <SelectItem value="A333 Gr. 6">A333 Gr. 6</SelectItem>
                            <SelectItem value="A312 TP304/304L">A312 TP304/304L</SelectItem>
                            <SelectItem value="A312 TP316/316L">A312 TP316/316L</SelectItem>
                            <SelectItem value="A335 P11">A335 P11</SelectItem>
                            <SelectItem value="A335 P22">A335 P22</SelectItem>
                            <SelectItem value="A335 P91">A335 P91</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="jointType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joint Type</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select joint type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Butt">Butt</SelectItem>
                            <SelectItem value="Corner">Corner</SelectItem>
                            <SelectItem value="Fillet">Fillet</SelectItem>
                            <SelectItem value="Lap">Lap</SelectItem>
                            <SelectItem value="T-Joint">T-Joint</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="certificateNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certificate Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional certificate number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="inspectionAuthority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inspection Authority</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional inspection authority name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter document description (optional)"
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="document"
                  render={({ field: { onChange, value, ...rest } }) => (
                    <FormItem>
                      <FormLabel>Document File</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => onChange(e.target.files)}
                          {...rest}
                        />
                      </FormControl>
                      <FormDescription>
                        Upload WPQR document in PDF or Word format.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                    ) : (
                      "Create Document"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit WPQR Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit WPQR Document</DialogTitle>
              <DialogDescription>
                Update the WPQR document information.
                {editingDocument && (
                  <div className="mt-2 text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <span>Document ID:</span>
                      <span className="font-bold text-primary">{editingDocument.documentId}</span>
                    </div>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter document title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="welderProcess"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Welding Process</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select process" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="SMAW">SMAW</SelectItem>
                            <SelectItem value="GMAW">GMAW</SelectItem>
                            <SelectItem value="GTAW">GTAW</SelectItem>
                            <SelectItem value="FCAW">FCAW</SelectItem>
                            <SelectItem value="SAW">SAW</SelectItem>
                            <SelectItem value="GTAW (141) + SMAW (111)">GTAW (141) + SMAW (111)</SelectItem>
                            <SelectItem value="GTAW (141) + GMAW (135)">GTAW (141) + GMAW (135)</SelectItem>
                            <SelectItem value="GTAW (141) + FCAW (136/137)">GTAW (141) + FCAW (136/137)</SelectItem>
                            <SelectItem value="SMAW (111) + GMAW (135)">SMAW (111) + GMAW (135)</SelectItem>
                            <SelectItem value="SMAW (111) + FCAW (136/137)">SMAW (111) + FCAW (136/137)</SelectItem>
                            <SelectItem value="SMAW (111) + SAW (121)">SMAW (111) + SAW (121)</SelectItem>
                            <SelectItem value="GTAW (141) + SAW (121)">GTAW (141) + SAW (121)</SelectItem>
                            <SelectItem value="GMAW (135) + FCAW (136/137)">GMAW (135) + FCAW (136/137)</SelectItem>
                            <SelectItem value="GMAW (135) + SAW (121)">GMAW (135) + SAW (121)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="baseMetalGrade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Metal Grade</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="A106 Gr. B">A106 Gr. B</SelectItem>
                            <SelectItem value="A333 Gr. 6">A333 Gr. 6</SelectItem>
                            <SelectItem value="A312 TP304/304L">A312 TP304/304L</SelectItem>
                            <SelectItem value="A312 TP316/316L">A312 TP316/316L</SelectItem>
                            <SelectItem value="A335 P11">A335 P11</SelectItem>
                            <SelectItem value="A335 P22">A335 P22</SelectItem>
                            <SelectItem value="A335 P91">A335 P91</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="jointType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joint Type</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select joint type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Butt">Butt</SelectItem>
                            <SelectItem value="Corner">Corner</SelectItem>
                            <SelectItem value="Fillet">Fillet</SelectItem>
                            <SelectItem value="Lap">Lap</SelectItem>
                            <SelectItem value="T-Joint">T-Joint</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="certificateNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certificate Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional certificate number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="inspectionAuthority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inspection Authority</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional inspection authority name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter document description (optional)"
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="document"
                  render={({ field: { onChange, value, ...rest } }) => (
                    <FormItem>
                      <FormLabel>Replace Document File (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => onChange(e.target.files)}
                          {...rest}
                        />
                      </FormControl>
                      <FormDescription>
                        Upload a new WPQR document to replace the existing one. Leave empty to keep the current document.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                    ) : (
                      "Update Document"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* View Document Details */}
        {selectedDocument && (
          <Dialog open={!!selectedDocument} onOpenChange={handleCloseDetails}>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>WPQR Document Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Document ID</h3>
                    <p>{selectedDocument.documentId}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Created On</h3>
                    <p>{formatDate(selectedDocument.createdAt)}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Title</h3>
                  <p>{selectedDocument.title}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Welding Process</h3>
                    <p>{selectedDocument.welderProcess}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Base Metal Grade</h3>
                    <p>{selectedDocument.baseMetalGrade}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Joint Type</h3>
                    <p>{selectedDocument.jointType}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Certificate No</h3>
                    <p>{selectedDocument.certificateNo || "-"}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Inspection Authority</h3>
                  <p>{selectedDocument.inspectionAuthority || "-"}</p>
                </div>
                {selectedDocument.description && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                    <p className="whitespace-pre-wrap">{selectedDocument.description}</p>
                  </div>
                )}
                <div className="pt-4 flex justify-end space-x-2">
                  <Button
                    onClick={() => handleDownload(selectedDocument.id)}
                    variant="outline"
                  >
                    <DownloadCloud className="mr-2 h-4 w-4" /> Download Document
                  </Button>
                  <Button onClick={handleCloseDetails}>Close</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}
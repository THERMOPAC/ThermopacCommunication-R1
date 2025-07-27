import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DownloadCloud, FileText, RefreshCw, Trash2, Plus, Eye, PencilLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { queryClient, apiRequest } from "../lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "../lib/utils";
import Layout from "@/components/layout";

// Define form schema for WPQR document upload
const wpqrFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title must be 100 characters or less"),
  description: z.string().optional(),
  welderProcess: z.string().min(1, "Welder process is required"),
  baseMetalGrade: z.string().min(1, "Base metal grade is required"),
  jointType: z.string().min(1, "Joint type is required"),
  certificateNo: z.string().max(100, "Certificate Number must be 100 characters or less").optional(),
  inspectionAuthority: z.string().max(50, "Inspection Authority must be 50 characters or less").optional(),
  welderIds: z.array(z.number()).min(1, "At least one welder must be associated with the WPQR document"),
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
  linkedWelders?: Array<{
    welderId: number;
    welderCode: string;
    welderName: string;
  }>;
};

// Welder type for the dropdown (matching the API response from /api/quality/welders)
type Welder = {
  id: number;
  welderId: string;
  name: string;
  trade?: string;
  status: string;
  remarks?: string;
  photoPath?: string;
  dateOfBirth?: string;
  contactNumber?: string;
  hireDate?: string;
  identificationType?: string;
  identificationNumber?: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function WpqrPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<WpqrDocument | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<WpqrDocument | null>(null);
  const [selectedWelders, setSelectedWelders] = useState<number[]>([]);
  const [editSelectedWelders, setEditSelectedWelders] = useState<number[]>([]);

  // Fetch WPQR documents
  const { data: wpqrDocuments, isLoading, error } = useQuery<WpqrDocument[]>({
    queryKey: ['/api/quality/wpqr'],
    retry: 1,
  });

  // Fetch all welders for dropdown
  const { data: welders = [] } = useQuery<Welder[]>({
    queryKey: ['/api/quality/welders'],
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
      welderIds: [],
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
      welderIds: [],
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
      
      // Append selected welders
      if (selectedWelders.length > 0) {
        formData.append("welderIds", JSON.stringify(selectedWelders));
      }
      
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
      setSelectedWelders([]);
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
        
        // Append selected welders for edit
        if (editSelectedWelders.length > 0) {
          formData.append("welderIds", JSON.stringify(editSelectedWelders));
        }
        
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
          inspectionAuthority: data.values.inspectionAuthority,
          welderIds: editSelectedWelders
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
      setEditSelectedWelders([]);
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
    console.log(`Downloading WPQR document with ID: ${id}`);
    window.open(`/api/quality/wpqr/download/${id}`, '_blank');
  };

  // Delete document confirmation
  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  // Handle file upload for WPQR document
  const handleFileUpload = (wpqrDocument: WpqrDocument) => {
    // Create a file input element
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        try {
          const formData = new FormData();
          formData.append('document', file);
          
          const response = await fetch(`/api/quality/wpqr/${wpqrDocument.id}/upload`, {
            method: 'POST',
            body: formData,
          });
          
          if (response.ok) {
            toast({
              title: "File Uploaded",
              description: "The document file was uploaded successfully.",
            });
            queryClient.invalidateQueries({ queryKey: ['/api/quality/wpqr'] });
          } else {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to upload file");
          }
        } catch (error) {
          toast({
            title: "Upload Error",
            description: error instanceof Error ? error.message : "Failed to upload file",
            variant: "destructive",
          });
        }
      }
    };
    input.click();
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
  const handleEditDocument = async (document: WpqrDocument) => {
    console.log("WPQR Document being edited:", document);
    console.log("welderProcess value:", document.welderProcess);
    setEditingDocument(document);
    
    // Fetch current welders for this WPQR document
    try {
      const response = await fetch(`/api/quality/wpqr/${document.id}/welders`);
      if (response.ok) {
        const linkedWelders = await response.json();
        console.log("Linked welders from API:", linkedWelders);
        const welderIds = linkedWelders.map((w: any) => w.id);
        console.log("Mapped welder IDs:", welderIds);
        setEditSelectedWelders(welderIds);
      } else {
        console.log("Failed to fetch welders, resetting to empty array");
        setEditSelectedWelders([]);
      }
    } catch (error) {
      console.error("Error fetching WPQR welders:", error);
      setEditSelectedWelders([]);
    }
    
    // Populate the edit form with the document data
    const formData = {
      title: document.title,
      description: document.description || "",
      welderProcess: document.welderProcess,
      baseMetalGrade: document.baseMetalGrade,
      jointType: document.jointType,
      certificateNo: document.certificateNo || "",
      inspectionAuthority: document.inspectionAuthority || "",
    };
    console.log("Form data being set:", formData);
    editForm.reset(formData);
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
            <h1 className="text-3xl font-bold pl-4">WPQR Documents</h1>
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
          <div className="w-full overflow-x-auto">
            <div className="rounded-md border min-w-full">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium text-xs w-[450px]">Document ID</th>
                    <th className="p-2 text-left font-medium text-xs w-[150px]">Welding Process</th>
                    <th className="p-2 text-left font-medium text-xs w-[150px]">Base Metal Grade</th>
                    <th className="p-2 text-left font-medium text-xs w-[80px]">Joint Type</th>
                    <th className="p-2 text-left font-medium text-xs w-[200px]">Certificate No</th>
                    <th className="p-2 text-left font-medium text-xs max-w-[150px] w-[150px]">Inspection Authority</th>
                    <th className="p-2 text-right font-medium text-xs w-[80px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((document) => (
                    <tr key={document.id} className="border-b">
                      <td className="p-2">
                        <div className="flex items-center gap-1 whitespace-nowrap overflow-hidden">
                          <Badge variant="outline" className="text-xs shrink-0 min-w-[72px] text-center">
                            {document.documentId}
                          </Badge>
                          <span className="text-xs font-medium overflow-hidden text-ellipsis pl-1" title={document.title}>
                            {document.title}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis" title={document.welderProcess}>{document.welderProcess}</td>
                      <td className="p-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis" title={document.baseMetalGrade}>{document.baseMetalGrade}</td>
                      <td className="p-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis" title={document.jointType}>{document.jointType}</td>
                      <td className="p-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis" title={document.certificateNo || "-"}>{document.certificateNo || "-"}</td>
                      <td className="p-2 text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={document.inspectionAuthority || "-"}>{document.inspectionAuthority || "-"}</td>
                      <td className="p-0 text-right">
                        <div className="flex justify-end gap-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-1 h-7"
                            onClick={() => handleViewDocument(document)}
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-1 h-7"
                            onClick={() => handleEditDocument(document)}
                            title="Edit"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-1 h-7"
                            onClick={() => handleDownload(document.id)}
                            title="Download"
                          >
                            <DownloadCloud className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-1 h-7"
                            onClick={() => handleFileUpload(document)}
                            title="Upload File"
                          >
                            <Upload className="h-3.5 w-3.5 text-blue-600" />
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

        {/* Create WPQR Document Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New WPQR Document</DialogTitle>
              <DialogDescription>
                Create a new Welding Procedure Qualification Record document. The document ID will be {nextDocumentId}.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter a description (optional)"
                          {...field}
                        />
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
                          <SelectContent className="max-h-[300px] overflow-y-auto">
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
                          <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectGroup>
                              <SelectLabel>Carbon Steel</SelectLabel>
                              <SelectItem value="A106 Gr. B">A106 Gr. B</SelectItem>
                              <SelectItem value="A333 Gr. 6">A333 Gr. 6</SelectItem>
                              <SelectItem value="A53 Gr. B">A53 Gr. B</SelectItem>
                              <SelectItem value="A672 Gr. B60">A672 Gr. B60</SelectItem>
                              <SelectItem value="A672 Gr. B70">A672 Gr. B70</SelectItem>
                              <SelectItem value="A516 Gr. 60">A516 Gr. 60</SelectItem>
                              <SelectItem value="A516 Gr. 70">A516 Gr. 70</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Stainless Steel</SelectLabel>
                              <SelectItem value="A312 TP304/304L">A312 TP304/304L</SelectItem>
                              <SelectItem value="A312 TP316/316L">A312 TP316/316L</SelectItem>
                              <SelectItem value="A358 TP304/304L">A358 TP304/304L</SelectItem>
                              <SelectItem value="A358 TP316/316L">A358 TP316/316L</SelectItem>
                              <SelectItem value="A240 TP304/304L">A240 TP304/304L</SelectItem>
                              <SelectItem value="A240 TP316/316L">A240 TP316/316L</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Alloy Steel</SelectLabel>
                              <SelectItem value="A335 P11">A335 P11</SelectItem>
                              <SelectItem value="A335 P22">A335 P22</SelectItem>
                              <SelectItem value="A335 P91">A335 P91</SelectItem>
                              <SelectItem value="A213 T11">A213 T11</SelectItem>
                              <SelectItem value="A213 T22">A213 T22</SelectItem>
                              <SelectItem value="A213 T91">A213 T91</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>API Grades</SelectLabel>
                              <SelectItem value="API 5L Gr. B">API 5L Gr. B</SelectItem>
                              <SelectItem value="API 5L X42">API 5L X42</SelectItem>
                              <SelectItem value="API 5L X52">API 5L X52</SelectItem>
                              <SelectItem value="API 5L X60">API 5L X60</SelectItem>
                              <SelectItem value="API 5L X65">API 5L X65</SelectItem>
                              <SelectItem value="API 5L X70">API 5L X70</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Duplex Steel</SelectLabel>
                              <SelectItem value="A240 UNS S31803">A240 UNS S31803</SelectItem>
                              <SelectItem value="A240 UNS S32205">A240 UNS S32205</SelectItem>
                              <SelectItem value="A240 UNS S32750">A240 UNS S32750</SelectItem>
                              <SelectItem value="A240 UNS S32760">A240 UNS S32760</SelectItem>
                            </SelectGroup>
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
                          <Input placeholder="Enter certificate number (optional)" {...field} />
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
                        <Input placeholder="Enter inspection authority (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Welder Selection */}
                <FormField
                  control={form.control}
                  name="welderIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Associated Welders *</FormLabel>
                      <FormDescription>
                        Select welders who are qualified for this WPQR document
                      </FormDescription>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3 max-h-32 overflow-y-auto border rounded-md p-3">
                          {welders.filter(welder => welder.status === 'Active').map((welder) => (
                            <div key={welder.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`welder-${welder.id}`}
                                checked={selectedWelders.includes(welder.id)}
                                onCheckedChange={(checked) => {
                                  let newSelectedWelders;
                                  if (checked) {
                                    newSelectedWelders = [...selectedWelders, welder.id];
                                  } else {
                                    newSelectedWelders = selectedWelders.filter(id => id !== welder.id);
                                  }
                                  setSelectedWelders(newSelectedWelders);
                                  field.onChange(newSelectedWelders);
                                }}
                              />
                              <label
                                htmlFor={`welder-${welder.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {welder.welderId} - {welder.name}
                              </label>
                            </div>
                          ))}
                        </div>
                        {selectedWelders.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {selectedWelders.length} welder(s) selected
                          </p>
                        )}
                      </div>
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
                          accept=".pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...rest}
                        />
                      </FormControl>
                      <FormDescription>
                        Upload the WPQR document as a PDF file.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create WPQR
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* View WPQR Document Dialog */}
        <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && handleCloseDetails()}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            {selectedDocument && (
              <>
                <DialogHeader>
                  <DialogTitle>WPQR Document Details</DialogTitle>
                  <DialogDescription>
                    Document ID: {selectedDocument.documentId}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Title</h4>
                    <p className="mt-1">{selectedDocument.title}</p>
                  </div>
                  {selectedDocument.description && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Description</h4>
                      <p className="mt-1">{selectedDocument.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Welding Process</h4>
                      <p className="mt-1">{selectedDocument.welderProcess}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Base Metal Grade</h4>
                      <p className="mt-1">{selectedDocument.baseMetalGrade}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Joint Type</h4>
                      <p className="mt-1">{selectedDocument.jointType}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Certificate Number</h4>
                      <p className="mt-1">{selectedDocument.certificateNo || "-"}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Inspection Authority</h4>
                    <p className="mt-1">{selectedDocument.inspectionAuthority || "-"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Status</h4>
                    <Badge 
                      variant={selectedDocument.status === "Active" ? "default" : "outline"}
                      className="mt-1"
                    >
                      {selectedDocument.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Created By</h4>
                      <p className="mt-1">{selectedDocument.createdByUser || `User ${selectedDocument.createdBy}`}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Created Date</h4>
                      <p className="mt-1">{formatDate(selectedDocument.createdAt)}</p>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => handleDownload(selectedDocument.id)}
                  >
                    <DownloadCloud className="mr-2 h-4 w-4" />
                    Download Document
                  </Button>
                  <Button onClick={handleCloseDetails}>Close</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit WPQR Document Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit WPQR Document</DialogTitle>
              <DialogDescription>
                Update details for {editingDocument?.documentId}
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-6">
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
                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter a description (optional)"
                          {...field}
                        />
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
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select process" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[300px] overflow-y-auto">
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
                          <SelectContent className="max-h-[300px] overflow-y-auto">
                            <SelectGroup>
                              <SelectLabel>Carbon Steel</SelectLabel>
                              <SelectItem value="A106 Gr. B">A106 Gr. B</SelectItem>
                              <SelectItem value="A333 Gr. 6">A333 Gr. 6</SelectItem>
                              <SelectItem value="A53 Gr. B">A53 Gr. B</SelectItem>
                              <SelectItem value="A672 Gr. B60">A672 Gr. B60</SelectItem>
                              <SelectItem value="A672 Gr. B70">A672 Gr. B70</SelectItem>
                              <SelectItem value="A516 Gr. 60">A516 Gr. 60</SelectItem>
                              <SelectItem value="A516 Gr. 70">A516 Gr. 70</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Stainless Steel</SelectLabel>
                              <SelectItem value="A312 TP304/304L">A312 TP304/304L</SelectItem>
                              <SelectItem value="A312 TP316/316L">A312 TP316/316L</SelectItem>
                              <SelectItem value="A358 TP304/304L">A358 TP304/304L</SelectItem>
                              <SelectItem value="A358 TP316/316L">A358 TP316/316L</SelectItem>
                              <SelectItem value="A240 TP304/304L">A240 TP304/304L</SelectItem>
                              <SelectItem value="A240 TP316/316L">A240 TP316/316L</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Alloy Steel</SelectLabel>
                              <SelectItem value="A335 P11">A335 P11</SelectItem>
                              <SelectItem value="A335 P22">A335 P22</SelectItem>
                              <SelectItem value="A335 P91">A335 P91</SelectItem>
                              <SelectItem value="A213 T11">A213 T11</SelectItem>
                              <SelectItem value="A213 T22">A213 T22</SelectItem>
                              <SelectItem value="A213 T91">A213 T91</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>API Grades</SelectLabel>
                              <SelectItem value="API 5L Gr. B">API 5L Gr. B</SelectItem>
                              <SelectItem value="API 5L X42">API 5L X42</SelectItem>
                              <SelectItem value="API 5L X52">API 5L X52</SelectItem>
                              <SelectItem value="API 5L X60">API 5L X60</SelectItem>
                              <SelectItem value="API 5L X65">API 5L X65</SelectItem>
                              <SelectItem value="API 5L X70">API 5L X70</SelectItem>
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Duplex Steel</SelectLabel>
                              <SelectItem value="A240 UNS S31803">A240 UNS S31803</SelectItem>
                              <SelectItem value="A240 UNS S32205">A240 UNS S32205</SelectItem>
                              <SelectItem value="A240 UNS S32750">A240 UNS S32750</SelectItem>
                              <SelectItem value="A240 UNS S32760">A240 UNS S32760</SelectItem>
                            </SelectGroup>
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
                          <Input placeholder="Enter certificate number (optional)" {...field} />
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
                        <Input placeholder="Enter inspection authority (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Welder Selection for Edit */}
                <FormField
                  control={editForm.control}
                  name="welderIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Associated Welders *</FormLabel>
                      <FormDescription>
                        Select welders who are qualified for this WPQR document
                      </FormDescription>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3 max-h-32 overflow-y-auto border rounded-md p-3">
                          {welders.filter(welder => welder.status === 'Active').map((welder) => (
                            <div key={welder.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`edit-welder-${welder.id}`}
                                checked={editSelectedWelders.includes(welder.id)}
                                onCheckedChange={(checked) => {
                                  let newSelectedWelders;
                                  if (checked) {
                                    newSelectedWelders = [...editSelectedWelders, welder.id];
                                  } else {
                                    newSelectedWelders = editSelectedWelders.filter(id => id !== welder.id);
                                  }
                                  setEditSelectedWelders(newSelectedWelders);
                                  field.onChange(newSelectedWelders);
                                }}
                              />
                              <label
                                htmlFor={`edit-welder-${welder.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {welder.welderId} - {welder.name}
                              </label>
                            </div>
                          ))}
                        </div>
                        {editSelectedWelders.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {editSelectedWelders.length} welder(s) selected
                          </p>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="document"
                  render={({ field: { onChange, value, ...rest } }) => (
                    <FormItem>
                      <FormLabel>Document File (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...rest}
                        />
                      </FormControl>
                      <FormDescription>
                        Upload a new document file only if you want to replace the existing one.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Update WPQR
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
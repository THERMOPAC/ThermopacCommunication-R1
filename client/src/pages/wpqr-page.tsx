import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DownloadCloud, FileText, RefreshCw, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { queryClient, apiRequest } from "../lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "../lib/utils";

// Define form schema for WPQR document upload
const wpqrFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  welderProcess: z.string().min(1, "Welder process is required"),
  baseMetalGrade: z.string().min(1, "Base metal grade is required"),
  jointType: z.string().min(1, "Joint type is required"),
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

  // Fetch WPQR documents
  const { data: wpqrDocuments, isLoading, error } = useQuery<WpqrDocument[]>({
    queryKey: ['/api/quality/wpqr'],
    retry: 1,
  });

  // Form setup for creating new WPQR document
  const form = useForm<WpqrFormValues>({
    resolver: zodResolver(wpqrFormSchema),
    defaultValues: {
      title: "",
      description: "",
      welderProcess: "",
      baseMetalGrade: "",
      jointType: "",
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

  // Delete WPQR document mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/quality/wpqr/${id}`);
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

  return (
    <div className="container mx-auto py-6">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {wpqrDocuments.map((document) => (
            <Card key={document.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg truncate">{document.title}</CardTitle>
                  <Badge variant={document.status === "Active" ? "default" : "secondary"}>
                    {document.status}
                  </Badge>
                </div>
                <CardDescription className="truncate">
                  ID: {document.documentId}
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="space-y-1 text-sm">
                  <div><span className="font-semibold">Process:</span> {document.welderProcess}</div>
                  <div><span className="font-semibold">Metal Grade:</span> {document.baseMetalGrade}</div>
                  <div><span className="font-semibold">Joint Type:</span> {document.jointType}</div>
                  <div><span className="font-semibold">Created:</span> {formatDate(new Date(document.createdAt))}</div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleViewDocument(document)}
                >
                  View Details
                </Button>
                <div className="flex space-x-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDownload(document.id)}
                  >
                    <DownloadCloud className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(document.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create New WPQR Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New WPQR Document</DialogTitle>
            <DialogDescription>
              Upload a new Welding Procedure Qualification Record document.
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
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter document description" 
                        {...field} 
                        value={field.value || ""}
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
                      <FormLabel>Welder Process</FormLabel>
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
                          <SelectItem value="SA-516 Gr 60">SA-516 Gr 60</SelectItem>
                          <SelectItem value="SA-516 Gr 70">SA-516 Gr 70</SelectItem>
                          <SelectItem value="SA-106 Gr B">SA-106 Gr B</SelectItem>
                          <SelectItem value="SA-53 Gr B">SA-53 Gr B</SelectItem>
                          <SelectItem value="SA-234 WPB">SA-234 WPB</SelectItem>
                          <SelectItem value="SA-105">SA-105</SelectItem>
                          <SelectItem value="SA-182 F304">SA-182 F304</SelectItem>
                          <SelectItem value="SA-240 304">SA-240 304</SelectItem>
                          <SelectItem value="SA-240 316L">SA-240 316L</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                        <SelectItem value="Butt">Butt Joint</SelectItem>
                        <SelectItem value="Corner">Corner Joint</SelectItem>
                        <SelectItem value="Lap">Lap Joint</SelectItem>
                        <SelectItem value="T-Joint">T-Joint</SelectItem>
                        <SelectItem value="Edge">Edge Joint</SelectItem>
                      </SelectContent>
                    </Select>
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
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" 
                        onChange={(e) => onChange(e.target.files)} 
                        {...rest}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
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
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Document
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Document Details Dialog */}
      {selectedDocument && (
        <Dialog open={!!selectedDocument} onOpenChange={handleCloseDetails}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedDocument.title}</DialogTitle>
              <DialogDescription>
                Document ID: {selectedDocument.documentId}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold">Welder Process</h4>
                  <p>{selectedDocument.welderProcess}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Base Metal Grade</h4>
                  <p>{selectedDocument.baseMetalGrade}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Joint Type</h4>
                  <p>{selectedDocument.jointType}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Status</h4>
                  <Badge variant={selectedDocument.status === "Active" ? "default" : "secondary"}>
                    {selectedDocument.status}
                  </Badge>
                </div>
              </div>
              
              {selectedDocument.description && (
                <div>
                  <h4 className="text-sm font-semibold">Description</h4>
                  <p className="text-sm">{selectedDocument.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold">Created At</h4>
                  <p>{formatDate(new Date(selectedDocument.createdAt))}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Last Updated</h4>
                  <p>{formatDate(new Date(selectedDocument.updatedAt))}</p>
                </div>
              </div>
              
              <DialogFooter>
                <Button 
                  onClick={() => handleDownload(selectedDocument.id)}
                  className="gap-2"
                >
                  <DownloadCloud className="h-4 w-4" />
                  Download Document
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
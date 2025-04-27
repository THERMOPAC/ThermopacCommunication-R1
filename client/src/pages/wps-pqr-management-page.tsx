import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Search, Download, FileText, Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// Form schema for WPS documents
const wpsDocumentSchema = z.object({
  welderProcess: z.string().min(1, { message: "Welder process is required" }),
  baseMetalGrade: z.string().min(1, { message: "Base metal grade is required" }),
  baseMetalThickness: z.string().min(1, { message: "Base metal thickness is required" }),
  fillerMaterial: z.string().min(1, { message: "Filler material is required" }),
  jointType: z.string().min(1, { message: "Joint type is required" }),
  weldPosition: z.string().min(1, { message: "Weld position is required" }),
  preheatingTemp: z.string().optional(),
  postWeldHeatTreatment: z.string().optional(),
  shieldingGas: z.string().optional(),
  status: z.string().min(1, { message: "Status is required" }),
  remarks: z.string().optional(),
});

// Type for the form data
type WpsDocumentFormData = z.infer<typeof wpsDocumentSchema>;

// Type for WPS document data received from API
type WpsDocument = {
  id: number;
  wpsId: string;
  pqrId: string;
  revisionNo: string;
  welderProcess: string;
  baseMetalGrade: string;
  baseMetalThickness: string;
  fillerMaterial: string;
  jointType: string;
  weldPosition: string;
  preheatingTemp?: string;
  postWeldHeatTreatment?: string;
  electricalParameters?: Record<string, any>;
  shieldingGas?: string;
  document_file_path?: string;
  document_url?: string;
  combined_document_file_path?: string;
  combined_document_url?: string;
  status: string;
  approvedBy?: number;
  approvalDate?: string;
  remarks?: string;
  createdBy: number;
  createdByUser: string;
  approvedByUser?: string;
  createdAt: string;
  updatedAt: string;
};

// Options for dropdowns
const welderProcessOptions = [
  "SMAW",
  "GTAW",
  "FCAW",
  "SAW",
  "GMAW"
];

const jointTypeOptions = [
  "Butt",
  "Fillet",
  "Corner",
  "Lap",
  "T-Joint"
];

const weldPositionOptions = [
  "1G",
  "2G",
  "3G",
  "4G",
  "5G",
  "6G"
];

const statusOptions = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Obsolete"
];

export default function WpsPqrManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for UI
  const [isAddWpsOpen, setIsAddWpsOpen] = useState(false);
  const [isEditWpsOpen, setIsEditWpsOpen] = useState(false);
  const [selectedWps, setSelectedWps] = useState<WpsDocument | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [combinedDocumentFile, setCombinedDocumentFile] = useState<File | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("wps");
  const [selectedWpsId, setSelectedWpsId] = useState<string | null>(null);
  const [selectedPqrId, setSelectedPqrId] = useState<string | null>(null);
  
  // Handle status filter selection
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value === "all_statuses" ? null : value);
  };
  
  // Fetch WPS documents data
  const { 
    data: wpsDocuments = [], 
    isLoading, 
    refetch 
  } = useQuery<WpsDocument[]>({
    queryKey: ["/api/quality/wps"],
  });
  
  // Create new WPS document mutation
  const createWpsMutation = useMutation({
    mutationFn: async (data: WpsDocumentFormData) => {
      const formData = new FormData();
      
      // Append form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append document file if available
      if (documentFile) {
        formData.append("document", documentFile);
      }
      
      const response = await fetch("/api/quality/wps", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create WPS document");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "WPS document created successfully",
      });
      setIsAddWpsOpen(false);
      form.reset();
      setDocumentFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps-pqr/wps"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating WPS document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update WPS document mutation
  const updateWpsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: WpsDocumentFormData }) => {
      const formData = new FormData();
      
      // Append form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append document file if available
      if (documentFile) {
        formData.append("document", documentFile);
      }
      
      const response = await fetch(`/api/quality/wps/${id}`, {
        method: "PUT",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update WPS document");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "WPS document updated successfully",
      });
      setIsEditWpsOpen(false);
      editForm.reset();
      setDocumentFile(null);
      setSelectedWps(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps-pqr/wps"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating WPS document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Delete WPS document mutation
  const deleteWpsMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/quality/wps/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete WPS document");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "WPS document deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setSelectedWps(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps-pqr/wps"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting WPS document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Form setup for adding a new WPS document
  const form = useForm<WpsDocumentFormData>({
    resolver: zodResolver(wpsDocumentSchema),
    defaultValues: {
      welderProcess: "",
      baseMetalGrade: "",
      baseMetalThickness: "",
      fillerMaterial: "",
      jointType: "",
      weldPosition: "",
      preheatingTemp: "",
      postWeldHeatTreatment: "",
      shieldingGas: "",
      status: "Draft",
      remarks: "",
    },
  });
  
  // Form setup for editing a WPS document
  const editForm = useForm<WpsDocumentFormData>({
    resolver: zodResolver(wpsDocumentSchema),
    defaultValues: {
      welderProcess: "",
      baseMetalGrade: "",
      baseMetalThickness: "",
      fillerMaterial: "",
      jointType: "",
      weldPosition: "",
      preheatingTemp: "",
      postWeldHeatTreatment: "",
      shieldingGas: "",
      status: "",
      remarks: "",
    },
  });
  
  // Filter WPS documents based on search term and status filter
  const filteredWpsDocuments = Array.isArray(wpsDocuments) ? wpsDocuments.filter((doc) => {
    const matchesSearch = 
      doc.wpsId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.pqrId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.welderProcess?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.baseMetalGrade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.fillerMaterial?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatusFilter = statusFilter === null || doc.status === statusFilter;
    
    return matchesSearch && matchesStatusFilter;
  }) : [];
  
  // Submit handler for adding a new WPS document
  const onSubmit = (values: WpsDocumentFormData) => {
    createWpsMutation.mutate(values);
  };
  
  // Submit handler for editing a WPS document
  const onEditSubmit = (values: WpsDocumentFormData) => {
    if (selectedWps) {
      updateWpsMutation.mutate({ 
        id: selectedWps.id, 
        data: values
      });
    }
  };
  
  // Set up the edit form when a WPS document is selected for editing
  useEffect(() => {
    if (selectedWps) {
      editForm.reset({
        welderProcess: selectedWps.welderProcess,
        baseMetalGrade: selectedWps.baseMetalGrade,
        baseMetalThickness: selectedWps.baseMetalThickness,
        fillerMaterial: selectedWps.fillerMaterial,
        jointType: selectedWps.jointType,
        weldPosition: selectedWps.weldPosition,
        preheatingTemp: selectedWps.preheatingTemp || "",
        postWeldHeatTreatment: selectedWps.postWeldHeatTreatment || "",
        shieldingGas: selectedWps.shieldingGas || "",
        status: selectedWps.status,
        remarks: selectedWps.remarks || "",
      });
    }
  }, [selectedWps, editForm]);
  
  // Handle edit button click
  const handleEditClick = (wps: WpsDocument) => {
    setSelectedWps(wps);
    setIsEditWpsOpen(true);
  };
  
  // Handle delete button click
  const handleDeleteClick = (wps: WpsDocument) => {
    setSelectedWps(wps);
    setIsDeleteDialogOpen(true);
  };
  
  // Handle document file selection
  const handleDocumentFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setDocumentFile(event.target.files[0]);
    }
  };
  
  // Handle combined document file selection
  const handleCombinedDocumentFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setCombinedDocumentFile(event.target.files[0]);
    }
  };
  
  // Download document
  const handleDownloadDocument = async (wpsId: number) => {
    try {
      window.open(`/api/quality/wps/${wpsId}/document`, '_blank');
    } catch (error) {
      toast({
        title: "Error downloading document",
        description: "Failed to download the document file",
        variant: "destructive",
      });
    }
  };
  
  // Download combined document
  const handleDownloadCombinedDocument = async (wpsId: number) => {
    try {
      window.open(`/api/quality/wps/${wpsId}/combined-document`, '_blank');
    } catch (error) {
      toast({
        title: "Error downloading combined document",
        description: "Failed to download the combined document file",
        variant: "destructive",
      });
    }
  };
  
  // Upload combined document
  const uploadCombinedDocumentMutation = useMutation({
    mutationFn: async ({ wpsId, pqrId }: { wpsId: string; pqrId: string }) => {
      if (!combinedDocumentFile) {
        throw new Error("No document file selected");
      }
      
      const formData = new FormData();
      formData.append("combinedDocument", combinedDocumentFile);
      formData.append("wpsId", wpsId);
      formData.append("pqrId", pqrId);
      
      const response = await fetch(`/api/quality/wps/combined-document`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload combined document");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Combined WPS/PQR document uploaded successfully",
      });
      setCombinedDocumentFile(null);
      setSelectedWpsId(null);
      setSelectedPqrId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps-pqr/wps"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error uploading combined document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Approved":
        return <Badge className="bg-green-500">{status}</Badge>;
      case "Pending Approval":
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">{status}</Badge>;
      case "Draft":
        return <Badge variant="outline">{status}</Badge>;
      case "Obsolete":
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Tabs defaultValue="wps" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">WPS & PQR Management</h1>
              <TabsList className="mt-4">
                <TabsTrigger value="wps">WPS</TabsTrigger>
                <TabsTrigger value="pqr">PQR</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
            </div>
            <Button onClick={() => setIsAddWpsOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add New WPS
            </Button>
          </div>
          
          <TabsContent value="wps" className="mt-0">
            {/* Filter and search */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="w-full md:w-1/3">
                <div className="relative">
                  <Search className="absolute left-2 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by WPS ID, material, process..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-full md:w-1/4">
                <Select value={statusFilter || "all_statuses"} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_statuses">All Statuses</SelectItem>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* WPS documents table */}
            <Card>
              <CardHeader>
                <CardTitle>WPS Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredWpsDocuments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No WPS documents found. Add a new WPS to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>WPS ID</TableHead>
                          <TableHead>PQR ID</TableHead>
                          <TableHead>Process</TableHead>
                          <TableHead>Base Metal</TableHead>
                          <TableHead>Joint Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Document</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWpsDocuments.map((wps) => (
                          <TableRow key={wps.id}>
                            <TableCell className="font-medium">{wps.wpsId}</TableCell>
                            <TableCell>{wps.pqrId}</TableCell>
                            <TableCell>{wps.welderProcess}</TableCell>
                            <TableCell>
                              {wps.baseMetalGrade}
                              <span className="text-xs text-muted-foreground block">
                                {wps.baseMetalThickness} mm
                              </span>
                            </TableCell>
                            <TableCell>{wps.jointType}</TableCell>
                            <TableCell>{getStatusBadge(wps.status)}</TableCell>
                            <TableCell>
                              {wps.document_file_path ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleDownloadDocument(wps.id)}
                                >
                                  <Download className="h-4 w-4 mr-1" /> View
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">No document</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(wps)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick(wps)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="pqr" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>PQR Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  PQR management functionality coming soon.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="documents" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Combined WPS/PQR Documents</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Upload approved combined WPS and PQR documents for reference.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Document upload form */}
                  <div className="bg-muted/50 p-6 rounded-lg border">
                    <h3 className="text-lg font-medium mb-4">Upload Combined WPS/PQR Document</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="wps_id">WPS ID</Label>
                        <Input 
                          id="wps_id" 
                          placeholder="Enter WPS ID" 
                          value={selectedWpsId || ''}
                          onChange={(e) => setSelectedWpsId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the WPS ID for this document
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="pqr_id">PQR ID</Label>
                        <Input 
                          id="pqr_id" 
                          placeholder="Enter PQR ID" 
                          value={selectedPqrId || ''}
                          onChange={(e) => setSelectedPqrId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the PQR ID for this document
                        </p>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <Label htmlFor="combined_document">Upload Combined Document</Label>
                      <Input
                        id="combined_document"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleCombinedDocumentFileChange}
                        className="mt-1"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        {combinedDocumentFile ? 
                          `Selected file: ${combinedDocumentFile.name}` : 
                          "Select a PDF or image file (.pdf, .jpg, .png)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Note: The file will be stored with the filename "WPS ID_PQR ID.pdf" in Google Cloud Storage under QMS/WPS_PQR path.
                      </p>
                    </div>
                    
                    <Button
                      onClick={() => {
                        if (!selectedWpsId || !selectedPqrId) {
                          toast({
                            title: "Missing Information",
                            description: "Please enter both WPS ID and PQR ID",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        if (!combinedDocumentFile) {
                          toast({
                            title: "No File Selected",
                            description: "Please select a document file to upload",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        uploadCombinedDocumentMutation.mutate({
                          wpsId: selectedWpsId,
                          pqrId: selectedPqrId
                        });
                      }}
                      disabled={uploadCombinedDocumentMutation.isPending}
                    >
                      {uploadCombinedDocumentMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" /> Upload Combined Document
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {/* Document list */}
                  <div>
                    <h3 className="text-lg font-medium mb-4">Uploaded Combined Documents</h3>
                    {isLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>WPS ID</TableHead>
                              <TableHead>PQR ID</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Combined Document</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredWpsDocuments
                              .filter(doc => doc.combined_document_file_path)
                              .map((wps) => (
                                <TableRow key={`${wps.id}-combined`}>
                                  <TableCell className="font-medium">{wps.wpsId}</TableCell>
                                  <TableCell>{wps.pqrId}</TableCell>
                                  <TableCell>{getStatusBadge(wps.status)}</TableCell>
                                  <TableCell>
                                    {wps.combined_document_file_path ? (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handleDownloadCombinedDocument(wps.id)}
                                      >
                                        <Download className="h-4 w-4 mr-1" /> View Document
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">No document</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                            ))}
                            {filteredWpsDocuments.filter(doc => doc.combined_document_file_path).length === 0 && (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                                  No combined documents uploaded yet.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Add WPS Dialog */}
        <Dialog open={isAddWpsOpen} onOpenChange={setIsAddWpsOpen}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Add New WPS Document</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="mb-4">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="document">Document</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                {welderProcessOptions.map((process) => (
                                  <SelectItem key={process} value={process}>
                                    {process}
                                  </SelectItem>
                                ))}
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
                            <FormControl>
                              <Input placeholder="e.g. SA516 Gr.70" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="baseMetalThickness"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Base Metal Thickness (mm)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 12.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="fillerMaterial"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Filler Material</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. ER70S-6" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                                {jointTypeOptions.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="weldPosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weld Position</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select position" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {weldPositionOptions.map((position) => (
                                  <SelectItem key={position} value={position}>
                                    {position}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="preheatingTemp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preheating Temperature (°C)</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="postWeldHeatTreatment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Post Weld Heat Treatment</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="shieldingGas"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shielding Gas</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {statusOptions.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Additional notes or comments" 
                              {...field} 
                              className="resize-none h-20"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                  <TabsContent value="document" className="space-y-4">
                    <div>
                      <Label htmlFor="document_file">Upload WPS Document</Label>
                      <Input
                        id="document_file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleDocumentFileChange}
                        className="mt-1"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        {documentFile ? 
                          `Selected file: ${documentFile.name}` : 
                          "Select a PDF or image file (.pdf, .jpg, .png)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Note: The file will be stored with the filename "WPS ID.pdf" in Google Cloud Storage.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddWpsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createWpsMutation.isPending}>
                    {createWpsMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                    ) : (
                      "Create WPS"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Edit WPS Dialog */}
        <Dialog open={isEditWpsOpen} onOpenChange={setIsEditWpsOpen}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>
                Edit WPS Document {selectedWps?.wpsId}
              </DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="mb-4">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="document">Document</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
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
                                {welderProcessOptions.map((process) => (
                                  <SelectItem key={process} value={process}>
                                    {process}
                                  </SelectItem>
                                ))}
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
                            <FormControl>
                              <Input placeholder="e.g. SA516 Gr.70" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="baseMetalThickness"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Base Metal Thickness (mm)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 12.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="fillerMaterial"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Filler Material</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. ER70S-6" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                                {jointTypeOptions.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="weldPosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weld Position</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select position" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {weldPositionOptions.map((position) => (
                                  <SelectItem key={position} value={position}>
                                    {position}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="preheatingTemp"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preheating Temperature (°C)</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="postWeldHeatTreatment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Post Weld Heat Treatment</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="shieldingGas"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shielding Gas</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {statusOptions.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={editForm.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Additional notes or comments" 
                              {...field} 
                              className="resize-none h-20"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                  <TabsContent value="document" className="space-y-4">
                    {/* Display current document if available */}
                    {(selectedWps?.document_url || selectedWps?.document_file_path) && (
                      <div className="p-4 border rounded-md bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">Current Document</h4>
                            <p className="text-sm text-muted-foreground">
                              WPS document file available
                            </p>
                          </div>
                          <Button 
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => selectedWps && handleDownloadDocument(selectedWps.id)}
                            className="ml-2"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            View Document
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {/* Upload new document */}
                    <div>
                      <Label htmlFor="edit_document_file">
                        {selectedWps?.document_file_path ? 
                          "Replace Document" : 
                          "Upload Document"}
                      </Label>
                      <Input
                        id="edit_document_file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleDocumentFileChange}
                        className="mt-1"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        {documentFile ? 
                          `Selected file: ${documentFile.name}` : 
                          "Select a PDF or image file (.pdf, .jpg, .png)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Note: The file will be stored with the filename "WPS ID.pdf" in Google Cloud Storage.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditWpsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateWpsMutation.isPending}>
                    {updateWpsMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                    ) : (
                      "Update WPS"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this WPS?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the WPS document 
                <span className="font-semibold"> {selectedWps?.wpsId}</span> and all associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => selectedWps && deleteWpsMutation.mutate(selectedWps.id)}
                disabled={deleteWpsMutation.isPending}
              >
                {deleteWpsMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
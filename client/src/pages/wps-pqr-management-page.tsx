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
import { 
  AlertCircle,
  CheckCircle,
  PlusCircle, 
  Search, 
  Download, 
  FileText, 
  Edit, 
  Trash2,
  InfoIcon,
  Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

// Form schema for PQR documents
const pqrDocumentSchema = z.object({
  testDate: z.string().min(1, { message: "Test date is required" }),
  testLaboratory: z.string().min(1, { message: "Test laboratory is required" }),
  testType: z.string().min(1, { message: "Test type is required" }),
  testResults: z.string().min(1, { message: "Test results are required" }),
  status: z.string().min(1, { message: "Status is required" }),
  remarks: z.string().optional(),
});

// Type for the form data
type WpsDocumentFormData = z.infer<typeof wpsDocumentSchema>;
type PqrDocumentFormData = z.infer<typeof pqrDocumentSchema>;

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
  has_pqr?: boolean; // Flag to indicate if a WPS has an associated PQR
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
  "1G (Flat)",
  "2G (Horizontal)",
  "3G (Vertical)",
  "4G (Overhead)",
  "5G (Horizontal Fixed)",
  "6G (Inclined)"
];

const statusOptions = [
  "Draft",
  "Pending Approval",
  "In Review",
  "Approved",
  "Rejected",
  "Obsolete"
];

const testTypeOptions = [
  "Tensile Test",
  "Bend Test",
  "Impact Test",
  "Hardness Test",
  "Radiographic Test",
  "Ultrasonic Test",
  "Magnetic Particle Test",
  "Penetrant Test",
  "Visual Examination"
];

export default function WpsPqrManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for UI
  const [isAddWpsOpen, setIsAddWpsOpen] = useState(false);
  const [isEditWpsOpen, setIsEditWpsOpen] = useState(false);
  const [isAddPqrOpen, setIsAddPqrOpen] = useState(false);
  const [selectedWps, setSelectedWps] = useState<WpsDocument | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [pqrDocumentFile, setPqrDocumentFile] = useState<File | null>(null);
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
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps"] });
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
            {activeTab === "wps" && (
              <Button onClick={() => setIsAddWpsOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New WPS
              </Button>
            )}
            {activeTab === "pqr" && (
              <Button onClick={() => {
                // Show the PQR creation dialog directly from PQR tab
                // User will need to select a WPS to link with
                setIsAddPqrOpen(true);
                setSelectedWps(null); // Will need to select a WPS in the dialog
              }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New PQR
              </Button>
            )}
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
                            <TableCell>
                              <span className="text-sm font-bold bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-700">
                                {wps.wpsId}
                              </span>
                            </TableCell>
                            <TableCell>
                              {wps.pqrId && (
                                <span className="text-sm font-bold bg-green-50 border border-green-200 rounded px-2 py-1 text-green-700">
                                  {wps.pqrId}
                                </span>
                              )}
                              {!wps.pqrId && (
                                <span className="text-xs text-muted-foreground">
                                  No PQR linked
                                </span>
                              )}
                            </TableCell>
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
            {/* Filter and search */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="w-full md:w-1/3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search PQR documents..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-full md:w-1/3">
                <Select
                  value={statusFilter || "all_statuses"}
                  onValueChange={handleStatusFilterChange}
                >
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

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>PQR Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredWpsDocuments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No WPS documents found. Create a WPS first before adding PQRs.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>WPS ID</TableHead>
                          <TableHead>Process</TableHead>
                          <TableHead>Base Metal</TableHead>
                          <TableHead>Joint Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>PQR Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWpsDocuments.map((wps) => (
                          <TableRow key={wps.id}>
                            <TableCell>
                              <span className="text-sm font-bold bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-700">
                                {wps.wpsId}
                              </span>
                              {wps.pqrId && (
                                <div className="mt-1">
                                  <span className="text-sm font-bold bg-green-50 border border-green-200 rounded px-2 py-1 text-green-700">
                                    {wps.pqrId}
                                  </span>
                                </div>
                              )}
                            </TableCell>
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
                              {wps.pqrId ? (
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                  PQR {wps.pqrId} Created
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                  No PQR
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {!wps.pqrId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedWps(wps);
                                      setIsAddPqrOpen(true);
                                    }}
                                  >
                                    <PlusCircle className="h-4 w-4 mr-1" /> Create PQR
                                  </Button>
                                )}
                                {wps.pqrId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      // View PQR details
                                      toast({
                                        title: "Coming Soon",
                                        description: "PQR details viewing will be available soon.",
                                      });
                                    }}
                                  >
                                    <FileText className="h-4 w-4 mr-1" /> View PQR
                                  </Button>
                                )}
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
                                  <TableCell>
                                    <span className="text-sm font-bold bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-700">
                                      {wps.wpsId}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm font-bold bg-green-50 border border-green-200 rounded px-2 py-1 text-green-700">
                                      {wps.pqrId}
                                    </span>
                                  </TableCell>
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
          <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New WPS Document</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="mb-4 sticky top-0 z-10 bg-background">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="document">Document</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="space-y-4">
                    {/* Document ID Information Box */}
                    <div className="border rounded-md p-4 bg-blue-50 border-blue-100 mb-4">
                      <h3 className="font-medium text-blue-700 flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Document Numbering
                      </h3>
                      <p className="text-sm text-blue-700 mt-2">
                        Document will receive the following ID: <span className="font-semibold">WPS-{wpsDocuments ? wpsDocuments.length + 1 : 1}</span>
                      </p>
                      <p className="text-sm text-blue-700 mt-1">
                        Associated PQR ID will be: <span className="font-semibold">PQR-{wpsDocuments ? wpsDocuments.length + 1 : 1}</span>
                      </p>
                    </div>
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
          <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit WPS Document {selectedWps?.wpsId}
              </DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="mb-4 sticky top-0 z-10 bg-background">
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
        
        {/* Add PQR Dialog */}
        <Dialog open={isAddPqrOpen} onOpenChange={setIsAddPqrOpen}>
          <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create PQR for WPS {selectedWps?.wpsId}</DialogTitle>
            </DialogHeader>
            <PqrForm wps={selectedWps} onClose={() => setIsAddPqrOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// PQR Form Component
function PqrForm({ wps, onClose }: { wps: WpsDocument | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pqrDocumentFile, setPqrDocumentFile] = useState<File | null>(null);
  const [selectedWpsId, setSelectedWpsId] = useState<number | null>(wps?.id || null);
  
  // Fetch WPS documents data for selection when no WPS is provided
  const { data: wpsDocuments = [] } = useQuery<WpsDocument[]>({
    queryKey: ["/api/quality/wps"],
    enabled: !wps, // Only fetch if no WPS is provided
  });
  
  // Filter WPS documents that don't already have a PQR
  const availableWps = wpsDocuments ? wpsDocuments.filter(doc => !doc.pqrId) : [];
  
  // Form setup for adding a new PQR document
  const pqrForm = useForm<PqrDocumentFormData>({
    resolver: zodResolver(pqrDocumentSchema),
    defaultValues: {
      testDate: new Date().toISOString().split('T')[0],
      testLaboratory: "",
      testType: "",
      testResults: "",
      status: "Draft",
      remarks: "",
    },
  });
  
  // Handle PQR document file selection
  const handlePqrDocumentFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setPqrDocumentFile(event.target.files[0]);
    }
  };
  
  // Create PQR mutation
  const createPqrMutation = useMutation({
    mutationFn: async (data: PqrDocumentFormData) => {
      // Need either the provided WPS or a selected WPS
      if (!wps && !selectedWpsId) {
        throw new Error("Please select a WPS document");
      }
      
      const formData = new FormData();
      
      // Add WPS ID reference
      formData.append("wpsId", (wps?.id || selectedWpsId || 0).toString());
      
      // Append form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append document file if available
      if (pqrDocumentFile) {
        formData.append("document", pqrDocumentFile);
      }
      
      const response = await fetch("/api/quality/wps/pqr", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create PQR document");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "PQR document created successfully",
      });
      onClose();
      pqrForm.reset();
      setPqrDocumentFile(null);
      setSelectedWpsId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/wps"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating PQR document",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Submit handler for adding a new PQR document
  const onSubmit = (values: PqrDocumentFormData) => {
    createPqrMutation.mutate(values);
  };
  
  return (
    <Form {...pqrForm}>
      <form onSubmit={pqrForm.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="mb-4 sticky top-0 z-10 bg-background">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-4">
            {!wps && (
              <div className="mb-6 border rounded-md p-4 bg-muted/30">
                <h3 className="font-medium mb-2">Select WPS Document</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select a WPS document to create a corresponding PQR. The PQR ID will be linked to match the WPS ID format.
                </p>
                <Select value={selectedWpsId?.toString() || ""} onValueChange={(value) => setSelectedWpsId(parseInt(value))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a WPS document" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWps.length === 0 ? (
                      <SelectItem value="none" disabled>No available WPS documents</SelectItem>
                    ) : (
                      availableWps.map((doc) => {
                        // Extract sequence number from WPS-N format
                        const wpsSequence = doc.wpsId ? doc.wpsId.split("-")[1] : "";
                        return (
                          <SelectItem key={doc.id} value={doc.id.toString()}>
                            {doc.wpsId} → PQR-{wpsSequence} | {doc.welderProcess} {doc.baseMetalGrade}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
                {selectedWpsId ? (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                    <FileText className="inline-block mr-1 h-4 w-4" /> 
                    Selected WPS will be linked with a matching PQR ID sequence.
                  </div>
                ) : (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                    <AlertCircle className="inline-block mr-1 h-4 w-4" />
                    Please select a WPS document to proceed.
                  </div>
                )}
              </div>
            )}
            
            {(wps || (selectedWpsId && selectedWpsId > 0)) && (
              <div className="mb-6 border rounded-md p-4 bg-blue-50 border-blue-100">
                <h3 className="font-medium text-blue-700 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Document Numbering
                </h3>
                <p className="text-sm text-blue-700 mt-2">
                  Creating PQR for WPS: <span className="font-semibold">
                    {wps?.wpsId || 
                     (availableWps && selectedWpsId ? 
                      availableWps.find(doc => doc.id === selectedWpsId)?.wpsId : 
                      "Unknown")}
                  </span>
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  PQR ID will be: <span className="font-semibold">
                    {wps?.pqrId || 
                     (availableWps && selectedWpsId ? 
                      (() => {
                        const selectedWps = availableWps.find(doc => doc.id === selectedWpsId);
                        if (selectedWps?.wpsId) {
                          // Extract sequence number from WPS-N format and create matching PQR-N
                          const wpsSequence = selectedWps.wpsId.split("-")[1];
                          return `PQR-${wpsSequence}`;
                        }
                        return selectedWps?.pqrId || "Unknown";
                      })() : 
                      "Unknown")}
                  </span>
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={pqrForm.control}
                name="testDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={pqrForm.control}
                name="testLaboratory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Laboratory</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. ABC Testing Labs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={pqrForm.control}
                name="testType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Type</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select test type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {testTypeOptions.map((type) => (
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
                control={pqrForm.control}
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
              
              <div className="col-span-2">
                <FormField
                  control={pqrForm.control}
                  name="testResults"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Test Results</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter test results and findings" 
                          rows={4} 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="col-span-2">
                <FormField
                  control={pqrForm.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Any additional notes or remarks" 
                          rows={2} 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="document" className="space-y-4">
            <div>
              <Label htmlFor="pqr_document_file">Upload PQR Document</Label>
              <Input
                id="pqr_document_file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handlePqrDocumentFileChange}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {pqrDocumentFile ? 
                  `Selected file: ${pqrDocumentFile.name}` : 
                  "Select a PDF or image file (.pdf, .jpg, .png)"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Note: The file will be stored with the filename "PQR ID.pdf" in Google Cloud Storage.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createPqrMutation.isPending}>
            {createPqrMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
            ) : (
              "Create PQR"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
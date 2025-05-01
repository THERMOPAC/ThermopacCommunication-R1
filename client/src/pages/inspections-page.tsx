import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  CardFooter 
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, ClipboardCheck, Calendar as CalendarIcon, CheckCircle2, AlertCircle, XCircle, FileText, Hourglass, Loader2, Eye, Edit2, Trash2, X, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Define a schema for a single material row
const materialRowSchema = z.object({
  id: z.number().optional(), // For existing links, optional for new rows
  materialId: z.number().optional(), // Material ID from the database
  materialIdentificationId: z.string().optional(), // MI ID (e.g., "MI-2025-001")
  materialCertificateNumber: z.string().optional(),
  heatNumber: z.string().optional(),
  materialGrade: z.string().optional(),
  materialSpecification: z.string().optional(),
  allocatedQuantity: z.string().optional(),
  quantityUnit: z.string().optional(),
  remarks: z.string().optional(),
});

// Schema for Inspection Order Edit
const inspectionOrderEditSchema = z.object({
  // Basic inspection order info
  title: z.string().min(1, { message: "Title is required" }),
  status: z.string().min(1, { message: "Status is required" }),
  inspectionType: z.string().min(1, { message: "Inspection type is required" }),
  quantity: z.number().positive({ message: "Quantity must be a positive number" }),
  unit: z.string().min(1, { message: "Unit is required" }),
  itemCode: z.string().min(1, { message: "Item code is required" }),
  description: z.string().min(1, { message: "Description is required" }),
  drawingNo: z.string().optional(),
  
  // Material traceability fields - array for multiple materials
  materials: z.array(materialRowSchema).optional(),
  
  // Legacy material fields (keeping for backward compatibility)
  materialCertificateNumber: z.string().optional(),
  heatNumber: z.string().optional(),
  materialGrade: z.string().optional(),
  materialSpecification: z.string().optional(),
  materialSupplier: z.string().optional(),
  
  // Welding fields
  weldingProcedure: z.string().optional(),
  welderId: z.string().optional(),
  numberOfWelds: z.number().optional(),
  weldType: z.string().optional(),
  weldProcess: z.string().optional(),
  weldingNotes: z.string().optional(),
  
  // NDT fields
  ndtMethod: z.string().optional(),
  ndtStandard: z.string().optional(),
  ndtExtent: z.number().optional(),
  ndtTechnician: z.string().optional(),
  ndtDate: z.string().optional(),
  ndtResults: z.string().optional(),
  
  // Visual inspection fields
  visualInspectionStandard: z.string().optional(),
  visualInspector: z.string().optional(),
  dimensionalChecks: z.string().optional(),
  surfaceCondition: z.string().optional(),
  visualInspectionDate: z.string().optional(),
  visualInspectionObservations: z.string().optional(),
  
  // Hydrotest fields
  hydrotestPressure: z.number().optional(),
  hydrotestDuration: z.number().optional(),
  hydrotestMedium: z.string().optional(),
  hydrotestOperator: z.string().optional(),
  hydrotestDate: z.string().optional(),
  hydrotestResult: z.string().optional(),
  hydrotestNotes: z.string().optional(),
  
  // NCR fields
  ncrNumber: z.string().optional(),
  ncrDate: z.string().optional(),
  ncrStatus: z.string().optional(),
  ncrDescription: z.string().optional(),
  ncrDisposition: z.string().optional(),
  ncrCorrectiveAction: z.string().optional(),
  
  // Dossier fields
  dossierNumber: z.string().optional(),
  dossierCompletionDate: z.string().optional(),
  dossierNotes: z.string().optional(),
});

type InspectionOrderEditFormValues = z.infer<typeof inspectionOrderEditSchema>;

// Placeholder schema for Inspection Reports
const inspectionReportSchema = z.object({
  projectId: z.number().positive({ message: "Please select a project" }),
  projectCode: z.string().min(1, { message: "Project code is required" }),
  workOrderId: z.number().optional(),
  reportNumber: z.string().min(1, { message: "Report number is required" }),
  reportType: z.string().min(1, { message: "Report type is required" }),
  title: z.string().min(1, { message: "Title is required" }),
  inspectionDate: z.date({ required_error: "Inspection date is required" }),
  location: z.string().min(1, { message: "Location is required" }),
  inspectorId: z.number(),
  findings: z.string().optional(),
  recommendations: z.string().optional(),
  status: z.string().default("pending"),
  quantityInspected: z.number().min(1, { message: "Quantity inspected is required" }),
  quantityAccepted: z.number().min(0).default(0),
  quantityRejected: z.number().min(0).default(0),
});

type InspectionReportFormValues = z.infer<typeof inspectionReportSchema>;

export default function InspectionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedInspectionOrder, setSelectedInspectionOrder] = useState<number | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInspectionOrder, setEditingInspectionOrder] = useState<number | null>(null);
  const [materialRows, setMaterialRows] = useState<{
    id?: number;
    materialId?: number;
    materialIdentificationId?: string;
    materialCertificateNumber?: string;
    heatNumber?: string;
    materialGrade?: string;
    materialSpecification?: string;
    allocatedQuantity?: string;
    quantityUnit?: string;
    remarks?: string;
  }[]>([]);
  
  // Helper function to add a new material row
  const addMaterialRow = () => {
    const newRows = [...materialRows, {
      materialId: undefined,
      materialIdentificationId: '',
      materialCertificateNumber: '',
      heatNumber: '',
      materialGrade: '',
      materialSpecification: '',
      allocatedQuantity: '',
      quantityUnit: '',
      remarks: ''
    }];
    setMaterialRows(newRows);
    editForm.setValue('materials', newRows);
  };
  
  // Helper function to remove a material row
  const removeMaterialRow = (index: number) => {
    const updatedRows = [...materialRows];
    updatedRows.splice(index, 1);
    setMaterialRows(updatedRows);
    editForm.setValue('materials', updatedRows);
  };
  
  // Helper function to update a material row with selected material data
  const updateMaterialRow = (index: number, material: MaterialIdentification | null) => {
    const updatedRows = [...materialRows];
    
    if (material) {
      updatedRows[index] = {
        ...updatedRows[index],
        materialId: material.id,
        materialIdentificationId: material.material_identification_id,
        materialCertificateNumber: material.mill_test_certificate_number || '',
        heatNumber: material.heat_number || '',
        materialGrade: material.material_grade || '',
        materialSpecification: material.specification || '',
        // Keep user-editable fields
        allocatedQuantity: updatedRows[index].allocatedQuantity || '',
        quantityUnit: updatedRows[index].quantityUnit || '',
        remarks: updatedRows[index].remarks || ''
      };
    } else {
      // Reset the material selection
      updatedRows[index] = {
        ...updatedRows[index],
        materialId: undefined,
        materialIdentificationId: '',
        materialCertificateNumber: '',
        heatNumber: '',
        materialGrade: '',
        materialSpecification: '',
        // Keep user-editable fields
        allocatedQuantity: updatedRows[index].allocatedQuantity || '',
        quantityUnit: updatedRows[index].quantityUnit || '',
        remarks: updatedRows[index].remarks || ''
      };
    }
    
    setMaterialRows(updatedRows);
    editForm.setValue('materials', updatedRows);
  };
  
  // Fetch projects for dropdown
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
  });

  // Fetch inspection reports based on selected project
  const { 
    data: inspections, 
    isLoading: isLoadingInspections,
    refetch: refetchInspections
  } = useQuery({
    queryKey: ['/api/quality/inspections/project', selectedProject],
    enabled: !!selectedProject,
  });

  // Fetch work orders for the selected project
  const { 
    data: workOrders 
  } = useQuery({
    queryKey: ['/api/production/work-orders/project', selectedProject],
    queryFn: async ({ queryKey }) => {
      const [_, projectId] = queryKey;
      if (!projectId) throw new Error("Project ID is required");
      
      const response = await fetch(`/api/production/work-orders/project/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch work orders");
      }
      return response.json();
    },
    enabled: !!selectedProject,
  });
  
  // Fetch inspection orders for the selected project
  const {
    data: inspectionOrders = [],
    isLoading: isLoadingInspectionOrders,
    refetch: refetchInspectionOrders
  } = useQuery<Array<{
    id: number;
    inspectionOrderNumber: string;
    title: string;
    inspectionType: string;
    status: string;
    createdAt: string;
    quantity: number;
    unit: string;
  }>>({
    queryKey: ['/api/quality/inspection-orders/project', selectedProject],
    queryFn: async ({ queryKey }) => {
      const [_, projectId] = queryKey;
      if (!projectId) throw new Error("Project ID is required");
      
      const response = await fetch(`/api/quality/inspection-orders/project/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch inspection orders");
      }
      return response.json();
    },
    enabled: !!selectedProject,
  });
  
  // Define an interface for Material Identification records
  interface MaterialIdentification {
    id: number;
    material_identification_id: string;
    material_description: string;
    material_code: string;
    specification: string;
    material_grade: string;
    heat_number: string;
    batch_number: string | null;
    mill_name: string;
    mill_test_certificate_number: string;
    quantity: string;
    dimensions: string;
    material_status: string;
    project_id: number;
    project_number: string;
    project_name: string;
    inspection_order_number: string;
  }

  // Fetch details for a specific inspection order for editing
  const {
    data: editInspectionOrderDetails,
    isLoading: isLoadingEditDetails,
  } = useQuery<{
    id: number;
    inspectionOrderNumber: string;
    title: string;
    inspectionType: string;
    status: string;
    createdAt: string;
    quantity: number;
    unit: string;
    // Additional fields from our API update
    itemCode?: string;
    description?: string;
    drawingNo?: string;
    uom?: string;
    makeOrBuy?: string;
    sequenceNumber?: number;
    parentInspectionOrderId?: number;
    projectCode?: string;
    projectId?: number;
    creator?: {
      id: number;
      username: string;
    };
    project?: {
      id: number;
      name: string;
    };
    items: Array<{
      id: number;
      itemCode: string;
      description: string;
      quantity: number;
      unit: string;
      status: string;
      drawingNo?: string;
      drawingNumber?: string;
    }>;
    // Materials linked to this inspection order (will be added in future API update)
    materials?: Array<{
      id: number;
      materialId: number;
      materialIdentificationId: string;
      materialCertificateNumber: string;
      heatNumber: string;
      materialGrade: string;
      materialSpecification: string;
      allocatedQuantity?: string;
      quantityUnit?: string;
      remarks?: string;
    }>;
  }>({
    queryKey: ['/api/quality/inspection-orders', editingInspectionOrder],
    queryFn: async ({ queryKey }) => {
      const [_, orderId] = queryKey;
      if (!orderId) throw new Error("Inspection Order ID is required");
      
      const response = await fetch(`/api/quality/inspection-orders/${orderId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch inspection order details");
      }
      return response.json();
    },
    enabled: !!editingInspectionOrder,
  });
  
  // Fetch material identification records for the project of the inspection order being edited
  const {
    data: availableMaterials = [],
    isLoading: isLoadingMaterials,
  } = useQuery<MaterialIdentification[]>({
    queryKey: ['/api/quality/material-identification/project', editInspectionOrderDetails?.projectId],
    queryFn: async ({ queryKey }) => {
      const [_, projectId] = queryKey;
      if (!projectId) throw new Error("Project ID is required");
      
      const response = await fetch(`/api/quality/material-identification/project/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch material identification records");
      }
      return response.json();
    },
    enabled: !!editInspectionOrderDetails?.projectId,
  });

  // Fetch details for a specific inspection order for viewing
  const {
    data: inspectionOrderDetails,
    isLoading: isLoadingOrderDetails,
  } = useQuery<{
    id: number;
    inspectionOrderNumber: string;
    title: string;
    inspectionType: string;
    status: string;
    createdAt: string;
    quantity: number;
    unit: string;
    // Additional fields from our API update
    itemCode?: string;
    description?: string;
    drawingNo?: string;
    uom?: string;
    makeOrBuy?: string;
    sequenceNumber?: number;
    parentInspectionOrderId?: number;
    projectCode?: string;
    creator?: {
      id: number;
      username: string;
    };
    project?: {
      id: number;
      name: string;
    };
    items: Array<{
      id: number;
      itemCode: string;
      description: string;
      quantity: number;
      unit: string;
      status: string;
      drawingNo?: string;
      drawingNumber?: string;
    }>;
  }>({
    queryKey: ['/api/quality/inspection-orders', selectedInspectionOrder],
    queryFn: async ({ queryKey }) => {
      const [_, orderId] = queryKey;
      if (!orderId) throw new Error("Inspection Order ID is required");
      
      const response = await fetch(`/api/quality/inspection-orders/${orderId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch inspection order details");
      }
      return response.json();
    },
    enabled: !!selectedInspectionOrder,
  });
  
  // Query for inspection order preview data
  const { 
    data: previewApiData, 
    isLoading: isLoadingPreview,
    refetch: refetchPreview
  } = useQuery<any>({
    queryKey: ['/api/quality/inspection-orders/preview', selectedProject],
    queryFn: async ({ queryKey }) => {
      const [_, projectId] = queryKey;
      if (!projectId) throw new Error("Project ID is required");
      
      const response = await fetch(`/api/quality/inspection-orders/preview/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch preview data");
      }
      return response.json();
    },
    enabled: false, // We'll trigger this manually
  });
  
  // Reset dialog and generation states
  const resetInspectionOrderGenerationState = () => {
    setIsConfirmDialogOpen(false);
    setIsGeneratingOrders(false);
    setPreviewData(null);
  };

  // Form for creating new inspection report
  const form = useForm<InspectionReportFormValues>({
    resolver: zodResolver(inspectionReportSchema),
    defaultValues: {
      status: "pending",
      inspectorId: user?.id,
      quantityAccepted: 0,
      quantityRejected: 0,
    },
  });

  // Get preview data before generating inspection orders
  const handleGenerateInspectionOrdersClick = async () => {
    if (!selectedProject) return;
    
    try {
      const { data } = await refetchPreview();
      setPreviewData(data);
      setIsConfirmDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not retrieve inspection order preview data",
        variant: "destructive"
      });
    }
  };
  
  // Generate inspection orders for the selected project
  const generateInspectionOrders = async (projectId: number) => {
    if (!projectId || isNaN(projectId)) {
      toast({
        title: "Error",
        description: "Invalid project ID",
        variant: "destructive"
      });
      resetInspectionOrderGenerationState();
      return;
    }

    try {
      setIsGeneratingOrders(true);
      console.log("Generating inspection orders for project ID:", projectId);
      
      const response = await fetch(
        `/api/quality/inspection-orders/generate-for-project/${projectId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            confirm: true
          }),
        }
      );
      
      // Handle empty responses or 204 No Content
      let responseData;
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        responseData = { message: "Inspection orders processed successfully" };
      } else {
        responseData = await response.json();
      }
      
      if (!response.ok) {
        // Handle specific error types
        if (response.status === 409) {
          throw new Error(responseData.details || responseData.error || "Inspection order conflict - try cleaning up existing orders first");
        } else {
          throw new Error(responseData.details || responseData.error || "Failed to generate inspection orders");
        }
      }
      
      // Success message with detailed information
      let description = responseData.message || `Successfully created ${responseData.count || 'multiple'} inspection orders for the project`;
      
      // Show detailed breakdown of what was created
      if (responseData.makeParentCount > 0 || responseData.buyParentCount > 0 || responseData.componentCount > 0) {
        description = `Successfully created ${responseData.count} inspection orders:\n` +
          `${responseData.makeParentCount > 0 ? `- ${responseData.makeParentCount} Make item(s)\n` : ''}` +
          `${responseData.buyParentCount > 0 ? `- ${responseData.buyParentCount} Buy item(s)\n` : ''}` +
          `${responseData.componentCount > 0 ? `- ${responseData.componentCount} Component item(s)` : ''}`;
      }
      
      toast({
        title: "Inspection Orders Generated",
        description: description,
      });
      
      // Refresh the inspection orders list and reset states
      await refetchInspectionOrders();
      resetInspectionOrderGenerationState();
      
    } catch (error: any) {
      console.error("Error generating inspection orders:", error);
      toast({
        title: "Error Generating Inspection Orders",
        description: error.message || "There was an error generating inspection orders for this project. Please try again.",
        variant: "destructive",
      });
      resetInspectionOrderGenerationState();
    }
  };
  
  // Delete an inspection order
  const handleDeleteInspectionOrder = async (orderId: number) => {
    if (!orderId) return;
    
    try {
      const response = await fetch(`/api/quality/inspection-orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete inspection order");
      }
      
      // Success message
      toast({
        title: "Inspection Order Deleted",
        description: "The inspection order has been deleted successfully.",
      });
      
      // Refresh the inspection orders list
      await refetchInspectionOrders();
      
    } catch (error: any) {
      console.error("Error deleting inspection order:", error);
      toast({
        title: "Error Deleting Inspection Order",
        description: error.message || "There was an error deleting the inspection order. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Form for editing inspection order
  const editForm = useForm<InspectionOrderEditFormValues>({
    resolver: zodResolver(inspectionOrderEditSchema),
    defaultValues: {
      title: "",
      status: "",
      inspectionType: "",
      quantity: 0,
      unit: "",
      itemCode: "",
      description: "",
      drawingNo: "",
      materials: [], // Initialize with empty array for materials
    }
  });

  // Update material rows when the inspection order details are loaded
  useEffect(() => {
    if (editInspectionOrderDetails?.materials && editInspectionOrderDetails.materials.length > 0) {
      // Convert the API material data to our material rows format
      const materials = editInspectionOrderDetails.materials.map(material => ({
        id: material.id,
        materialId: material.materialId,
        materialIdentificationId: material.materialIdentificationId,
        materialCertificateNumber: material.materialCertificateNumber,
        heatNumber: material.heatNumber,
        materialGrade: material.materialGrade,
        materialSpecification: material.materialSpecification,
        allocatedQuantity: material.allocatedQuantity || '',
        quantityUnit: material.quantityUnit || '',
        remarks: material.remarks || ''
      }));
      
      setMaterialRows(materials);
      // Set the form materials value directly here
      editForm.setValue('materials', materials);
    } else {
      setMaterialRows([]);
      editForm.setValue('materials', []);
    }
  }, [editInspectionOrderDetails, editForm]);
  
  // Helper function to sync material rows with form
  const syncMaterialRowsWithForm = () => {
    editForm.setValue('materials', materialRows);
  };

  // Update form values when inspection order details are loaded
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Get the item code and description from the first item if available
      const firstItem = editInspectionOrderDetails.items && editInspectionOrderDetails.items.length > 0 
        ? editInspectionOrderDetails.items[0] 
        : null;
        
      // Use the database UOM field for unit
      const unitValue = editInspectionOrderDetails.uom || editInspectionOrderDetails.unit || (firstItem ? firstItem.unit : "");
      
      // Use drawingNumber from the details or first item
      const drawingNumber = editInspectionOrderDetails.drawingNumber || 
                           editInspectionOrderDetails.drawingNo || 
                           (firstItem && firstItem.drawingNumber) || 
                           (firstItem && firstItem.drawingNo) || 
                           "";
        
      editForm.reset({
        title: editInspectionOrderDetails.title,
        status: editInspectionOrderDetails.status,
        inspectionType: editInspectionOrderDetails.inspectionType,
        quantity: editInspectionOrderDetails.quantity,
        unit: unitValue,
        // Use properties from the inspection order details or its first item
        itemCode: editInspectionOrderDetails.itemCode || (firstItem ? firstItem.itemCode : ""),
        description: editInspectionOrderDetails.description || (firstItem ? firstItem.description : ""),
        drawingNo: drawingNumber,
        // Set legacy material fields
        materialCertificateNumber: editInspectionOrderDetails.materialCertificateNumber || '',
        heatNumber: editInspectionOrderDetails.heatNumber || '',
        materialGrade: editInspectionOrderDetails.materialGrade || '',
        materialSpecification: editInspectionOrderDetails.materialSpecification || '',
        materialSupplier: editInspectionOrderDetails.materialSupplier || '',
        // Initialize the materials array with any existing materials
        materials: editInspectionOrderDetails.materials || [],
      });
    }
  }, [editInspectionOrderDetails, editForm]);

  // Handle inspection order update
  const handleUpdateInspectionOrder = async (data: InspectionOrderEditFormValues) => {
    if (!editingInspectionOrder) return;
    
    try {
      const response = await fetch(`/api/quality/inspection-orders/${editingInspectionOrder}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update inspection order");
      }
      
      // Success message
      toast({
        title: "Inspection Order Updated",
        description: "The inspection order has been updated successfully.",
      });
      
      // Close edit dialog and refresh the inspection orders list
      setIsEditDialogOpen(false);
      setEditingInspectionOrder(null);
      await refetchInspectionOrders();
      
    } catch (error: any) {
      console.error("Error updating inspection order:", error);
      toast({
        title: "Error Updating Inspection Order",
        description: error.message || "There was an error updating the inspection order. Please try again.",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: InspectionReportFormValues) => {
    try {
      // This would call the API
      console.log("Would submit inspection report:", data);
      
      toast({
        title: "Inspection Report Created",
        description: "Inspection report has been created successfully.",
      });
      
      setIsCreateDialogOpen(false);
      if (selectedProject) {
        refetchInspections();
      }
    } catch (error) {
      console.error("Error creating inspection report:", error);
      toast({
        title: "Error Creating Inspection Report",
        description: "There was an error creating the inspection report. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Helper function to render status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Pending</Badge>;
      case "passed":
        return <Badge className="flex items-center gap-1 bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3" /> Passed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      case "conditionally_passed":
        return <Badge className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600"><AlertCircle className="h-3 w-3" /> Conditional</Badge>;
      case "in_progress":
        return <Badge className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600"><Hourglass className="h-3 w-3" /> In Progress</Badge>;
      case "completed":
        return <Badge className="flex items-center gap-1 bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Quality Inspections | Thermopac</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Quality Inspections</h1>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)} 
            className="bg-gradient-to-r from-green-600 to-teal-600"
          >
            <Plus className="mr-2 h-4 w-4" /> Create Inspection Report
          </Button>
        </div>
        
        {/* Inspection Orders Preview Dialog */}
        <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>Inspection Orders Preview</DialogTitle>
              <DialogDescription>
                Review the inspection orders that will be generated for the project.
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingPreview ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : previewData && previewData.items && previewData.items.length > 0 ? (
              <>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">
                      This will generate {previewData.totalOrderCount || previewData.items?.length} individual inspection orders
                      for project {previewData.project?.code || ''}:
                    </p>
                    {previewData.makeParentCount > 0 && (
                      <div>- {previewData.makeParentCount} Make item order{previewData.makeParentCount > 1 ? 's' : ''} with format: {previewData.makeInspectionOrderNumber}</div>
                    )}
                    {previewData.buyParentCount > 0 && (
                      <div>- {previewData.buyParentCount} Buy item order{previewData.buyParentCount > 1 ? 's' : ''} with format: {previewData.buyInspectionOrderNumber}</div>
                    )}
                    {previewData.componentCount > 0 && (
                      <div>- {previewData.componentCount} Component item order{previewData.componentCount > 1 ? 's' : ''} with format: {previewData.componentInspectionOrderNumber}</div>
                    )}
                    <p className="mt-2">Please review the items below before confirming.</p>
                  </AlertDescription>
                </Alert>
                
                <div className="overflow-y-auto max-h-[400px]">
                  <div className="space-y-6">
                    {/* Make Items Group */}
                    {previewData.makeParentCount > 0 && (
                      <div>
                        <h3 className="font-medium text-md pb-2 border-b mb-2 flex items-center">
                          <Badge className="mr-2 bg-green-600">Make</Badge> 
                          Make Items ({previewData.makeParentCount})
                          <div className="ml-2 text-sm text-muted-foreground">Order #: {previewData.makeInspectionOrderNumber}</div>
                        </h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Seq #</TableHead>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead>Type</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.items
                              .filter((item: any) => item.makeOrBuy === 'Make' && item.itemType === 'Parent')
                              .map((item: any, index: number) => (
                                <TableRow key={`make-${index}`}>
                                  <TableCell>{item.sequenceNumber}</TableCell>
                                  <TableCell className="font-medium">{item.itemCode}</TableCell>
                                  <TableCell>{item.description}</TableCell>
                                  <TableCell>{item.quantity} {item.unit}</TableCell>
                                  <TableCell><Badge className="bg-blue-500">Parent</Badge></TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Buy Items Group */}
                    {previewData.buyParentCount > 0 && (
                      <div>
                        <h3 className="font-medium text-md pb-2 border-b mb-2 flex items-center">
                          <Badge className="mr-2 bg-yellow-600">Buy</Badge> 
                          Buy Items ({previewData.buyParentCount})
                          <div className="ml-2 text-sm text-muted-foreground">Order #: {previewData.buyInspectionOrderNumber}</div>
                        </h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Seq #</TableHead>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead>Type</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.items
                              .filter((item: any) => item.makeOrBuy === 'Buy' && item.itemType === 'Parent')
                              .map((item: any, index: number) => (
                                <TableRow key={`buy-${index}`}>
                                  <TableCell>{item.sequenceNumber}</TableCell>
                                  <TableCell className="font-medium">{item.itemCode}</TableCell>
                                  <TableCell>{item.description}</TableCell>
                                  <TableCell>{item.quantity} {item.unit}</TableCell>
                                  <TableCell><Badge className="bg-blue-500">Parent</Badge></TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Component Items Group */}
                    {previewData.componentCount > 0 && (
                      <div>
                        <h3 className="font-medium text-md pb-2 border-b mb-2 flex items-center">
                          <Badge className="mr-2 bg-purple-600">Component</Badge> 
                          Component Items ({previewData.componentCount})
                          <div className="ml-2 text-sm text-muted-foreground">Order #: {previewData.componentInspectionOrderNumber}</div>
                        </h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Seq #</TableHead>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead>Parent Item</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewData.items
                              .filter((item: any) => item.itemType === 'Child')
                              .map((item: any, index: number) => (
                                <TableRow key={`component-${index}`}>
                                  <TableCell>{item.sequenceNumber}</TableCell>
                                  <TableCell className="font-medium">{item.itemCode}</TableCell>
                                  <TableCell>{item.description}</TableCell>
                                  <TableCell>{item.quantity} {item.unit}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{item.parentItemCode || 'N/A'}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
                
                <DialogFooter className="mt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetInspectionOrderGenerationState();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedProject) {
                        generateInspectionOrders(selectedProject);
                      }
                    }}
                    disabled={isGeneratingOrders}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
                  >
                    {isGeneratingOrders ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Confirm & Generate"
                    )}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No items available for inspection order generation.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetInspectionOrderGenerationState();
                  }}
                  className="mt-4"
                >
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>Inspection Reports</CardTitle>
            <CardDescription>
              Manage quality inspections, findings, and compliance reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <Label htmlFor="project-filter">Select Project</Label>
              <Select 
                onValueChange={(value) => setSelectedProject(parseInt(value))}
                disabled={isLoadingProjects}
              >
                <SelectTrigger className="w-full md:w-[300px]">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.code}: {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedProject ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <ClipboardCheck className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Project Selected</h3>
                <p className="text-muted-foreground mt-2">
                  Please select a project to view or create inspection reports.
                </p>
              </div>
            ) : isLoadingInspections ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : inspections?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <ClipboardCheck className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Inspection Reports Found</h3>
                <p className="text-muted-foreground mt-2">
                  There are no inspection reports for this project yet. Create your first one!
                </p>
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)} 
                  variant="outline" 
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create Inspection Report
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>
                    Showing {Array.isArray(inspections) ? inspections.filter((i: any) => i.reportType !== 'work_order').length : 0} inspection reports
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Report #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(inspections) && inspections
                      .filter((inspection: any) => inspection.reportType !== 'work_order')
                      .map((inspection: any) => (
                        <TableRow key={inspection.id}>
                          <TableCell className="font-medium">
                            {inspection.reportNumber}
                          </TableCell>
                          <TableCell>{inspection.title}</TableCell>
                          <TableCell>{inspection.reportType}</TableCell>
                          <TableCell>
                            {inspection.inspectionDate && format(new Date(inspection.inspectionDate), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(inspection.status)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <FileText className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Inspection Orders</CardTitle>
              <CardDescription>
                Manage and track inspection orders for quality checks during production.
              </CardDescription>
            </div>
            {selectedProject && (
              <Button
                onClick={handleGenerateInspectionOrdersClick}
                disabled={isGeneratingOrders || isLoadingPreview}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
              >
                <Plus className="mr-2 h-4 w-4" /> Generate Inspection Orders
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedProject ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <ClipboardCheck className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Project Selected</h3>
                <p className="text-muted-foreground mt-2">
                  Please select a project to view or generate inspection orders.
                </p>
              </div>
            ) : isLoadingInspectionOrders ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : inspectionOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <ClipboardCheck className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Inspection Orders Found</h3>
                <p className="text-muted-foreground mt-2">
                  There are no inspection orders for this project yet. Generate inspection orders using the button above.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>Inspection orders for the selected project.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date Created</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspectionOrders.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.inspectionOrderNumber}</TableCell>
                        <TableCell>{order.title}</TableCell>
                        <TableCell>{order.inspectionType}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>{format(new Date(order.createdAt), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{order.quantity} {order.unit}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedInspectionOrder(order.id);
                                setIsDetailsDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setEditingInspectionOrder(order.id);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-1" /> Edit
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteInspectionOrder(order.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" /> Delete
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
      </div>

      {/* Inspection Order Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inspection Order Details</DialogTitle>
            <DialogDescription>
              View detailed information about this inspection order.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingOrderDetails ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : inspectionOrderDetails ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Order Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm font-medium">Order Number:</div>
                      <div className="text-sm">{inspectionOrderDetails.inspectionOrderNumber}</div>
                      
                      <div className="text-sm font-medium">Title:</div>
                      <div className="text-sm">{inspectionOrderDetails.title}</div>
                      
                      <div className="text-sm font-medium">Status:</div>
                      <div className="text-sm">{getStatusBadge(inspectionOrderDetails.status)}</div>
                      
                      <div className="text-sm font-medium">Type:</div>
                      <div className="text-sm">{inspectionOrderDetails.inspectionType}</div>
                      
                      <div className="text-sm font-medium">Quantity:</div>
                      <div className="text-sm">{inspectionOrderDetails.quantity} {inspectionOrderDetails.unit}</div>
                      
                      <div className="text-sm font-medium">Date Created:</div>
                      <div className="text-sm">{format(new Date(inspectionOrderDetails.createdAt), 'dd MMM yyyy')}</div>
                      
                      <div className="text-sm font-medium">Created By:</div>
                      <div className="text-sm">{inspectionOrderDetails?.creator?.username || 'N/A'}</div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Project Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm font-medium">Project:</div>
                      <div className="text-sm">{inspectionOrderDetails?.project?.name || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Project Code:</div>
                      <div className="text-sm">{inspectionOrderDetails?.projectCode || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Item Code:</div>
                      <div className="text-sm">{inspectionOrderDetails?.itemCode || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Description:</div>
                      <div className="text-sm">{inspectionOrderDetails?.description || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Make/Buy:</div>
                      <div className="text-sm">{inspectionOrderDetails?.makeOrBuy || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Sequence Number:</div>
                      <div className="text-sm">{inspectionOrderDetails?.sequenceNumber || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Parent Order:</div>
                      <div className="text-sm">{inspectionOrderDetails?.parentInspectionOrderId ? 'Yes' : 'No (Parent Item)'}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {inspectionOrderDetails.items && inspectionOrderDetails.items.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Child Components</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inspectionOrderDetails.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.inspectionOrderNumber}</TableCell>
                            <TableCell>{item.itemCode}</TableCell>
                            <TableCell>{item.description}</TableCell>
                            <TableCell>{item.quantity} {item.unit}</TableCell>
                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
              
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsDetailsDialogOpen(false);
                    setSelectedInspectionOrder(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    // Future implementation: Allow editing the inspection order
                    toast({
                      title: "Feature coming soon",
                      description: "Editing inspection orders will be available in a future update.",
                    });
                  }}
                >
                  Update Status
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-medium">Error Loading Details</h3>
              <p className="text-muted-foreground text-center mt-2">
                Could not load inspection order details. The order may have been deleted or you may not have permission to view it.
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setIsDetailsDialogOpen(false);
                  setSelectedInspectionOrder(null);
                }}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Edit Inspection Order Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-7xl w-11/12 max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Edit Inspection Order</DialogTitle>
            <DialogDescription>
              Update the details of this inspection order.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingEditDetails ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : editInspectionOrderDetails ? (
            <ScrollArea className="h-[calc(95vh-14rem)] overflow-auto px-6">
              <div className="pb-6">
                  <Form {...editForm}>
                    <form onSubmit={editForm.handleSubmit(handleUpdateInspectionOrder)} className="space-y-4 mb-6">
                <div className="grid grid-cols-12 gap-4">
                  {/* First line: Item Code, Description, and Drawing No with custom widths */}
                  <div className="col-span-3">
                    <FormField
                      control={editForm.control}
                      name="itemCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Item Code</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              readOnly
                              className="bg-gray-50"
                              placeholder="Item code" 
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Read-only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-6">
                    <FormField
                      control={editForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              readOnly
                              className="bg-gray-50"
                              placeholder="Item description" 
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Read-only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-3">
                    <FormField
                      control={editForm.control}
                      name="drawingNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Drawing No.</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              readOnly
                              className="bg-gray-50"
                              placeholder="Drawing number" 
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Read-only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-12 gap-4">
                  {/* Second line: Quantity, Unit, and Status */}
                  <div className="col-span-3">
                    <FormField
                      control={editForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              readOnly
                              className="bg-gray-50"
                              placeholder="Quantity" 
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Read-only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-3">
                    <FormField
                      control={editForm.control}
                      name="unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              readOnly
                              className="bg-gray-50"
                              placeholder="Unit of measurement" 
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Read-only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-6">
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
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="passed">Passed</SelectItem>
                              <SelectItem value="failed">Failed</SelectItem>
                              <SelectItem value="conditionally_passed">Conditionally Passed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-12 gap-4">
                  {/* Third line: Title and Inspection Type */}
                  <div className="col-span-6">
                    <FormField
                      control={editForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter order title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-6">
                    <FormField
                      control={editForm.control}
                      name="inspectionType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inspection Type</FormLabel>
                          <Select 
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select inspection type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="incoming">Incoming</SelectItem>
                              <SelectItem value="in_process">In-Process</SelectItem>
                              <SelectItem value="final">Final</SelectItem>
                              <SelectItem value="vendor">Vendor</SelectItem>
                              <SelectItem value="customer">Customer</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                {/* Inspection Tabs */}
                <Tabs defaultValue="material" className="w-full mt-6">
                  <ScrollArea className="w-full whitespace-nowrap">
                    <TabsList className="flex w-full space-x-2">
                      <TabsTrigger value="material">Material Traceability</TabsTrigger>
                      <TabsTrigger value="welding">Welding & Weld Maps</TabsTrigger>
                      <TabsTrigger value="ndt">NDT</TabsTrigger>
                      <TabsTrigger value="visual">Visual Inspection</TabsTrigger>
                      <TabsTrigger value="hydrotest">Hydrotest</TabsTrigger>
                      <TabsTrigger value="non-conformance">Non-Conformance</TabsTrigger>
                      <TabsTrigger value="final-dossier">Final Dossier</TabsTrigger>
                    </TabsList>
                  </ScrollArea>
                  
                  {/* Material Traceability Tab */}
                  <TabsContent value="material" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Material Traceability</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={addMaterialRow}
                          className="flex items-center"
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Material
                        </Button>
                      </div>
                      
                      {/* Legacy single material fields (keeping for backward compatibility) */}
                      {materialRows.length === 0 && (
                        <div className="grid grid-cols-12 gap-4 mb-6 border-b pb-4">
                          <div className="col-span-12">
                            <p className="text-sm text-muted-foreground mb-2">Legacy Material Information:</p>
                          </div>
                          <div className="col-span-6">
                            <FormField
                              control={editForm.control}
                              name="materialCertificateNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Material Certificate Number</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter certificate number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-6">
                            <FormField
                              control={editForm.control}
                              name="heatNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Heat Number</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter heat number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-4">
                            <FormField
                              control={editForm.control}
                              name="materialGrade"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Material Grade</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter material grade" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-4">
                            <FormField
                              control={editForm.control}
                              name="materialSpecification"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Material Specification</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter specification" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-4">
                            <FormField
                              control={editForm.control}
                              name="materialSupplier"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Material Supplier</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Enter supplier name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-12">
                            <div className="flex items-center gap-2 mt-4">
                              <Button type="button" variant="outline" size="sm">
                                <FileText className="h-4 w-4 mr-2" />
                                Upload Certificate
                              </Button>
                              <Button type="button" variant="outline" size="sm">
                                <Eye className="h-4 w-4 mr-2" />
                                View Attachments
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Material rows with dynamic row addition functionality */}
                      {materialRows.length > 0 ? (
                        <div className="space-y-6">
                          {materialRows.map((materialRow, index) => (
                            <div key={index} className="border rounded-md p-4 relative mb-4">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon"
                                className="absolute top-2 right-2 text-red-500 hover:text-red-700 hover:bg-red-100"
                                onClick={() => removeMaterialRow(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              
                              {/* All fields in one horizontal row with specific widths */}
                              <div className="flex flex-nowrap overflow-auto">
                                {/* Material Identification (MI ID) - 120px */}
                                <div className="me-2" style={{width: "120px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`material-id-${index}`} className="text-xs">Material ID</Label>
                                    <Select
                                      value={materialRow.materialId?.toString() || ""}
                                      onValueChange={(value) => {
                                        const selectedMaterial = availableMaterials.find(m => m.id === parseInt(value));
                                        updateMaterialRow(index, selectedMaterial || null);
                                      }}
                                    >
                                      <SelectTrigger id={`material-id-${index}`} className="h-9 w-full">
                                        <SelectValue placeholder="Select MI ID" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {isLoadingMaterials ? (
                                          <div className="flex items-center justify-center p-2">
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Loading materials...
                                          </div>
                                        ) : availableMaterials.length === 0 ? (
                                          <div className="p-2 text-center text-sm text-muted-foreground">
                                            No materials available
                                          </div>
                                        ) : (
                                          availableMaterials.map((material) => (
                                            <SelectItem key={material.id} value={material.id.toString()}>
                                              {material.material_identification_id}
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                
                                {/* Certificate Number - 120px */}
                                <div className="me-2" style={{width: "120px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`certificate-number-${index}`} className="text-xs">Certificate #</Label>
                                    <Input
                                      id={`certificate-number-${index}`}
                                      value={materialRow.materialCertificateNumber || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          materialCertificateNumber: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                      }}
                                      placeholder="Certificate #"
                                      className="bg-gray-50 h-9 w-full"
                                      readOnly
                                    />
                                  </div>
                                </div>
                                
                                {/* Heat Number - 100px */}
                                <div className="me-2" style={{width: "100px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`heat-number-${index}`} className="text-xs">Heat #</Label>
                                    <Input
                                      id={`heat-number-${index}`}
                                      value={materialRow.heatNumber || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          heatNumber: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                      }}
                                      placeholder="Heat #"
                                      className="bg-gray-50 h-9 w-full"
                                      readOnly
                                    />
                                  </div>
                                </div>
                                
                                {/* Material Grade - 100px */}
                                <div className="me-2" style={{width: "100px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`material-grade-${index}`} className="text-xs">Grade</Label>
                                    <Input
                                      id={`material-grade-${index}`}
                                      value={materialRow.materialGrade || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          materialGrade: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                      }}
                                      placeholder="Grade"
                                      className="bg-gray-50 h-9 w-full"
                                      readOnly
                                    />
                                  </div>
                                </div>
                                
                                {/* Material Specification - 120px */}
                                <div className="me-2" style={{width: "120px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`material-spec-${index}`} className="text-xs">Spec</Label>
                                    <Input
                                      id={`material-spec-${index}`}
                                      value={materialRow.materialSpecification || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          materialSpecification: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                      }}
                                      placeholder="Specification"
                                      className="bg-gray-50 h-9 w-full"
                                      readOnly
                                    />
                                  </div>
                                </div>
                                
                                {/* Allocated Quantity - 100px */}
                                <div className="me-2" style={{width: "100px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`quantity-${index}`} className="text-xs">Qty</Label>
                                    <Input
                                      id={`quantity-${index}`}
                                      value={materialRow.allocatedQuantity || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          allocatedQuantity: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                        editForm.setValue('materials', updatedRows);
                                      }}
                                      placeholder="Quantity"
                                      className="h-9 w-full"
                                      type="number"
                                    />
                                  </div>
                                </div>
                                
                                {/* Unit - 80px */}
                                <div className="me-2" style={{width: "80px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`unit-${index}`} className="text-xs">Unit</Label>
                                    <Input
                                      id={`unit-${index}`}
                                      value={materialRow.quantityUnit || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          quantityUnit: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                        editForm.setValue('materials', updatedRows);
                                      }}
                                      placeholder="Unit"
                                      className="h-9 w-full"
                                    />
                                  </div>
                                </div>
                                
                                {/* Remarks - 140px */}
                                <div className="me-2" style={{width: "140px"}}>
                                  <div className="space-y-1">
                                    <Label htmlFor={`remarks-${index}`} className="text-xs">Remarks</Label>
                                    <Input
                                      id={`remarks-${index}`}
                                      value={materialRow.remarks || ''}
                                      onChange={(e) => {
                                        const updatedRows = [...materialRows];
                                        updatedRows[index] = {
                                          ...updatedRows[index],
                                          remarks: e.target.value
                                        };
                                        setMaterialRows(updatedRows);
                                        editForm.setValue('materials', updatedRows);
                                      }}
                                      placeholder="Notes"
                                      className="h-9 w-full"
                                    />
                                  </div>
                                </div>
                                
                                {/* Actions - Edit/Delete */}
                                <div style={{width: "80px"}}>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Actions</Label>
                                    <div className="flex space-x-1 h-9 items-center">
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        onClick={() => {
                                          // Edit functionality can be added here if needed
                                          // Currently, editing is already possible directly in the fields
                                        }}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        onClick={() => removeMaterialRow(index)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 border rounded-md mt-4">
                          <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                          <p className="mt-2 text-muted-foreground">
                            No materials linked to this inspection order.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Click "Add Material" to link materials from Material Identification module.
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Welding & Weld Maps Tab */}
                  <TabsContent value="welding" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Welding & Weld Maps</h3>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="weldingProcedure"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Welding Procedure Specification (WPS)</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter WPS reference" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="welderId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Welder ID / Name</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter welder ID" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="numberOfWelds"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Number of Welds</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" min="0" placeholder="Enter number of welds" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="weldType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Weld Type</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select weld type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="butt">Butt Weld</SelectItem>
                                    <SelectItem value="fillet">Fillet Weld</SelectItem>
                                    <SelectItem value="spot">Spot Weld</SelectItem>
                                    <SelectItem value="seam">Seam Weld</SelectItem>
                                    <SelectItem value="lap">Lap Weld</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="weldProcess"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Weld Process</FormLabel>
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
                                    <SelectItem value="smaw">SMAW (Shielded Metal Arc Welding)</SelectItem>
                                    <SelectItem value="gtaw">GTAW (TIG Welding)</SelectItem>
                                    <SelectItem value="gmaw">GMAW (MIG Welding)</SelectItem>
                                    <SelectItem value="fcaw">FCAW (Flux-Cored Arc Welding)</SelectItem>
                                    <SelectItem value="saw">SAW (Submerged Arc Welding)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="weldingNotes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Welding Notes & Observations</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Enter welding notes and observations" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-2" />
                              Upload Weld Map
                            </Button>
                            <Button type="button" variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Attachments
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* NDT Tab */}
                  <TabsContent value="ndt" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Non-Destructive Testing (NDT)</h3>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="ndtMethod"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NDT Method</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select NDT method" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="rt">RT (Radiographic Testing)</SelectItem>
                                    <SelectItem value="ut">UT (Ultrasonic Testing)</SelectItem>
                                    <SelectItem value="mt">MT (Magnetic Particle Testing)</SelectItem>
                                    <SelectItem value="pt">PT (Penetrant Testing)</SelectItem>
                                    <SelectItem value="et">ET (Eddy Current Testing)</SelectItem>
                                    <SelectItem value="vt">VT (Visual Testing)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="ndtStandard"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NDT Standard</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter applicable standard" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="ndtExtent"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Extent of Examination (%)</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" min="0" max="100" placeholder="Enter percentage" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="ndtTechnician"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NDT Technician</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter technician name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="ndtDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NDT Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="ndtResults"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NDT Results & Findings</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Enter NDT results and findings" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-2" />
                              Upload NDT Reports
                            </Button>
                            <Button type="button" variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Reports
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Visual Inspection Tab */}
                  <TabsContent value="visual" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Visual Inspection</h3>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="visualInspectionStandard"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Inspection Standard</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter applicable standard" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="visualInspector"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Inspector Name</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter inspector name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="dimensionalChecks"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dimensional Checks</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select result" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="acceptable">Acceptable</SelectItem>
                                    <SelectItem value="notAcceptable">Not Acceptable</SelectItem>
                                    <SelectItem value="conditionallyAcceptable">Conditionally Acceptable</SelectItem>
                                    <SelectItem value="notApplicable">Not Applicable</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="surfaceCondition"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Surface Condition</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select condition" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="acceptable">Acceptable</SelectItem>
                                    <SelectItem value="notAcceptable">Not Acceptable</SelectItem>
                                    <SelectItem value="conditionallyAcceptable">Conditionally Acceptable</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="visualInspectionDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Inspection Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="visualInspectionObservations"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Observations & Findings</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Enter visual inspection observations" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-2" />
                              Upload Photos
                            </Button>
                            <Button type="button" variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Photos
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Hydrotest Tab */}
                  <TabsContent value="hydrotest" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Hydrotest</h3>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="hydrotestPressure"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Test Pressure (bar)</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" step="0.1" min="0" placeholder="Enter test pressure" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="hydrotestDuration"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Test Duration (minutes)</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" min="0" placeholder="Enter test duration" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="hydrotestMedium"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Test Medium</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select medium" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="water">Water</SelectItem>
                                    <SelectItem value="air">Air</SelectItem>
                                    <SelectItem value="nitrogen">Nitrogen</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="hydrotestOperator"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Test Operator</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter operator name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="hydrotestDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Test Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="hydrotestResult"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Test Result</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select result" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="pass">Pass</SelectItem>
                                    <SelectItem value="fail">Fail</SelectItem>
                                    <SelectItem value="conditionalPass">Conditional Pass</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="hydrotestNotes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Notes & Observations</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Enter hydrotest notes and observations" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-2" />
                              Upload Hydrotest Certificate
                            </Button>
                            <Button type="button" variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Certificate
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Non-Conformance Tab */}
                  <TabsContent value="non-conformance" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Non-Conformance Report</h3>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="ncrNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NCR Number</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter NCR number" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="ncrDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NCR Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-4">
                          <FormField
                            control={editForm.control}
                            name="ncrStatus"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NCR Status</FormLabel>
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
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                    <SelectItem value="pending">Pending Approval</SelectItem>
                                    <SelectItem value="void">Void</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="ncrDescription"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Non-Conformance Description</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Describe the non-conformance" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="ncrDisposition"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Disposition / Corrective Action</FormLabel>
                                <Select 
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select disposition" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="rework">Rework</SelectItem>
                                    <SelectItem value="repair">Repair</SelectItem>
                                    <SelectItem value="useAsIs">Use As Is</SelectItem>
                                    <SelectItem value="scrap">Scrap / Reject</SelectItem>
                                    <SelectItem value="return">Return to Vendor</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="ncrCorrectiveAction"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Corrective Action Description</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Describe the corrective action taken" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-2" />
                              Upload NCR Documents
                            </Button>
                            <Button type="button" variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Documents
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Final Dossier Tab */}
                  <TabsContent value="final-dossier" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Final Documentation Dossier</h3>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="dossierNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dossier Number</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Enter dossier number" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="dossierCompletionDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Completion Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <h4 className="text-md font-medium mb-2">Documentation Checklist</h4>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox id="materialCerts" />
                              <Label htmlFor="materialCerts">Material Certificates</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="weldingDocs" />
                              <Label htmlFor="weldingDocs">Welding Documentation</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="ndtReports" />
                              <Label htmlFor="ndtReports">NDT Reports</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="hydroCerts" />
                              <Label htmlFor="hydroCerts">Hydrotest Certificates</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="dimReports" />
                              <Label htmlFor="dimReports">Dimensional Reports</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="ncrReports" />
                              <Label htmlFor="ncrReports">NCR Reports</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="inspectionReports" />
                              <Label htmlFor="inspectionReports">Final Inspection Reports</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox id="coa" />
                              <Label htmlFor="coa">Certificate of Conformity</Label>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-12">
                          <FormField
                            control={editForm.control}
                            name="dossierNotes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dossier Notes</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Enter notes about the documentation dossier" rows={3} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-12">
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-2" />
                              Upload Dossier
                            </Button>
                            <Button type="button" variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              View Dossier
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                
                <div className="flex justify-end gap-4 mt-8">
                  <Button 
                    variant="outline" 
                    type="button"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingInspectionOrder(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    Update Inspection Order
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-64">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-lg font-medium">Error Loading Details</h3>
              <p className="text-muted-foreground text-center mt-2">
                Could not load inspection order details. The order may have been deleted or you may not have permission to view it.
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingInspectionOrder(null);
                }}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Create Inspection Report Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create New Inspection Report</DialogTitle>
            <DialogDescription>
              Create a new quality inspection report for tracking and analysis.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Information</TabsTrigger>
                  <TabsTrigger value="details">Inspection Details</TabsTrigger>
                  <TabsTrigger value="findings">Findings & Results</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-6 pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="projectId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            defaultValue={selectedProject?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a project" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {projects?.map((project: any) => (
                                <SelectItem key={project.id} value={project.id.toString()}>
                                  {project.code}: {project.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                {/* Other tabs would go here */}
                <TabsContent value="details" className="pt-6">
                  <div className="p-6 text-center text-muted-foreground border rounded-md">
                    This section is under development.
                  </div>
                </TabsContent>
                
                <TabsContent value="findings" className="pt-6">
                  <div className="p-6 text-center text-muted-foreground border rounded-md">
                    This section is under development.
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Inspection Report</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
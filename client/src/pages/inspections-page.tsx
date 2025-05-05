import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { Check, Edit, Trash, Eye, Plus, ClipboardCheck, Calendar as CalendarIcon, CheckCircle2, AlertCircle, XCircle, FileText, Hourglass, Loader2, Edit2, Pencil, Trash2, X, FileCheck, BarChart3, ListChecks, FileOutput, Download, Upload, Filter, Search } from "lucide-react";
import InspectionDocumentUpload from "@/components/inspection-document-upload";
import InspectionDocumentViewer from "@/components/inspection-document-viewer";
import { FinalDossierDebugButton } from "@/components/final-dossier-debug-button";
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent, 
  ChartLegend, 
  ChartLegendContent 
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
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
  description: z.string().optional(),
});

// Define a schema for NDT records
const ndtRecordSchema = z.object({
  id: z.string(),
  ndtMethod: z.string(),
  ndtStandard: z.string(),
  ndtExtent: z.string(),
  ndtTechnician: z.string().optional(),
  ndtDate: z.string().optional(),
  ndtResults: z.string(),
});

// Define a schema for NCR records
const ncrRecordSchema = z.object({
  id: z.string(),
  ncrDate: z.string().optional(),
  ncrStatus: z.string(),
  ncrDescription: z.string().optional(),
  ncrDisposition: z.string(),
  ncrCorrectiveAction: z.string().optional(),
});

// Schema for Inspection Order Edit
const inspectionOrderEditSchema = z.object({
  // Basic inspection order info
  inspectionOrderNumber: z.string().optional(), // Inspection Order Number (read-only)
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
  
  // NDT records - array for multiple NDT records
  ndtRecords: z.array(ndtRecordSchema).optional(),
  
  // Legacy NDT fields (keeping for backward compatibility)
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
  
  // NCR records - array for multiple NCR records
  ncrRecords: z.array(ncrRecordSchema).optional(),
  
  // Legacy NCR fields (keeping for backward compatibility)
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
  const [showNcrDocuments, setShowNcrDocuments] = useState(false);
  const [showDossierDocuments, setShowDossierDocuments] = useState(false);
  
  // State for final dossier generation
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [isCheckingDossier, setIsCheckingDossier] = useState(false);
  const [dossierUrl, setDossierUrl] = useState<string | null>(null);
  
  // Inspection Orders section state
  const [activeOrdersTab, setActiveOrdersTab] = useState<string>("dashboard");
  const [ordersByStatus, setOrdersByStatus] = useState<{ status: string; count: number }[]>([]);
  const [ordersByMonth, setOrdersByMonth] = useState<{ month: string; count: number }[]>([]);
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [inspectionSchedule, setInspectionSchedule] = useState<any[]>([]);
  const [filteredReports, setFilteredReports] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Weld management state
  const [welds, setWelds] = useState<{
    id: string;
    weldType: string;
    weldProcess: string;
    wpqrDocument: string;  // Renamed from weldingProcedure to wpqrDocument
    welderId: string;
    weldStatus: string;    // Renamed from weldingNotes to weldStatus
  }[]>([{
    id: 'W-1',
    weldType: '',
    weldProcess: '',
    wpqrDocument: '',
    welderId: '',
    weldStatus: 'Pass'
  }]);
  const [editingWeldIndex, setEditingWeldIndex] = useState<number | null>(null);
  
  // NDT management state
  const [ndtRecords, setNdtRecords] = useState<{
    id: string;
    ndtMethod: string;
    ndtStandard: string;
    ndtExtent: string;
    ndtTechnician: string;
    ndtDate: string;
    ndtResults: string;
  }[]>([{
    id: 'NDT-1',
    ndtMethod: 'rt',
    ndtStandard: 'ASME',
    ndtExtent: '10',
    ndtTechnician: '',
    ndtDate: '',
    ndtResults: 'Pass'
  }]);
  const [editingNdtIndex, setEditingNdtIndex] = useState<number | null>(null);
  
  // Visual Inspection management state
  const [visualRecords, setVisualRecords] = useState<{
    id: string;
    standard: string;
    inspector: string;
    dimensionalChecks: string;
    surfaceCondition: string;
    inspectionDate: string;
    observations: string;
  }[]>([{
    id: 'VI-1',
    standard: 'ASME',
    inspector: '',
    dimensionalChecks: 'acceptable',
    surfaceCondition: 'acceptable',
    inspectionDate: '',
    observations: 'Pass'
  }]);
  const [editingVisualIndex, setEditingVisualIndex] = useState<number | null>(null);
  
  // Hydrotest management state
  const [hydrotestRecords, setHydrotestRecords] = useState<{
    id: string;
    pressure: string;
    duration: string;
    medium: string;
    operator: string;
    testDate: string;
    result: string;
    notes: string;
  }[]>([{
    id: 'HT-1',
    pressure: '10.0',
    duration: '30',
    medium: 'water',
    operator: '',
    testDate: '',
    result: 'Pass',
    notes: ''
  }]);
  const [editingHydrotestIndex, setEditingHydrotestIndex] = useState<number | null>(null);
  
  // Non-Conformance Report state
  const [ncrRecords, setNcrRecords] = useState<{
    id: string;
    ncrDate: string;
    ncrStatus: string;
    ncrDescription: string;
    ncrDisposition: string;
    ncrCorrectiveAction: string;
  }[]>([{
    id: 'NCR-1',
    ncrDate: '',
    ncrStatus: 'open',
    ncrDescription: '',
    ncrDisposition: 'rework',
    ncrCorrectiveAction: ''
  }]);
  const [editingNcrIndex, setEditingNcrIndex] = useState<number | null>(null);
  
  // Material rows state
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
    description?: string;
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
      description: ''
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
        description: updatedRows[index].description || ''
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
        description: updatedRows[index].description || ''
      };
    }
    
    setMaterialRows(updatedRows);
    editForm.setValue('materials', updatedRows);
  };
  
  // Helper function to get weld type display name
  const getWeldTypeName = (weldType: string): string => {
    const weldTypes: Record<string, string> = {
      'butt': 'Butt Weld',
      'fillet': 'Fillet Weld',
      'spot': 'Spot Weld',
      'seam': 'Seam Weld',
      'lap': 'Lap Weld'
    };
    return weldTypes[weldType] || weldType;
  };
  
  // Helper function to get weld process display name
  const getWeldProcessName = (weldProcess: string): string => {
    const weldProcesses: Record<string, string> = {
      'smaw': 'SMAW (Shielded Metal Arc Welding)',
      'gtaw': 'GTAW (TIG Welding)',
      'gmaw': 'GMAW (MIG Welding)',
      'fcaw': 'FCAW (Flux-Cored Arc Welding)',
      'saw': 'SAW (Submerged Arc Welding)'
    };
    return weldProcesses[weldProcess] || weldProcess;
  };
  
  // Add new weld
  const addWeld = () => {
    const newWeldNumber = welds.length + 1;
    setWelds([
      ...welds, 
      {
        id: `W-${newWeldNumber}`,
        weldType: '',
        weldProcess: '',
        wpqrDocument: '',
        welderId: '',
        weldStatus: 'Pass'
      }
    ]);
  };
  
  // Delete a weld
  const deleteWeld = (index: number) => {
    const updatedWelds = [...welds];
    updatedWelds.splice(index, 1);
    
    // Renumber welds after deletion
    const renumberedWelds = updatedWelds.map((weld, idx) => ({
      ...weld,
      id: `W-${idx + 1}`
    }));
    
    setWelds(renumberedWelds);
    if (editingWeldIndex === index) {
      setEditingWeldIndex(null);
    }
  };
  
  // Edit a weld
  const startEditingWeld = (index: number) => {
    setEditingWeldIndex(index);
  };
  
  // Update a weld field
  const updateWeldField = (index: number, field: string, value: string) => {
    const updatedWelds = [...welds];
    updatedWelds[index] = {
      ...updatedWelds[index],
      [field]: value
    };
    setWelds(updatedWelds);
  };
  
  // Helper function to get NDT method display name
  const getNdtMethodName = (method: string): string => {
    const ndtMethods: Record<string, string> = {
      'rt': 'RT (Radiographic Testing)',
      'ut': 'UT (Ultrasonic Testing)',
      'mt': 'MT (Magnetic Particle Testing)',
      'pt': 'PT (Penetrant Testing)',
      'et': 'ET (Eddy Current Testing)',
      'vt': 'VT (Visual Testing)'
    };
    return ndtMethods[method] || method;
  };
  
  // Add new NDT record
  const addNdtRecord = () => {
    const newNdtNumber = ndtRecords.length + 1;
    setNdtRecords([
      ...ndtRecords, 
      {
        id: `NDT-${newNdtNumber}`,
        ndtMethod: 'rt',
        ndtStandard: 'ASME',
        ndtExtent: '10',
        ndtTechnician: '',
        ndtDate: '',
        ndtResults: 'Pass'
      }
    ]);
  };
  
  // Delete an NDT record
  const deleteNdtRecord = (index: number) => {
    const updatedRecords = [...ndtRecords];
    updatedRecords.splice(index, 1);
    
    // Renumber NDT records after deletion
    const renumberedRecords = updatedRecords.map((record, idx) => ({
      ...record,
      id: `NDT-${idx + 1}`
    }));
    
    setNdtRecords(renumberedRecords);
    if (editingNdtIndex === index) {
      setEditingNdtIndex(null);
    }
  };
  
  // Edit an NDT record
  const startEditingNdt = (index: number) => {
    setEditingNdtIndex(index);
  };
  
  // Update an NDT field
  const updateNdtField = (index: number, field: string, value: string) => {
    const updatedRecords = [...ndtRecords];
    updatedRecords[index] = {
      ...updatedRecords[index],
      [field]: value
    };
    setNdtRecords(updatedRecords);
  };
  
  // Add new visual inspection record
  const addVisualRecord = () => {
    const newVisualNumber = visualRecords.length + 1;
    setVisualRecords([
      ...visualRecords, 
      {
        id: `VI-${newVisualNumber}`,
        standard: 'ASME',
        inspector: '',
        dimensionalChecks: 'acceptable',
        surfaceCondition: 'acceptable',
        inspectionDate: '',
        observations: 'Pass'
      }
    ]);
  };
  
  // Delete a visual inspection record
  const deleteVisualRecord = (index: number) => {
    const updatedRecords = [...visualRecords];
    updatedRecords.splice(index, 1);
    
    // Renumber visual records after deletion
    const renumberedRecords = updatedRecords.map((record, idx) => ({
      ...record,
      id: `VI-${idx + 1}`
    }));
    
    setVisualRecords(renumberedRecords);
    if (editingVisualIndex === index) {
      setEditingVisualIndex(null);
    }
  };
  
  // Edit a visual inspection record
  const startEditingVisual = (index: number) => {
    setEditingVisualIndex(index);
  };
  
  // Update a visual inspection field
  const updateVisualField = (index: number, field: string, value: string) => {
    const updatedRecords = [...visualRecords];
    updatedRecords[index] = {
      ...updatedRecords[index],
      [field]: value
    };
    setVisualRecords(updatedRecords);
  };
  
  // Add new hydrotest record
  const addHydrotestRecord = () => {
    const newHydrotestNumber = hydrotestRecords.length + 1;
    setHydrotestRecords([
      ...hydrotestRecords, 
      {
        id: `HT-${newHydrotestNumber}`,
        pressure: '10.0',
        duration: '30',
        medium: 'water',
        operator: '',
        testDate: '',
        result: 'Pass',
        notes: ''
      }
    ]);
  };
  
  // Delete a hydrotest record
  const deleteHydrotestRecord = (index: number) => {
    const updatedRecords = [...hydrotestRecords];
    updatedRecords.splice(index, 1);
    
    // Renumber hydrotest records after deletion
    const renumberedRecords = updatedRecords.map((record, idx) => ({
      ...record,
      id: `HT-${idx + 1}`
    }));
    
    setHydrotestRecords(renumberedRecords);
    if (editingHydrotestIndex === index) {
      setEditingHydrotestIndex(null);
    }
  };
  
  // Edit a hydrotest record
  const startEditingHydrotest = (index: number) => {
    setEditingHydrotestIndex(index);
  };
  
  // Function to check if a final dossier already exists
  const checkExistingFinalDossier = async (inspectionOrderNumber: string) => {
    try {
      setIsCheckingDossier(true);
      
      const response = await fetch(`/api/quality/final-dossier/check/${inspectionOrderNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to check for existing final dossier");
      }
      
      const data = await response.json();
      
      if (data.exists && data.url) {
        setDossierUrl(data.url);
        // Automatically show the documents section when a dossier is found
        setShowDossierDocuments(true);
        // Display success toast to notify user
        toast({
          title: "Final Dossier Found",
          description: "An existing Final Dossier was found and is ready to view",
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error checking for existing final dossier:", error);
      return false;
    } finally {
      setIsCheckingDossier(false);
    }
  };
  
  // Function to generate the final dossier
  const generateFinalDossier = async () => {
    if (!editInspectionOrderDetails || !editInspectionOrderDetails.id) {
      toast({
        title: "Error",
        description: "Cannot generate final dossier: Inspection order details not found",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsGeneratingDossier(true);
      setDossierUrl(null);
      
      const response = await fetch(`/api/quality/final-dossier/generate/${editInspectionOrderDetails.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || "Failed to generate final dossier");
      }
      
      const data = await response.json();
      
      if (data.success && data.url) {
        setDossierUrl(data.url);
        toast({
          title: "Success",
          description: "Final dossier generated successfully",
        });
        
        // Refresh the document viewer
        setShowDossierDocuments(true);
      } else {
        throw new Error("Failed to generate final dossier: No URL returned");
      }
    } catch (error) {
      console.error("Error generating final dossier:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred while generating the final dossier",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingDossier(false);
    }
  };
  
  // Update a hydrotest field
  const updateHydrotestField = (index: number, field: string, value: string) => {
    const updatedRecords = [...hydrotestRecords];
    updatedRecords[index] = {
      ...updatedRecords[index],
      [field]: value
    };
    setHydrotestRecords(updatedRecords);
  };
  
  // Add new NCR record
  const addNcrRecord = () => {
    const newNcrNumber = ncrRecords.length + 1;
    const newRecord = {
      id: `NCR-${newNcrNumber}`,
      ncrDate: '',
      ncrStatus: 'open',
      ncrDescription: '',
      ncrDisposition: 'rework',
      ncrCorrectiveAction: ''
    };
    console.log('Adding new NCR record:', newRecord);
    console.log('Current NCR records before adding:', ncrRecords);
    
    const updatedRecords = [...ncrRecords, newRecord];
    setNcrRecords(updatedRecords);
    console.log('Updated NCR records after adding:', updatedRecords);
  };
  
  // Delete an NCR record
  const deleteNcrRecord = (index: number) => {
    console.log('Deleting NCR record at index:', index);
    console.log('Current NCR records before deletion:', ncrRecords);
    
    const updatedRecords = [...ncrRecords];
    updatedRecords.splice(index, 1);
    
    // Renumber NCR records after deletion
    const renumberedRecords = updatedRecords.map((record, idx) => ({
      ...record,
      id: `NCR-${idx + 1}`
    }));
    
    console.log('Updated NCR records after deletion and renumbering:', renumberedRecords);
    setNcrRecords(renumberedRecords);
    
    if (editingNcrIndex === index) {
      setEditingNcrIndex(null);
    }
  };
  
  // Edit an NCR record
  const startEditingNcr = (index: number) => {
    setEditingNcrIndex(index);
  };
  
  // Update an NCR field
  const updateNcrField = (index: number, field: string, value: string) => {
    console.log(`Updating NCR field "${field}" at index ${index} with value "${value}"`);
    console.log('Current NCR record before update:', ncrRecords[index]);
    
    const updatedRecords = [...ncrRecords];
    updatedRecords[index] = {
      ...updatedRecords[index],
      [field]: value
    };
    
    console.log('Updated NCR record after change:', updatedRecords[index]);
    setNcrRecords(updatedRecords);
  };
  
  // Fetch projects for dropdown
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
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
  
  // Fetch WPQR documents for dropdown
  const {
    data: wpqrDocuments = [],
    isLoading: isLoadingWpqr
  } = useQuery({
    queryKey: ['/api/quality/wpqr'],
    queryFn: async () => {
      const response = await fetch('/api/quality/wpqr');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch WPQR documents");
      }
      return response.json();
    }
  });
  
  // Fetch welders for dropdown
  const {
    data: welders = [],
    isLoading: isLoadingWelders
  } = useQuery({
    queryKey: ['/api/quality/welders'],
    queryFn: async () => {
      const response = await fetch('/api/quality/welders');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch welders");
      }
      return response.json();
    }
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
    refetch: refetchEditDetails
  } = useQuery<any, any, {
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
      description?: string;
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
      
      // The preview endpoint is registered as POST, not GET
      const response = await fetch(`/api/quality/inspection-orders/preview/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}) // Empty body for preview
      });
      
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
      
      // Both preview and generate should use consistent naming patterns
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
      inspectionOrderNumber: "",
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
        description: material.description || ''
      }));
      
      setMaterialRows(materials);
      // Set the form materials value directly here
      editForm.setValue('materials', materials);
    } else {
      setMaterialRows([]);
      editForm.setValue('materials', []);
    }
  }, [editInspectionOrderDetails, editForm]);
  
  // Update NDT records when inspection order details are loaded
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has NDT data in the expected format
      console.log("Checking for NDT data:", editInspectionOrderDetails);
      
      const ndtData = (editInspectionOrderDetails as any).ndtData || (editInspectionOrderDetails as any).ndt_data;
      
      if (ndtData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedNdtRecords = Array.isArray(ndtData) 
            ? ndtData 
            : typeof ndtData === 'string' 
              ? JSON.parse(ndtData) 
              : null;
          
          if (parsedNdtRecords && Array.isArray(parsedNdtRecords) && parsedNdtRecords.length > 0) {
            console.log("Found NDT records:", parsedNdtRecords);
            
            // Map the NDT records to match our state format
            const formattedRecords = parsedNdtRecords.map((record, index) => ({
              id: record.id || `NDT-${index + 1}`,
              ndtMethod: record.ndtMethod || record.method || 'rt',
              ndtStandard: record.ndtStandard || record.standard || 'ASME',
              ndtExtent: record.ndtExtent || record.extent || '10',
              ndtTechnician: record.ndtTechnician || record.technician || '',
              ndtDate: record.ndtDate || record.date || '',
              ndtResults: record.ndtResults || record.results || 'Pass'
            }));
            
            setNdtRecords(formattedRecords);
            return;
          }
        } catch (error) {
          console.error("Error parsing NDT records:", error);
        }
      }
      
      // If no valid NDT records were found, initialize with a default record
      setNdtRecords([{
        id: 'NDT-1',
        ndtMethod: 'rt',
        ndtStandard: 'ASME',
        ndtExtent: '10',
        ndtTechnician: '',
        ndtDate: '',
        ndtResults: 'Pass'
      }]);
    }
  }, [editInspectionOrderDetails]);
  
  // Update Visual Inspection records when inspection order details are loaded
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has Visual Inspection data in the expected format
      console.log("Checking for Visual Inspection data:", editInspectionOrderDetails);
      
      const visualData = (editInspectionOrderDetails as any).visualData || (editInspectionOrderDetails as any).visual_data;
      
      if (visualData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedVisualRecords = Array.isArray(visualData) 
            ? visualData 
            : typeof visualData === 'string' 
              ? JSON.parse(visualData) 
              : null;
          
          if (parsedVisualRecords && Array.isArray(parsedVisualRecords) && parsedVisualRecords.length > 0) {
            console.log("Found Visual Inspection records:", parsedVisualRecords);
            
            // Map the Visual records to match our state format
            const formattedRecords = parsedVisualRecords.map((record, index) => ({
              id: record.id || `VI-${index + 1}`,
              standard: record.standard || 'ISO 13920',
              inspector: record.inspector || '',
              dimensionalChecks: record.dimensionalChecks || 'acceptable',
              surfaceCondition: record.surfaceCondition || 'acceptable',
              inspectionDate: record.inspectionDate || record.date || '',
              observations: record.observations || ''
            }));
            
            setVisualRecords(formattedRecords);
            return;
          }
        } catch (error) {
          console.error("Error parsing Visual Inspection records:", error);
        }
      }
      
      // If no valid Visual records were found, initialize with a default record
      setVisualRecords([{
        id: 'VI-1',
        standard: 'ISO 13920',
        inspector: '',
        dimensionalChecks: 'acceptable',
        surfaceCondition: 'acceptable',
        inspectionDate: '',
        observations: ''
      }]);
    }
  }, [editInspectionOrderDetails]);
  
  // Update Weld records when inspection order details are loaded
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has Weld data in the expected format
      console.log("Checking for Weld data:", editInspectionOrderDetails);
      
      const weldData = (editInspectionOrderDetails as any).weldData || 
                       (editInspectionOrderDetails as any).weld_data ||
                       editInspectionOrderDetails.welds;
      
      if (weldData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedWeldRecords = Array.isArray(weldData) 
            ? weldData 
            : typeof weldData === 'string' 
              ? JSON.parse(weldData) 
              : null;
          
          if (parsedWeldRecords && Array.isArray(parsedWeldRecords) && parsedWeldRecords.length > 0) {
            console.log("Found Weld records:", parsedWeldRecords);
            
            // Map the Weld records to match our state format
            const formattedRecords = parsedWeldRecords.map((record, index) => ({
              id: record.id || `W-${index + 1}`,
              weldType: record.weldType || '',
              weldProcess: record.weldProcess || '',
              wpqrDocument: record.wpqrDocument || '',
              welderId: record.welderId || '',
              weldStatus: record.weldStatus || 'Pass'
            }));
            
            setWelds(formattedRecords);
            return;
          }
        } catch (error) {
          console.error("Error parsing Weld records:", error);
        }
      }
      
      // If no valid Weld records were found, initialize with a default record
      setWelds([{
        id: 'W-1',
        weldType: '',
        weldProcess: '',
        wpqrDocument: '',
        welderId: '',
        weldStatus: 'Pass'
      }]);
    }
  }, [editInspectionOrderDetails]);
  
  // Load NCR records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has NCR data in the expected format
      console.log("Checking for NCR data:", editInspectionOrderDetails);
      
      const ncrData = (editInspectionOrderDetails as any).ncrData || (editInspectionOrderDetails as any).ncr_data;
      
      if (ncrData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedNcrRecords = Array.isArray(ncrData) 
            ? ncrData 
            : typeof ncrData === 'string' 
              ? JSON.parse(ncrData) 
              : null;
          
          if (parsedNcrRecords && Array.isArray(parsedNcrRecords) && parsedNcrRecords.length > 0) {
            console.log("Found NCR records:", parsedNcrRecords);
            
            // Map the NCR records to match our state format
            const formattedRecords = parsedNcrRecords.map((record, index) => ({
              id: record.id || `NCR-${index + 1}`,
              ncrDate: record.ncrDate || '',
              ncrStatus: record.ncrStatus || 'open',
              ncrDescription: record.ncrDescription || '',
              ncrDisposition: record.ncrDisposition || 'rework',
              ncrCorrectiveAction: record.ncrCorrectiveAction || ''
            }));
            
            setNcrRecords(formattedRecords);
            return;
          }
        } catch (error) {
          console.error("Error parsing NCR records:", error);
        }
      }
      
      // If no valid NCR records were found, initialize with a default record
      setNcrRecords([{
        id: 'NCR-1',
        ncrDate: '',
        ncrStatus: 'open',
        ncrDescription: '',
        ncrDisposition: 'rework',
        ncrCorrectiveAction: ''
      }]);
    }
  }, [editInspectionOrderDetails]);
  
  // Helper function to sync material rows with form
  const syncMaterialRowsWithForm = () => {
    editForm.setValue('materials', materialRows);
  };

  // Update form values when inspection order details are loaded
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Log the data to see what drawing info is available
      console.log("Edit Inspection Order Details:", editInspectionOrderDetails);
      
      // Get the item code and description from the first item if available
      const firstItem = editInspectionOrderDetails.items && editInspectionOrderDetails.items.length > 0 
        ? editInspectionOrderDetails.items[0] 
        : null;
        
      // Use the database UOM field for unit
      const unitValue = editInspectionOrderDetails.uom || editInspectionOrderDetails.unit || (firstItem ? firstItem.unit : "");
      
      // Use drawingNumber from the details or first item
      console.log("First Item:", firstItem);
      
      // For items in the inspection order, we need to look for the drawing number field
      // If no drawing number is found, derive it from the item code (based on convention)
      let drawingNumber = (editInspectionOrderDetails as any).drawingNumber || 
                         editInspectionOrderDetails.drawingNo || 
                         (firstItem && (firstItem as any).drawingNumber) || 
                         (firstItem && firstItem.drawingNo) || 
                         "";
                           
      // If we still don't have a drawing number, try to extract it from item code or use a numeric format
      // Drawing numbers come in two formats:
      // 1. Alpha-numeric with hyphens like "C10165x-WPC-WRS-3000" → extract "C10165x-WPC-WRS"
      // 2. Numeric like "482300200100100"
      if (!drawingNumber && firstItem && firstItem.itemCode) {
        const itemCode = firstItem.itemCode;
        
        // Check if the item code might be numeric-style (just digits)
        if (/^\d+$/.test(itemCode)) {
          // For numeric drawing numbers, use as-is
          drawingNumber = itemCode;
        } 
        // For alpha-numeric with hyphens, extract the part before the last segment
        else if (itemCode.includes('-')) {
          const parts = itemCode.split('-');
          if (parts.length >= 2) {
            drawingNumber = parts.slice(0, -1).join('-');
          } else {
            drawingNumber = itemCode;
          }
        } 
        // If no hyphen but has letters and numbers, use as-is
        else {
          drawingNumber = itemCode;
        }
      }
                           
      console.log("Drawing Number Value:", drawingNumber);
        
      editForm.reset({
        inspectionOrderNumber: editInspectionOrderDetails.inspectionOrderNumber || "",
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
        materialCertificateNumber: (editInspectionOrderDetails as any).materialCertificateNumber || '',
        heatNumber: (editInspectionOrderDetails as any).heatNumber || '',
        materialGrade: (editInspectionOrderDetails as any).materialGrade || '',
        materialSpecification: (editInspectionOrderDetails as any).materialSpecification || '',
        materialSupplier: (editInspectionOrderDetails as any).materialSupplier || '',
        // Initialize the materials array with any existing materials
        materials: editInspectionOrderDetails.materials || [],
      });
    }
  }, [editInspectionOrderDetails, editForm]);

  // Handle inspection order update
  const handleUpdateInspectionOrder = async (data: InspectionOrderEditFormValues) => {
    if (!editingInspectionOrder) return;
    
    try {
      // Filter out any material rows without a materialId to avoid DB constraint errors
      let materialRows = data.materials || [];
      const validMaterialRows = materialRows.filter(row => row.materialId);
      
      // Combine the form data with the NDT records, Visual records, Weld records, and NCR records from the state
      const updateData = {
        ...data,
        materials: validMaterialRows,
        ndtRecords: ndtRecords,
        visualRecords: visualRecords,
        welds: welds,
        ncrRecords: ncrRecords
      };
      
      console.log("Updating inspection order with data:", updateData);
      console.log("NCR records being sent to server:", ncrRecords);
      
      const response = await fetch(`/api/quality/inspection-orders/${editingInspectionOrder}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
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
      
      // Refresh the inspection orders list but keep the dialog open
      await refetchInspectionOrders();
      
      // Refresh the current inspection order data
      await refetchEditDetails();
      
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
  // Filter reports by status
  const filterReportsByStatus = (status: string, orders: any[]) => {
    if (status === 'all') {
      setFilteredReports(orders);
    } else {
      setFilteredReports(orders.filter(order => 
        order.status && order.status.toLowerCase() === status.toLowerCase()
      ));
    }
  };

  // Process inspection orders for analytics and dashboard
  useEffect(() => {
    if (inspectionOrders && inspectionOrders.length > 0) {
      // Calculate orders by status for the dashboard
      const statusCounts: { [key: string]: number } = {};
      inspectionOrders.forEach(order => {
        const status = order.status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      
      const statusData = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count
      }));
      
      setOrdersByStatus(statusData);
      
      // Calculate orders by month for trends
      const monthCounts: { [key: string]: number } = {};
      inspectionOrders.forEach(order => {
        const date = new Date(order.createdAt);
        const monthYear = format(date, 'MMM yyyy');
        monthCounts[monthYear] = (monthCounts[monthYear] || 0) + 1;
      });
      
      const monthData = Object.entries(monthCounts)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => {
          // Sort by date (assuming format "MMM yyyy")
          const dateA = new Date(a.month);
          const dateB = new Date(b.month);
          return dateA.getTime() - dateB.getTime();
        });
      
      setOrdersByMonth(monthData);
      
      // Prepare inspection schedule data
      const scheduleData = inspectionOrders.map(order => {
        // Extract dates from the order, prioritize specific dates if available
        let scheduleDate = new Date(order.createdAt);
        
        // Use any available inspection dates if present
        if (order.hydrotestDate) scheduleDate = new Date(order.hydrotestDate);
        if (order.ndtDate) scheduleDate = new Date(order.ndtDate);
        if (order.visualInspectionDate) scheduleDate = new Date(order.visualInspectionDate);
        
        return {
          id: order.id,
          title: order.title || order.inspectionOrderNumber,
          date: scheduleDate,
          status: order.status,
          inspectionOrderNumber: order.inspectionOrderNumber,
          inspectionType: order.inspectionType
        };
      });
      
      setInspectionSchedule(scheduleData);
      
      // Set filtered reports based on current status filter
      filterReportsByStatus(statusFilter, inspectionOrders);
    }
  }, [inspectionOrders, statusFilter]);

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
                  {Array.isArray(projects) && projects.map((project: any) => (
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
            ) : !Array.isArray(inspections) || inspections.length === 0 ? (
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
              <div>
                <Tabs defaultValue="list" className="w-full" onValueChange={(value) => setActiveOrdersTab(value)}>
                  <TabsList className="grid w-full grid-cols-5 lg:w-auto">
                    <TabsTrigger value="list">List View</TabsTrigger>
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="schedule">Schedule</TabsTrigger>
                    <TabsTrigger value="reports">Reports</TabsTrigger>
                    <TabsTrigger value="export">Export</TabsTrigger>
                  </TabsList>
                  
                  {/* List View Tab - Original Table View */}
                  <TabsContent value="list" className="mt-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableCaption>Inspection orders for the selected project.</TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[300px]">Order #</TableHead>
                            <TableHead className="w-[600px]">Description</TableHead>
                            <TableHead>Drawing No</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead className="w-[150px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inspectionOrders.map((order: any) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.inspectionOrderNumber}</TableCell>
                              <TableCell>{order.description || order.title}</TableCell>
                              <TableCell>{order.drawingNo || 'N/A'}</TableCell>
                              <TableCell>{getStatusBadge(order.status)}</TableCell>
                              <TableCell>{order.quantity} {order.unit}</TableCell>
                              <TableCell>
                                <div className="flex gap-1 justify-center">
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-8 w-8"
                                    title="View"
                                    onClick={() => {
                                      setSelectedInspectionOrder(order.id);
                                      setIsDetailsDialogOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Edit"
                                    onClick={() => {
                                      setEditingInspectionOrder(order.id);
                                      setIsEditDialogOpen(true);
                                    }}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    title="Delete"
                                    onClick={() => handleDeleteInspectionOrder(order.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                  
                  {/* Dashboard Tab - Analytics View */}
                  <TabsContent value="dashboard" className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Status Distribution Chart */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Inspection Status Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={ordersByStatus}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={true}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  dataKey="count"
                                  nameKey="status"
                                  label={({ status, count }) => `${status}: ${count}`}
                                >
                                  {ordersByStatus.map((entry, index) => {
                                    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
                                    return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                                  })}
                                </Pie>
                                <Tooltip 
                                  formatter={(value, name, props) => [`${value} orders`, props.payload.status]}
                                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '6px', border: '1px solid #ccc' }}
                                />
                                <Legend />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Monthly Trends Chart */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Monthly Inspection Trends</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={ordersByMonth}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <Tooltip 
                                  formatter={(value) => [`${value} orders`, 'Count']}
                                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '6px', border: '1px solid #ccc' }}
                                />
                                <Legend />
                                <Bar dataKey="count" name="Inspection Orders" fill="#6366F1" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Summary Cards */}
                      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Total Inspections</p>
                                <h3 className="text-2xl font-bold mt-1">{inspectionOrders.length}</h3>
                              </div>
                              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <ClipboardCheck className="h-6 w-6 text-primary" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                                <h3 className="text-2xl font-bold mt-1">
                                  {inspectionOrders.filter(order => 
                                    order.status && ['pending', 'open'].includes(order.status.toLowerCase())
                                  ).length}
                                </h3>
                              </div>
                              <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                                <AlertCircle className="h-6 w-6 text-yellow-600" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                                <h3 className="text-2xl font-bold mt-1">
                                  {inspectionOrders.filter(order => 
                                    order.status && order.status.toLowerCase() === 'in_progress'
                                  ).length}
                                </h3>
                              </div>
                              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <Hourglass className="h-6 w-6 text-blue-600" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                                <h3 className="text-2xl font-bold mt-1">
                                  {inspectionOrders.filter(order => 
                                    order.status && ['completed', 'approved', 'passed'].includes(order.status.toLowerCase())
                                  ).length}
                                </h3>
                              </div>
                              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Schedule Tab - Calendar View */}
                  <TabsContent value="schedule" className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <Card className="md:col-span-1">
                        <CardHeader>
                          <CardTitle className="text-lg">Schedule View</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div>
                              <Label>View Type</Label>
                              <Select 
                                value={calendarView} 
                                onValueChange={(value: any) => setCalendarView(value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select view" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="month">Month View</SelectItem>
                                  <SelectItem value="week">Week View</SelectItem>
                                  <SelectItem value="day">Day View</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div>
                              <Label>Select Date</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start text-left font-normal"
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={setSelectedDate}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="md:col-span-3">
                        <CardHeader>
                          <CardTitle className="text-lg">
                            Inspection Schedule - {selectedDate ? format(selectedDate, 'MMMM yyyy') : 'Current Month'}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {inspectionSchedule.length === 0 ? (
                              <div className="text-center py-12 border rounded-md">
                                <CalendarIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-2 text-lg font-medium">No scheduled inspections</h3>
                                <p className="text-sm text-muted-foreground">
                                  There are no inspections scheduled during this time period.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {inspectionSchedule
                                  .filter(schedule => {
                                    if (!selectedDate) return true;
                                    
                                    const scheduleDate = new Date(schedule.date);
                                    const isInMonth = 
                                      scheduleDate.getMonth() === selectedDate.getMonth() && 
                                      scheduleDate.getFullYear() === selectedDate.getFullYear();
                                    
                                    // Apply finer filtering based on view type
                                    if (calendarView === 'month') {
                                      return isInMonth;
                                    } else if (calendarView === 'week') {
                                      const startOfWeek = new Date(selectedDate);
                                      startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
                                      const endOfWeek = new Date(startOfWeek);
                                      endOfWeek.setDate(startOfWeek.getDate() + 6);
                                      return scheduleDate >= startOfWeek && scheduleDate <= endOfWeek;
                                    } else if (calendarView === 'day') {
                                      return (
                                        scheduleDate.getDate() === selectedDate.getDate() &&
                                        scheduleDate.getMonth() === selectedDate.getMonth() &&
                                        scheduleDate.getFullYear() === selectedDate.getFullYear()
                                      );
                                    }
                                    return true;
                                  })
                                  .map((schedule) => (
                                    <div 
                                      key={schedule.id} 
                                      className="p-3 border rounded-md flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                                      onClick={() => {
                                        setSelectedInspectionOrder(schedule.id);
                                        setIsDetailsDialogOpen(true);
                                      }}
                                    >
                                      <div className="flex items-center">
                                        <div className={`
                                          w-3 h-3 rounded-full mr-3
                                          ${schedule.status === 'completed' || schedule.status === 'passed' ? 'bg-green-500' : 
                                            schedule.status === 'in_progress' ? 'bg-blue-500' : 
                                            schedule.status === 'pending' || schedule.status === 'open' ? 'bg-yellow-500' : 
                                            'bg-gray-400'}
                                        `}></div>
                                        <div>
                                          <h4 className="font-medium">{schedule.title}</h4>
                                          <p className="text-sm text-muted-foreground">
                                            {schedule.inspectionOrderNumber} - {schedule.inspectionType || 'General Inspection'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-medium">{format(new Date(schedule.date), 'dd MMM yyyy')}</p>
                                        {getStatusBadge(schedule.status)}
                                      </div>
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                  
                  {/* Reports Tab - Filtered Reports View */}
                  <TabsContent value="reports" className="mt-4">
                    <div className="space-y-6">
                      {/* Filter Controls */}
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex flex-wrap gap-4">
                            <div className="flex-1 min-w-[200px]">
                              <Label>Filter by Status</Label>
                              <Select 
                                value={statusFilter} 
                                onValueChange={setStatusFilter}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Statuses</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="passed">Passed</SelectItem>
                                  <SelectItem value="failed">Failed</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="flex-1 min-w-[200px]">
                              <Label>Search</Label>
                              <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search inspection orders..."
                                  className="pl-8"
                                  onChange={(e) => {
                                    const searchTerm = e.target.value.toLowerCase();
                                    if (searchTerm === '') {
                                      filterReportsByStatus(statusFilter, inspectionOrders);
                                    } else {
                                      setFilteredReports(
                                        filteredReports.filter(order =>
                                          order.inspectionOrderNumber?.toLowerCase().includes(searchTerm) ||
                                          order.title?.toLowerCase().includes(searchTerm) ||
                                          order.description?.toLowerCase().includes(searchTerm)
                                        )
                                      );
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Reports Table */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Inspection Reports</CardTitle>
                          <CardDescription>
                            View detailed reports for completed inspection orders
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {filteredReports.length === 0 ? (
                            <div className="text-center py-8">
                              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                              <h3 className="mt-2 text-lg font-medium">No reports match your criteria</h3>
                              <p className="text-muted-foreground">
                                Try changing your filter options or search term
                              </p>
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Order Number</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead>Inspection Date</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredReports.map((order) => (
                                  <TableRow key={order.id}>
                                    <TableCell className="font-medium">{order.inspectionOrderNumber}</TableCell>
                                    <TableCell>{order.description || order.title}</TableCell>
                                    <TableCell>
                                      {order.lastUpdatedAt ? format(new Date(order.lastUpdatedAt), 'dd MMM yyyy') : 
                                       order.createdAt ? format(new Date(order.createdAt), 'dd MMM yyyy') : 'N/A'}
                                    </TableCell>
                                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                                    <TableCell className="text-right">
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => {
                                          setSelectedInspectionOrder(order.id);
                                          setIsDetailsDialogOpen(true);
                                        }}
                                      >
                                        <FileText className="h-4 w-4 mr-1" /> View Report
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                  
                  {/* Export Tab - Export Options */}
                  <TabsContent value="export" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Export Data</CardTitle>
                        <CardDescription>
                          Export inspection order data and reports in various formats
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {/* Export All Records */}
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg">Export All Records</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground mb-4">
                                Export all inspection orders for the current project as a spreadsheet
                              </p>
                              <div className="flex gap-2">
                                <Button className="w-full">
                                  <Download className="h-4 w-4 mr-1" /> Export Excel
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                          
                          {/* Export Custom Data */}
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg">Custom Export</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground mb-4">
                                Export specific data based on status and date range
                              </p>
                              <div className="flex flex-col gap-2">
                                <Label>Status Filter</Label>
                                <Select defaultValue="all">
                                  <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="passed">Passed</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button className="mt-2">
                                  <Download className="h-4 w-4 mr-1" /> Export Filtered Data
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                          
                          {/* Export Summary Report */}
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg">Summary Report</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground mb-4">
                                Generate a summary PDF report with analytics and charts
                              </p>
                              <Button className="w-full">
                                <FileText className="h-4 w-4 mr-1" /> Generate Summary PDF
                              </Button>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
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
                      
                      <div className="text-sm font-medium">Drawing No:</div>
                      <div className="text-sm">{inspectionOrderDetails?.drawingNo || 'N/A'}</div>
                      
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
                          <TableHead>Drawing No</TableHead>
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
                            <TableCell>{item.drawingNo || 'N/A'}</TableCell>
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
                {/* Inspection Order No row - Added first above everything else */}
                <div className="grid grid-cols-12 gap-4 mb-4">
                  <div className="col-span-12">
                    <FormField
                      control={editForm.control}
                      name="inspectionOrderNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inspection Order No</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              readOnly
                              className="bg-gray-50"
                              placeholder="Inspection Order Number" 
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
                  {/* Second line: Item Code, Description, and Drawing No with custom widths */}
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
                <Tabs 
                  defaultValue="material" 
                  className="w-full mt-6"
                  onValueChange={(value) => {
                    // Check for existing final dossier when Final Dossier tab is selected
                    if (value === 'final-dossier' && editInspectionOrderDetails?.inspectionOrderNumber) {
                      console.log('Final Dossier tab selected, checking for existing dossier...');
                      checkExistingFinalDossier(editInspectionOrderDetails.inspectionOrderNumber);
                    }
                  }}
                >
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
                      
                      {/* Material rows with Excel-like layout - always show table format */}
                      <div className="border rounded-md overflow-hidden">
                        {/* Table header - always shown */}
                        <div className="flex flex-nowrap bg-gray-100 py-2 px-3 border-b text-xs font-semibold">
                          <div className="me-2" style={{width: "390px"}}>Description</div>
                          <div className="me-2" style={{width: "120px"}}>Material ID</div>
                          <div className="me-2" style={{width: "120px"}}>Certificate #</div>
                          <div className="me-2" style={{width: "100px"}}>Heat #</div>
                          <div className="me-2" style={{width: "100px"}}>Grade</div>
                          <div className="me-2" style={{width: "120px"}}>Spec</div>
                          <div className="me-2" style={{width: "80px"}}>Qty</div>
                          <div className="me-2" style={{width: "50px"}}>Unit</div>
                          <div style={{width: "80px"}}>Actions</div>
                        </div>
                        
                        {/* Material rows - compact layout without individual labels */}
                        <div className="max-h-[500px] overflow-auto">
                          {materialRows.length > 0 ? (
                            materialRows.map((materialRow, index) => (
                              <div key={index} className="flex flex-nowrap py-1 px-3 border-b hover:bg-gray-50">
                                {/* Description - 390px */}
                                <div className="me-2" style={{width: "390px"}}>
                                  <Input
                                    id={`description-${index}`}
                                    value={materialRow.description || ''}
                                    onChange={(e) => {
                                      const updatedRows = [...materialRows];
                                      updatedRows[index] = {
                                        ...updatedRows[index],
                                        description: e.target.value
                                      };
                                      setMaterialRows(updatedRows);
                                      editForm.setValue('materials', updatedRows);
                                    }}
                                    placeholder="Enter description"
                                    className="h-8 w-full text-sm"
                                  />
                                </div>
                              
                                {/* Material Identification (MI ID) - 120px */}
                                <div className="me-2" style={{width: "120px"}}>
                                  <Select
                                    value={materialRow.materialId?.toString() || ""}
                                    onValueChange={(value) => {
                                      const selectedMaterial = availableMaterials.find(m => m.id === parseInt(value));
                                      updateMaterialRow(index, selectedMaterial || null);
                                    }}
                                  >
                                    <SelectTrigger id={`material-id-${index}`} className="h-8 w-full text-sm">
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
                                
                                {/* Certificate Number - 120px */}
                                <div className="me-2" style={{width: "120px"}}>
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
                                    className="bg-gray-50 h-8 w-full text-sm"
                                    readOnly
                                  />
                                </div>
                                
                                {/* Heat Number - 100px */}
                                <div className="me-2" style={{width: "100px"}}>
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
                                    className="bg-gray-50 h-8 w-full text-sm"
                                    readOnly
                                  />
                                </div>
                                
                                {/* Material Grade - 100px */}
                                <div className="me-2" style={{width: "100px"}}>
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
                                    className="bg-gray-50 h-8 w-full text-sm"
                                    readOnly
                                  />
                                </div>
                                
                                {/* Material Specification - 120px */}
                                <div className="me-2" style={{width: "120px"}}>
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
                                    className="bg-gray-50 h-8 w-full text-sm"
                                    readOnly
                                  />
                                </div>
                                
                                {/* Allocated Quantity - 80px */}
                                <div className="me-2" style={{width: "80px"}}>
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
                                    className="h-8 w-full text-sm"
                                    type="number"
                                  />
                                </div>
                                
                                {/* Unit - 50px */}
                                <div className="me-2" style={{width: "50px"}}>
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
                                    className="h-8 w-full text-sm"
                                  />
                                </div>
                                
                                {/* Actions - Edit/Delete */}
                                <div style={{width: "80px"}}>
                                  <div className="flex space-x-1 items-center">
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon"
                                      className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                      onClick={() => {
                                        // Edit functionality can be added here if needed
                                        // Currently, editing is already possible directly in the fields
                                      }}
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon"
                                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                      onClick={() => removeMaterialRow(index)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-10 border-b">
                              <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                              <p className="mt-2 text-muted-foreground">
                                No materials linked to this inspection order.
                              </p>
                              <p className="text-sm text-muted-foreground mb-2">
                                Click "Add Material" to link materials from Material Identification module.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Certificate Upload/View Buttons */}
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
                  </TabsContent>
                  
                  {/* Welding & Weld Maps Tab */}
                  <TabsContent value="welding" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Welding & Weld Maps</h3>
                      
                      {/* Weld list */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">Weld ID</TableHead>
                              <TableHead className="w-[150px]">Weld Type</TableHead>
                              <TableHead className="w-[200px]">Weld Process</TableHead>
                              <TableHead className="w-[200px]">WPQR</TableHead>
                              <TableHead className="w-[150px]">Welder ID</TableHead>
                              <TableHead className="w-[120px]">Weld Status</TableHead>
                              <TableHead className="w-[80px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(welds) && welds.map((weld, index) => (
                              <TableRow key={weld.id}>
                                <TableCell className="font-medium">{weld.id}</TableCell>
                                <TableCell>
                                  {editingWeldIndex === index ? (
                                    <Select 
                                      value={weld.weldType}
                                      onValueChange={(value) => updateWeldField(index, 'weldType', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="butt">Butt Weld</SelectItem>
                                        <SelectItem value="fillet">Fillet Weld</SelectItem>
                                        <SelectItem value="spot">Spot Weld</SelectItem>
                                        <SelectItem value="seam">Seam Weld</SelectItem>
                                        <SelectItem value="lap">Lap Weld</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    weld.weldType ? getWeldTypeName(weld.weldType) : "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingWeldIndex === index ? (
                                    <Select 
                                      value={weld.weldProcess}
                                      onValueChange={(value) => updateWeldField(index, 'weldProcess', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select process" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="smaw">SMAW (Shielded Metal Arc Welding)</SelectItem>
                                        <SelectItem value="gtaw">GTAW (TIG Welding)</SelectItem>
                                        <SelectItem value="gmaw">GMAW (MIG Welding)</SelectItem>
                                        <SelectItem value="fcaw">FCAW (Flux-Cored Arc Welding)</SelectItem>
                                        <SelectItem value="saw">SAW (Submerged Arc Welding)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    weld.weldProcess ? getWeldProcessName(weld.weldProcess) : "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingWeldIndex === index ? (
                                    <Select 
                                      value={weld.wpqrDocument}
                                      onValueChange={(value) => updateWeldField(index, 'wpqrDocument', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select WPQR" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {isLoadingWpqr ? (
                                          <SelectItem value="" disabled>Loading WPQR documents...</SelectItem>
                                        ) : wpqrDocuments.length > 0 ? (
                                          wpqrDocuments.map((doc: any) => (
                                            <SelectItem key={doc.id} value={doc.documentNumber || doc.id.toString()}>
                                              {doc.documentNumber || `WPQR-${doc.id}`}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <SelectItem value="" disabled>No WPQR documents available</SelectItem>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    weld.wpqrDocument || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingWeldIndex === index ? (
                                    <Select 
                                      value={weld.welderId}
                                      onValueChange={(value) => updateWeldField(index, 'welderId', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select welder" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {isLoadingWelders ? (
                                          <SelectItem value="" disabled>Loading welders...</SelectItem>
                                        ) : welders.length > 0 ? (
                                          welders.map((welder: any) => (
                                            <SelectItem key={welder.id} value={welder.welderId}>
                                              {welder.welderId}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <SelectItem value="" disabled>No welders available</SelectItem>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    weld.welderId || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingWeldIndex === index ? (
                                    <Select 
                                      value={weld.weldStatus}
                                      onValueChange={(value) => updateWeldField(index, 'weldStatus', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Pass">Pass</SelectItem>
                                        <SelectItem value="Failed">Failed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    weld.weldStatus || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-1">
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => startEditingWeld(index)}
                                      className="h-7 w-7"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => deleteWeld(index)}
                                      className="h-7 w-7 text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center justify-between mt-4">
                        <div>
                          <Button 
                            type="button" 
                            variant="default" 
                            size="sm" 
                            onClick={addWeld}
                            className="mr-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Weld
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
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
                  </TabsContent>
                  
                  {/* NDT Tab */}
                  <TabsContent value="ndt" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Non-Destructive Testing (NDT)</h3>
                      
                      {/* NDT list */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">NDT ID</TableHead>
                              <TableHead className="w-[400px]">Method</TableHead> {/* Updated width */}
                              <TableHead className="w-[150px]">Standard</TableHead>
                              <TableHead className="w-[120px]">Extent (%)</TableHead>
                              <TableHead className="w-[150px]">Technician</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[150px]">Results</TableHead> {/* Updated width */}
                              <TableHead className="w-[80px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(ndtRecords) && ndtRecords.map((record, index) => (
                              <TableRow key={record.id}>
                                <TableCell className="font-medium">{record.id}</TableCell>
                                <TableCell>
                                  {editingNdtIndex === index ? (
                                    <Select 
                                      value={record.ndtMethod}
                                      onValueChange={(value) => updateNdtField(index, 'ndtMethod', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select method" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="rt">RT (Radiographic Testing)</SelectItem>
                                        <SelectItem value="ut">UT (Ultrasonic Testing)</SelectItem>
                                        <SelectItem value="mt">MT (Magnetic Particle Testing)</SelectItem>
                                        <SelectItem value="pt">PT (Penetrant Testing)</SelectItem>
                                        <SelectItem value="et">ET (Eddy Current Testing)</SelectItem>
                                        <SelectItem value="vt">VT (Visual Testing)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.ndtMethod ? getNdtMethodName(record.ndtMethod) : "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNdtIndex === index ? (
                                    <Select 
                                      value={record.ndtStandard}
                                      onValueChange={(value) => updateNdtField(index, 'ndtStandard', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select standard" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ASME">ASME</SelectItem>
                                        <SelectItem value="API">API</SelectItem>
                                        <SelectItem value="EN ISO">EN ISO</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.ndtStandard || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNdtIndex === index ? (
                                    <Select 
                                      value={record.ndtExtent}
                                      onValueChange={(value) => updateNdtField(index, 'ndtExtent', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select %" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="10">10%</SelectItem>
                                        <SelectItem value="100">100%</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.ndtExtent ? `${record.ndtExtent}%` : "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNdtIndex === index ? (
                                    <Input 
                                      value={record.ndtTechnician} 
                                      onChange={(e) => updateNdtField(index, 'ndtTechnician', e.target.value)}
                                      placeholder="Enter name"
                                      className="w-full"
                                    />
                                  ) : (
                                    record.ndtTechnician || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNdtIndex === index ? (
                                    <Input 
                                      type="date"
                                      value={record.ndtDate} 
                                      onChange={(e) => updateNdtField(index, 'ndtDate', e.target.value)}
                                      className="w-full"
                                    />
                                  ) : (
                                    record.ndtDate || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNdtIndex === index ? (
                                    <Select 
                                      value={record.ndtResults}
                                      onValueChange={(value) => updateNdtField(index, 'ndtResults', value)}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select result" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Pass">Pass</SelectItem>
                                        <SelectItem value="Failed">Failed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.ndtResults || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-1">
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => startEditingNdt(index)}
                                      className="h-7 w-7"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => deleteNdtRecord(index)}
                                      className="h-7 w-7 text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center justify-between mt-4">
                        <div>
                          <Button 
                            type="button" 
                            variant="default" 
                            size="sm" 
                            onClick={addNdtRecord}
                            className="mr-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add NDT
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
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
                  </TabsContent>
                  
                  {/* Visual Inspection Tab */}
                  <TabsContent value="visual" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Visual Inspection Records</h3>
                      
                      {/* Table of visual inspection records */}
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Standard</TableHead>
                              <TableHead>Dimensional Checks</TableHead>
                              <TableHead>Surface Condition</TableHead>
                              <TableHead>Inspector</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Observations</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(visualRecords) && visualRecords.map((record, index) => (
                              <TableRow key={record.id}>
                                <TableCell className="w-[150px]">{record.id}</TableCell>
                                <TableCell>
                                  {editingVisualIndex === index ? (
                                    <Select 
                                      value={record.standard}
                                      onValueChange={(value) => updateVisualField(index, 'standard', value)}
                                    >
                                      <SelectTrigger className="w-[150px]">
                                        <SelectValue placeholder="Select standard" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ASME">ASME</SelectItem>
                                        <SelectItem value="API">API</SelectItem>
                                        <SelectItem value="EN ISO">EN ISO</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.standard || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingVisualIndex === index ? (
                                    <Select 
                                      value={record.dimensionalChecks}
                                      onValueChange={(value) => updateVisualField(index, 'dimensionalChecks', value)}
                                    >
                                      <SelectTrigger className="w-[150px]">
                                        <SelectValue placeholder="Select result" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="acceptable">Acceptable</SelectItem>
                                        <SelectItem value="notAcceptable">Not Acceptable</SelectItem>
                                        <SelectItem value="conditionallyAcceptable">Conditionally Acceptable</SelectItem>
                                        <SelectItem value="notApplicable">Not Applicable</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.dimensionalChecks || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingVisualIndex === index ? (
                                    <Select 
                                      value={record.surfaceCondition}
                                      onValueChange={(value) => updateVisualField(index, 'surfaceCondition', value)}
                                    >
                                      <SelectTrigger className="w-[150px]">
                                        <SelectValue placeholder="Select condition" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="acceptable">Acceptable</SelectItem>
                                        <SelectItem value="notAcceptable">Not Acceptable</SelectItem>
                                        <SelectItem value="conditionallyAcceptable">Conditionally Acceptable</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.surfaceCondition || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingVisualIndex === index ? (
                                    <Input 
                                      value={record.inspector} 
                                      onChange={(e) => updateVisualField(index, 'inspector', e.target.value)}
                                      className="w-[120px]"
                                    />
                                  ) : (
                                    record.inspector || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingVisualIndex === index ? (
                                    <Input 
                                      type="date" 
                                      value={record.inspectionDate} 
                                      onChange={(e) => updateVisualField(index, 'inspectionDate', e.target.value)}
                                      className="w-[130px]"
                                    />
                                  ) : (
                                    record.inspectionDate || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingVisualIndex === index ? (
                                    <Select 
                                      value={record.observations}
                                      onValueChange={(value) => updateVisualField(index, 'observations', value)}
                                    >
                                      <SelectTrigger className="w-[150px]">
                                        <SelectValue placeholder="Select result" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Pass">Pass</SelectItem>
                                        <SelectItem value="Failed">Failed</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.observations || "-"
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end space-x-1">
                                    {editingVisualIndex === index ? (
                                      <Button 
                                        type="button" 
                                        variant="default" 
                                        size="icon" 
                                        onClick={() => setEditingVisualIndex(null)}
                                        className="h-7 w-7"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : (
                                      <>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => startEditingVisual(index)}
                                          className="h-7 w-7"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => deleteVisualRecord(index)}
                                          className="h-7 w-7 text-destructive"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center justify-between mt-4">
                        <div>
                          <Button 
                            type="button" 
                            variant="default" 
                            size="sm" 
                            onClick={addVisualRecord}
                            className="mr-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Visual Inspection
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
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
                  </TabsContent>
                  
                  {/* Hydrotest Tab */}
                  <TabsContent value="hydrotest" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Hydrotest</h3>
                      
                      {/* Table of hydrotest records */}
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Pressure (bar)</TableHead>
                              <TableHead>Duration (min)</TableHead>
                              <TableHead>Medium</TableHead>
                              <TableHead>Operator</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Result</TableHead>
                              <TableHead>Notes</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(hydrotestRecords) && hydrotestRecords.map((record, index) => (
                              <TableRow key={record.id}>
                                <TableCell>{record.id}</TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Input 
                                      value={record.pressure} 
                                      onChange={(e) => updateHydrotestField(index, 'pressure', e.target.value)}
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      className="w-[100px]"
                                    />
                                  ) : (
                                    record.pressure || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Input 
                                      value={record.duration} 
                                      onChange={(e) => updateHydrotestField(index, 'duration', e.target.value)}
                                      type="number"
                                      min="0"
                                      className="w-[100px]"
                                    />
                                  ) : (
                                    record.duration || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Select 
                                      value={record.medium}
                                      onValueChange={(value) => updateHydrotestField(index, 'medium', value)}
                                    >
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Select medium" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="water">Water</SelectItem>
                                        <SelectItem value="air">Air</SelectItem>
                                        <SelectItem value="nitrogen">Nitrogen</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.medium || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Input 
                                      value={record.operator} 
                                      onChange={(e) => updateHydrotestField(index, 'operator', e.target.value)}
                                      className="w-[120px]"
                                    />
                                  ) : (
                                    record.operator || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Input 
                                      type="date" 
                                      value={record.testDate} 
                                      onChange={(e) => updateHydrotestField(index, 'testDate', e.target.value)}
                                      className="w-[130px]"
                                    />
                                  ) : (
                                    record.testDate || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Select 
                                      value={record.result}
                                      onValueChange={(value) => updateHydrotestField(index, 'result', value)}
                                    >
                                      <SelectTrigger className="w-[100px]">
                                        <SelectValue placeholder="Select result" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Pass">Pass</SelectItem>
                                        <SelectItem value="Failed">Failed</SelectItem>
                                        <SelectItem value="Conditional Pass">Conditional Pass</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    record.result || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingHydrotestIndex === index ? (
                                    <Input 
                                      value={record.notes} 
                                      onChange={(e) => updateHydrotestField(index, 'notes', e.target.value)}
                                      className="w-[150px]"
                                    />
                                  ) : (
                                    record.notes || "-"
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end space-x-1">
                                    {editingHydrotestIndex === index ? (
                                      <Button 
                                        type="button" 
                                        variant="default" 
                                        size="icon" 
                                        onClick={() => setEditingHydrotestIndex(null)}
                                        className="h-7 w-7"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : (
                                      <>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => startEditingHydrotest(index)}
                                          className="h-7 w-7"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => deleteHydrotestRecord(index)}
                                          className="h-7 w-7 text-destructive"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center justify-between mt-4">
                        <div>
                          <Button 
                            type="button" 
                            variant="default" 
                            size="sm" 
                            onClick={addHydrotestRecord}
                            className="mr-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Hydrotest
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
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
                  </TabsContent>
                  
                  {/* Non-Conformance Tab */}
                  <TabsContent value="non-conformance" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Non-Conformance Records</h3>
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">NCR ID</TableHead>
                              <TableHead className="w-[100px]">Date</TableHead>
                              <TableHead className="w-[90px]">Status</TableHead>
                              <TableHead className="w-[250px]">Description</TableHead>
                              <TableHead className="w-[120px]">Disposition</TableHead>
                              <TableHead className="w-[250px]">Corrective Action</TableHead>
                              <TableHead className="w-[70px] text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(ncrRecords) && ncrRecords.map((record, index) => (
                              <TableRow key={record.id}>
                                <TableCell className="font-medium">{record.id}</TableCell>
                                <TableCell>
                                  {editingNcrIndex === index ? (
                                    <Input 
                                      type="date" 
                                      value={record.ncrDate} 
                                      onChange={(e) => updateNcrField(index, 'ncrDate', e.target.value)}
                                      className="w-[130px]"
                                    />
                                  ) : (
                                    record.ncrDate || "-"
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNcrIndex === index ? (
                                    <Select 
                                      value={record.ncrStatus}
                                      onValueChange={(value) => updateNcrField(index, 'ncrStatus', value)}
                                    >
                                      <SelectTrigger className="w-[100px]">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="open">Open</SelectItem>
                                        <SelectItem value="closed">Closed</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="void">Void</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant={
                                      record.ncrStatus === 'open' ? 'outline' : 
                                      record.ncrStatus === 'closed' ? 'default' : 
                                      record.ncrStatus === 'pending' ? 'secondary' : 
                                      'destructive'
                                    }>
                                      {record.ncrStatus.charAt(0).toUpperCase() + record.ncrStatus.slice(1)}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNcrIndex === index ? (
                                    <Textarea 
                                      value={record.ncrDescription} 
                                      onChange={(e) => updateNcrField(index, 'ncrDescription', e.target.value)}
                                      className="w-[250px] h-[80px]"
                                    />
                                  ) : (
                                    <div className="max-w-[250px] truncate" title={record.ncrDescription}>
                                      {record.ncrDescription || "-"}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNcrIndex === index ? (
                                    <Select 
                                      value={record.ncrDisposition}
                                      onValueChange={(value) => updateNcrField(index, 'ncrDisposition', value)}
                                    >
                                      <SelectTrigger className="w-[100px]">
                                        <SelectValue placeholder="Select disposition" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="rework">Rework</SelectItem>
                                        <SelectItem value="repair">Repair</SelectItem>
                                        <SelectItem value="useAsIs">Use As Is</SelectItem>
                                        <SelectItem value="scrap">Scrap / Reject</SelectItem>
                                        <SelectItem value="return">Return to Vendor</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <div className="capitalize">
                                      {record.ncrDisposition === 'useAsIs' ? 'Use As Is' : 
                                       record.ncrDisposition.replace(/([A-Z])/g, ' $1').trim() || "-"}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {editingNcrIndex === index ? (
                                    <Textarea 
                                      value={record.ncrCorrectiveAction} 
                                      onChange={(e) => updateNcrField(index, 'ncrCorrectiveAction', e.target.value)}
                                      className="w-[250px] h-[80px]"
                                    />
                                  ) : (
                                    <div className="max-w-[250px] truncate" title={record.ncrCorrectiveAction}>
                                      {record.ncrCorrectiveAction || "-"}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end space-x-1">
                                    {editingNcrIndex === index ? (
                                      <Button 
                                        type="button" 
                                        variant="default" 
                                        size="icon" 
                                        onClick={() => setEditingNcrIndex(null)}
                                        className="h-7 w-7"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                    ) : (
                                      <>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => startEditingNcr(index)}
                                          className="h-7 w-7"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => deleteNcrRecord(index)}
                                          className="h-7 w-7 text-destructive"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center justify-between mt-4">
                        <div>
                          <Button 
                            type="button" 
                            variant="default" 
                            size="sm" 
                            onClick={addNcrRecord}
                            className="mr-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add NCR
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          {editInspectionOrderDetails && ncrRecords && ncrRecords.length > 0 && ncrRecords[0].id && (
                            <>
                              <InspectionDocumentUpload
                                inspectionOrderNumber={editInspectionOrderDetails.inspectionOrderNumber}
                                tabName="NonConformance"
                                recordId={ncrRecords[0].id}
                                variant="outline"
                                size="sm"
                              />
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setShowNcrDocuments(!showNcrDocuments);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                {showNcrDocuments ? "Hide Documents" : "View Documents"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Document viewer section */}
                      {showNcrDocuments && editInspectionOrderDetails && ncrRecords && ncrRecords.length > 0 && ncrRecords[0].id && (
                        <div className="mt-4 border rounded-md p-3">
                          <h4 className="text-md font-medium mb-2">NCR Documents</h4>
                          <InspectionDocumentViewer
                            inspectionOrderNumber={editInspectionOrderDetails.inspectionOrderNumber}
                            tabName="NonConformance"
                            recordId={ncrRecords[0].id}
                            className="mt-2"
                          />
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Final Dossier Tab */}
                  <TabsContent 
                    value="final-dossier" 
                    className="p-4 border rounded-md mt-4"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">Final Documentation Dossier</h3>
                        {editInspectionOrderDetails && (
                          <Button 
                            type="button"
                            variant="default"
                            onClick={generateFinalDossier}
                            disabled={isGeneratingDossier || isCheckingDossier}
                            className="ml-auto"
                          >
                            {isGeneratingDossier ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating Dossier...
                              </>
                            ) : isCheckingDossier ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Checking for Dossier...
                              </>
                            ) : (
                              <>
                                <FileText className="h-4 w-4 mr-2" />
                                Generate Final Dossier
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6">
                          <FormField
                            control={editForm.control}
                            name="dossierNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dossier Number</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="Enter dossier number" 
                                    defaultValue={editInspectionOrderDetails ? `FD_${editInspectionOrderDetails.inspectionOrderNumber}` : ''}
                                    disabled
                                  />
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
                            {editInspectionOrderDetails && (
                              <>
                                <InspectionDocumentUpload
                                  inspectionOrderNumber={editInspectionOrderDetails.inspectionOrderNumber}
                                  tabName="Final Dossier"
                                  recordId="dossier"
                                  variant="outline"
                                  size="sm"
                                />
                                <Button 
                                  type="button"
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setShowDossierDocuments(!showDossierDocuments);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  {showDossierDocuments ? "Hide Documents" : "View Documents"}
                                </Button>
                                {/* Add Debug Button */}
                                <FinalDossierDebugButton 
                                  inspectionOrderNumber={editInspectionOrderDetails.inspectionOrderNumber} 
                                />
                              </>
                            )}
                          </div>
                          
                          {/* Document viewer section */}
                          {showDossierDocuments && editInspectionOrderDetails && (
                            <div className="mt-4 border rounded-md p-3">
                              <h4 className="text-md font-medium mb-2">Dossier Documents</h4>
                              {/* Warning about document listing */}
                              <div className="mb-4 p-2 rounded-md bg-amber-50 text-amber-600 text-sm">
                                <p className="mb-1 font-semibold">Note:</p>
                                <p>Individual dossier documents only appear here if they were uploaded directly through this interface. 
                                   The generated Final Dossier PDF may still be available even if no documents appear here.</p>
                              </div>
                              <InspectionDocumentViewer
                                inspectionOrderNumber={editInspectionOrderDetails.inspectionOrderNumber}
                                tabName="Final Dossier"
                                recordId="dossier"
                                className="mt-2"
                              />
                              {dossierUrl && (
                                <div className="mt-4">
                                  <Button 
                                    type="button"
                                    variant="default"
                                    onClick={() => window.open(dossierUrl, '_blank')}
                                    className="w-full"
                                  >
                                    <FileText className="h-4 w-4 mr-2" />
                                    View Final Dossier PDF
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
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
                              {Array.isArray(projects) && projects.map((project: any) => (
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
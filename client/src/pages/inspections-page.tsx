import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { Check, Edit, Trash, Eye, Plus, ClipboardCheck, ClipboardList, Calendar as CalendarIcon, CheckCircle2, AlertCircle, XCircle, FileText, Hourglass, Loader2, Edit2, Pencil, Trash2, X, FileCheck, BarChart3, ListChecks, FileOutput, Download, Upload, Filter, Search, Info } from "lucide-react";
import InspectionDocumentUpload from "@/components/inspection-document-upload";
import InspectionDocumentViewer from "@/components/inspection-document-viewer";
import DrawingFilesDisplay from "@/components/drawing-files-display";
import { ApprovedDrawingFileInfoSection } from "@/components/ApprovedDrawingFileInfoSection";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  materialType: z.string().optional(), // Material Type
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
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [keepProjectVisible, setKeepProjectVisible] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedInspectionOrder, setSelectedInspectionOrder] = useState<number | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInspectionOrder, setEditingInspectionOrder] = useState<number | null>(null);
  // NCR document viewing state removed per user request
  const [showDossierDocuments, setShowDossierDocuments] = useState(false);
  
  // State for final dossier generation
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false);
  const [isCheckingDossier, setIsCheckingDossier] = useState(false);
  const [dossierUrl, setDossierUrl] = useState<string | null>(null);
  const [documentationCounts, setDocumentationCounts] = useState<Record<string, number>>({});
  
  // Document upload state
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [documentUploadConfig, setDocumentUploadConfig] = useState<{
    inspectionOrderNumber: string;
    tabName: string;
    recordId: string;
  } | null>(null);
  
  // Document viewer state
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [documentViewerConfig, setDocumentViewerConfig] = useState<{
    inspectionOrderNumber: string;
    tabName: string;
    recordId: string;
  } | null>(null);
  
  // Inspection Orders section state
  const [activeOrdersTab, setActiveOrdersTab] = useState<string>("dashboard");
  const [ordersByStatus, setOrdersByStatus] = useState<{ status: string; count: number }[]>([]);
  const [ordersByMonth, setOrdersByMonth] = useState<{ month: string; count: number }[]>([]);
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [inspectionSchedule, setInspectionSchedule] = useState<any[]>([]);
  const [filteredReports, setFilteredReports] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Search functionality state
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Shop inspection state
  const [isShopInspectionDialogOpen, setIsShopInspectionDialogOpen] = useState(false);
  const [editingShopRecord, setEditingShopRecord] = useState<{
    id: string;
    inspectionType: string;
    inspector: string;
    date: string;
    status: string;
    remarks: string;
  } | null>(null);

  // Welding dialog state
  const [isWeldingDialogOpen, setIsWeldingDialogOpen] = useState(false);
  const [editingWeldRecord, setEditingWeldRecord] = useState<{
    id: string;
    weldType: string;
    weldProcess: string;
    wpqrDocument: string;
    welderId: string;
    weldStatus: string;
  } | null>(null);
  const [selectedWpqrForDialog, setSelectedWpqrForDialog] = useState<string>("");
  const [wpqrAssociatedWelders, setWpqrAssociatedWelders] = useState<any[]>([]);

  // NDT dialog state
  const [isNdtDialogOpen, setIsNdtDialogOpen] = useState(false);
  const [editingNdtRecord, setEditingNdtRecord] = useState<{
    id: string;
    ndtMethod: string;
    ndtStandard: string;
    ndtExtent: string;
    ndtTechnician: string;
    ndtDate: string;
    ndtResults: string;
  } | null>(null);

  // Visual Inspection dialog states
  const [isVisualDialogOpen, setIsVisualDialogOpen] = useState(false);
  const [editingVisualRecord, setEditingVisualRecord] = useState<{
    id: string;
    standard: string;
    dimensionalChecks: string;
    surfaceCondition: string;
    inspector: string;
    inspectionDate: string;
    observations: string;
  } | null>(null);

  // Material Traceability dialog states
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [selectedMaterialType, setSelectedMaterialType] = useState<string>("");
  const [editingMaterialRecord, setEditingMaterialRecord] = useState<{
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
    materialType?: string;
  } | null>(null);

  // Hydrotest dialog states
  const [isHydrotestDialogOpen, setIsHydrotestDialogOpen] = useState(false);
  const [editingHydrotestRecord, setEditingHydrotestRecord] = useState<{
    id: string;
    pressure: string;
    duration: string;
    medium: string;
    pressureGauge: string;
    operator: string;
    testDate: string;
    result: string;
    notes: string;
  } | null>(null);

  // Approved Drawing dialog states
  const [isApprovedDrawingDialogOpen, setIsApprovedDrawingDialogOpen] = useState(false);
  const [editingApprovedDrawingRecord, setEditingApprovedDrawingRecord] = useState<{
    id: string;
    drawingTitle: string;
    drawingNumber: string;
    revision: string;
    approvedBy: string;
    approvalDate: string;
    status: string;
    remarks: string;
  } | null>(null);

  // PMA dialog states
  const [isPmaDialogOpen, setIsPmaDialogOpen] = useState(false);
  const [editingPmaRecord, setEditingPmaRecord] = useState<{
    id: string;
    pmaNumber: string;
    materialSpecification: string;
    materialGrade: string;
    certifiedBy: string;
    issueDate: string;
    expiryDate: string;
    status: string;
    remarks: string;
  } | null>(null);

  // Procedures dialog states
  const [isProceduresDialogOpen, setIsProceduresDialogOpen] = useState(false);
  const [editingProcedureRecord, setEditingProcedureRecord] = useState<{
    id: string;
    procedureNumber: string;
    procedureName: string;
    ndtMethod: string;
    applicableStandard: string;
    linkedDate: string;
    linkedBy: string;
    notes: string;
  } | null>(null);
  const [shopInspectionRecords, setShopInspectionRecords] = useState<{
    id: string;
    inspectionType: string;
    inspector: string;
    date: string;
    status: string;
    remarks: string;
  }[]>([]);

  // Shop Inspection file upload states
  const [shopInspectionFiles, setShopInspectionFiles] = useState<File[]>([]);
  const [isUploadingShopFiles, setIsUploadingShopFiles] = useState(false);
  const [hasExistingShopFiles, setHasExistingShopFiles] = useState<boolean>(false);
  const [isCheckingExistingShopFiles, setIsCheckingExistingShopFiles] = useState<boolean>(false);
  const [hydrotestFiles, setHydrotestFiles] = useState<File[]>([]);
  const [isUploadingHydrotestFiles, setIsUploadingHydrotestFiles] = useState(false);
  const [hasExistingHydrotestFiles, setHasExistingHydrotestFiles] = useState(false);
  const [isCheckingExistingHydrotestFiles, setIsCheckingExistingHydrotestFiles] = useState(false);
  const [visualInspectionFiles, setVisualInspectionFiles] = useState<File[]>([]);
  const [isUploadingVisualFiles, setIsUploadingVisualFiles] = useState(false);
  const [hasExistingVisualFiles, setHasExistingVisualFiles] = useState(false);
  const [isCheckingExistingVisualFiles, setIsCheckingExistingVisualFiles] = useState(false);
  const [weldingFiles, setWeldingFiles] = useState<File[]>([]);
  const [isUploadingWeldFiles, setIsUploadingWeldFiles] = useState(false);
  const [hasExistingWeldFiles, setHasExistingWeldFiles] = useState(false);
  const [isCheckingExistingWeldFiles, setIsCheckingExistingWeldFiles] = useState(false);
  
  // NDT file upload states
  const [ndtFiles, setNdtFiles] = useState<File[]>([]);
  const [isUploadingNdtFiles, setIsUploadingNdtFiles] = useState(false);
  const [hasExistingNdtFiles, setHasExistingNdtFiles] = useState(false);
  const [isCheckingExistingNdtFiles, setIsCheckingExistingNdtFiles] = useState(false);
  
  // NCR file upload states
  const [ncrFiles, setNcrFiles] = useState<File[]>([]);
  const [isUploadingNcrFiles, setIsUploadingNcrFiles] = useState(false);
  const [hasExistingNcrFiles, setHasExistingNcrFiles] = useState(false);
  const [isCheckingExistingNcrFiles, setIsCheckingExistingNcrFiles] = useState(false);
  
  // Approved Drawing file upload states
  const [approvedDrawingFiles, setApprovedDrawingFiles] = useState<File[]>([]);
  const [isUploadingApprovedDrawingFiles, setIsUploadingApprovedDrawingFiles] = useState(false);
  const [hasExistingApprovedDrawingFiles, setHasExistingApprovedDrawingFiles] = useState(false);
  const [isCheckingExistingFiles, setIsCheckingExistingFiles] = useState(false);
  
  // DVR file upload states
  const [dvrFiles, setDvrFiles] = useState<File[]>([]);
  const [isUploadingDvrFiles, setIsUploadingDvrFiles] = useState(false);
  const [hasExistingDvrFiles, setHasExistingDvrFiles] = useState(false);
  const [isCheckingExistingDvrFiles, setIsCheckingExistingDvrFiles] = useState(false);
  
  const [approvedDrawingRecords, setApprovedDrawingRecords] = useState<{
    id: string;
    drawingTitle: string;
    drawingNumber: string;
    revision: string;
    approvedBy: string;
    approvalDate: string;
    status: string;
    remarks: string;
  }[]>([]);

  // PMA Records state
  const [pmaRecords, setPmaRecords] = useState<{
    id: string;
    pmaNumber: string;
    materialSpecification: string;
    materialGrade: string;
    certifiedBy: string;
    issueDate: string;
    expiryDate: string;
    status: string;
    remarks: string;
  }[]>([]);
  const [selectedPmaDocument, setSelectedPmaDocument] = useState<string>("");
  const [selectedPmaStatus, setSelectedPmaStatus] = useState<string>("");

  // Procedures Records state
  const [procedureRecords, setProcedureRecords] = useState<{
    id: string;
    procedureNumber: string;
    procedureName: string;
    ndtMethod: string;
    applicableStandard: string;
    linkedDate: string;
    linkedBy: string;
    notes: string;
  }[]>([]);

  // DVR Records state
  const [dvrRecords, setDvrRecords] = useState<{
    id: string;
    documentTitle: string;
    documentNumber: string;
    revision: string;
    verifiedBy: string;
    verificationDate: string;
    status: string;
    remarks: string;
  }[]>([]);
  const [isDvrDialogOpen, setIsDvrDialogOpen] = useState(false);
  const [editingDvrRecord, setEditingDvrRecord] = useState<{
    id: string;
    documentTitle: string;
    documentNumber: string;
    revision: string;
    verifiedBy: string;
    verificationDate: string;
    status: string;
    remarks: string;
  } | null>(null);

  // ITP Records state
  const [itpRecords, setItpRecords] = useState<{
    id: string;
    itpNumber: string;
    itemDescription: string;
    inspectionStage: string;
    inspector: string;
    inspectionDate: string;
    status: string;
    remarks: string;
  }[]>([]);
  const [isItpDialogOpen, setIsItpDialogOpen] = useState(false);
  const [editingItpRecord, setEditingItpRecord] = useState<{
    id: string;
    itpNumber: string;
    itemDescription: string;
    inspectionStage: string;
    inspector: string;
    inspectionDate: string;
    status: string;
    remarks: string;
  } | null>(null);

  // ITP file upload state
  const [itpFiles, setItpFiles] = useState<File[]>([]);
  const [isUploadingItpFiles, setIsUploadingItpFiles] = useState(false);
  const [hasExistingItpFiles, setHasExistingItpFiles] = useState(false);
  const [isCheckingExistingItpFiles, setIsCheckingExistingItpFiles] = useState(false);
  
  // Load project selection and keep visible state from localStorage on component mount
  useEffect(() => {
    const savedProject = localStorage.getItem('inspections-selected-project');
    const savedKeepVisible = localStorage.getItem('inspections-keep-visible');
    
    if (savedProject && savedKeepVisible === 'true') {
      const projectId = parseInt(savedProject);
      if (!isNaN(projectId)) {
        setSelectedProject(projectId);
      }
    }
    
    if (savedKeepVisible) {
      setKeepProjectVisible(savedKeepVisible === 'true');
    }
  }, []);
  
  // Save project selection and keep visible state to localStorage when changed
  useEffect(() => {
    if (keepProjectVisible && selectedProject) {
      localStorage.setItem('inspections-selected-project', selectedProject.toString());
    } else {
      localStorage.removeItem('inspections-selected-project');
    }
    localStorage.setItem('inspections-keep-visible', keepProjectVisible.toString());
  }, [selectedProject, keepProjectVisible]);

  // Initialize WPQR selection when editing a weld record
  useEffect(() => {
    if (editingWeldRecord?.wpqrDocument) {
      setSelectedWpqrForDialog(editingWeldRecord.wpqrDocument);
    } else {
      setSelectedWpqrForDialog("");
    }
  }, [editingWeldRecord]);

  // Function to get filtered welders based on selected WPQR document
  const getFilteredWelders = () => {
    // If no WPQR is selected, show all active welders
    if (!selectedWpqrForDialog) {
      return welders.filter((welder: any) => welder.status === 'Active');
    }
    
    // If WPQR is selected but we don't have the associated welders data yet, show loading
    if (isLoadingWpqrWelders) {
      return [];
    }
    
    // Debug logging
    console.log("selectedWpqrForDialog:", selectedWpqrForDialog);
    console.log("wpqrAssociatedWeldersData:", wpqrAssociatedWeldersData);
    console.log("isLoadingWpqrWelders:", isLoadingWpqrWelders);
    
    // If WPQR is selected and we have the data, show only associated active welders
    const associatedWelders = wpqrAssociatedWeldersData.filter((welder: any) => 
      welder.status === 'Active'
    );
    
    console.log("associatedWelders after filter:", associatedWelders);
    
    return associatedWelders.length > 0 ? associatedWelders : [];
  };

  // Function to get filtered weld process options based on selected WPQR document
  const getFilteredWeldProcessOptions = () => {
    if (!selectedWpqrForDialog || !wpqrDocuments.length) {
      // If no WPQR selected, show all options
      return [
        { value: "smaw", label: "SMAW (Shielded Metal Arc Welding)" },
        { value: "gtaw", label: "GTAW (TIG Welding)" },
        { value: "gmaw", label: "GMAW (MIG Welding)" },
        { value: "fcaw", label: "FCAW (Flux-Cored Arc Welding)" },
        { value: "saw", label: "SAW (Submerged Arc Welding)" },
        { value: "gtaw_smaw", label: "GTAW (141) + SMAW (111)" },
        { value: "gtaw_gmaw", label: "GTAW (141) + GMAW (135)" },
        { value: "gtaw_fcaw", label: "GTAW (141) + FCAW (136/137)" },
        { value: "smaw_gmaw", label: "SMAW (111) + GMAW (135)" },
        { value: "smaw_fcaw", label: "SMAW (111) + FCAW (136/137)" },
        { value: "smaw_saw", label: "SMAW (111) + SAW (121)" },
        { value: "gtaw_saw", label: "GTAW (141) + SAW (121)" },
        { value: "gmaw_fcaw", label: "GMAW (135) + FCAW (136/137)" },
        { value: "gmaw_saw", label: "GMAW (135) + SAW (121)" }
      ];
    }

    // Find the selected WPQR document
    const selectedWpqr = wpqrDocuments.find((doc: any) => 
      (doc.documentNumber || doc.id.toString()) === selectedWpqrForDialog
    );

    if (!selectedWpqr || !selectedWpqr.welderProcess) {
      // If WPQR not found or no weld process, show all options
      return [
        { value: "smaw", label: "SMAW (Shielded Metal Arc Welding)" },
        { value: "gtaw", label: "GTAW (TIG Welding)" },
        { value: "gmaw", label: "GMAW (MIG Welding)" },
        { value: "fcaw", label: "FCAW (Flux-Cored Arc Welding)" },
        { value: "saw", label: "SAW (Submerged Arc Welding)" },
        { value: "gtaw_smaw", label: "GTAW (141) + SMAW (111)" },
        { value: "gtaw_gmaw", label: "GTAW (141) + GMAW (135)" },
        { value: "gtaw_fcaw", label: "GTAW (141) + FCAW (136/137)" },
        { value: "smaw_gmaw", label: "SMAW (111) + GMAW (135)" },
        { value: "smaw_fcaw", label: "SMAW (111) + FCAW (136/137)" },
        { value: "smaw_saw", label: "SMAW (111) + SAW (121)" },
        { value: "gtaw_saw", label: "GTAW (141) + SAW (121)" },
        { value: "gmaw_fcaw", label: "GMAW (135) + FCAW (136/137)" },
        { value: "gmaw_saw", label: "GMAW (135) + SAW (121)" }
      ];
    }

    // Create a map of all possible weld processes
    const allProcesses = {
      "smaw": "SMAW (Shielded Metal Arc Welding)",
      "gtaw": "GTAW (TIG Welding)",
      "gmaw": "GMAW (MIG Welding)",
      "fcaw": "FCAW (Flux-Cored Arc Welding)",
      "saw": "SAW (Submerged Arc Welding)",
      "gtaw_smaw": "GTAW (141) + SMAW (111)",
      "gtaw_gmaw": "GTAW (141) + GMAW (135)",
      "gtaw_fcaw": "GTAW (141) + FCAW (136/137)",
      "smaw_gmaw": "SMAW (111) + GMAW (135)",
      "smaw_fcaw": "SMAW (111) + FCAW (136/137)",
      "smaw_saw": "SMAW (111) + SAW (121)",
      "gtaw_saw": "GTAW (141) + SAW (121)",
      "gmaw_fcaw": "GMAW (135) + FCAW (136/137)",
      "gmaw_saw": "GMAW (135) + SAW (121)"
    };

    // Filter options based on the WPQR document's weld process
    const wpqrProcess = selectedWpqr.welderProcess.toLowerCase();
    
    // If the WPQR process matches exactly, return just that option
    if (allProcesses[wpqrProcess as keyof typeof allProcesses]) {
      return [{ 
        value: wpqrProcess, 
        label: allProcesses[wpqrProcess as keyof typeof allProcesses] 
      }];
    }

    // If it's a combination process, return all relevant processes
    const filteredOptions = Object.entries(allProcesses)
      .filter(([value, label]) => {
        // If WPQR contains multiple processes, show matching ones
        return wpqrProcess.includes(value) || value.includes(wpqrProcess);
      })
      .map(([value, label]) => ({ value, label }));

    return filteredOptions.length > 0 ? filteredOptions : [
      { value: "smaw", label: "SMAW (Shielded Metal Arc Welding)" },
      { value: "gtaw", label: "GTAW (TIG Welding)" },
      { value: "gmaw", label: "GMAW (MIG Welding)" },
      { value: "fcaw", label: "FCAW (Flux-Cored Arc Welding)" },
      { value: "saw", label: "SAW (Submerged Arc Welding)" },
      { value: "gtaw_smaw", label: "GTAW (141) + SMAW (111)" },
      { value: "gtaw_gmaw", label: "GTAW (141) + GMAW (135)" },
      { value: "gtaw_fcaw", label: "GTAW (141) + FCAW (136/137)" },
      { value: "smaw_gmaw", label: "SMAW (111) + GMAW (135)" },
      { value: "smaw_fcaw", label: "SMAW (111) + FCAW (136/137)" },
      { value: "smaw_saw", label: "SMAW (111) + SAW (121)" },
      { value: "gtaw_saw", label: "GTAW (141) + SAW (121)" },
      { value: "gmaw_fcaw", label: "GMAW (135) + FCAW (136/137)" },
      { value: "gmaw_saw", label: "GMAW (135) + SAW (121)" }
    ];
  };
  
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
  const [selectedNdtRecord, setSelectedNdtRecord] = useState<any | null>(null);
  const [selectedWeldRecord, setSelectedWeldRecord] = useState<any | null>(null);
  
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
  // Define the VisualRecord type to make it more specific
  type VisualRecord = {
    id: string;
    standard: string;
    inspector: string;
    dimensionalChecks: string;
    surfaceCondition: string;
    inspectionDate: string;
    observations: string;
  };

  const [editingVisualIndex, setEditingVisualIndex] = useState<number | null>(null);
  
  // Hydrotest management state
  const [hydrotestRecords, setHydrotestRecords] = useState<{
    id: string;
    pressure: string;
    duration: string;
    medium: string;
    pressureGauge: string;
    operator: string;
    testDate: string;
    result: string;
    notes: string;
  }[]>([{
    id: 'HT-1',
    pressure: '10.0',
    duration: '30',
    medium: 'water',
    pressureGauge: '',
    operator: '',
    testDate: '',
    result: 'Pass',
    notes: ''
  }]);
  // Define HydrotestRecord type for better type safety
  type HydrotestRecord = {
    id: string;
    pressure: string;
    duration: string;
    medium: string;
    pressureGauge: string;
    operator: string;
    testDate: string;
    result: string;
    notes: string;
  };


  
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
  // NCR dialog state
  const [isNcrDialogOpen, setIsNcrDialogOpen] = useState(false);
  const [editingNcrRecord, setEditingNcrRecord] = useState<any>(null);
  
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


  
  // Helper function to get weld type display name
  const getWeldTypeName = (weldType: string): string => {
    const weldTypes: Record<string, string> = {
      'butt_circ': 'Butt Weld Circ seam',
      'butt_long': 'Butt Weld Long seam',
      'fillet': 'Fillet Weld',
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
      'saw': 'SAW (Submerged Arc Welding)',
      'gtaw_smaw': 'GTAW (141) + SMAW (111)',
      'gtaw_gmaw': 'GTAW (141) + GMAW (135)',
      'gtaw_fcaw': 'GTAW (141) + FCAW (136/137)',
      'smaw_gmaw': 'SMAW (111) + GMAW (135)',
      'smaw_fcaw': 'SMAW (111) + FCAW (136/137)',
      'smaw_saw': 'SMAW (111) + SAW (121)',
      'gtaw_saw': 'GTAW (141) + SAW (121)',
      'gmaw_fcaw': 'GMAW (135) + FCAW (136/137)',
      'gmaw_saw': 'GMAW (135) + SAW (121)'
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
  
  // Delete a weld record with complete GCS cleanup
  const deleteWeldRecord = async (weldRecord: any, index: number) => {
    try {
      console.log(`🔥 Starting deletion of Welding record: ${weldRecord.id}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // Fetch associated documents first
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=Welding&recordId=${weldRecord.id}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const documentsResponse = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      console.log(`Documents fetch response status: ${documentsResponse.status}`);
      
      if (documentsResponse.ok) {
        const documents = await documentsResponse.json();
        console.log(`Raw response:`, JSON.stringify(documents));
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        // Delete each document with GCS cleanup
        let successCount = 0;
        let failCount = 0;
        
        for (const doc of documents) {
          console.log(`🔥 Attempting to delete document ${doc.id}: ${doc.fileName}`);
          console.log(`🔥 Using dedicated endpoint for Welding deletion`);
          
          const deleteResponse = await fetch(`/api/quality/inspection-documents/welding-delete/${editInspectionOrderDetails?.inspectionOrderNumber}/${weldRecord.id}/${doc.id}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          
          console.log(`🔥 Delete response status: ${deleteResponse.status}`);
          
          if (deleteResponse.ok) {
            const result = await deleteResponse.json();
            console.log(`🔥 Delete result:`, result);
            
            if (result.success) {
              console.log(`🔥 ✅ Document ${doc.fileName} deleted successfully (${result.gcsStatus === 'success' && result.databaseStatus === 'success' ? 'Complete Success' : 'Partial Success'})`);
              if (result.details) {
                console.log(`🔥 Details: ${result.details}`);
              }
              successCount++;
            } else {
              console.log(`🔥 ❌ Failed to delete document ${doc.fileName}: ${result.message}`);
              failCount++;
            }
          } else {
            console.log(`🔥 ❌ Delete request failed for ${doc.fileName} with status ${deleteResponse.status}`);
            failCount++;
          }
        }
        
        console.log(`Document deletion summary: ${successCount} successful, ${failCount} failed`);
        
        if (successCount > 0) {
          toast({
            title: failCount === 0 ? "Welding Record Deleted Successfully" : "Welding Record Partially Deleted",
            description: failCount === 0 
              ? `Successfully deleted ${successCount} document(s) and removed from welding records.`
              : `Deleted ${successCount} document(s), but ${failCount} document(s) could not be removed from cloud storage.`,
            variant: failCount === 0 ? "default" : "destructive",
          });
        } else if (documents.length > 0) {
          toast({
            title: "Document Deletion Failed",
            description: "Could not delete associated documents from cloud storage, but record will be removed.",
            variant: "destructive",
          });
        }
      } else {
        console.log(`Failed to fetch documents: ${documentsResponse.status}`);
        toast({
          title: "Warning",
          description: "Could not check for associated documents. Record will be removed from frontend only.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error during Welding record deletion:', error);
      toast({
        title: "Deletion Error",
        description: "An error occurred during deletion. Record will be removed from frontend only.",
        variant: "destructive",
      });
    }
    
    // Remove from frontend state (always proceed with this)
    const updatedWelds = [...welds];
    updatedWelds.splice(index, 1);
    
    // Renumber welds after deletion
    const renumberedWelds = updatedWelds.map((weld, idx) => ({
      ...weld,
      id: `W-${idx + 1}`
    }));
    
    setWelds(renumberedWelds);
    
    // Clear selection if the deleted weld was selected
    if (selectedWeldRecord?.id === weldRecord.id) {
      setSelectedWeldRecord(null);
    }
    
    if (editingWeldIndex === index) {
      setEditingWeldIndex(null);
    }
  };

  // Legacy delete function with confirmation dialog
  const deleteWeld = (index: number) => {
    const weldRecord = welds[index];
    if (weldRecord) {
      const confirmDelete = window.confirm(
        `Are you sure you want to delete Welding record "${weldRecord.id}"?\n\n` +
        `This will permanently delete:\n` +
        `• The welding record from the database\n` +
        `• All associated documents from cloud storage\n\n` +
        `This action cannot be undone.`
      );
      
      if (confirmDelete) {
        deleteWeldRecord(weldRecord, index);
      }
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
  

  
  // Add new Visual Inspection record via dialog
  const addVisualRecord = (recordData: {
    id: string;
    standard: string;
    dimensionalChecks: string;
    surfaceCondition: string;
    inspector: string;
    inspectionDate: string;
    observations: string;
  }) => {
    setVisualRecords([...visualRecords, recordData]);
    setIsVisualDialogOpen(false);
    toast({
      title: "Visual Inspection Record Added",
      description: `Visual inspection record ${recordData.id} has been added successfully.`
    });
  };

  // Edit Visual Inspection record via dialog with file replacement support
  const editVisualRecord = async (recordData: {
    id: string;
    standard: string;
    dimensionalChecks: string;
    surfaceCondition: string;
    inspector: string;
    inspectionDate: string;
    observations: string;
  }) => {
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Update Record",
        description: "Project code not found. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploadingVisualFiles(true);

      // Delete existing files before uploading new ones if files are being replaced
      if (visualInspectionFiles.length > 0) {
        console.log("🗑️ Deleting existing Visual Inspection files before uploading replacements...");
        
        try {
          // Fetch existing documents for this record
          const documentsResponse = await fetch(
            `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/VisualInspection/${recordData.id}/documents`
          );
          
          if (documentsResponse.ok) {
            const existingDocuments = await documentsResponse.json();
            console.log(`📄 Found ${existingDocuments.length} existing Visual Inspection documents to delete`);
            
            // Delete each existing document
            for (const doc of existingDocuments) {
              try {
                const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                  method: 'DELETE'
                });
                
                if (deleteResponse.ok) {
                  console.log(`✅ Successfully deleted Visual Inspection document: ${doc.fileName}`);
                } else {
                  console.log(`⚠️ Failed to delete Visual Inspection document: ${doc.fileName}`);
                }
              } catch (deleteError) {
                console.log(`❌ Error deleting Visual Inspection document ${doc.fileName}:`, deleteError);
              }
            }
          }
        } catch (error) {
          console.log("⚠️ Error fetching existing Visual Inspection documents:", error);
          // Continue with upload even if deletion fails
        }

        // Upload replacement files
        for (const file of visualInspectionFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('tabName', 'VisualInspection');
          formData.append('recordId', recordData.id);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData
          });

          if (!uploadResponse.ok) {
            const error = await uploadResponse.text();
            throw new Error(`Failed to upload ${file.name}: ${error}`);
          }
        }

        toast({
          title: "Files Replaced Successfully",
          description: `Visual inspection record updated with ${visualInspectionFiles.length} replacement file(s) uploaded.`,
        });
      }

      // Update the record in state
      setVisualRecords(prev => prev.map(record => 
        record.id === recordData.id ? recordData : record
      ));

      // Close dialog and clean up state
      setIsVisualDialogOpen(false);
      setEditingVisualRecord(null);
      setVisualInspectionFiles([]);
      setHasExistingVisualFiles(false);
      setIsCheckingExistingVisualFiles(false);

      toast({
        title: "Visual Inspection Record Updated",
        description: `Visual inspection record ${recordData.id} has been updated successfully${visualInspectionFiles.length > 0 ? ' with replacement files' : ''}.`
      });

    } catch (error) {
      console.error("Error updating visual inspection record:", error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update visual inspection record. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingVisualFiles(false);
    }
  };

  // Start editing Visual Inspection record
  const startEditingVisualRecord = async (record: any) => {
    setEditingVisualRecord(record);
    setIsVisualDialogOpen(true);
    
    // Check for existing files when editing
    const hasFiles = await checkExistingVisualFiles(record.id);
    setHasExistingVisualFiles(hasFiles);
  };

  // Helper function to generate hydrotest record ID
  const generateHydrotestId = () => {
    const existingIds = hydrotestRecords.map(record => record.id);
    let newIdNumber = 1;
    let newId = `HT-${newIdNumber}`;
    
    while (existingIds.includes(newId)) {
      newIdNumber++;
      newId = `HT-${newIdNumber}`;
    }
    
    return newId;
  };

  // Add new Hydrotest record via dialog with file upload support
  const addHydrotestRecord = async (recordData: {
    pressure: string;
    duration: string;
    medium: string;
    pressureGauge: string;
    operator: string;
    testDate: string;
    result: string;
    notes: string;
  }) => {
    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Create Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    const newRecordId = generateHydrotestId();
    const newRecord = {
      id: newRecordId,
      ...recordData
    };

    // Handle file uploads if any files are selected
    if (hydrotestFiles.length > 0) {
      setIsUploadingHydrotestFiles(true);
      
      try {
        // Upload files for this specific record
        for (const file of hydrotestFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
          formData.append('tabName', 'Hydrotest');
          formData.append('recordId', newRecordId);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload ${file.name}`);
          }
        }

        toast({
          title: "Files Uploaded Successfully",
          description: `${hydrotestFiles.length} file(s) uploaded for Hydrotest record ${newRecordId}`,
        });
      } catch (error: any) {
        console.error("Error uploading files:", error);
        toast({
          title: "File Upload Error",
          description: error.message || "Some files could not be uploaded. Please try again.",
          variant: "destructive",
        });
        setIsUploadingHydrotestFiles(false);
        return;
      }
      
      setIsUploadingHydrotestFiles(false);
      setHydrotestFiles([]); // Clear selected files
    }

    setHydrotestRecords([...hydrotestRecords, newRecord]);
    setIsHydrotestDialogOpen(false);
    
    toast({
      title: "Success",
      description: "Hydrotest record added successfully" + (hydrotestFiles.length > 0 ? " with uploaded files" : ""),
    });
  };

  // Edit Hydrotest record via dialog with file replacement support
  const editHydrotestRecord = async (recordData: {
    id: string;
    pressure: string;
    duration: string;
    medium: string;
    pressureGauge: string;
    operator: string;
    testDate: string;
    result: string;
    notes: string;
  }) => {
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Update Record",
        description: "Project code not found. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploadingHydrotestFiles(true);

      // Delete existing files before uploading new ones if files are being replaced
      if (hydrotestFiles.length > 0) {
        console.log("🗑️ Deleting existing Hydrotest files before uploading replacements...");
        
        try {
          // Fetch existing documents for this record
          const documentsResponse = await fetch(
            `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/Hydrotest/${recordData.id}/documents`
          );
          
          if (documentsResponse.ok) {
            const existingDocuments = await documentsResponse.json();
            console.log(`📄 Found ${existingDocuments.length} existing Hydrotest documents to delete`);
            
            // Delete each existing document
            for (const doc of existingDocuments) {
              try {
                const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                  method: 'DELETE'
                });
                
                if (deleteResponse.ok) {
                  console.log(`✅ Successfully deleted Hydrotest document: ${doc.fileName}`);
                } else {
                  console.log(`⚠️ Failed to delete Hydrotest document: ${doc.fileName}`);
                }
              } catch (deleteError) {
                console.log(`❌ Error deleting Hydrotest document ${doc.fileName}:`, deleteError);
              }
            }
          }
        } catch (error) {
          console.log("⚠️ Error fetching existing Hydrotest documents:", error);
          // Continue with upload even if deletion fails
        }

        // Upload replacement files
        for (const file of hydrotestFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('tabName', 'Hydrotest');
          formData.append('recordId', recordData.id);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData
          });

          if (!uploadResponse.ok) {
            const error = await uploadResponse.text();
            throw new Error(`Failed to upload ${file.name}: ${error}`);
          }
        }

        toast({
          title: "Files Replaced Successfully",
          description: `Hydrotest record updated with ${hydrotestFiles.length} replacement file(s) uploaded.`,
        });
      }

      // Update the record in state
      setHydrotestRecords(prev => prev.map(record => 
        record.id === recordData.id ? recordData : record
      ));

      // Close dialog and clean up state
      setIsHydrotestDialogOpen(false);
      setEditingHydrotestRecord(null);
      setHydrotestFiles([]);
      setHasExistingHydrotestFiles(false);
      setIsCheckingExistingHydrotestFiles(false);

      toast({
        title: "Hydrotest Record Updated",
        description: `Hydrotest record ${recordData.id} has been updated successfully${hydrotestFiles.length > 0 ? ' with replacement files' : ''}.`
      });

    } catch (error) {
      console.error("Error updating hydrotest record:", error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update hydrotest record. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingHydrotestFiles(false);
    }
  };

  // Start editing Hydrotest record
  const startEditingHydrotestRecord = async (record: any) => {
    setEditingHydrotestRecord(record);
    setIsHydrotestDialogOpen(true);
    
    // Check for existing files when editing
    const hasFiles = await checkExistingHydrotestFiles(record.id);
    setHasExistingHydrotestFiles(hasFiles);
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
      
      console.log('Final Dossier API Response:', response.status, response.statusText);
      
      if (!response.ok) {
        console.error('Final Dossier API Error:', response.status, response.statusText);
        throw new Error(`Failed to check for existing final dossier: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      console.log('Response Content Type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Received HTML instead of JSON:', text.substring(0, 200) + '...');
        console.error('Error parsing response:', {});
        throw new Error('Received HTML instead of JSON response from server');
      }
      
      const data = await response.json();
      
      // In development environment, signed URLs may fail but file can still exist
      if (data.exists) {
        // Set URL if available, otherwise we'll handle download differently
        if (data.url) {
          setDossierUrl(data.url);
        } else {
          // Use a fallback download URL that goes through our download endpoint
          const fallbackUrl = `/api/quality/final-dossier/download/${encodeURIComponent(data.path)}`;
          setDossierUrl(fallbackUrl);
        }
        
        // Automatically show the documents section when a dossier is found
        setShowDossierDocuments(true);
        // Display success toast to notify user
        toast({
          title: "Final Dossier Found",
          description: data.url 
            ? "An existing Final Dossier was found and is ready to view"
            : "An existing Final Dossier was found (using fallback download method)",
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
  
  // Helper function to generate NCR record ID
  const generateNcrId = () => {
    const existingIds = ncrRecords.map(record => record.id);
    let newIdNumber = 1;
    let newId = `NCR-${newIdNumber}`;
    
    while (existingIds.includes(newId)) {
      newIdNumber++;
      newId = `NCR-${newIdNumber}`;
    }
    
    return newId;
  };

  // Add new NCR record via dialog with file upload support
  const addNcrRecord = async (recordData: {
    id: string;
    ncrDate: string;
    ncrStatus: string;
    ncrDescription: string;
    ncrDisposition: string;
    ncrCorrectiveAction: string;
  }) => {
    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Create Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    const newRecord = {
      ...recordData
    };

    // Handle file uploads if any files are selected
    if (ncrFiles.length > 0) {
      setIsUploadingNcrFiles(true);
      
      try {
        // Upload files for this specific record
        for (const file of ncrFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
          formData.append('tabName', 'NonConformance');
          formData.append('recordId', recordData.id);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload ${file.name}`);
          }
        }

        toast({
          title: "Files Uploaded Successfully",
          description: `${ncrFiles.length} file(s) uploaded for NCR record ${recordData.id}`,
        });
      } catch (error: any) {
        console.error("Error uploading files:", error);
        toast({
          title: "File Upload Error",
          description: error.message || "Some files could not be uploaded. Please try again.",
          variant: "destructive",
        });
        setIsUploadingNcrFiles(false);
        return;
      }
      
      setIsUploadingNcrFiles(false);
      setNcrFiles([]); // Clear selected files
    }

    setNcrRecords(prev => [...prev, newRecord]);
    setIsNcrDialogOpen(false);
    
    toast({
      title: "Success",
      description: "NCR record added successfully" + (ncrFiles.length > 0 ? " with files" : ""),
    });
  };

  // Update NCR record via dialog
  const updateNcrRecord = async (recordData: {
    ncrDate: string;
    ncrStatus: string;
    ncrDescription: string;
    ncrDisposition: string;
    ncrCorrectiveAction: string;
  }) => {
    if (!editingNcrRecord) return;
    
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Update Record",
        description: "Project code not found. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsUploadingNcrFiles(true);

      // Delete existing files before uploading new ones if files are being replaced
      if (ncrFiles.length > 0) {
        console.log("🗑️ Deleting existing NCR files before uploading replacements...");
        
        try {
          // Fetch existing documents for this record
          const documentsResponse = await fetch(
            `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/NCR/${editingNcrRecord.id}/documents`
          );
          
          if (documentsResponse.ok) {
            const existingDocuments = await documentsResponse.json();
            console.log(`📄 Found ${existingDocuments.length} existing NCR documents to delete`);
            
            // Delete each existing document
            for (const doc of existingDocuments) {
              try {
                const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                  method: 'DELETE'
                });
                
                if (deleteResponse.ok) {
                  console.log(`✅ Successfully deleted NCR document ${doc.id}`);
                } else {
                  console.error(`❌ Failed to delete NCR document ${doc.id}`);
                }
              } catch (deleteError) {
                console.error(`❌ Error deleting NCR document ${doc.id}:`, deleteError);
              }
            }
          }
        } catch (documentsError) {
          console.error("Error fetching existing NCR documents:", documentsError);
        }
      }
      
      setNcrRecords(prev => 
        prev.map(record => 
          record.id === editingNcrRecord.id 
            ? { ...record, ...recordData }
            : record
        )
      );

      // Upload replacement files if any were selected
      if (ncrFiles.length > 0) {
        console.log(`📤 Uploading ${ncrFiles.length} replacement NCR file(s)...`);
        
        for (const file of ncrFiles) {
          const formData = new FormData();
          formData.append('files', file);
          formData.append('tabName', 'NCR');
          formData.append('recordId', editingNcrRecord.id);

          try {
            const response = await fetch(`/api/quality/inspection-documents/upload/${editInspectionOrderDetails.inspectionOrderNumber}`, {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log(`✅ Successfully uploaded replacement NCR file: ${file.name}`);
          } catch (error) {
            console.error(`❌ Error uploading NCR file ${file.name}:`, error);
            throw error;
          }
        }

        toast({
          title: "Success",
          description: `NCR record updated successfully with ${ncrFiles.length} replacement file(s).`,
        });
      } else {
        toast({
          title: "Success", 
          description: "NCR record updated successfully.",
        });
      }
      
      setIsNcrDialogOpen(false);
      setEditingNcrRecord(null);
      setNcrFiles([]);
      setHasExistingNcrFiles(false);
      setIsCheckingExistingNcrFiles(false);
      
    } catch (error) {
      console.error("Error updating NCR record:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update NCR record. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingNcrFiles(false);
    }
  };

  // Add new Material Traceability record via dialog
  const addMaterialRecord = (recordData: {
    materialId?: number;
    materialIdentificationId?: string;
    materialCertificateNumber?: string;
    heatNumber?: string;
    materialGrade?: string;
    materialSpecification?: string;
    allocatedQuantity?: string;
    quantityUnit?: string;
    description?: string;
    materialType?: string;
  }) => {
    const newRecord = {
      id: Date.now(), // Generate unique ID
      ...recordData
    };
    setMaterialRows(prev => [...prev, newRecord]);
    editForm.setValue('materials', [...materialRows, newRecord]);
    setIsMaterialDialogOpen(false);
    toast({
      title: "Success",
      description: "Material record added successfully",
    });
  };

  // Update Material Traceability record via dialog
  const updateMaterialRecord = (recordData: {
    materialId?: number;
    materialIdentificationId?: string;
    materialCertificateNumber?: string;
    heatNumber?: string;
    materialGrade?: string;
    materialSpecification?: string;
    allocatedQuantity?: string;
    quantityUnit?: string;
    description?: string;
    materialType?: string;
  }) => {
    if (!editingMaterialRecord) return;
    
    setMaterialRows(prev => 
      prev.map(record => 
        record.id === editingMaterialRecord.id 
          ? { ...record, ...recordData }
          : record
      )
    );
    
    const updatedRows = materialRows.map(record => 
      record.id === editingMaterialRecord.id 
        ? { ...record, ...recordData }
        : record
    );
    editForm.setValue('materials', updatedRows);
    
    setIsMaterialDialogOpen(false);
    setEditingMaterialRecord(null);
    
    toast({
      title: "Success",
      description: "Material record updated successfully",
    });
  };

  // Function to delete a Material Traceability record (only removes from state, does not delete GCS files)
  const deleteMaterialRecord = (recordId: number) => {
    setMaterialRows(prev => prev.filter(record => record.id !== recordId));
    
    // Also update the form value
    const updatedRows = materialRows.filter(record => record.id !== recordId);
    editForm.setValue('materials', updatedRows);
    
    toast({
      title: "Success",
      description: "Material record deleted successfully. Associated files remain in storage.",
    });
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
  
  // Fetch welders associated with selected WPQR document
  const {
    data: wpqrAssociatedWeldersData = [],
    isLoading: isLoadingWpqrWelders
  } = useQuery({
    queryKey: ['/api/quality/wpqr', selectedWpqrForDialog, 'welders'],
    queryFn: async () => {
      console.log("[WPQR Welders Query] Starting fetch for:", selectedWpqrForDialog);
      
      if (!selectedWpqrForDialog) return [];
      
      // Find the WPQR document ID from the document number
      const selectedWpqr = wpqrDocuments.find((doc: any) => 
        (doc.documentNumber || doc.id.toString()) === selectedWpqrForDialog
      );
      
      console.log("[WPQR Welders Query] Selected WPQR:", selectedWpqr);
      
      if (!selectedWpqr) return [];
      
      const url = `/api/quality/wpqr/${selectedWpqr.id}/welders`;
      console.log("[WPQR Welders Query] Fetching from URL:", url);
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      console.log("[WPQR Welders Query] Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[WPQR Welders Query] Error response:", errorText);
        throw new Error(`Failed to fetch WPQR welders: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log("[WPQR Welders Query] Success data:", data);
      
      return data;
    },
    enabled: !!selectedWpqrForDialog && wpqrDocuments.length > 0,
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache the results
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
      
      const response = await fetch(`/api/quality/inspection-orders/project/${projectId}?t=${Date.now()}`); // Add cache buster
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch inspection orders");
      }
      
      return response.json();
    },
    enabled: !!selectedProject,
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache
  });

  // Organize inspection orders hierarchically (similar to production planning)
  const organizedInspectionOrders = React.useMemo(() => {
    if (!inspectionOrders || inspectionOrders.length === 0) return [];

    const parentAssemblies: any[] = [];
    const components: any[] = [];

    inspectionOrders.forEach((order: any) => {
      const orderNumber = order.inspection_order_number || order.inspectionOrderNumber || '';
      
      // Component pattern: IO-YYYY-X-M-Y-Z (has 6 parts, with M in 4th position)
      // Parent pattern: IO-YYYY-X-M-Y (has 5 parts, with M in 4th position)
      const orderParts = orderNumber.split('-');
      const isComponent = orderParts.length === 6 && orderParts[3] === 'M' && /IO-\d{4}-\d+-M-\d+-\d+/.test(orderNumber);
      
      if (isComponent) {
        components.push(order);
      } else {
        parentAssemblies.push(order);
      }
    });

    // Sort both categories in descending order by inspection order number
    const sortByOrderNumber = (a: any, b: any) => {
      const numA = a.inspection_order_number || a.inspectionOrderNumber || '';
      const numB = b.inspection_order_number || b.inspectionOrderNumber || '';
      return numB.localeCompare(numA); // Descending order
    };

    parentAssemblies.sort(sortByOrderNumber);
    components.sort(sortByOrderNumber);

    // Create hierarchical structure: each parent followed by its components
    const hierarchicalOrders: any[] = [];

    parentAssemblies.forEach((parent: any) => {
      // Add the parent assembly
      hierarchicalOrders.push({ ...parent, type: 'parent' });

      // Find and add components that belong to this parent
      const parentNumber = parent.inspection_order_number || parent.inspectionOrderNumber;
      const relatedComponents = components.filter((component: any) => {
        const componentNumber = component.inspection_order_number || component.inspectionOrderNumber;
        // Component belongs to parent if it starts with parent number + dash
        return componentNumber.startsWith(parentNumber + '-');
      });

      // Add related components with proper sorting
      relatedComponents.sort(sortByOrderNumber);
      relatedComponents.forEach((component: any) => {
        hierarchicalOrders.push({ ...component, type: 'component' });
      });
    });

    return hierarchicalOrders;
  }, [inspectionOrders]);
  
  // Fetch active Test Procedures
  const {
    data: testProcedures = [],
    isLoading: isLoadingTestProcedures
  } = useQuery({
    queryKey: ['/api/quality/test-procedures'],
    queryFn: async () => {
      const response = await fetch('/api/quality/test-procedures?status=Approved');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch test procedures");
      }
      return response.json();
    }
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
    unit: string;
    dimensions: string;
    material_status: string;
    material_type: string;
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
  
  // Fetch calibration instruments (pressure gauges) for the dropdown
  const {
    data: calibrationInstruments = [],
    isLoading: isLoadingInstruments,
  } = useQuery<{
    id: number;
    instrument_id: string;
    instrument_name: string;
    instrument_type: string;
    calibration_status: string;
  }[]>({
    queryKey: ['/api/testapi/calibration/direct-instruments'],
    queryFn: async () => {
      const response = await fetch('/api/testapi/calibration/direct-instruments', {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch calibration instruments");
      }
      
      const data = await response.json();
      return data.filter((instrument: any) => 
        instrument.calibration_status === 'Calibrated' &&
        instrument.instrument_type === 'Pressure Gauge' &&
        instrument.in_use === 'In Use'
      );
    },
  });

  // Fetch active PMA documents for the dropdown
  const {
    data: activePmaDocuments = [],
    isLoading: isLoadingActivePma,
  } = useQuery<{
    id: number;
    pmaNumber: string;
    specification: string;
    grade: string;
    certifiedBy: string;
    status: string;
    issueDate: string;
    expiryDate: string;
  }[]>({
    queryKey: ['/api/quality/pma/active'],
    queryFn: async () => {
      const response = await fetch('/api/quality/pma/active', {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch active PMA documents");
      }
      
      return response.json();
    },
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
        body: JSON.stringify({ newItemsOnly: true }) // Only show items that don't have inspection orders
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

  // Function to fetch document counts for all inspection tabs with validation
  const fetchDocumentationCounts = useCallback(async (inspectionOrderNumber: string) => {
    if (!inspectionOrderNumber) return;
    
    // Map frontend display names to backend tab names
    const tabMappings = [
      { frontendKey: 'NDT', backendName: 'NDT', dataField: 'ndtData' },
      { frontendKey: 'Visual', backendName: 'Visual', dataField: 'visualData' },
      { frontendKey: 'Welding', backendName: 'Welding', dataField: 'weldData' },
      { frontendKey: 'NonConformance', backendName: 'NonConformance', dataField: 'ncrData' },
      { frontendKey: 'Hydrotest', backendName: 'Hydrotest', dataField: 'hydrotestData' },
      { frontendKey: 'ShopInspection', backendName: 'Shop Inspection', dataField: 'shopData' },
      { frontendKey: 'Approved Drawing', backendName: 'Approved Drawing', dataField: 'approvedDrawingData' },
      { frontendKey: 'DVR', backendName: 'DVR', dataField: 'dvrData' },
      { frontendKey: 'ITP', backendName: 'ITP', dataField: 'itpData' },
      { frontendKey: 'PMA', backendName: 'PMA', dataField: 'pmaData' },
      { frontendKey: 'Test Procedures', backendName: 'Test Procedures', dataField: 'procedureData' },
      { frontendKey: 'Material Traceability', backendName: 'Material Traceability', dataField: 'materialTraceabilityData' }
    ];
    
    const counts: Record<string, number> = {};
    const validationResults: Record<string, { records: number; documents: number; isValid: boolean }> = {};
    
    try {
      // Count database records for each tab (matches what's displayed in tab tables)
      if (editInspectionOrderDetails) {
        tabMappings.forEach((mapping) => {
          // Special handling for Material Traceability - count from separate table
          if (mapping.frontendKey === 'Material Traceability') {
            // Will be handled separately below
            return;
          }
          
          let dataRecordCount = 0;
          
          // Count data records from inspection order fields
          const dataFieldValue = editInspectionOrderDetails[mapping.dataField as keyof typeof editInspectionOrderDetails];
          if (dataFieldValue && typeof dataFieldValue === 'string') {
            try {
              const parsedData = JSON.parse(dataFieldValue);
              if (Array.isArray(parsedData)) {
                // Filter out empty placeholder records with improved logic
                const validRecords = parsedData.filter(record => {
                  if (!record || typeof record !== 'object') return false;
                  
                  // Check if record has meaningful data beyond just ID
                  const recordCopy = { ...record };
                  delete recordCopy.id; // Remove ID from validation
                  
                  const values = Object.values(recordCopy);
                  const hasData = values.some(value => 
                    value !== '' && 
                    value !== null && 
                    value !== undefined &&
                    String(value).trim() !== ''
                  );
                  return hasData;
                });
                dataRecordCount = validRecords.length;
              }
            } catch (e) {
              // If parsing fails, assume no data
              dataRecordCount = 0;
            }
          }
          
          counts[mapping.frontendKey] = dataRecordCount;
          console.log(`✅ ${mapping.frontendKey}: ${counts[mapping.frontendKey]} records (database only)`);
        });
      }
      
      // Now fetch uploaded document counts for validation
      const documentPromises = tabMappings.map(async (mapping) => {
        try {
          // Special handling for Material Traceability - count from separate table
          if (mapping.frontendKey === 'Material Traceability') {
            const materialResponse = await fetch(
              `/api/quality/inspection-documents/${inspectionOrderNumber}/material-traceability/count`,
              {
                credentials: 'include',
              }
            );
            
            if (materialResponse.ok) {
              const materialResult = await materialResponse.json();
              const materialCount = materialResult.count || 0;
              counts['Material Traceability'] = materialCount;
              
              // Get uploaded documents count for Material Traceability
              const documentsResponse = await fetch(
                `/api/quality/inspection-documents/${inspectionOrderNumber}/${encodeURIComponent(mapping.backendName)}/ALL/documents`,
                {
                  credentials: 'include',
                }
              );
              
              let documentCount = 0;
              if (documentsResponse.ok) {
                const documents = await documentsResponse.json();
                documentCount = Array.isArray(documents) ? documents.length : 0;
              }
              
              // Material Traceability is an internal record - validate records exist, not documents
              validationResults['Material Traceability'] = {
                records: materialCount,
                documents: documentCount,
                isValid: materialCount > 0
              };
              
              const materialValidationIcon = materialCount > 0 ? '✓' : '⚠️';
              console.log(`📋 Material Traceability: ${materialCount} records, ${documentCount} documents ${materialValidationIcon}`);
            } else {
              console.log(`❌ Material Traceability: API error ${materialResponse.status}`);
              counts['Material Traceability'] = 0;
              validationResults['Material Traceability'] = { records: 0, documents: 0, isValid: false };
            }
          } else {
            // Regular handling for other tabs
            const response = await fetch(
              `/api/quality/inspection-documents/${inspectionOrderNumber}/${encodeURIComponent(mapping.backendName)}/ALL/documents`,
              {
                credentials: 'include',
              }
            );
            
            if (response.ok) {
              const documents = await response.json();
              const documentCount = Array.isArray(documents) ? documents.length : 0;
              const recordCount = counts[mapping.frontendKey] || 0;
              
              // Special handling for internal record tabs - validate records exist, not documents
              const internalRecordTabs = ['Material Traceability', 'PMA', 'Test Procedures'];
              const isInternalRecord = internalRecordTabs.includes(mapping.frontendKey);
              
              validationResults[mapping.frontendKey] = {
                records: recordCount,
                documents: documentCount,
                isValid: isInternalRecord ? recordCount > 0 : recordCount === documentCount
              };
              
              // Console logging with appropriate validation logic for internal vs external tabs
              const validationIcon = isInternalRecord ? 
                (recordCount > 0 ? '✓' : '⚠️') : 
                (recordCount === documentCount ? '✓' : '⚠️');
              console.log(`📋 ${mapping.frontendKey}: ${recordCount} records, ${documentCount} documents ${validationIcon}`);
            } else {
              console.log(`❌ ${mapping.frontendKey}: Documents API error ${response.status}`);
              validationResults[mapping.frontendKey] = {
                records: counts[mapping.frontendKey] || 0,
                documents: 0,
                isValid: (counts[mapping.frontendKey] || 0) === 0
              };
            }
          }
        } catch (error) {
          console.log(`❌ Error validating ${mapping.frontendKey}:`, error);
          validationResults[mapping.frontendKey] = {
            records: counts[mapping.frontendKey] || 0,
            documents: 0,
            isValid: (counts[mapping.frontendKey] || 0) === 0
          };
        }
      });
      
      await Promise.all(documentPromises);
      
      // Log validation summary
      const invalidTabs = Object.entries(validationResults).filter(([_, result]) => !result.isValid);
      if (invalidTabs.length > 0) {
        console.warn("⚠️ VALIDATION ISSUES FOUND:");
        invalidTabs.forEach(([tabName, result]) => {
          console.warn(`   ${tabName}: ${result.records} records ≠ ${result.documents} documents`);
        });
      } else {
        console.log("✅ ALL TABS VALIDATED: Records and documents counts match");
      }
      
      console.log("📊 Final Documentation counts (database records only):", counts);
      setDocumentationCounts(counts);
      
      // Store validation results for potential UI display
      (window as any).inspectionValidationResults = validationResults;
      
    } catch (error) {
      console.error("Error fetching documentation counts:", error);
    }
  }, [editInspectionOrderDetails]);

  // Fetch documentation counts when edit dialog opens
  useEffect(() => {
    if (editInspectionOrderDetails?.inspectionOrderNumber) {
      fetchDocumentationCounts(editInspectionOrderDetails.inspectionOrderNumber);
    }
  }, [editInspectionOrderDetails?.inspectionOrderNumber, fetchDocumentationCounts]);

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
            confirm: true,
            newItemsOnly: true
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
      
      // Handle case when no new orders were created (all items already have orders)
      if (responseData.ordersCreated === 0 && responseData.message?.includes("already have inspection orders")) {
        toast({
          title: "No New Orders Needed",
          description: responseData.message || "All project items already have inspection orders",
          variant: "default", // Use default variant for informational message
        });
      } else {
        // Success message with detailed information for actual order creation
        let description = responseData.message || `Successfully created ${responseData.count || responseData.ordersCreated || 'multiple'} inspection orders for the project`;
        
        // Show detailed breakdown of what was created
        if (responseData.makeParentCount > 0 || responseData.buyParentCount > 0 || responseData.componentCount > 0) {
          description = `Successfully created ${responseData.count || responseData.ordersCreated} inspection orders:\n` +
            `${responseData.makeParentCount > 0 ? `- ${responseData.makeParentCount} Make item(s)\n` : ''}` +
            `${responseData.buyParentCount > 0 ? `- ${responseData.buyParentCount} Buy item(s)\n` : ''}` +
            `${responseData.componentCount > 0 ? `- ${responseData.componentCount} Component item(s)` : ''}`;
        }
        
        toast({
          title: "Inspection Orders Generated",
          description: description,
        });
      }
      
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
      dossierCompletionDate: new Date().toISOString().split('T')[0], // Set today's date as default
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
        materialType: material.material?.materialType || material.materialType || '',
        materialCertificateNumber: material.materialCertificateNumber,
        heatNumber: material.heatNumber,
        materialGrade: material.materialGrade,
        materialSpecification: material.materialSpecification,
        allocatedQuantity: material.allocatedQuantity || '',
        quantityUnit: material.quantityUnit || '',
        // Extract description from nested material relationship or fallback to direct description field
        description: material.material?.materialDescription || material.description || ''
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
      // Reset selected NDT and Weld records when loading a new inspection order
      setSelectedNdtRecord(null);
      setSelectedWeldRecord(null);
      
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
      
      // If no valid NDT records were found, initialize with empty array
      console.log("No NDT records found, initializing with empty array");
      setNdtRecords([]);
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
      
      // If no valid Visual records were found, initialize with empty array
      console.log("No Visual records found, initializing with empty array");
      setVisualRecords([]);
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
      
      // If no valid Weld records were found, initialize with empty array
      console.log("No Weld records found, initializing with empty array");
      setWelds([]);
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
      
      // If no valid NCR records were found, initialize with empty array
      console.log("No NCR records found, initializing with empty array");
      setNcrRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Load Hydrotest records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has Hydrotest data in the expected format
      console.log("Checking for Hydrotest data:", editInspectionOrderDetails);
      
      const hydrotestData = (editInspectionOrderDetails as any).hydrotestData || (editInspectionOrderDetails as any).hydrotest_data;
      
      if (hydrotestData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedHydrotestRecords = Array.isArray(hydrotestData) 
            ? hydrotestData 
            : typeof hydrotestData === 'string' 
              ? JSON.parse(hydrotestData) 
              : null;
          
          if (parsedHydrotestRecords && Array.isArray(parsedHydrotestRecords) && parsedHydrotestRecords.length > 0) {
            console.log("Found Hydrotest records:", parsedHydrotestRecords);
            
            // Map the Hydrotest records to match our state format
            const formattedRecords = parsedHydrotestRecords.map((record, index) => ({
              id: record.id || `HT-${index + 1}`,
              pressure: record.pressure || '',
              duration: record.duration || '',
              medium: record.medium || 'water',
              pressureGauge: record.pressureGauge || '',
              operator: record.operator || '',
              testDate: record.testDate || '',
              result: record.result || 'Pass',
              notes: record.notes || ''
            }));
            
            setHydrotestRecords(formattedRecords);
            return;
          }
        } catch (error) {
          console.error("Error parsing Hydrotest records:", error);
        }
      }
      
      // If no valid Hydrotest records were found, initialize with empty array
      console.log("No Hydrotest records found, initializing with empty array");
      setHydrotestRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Initialize Shop Inspection records - check for existing uploaded files only if no records were loaded from database
  useEffect(() => {
    if (editInspectionOrderDetails?.inspectionOrderNumber) {
      console.log("Checking if Shop Inspection placeholder logic should run");
      
      // Only run placeholder logic if no Shop records were loaded from the database
      const shopData = (editInspectionOrderDetails as any).shopInspectionRecords || (editInspectionOrderDetails as any).shopData || (editInspectionOrderDetails as any).shop_data;
      
      if (shopData) {
        try {
          const parsedShopRecords = Array.isArray(shopData) 
            ? shopData 
            : typeof shopData === 'string' 
              ? JSON.parse(shopData) 
              : [];
          
          if (Array.isArray(parsedShopRecords) && parsedShopRecords.length > 0) {
            console.log("Shop records already loaded from database, skipping placeholder logic");
            return; // Don't create placeholders if real records exist
          }
        } catch (error) {
          console.error("Error checking existing Shop records:", error);
        }
      }
      
      console.log("No database Shop records found, checking for uploaded files to create placeholders");
      
      // Fetch existing uploaded files to infer missing records only if no database records exist
      const fetchExistingFiles = async () => {
        try {
          const response = await fetch(`/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/ShopInspection/ALL/documents`);
          if (response.ok) {
            const documents = await response.json();
            console.log("Found existing Shop Inspection documents:", documents);
            
            // Extract unique record IDs from uploaded files
            const existingRecordIds = [...new Set(documents.map((doc: any) => doc.recordId))];
            console.log("Existing record IDs from files:", existingRecordIds);
            
            // Create placeholder records for files that exist but have no frontend record
            const placeholderRecords = existingRecordIds.map(recordId => ({
              id: recordId,
              inspectionType: "Uploaded Files Only",
              inspector: "Unknown",
              date: new Date().toISOString().split('T')[0],
              status: "Pending",
              remarks: `Record inferred from uploaded files. Please edit to add proper details.`
            }));
            
            console.log("Creating placeholder records:", placeholderRecords);
            setShopInspectionRecords(placeholderRecords);
          } else {
            console.log("No existing documents found, starting with empty state");
            setShopInspectionRecords([]);
          }
        } catch (error) {
          console.error("Error fetching existing documents:", error);
          setShopInspectionRecords([]);
        }
      };
      
      fetchExistingFiles();
    }
  }, [editInspectionOrderDetails]);

  // Load Approved Drawing records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has Approved Drawing data in the expected format
      console.log("Checking for Approved Drawing data:", editInspectionOrderDetails);
      
      const approvedDrawingData = (editInspectionOrderDetails as any).approvedDrawingData || (editInspectionOrderDetails as any).approved_drawing_data;
      
      if (approvedDrawingData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedApprovedDrawingRecords = Array.isArray(approvedDrawingData) 
            ? approvedDrawingData 
            : typeof approvedDrawingData === 'string' 
              ? JSON.parse(approvedDrawingData) 
              : null;
          
          if (parsedApprovedDrawingRecords && Array.isArray(parsedApprovedDrawingRecords) && parsedApprovedDrawingRecords.length > 0) {
            console.log("Found Approved Drawing records:", parsedApprovedDrawingRecords);
            
            // Map the Approved Drawing records to match our state format
            const formattedRecords = parsedApprovedDrawingRecords.map((record, index) => ({
              id: record.id || `AD-${index + 1}`,
              drawingNumber: record.drawingNumber || '',
              drawingTitle: record.drawingTitle || '',
              revision: record.revision || 'A',
              approvalDate: record.approvalDate || '',
              approvedBy: record.approvedBy || '',
              notes: record.notes || ''
            }));
            
            setApprovedDrawingRecords(formattedRecords);
            return;
          }
        } catch (error) {
          console.error("Error parsing Approved Drawing records:", error);
        }
      }
      
      // If no valid Approved Drawing records were found, initialize with empty array
      console.log("No Approved Drawing records found, initializing with empty array");
      setApprovedDrawingRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Load DVR records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has DVR data in the expected format
      console.log("Checking for DVR data:", editInspectionOrderDetails);
      
      const dvrData = (editInspectionOrderDetails as any).dvrRecords || (editInspectionOrderDetails as any).dvrData || (editInspectionOrderDetails as any).dvr_data;
      
      if (dvrData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedDvrRecords = Array.isArray(dvrData) 
            ? dvrData 
            : typeof dvrData === 'string' 
              ? JSON.parse(dvrData) 
              : null;
          
          if (parsedDvrRecords && Array.isArray(parsedDvrRecords) && parsedDvrRecords.length > 0) {
            console.log("Found DVR records:", parsedDvrRecords);
            
            // Map the DVR records to match our state format
            const formattedRecords = parsedDvrRecords.map((record, index) => ({
              id: record.id || `DVR-${index + 1}`,
              designDocument: record.designDocument || '',
              reviewType: record.reviewType || 'design_review',
              reviewer: record.reviewer || '',
              reviewDate: record.reviewDate || '',
              status: record.status || 'pending',
              comments: record.comments || ''
            }));
            
            setDvrRecords(formattedRecords);
            return; // Exit here, don't run fallback
          }
        } catch (error) {
          console.error("Error parsing DVR records:", error);
        }
      }
      
      // If no valid DVR records were found, initialize with empty array
      console.log("No DVR records found, initializing with empty array");
      setDvrRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Load ITP records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has ITP data in the expected format
      console.log("Checking for ITP data:", editInspectionOrderDetails);
      
      const itpData = (editInspectionOrderDetails as any).itpRecords || (editInspectionOrderDetails as any).itpData || (editInspectionOrderDetails as any).itp_data;
      
      if (itpData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedItpRecords = Array.isArray(itpData) 
            ? itpData 
            : typeof itpData === 'string' 
              ? JSON.parse(itpData) 
              : null;
          
          if (parsedItpRecords && Array.isArray(parsedItpRecords) && parsedItpRecords.length > 0) {
            console.log("Found ITP records:", parsedItpRecords);
            
            // Filter out empty placeholder records - only keep records with actual data
            // Use the correct field names that match our current ITP state structure
            const realRecords = parsedItpRecords.filter((record: any) => 
              (record.itpNumber && record.itpNumber.trim() !== '') ||
              (record.itemDescription && record.itemDescription.trim() !== '') ||
              (record.inspectionStage && record.inspectionStage.trim() !== '') ||
              (record.inspector && record.inspector.trim() !== '') ||
              (record.status && record.status.trim() !== '')
            );
            
            if (realRecords.length > 0) {
              // Map the real ITP records to match our state format using the correct field names
              const formattedRecords = realRecords.map((record, index) => ({
                id: record.id || `ITP-${index + 1}`,
                itpNumber: record.itpNumber || '',
                itemDescription: record.itemDescription || '',
                inspectionStage: record.inspectionStage || '',
                inspector: record.inspector || '',
                inspectionDate: record.inspectionDate || '',
                status: record.status || 'Pending',
                remarks: record.remarks || ''
              }));
              
              console.log("Setting ITP records:", formattedRecords);
              setItpRecords(formattedRecords);
              return; // Exit here, don't run fallback
            }
          }
        } catch (error) {
          console.error("Error parsing ITP records:", error);
        }
      }
      
      // If no valid ITP records were found, initialize with empty array
      console.log("No ITP records found, initializing with empty array");
      setItpRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Load PMA records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has PMA data in the expected format
      console.log("Checking for PMA data:", editInspectionOrderDetails);
      
      const pmaData = (editInspectionOrderDetails as any).pmaRecords || (editInspectionOrderDetails as any).pmaData || (editInspectionOrderDetails as any).pma_data;
      
      if (pmaData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedPmaRecords = Array.isArray(pmaData) 
            ? pmaData 
            : typeof pmaData === 'string' 
              ? JSON.parse(pmaData) 
              : null;
          
          if (parsedPmaRecords && Array.isArray(parsedPmaRecords) && parsedPmaRecords.length > 0) {
            console.log("Found PMA records:", parsedPmaRecords);
            
            // Map the PMA records to match our state format
            const formattedRecords = parsedPmaRecords.map((record, index) => ({
              id: record.id || `PMA-${index + 1}`,
              pmaNumber: record.pmaNumber || '',
              materialSpecification: record.materialSpecification || '',
              materialGrade: record.materialGrade || '',
              certifiedBy: record.certifiedBy || '',
              issueDate: record.issueDate || '',
              expiryDate: record.expiryDate || '',
              status: record.status || 'active',
              remarks: record.remarks || ''
            }));
            
            setPmaRecords(formattedRecords);
            return; // Exit here, don't run fallback
          }
        } catch (error) {
          console.error("Error parsing PMA records:", error);
        }
      }
      
      // If no valid PMA records were found, initialize with empty array
      console.log("No PMA records found, initializing with empty array");
      setPmaRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Load Procedures records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has Procedures data in the expected format
      console.log("Checking for Procedures data:", editInspectionOrderDetails);
      
      const procedureData = (editInspectionOrderDetails as any).procedureRecords || (editInspectionOrderDetails as any).procedureData || (editInspectionOrderDetails as any).procedure_data;
      
      if (procedureData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedProcedureRecords = Array.isArray(procedureData) 
            ? procedureData 
            : typeof procedureData === 'string' 
              ? JSON.parse(procedureData) 
              : null;
          
          if (parsedProcedureRecords && Array.isArray(parsedProcedureRecords) && parsedProcedureRecords.length > 0) {
            console.log("Found Procedures records:", parsedProcedureRecords);
            
            // Filter out empty placeholder records - only keep records with actual data
            const realRecords = parsedProcedureRecords.filter((record: any) => 
              (record.procedureNumber && record.procedureNumber.trim() !== '') ||
              (record.procedureName && record.procedureName.trim() !== '') ||
              (record.ndtMethod && record.ndtMethod.trim() !== '') ||
              (record.applicableStandard && record.applicableStandard.trim() !== '')
            );
            
            if (realRecords.length > 0) {
              // Map the real Procedures records to match our state format
              const formattedRecords = realRecords.map((record, index) => ({
                id: record.id || `TP-${index + 1}`,
                procedureNumber: record.procedureNumber || '',
                procedureName: record.procedureName || '',
                ndtMethod: record.ndtMethod || '',
                applicableStandard: record.applicableStandard || '',
                linkedDate: record.linkedDate || '',
                linkedBy: record.linkedBy || '',
                notes: record.notes || ''
              }));
              
              setProcedureRecords(formattedRecords);
              return; // Exit here, don't run fallback
            }
          }
        } catch (error) {
          console.error("Error parsing Procedures records:", error);
        }
      }
      
      // If no valid Procedures records were found, initialize with empty array
      console.log("No Procedures records found, initializing with empty array");
      setProcedureRecords([]);
    }
  }, [editInspectionOrderDetails]);

  // Load Shop inspection records from the inspection order data
  useEffect(() => {
    if (editInspectionOrderDetails) {
      // Check if the response has Shop data in the expected format
      console.log("Checking for Shop data:", editInspectionOrderDetails);
      
      const shopData = (editInspectionOrderDetails as any).shopInspectionRecords || (editInspectionOrderDetails as any).shopData || (editInspectionOrderDetails as any).shop_data;
      
      if (shopData) {
        try {
          // If the data is already parsed as an object, use it directly
          // Otherwise, try to parse it from JSON string
          const parsedShopRecords = Array.isArray(shopData) 
            ? shopData 
            : typeof shopData === 'string' 
              ? JSON.parse(shopData) 
              : [];
          
          if (Array.isArray(parsedShopRecords) && parsedShopRecords.length > 0) {
            console.log("Successfully loaded Shop records:", parsedShopRecords);
            
            // Format the records to match expected structure
            const formattedRecords = parsedShopRecords.map((record: any, index: number) => ({
              id: record.id || `SI-${index + 1}`,
              inspectionType: record.inspectionType || '',
              inspector: record.inspector || '',
              date: record.date || '',
              status: record.status || 'Pending',
              remarks: record.remarks || ''
            }));
            
            setShopInspectionRecords(formattedRecords);
            return; // Exit here, don't run fallback
          }
        } catch (error) {
          console.error("Error parsing Shop records:", error);
        }
      }
      
      // If no valid Shop records were found, initialize with empty array (don't create placeholder records)
      console.log("No Shop records found, initializing with empty array");
      setShopInspectionRecords([]);
    }
  }, [editInspectionOrderDetails]);
  
  // Helper function to sync material rows with form
  const syncMaterialRowsWithForm = () => {
    editForm.setValue('materials', materialRows);
  };

  // Helper function to generate shop inspection record ID
  const generateShopInspectionId = () => {
    const existingIds = shopInspectionRecords.map(record => record.id);
    let newIdNumber = 1;
    let newId = `SI-${newIdNumber}`;
    
    while (existingIds.includes(newId)) {
      newIdNumber++;
      newId = `SI-${newIdNumber}`;
    }
    
    return newId;
  };

  // Function to add a new shop inspection record with file upload support
  const addShopInspectionRecord = async (recordData: {
    inspectionType: string;
    inspector: string;
    date: string;
    status: string;
    remarks: string;
  }) => {
    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Create Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    const newRecordId = generateShopInspectionId();
    const newRecord = {
      id: newRecordId,
      ...recordData
    };

    // Handle file uploads if any files are selected
    if (shopInspectionFiles.length > 0) {
      setIsUploadingShopFiles(true);
      
      try {
        // Upload files for this specific record
        for (const file of shopInspectionFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
          formData.append('tabName', 'ShopInspection');
          formData.append('recordId', newRecordId);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload ${file.name}`);
          }
        }

        toast({
          title: "Files Uploaded Successfully",
          description: `${shopInspectionFiles.length} file(s) uploaded for Shop Inspection record ${newRecordId}`,
        });
      } catch (error: any) {
        console.error("Error uploading files:", error);
        toast({
          title: "File Upload Error",
          description: error.message || "Some files could not be uploaded. Please try again.",
          variant: "destructive",
        });
        setIsUploadingShopFiles(false);
        return;
      }
      
      setIsUploadingShopFiles(false);
      setShopInspectionFiles([]); // Clear selected files
    }

    setShopInspectionRecords(prev => [...prev, newRecord]);
    setIsShopInspectionDialogOpen(false);
    
    toast({
      title: "Success",
      description: "Shop inspection record added successfully" + (shopInspectionFiles.length > 0 ? " with uploaded files" : ""),
    });
  };

  // Function to edit a shop inspection record
  const editShopInspectionRecord = async (recordData: {
    inspectionType: string;
    inspector: string;
    date: string;
    status: string;
    remarks: string;
  }) => {
    if (!editingShopRecord) return;

    // Validation: Check if files are selected for replacement
    if (shopInspectionFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select files to proceed with updating the Shop Inspection record.",
        variant: "destructive",
      });
      return;
    }

    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Update Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingShopFiles(true);

    try {
      console.log("🔄 Starting Shop Inspection record update with file replacement...");
      
      // Step 1: Delete existing files if they exist
      if (hasExistingShopFiles) {
        console.log("🗑️ Deleting existing Shop Inspection files for replacement...");
        
        try {
          const documentsResponse = await fetch(
            `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/ShopInspection/${editingShopRecord.id}/documents`
          );
          
          if (documentsResponse.ok) {
            const existingDocuments = await documentsResponse.json();
            console.log(`📄 Found ${existingDocuments.length} existing documents to delete`);
            
            // Delete each document
            for (const doc of existingDocuments) {
              try {
                const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                  method: 'DELETE',
                  credentials: 'include'
                });
                
                if (deleteResponse.ok) {
                  console.log(`✅ Successfully deleted document: ${doc.fileName}`);
                } else {
                  console.error(`❌ Failed to delete document: ${doc.fileName}`);
                }
              } catch (deleteError) {
                console.error(`❌ Error deleting document ${doc.fileName}:`, deleteError);
              }
            }
          }
        } catch (error) {
          console.error("❌ Error fetching existing documents for deletion:", error);
          // Continue with replacement even if deletion fails
        }
      }

      // Step 2: Upload replacement files
      console.log("📤 Uploading replacement files...");
      
      const formData = new FormData();
      formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
      formData.append('tabName', 'ShopInspection');
      formData.append('recordId', editingShopRecord.id);
      formData.append('projectCode', editInspectionOrderDetails.projectCode);

      shopInspectionFiles.forEach((file) => {
        formData.append('files', file);
      });

      const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || 'Failed to upload replacement files');
      }

      const uploadResult = await uploadResponse.json();
      console.log("✅ Files uploaded successfully:", uploadResult);

      // Step 3: Update the record data
      setShopInspectionRecords(prev => 
        prev.map(record => 
          record.id === editingShopRecord.id 
            ? { ...record, ...recordData }
            : record
        )
      );

      setIsShopInspectionDialogOpen(false);
      setEditingShopRecord(null);
      setShopInspectionFiles([]);

      toast({
        title: "Success",
        description: `Shop Inspection record updated successfully with replacement file(s) uploaded`,
      });

    } catch (error: any) {
      console.error("❌ Error updating Shop Inspection record:", error);
      toast({
        title: "Update Error",
        description: error.message || "Failed to update Shop Inspection record. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingShopFiles(false);
    }
  };

  // Function to start editing a shop inspection record
  const startEditingShopRecord = async (record: typeof shopInspectionRecords[0]) => {
    setEditingShopRecord(record);
    
    // Check if files already exist for this record
    const hasFiles = await checkExistingShopFiles(record.id);
    setHasExistingShopFiles(hasFiles);
    
    setIsShopInspectionDialogOpen(true);
  };

  // Function to delete a drawing record with GCS cleanup
  const deleteDrawingRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of Drawing record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=Approved Drawing&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setApprovedDrawingRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `Drawing record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `Drawing record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setApprovedDrawingRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "Drawing record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting drawing record:', error);
      
      // Still remove from frontend even if everything fails
      setApprovedDrawingRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };



  // Function to delete a DVR record with GCS cleanup
  const deleteDvrRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of DVR record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=DVR&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setDvrRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `DVR record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `DVR record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setDvrRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "DVR record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting DVR record:', error);
      
      // Still remove from frontend even if everything fails
      setDvrRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };

  // Function to delete an ITP record with GCS cleanup
  const deleteItpRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of ITP record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=ITP&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setItpRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `ITP record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `ITP record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setItpRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "ITP record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting ITP record:', error);
      
      // Still remove from frontend even if everything fails
      setItpRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };

  // Function to delete an NDT record with GCS cleanup
  const deleteNdtRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of NDT record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=NDT&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setNdtRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `NDT record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `NDT record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setNdtRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "NDT record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting NDT record:', error);
      
      // Still remove from frontend even if everything fails
      setNdtRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };

  // Function to delete a visual inspection record with GCS cleanup
  const deleteVisualRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of Visual record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=Visual&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setVisualRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `Visual record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `Visual record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setVisualRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "Visual record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting visual record:', error);
      
      // Still remove from frontend even if everything fails
      setVisualRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };

  // Function to delete a hydrotest record with GCS cleanup
  const deleteHydrotestRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of Hydrotest record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=Hydrotest&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setHydrotestRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `Hydrotest record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `Hydrotest record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setHydrotestRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "Hydrotest record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting hydrotest record:', error);
      
      // Still remove from frontend even if everything fails
      setHydrotestRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };

  // Function to delete an NCR record with GCS cleanup
  const deleteNcrRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of NCR record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=NonConformance&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const documents = await response.json();
        console.log(`Found ${documents.length} documents to delete:`, documents);
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files
        for (const document of documents) {
          try {
            console.log(`Attempting to delete document ${document.id}: ${document.fileName}`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (deleteResponse.ok) {
              deletedCount++;
              console.log(`✅ Document ${document.fileName} deleted successfully`);
            } else {
              failedCount++;
              console.warn(`❌ Failed to delete document ${document.fileName}`);
            }
          } catch (docError) {
            failedCount++;
            console.warn(`❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Remove the record from frontend state
        setNcrRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `NCR record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `NCR record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        // Still remove the record even if we can't fetch documents
        setNcrRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "NCR record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting NCR record:', error);
      
      // Still remove from frontend even if everything fails
      setNcrRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Error",
        description: "Error occurred during deletion. Record removed from frontend only.",
        variant: "destructive"
      });
    }
  };

  // Function to delete a shop inspection record with GCS cleanup
  const deleteShopInspectionRecord = async (recordId: string) => {
    try {
      console.log(`Starting deletion of Shop Inspection record: ${recordId}`);
      console.log(`Inspection Order Number: ${editInspectionOrderDetails?.inspectionOrderNumber}`);
      
      // First, fetch all documents associated with this record for cleanup
      const documentsUrl = `/api/quality/inspection-documents?inspectionOrderNumber=${editInspectionOrderDetails?.inspectionOrderNumber}&tabName=ShopInspection&recordId=${recordId}`;
      console.log(`Fetching documents from: ${documentsUrl}`);
      
      const response = await fetch(documentsUrl, {
        credentials: 'include'
      });
      console.log(`Documents fetch response status: ${response.status}`);
      
      if (response.ok) {
        const responseText = await response.text();
        console.log(`Raw response:`, responseText);
        
        let documents;
        try {
          documents = JSON.parse(responseText);
          console.log(`Found ${documents.length} documents to delete:`, documents);
        } catch (parseError) {
          console.error(`Failed to parse JSON response:`, parseError);
          console.error(`Response was HTML, likely a routing issue`);
          throw new Error('API returned HTML instead of JSON - routing issue');
        }
        
        let deletedCount = 0;
        let failedCount = 0;
        
        // Delete all associated GCS files using the new dedicated endpoint
        for (const document of documents) {
          try {
            console.log(`🏪 Attempting to delete document ${document.id}: ${document.fileName}`);
            console.log(`🏪 Using new dedicated endpoint for Shop Inspection deletion`);
            
            const deleteResponse = await fetch(`/api/quality/inspection-documents/shop-inspection-delete/${editInspectionOrderDetails?.inspectionOrderNumber}/${recordId}/${document.id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            console.log(`🏪 Delete response status: ${deleteResponse.status}`);
            
            if (deleteResponse.ok) {
              const deleteResult = await deleteResponse.json();
              console.log(`🏪 Delete result:`, deleteResult);
              
              if (deleteResult.success) {
                deletedCount++;
                if (deleteResult.warning) {
                  console.log(`🏪 ⚠️ Partial success for ${document.fileName}: ${deleteResult.message}`);
                  console.log(`🏪 Warning: ${deleteResult.warning}`);
                  console.log(`🏪 GCS Status: ${deleteResult.gcsStatus}, Database Status: ${deleteResult.databaseStatus}`);
                } else {
                  console.log(`🏪 ✅ Document ${document.fileName} deleted successfully (Complete Success)`);
                  console.log(`🏪 Details: ${deleteResult.details}`);
                }
              } else {
                failedCount++;
                console.warn(`🏪 ❌ Failed to delete document ${document.fileName}: ${deleteResult.message || 'Unknown error'}`);
              }
            } else {
              failedCount++;
              console.warn(`🏪 ❌ HTTP Error deleting document ${document.fileName} - Status: ${deleteResponse.status}`);
              
              // Try to get error details from response
              try {
                const errorResponse = await deleteResponse.text();
                console.warn(`🏪 Error response:`, errorResponse);
              } catch (e) {
                console.warn(`🏪 Could not read error response`);
              }
            }
          } catch (docError) {
            failedCount++;
            console.warn(`🏪 ❌ Exception deleting document ${document.fileName}:`, docError);
          }
        }
        
        console.log(`Document deletion summary: ${deletedCount} successful, ${failedCount} failed`);
        
        // Invalidate React Query cache for document listings
        await queryClient.invalidateQueries({
          queryKey: ['/api/quality/inspection-documents']
        });
        
        // Remove the record from frontend state
        setShopInspectionRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        if (failedCount === 0) {
          toast({
            title: "Success",
            description: `Shop inspection record and ${deletedCount} associated documents deleted successfully`,
          });
        } else {
          toast({
            title: "Partial Success",
            description: `Shop inspection record deleted. ${deletedCount} documents removed, ${failedCount} documents may remain in storage`,
            variant: "destructive"
          });
        }
      } else {
        console.warn(`Failed to fetch documents - Status: ${response.status}`);
        // Still remove the record even if we can't fetch documents
        setShopInspectionRecords(prev => 
          prev.filter(record => record.id !== recordId)
        );
        
        toast({
          title: "Partial Success",
          description: "Shop inspection record deleted, but document cleanup could not be performed",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Error deleting shop inspection record:', error);
      
      // Still remove from frontend even if everything fails
      setShopInspectionRecords(prev => 
        prev.filter(record => record.id !== recordId)
      );
      
      toast({
        title: "Partial Success",
        description: "Shop inspection record deleted, but some documents may remain in storage",
        variant: "destructive"
      });
    }
  };

  // Helper function to generate approved drawing record ID
  const generateApprovedDrawingId = () => {
    const existingIds = approvedDrawingRecords.map(record => record.id);
    let newIdNumber = 1;
    let newId = `AD-${newIdNumber}`;
    
    while (existingIds.includes(newId)) {
      newIdNumber++;
      newId = `AD-${newIdNumber}`;
    }
    
    return newId;
  };

  // Function to add a new approved drawing record
  const addApprovedDrawingRecord = async (recordData: {
    drawingTitle: string;
    drawingNumber: string;
    revision: string;
    approvedBy: string;
    approvalDate: string;
    status: string;
    remarks: string;
  }) => {
    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Create Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    // Validate that files are selected (mandatory for new records)
    if (approvedDrawingFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select at least one file to upload for this Approved Drawing record.",
        variant: "destructive",
      });
      return;
    }

    const newRecordId = generateApprovedDrawingId();
    const newRecord = {
      id: newRecordId,
      ...recordData
    };

    // Handle file uploads if any files are selected
    if (approvedDrawingFiles.length > 0) {
      setIsUploadingApprovedDrawingFiles(true);
      
      try {
        // Upload files for this specific record
        for (const file of approvedDrawingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
          formData.append('tabName', 'Approved Drawing');
          formData.append('recordId', newRecordId);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload ${file.name}`);
          }
        }

        toast({
          title: "Files Uploaded Successfully",
          description: `${approvedDrawingFiles.length} file(s) uploaded for Approved Drawing record ${newRecordId}`,
        });
      } catch (error: any) {
        console.error("Error uploading files:", error);
        toast({
          title: "File Upload Error",
          description: error.message || "Some files could not be uploaded. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploadingApprovedDrawingFiles(false);
        setApprovedDrawingFiles([]); // Clear files after upload
      }
    }

    setApprovedDrawingRecords(prev => [...prev, newRecord]);
    setIsApprovedDrawingDialogOpen(false);
    setEditingApprovedDrawingRecord(null);
    toast({
      title: "Success",
      description: "Approved drawing record added successfully" + (approvedDrawingFiles.length > 0 ? " with uploaded files" : ""),
    });
  };

  // Function to edit an approved drawing record
  const editApprovedDrawingRecord = async (recordData: {
    drawingTitle: string;
    drawingNumber: string;
    revision: string;
    approvedBy: string;
    approvalDate: string;
    status: string;
    remarks: string;
  }) => {
    if (!editingApprovedDrawingRecord) return;

    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Update Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    // Validate that replacement files are selected (mandatory for edit)
    if (approvedDrawingFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select at least one file to replace the existing files for this Approved Drawing record.",
        variant: "destructive",
      });
      return;
    }
    
    // Handle file replacement if any files are selected
    if (approvedDrawingFiles.length > 0) {
      setIsUploadingApprovedDrawingFiles(true);
      
      try {
        // First, delete all existing files for this record
        console.log(`🗑️ Deleting existing files for Approved Drawing record ${editingApprovedDrawingRecord.id}...`);
        
        // Get existing documents to delete them
        const existingDocsResponse = await fetch(
          `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/Approved%20Drawing/${editingApprovedDrawingRecord.id}/documents`
        );
        
        if (existingDocsResponse.ok) {
          const existingDocs = await existingDocsResponse.json();
          console.log(`🗑️ Found ${existingDocs.length} existing documents to delete`);
          
          // Delete each existing document
          for (const doc of existingDocs) {
            try {
              const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                method: 'DELETE',
              });
              
              if (deleteResponse.ok) {
                console.log(`✅ Deleted existing document ${doc.id}`);
              } else {
                console.warn(`⚠️ Failed to delete document ${doc.id}, continuing with replacement...`);
              }
            } catch (deleteError) {
              console.warn(`⚠️ Error deleting document ${doc.id}:`, deleteError);
            }
          }
        }
        
        // Now upload the new replacement files
        console.log(`📤 Uploading ${approvedDrawingFiles.length} replacement files...`);
        for (const file of approvedDrawingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
          formData.append('tabName', 'Approved Drawing');
          formData.append('recordId', editingApprovedDrawingRecord.id);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload ${file.name}`);
          }
        }

        toast({
          title: "Files Replaced Successfully",
          description: `${approvedDrawingFiles.length} replacement file(s) uploaded for Approved Drawing record ${editingApprovedDrawingRecord.id}`,
        });
      } catch (error: any) {
        console.error("Error uploading files:", error);
        toast({
          title: "File Upload Error",
          description: error.message || "Some files could not be uploaded. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploadingApprovedDrawingFiles(false);
        setApprovedDrawingFiles([]); // Clear files after upload
      }
    }
    
    setApprovedDrawingRecords(prev => 
      prev.map(record => 
        record.id === editingApprovedDrawingRecord.id 
          ? { ...record, ...recordData }
          : record
      )
    );
    
    setIsApprovedDrawingDialogOpen(false);
    setEditingApprovedDrawingRecord(null);
    
    toast({
      title: "Success", 
      description: "Approved drawing record updated successfully" + (approvedDrawingFiles.length > 0 ? " with replacement files" : ""),
    });
  };

  // Function to check existing files for approved drawing record
  const checkExistingApprovedDrawingFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/Approved%20Drawing/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing files:", error);
      return false;
    } finally {
      setIsCheckingExistingFiles(false);
    }
  };

  // Function to start editing an approved drawing record
  const startEditingApprovedDrawingRecord = async (record: typeof approvedDrawingRecords[0]) => {
    setEditingApprovedDrawingRecord(record);
    
    // Check if files already exist for this record
    const hasFiles = await checkExistingApprovedDrawingFiles(record.id);
    setHasExistingApprovedDrawingFiles(hasFiles);
    
    setIsApprovedDrawingDialogOpen(true);
  };

  // Function to check existing files for DVR record
  const checkExistingDvrFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingDvrFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/DVR/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing DVR files:", error);
      return false;
    } finally {
      setIsCheckingExistingDvrFiles(false);
    }
  };

  // Function to check existing files for ITP record
  const checkExistingItpFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingItpFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/ITP/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing ITP files:", error);
      return false;
    } finally {
      setIsCheckingExistingItpFiles(false);
    }
  };

  // Function to check existing files for Shop Inspection record
  const checkExistingShopFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingShopFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/ShopInspection/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing Shop Inspection files:", error);
      return false;
    } finally {
      setIsCheckingExistingShopFiles(false);
    }
  };

  // Function to check existing files for Welding record
  const checkExistingWeldFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingWeldFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/Welding/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing Welding files:", error);
      return false;
    } finally {
      setIsCheckingExistingWeldFiles(false);
    }
  };

  // Function to check existing files for NDT record
  const checkExistingNdtFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingNdtFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/NDT/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing NDT files:", error);
      return false;
    } finally {
      setIsCheckingExistingNdtFiles(false);
    }
  };

  // Function to check existing files for Visual Inspection record
  const checkExistingVisualFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingVisualFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/VisualInspection/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing Visual Inspection files:", error);
      return false;
    } finally {
      setIsCheckingExistingVisualFiles(false);
    }
  };

  // Function to check existing files for Hydrotest record
  const checkExistingHydrotestFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingHydrotestFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/Hydrotest/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing Hydrotest files:", error);
      return false;
    } finally {
      setIsCheckingExistingHydrotestFiles(false);
    }
  };

  const checkExistingNcrFiles = async (recordId: string) => {
    if (!editInspectionOrderDetails?.inspectionOrderNumber) return false;
    
    setIsCheckingExistingNcrFiles(true);
    try {
      const response = await fetch(
        `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/NCR/${recordId}/documents`
      );
      
      if (response.ok) {
        const documents = await response.json();
        return documents.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Error checking existing NCR files:", error);
      return false;
    } finally {
      setIsCheckingExistingNcrFiles(false);
    }
  };

  // PMA helper functions
  const generatePmaId = () => {
    const existingIds = pmaRecords.map(record => record.id);
    let newIdNumber = 1;
    let newId = `PMA-${newIdNumber}`;
    
    while (existingIds.includes(newId)) {
      newIdNumber++;
      newId = `PMA-${newIdNumber}`;
    }
    
    return newId;
  };

  // Function to add a new PMA record
  const addPmaRecord = (recordData: {
    pmaNumber: string;
    materialSpecification: string;
    materialGrade: string;
    certifiedBy: string;
    issueDate: string;
    expiryDate: string;
    status: string;
    remarks: string;
  }) => {
    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Create Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    const newRecord = {
      id: generatePmaId(),
      ...recordData
    };
    setPmaRecords(prev => [...prev, newRecord]);
    setIsPmaDialogOpen(false);
    setEditingPmaRecord(null);
    toast({
      title: "Success",
      description: "PMA record added successfully",
    });
  };

  // Function to edit a PMA record
  const editPmaRecord = (recordData: {
    pmaNumber: string;
    materialSpecification: string;
    materialGrade: string;
    certifiedBy: string;
    issueDate: string;
    expiryDate: string;
    status: string;
    remarks: string;
  }) => {
    if (!editingPmaRecord) return;
    
    setPmaRecords(prev => 
      prev.map(record => 
        record.id === editingPmaRecord.id 
          ? { ...record, ...recordData }
          : record
      )
    );
    
    setIsPmaDialogOpen(false);
    setEditingPmaRecord(null);
    
    toast({
      title: "Success",
      description: "PMA record updated successfully",
    });
  };

  // Function to start editing a PMA record
  const startEditingPmaRecord = (record: typeof pmaRecords[0]) => {
    setEditingPmaRecord(record);
    setIsPmaDialogOpen(true);
  };

  // Function to delete a PMA record (only removes from state, does not delete GCS files)
  const deletePmaRecord = (recordId: string) => {
    setPmaRecords(prev => prev.filter(record => record.id !== recordId));
    
    toast({
      title: "Success",
      description: "PMA record deleted successfully. Associated files remain in storage.",
    });
  };

  // Procedures helper functions
  const generateProcedureId = () => {
    const existingIds = procedureRecords.map(record => {
      const match = record.id.match(/PROC-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return `PROC-${maxId + 1}`;
  };

  const addProcedureRecord = (recordData: {
    procedureNumber: string;
    procedureName: string;
    ndtMethod: string;
    applicableStandard: string;
    notes: string;
  }) => {
    // Check if project code is valid
    if (editInspectionOrderDetails?.project_code === 'UNKNOWN') {
      toast({
        title: "Cannot Link Procedure",
        description: "Project code is UNKNOWN. Please update the inspection order with a valid project code first.",
        variant: "destructive"
      });
      return;
    }

    const newRecord = {
      ...recordData,
      id: generateProcedureId(),
      linkedDate: new Date().toLocaleDateString(),
      linkedBy: 'Current User' // In a real app, this would be the logged-in user
    };
    
    setProcedureRecords([...procedureRecords, newRecord]);
    setIsProceduresDialogOpen(false);
    
    toast({
      title: "Success",
      description: "Test procedure linked successfully",
    });
  };

  const editProcedureRecord = (recordData: {
    procedureNumber: string;
    procedureName: string;
    ndtMethod: string;
    applicableStandard: string;
    notes: string;
  }) => {
    if (!editingProcedureRecord) return;

    const updatedRecord = {
      ...editingProcedureRecord,
      ...recordData
    };
    
    setProcedureRecords(prev => prev.map(record => 
      record.id === editingProcedureRecord.id ? updatedRecord : record
    ));
    
    setIsProceduresDialogOpen(false);
    setEditingProcedureRecord(null);
    
    toast({
      title: "Success",
      description: "Test procedure link updated successfully",
    });
  };

  const removeProcedureRecord = (index: number) => {
    setProcedureRecords(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "Success",
      description: "Test procedure unlinked successfully",
    });
  };

  // DVR helper functions
  const generateDvrId = () => {
    const existingIds = dvrRecords.map(record => {
      const match = record.id.match(/DVR-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return `DVR-${maxId + 1}`;
  };

  const addDvrRecord = async (recordData: {
    designDocument: string;
    reviewType: string;
    reviewer: string;
    reviewDate: string;
    status: string;
    comments?: string;
  }) => {
    // Validate files are selected
    if (dvrFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select files before creating the DVR record.",
        variant: "destructive"
      });
      return;
    }

    // Check if project code is valid
    if (editInspectionOrderDetails?.project_code === 'UNKNOWN') {
      toast({
        title: "Cannot Add DVR Record",
        description: "Project code is UNKNOWN. Please update the inspection order with a valid project code first.",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingDvrFiles(true);

    const newRecord = {
      ...recordData,
      id: generateDvrId(),
      comments: recordData.comments || ''
    };
    
    setDvrRecords([...dvrRecords, newRecord]);
    
    // Upload files after creating record
    try {
      const uploadPromises = dvrFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('inspectionOrderNumber', editInspectionOrderDetails?.inspection_order_number || '');
        formData.append('tabName', 'DVR');
        formData.append('recordId', newRecord.id);

        const response = await fetch('/api/quality/inspection-documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed for ${file.name}`);
        }
        return response.json();
      });

      await Promise.all(uploadPromises);

      setIsDvrDialogOpen(false);
      setDvrFiles([]);
      
      toast({
        title: "Success",
        description: "DVR record created and files uploaded successfully",
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Error",
        description: "DVR record created but file upload failed. Please try uploading files again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingDvrFiles(false);
    }
  };

  const editDvrRecord = async (recordData: {
    designDocument: string;
    reviewType: string;
    reviewer: string;
    reviewDate: string;
    status: string;
    comments?: string;
  }) => {
    if (!editingDvrRecord) return;

    // Validate files are selected (mandatory for edit)
    if (dvrFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select at least one file to replace the existing files for this DVR record.",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingDvrFiles(true);

    const updatedRecord = {
      ...editingDvrRecord,
      ...recordData,
      comments: recordData.comments || ''
    };
    
    setDvrRecords(prev => prev.map(record => 
      record.id === editingDvrRecord.id ? updatedRecord : record
    ));
    
    // Handle file replacement if any files are selected
    try {
      if (dvrFiles.length > 0) {
        // First, delete all existing files for this record
        console.log(`🗑️ Deleting existing files for DVR record ${editingDvrRecord.id}...`);
        
        // Get existing documents to delete them
        const existingDocsResponse = await fetch(
          `/api/quality/inspection-documents/${editInspectionOrderDetails?.inspection_order_number}/DVR/${editingDvrRecord.id}/documents`
        );
        
        if (existingDocsResponse.ok) {
          const existingDocs = await existingDocsResponse.json();
          console.log(`🗑️ Found ${existingDocs.length} existing documents to delete`);
          
          // Delete each existing document
          for (const doc of existingDocs) {
            try {
              const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                method: 'DELETE',
              });
              
              if (deleteResponse.ok) {
                console.log(`✅ Deleted existing document ${doc.id}`);
              } else {
                console.warn(`⚠️ Failed to delete document ${doc.id}, continuing with replacement...`);
              }
            } catch (deleteError) {
              console.warn(`⚠️ Error deleting document ${doc.id}:`, deleteError);
            }
          }
        }
        
        // Now upload the new replacement files
        console.log(`📤 Uploading ${dvrFiles.length} replacement files...`);
        const uploadPromises = dvrFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails?.inspection_order_number || '');
          formData.append('tabName', 'DVR');
          formData.append('recordId', editingDvrRecord.id);

          const response = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Upload failed for ${file.name}`);
          }
          return response.json();
        });

        await Promise.all(uploadPromises);
      }

      setIsDvrDialogOpen(false);
      setEditingDvrRecord(null);
      setDvrFiles([]);
      setHasExistingDvrFiles(false);
      
      toast({
        title: "Files Replaced Successfully",
        description: `${dvrFiles.length} replacement file(s) uploaded for DVR record ${editingDvrRecord.id}`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Error",
        description: "DVR record updated but file upload failed. Please try uploading files again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingDvrFiles(false);
    }
  };

  // Function to start editing a DVR record
  const startEditingDvrRecord = async (record: typeof dvrRecords[0]) => {
    setEditingDvrRecord(record);
    
    // Check if files already exist for this record
    const hasFiles = await checkExistingDvrFiles(record.id);
    setHasExistingDvrFiles(hasFiles);
    
    setIsDvrDialogOpen(true);
  };

  // ITP Helper Functions
  const generateItpId = () => {
    const maxId = itpRecords.reduce((max, record) => {
      const num = parseInt(record.id.replace('ITP-', ''));
      return num > max ? num : max;
    }, 0);
    return `ITP-${maxId + 1}`;
  };

  const addItpRecord = async (recordData: {
    itpNumber: string;
    itemDescription: string;
    inspectionStage: string;
    inspector: string;
    inspectionDate: string;
    status: string;
    remarks?: string;
  }) => {
    // Validate files are selected
    if (itpFiles.length === 0) {
      toast({
        title: "Files Required",
        description: "Please select files before creating the ITP record.",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingItpFiles(true);

    const newRecord = {
      id: generateItpId(),
      ...recordData,
      remarks: recordData.remarks || ''
    };
    
    setItpRecords(prev => [...prev, newRecord]);
    
    // Upload files
    try {
      const uploadPromises = itpFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('inspectionOrderNumber', editInspectionOrderDetails?.inspection_order_number || '');
        formData.append('tabName', 'ITP');
        formData.append('recordId', newRecord.id);

        const response = await fetch('/api/quality/inspection-documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed for ${file.name}`);
        }
        return response.json();
      });

      await Promise.all(uploadPromises);

      setIsItpDialogOpen(false);
      setItpFiles([]);
      
      toast({
        title: "Success",
        description: "ITP record added and files uploaded successfully",
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Error",
        description: "ITP record created but file upload failed. Please try uploading files again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingItpFiles(false);
    }
  };

  const editItpRecord = async (recordData: {
    itpNumber: string;
    itemDescription: string;
    inspectionStage: string;
    inspector: string;
    inspectionDate: string;
    status: string;
    remarks?: string;
  }) => {
    if (!editingItpRecord) return;

    // Validate files are selected (mandatory for edit)
    if (itpFiles.length === 0) {
      toast({
        title: "Files Required", 
        description: "Please select at least one file to replace the existing files for this ITP record.",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingItpFiles(true);

    const updatedRecord = {
      ...editingItpRecord,
      ...recordData,
      remarks: recordData.remarks || ''
    };
    
    setItpRecords(prev => prev.map(record => 
      record.id === editingItpRecord.id ? updatedRecord : record
    ));
    
    // Handle file replacement if any files are selected
    try {
      if (itpFiles.length > 0) {
        // First, delete all existing files for this record
        console.log(`🗑️ Deleting existing files for ITP record ${editingItpRecord.id}...`);
        
        // Get existing documents to delete them
        const existingDocsResponse = await fetch(
          `/api/quality/inspection-documents/${editInspectionOrderDetails?.inspection_order_number}/ITP/${editingItpRecord.id}/documents`
        );
        
        if (existingDocsResponse.ok) {
          const existingDocs = await existingDocsResponse.json();
          console.log(`🗑️ Found ${existingDocs.length} existing documents to delete`);
          
          // Delete each existing document
          for (const doc of existingDocs) {
            try {
              const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                method: 'DELETE',
              });
              
              if (deleteResponse.ok) {
                console.log(`✅ Deleted existing document ${doc.id}`);
              } else {
                console.warn(`⚠️ Failed to delete document ${doc.id}, continuing with replacement...`);
              }
            } catch (deleteError) {
              console.warn(`⚠️ Error deleting document ${doc.id}:`, deleteError);
            }
          }
        }
        
        // Now upload the new replacement files
        console.log(`📤 Uploading ${itpFiles.length} replacement files...`);
        const uploadPromises = itpFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails?.inspection_order_number || '');
          formData.append('tabName', 'ITP');
          formData.append('recordId', editingItpRecord.id);

          const response = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Upload failed for ${file.name}`);
          }
          return response.json();
        });

        await Promise.all(uploadPromises);
      }

      setIsItpDialogOpen(false);
      setEditingItpRecord(null);
      setItpFiles([]);
      setHasExistingItpFiles(false);
      
      toast({
        title: "Files Replaced Successfully",
        description: `${itpFiles.length} replacement file(s) uploaded for ITP record ${editingItpRecord.id}`,
      });
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Error",
        description: "ITP record updated but file upload failed. Please try uploading files again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingItpFiles(false);
    }
  };

  const startEditingItpRecord = async (record: typeof itpRecords[0]) => {
    setEditingItpRecord(record);
    
    // Check if files already exist for this record
    const hasFiles = await checkExistingItpFiles(record.id);
    setHasExistingItpFiles(hasFiles);
    
    setIsItpDialogOpen(true);
  };

  // Add new weld record via dialog with file upload support
  const addWeldRecord = async (recordData: {
    id: string;
    weldType: string;
    weldProcess: string;
    wpqrDocument: string;
    welderId: string;
    weldStatus: string;
  }) => {
    // Check if we have valid inspection order details with project code
    if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
      toast({
        title: "Cannot Create Record",
        description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
        variant: "destructive",
      });
      return;
    }

    const newRecordId = recordData.id;
    const newRecord = {
      ...recordData
    };

    // Handle file uploads if any files are selected
    if (weldingFiles.length > 0) {
      setIsUploadingWeldFiles(true);
      
      try {
        // Upload files for this specific record
        for (const file of weldingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails.inspectionOrderNumber);
          formData.append('tabName', 'Welding');
          formData.append('recordId', newRecordId);
          formData.append('projectCode', editInspectionOrderDetails.projectCode);

          const uploadResponse = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload ${file.name}`);
          }
        }

        // Clear file state after successful upload
        setWeldingFiles([]);
        setIsUploadingWeldFiles(false);
        
        toast({
          title: "Success",
          description: `${weldingFiles.length} file(s) uploaded for Weld record ${newRecordId}`,
        });
      } catch (error) {
        console.error('Error uploading files:', error);
        setIsUploadingWeldFiles(false);
        toast({
          title: "Upload Error",
          description: error instanceof Error ? error.message : "Failed to upload files",
          variant: "destructive",
        });
        return;
      }
    }

    setWelds(prev => [...prev, newRecord]);
    setIsWeldingDialogOpen(false);
    toast({
      title: "Success",
      description: "Weld record added successfully" + (weldingFiles.length > 0 ? " with uploaded files" : ""),
    });
  };

  // Edit weld record via dialog
  const editWeldRecord = async (recordData: {
    weldType: string;
    weldProcess: string;
    wpqrDocument: string;
    welderId: string;
    weldStatus: string;
  }) => {
    if (!editingWeldRecord) return;
    
    // Handle file replacement if files are selected
    if (weldingFiles.length > 0) {
      setIsUploadingWeldFiles(true);
      
      try {
        // First, delete existing files if any exist
        console.log('🔥 Starting file replacement for Welding record:', editingWeldRecord.id);
        
        if (hasExistingWeldFiles && editInspectionOrderDetails?.inspectionOrderNumber) {
          console.log('🔥 Deleting existing files before upload...');
          
          try {
            const documentsResponse = await fetch(
              `/api/quality/inspection-documents/${editInspectionOrderDetails.inspectionOrderNumber}/Welding/${editingWeldRecord.id}/documents`
            );
            
            if (documentsResponse.ok) {
              const documents = await documentsResponse.json();
              console.log(`🔥 Found ${documents.length} existing documents to delete`);
              
              // Delete each existing document
              for (const doc of documents) {
                console.log(`🔥 Deleting document: ${doc.fileName} (ID: ${doc.id})`);
                
                const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                  method: 'DELETE',
                  credentials: 'include',
                });
                
                if (deleteResponse.ok) {
                  const result = await deleteResponse.json();
                  if (result.success) {
                    console.log(`🔥 ✅ Document ${doc.fileName} deleted successfully`);
                  } else {
                    console.log(`🔥 ❌ Failed to delete document ${doc.fileName}: ${result.message}`);
                  }
                } else {
                  console.log(`🔥 ❌ Delete request failed for ${doc.fileName} with status ${deleteResponse.status}`);
                }
              }
            } else {
              console.log('🔥 Could not fetch existing documents for deletion');
            }
          } catch (deleteError) {
            console.error('🔥 Error during file deletion:', deleteError);
            // Continue with upload even if deletion fails
          }
        }
        
        // Upload replacement files
        console.log(`🔥 Uploading ${weldingFiles.length} replacement files...`);
        for (const file of weldingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails?.inspectionOrderNumber || '');
          formData.append('tabName', 'Welding');
          formData.append('recordId', editingWeldRecord.id);
          
          const response = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to upload file: ${file.name}`);
          }
          
          console.log(`🔥 ✅ File uploaded successfully: ${file.name}`);
        }
        
        setWeldingFiles([]);
        setIsUploadingWeldFiles(false);
        
        toast({
          title: "Success",
          description: `Weld record updated with ${weldingFiles.length} replacement file(s) uploaded`,
        });
      } catch (error) {
        console.error('🔥 Error during file replacement:', error);
        setIsUploadingWeldFiles(false);
        toast({
          title: "File Replacement Error",
          description: error instanceof Error ? error.message : "Failed to replace files",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Update the record in state
    setWelds(prev => 
      prev.map(record => 
        record.id === editingWeldRecord.id 
          ? { ...record, ...recordData }
          : record
      )
    );
    
    setIsWeldingDialogOpen(false);
    setEditingWeldRecord(null);
    
    // Toast message without file reference if no files were uploaded
    if (weldingFiles.length === 0) {
      toast({
        title: "Success",
        description: "Weld record updated successfully",
      });
    }
  };

  // Function to start editing a weld record
  const startEditingWeldRecord = async (record: typeof welds[0]) => {
    setEditingWeldRecord(record);
    
    // Check for existing files
    const hasFiles = await checkExistingWeldFiles(record.id);
    setHasExistingWeldFiles(hasFiles);
    
    setIsWeldingDialogOpen(true);
  };

  // Add new NDT record via dialog
  const addNdtRecord = async (recordData: {
    id: string;
    ndtMethod: string;
    ndtStandard: string;
    ndtExtent: string;
    ndtTechnician: string;
    ndtDate: string;
    ndtResults: string;
  }) => {
    // Generate unique NDT ID using sequential numbering pattern
    const newRecordId = `NDT-${ndtRecords.length + 1}`;
    
    const newRecord = {
      ...recordData,
      id: newRecordId
    };
    
    setNdtRecords(prev => [...prev, newRecord]);
    
    // Handle file uploads if files are selected
    if (ndtFiles.length > 0) {
      setIsUploadingNdtFiles(true);
      
      try {
        for (const file of ndtFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', params.inspectionOrderNumber || '');
          formData.append('tabName', 'NDT');
          formData.append('recordId', newRecordId);
          
          const response = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }
        }
        
        toast({
          title: "Success",
          description: `${ndtFiles.length} file(s) uploaded for NDT record ${newRecordId}`,
        });
      } catch (error) {
        console.error('Upload error:', error);
        toast({
          title: "Warning",
          description: "Record created but some files failed to upload. Please try uploading files again.",
          variant: "destructive",
        });
      } finally {
        setIsUploadingNdtFiles(false);
        setNdtFiles([]); // Clear selected files
      }
    }
    
    setIsNdtDialogOpen(false);
    
    toast({
      title: "Success",
      description: "NDT record added successfully",
    });
  };

  // Edit NDT record via dialog
  const editNdtRecord = async (recordData: {
    ndtMethod: string;
    ndtStandard: string;
    ndtExtent: string;
    ndtTechnician: string;
    ndtDate: string;
    ndtResults: string;
  }) => {
    if (!editingNdtRecord) return;
    
    // Update the record data first
    setNdtRecords(prev => 
      prev.map(record => 
        record.id === editingNdtRecord.id 
          ? { ...record, ...recordData }
          : record
      )
    );
    
    // Handle file replacement if files are selected
    if (ndtFiles.length > 0) {
      console.log(`🔄 Starting file replacement for NDT record: ${editingNdtRecord.id}`);
      setIsUploadingNdtFiles(true);
      
      try {
        // First, delete existing files if any
        if (hasExistingNdtFiles) {
          console.log(`🗑️ Deleting existing files for NDT record ${editingNdtRecord.id}`);
          
          // Fetch existing documents
          const documentsResponse = await fetch(
            `/api/quality/inspection-documents/${editInspectionOrderDetails?.inspectionOrderNumber}/NDT/${editingNdtRecord.id}/documents`
          );
          
          if (documentsResponse.ok) {
            const existingDocuments = await documentsResponse.json();
            console.log(`🗑️ Found ${existingDocuments.length} existing documents to delete`);
            
            // Delete each existing document
            for (const doc of existingDocuments) {
              console.log(`🗑️ Deleting document ${doc.id}: ${doc.fileName}`);
              try {
                const deleteResponse = await fetch(`/api/quality/inspection-documents/delete/${doc.id}`, {
                  method: 'DELETE',
                  credentials: 'include'
                });
                
                if (deleteResponse.ok) {
                  console.log(`🗑️ ✅ Successfully deleted ${doc.fileName}`);
                } else {
                  console.log(`🗑️ ❌ Failed to delete ${doc.fileName}: ${deleteResponse.status}`);
                }
              } catch (deleteError) {
                console.error(`🗑️ ❌ Error deleting ${doc.fileName}:`, deleteError);
              }
            }
          }
        }
        
        // Upload replacement files
        console.log(`📤 Uploading ${ndtFiles.length} replacement files`);
        for (const file of ndtFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('inspectionOrderNumber', editInspectionOrderDetails?.inspectionOrderNumber || '');
          formData.append('tabName', 'NDT');
          formData.append('recordId', editingNdtRecord.id);
          
          const response = await fetch('/api/quality/inspection-documents/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }
          
          console.log(`📤 ✅ Successfully uploaded ${file.name}`);
        }
        
        toast({
          title: "Success",
          description: `NDT record updated with ${ndtFiles.length} replacement file(s) uploaded`,
        });
      } catch (error) {
        console.error('🔄 ❌ File replacement error:', error);
        toast({
          title: "Warning", 
          description: "Record updated but some files failed to upload. Please try uploading files again.",
          variant: "destructive",
        });
      } finally {
        setIsUploadingNdtFiles(false);
        setNdtFiles([]);
      }
    } else {
      toast({
        title: "Success",
        description: "NDT record updated successfully",
      });
    }
    
    setIsNdtDialogOpen(false);
    setEditingNdtRecord(null);
  };

  // Function to start editing an NDT record
  const startEditingNdtRecord = async (record: typeof ndtRecords[0]) => {
    setEditingNdtRecord(record);
    
    // Check for existing files
    const hasFiles = await checkExistingNdtFiles(record.id);
    setHasExistingNdtFiles(hasFiles);
    
    setIsNdtDialogOpen(true);
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
  // Validate hydrotest records have pressure gauge
  const validateHydrotestRecords = () => {
    // Check if any hydrotest record is missing a pressure gauge
    const invalidRecords = hydrotestRecords.filter(record => !record.pressureGauge);
    
    if (invalidRecords.length > 0) {
      toast({
        title: "Validation Error",
        description: "All hydrotest records must have a pressure gauge selected.",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const handleUpdateInspectionOrder = async (data: InspectionOrderEditFormValues) => {
    if (!editingInspectionOrder) return;
    
    // Validate hydrotest records first
    if (!validateHydrotestRecords()) {
      return; // Stop update process if validation fails
    }
    
    try {
      // Filter out any material rows without a materialId to avoid DB constraint errors
      let materialRows = data.materials || [];
      const validMaterialRows = materialRows.filter(row => row.materialId);
      
      // Filter out empty/placeholder Shop inspection records before saving
      const validShopRecords = shopInspectionRecords.filter(record => 
        record.inspectionType && record.inspectionType.trim() !== ''
      );

      // Combine the form data with the NDT records, Visual records, Weld records, Hydrotest records, NCR records, Approved Drawing records, DVR records, ITP records, PMA records, Procedures records, and Shop inspection records from the state
      const updateData = {
        ...data,
        materials: validMaterialRows,
        ndtRecords: ndtRecords,
        visualRecords: visualRecords,
        hydrotestRecords: hydrotestRecords,
        welds: welds,
        ncrRecords: ncrRecords,
        approvedDrawingRecords: approvedDrawingRecords,
        dvrRecords: dvrRecords,
        itpRecords: itpRecords,
        pmaRecords: pmaRecords,
        procedureRecords: procedureRecords,
        shopInspectionRecords: validShopRecords
      };
      
      console.log("Updating inspection order with data:", updateData);
      console.log("ITP records being sent to server:", itpRecords);
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
        if (!isNaN(date.getTime())) { // Check if date is valid
          const monthYear = format(date, 'MMM yyyy');
          monthCounts[monthYear] = (monthCounts[monthYear] || 0) + 1;
        }
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
        if (order.hydrotestDate) {
          const testDate = new Date(order.hydrotestDate);
          if (!isNaN(testDate.getTime())) scheduleDate = testDate;
        }
        if (order.ndtDate) {
          const testDate = new Date(order.ndtDate);
          if (!isNaN(testDate.getTime())) scheduleDate = testDate;
        }
        if (order.visualInspectionDate) {
          const testDate = new Date(order.visualInspectionDate);
          if (!isNaN(testDate.getTime())) scheduleDate = testDate;
        }
        
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
      case "canceled":
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
          <h1 className="text-3xl font-bold tracking-tight pl-4">Quality Inspections</h1>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)} 
            className="bg-gradient-to-r from-green-600 to-teal-600"
          >
            <Plus className="mr-2 h-4 w-4" /> Create Inspection Report
          </Button>
        </div>
        
        {/* Inspection Orders Preview Dialog */}
        <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
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
            <div className="mb-6 space-y-4">
              <div>
                <Label htmlFor="project-filter">Select Project</Label>
                <Select 
                  value={selectedProject?.toString() || ""}
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
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="keep-project-visible"
                  checked={keepProjectVisible}
                  onCheckedChange={(checked) => setKeepProjectVisible(checked as boolean)}
                />
                <Label 
                  htmlFor="keep-project-visible" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Keep Visible (Maintain project filter when returning from edit/view pages)
                </Label>
              </div>
              
              {selectedProject && (
                <div>
                  <Label htmlFor="search-filter">Search Inspections</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search-filter"
                      placeholder="Search by report number, title, or type..."
                      className="pl-8 w-full md:w-[300px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              )}
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
              <div></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>
                    {searchQuery 
                      ? `Showing ${Array.isArray(inspections) 
                          ? inspections
                              .filter((i: any) => i.reportType !== 'work_order')
                              .filter((inspection: any) => {
                                const query = searchQuery.toLowerCase();
                                return (
                                  (inspection.reportNumber && inspection.reportNumber.toLowerCase().includes(query)) ||
                                  (inspection.title && inspection.title.toLowerCase().includes(query)) ||
                                  (inspection.reportType && inspection.reportType.toLowerCase().includes(query))
                                );
                              }).length
                          : 0} of ${Array.isArray(inspections) 
                          ? inspections.filter((i: any) => i.reportType !== 'work_order').length 
                          : 0} inspection reports`
                      : `Showing ${Array.isArray(inspections) 
                          ? inspections.filter((i: any) => i.reportType !== 'work_order').length 
                          : 0} inspection reports`
                    }
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
                      .filter((inspection: any) => {
                        if (!searchQuery) return true;
                        const query = searchQuery.toLowerCase();
                        return (
                          (inspection.reportNumber && inspection.reportNumber.toLowerCase().includes(query)) ||
                          (inspection.title && inspection.title.toLowerCase().includes(query)) ||
                          (inspection.reportType && inspection.reportType.toLowerCase().includes(query))
                        );
                      })
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
              <CardTitle className="pl-4">Inspection Orders</CardTitle>
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
                  
                  {/* List View Tab - Hierarchical Card View */}
                  <TabsContent value="list" className="mt-4">
                    <div className="mb-4">
                      <div className="relative w-full md:w-[300px]">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search inspection orders..."
                          className="pl-8"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    {searchQuery.trim() !== '' ? (
                      // Show filtered table view for search results
                      <div className="overflow-x-auto">
                        <Table>
                          <TableCaption>
                            {`Showing ${inspectionOrders.filter((order: any) => {
                              const query = searchQuery.toLowerCase();
                              return (
                                (order.inspection_order_number && order.inspection_order_number.toLowerCase().includes(query)) ||
                                (order.inspectionOrderNumber && order.inspectionOrderNumber.toLowerCase().includes(query)) ||
                                (order.description && order.description.toLowerCase().includes(query)) ||
                                (order.title && order.title.toLowerCase().includes(query)) ||
                                (order.drawing_no && order.drawing_no.toLowerCase().includes(query)) ||
                                (order.drawingNo && order.drawingNo.toLowerCase().includes(query)) ||
                                (order.status && order.status.toLowerCase().includes(query))
                              );
                            }).length} of ${inspectionOrders.length} inspection orders`}
                          </TableCaption>
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
                            {inspectionOrders
                              .filter((order: any) => {
                                if (!searchQuery) return true;
                                const query = searchQuery.toLowerCase();
                                return (
                                  (order.inspection_order_number && order.inspection_order_number.toLowerCase().includes(query)) ||
                                  (order.inspectionOrderNumber && order.inspectionOrderNumber.toLowerCase().includes(query)) ||
                                  (order.description && order.description.toLowerCase().includes(query)) ||
                                  (order.title && order.title.toLowerCase().includes(query)) ||
                                  (order.drawing_no && order.drawing_no.toLowerCase().includes(query)) ||
                                  (order.drawingNo && order.drawingNo.toLowerCase().includes(query)) ||
                                  (order.status && order.status.toLowerCase().includes(query))
                                );
                              })
                              .map((order: any) => (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.inspection_order_number || order.inspectionOrderNumber}</TableCell>
                                <TableCell>{order.description || order.title}</TableCell>
                                <TableCell>{order.drawing_no || order.drawingNo || 'N/A'}</TableCell>
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
                    ) : (
                      // Show hierarchical card view for normal display
                      <div className="space-y-2">
                        {/* Hierarchical Inspection Orders */}
                        {organizedInspectionOrders.map((order: any) => (
                          <div 
                            key={`${order.type}-${order.id}`} 
                            className={`flex items-center justify-between p-4 rounded border ${
                              order.type === 'parent' 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-purple-50 border-purple-200 ml-6'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <ClipboardCheck className={`w-4 h-4 ${order.type === 'parent' ? 'text-green-600' : 'text-purple-600'}`} />
                              <Badge 
                                variant="outline" 
                                className={
                                  order.type === 'parent'
                                    ? 'bg-green-100 text-green-700 border-green-300'
                                    : 'bg-purple-100 text-purple-700 border-purple-300'
                                }
                              >
                                {order.type === 'parent' ? '🟩 Parent Assembly' : '🟪 Component'}
                              </Badge>
                              <div>
                                <div className="font-mono font-bold text-lg">{order.inspection_order_number || order.inspectionOrderNumber}</div>
                                <div className="font-medium text-gray-900">{order.description || order.title}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Drawing: {order.drawing_no || order.drawingNo || 'N/A'} | 
                                  Qty: {order.quantity} {order.unit} | 
                                  Status: {getStatusBadge(order.status)}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-600 hover:text-gray-800"
                                onClick={() => {
                                  setSelectedInspectionOrder(order.id);
                                  setIsDetailsDialogOpen(true);
                                }}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-600 hover:text-gray-800"
                                onClick={() => {
                                  setEditingInspectionOrder(order.id);
                                  setIsEditDialogOpen(true);
                                }}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                                    
                                    // Safe date parsing with validation
                                    if (!schedule.date) return false;
                                    const scheduleDate = new Date(schedule.date);
                                    if (isNaN(scheduleDate.getTime())) return false;
                                    
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
                                        <p className="font-medium">
                                          {schedule.date && !isNaN(new Date(schedule.date).getTime()) 
                                            ? format(new Date(schedule.date), 'dd MMM yyyy')
                                            : 'Invalid Date'
                                          }
                                        </p>
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
        <DialogContent className="min-w-[1280px] max-w-[95vw] w-[90vw] max-h-[95vh]">
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
                              <SelectItem value="canceled">Cancelled</SelectItem>
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
                  onValueChange={async (value) => {
                    // Check for existing final dossier when Final Dossier tab is selected
                    if (value === 'final-dossier' && editInspectionOrderDetails?.inspectionOrderNumber) {
                      console.log('Final Dossier tab selected, checking for existing dossier...');
                      // Set today's date when Final Dossier tab is selected
                      editForm.setValue('dossierCompletionDate', new Date().toISOString().split('T')[0]);
                      
                      try {
                        await checkExistingFinalDossier(editInspectionOrderDetails.inspectionOrderNumber);
                      } catch (error) {
                        console.error('Error checking for existing Final Dossier:', error);
                        // Don't show error toast as this is background functionality
                      }
                    }
                  }}
                >
                  <ScrollArea className="w-full whitespace-nowrap pb-2">
                    <TabsList className="inline-flex w-max min-w-full space-x-1 px-1">
                      <TabsTrigger value="approved-drawing" className="shrink-0">Drawing</TabsTrigger>
                      <TabsTrigger value="dvr" className="shrink-0">DVR</TabsTrigger>
                      <TabsTrigger value="itp" className="shrink-0">ITP</TabsTrigger>
                      <TabsTrigger value="material" className="shrink-0">Material</TabsTrigger>
                      <TabsTrigger value="pma" className="shrink-0">PMA</TabsTrigger>
                      <TabsTrigger value="procedures" className="shrink-0">Procedures</TabsTrigger>
                      <TabsTrigger value="shop" className="shrink-0">Shop</TabsTrigger>
                      <TabsTrigger value="welding" className="shrink-0">Welding</TabsTrigger>
                      <TabsTrigger value="ndt" className="shrink-0">NDT</TabsTrigger>
                      <TabsTrigger value="visual" className="shrink-0">Visual</TabsTrigger>
                      <TabsTrigger value="hydrotest" className="shrink-0">Hydrotest</TabsTrigger>
                      <TabsTrigger value="non-conformance" className="shrink-0">NCR</TabsTrigger>
                      <TabsTrigger value="final-dossier" className="shrink-0">Dossier</TabsTrigger>
                    </TabsList>
                  </ScrollArea>
                  
                  {/* Approved Drawing Tab */}
                  <TabsContent value="approved-drawing" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Approved Drawing</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="flex items-center text-xs"
                          disabled={approvedDrawingRecords.length >= 1}
                          onClick={() => {
                            // Check if we have valid project code before opening dialog
                            if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Create Record",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setIsApprovedDrawingDialogOpen(true);
                          }}
                          title={approvedDrawingRecords.length >= 1 ? "Only one Drawing record is allowed per inspection order" : "Add Approved Drawing Record"}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> 
                          {approvedDrawingRecords.length >= 1 ? "Drawing Record Added" : "Add Approved Drawing Record"}
                        </Button>
                      </div>
                      
                      {/* Approved Drawing Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Record ID</TableHead>
                              <TableHead className="w-[200px]">Drawing Title</TableHead>
                              <TableHead className="w-[150px]">Drawing Number</TableHead>
                              <TableHead className="w-[100px]">Revision</TableHead>
                              <TableHead className="w-[120px]">Approved By</TableHead>
                              <TableHead className="w-[120px]">Approval Date</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {approvedDrawingRecords.length > 0 ? (
                              approvedDrawingRecords.map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.id}</TableCell>
                                  <TableCell>{record.drawingTitle}</TableCell>
                                  <TableCell>{record.drawingNumber}</TableCell>
                                  <TableCell>{record.revision}</TableCell>
                                  <TableCell>{record.approvedBy}</TableCell>
                                  <TableCell>{record.approvalDate}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      record.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                      record.status === 'Under Review' ? 'bg-yellow-100 text-yellow-800' :
                                      record.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {record.status}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "Approved Drawing",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => {
                                          setEditingApprovedDrawingRecord(record);
                                          setIsApprovedDrawingDialogOpen(true);
                                        }}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-purple-500 hover:text-purple-700 hover:bg-purple-100"
                                        title="File Download"
                                        onClick={async () => {
                                          try {
                                            // Fetch documents for this record
                                            const response = await fetch(
                                              `/api/quality/inspection-documents/${editInspectionOrderDetails?.inspectionOrderNumber}/Approved Drawing/${record.id}/documents`
                                            );
                                            
                                            if (response.ok) {
                                              const documents = await response.json();
                                              if (documents.length > 0) {
                                                // Download the first document
                                                const downloadResponse = await fetch(`/api/quality/inspection-documents/download/${documents[0].id}`);
                                                if (downloadResponse.ok) {
                                                  const blob = await downloadResponse.blob();
                                                  const url = window.URL.createObjectURL(blob);
                                                  const a = document.createElement('a');
                                                  a.href = url;
                                                  a.download = documents[0].originalFileName;
                                                  document.body.appendChild(a);
                                                  a.click();
                                                  document.body.removeChild(a);
                                                  window.URL.revokeObjectURL(url);
                                                } else {
                                                  toast({
                                                    title: "Download Failed",
                                                    description: "Failed to download the document",
                                                    variant: "destructive"
                                                  });
                                                }
                                              } else {
                                                toast({
                                                  title: "No Documents",
                                                  description: "No documents found for this record",
                                                  variant: "destructive"
                                                });
                                              }
                                            } else {
                                              toast({
                                                title: "Error",
                                                description: "Failed to fetch documents",
                                                variant: "destructive"
                                              });
                                            }
                                          } catch (error) {
                                            console.error('Download error:', error);
                                            toast({
                                              title: "Download Error",
                                              description: "An error occurred while downloading the document",
                                              variant: "destructive"
                                            });
                                          }
                                        }}
                                      >
                                        <Download className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                  No approved drawing records available. Click "Add Approved Drawing Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {approvedDrawingRecords.length > 0 ? (
                              approvedDrawingRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.drawingTitle || `Drawing ${record.id}`}
                                  tabName="Approved Drawing"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All Drawing Files"
                                tabName="Approved Drawing"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* DVR Tab */}
                  <TabsContent value="dvr" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">DVR (Document Verification Record)</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="flex items-center text-xs"
                          disabled={dvrRecords.length >= 1}
                          onClick={() => {
                            // Check if we have valid project code before opening dialog
                            if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Create Record",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setEditingDvrRecord(null);
                            setIsDvrDialogOpen(true);
                          }}
                          title={dvrRecords.length >= 1 ? "Only one DVR record is allowed per inspection order" : "Add DVR Record"}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> 
                          {dvrRecords.length >= 1 ? "DVR Record Added" : "Add DVR Record"}
                        </Button>
                      </div>
                      
                      {/* DVR Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Record ID</TableHead>
                              <TableHead className="w-[200px]">Design Document</TableHead>
                              <TableHead className="w-[150px]">Review Type</TableHead>
                              <TableHead className="w-[150px]">Reviewer</TableHead>
                              <TableHead className="w-[120px]">Review Date</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[150px]">Comments</TableHead>
                              <TableHead className="w-[200px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dvrRecords.length > 0 ? (
                              dvrRecords.map((record) => (
                                <TableRow key={record.id} className="hover:bg-gray-50">
                                  <TableCell className="text-xs font-medium">{record.id}</TableCell>
                                  <TableCell className="text-xs">{record.designDocument || '-'}</TableCell>
                                  <TableCell className="text-xs">
                                    <span className="capitalize">
                                      {record.reviewType ? record.reviewType.replace('_', ' ') : '-'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-xs">{record.reviewer || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.reviewDate || '-'}</TableCell>
                                  <TableCell className="text-xs">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      record.status === 'approved' ? 'bg-green-100 text-green-700' :
                                      record.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                      record.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                      record.status === 'requires_revision' ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {record.status ? record.status.replace('_', ' ').toUpperCase() : 'PENDING'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-xs">{record.comments || '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "DVR",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => startEditingDvrRecord(record)}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-purple-500 hover:text-purple-700 hover:bg-purple-100"
                                        title="File Download"
                                        onClick={async () => {
                                          try {
                                            // Fetch documents for this record
                                            const response = await fetch(
                                              `/api/quality/inspection-documents/${editInspectionOrderDetails?.inspectionOrderNumber}/DVR/${record.id}/documents`
                                            );
                                            
                                            if (response.ok) {
                                              const documents = await response.json();
                                              if (documents.length > 0) {
                                                // Download the first document
                                                const downloadResponse = await fetch(`/api/quality/inspection-documents/download/${documents[0].id}`);
                                                if (downloadResponse.ok) {
                                                  const blob = await downloadResponse.blob();
                                                  const url = window.URL.createObjectURL(blob);
                                                  const a = document.createElement('a');
                                                  a.href = url;
                                                  a.download = documents[0].originalFileName;
                                                  document.body.appendChild(a);
                                                  a.click();
                                                  document.body.removeChild(a);
                                                  window.URL.revokeObjectURL(url);
                                                } else {
                                                  toast({
                                                    title: "Download Failed",
                                                    description: "Failed to download the document",
                                                    variant: "destructive"
                                                  });
                                                }
                                              } else {
                                                toast({
                                                  title: "No Documents",
                                                  description: "No documents found for this record",
                                                  variant: "destructive"
                                                });
                                              }
                                            } else {
                                              toast({
                                                title: "Error",
                                                description: "Failed to fetch documents",
                                                variant: "destructive"
                                              });
                                            }
                                          } catch (error) {
                                            console.error('Download error:', error);
                                            toast({
                                              title: "Download Error",
                                              description: "An error occurred while downloading the document",
                                              variant: "destructive"
                                            });
                                          }
                                        }}
                                      >
                                        <Download className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                  No DVR records available. Click "Add DVR Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {dvrRecords.length > 0 ? (
                              dvrRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.designDocument || `DVR ${record.id}`}
                                  tabName="DVR"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All DVR Files"
                                tabName="DVR"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* ITP Tab */}
                  <TabsContent value="itp" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">ITP (Inspection and Test Plan)</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          disabled={itpRecords.length >= 1}
                          onClick={() => {
                            // Check if we have valid project code before opening dialog
                            if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Create Record",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setEditingItpRecord(null);
                            setIsItpDialogOpen(true);
                          }}
                          className="flex items-center text-xs"
                          title={itpRecords.length >= 1 ? "Only one ITP record is allowed per inspection order" : "Add ITP Record"}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> 
                          {itpRecords.length >= 1 ? "ITP Record Added" : "Add ITP Record"}
                        </Button>
                      </div>
                      
                      {/* ITP records table - display only format */}
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="text-xs w-20">ITP ID</TableHead>
                              <TableHead className="text-xs w-32">ITP Number</TableHead>
                              <TableHead className="text-xs w-48">Item Description</TableHead>
                              <TableHead className="text-xs w-32">Inspection Stage</TableHead>
                              <TableHead className="text-xs w-32">Inspector</TableHead>
                              <TableHead className="text-xs w-24">Date</TableHead>
                              <TableHead className="text-xs w-20">Status</TableHead>
                              <TableHead className="text-xs w-48">Remarks</TableHead>
                              <TableHead className="text-xs w-36">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {itpRecords && itpRecords.length > 0 ? (
                              itpRecords.map((record) => (
                                <TableRow key={record.id} className="hover:bg-gray-50">
                                  <TableCell className="text-xs font-mono text-blue-600">{record.id}</TableCell>
                                  <TableCell className="text-xs">{record.itpNumber || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.itemDescription || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.inspectionStage || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.inspector || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.inspectionDate || '-'}</TableCell>
                                  <TableCell className="text-xs">
                                    <Badge 
                                      variant={
                                        record.status === 'Pass' ? 'default' : 
                                        record.status === 'Failed' ? 'destructive' : 
                                        record.status === 'Pending' ? 'secondary' : 'outline'
                                      }
                                      className="text-xs"
                                    >
                                      {record.status || '-'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">{record.remarks || '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "ITP",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => startEditingItpRecord(record)}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-purple-500 hover:text-purple-700 hover:bg-purple-100"
                                        title="File Download"
                                        onClick={async () => {
                                          try {
                                            // Fetch documents for this record
                                            const response = await fetch(
                                              `/api/quality/inspection-documents/${editInspectionOrderDetails?.inspectionOrderNumber}/ITP/${record.id}/documents`
                                            );
                                            
                                            if (response.ok) {
                                              const documents = await response.json();
                                              if (documents.length > 0) {
                                                // Download the first document
                                                const downloadResponse = await fetch(`/api/quality/inspection-documents/download/${documents[0].id}`);
                                                if (downloadResponse.ok) {
                                                  const blob = await downloadResponse.blob();
                                                  const url = window.URL.createObjectURL(blob);
                                                  const a = document.createElement('a');
                                                  a.href = url;
                                                  a.download = documents[0].originalFileName;
                                                  document.body.appendChild(a);
                                                  a.click();
                                                  document.body.removeChild(a);
                                                  window.URL.revokeObjectURL(url);
                                                } else {
                                                  toast({
                                                    title: "Download Failed",
                                                    description: "Failed to download the document",
                                                    variant: "destructive"
                                                  });
                                                }
                                              } else {
                                                toast({
                                                  title: "No Documents",
                                                  description: "No documents found for this record",
                                                  variant: "destructive"
                                                });
                                              }
                                            } else {
                                              toast({
                                                title: "Error",
                                                description: "Failed to fetch documents",
                                                variant: "destructive"
                                              });
                                            }
                                          } catch (error) {
                                            console.error('Download error:', error);
                                            toast({
                                              title: "Download Error",
                                              description: "An error occurred while downloading the document",
                                              variant: "destructive"
                                            });
                                          }
                                        }}
                                      >
                                        <Download className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                  No ITP records available. Click "Add ITP Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {itpRecords.length > 0 ? (
                              itpRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.itpNumber || `ITP ${record.id}`}
                                  tabName="ITP"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All ITP Files"
                                tabName="ITP"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* PMA Tab */}
                  <TabsContent value="pma" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">PMA (Particular Material Appraisal)</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            // Check if we have valid project code before opening dialog
                            if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Create Record",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setEditingPmaRecord(null);
                            setIsPmaDialogOpen(true);
                          }}
                          className="flex items-center text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add PMA Record
                        </Button>
                      </div>
                      
                      {/* PMA Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs font-medium">PMA Number</TableHead>
                              <TableHead className="text-xs font-medium">Material Specification</TableHead>
                              <TableHead className="text-xs font-medium">Grade</TableHead>
                              <TableHead className="text-xs font-medium">Certified By</TableHead>
                              <TableHead className="text-xs font-medium">Issue Date</TableHead>
                              <TableHead className="text-xs font-medium">Expiry Date</TableHead>
                              <TableHead className="text-xs font-medium">Status</TableHead>
                              <TableHead className="text-xs font-medium">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pmaRecords.length > 0 ? (
                              pmaRecords.map((record, index) => (
                                <TableRow key={index} className="hover:bg-gray-50">
                                  <TableCell className="text-xs">{record.pmaNumber || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.materialSpecification || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.materialGrade || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.certifiedBy || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.issueDate || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.expiryDate || '-'}</TableCell>
                                  <TableCell className="text-xs">
                                    <Badge 
                                      variant={record.status === 'active' ? 'default' : 
                                              record.status === 'expired' ? 'destructive' : 'secondary'}
                                      className="text-xs"
                                    >
                                      {record.status || 'draft'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "PMA",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => {
                                          setEditingPmaRecord(record);
                                          setIsPmaDialogOpen(true);
                                        }}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete PMA record ${record.id}? This action cannot be undone.`)) {
                                            deletePmaRecord(record.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                  No PMA records available. Click "Add PMA Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {pmaRecords.length > 0 ? (
                              pmaRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.pmaNumber || `PMA ${record.id}`}
                                  tabName="PMA"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All PMA Files"
                                tabName="PMA"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Procedures Tab */}
                  <TabsContent value="procedures" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Test Procedures</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            // Check if we have valid project code before opening dialog
                            if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Link Procedure",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setEditingProcedureRecord(null);
                            setIsProceduresDialogOpen(true);
                          }}
                          className="flex items-center text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Link Test Procedure
                        </Button>
                      </div>
                      
                      {/* Procedures Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs font-medium">Procedure Number</TableHead>
                              <TableHead className="text-xs font-medium">Procedure Name</TableHead>
                              <TableHead className="text-xs font-medium">NDT Method</TableHead>
                              <TableHead className="text-xs font-medium">Applicable Standard</TableHead>
                              <TableHead className="text-xs font-medium">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {procedureRecords.length > 0 ? (
                              procedureRecords.map((record, index) => (
                                <TableRow key={index} className="hover:bg-gray-50">
                                  <TableCell className="text-xs">{record.procedureNumber || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.procedureName || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.ndtMethod || '-'}</TableCell>
                                  <TableCell className="text-xs">{record.applicableStandard || '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "TestProcedures",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => {
                                          setEditingProcedureRecord(record);
                                          setIsProceduresDialogOpen(true);
                                        }}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete Test Procedure record ${record.procedureNumber}? This action cannot be undone.`)) {
                                            removeProcedureRecord(index);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                  No test procedure records available. Click "Link Test Procedure" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {procedureRecords.length > 0 ? (
                              procedureRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.procedureNumber || `Test Procedure ${record.id}`}
                                  tabName="TestProcedures"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All Test Procedure Files"
                                tabName="TestProcedures"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Material Traceability Tab */}
                  <TabsContent value="material" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Material Traceability</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            // Check if we have valid project code before opening dialog
                            if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Create Record",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive",
                              });
                              return;
                            }
                            setEditingMaterialRecord(null);
                            setIsMaterialDialogOpen(true);
                          }}
                          className="flex items-center text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Material Record
                        </Button>
                      </div>
                      
                      {/* Material rows table - display only format */}
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs font-medium">Material Type</TableHead>
                              <TableHead className="text-xs font-medium">Description</TableHead>
                              <TableHead className="text-xs font-medium">Material ID</TableHead>
                              <TableHead className="text-xs font-medium">Certificate #</TableHead>
                              <TableHead className="text-xs font-medium">Heat #</TableHead>
                              <TableHead className="text-xs font-medium">Grade</TableHead>
                              <TableHead className="text-xs font-medium">Specification</TableHead>
                              <TableHead className="text-xs font-medium">Quantity</TableHead>
                              <TableHead className="text-xs font-medium">Unit</TableHead>
                              <TableHead className="text-xs font-medium">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {materialRows.length > 0 ? (
                              materialRows.map((materialRow, index) => (
                                <TableRow key={index} className="hover:bg-gray-50">
                                  <TableCell className="text-xs">
                                    {materialRow.materialType || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.description || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.materialIdentificationId || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.materialCertificateNumber || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.heatNumber || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.materialGrade || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.materialSpecification || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.allocatedQuantity || '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {materialRow.quantityUnit || '-'}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "Material Traceability",
                                            recordId: materialRow.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-7 w-7 text-green-600 hover:text-green-800 hover:bg-green-50"
                                        onClick={() => {
                                          setEditingMaterialRecord(materialRow);
                                          // Set the material type for editing
                                          setSelectedMaterialType(materialRow.materialType || "");
                                          setIsMaterialDialogOpen(true);
                                        }}
                                        title="Edit"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete material record ${materialRow.materialIdentificationId || materialRow.description || 'this record'}? This action cannot be undone.`)) {
                                            deleteMaterialRecord(materialRow.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={10} className="text-center py-10">
                                  <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    No materials linked to this inspection order.
                                  </p>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Click "Add Material Record" to link materials from Material Identification module.
                                  </p>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Certificate Upload/View Buttons */}
                      <div className="flex items-center gap-2 mt-4">
                        <Button type="button" variant="outline" size="sm" className="text-xs">
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Upload Certificate
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="text-xs">
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View Attachments
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Shop Inspection Tab */}
                  <TabsContent value="shop" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Shop Inspection</h3>
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            className="flex items-center text-xs"
                            onClick={() => {
                              // Check if we have valid project code before opening dialog
                              if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                                toast({
                                  title: "Cannot Create Record",
                                  description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              setIsShopInspectionDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Shop Inspection Record
                          </Button>
                          

                        </div>
                      </div>
                      
                      {/* Shop Inspection Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Record ID</TableHead>
                              <TableHead className="w-[150px]">Inspection Type</TableHead>
                              <TableHead className="w-[120px]">Inspector</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[200px]">Remarks</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shopInspectionRecords.length > 0 ? (
                              shopInspectionRecords.map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.id}</TableCell>
                                  <TableCell>{record.inspectionType}</TableCell>
                                  <TableCell>{record.inspector}</TableCell>
                                  <TableCell>{record.date}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      record.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                      record.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {record.status}
                                    </span>
                                  </TableCell>
                                  <TableCell>{record.remarks}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "ShopInspection",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => startEditingShopRecord(record)}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete Shop Inspection record "${record.id}"?\n\nThis will permanently delete:\n• The inspection record\n• All uploaded documents from cloud storage\n\nThis action cannot be undone.`)) {
                                            deleteShopInspectionRecord(record.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                  No shop inspection records available. Click "Add Shop Inspection Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      

                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {shopInspectionRecords.length > 0 ? (
                              shopInspectionRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.inspectionType || `Shop Inspection ${record.id}`}
                                  tabName="ShopInspection"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All Shop Inspection Files"
                                tabName="ShopInspection"
                              />
                            )}
                          </div>
                        </div>
                      )}
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
                                  {weld.weldType ? getWeldTypeName(weld.weldType) : "-"}
                                </TableCell>
                                <TableCell>
                                  {weld.weldProcess ? getWeldProcessName(weld.weldProcess) : "-"}
                                </TableCell>
                                <TableCell>
                                  {weld.wpqrDocument || "-"}
                                </TableCell>
                                <TableCell>
                                  {weld.welderId || "-"}
                                </TableCell>
                                <TableCell>
                                  {weld.weldStatus || "-"}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center space-x-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                      title="View"
                                      onClick={() => {
                                        setDocumentViewerConfig({
                                          inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                          tabName: "Welding",
                                          recordId: weld.id
                                        });
                                        setShowDocumentViewer(true);
                                      }}
                                    >
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                      title="Edit"
                                      onClick={() => startEditingWeldRecord(weld)}
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                      title="Delete"
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete Welding record "${weld.id}"?\n\nThis will permanently delete:\n• The welding record\n• All uploaded documents from cloud storage\n\nThis action cannot be undone.`)) {
                                          deleteWeld(index);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
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
                            onClick={() => {
                              if (editInspectionOrderDetails?.projectCode === 'UNKNOWN') {
                                toast({
                                  title: "Project Code Required",
                                  description: "Cannot add weld records when project code is UNKNOWN. Please set a valid project code first.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              setIsWeldingDialogOpen(true);
                            }}
                            className="mr-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Weld Record
                          </Button>
                        </div>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {welds && welds.length > 0 ? (
                              welds.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={`Weld Record - ${record.id}`}
                                  tabName="Welding"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All Welding Files"
                                tabName="Welding"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* NDT Tab */}
                  <TabsContent value="ndt" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Non-Destructive Testing (NDT)</h3>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="flex items-center text-xs"
                          onClick={() => {
                            if (editInspectionOrderDetails?.projectCode === 'UNKNOWN') {
                              toast({
                                title: "Cannot Create Record",
                                description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                variant: "destructive"
                              });
                              return;
                            }
                            setIsNdtDialogOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add NDT Record
                        </Button>
                      </div>
                      
                      {/* NDT Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">NDT ID</TableHead>
                              <TableHead className="w-[150px]">Method</TableHead>
                              <TableHead className="w-[120px]">Standard</TableHead>
                              <TableHead className="w-[100px]">Extent (%)</TableHead>
                              <TableHead className="w-[120px]">Technician</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[100px]">Results</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(ndtRecords) && ndtRecords.length > 0 ? (
                              ndtRecords.map((record, index) => (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.id}</TableCell>
                                  <TableCell>{record.ndtMethod ? getNdtMethodName(record.ndtMethod) : "-"}</TableCell>
                                  <TableCell>{record.ndtStandard || "-"}</TableCell>
                                  <TableCell>{record.ndtExtent ? `${record.ndtExtent}%` : "-"}</TableCell>
                                  <TableCell>{record.ndtTechnician || "-"}</TableCell>
                                  <TableCell>{record.ndtDate || "-"}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      record.ndtResults === 'Pass' ? 'bg-green-100 text-green-800' :
                                      record.ndtResults === 'Fail' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {record.ndtResults || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "NDT",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => startEditingNdtRecord(record)}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete NDT record "${record.id}"?\n\nThis will permanently delete:\n• The NDT record\n• All uploaded documents from cloud storage\n\nThis action cannot be undone.`)) {
                                            deleteNdtRecord(record.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                  No NDT records available. Click "Add NDT Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {Array.isArray(ndtRecords) && ndtRecords.length > 0 ? (
                              ndtRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={`${record.ndtMethod ? getNdtMethodName(record.ndtMethod) : 'NDT'} - ${record.id}`}
                                  tabName="NDT"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All NDT Files"
                                tabName="NDT"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Visual Inspection Tab */}
                  <TabsContent value="visual" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Visual Inspection</h3>
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            className="flex items-center text-xs"
                            onClick={() => {
                              // Check if we have valid project code before opening dialog
                              if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                                toast({
                                  title: "Cannot Create Record",
                                  description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              setIsVisualDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Visual Inspection Record
                          </Button>
                        </div>
                      </div>
                      
                      {/* Visual Inspection Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Record ID</TableHead>
                              <TableHead className="w-[120px]">Standard</TableHead>
                              <TableHead className="w-[150px]">Dimensional Checks</TableHead>
                              <TableHead className="w-[150px]">Surface Condition</TableHead>
                              <TableHead className="w-[120px]">Inspector</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[200px]">Observations</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(visualRecords) && visualRecords.length > 0 ? (
                              visualRecords.map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.id}</TableCell>
                                  <TableCell>{record.standard}</TableCell>
                                  <TableCell>{record.dimensionalChecks}</TableCell>
                                  <TableCell>{record.surfaceCondition}</TableCell>
                                  <TableCell>{record.inspector}</TableCell>
                                  <TableCell>{record.inspectionDate}</TableCell>
                                  <TableCell>{record.observations}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "Visual",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => startEditingVisualRecord(record)}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete Visual Inspection record "${record.id}"?\n\nThis will permanently delete:\n• The inspection record\n• All uploaded documents from cloud storage\n\nThis action cannot be undone.`)) {
                                            deleteVisualRecord(record.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                  No visual inspection records available. Click "Add Visual Inspection Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {visualRecords.length > 0 ? (
                              visualRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={record.standard || `Visual Inspection ${record.id}`}
                                  tabName="Visual"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All Visual Inspection Files"
                                tabName="Visual"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Hydrotest Tab */}
                  <TabsContent value="hydrotest" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Hydrotest</h3>
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            className="flex items-center text-xs"
                            onClick={() => {
                              // Check if we have valid project code before opening dialog
                              if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                                toast({
                                  title: "Cannot Create Record",
                                  description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              setEditingHydrotestRecord(null);
                              setIsHydrotestDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Hydrotest Record
                          </Button>
                        </div>
                      </div>
                      
                      {/* Hydrotest Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Record ID</TableHead>
                              <TableHead className="w-[120px]">Pressure (bar)</TableHead>
                              <TableHead className="w-[120px]">Duration (min)</TableHead>
                              <TableHead className="w-[100px]">Medium</TableHead>
                              <TableHead className="w-[150px]">Pressure Gauge</TableHead>
                              <TableHead className="w-[120px]">Inspector</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[100px]">Result</TableHead>
                              <TableHead className="w-[200px]">Notes</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(hydrotestRecords) && hydrotestRecords.length > 0 ? (
                              hydrotestRecords.map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.id}</TableCell>
                                  <TableCell>{record.pressure || "-"}</TableCell>
                                  <TableCell>{record.duration || "-"}</TableCell>
                                  <TableCell>{record.medium || "-"}</TableCell>
                                  <TableCell>
                                    {record.pressureGauge ? 
                                      calibrationInstruments.find(i => i.instrument_id === record.pressureGauge)?.instrument_name || 
                                      record.pressureGauge : 
                                      "-"}
                                  </TableCell>
                                  <TableCell>{record.operator || "-"}</TableCell>
                                  <TableCell>{record.testDate || "-"}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      record.result === 'Pass' ? 'bg-green-100 text-green-800' :
                                      record.result === 'Fail' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {record.result || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell>{record.notes || "-"}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "Hydrotest",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={() => {
                                          setEditingHydrotestRecord(record);
                                          setIsHydrotestDialogOpen(true);
                                        }}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete Hydrotest record "${record.id}"?\n\nThis will permanently delete:\n• The inspection record\n• All uploaded documents from cloud storage\n\nThis action cannot be undone.`)) {
                                            deleteHydrotestRecord(record.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                  No hydrotest records available. Click "Add Hydrotest Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {hydrotestRecords.length > 0 ? (
                              hydrotestRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={`Hydrotest Record - ${record.id}`}
                                  tabName="Hydrotest"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All Hydrotest Files"
                                tabName="Hydrotest"
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Non-Conformance Tab */}
                  <TabsContent value="non-conformance" className="p-4 border rounded-md mt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium">Non-Conformance Records (NCR)</h3>
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            className="flex items-center text-xs"
                            onClick={() => {
                              // Check if we have valid project code before opening dialog
                              if (!editInspectionOrderDetails?.projectCode || editInspectionOrderDetails.projectCode === 'UNKNOWN') {
                                toast({
                                  title: "Cannot Create Record",
                                  description: "Project code is not available or is UNKNOWN. Please ensure the inspection order has a valid project code assigned.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              setEditingNcrRecord(null);
                              setIsNcrDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add NCR Record
                          </Button>
                        </div>
                      </div>
                      
                      {/* NCR Records Table */}
                      <div className="border rounded-md shadow-sm overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[100px]">Record ID</TableHead>
                              <TableHead className="w-[120px]">Date</TableHead>
                              <TableHead className="w-[100px]">Status</TableHead>
                              <TableHead className="w-[200px]">Description</TableHead>
                              <TableHead className="w-[150px]">Disposition</TableHead>
                              <TableHead className="w-[200px]">Corrective Action</TableHead>
                              <TableHead className="w-[140px]">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.isArray(ncrRecords) && ncrRecords.length > 0 ? (
                              ncrRecords.map((record) => (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.id}</TableCell>
                                  <TableCell>{record.ncrDate || "-"}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      record.ncrStatus === 'closed' ? 'bg-green-100 text-green-800' :
                                      record.ncrStatus === 'open' ? 'bg-yellow-100 text-yellow-800' :
                                      record.ncrStatus === 'pending' ? 'bg-blue-100 text-blue-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {record.ncrStatus.charAt(0).toUpperCase() + record.ncrStatus.slice(1)}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="max-w-[200px] truncate" title={record.ncrDescription}>
                                      {record.ncrDescription || "-"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="capitalize">
                                      {record.ncrDisposition === 'useAsIs' ? 'Use As Is' : 
                                       record.ncrDisposition.replace(/([A-Z])/g, ' $1').trim() || "-"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="max-w-[200px] truncate" title={record.ncrCorrectiveAction}>
                                      {record.ncrCorrectiveAction || "-"}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center space-x-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                        title="View"
                                        onClick={() => {
                                          setDocumentViewerConfig({
                                            inspectionOrderNumber: editInspectionOrderDetails?.inspectionOrderNumber || "N/A",
                                            tabName: "NonConformance",
                                            recordId: record.id
                                          });
                                          setShowDocumentViewer(true);
                                        }}
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-100"
                                        title="Edit"
                                        onClick={async () => {
                                          setEditingNcrRecord(record);
                                          setIsNcrDialogOpen(true);
                                          
                                          // Check for existing files
                                          const hasFiles = await checkExistingNcrFiles(record.id);
                                          setHasExistingNcrFiles(hasFiles);
                                        }}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                                        title="Delete"
                                        onClick={() => {
                                          if (window.confirm(`Are you sure you want to delete NCR record "${record.id}"?\n\nThis will permanently delete:\n• The NCR record\n• All uploaded documents from cloud storage\n\nThis action cannot be undone.`)) {
                                            deleteNcrRecord(record.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                  No NCR records available. Click "Add NCR Record" to create a new record.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Uploaded Files Display Section */}
                      {editInspectionOrderDetails?.inspectionOrderNumber && (
                        <div className="mt-6 border-t pt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h4>
                          <div className="space-y-2">
                            {ncrRecords.length > 0 ? (
                              ncrRecords.map((record) => (
                                <DrawingFilesDisplay
                                  key={record.id}
                                  inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                  recordId={record.id}
                                  recordTitle={`NCR Record - ${record.id}`}
                                  tabName="NonConformance"
                                />
                              ))
                            ) : (
                              <DrawingFilesDisplay
                                inspectionOrderNumber={editInspectionOrderDetails?.inspectionOrderNumber || ''}
                                recordId="ALL"
                                recordTitle="All NCR Files"
                                tabName="NonConformance"
                              />
                            )}
                          </div>
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
                            {[
                              { key: 'Approved Drawing', label: 'Approved Drawings', icon: '📐' },
                              { key: 'DVR', label: 'DVR Documentation', icon: '📋' },
                              { key: 'ITP', label: 'ITP Records', icon: '📊' },
                              { key: 'Material Traceability', label: 'Material Traceability', icon: '🏷️' },
                              { key: 'PMA', label: 'PMA Documents', icon: '📜' },
                              { key: 'Test Procedures', label: 'Test Procedures', icon: '🧪' },
                              { key: 'ShopInspection', label: 'Shop Inspection', icon: '🏭' },
                              { key: 'Welding', label: 'Welding Documentation', icon: '🔥' },
                              { key: 'NDT', label: 'NDT Reports', icon: '🔬' },
                              { key: 'Visual', label: 'Visual Inspection', icon: '👁️' },
                              { key: 'Hydrotest', label: 'Hydrotest Certificates', icon: '💧' },
                              { key: 'NonConformance', label: 'NCR Reports', icon: '⚠️' }
                            ].map((tab) => {
                              const count = documentationCounts[tab.key] || 0;
                              const hasDocuments = count > 0;
                              const validationResult = (window as any).inspectionValidationResults?.[tab.key];
                              const isValidated = validationResult && validationResult.isValid;
                              const hasValidationMismatch = validationResult && !validationResult.isValid;
                              
                              return (
                                <div key={tab.key} className={`flex items-center justify-between space-x-2 p-2 rounded-md ${
                                  hasValidationMismatch ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                                } hover:bg-gray-100`}>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox 
                                      id={tab.key} 
                                      checked={hasDocuments}
                                      readOnly 
                                    />
                                    <Label htmlFor={tab.key} className="flex items-center space-x-2">
                                      <span>{tab.icon}</span>
                                      <span>{tab.label}</span>
                                      {hasValidationMismatch && (
                                        <span className="text-yellow-600 text-xs" title={`Records (${validationResult.records}) ≠ Documents (${validationResult.documents})`}>
                                          ⚠️
                                        </span>
                                      )}
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span className={`text-sm font-medium px-2 py-1 rounded ${
                                      hasDocuments 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {count} {count === 1 ? 'record' : 'records'}
                                    </span>
                                    {validationResult && (
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        isValidated 
                                          ? 'bg-green-100 text-green-700' 
                                          : 'bg-yellow-100 text-yellow-700'
                                      }`} title={isValidated ? 'Records and documents match' : `${validationResult.records} records vs ${validationResult.documents} documents`}>
                                        {isValidated ? '✓' : `${validationResult.documents} docs`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Summary Stats */}
                          <div className="mt-4 p-3 bg-blue-50 rounded-md">
                            <div className="text-sm text-blue-700">
                              <strong>Documentation Summary:</strong> {' '}
                              {Object.values(documentationCounts).reduce((sum, count) => sum + count, 0)} total database records across {' '}
                              {Object.values(documentationCounts).filter(count => count > 0).length} of 12 inspection tabs
                            </div>
                            {(() => {
                              const validationResults = (window as any).inspectionValidationResults;
                              if (!validationResults) return null;
                              
                              const invalidTabs = Object.entries(validationResults).filter(([_, result]: any) => !result.isValid);
                              if (invalidTabs.length === 0) {
                                return (
                                  <div className="text-sm text-green-700 mt-2">
                                    ✓ <strong>Validation Status:</strong> All tabs have matching database records and uploaded documents
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="text-sm text-yellow-700 mt-2">
                                  ⚠️ <strong>Validation Issues:</strong> {invalidTabs.length} tab{invalidTabs.length > 1 ? 's have' : ' has'} mismatched counts:
                                  <div className="ml-4 mt-1">
                                    {invalidTabs.map(([tabName, result]: any) => (
                                      <div key={tabName} className="text-xs">
                                        • {tabName}: {result.records} records ≠ {result.documents} documents
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
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
                                    onClick={() => {
                                      if (editInspectionOrderDetails?.id) {
                                        window.open(`/api/quality/final-dossier/download/${editInspectionOrderDetails.id}`, '_blank');
                                      }
                                    }}
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
                  setSelectedNdtRecord(null);
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
      
      {/* Document Viewer Modal */}
      <Dialog open={showDocumentViewer} onOpenChange={setShowDocumentViewer}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View Inspection Documents</DialogTitle>
            <DialogDescription>
              {documentViewerConfig && (
                <span>
                  Viewing {documentViewerConfig.tabName} documents for record {documentViewerConfig.recordId}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {documentViewerConfig && (
            <InspectionDocumentViewer
              inspectionOrderNumber={documentViewerConfig.inspectionOrderNumber}
              tabName={documentViewerConfig.tabName}
              recordId={documentViewerConfig.recordId}
              className="mt-4"
            />
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocumentViewer(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Document Upload Modal */}
      <Dialog open={showDocumentUpload} onOpenChange={setShowDocumentUpload}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Inspection Document</DialogTitle>
            <DialogDescription>
              {documentUploadConfig && (
                <span>
                  Upload {documentUploadConfig.tabName} document for record {documentUploadConfig.recordId}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {documentUploadConfig && (
            <InspectionDocumentUpload
              inspectionOrderNumber={documentUploadConfig.inspectionOrderNumber}
              tabName={documentUploadConfig.tabName}
              recordId={documentUploadConfig.recordId}
              onSuccess={() => {
                setShowDocumentUpload(false);
                toast({
                  title: "Upload Successful",
                  description: `${documentUploadConfig.tabName} document for ${documentUploadConfig.recordId} has been uploaded.`,
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Shop Inspection Dialog */}
      <Dialog open={isShopInspectionDialogOpen} onOpenChange={(open) => {
        setIsShopInspectionDialogOpen(open);
        if (!open) {
          setEditingShopRecord(null);
          setShopInspectionFiles([]); // Clear selected files when dialog closes
          setHasExistingShopFiles(false);
          setIsCheckingExistingShopFiles(false);
        }
      }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingShopRecord ? 'Edit Shop Inspection Record' : 'Add Shop Inspection Record'}
            </DialogTitle>
            <DialogDescription>
              {editingShopRecord 
                ? `Edit shop inspection record ${editingShopRecord.id} for this inspection order.`
                : 'Add a new shop inspection record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              inspectionType: formData.get('inspectionType') as string,
              inspector: formData.get('inspector') as string,
              date: formData.get('date') as string,
              status: formData.get('status') as string,
              remarks: formData.get('remarks') as string,
            };
            if (editingShopRecord) {
              editShopInspectionRecord(recordData);
            } else {
              addShopInspectionRecord(recordData);
            }
          }} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="inspectionType" className="text-sm font-medium">
                Inspection Type *
              </label>
              <select
                id="inspectionType"
                name="inspectionType"
                required
                defaultValue={editingShopRecord?.inspectionType || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select inspection type</option>
                <option value="Assembly Check">Assembly Check</option>
                <option value="Dimensional Check">Dimensional Check</option>
                <option value="Formed Parts">Formed Parts</option>
                <option value="Nozzle Setup">Nozzle Setup</option>
                <option value="Painting">Painting</option>
                <option value="Seam Setup">Seam Setup</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="inspector" className="text-sm font-medium">
                Inspector *
              </label>
              <input
                type="text"
                id="inspector"
                name="inspector"
                required
                defaultValue={editingShopRecord?.inspector || ""}
                placeholder="Enter inspector name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="date" className="text-sm font-medium">
                Inspection Date *
              </label>
              <input
                type="date"
                id="date"
                name="date"
                required
                defaultValue={editingShopRecord?.date || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium">
                Status *
              </label>
              <select
                id="status"
                name="status"
                required
                defaultValue={editingShopRecord?.status || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select status</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="remarks" className="text-sm font-medium">
                Remarks
              </label>
              <textarea
                id="remarks"
                name="remarks"
                rows={3}
                defaultValue={editingShopRecord?.remarks || ""}
                placeholder="Enter any remarks or observations"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* File Upload Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingShopRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
              </label>
              
              {/* File Status Indicator for Edit Mode */}
              {editingShopRecord && (
                <div className="mb-2">
                  {isCheckingExistingShopFiles ? (
                    <div className="flex items-center text-blue-600">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span className="text-sm">Checking for existing files...</span>
                    </div>
                  ) : hasExistingShopFiles ? (
                    <div className="text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                      ✓ Existing files found on GCS. {editingShopRecord ? 'New files will replace existing ones.' : 'You can add additional files.'}
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                      ⚠ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              
              {/* Status message for edit mode */}
              {editingShopRecord && (
                <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded border border-orange-200 mb-2">
                  ⚠ Warning: New files will replace existing ones
                </div>
              )}
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setShopInspectionFiles(files);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Select PDF, DOC, DOCX, JPG, JPEG, or PNG files (Max 10MB each)
                </p>
                {shopInspectionFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">Selected files:</p>
                    <ul className="text-sm text-gray-600">
                      {shopInspectionFiles.map((file, index) => (
                        <li key={index} className="flex items-center">
                          <span className="truncate">{file.name}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsShopInspectionDialogOpen(false);
                  setEditingShopRecord(null);
                  setShopInspectionFiles([]); // Clear selected files
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingShopFiles || (editingShopRecord && shopInspectionFiles.length === 0)}
              >
                {isUploadingShopFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingShopRecord ? 'Updating & Replacing...' : 'Adding & Uploading...'}
                  </>
                ) : shopInspectionFiles.length === 0 && !isUploadingShopFiles ? (
                  'Select Files to Continue'
                ) : (
                  editingShopRecord ? 'Update & Replace Files' : 'Add Record & Upload Files'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Welding Dialog */}
      <Dialog open={isWeldingDialogOpen} onOpenChange={(open) => {
        setIsWeldingDialogOpen(open);
        if (!open) {
          setEditingWeldRecord(null);
          setSelectedWpqrForDialog("");
          setWeldingFiles([]); // Clear selected files when dialog closes
          setHasExistingWeldFiles(false);
          setIsCheckingExistingWeldFiles(false);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWeldRecord ? 'Edit Weld Record' : 'Add Weld Record'}
            </DialogTitle>
            <DialogDescription>
              {editingWeldRecord 
                ? `Edit weld record ${editingWeldRecord.id} for this inspection order.`
                : 'Add a new weld record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const newWeldNumber = welds.length + 1;
            const recordData = {
              id: editingWeldRecord ? editingWeldRecord.id : `W-${newWeldNumber}`,
              weldType: formData.get('weldType') as string,
              weldProcess: formData.get('weldProcess') as string,
              wpqrDocument: formData.get('wpqrDocument') as string,
              welderId: formData.get('welderId') as string,
              weldStatus: formData.get('weldStatus') as string,
            };
            if (editingWeldRecord) {
              editWeldRecord(recordData);
            } else {
              addWeldRecord(recordData);
            }
          }}>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="weldType" className="text-sm font-medium">
                    Weld Type *
                  </label>
                  <select
                    id="weldType"
                    name="weldType"
                    required
                    defaultValue={editingWeldRecord?.weldType || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select weld type</option>
                    <option value="butt_circ">Butt Weld Circ seam</option>
                    <option value="butt_long">Butt Weld Long seam</option>
                    <option value="fillet">Fillet Weld</option>
                    <option value="lap">Lap Weld</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="wpqrDocument" className="text-sm font-medium">
                    WPQR Document
                  </label>
                  <select
                    id="wpqrDocument"
                    name="wpqrDocument"
                    value={selectedWpqrForDialog || editingWeldRecord?.wpqrDocument || ""}
                    onChange={(e) => setSelectedWpqrForDialog(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select WPQR document</option>
                    {isLoadingWpqr ? (
                      <option value="" disabled>Loading WPQR documents...</option>
                    ) : wpqrDocuments.length > 0 ? (
                      wpqrDocuments.map((doc: any) => (
                        <option key={doc.id} value={doc.documentNumber || doc.id.toString()}>
                          {doc.documentNumber || `WPQR-${doc.id}`}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No WPQR documents available</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="weldProcess" className="text-sm font-medium">
                    Weld Process *
                  </label>
                  <select
                    id="weldProcess"
                    name="weldProcess"
                    required
                    defaultValue={editingWeldRecord?.weldProcess || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select weld process</option>
                    {getFilteredWeldProcessOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="welderId" className="text-sm font-medium">
                    Welder ID
                  </label>
                  <select
                    id="welderId"
                    name="welderId"
                    defaultValue={editingWeldRecord?.welderId || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select welder</option>
                    {isLoadingWelders || isLoadingWpqrWelders ? (
                      <option value="" disabled>Loading welders...</option>
                    ) : (() => {
                      const filteredWelders = getFilteredWelders();
                      
                      if (filteredWelders.length === 0) {
                        return selectedWpqrForDialog ? (
                          <option value="" disabled>No welders associated with selected WPQR</option>
                        ) : (
                          <option value="" disabled>No active welders available</option>
                        );
                      }
                      
                      return filteredWelders.map((welder: any) => (
                        <option key={welder.id} value={welder.welderId}>
                          {welder.welderId}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="weldStatus" className="text-sm font-medium">
                  Weld Status *
                </label>
                <select
                  id="weldStatus"
                  name="weldStatus"
                  required
                  defaultValue={editingWeldRecord?.weldStatus || "Pass"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Pass">Pass</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>

              {/* File Upload Section */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {editingWeldRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
                </label>
                
                {/* File existence status for Edit mode */}
                {editingWeldRecord && (
                  <div className="mb-3">
                    {isCheckingExistingWeldFiles ? (
                      <div className="flex items-center space-x-2 text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Checking for existing files...</span>
                      </div>
                    ) : hasExistingWeldFiles ? (
                      <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded border">
                        ⚠️ New files will replace existing ones
                      </div>
                    ) : (
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded border">
                        ❌ No existing files found. Please add files to proceed.
                      </div>
                    )}
                  </div>
                )}
                
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setWeldingFiles(files);
                    }}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Select PDF, DOC, DOCX, JPG, JPEG, or PNG files (max 10MB each)
                  </p>
                  {weldingFiles.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">Selected files:</p>
                      <ul className="text-sm text-gray-600">
                        {weldingFiles.map((file, index) => (
                          <li key={index} className="truncate">
                            • {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsWeldingDialogOpen(false);
                  setEditingWeldRecord(null);
                  setWeldingFiles([]); // Clear selected files
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingWeldFiles || (editingWeldRecord && weldingFiles.length === 0)}
              >
                {isUploadingWeldFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingWeldRecord ? 'Updating & Replacing...' : 'Adding & Uploading...'}
                  </>
                ) : weldingFiles.length === 0 && !isUploadingWeldFiles ? (
                  'Select Files to Continue'
                ) : (
                  editingWeldRecord ? 'Update & Replace Files' : 'Add Record & Upload Files'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* NDT Dialog */}
      <Dialog open={isNdtDialogOpen} onOpenChange={(open) => {
        setIsNdtDialogOpen(open);
        if (!open) {
          setEditingNdtRecord(null);
          setNdtFiles([]); // Clear selected files when dialog closes
          setHasExistingNdtFiles(false); // Reset file existence state
          setIsCheckingExistingNdtFiles(false); // Reset checking state
        }
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNdtRecord ? 'Edit NDT Record' : 'Add NDT Record'}
            </DialogTitle>
            <DialogDescription>
              {editingNdtRecord 
                ? `Edit NDT record ${editingNdtRecord.id} for this inspection order.`
                : 'Add a new NDT record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              id: editingNdtRecord ? editingNdtRecord.id : `NDT-${Date.now()}`,
              ndtMethod: formData.get('ndtMethod') as string,
              ndtStandard: formData.get('ndtStandard') as string,
              ndtExtent: formData.get('ndtExtent') as string,
              ndtTechnician: formData.get('ndtTechnician') as string,
              ndtDate: formData.get('ndtDate') as string,
              ndtResults: formData.get('ndtResults') as string,
            };
            if (editingNdtRecord) {
              editNdtRecord(recordData);
            } else {
              await addNdtRecord(recordData);
            }
          }}>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="ndtMethod" className="text-sm font-medium">
                    NDT Method *
                  </label>
                  <select
                    id="ndtMethod"
                    name="ndtMethod"
                    required
                    defaultValue={editingNdtRecord?.ndtMethod || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select method</option>
                    <option value="rt">RT (Radiographic Testing)</option>
                    <option value="ut">UT (Ultrasonic Testing)</option>
                    <option value="mt">MT (Magnetic Particle Testing)</option>
                    <option value="pt">PT (Penetrant Testing)</option>
                    <option value="et">ET (Eddy Current Testing)</option>
                    <option value="vt">VT (Visual Testing)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="ndtStandard" className="text-sm font-medium">
                    Standard *
                  </label>
                  <select
                    id="ndtStandard"
                    name="ndtStandard"
                    required
                    defaultValue={editingNdtRecord?.ndtStandard || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select standard</option>
                    <option value="ASME">ASME</option>
                    <option value="API">API</option>
                    <option value="EN ISO">EN ISO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="ndtExtent" className="text-sm font-medium">
                    Extent (%) *
                  </label>
                  <select
                    id="ndtExtent"
                    name="ndtExtent"
                    required
                    defaultValue={editingNdtRecord?.ndtExtent || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select extent</option>
                    <option value="5">5%</option>
                    <option value="10">10%</option>
                    <option value="100">100%</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="ndtTechnician" className="text-sm font-medium">
                    Technician
                  </label>
                  <input
                    type="text"
                    id="ndtTechnician"
                    name="ndtTechnician"
                    defaultValue={editingNdtRecord?.ndtTechnician || ""}
                    placeholder="Enter technician name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="ndtDate" className="text-sm font-medium">
                    Date
                  </label>
                  <input
                    type="date"
                    id="ndtDate"
                    name="ndtDate"
                    defaultValue={editingNdtRecord?.ndtDate || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="ndtResults" className="text-sm font-medium">
                    Results *
                  </label>
                  <select
                    id="ndtResults"
                    name="ndtResults"
                    required
                    defaultValue={editingNdtRecord?.ndtResults || "Pass"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              </div>

              {/* File Upload Section */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {editingNdtRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
                </label>
                
                {/* File existence status for edit mode */}
                {editingNdtRecord && (
                  <div className="mb-3">
                    {isCheckingExistingNdtFiles ? (
                      <div className="flex items-center space-x-2 text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Checking for existing files...</span>
                      </div>
                    ) : hasExistingNdtFiles ? (
                      <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                        ⚠️ New files will replace existing ones
                      </div>
                    ) : (
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                        ❌ No existing files found. Please add files to proceed.
                      </div>
                    )}
                  </div>
                )}
                
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setNdtFiles(files);
                    }}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Select PDF, DOC, DOCX, JPG, JPEG, or PNG files (max 10MB each)
                  </p>
                  {ndtFiles.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">Selected files:</p>
                      <ul className="text-sm text-gray-600">
                        {ndtFiles.map((file, index) => (
                          <li key={index} className="truncate">
                            • {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsNdtDialogOpen(false);
                  setEditingNdtRecord(null);
                  setNdtFiles([]); // Clear selected files
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingNdtFiles || (editingNdtRecord && ndtFiles.length === 0)}
              >
                {isUploadingNdtFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingNdtRecord ? 'Updating & Replacing...' : 'Adding & Uploading...'}
                  </>
                ) : ndtFiles.length === 0 && !isUploadingNdtFiles ? (
                  'Select Files to Continue'
                ) : (
                  editingNdtRecord ? 'Update & Replace Files' : 'Add Record & Upload Files'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visual Inspection Record Dialog */}
      <Dialog open={isVisualDialogOpen} onOpenChange={(open) => {
        setIsVisualDialogOpen(open);
        if (!open) {
          setEditingVisualRecord(null);
          setVisualInspectionFiles([]); // Clear selected files when dialog closes
        }
      }}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVisualRecord ? 'Edit Visual Inspection Record' : 'Add Visual Inspection Record'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target as HTMLFormElement);
            
            const recordData = {
              id: editingVisualRecord?.id || `VI-${visualRecords.length + 1}`,
              standard: formData.get('visualStandard') as string,
              dimensionalChecks: formData.get('visualDimensionalChecks') as string,
              surfaceCondition: formData.get('visualSurfaceCondition') as string,
              inspector: formData.get('visualInspector') as string,
              inspectionDate: formData.get('visualDate') as string,
              observations: formData.get('visualObservations') as string,
            };

            try {
              if (editingVisualRecord) {
                editVisualRecord(recordData);
              } else {
                // Add record to state first
                addVisualRecord(recordData);
                
                // Handle file uploads for new records
                if (visualInspectionFiles.length > 0 && selectedOrder) {
                  setIsUploadingVisualFiles(true);
                  
                  for (const file of visualInspectionFiles) {
                    try {
                      const uploadFormData = new FormData();
                      uploadFormData.append('file', file);
                      uploadFormData.append('inspectionOrderNumber', selectedOrder.inspectionOrderNumber);
                      uploadFormData.append('recordId', recordData.id);
                      uploadFormData.append('tabName', 'Visual');
                      uploadFormData.append('documentType', 'Visual Inspection Report');
                      
                      const response = await fetch('/api/quality/inspection-documents/upload', {
                        method: 'POST',
                        body: uploadFormData,
                        credentials: 'include'
                      });
                      
                      if (!response.ok) {
                        throw new Error(`Failed to upload ${file.name}`);
                      }
                    } catch (uploadError) {
                      console.error(`Error uploading ${file.name}:`, uploadError);
                      toast({
                        title: "Upload Error",
                        description: `Failed to upload ${file.name}`,
                        variant: "destructive"
                      });
                    }
                  }
                  
                  setIsUploadingVisualFiles(false);
                  setVisualInspectionFiles([]); // Clear files after upload
                  
                  // Refresh the files display
                  documentsQuery.refetch();
                }
              }
              
              setIsVisualDialogOpen(false);
              setEditingVisualRecord(null);
              toast({
                title: "Success",
                description: editingVisualRecord ? "Visual inspection record updated successfully" : "Visual inspection record added successfully"
              });
            } catch (error) {
              console.error('Error saving visual inspection record:', error);
              toast({
                title: "Error",
                description: "Failed to save visual inspection record",
                variant: "destructive"
              });
            }
          }}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="visualStandard" className="text-sm font-medium">
                    Standard *
                  </label>
                  <select
                    id="visualStandard"
                    name="visualStandard"
                    required
                    defaultValue={editingVisualRecord?.standard || "ASME"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ASME">ASME</option>
                    <option value="API">API</option>
                    <option value="EN ISO">EN ISO</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="visualDimensionalChecks" className="text-sm font-medium">
                    Dimensional Checks *
                  </label>
                  <select
                    id="visualDimensionalChecks"
                    name="visualDimensionalChecks"
                    required
                    defaultValue={editingVisualRecord?.dimensionalChecks || "acceptable"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="acceptable">Acceptable</option>
                    <option value="notAcceptable">Not Acceptable</option>
                    <option value="conditionallyAcceptable">Conditionally Acceptable</option>
                    <option value="notApplicable">Not Applicable</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="visualSurfaceCondition" className="text-sm font-medium">
                    Surface Condition *
                  </label>
                  <select
                    id="visualSurfaceCondition"
                    name="visualSurfaceCondition"
                    required
                    defaultValue={editingVisualRecord?.surfaceCondition || "acceptable"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="acceptable">Acceptable</option>
                    <option value="notAcceptable">Not Acceptable</option>
                    <option value="conditionallyAcceptable">Conditionally Acceptable</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="visualInspector" className="text-sm font-medium">
                    Inspector *
                  </label>
                  <input
                    type="text"
                    id="visualInspector"
                    name="visualInspector"
                    required
                    defaultValue={editingVisualRecord?.inspector || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter inspector name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="visualDate" className="text-sm font-medium">
                    Date
                  </label>
                  <input
                    type="date"
                    id="visualDate"
                    name="visualDate"
                    defaultValue={editingVisualRecord?.inspectionDate || ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="visualObservations" className="text-sm font-medium">
                    Observations *
                  </label>
                  <select
                    id="visualObservations"
                    name="visualObservations"
                    required
                    defaultValue={editingVisualRecord?.observations || "Pass"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingVisualRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
              </label>
              
              {/* File existence status for edit mode */}
              {editingVisualRecord && (
                <div className="mb-3">
                  {isCheckingExistingVisualFiles ? (
                    <div className="flex items-center space-x-2 text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Checking for existing files...</span>
                    </div>
                  ) : hasExistingVisualFiles ? (
                    <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                      ⚠️ New files will replace existing ones
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      ❌ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setVisualInspectionFiles(files);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Select PDF, DOC, DOCX, JPG, JPEG, or PNG files (max 10MB each)
                </p>
                {visualInspectionFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">Selected files:</p>
                    <ul className="text-sm text-gray-600">
                      {visualInspectionFiles.map((file, index) => (
                        <li key={index} className="flex items-center">
                          <span className="truncate">{file.name}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsVisualDialogOpen(false);
                  setEditingVisualRecord(null);
                  setVisualInspectionFiles([]);
                  setHasExistingVisualFiles(false);
                  setIsCheckingExistingVisualFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingVisualFiles || (visualInspectionFiles.length === 0)}
              >
                {isUploadingVisualFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingVisualRecord ? 'Updating & Replacing...' : 'Adding & Uploading...'}
                  </>
                ) : visualInspectionFiles.length === 0 && !isUploadingVisualFiles ? (
                  'Select Files to Continue'
                ) : (
                  editingVisualRecord ? 'Update & Replace Files' : 'Add Record & Upload Files'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* NCR Dialog */}
      <Dialog open={isNcrDialogOpen} onOpenChange={(open) => {
        setIsNcrDialogOpen(open);
        if (!open) {
          setEditingNcrRecord(null);
          setNcrFiles([]);
          setHasExistingNcrFiles(false);
          setIsCheckingExistingNcrFiles(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNcrRecord ? 'Edit NCR Record' : 'Add NCR Record'}
            </DialogTitle>
            <DialogDescription>
              {editingNcrRecord 
                ? `Edit non-conformance record ${editingNcrRecord.id} for this inspection order.`
                : 'Add a new non-conformance record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              id: editingNcrRecord ? (formData.get('id') as string) : generateNcrId(),
              ncrDate: formData.get('ncrDate') as string,
              ncrStatus: formData.get('ncrStatus') as string,
              ncrDescription: formData.get('ncrDescription') as string,
              ncrDisposition: formData.get('ncrDisposition') as string,
              ncrCorrectiveAction: formData.get('ncrCorrectiveAction') as string,
            };
            if (editingNcrRecord) {
              updateNcrRecord(recordData);
            } else {
              await addNcrRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="id" className="text-sm font-medium">NCR ID *</label>
                <input
                  type="text"
                  id="id"
                  name="id"
                  required
                  defaultValue={editingNcrRecord?.id || "Auto-generated"}
                  readOnly={!editingNcrRecord}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !editingNcrRecord ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  placeholder="NCR-001"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ncrDate" className="text-sm font-medium">Date *</label>
                <input
                  type="date"
                  id="ncrDate"
                  name="ncrDate"
                  required
                  defaultValue={editingNcrRecord?.ncrDate || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ncrStatus" className="text-sm font-medium">Status *</label>
                <select
                  id="ncrStatus"
                  name="ncrStatus"
                  required
                  defaultValue={editingNcrRecord?.ncrStatus || "open"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="pending">Pending</option>
                  <option value="void">Void</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="ncrDisposition" className="text-sm font-medium">Disposition *</label>
                <select
                  id="ncrDisposition"
                  name="ncrDisposition"
                  required
                  defaultValue={editingNcrRecord?.ncrDisposition || "rework"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="rework">Rework</option>
                  <option value="repair">Repair</option>
                  <option value="useAsIs">Use As Is</option>
                  <option value="scrap">Scrap / Reject</option>
                  <option value="return">Return to Vendor</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="ncrDescription" className="text-sm font-medium">Description *</label>
              <textarea
                id="ncrDescription"
                name="ncrDescription"
                required
                rows={3}
                defaultValue={editingNcrRecord?.ncrDescription || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe the non-conformance..."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="ncrCorrectiveAction" className="text-sm font-medium">Corrective Action *</label>
              <textarea
                id="ncrCorrectiveAction"
                name="ncrCorrectiveAction"
                required
                rows={3}
                defaultValue={editingNcrRecord?.ncrCorrectiveAction || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe the corrective action taken..."
              />
            </div>

            {/* File Upload Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingNcrRecord ? 'Upload Replacement Files *' : 'Upload NCR Documents *'}
              </label>
              
              {/* File existence status for editing records */}
              {editingNcrRecord && (
                <div className="mb-2">
                  {isCheckingExistingNcrFiles ? (
                    <div className="flex items-center gap-2 text-blue-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm">Checking for existing files...</span>
                    </div>
                  ) : hasExistingNcrFiles ? (
                    <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                      ⚠️ New files will replace existing ones
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      ❌ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setNcrFiles(files);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Select PDF, DOC, DOCX, JPG, JPEG, or PNG files (max 10MB each)
                </p>
                {ncrFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">Selected files:</p>
                    <ul className="text-sm text-gray-600">
                      {ncrFiles.map((file, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <span>• {file.name}</span>
                          <span className="text-gray-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsNcrDialogOpen(false);
                  setEditingNcrRecord(null);
                  setNcrFiles([]);
                  setHasExistingNcrFiles(false);
                  setIsCheckingExistingNcrFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingNcrFiles || ncrFiles.length === 0}
              >
                {isUploadingNcrFiles 
                  ? (editingNcrRecord ? 'Updating & Replacing...' : 'Uploading...')
                  : ncrFiles.length === 0 
                    ? 'Select Files to Continue'
                    : (editingNcrRecord ? 'Update & Replace Files' : 'Add Record')
                }
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hydrotest Dialog */}
      <Dialog open={isHydrotestDialogOpen} onOpenChange={(open) => {
        setIsHydrotestDialogOpen(open);
        if (!open) {
          setEditingHydrotestRecord(null);
          setHydrotestFiles([]); // Clear selected files when dialog closes
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingHydrotestRecord ? 'Edit Hydrotest Record' : 'Add Hydrotest Record'}
            </DialogTitle>
            <DialogDescription>
              {editingHydrotestRecord 
                ? 'Edit hydrotest record for this inspection order.'
                : 'Add a new hydrotest record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              pressure: formData.get('pressure') as string,
              duration: formData.get('duration') as string,
              medium: formData.get('medium') as string,
              pressureGauge: formData.get('pressureGauge') as string,
              operator: formData.get('operator') as string,
              testDate: formData.get('testDate') as string,
              result: formData.get('result') as string,
              notes: formData.get('notes') as string,
            };
            
            if (editingHydrotestRecord) {
              editHydrotestRecord({
                id: editingHydrotestRecord.id,
                ...recordData
              });
            } else {
              addHydrotestRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="pressure" className="text-sm font-medium">Pressure (bar) *</label>
                <input
                  type="number"
                  id="pressure"
                  name="pressure"
                  required
                  step="0.1"
                  defaultValue={editingHydrotestRecord?.pressure || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter test pressure"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="duration" className="text-sm font-medium">Duration (min) *</label>
                <input
                  type="number"
                  id="duration"
                  name="duration"
                  required
                  defaultValue={editingHydrotestRecord?.duration || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter test duration"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="medium" className="text-sm font-medium">Medium *</label>
                <select
                  id="medium"
                  name="medium"
                  required
                  defaultValue={editingHydrotestRecord?.medium || "water"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="water">Water</option>
                  <option value="nitrogen">Nitrogen</option>
                  <option value="air">Air</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="pressureGauge" className="text-sm font-medium">Pressure Gauge *</label>
                <select
                  id="pressureGauge"
                  name="pressureGauge"
                  required
                  defaultValue={editingHydrotestRecord?.pressureGauge || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select pressure gauge...</option>
                  {calibrationInstruments && calibrationInstruments.length > 0 ? (
                    calibrationInstruments.map((instrument) => (
                      <option key={instrument.id} value={instrument.instrument_id}>
                        [{instrument.instrument_id}] - [{instrument.instrument_name}]
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>Loading pressure gauges...</option>
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="operator" className="text-sm font-medium">Inspector/Operator *</label>
                <input
                  type="text"
                  id="operator"
                  name="operator"
                  required
                  defaultValue={editingHydrotestRecord?.operator || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter inspector/operator name"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="testDate" className="text-sm font-medium">Test Date *</label>
                <input
                  type="date"
                  id="testDate"
                  name="testDate"
                  required
                  defaultValue={editingHydrotestRecord?.testDate || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="result" className="text-sm font-medium">Result *</label>
                <select
                  id="result"
                  name="result"
                  required
                  defaultValue={editingHydrotestRecord?.result || "Pass"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Pass">Pass</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">Notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={editingHydrotestRecord?.notes || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any additional notes or observations..."
              />
            </div>

            {/* File Upload Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingHydrotestRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
              </label>
              
              {/* Status indicator for Edit mode */}
              {editingHydrotestRecord && (
                <div className="mb-2">
                  {isCheckingExistingHydrotestFiles ? (
                    <div className="flex items-center space-x-2 text-blue-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm">Checking for existing files...</span>
                    </div>
                  ) : hasExistingHydrotestFiles ? (
                    <div className="text-orange-600 text-sm">
                      ⚠️ New files will replace existing ones
                    </div>
                  ) : (
                    <div className="text-red-600 text-sm">
                      ❌ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setHydrotestFiles(files);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Select PDF, DOC, DOCX, JPG, JPEG, or PNG files (max 10MB each)
                </p>
                {hydrotestFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">Selected files:</p>
                    <ul className="text-sm text-gray-600">
                      {hydrotestFiles.map((file, index) => (
                        <li key={index} className="flex items-center">
                          <span className="truncate">{file.name}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsHydrotestDialogOpen(false);
                  setEditingHydrotestRecord(null);
                  setHydrotestFiles([]);
                  setHasExistingHydrotestFiles(false);
                  setIsCheckingExistingHydrotestFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={
                  isUploadingHydrotestFiles || 
                  hydrotestFiles.length === 0 ||
                  (editingHydrotestRecord && isCheckingExistingHydrotestFiles)
                }
              >
                {isUploadingHydrotestFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingHydrotestRecord ? 'Updating & Replacing...' : 'Adding & Uploading...'}
                  </>
                ) : hydrotestFiles.length === 0 ? (
                  'Select Files to Continue'
                ) : editingHydrotestRecord ? (
                  'Update & Replace Files'
                ) : (
                  'Add Record'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approved Drawing Dialog */}
      <Dialog open={isApprovedDrawingDialogOpen} onOpenChange={(open) => {
        setIsApprovedDrawingDialogOpen(open);
        if (!open) {
          setEditingApprovedDrawingRecord(null);
          setApprovedDrawingFiles([]); // Clear selected files
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingApprovedDrawingRecord ? 'Edit Approved Drawing Record' : 'Add Approved Drawing Record'}
            </DialogTitle>
            <DialogDescription>
              {editingApprovedDrawingRecord 
                ? `Edit approved drawing record ${editingApprovedDrawingRecord.id} for this inspection order.`
                : 'Add a new approved drawing record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              drawingTitle: formData.get('drawingTitle') as string,
              drawingNumber: formData.get('drawingNumber') as string,
              revision: formData.get('revision') as string,
              approvedBy: formData.get('approvedBy') as string,
              approvalDate: formData.get('approvalDate') as string,
              status: formData.get('status') as string,
              remarks: formData.get('remarks') as string,
            };
            if (editingApprovedDrawingRecord) {
              editApprovedDrawingRecord(recordData);
            } else {
              addApprovedDrawingRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="drawingTitle" className="text-sm font-medium">Drawing Title *</label>
                <input
                  type="text"
                  id="drawingTitle"
                  name="drawingTitle"
                  required
                  defaultValue={editingApprovedDrawingRecord?.drawingTitle || 
                    (editInspectionOrderDetails?.description || 
                     (editInspectionOrderDetails?.items && editInspectionOrderDetails.items.length > 0 ? 
                      editInspectionOrderDetails.items[0].description : ""))}
                  readOnly={!editingApprovedDrawingRecord && (editInspectionOrderDetails?.description || 
                    (editInspectionOrderDetails?.items && editInspectionOrderDetails.items.length > 0 && 
                     editInspectionOrderDetails.items[0].description))}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !editingApprovedDrawingRecord && (editInspectionOrderDetails?.description || 
                    (editInspectionOrderDetails?.items && editInspectionOrderDetails.items.length > 0 && 
                     editInspectionOrderDetails.items[0].description)) ? 'bg-gray-50 text-gray-700' : ''
                  }`}
                  placeholder="Enter drawing title"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="drawingNumber" className="text-sm font-medium">Drawing Number *</label>
                <input
                  type="text"
                  id="drawingNumber"
                  name="drawingNumber"
                  required
                  defaultValue={editingApprovedDrawingRecord?.drawingNumber || 
                    (editInspectionOrderDetails?.drawingNo || 
                     editInspectionOrderDetails?.drawingNumber || "")}
                  readOnly={!editingApprovedDrawingRecord && (editInspectionOrderDetails?.drawingNo || 
                    editInspectionOrderDetails?.drawingNumber)}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !editingApprovedDrawingRecord && (editInspectionOrderDetails?.drawingNo || 
                    editInspectionOrderDetails?.drawingNumber) ? 'bg-gray-50 text-gray-700' : ''
                  }`}
                  placeholder="Enter drawing number"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="revision" className="text-sm font-medium">Revision *</label>
                <input
                  type="text"
                  id="revision"
                  name="revision"
                  required
                  defaultValue={editingApprovedDrawingRecord?.revision || "R0"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="R0"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="approvedBy" className="text-sm font-medium">Approved By *</label>
                <input
                  type="text"
                  id="approvedBy"
                  name="approvedBy"
                  required
                  defaultValue={editingApprovedDrawingRecord?.approvedBy || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter approver name"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="approvalDate" className="text-sm font-medium">Approval Date *</label>
                <input
                  type="date"
                  id="approvalDate"
                  name="approvalDate"
                  required
                  defaultValue={editingApprovedDrawingRecord?.approvalDate || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">Status *</label>
                <select
                  id="status"
                  name="status"
                  required
                  defaultValue={editingApprovedDrawingRecord?.status || "approved"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="approved">Approved</option>
                  <option value="conditional">Conditionally Approved</option>
                  <option value="review">Under Review</option>
                  <option value="superseded">Superseded</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="remarks" className="text-sm font-medium">Remarks</label>
              <textarea
                id="remarks"
                name="remarks"
                rows={3}
                defaultValue={editingApprovedDrawingRecord?.remarks || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any additional remarks..."
              />
            </div>

            {/* Uploaded Files Information Card */}
            <ApprovedDrawingFileInfoSection 
              inspectionOrderNumber={editingApprovedDrawingRecord ? editInspectionOrderDetails?.inspectionOrderNumber || null : null}
              recordId={editingApprovedDrawingRecord?.id || null}
              showTitle={true}
              className="mt-4"
            />

            {/* File Upload Section - Available for both new and edit */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingApprovedDrawingRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
              </label>
              {editingApprovedDrawingRecord && (
                <div className="text-sm">
                  {isCheckingExistingFiles ? (
                    <div className="flex items-center text-blue-600">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking for existing files...
                    </div>
                  ) : hasExistingApprovedDrawingFiles ? (
                    <div className="text-orange-600">
                      ⚠️ Existing files found on GCS. New files will replace existing ones.
                    </div>
                  ) : (
                    <div className="text-red-600">
                      ⚠️ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setApprovedDrawingFiles(files);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Select PDF, DOC, DOCX, JPG, JPEG, or PNG files
                </p>
                {approvedDrawingFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-green-600">
                      {approvedDrawingFiles.length} file(s) selected
                    </p>
                    <ul className="text-xs text-gray-600 mt-1">
                      {approvedDrawingFiles.map((file, index) => (
                        <li key={index} className="truncate">
                          {file.name} ({Math.round(file.size / 1024)} KB)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsApprovedDrawingDialogOpen(false);
                  setEditingApprovedDrawingRecord(null);
                  setApprovedDrawingFiles([]);
                  setHasExistingApprovedDrawingFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingApprovedDrawingFiles || isCheckingExistingFiles || approvedDrawingFiles.length === 0}
              >
                {isUploadingApprovedDrawingFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingApprovedDrawingRecord ? 'Updating & Replacing...' : 'Creating & Uploading...'}
                  </>
                ) : isCheckingExistingFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking existing files...
                  </>
                ) : approvedDrawingFiles.length === 0 ? (
                  editingApprovedDrawingRecord ? 'Select Files to Continue' : 'Select Files to Continue'
                ) : (
                  editingApprovedDrawingRecord ? 'Update & Replace Files' : 'Add & Upload Files'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* PMA Dialog */}
      <Dialog open={isPmaDialogOpen} onOpenChange={(open) => {
        setIsPmaDialogOpen(open);
        if (!open) {
          setEditingPmaRecord(null);
          setSelectedPmaDocument("");
          setSelectedPmaStatus("");
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPmaRecord ? 'Edit PMA Record' : 'Add PMA Record'}
            </DialogTitle>
            <DialogDescription>
              {editingPmaRecord 
                ? `Edit PMA record ${editingPmaRecord.id} for this inspection order.`
                : 'Add a new PMA (Particular Material Appraisal) record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              pmaNumber: formData.get('pmaNumber') as string,
              materialSpecification: formData.get('materialSpecification') as string,
              materialGrade: formData.get('materialGrade') as string,
              certifiedBy: formData.get('certifiedBy') as string,
              issueDate: formData.get('issueDate') as string,
              expiryDate: formData.get('expiryDate') as string,
              status: formData.get('status') as string,
              remarks: formData.get('remarks') as string,
            };
            if (editingPmaRecord) {
              editPmaRecord(recordData);
            } else {
              addPmaRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="pmaNumber" className="text-sm font-medium">PMA Number *</label>
                <select
                  id="pmaNumber"
                  name="pmaNumber"
                  required
                  value={selectedPmaDocument || editingPmaRecord?.pmaNumber || ""}
                  onChange={(e) => {
                    const pmaNumber = e.target.value;
                    setSelectedPmaDocument(pmaNumber);
                    
                    // Auto-populate other fields when a PMA document is selected
                    if (pmaNumber && activePmaDocuments) {
                      // For edit mode, only auto-populate if user changed to a different PMA Number
                      const shouldAutoPopulate = !editingPmaRecord || (editingPmaRecord && pmaNumber !== editingPmaRecord.pmaNumber);
                      
                      if (shouldAutoPopulate) {
                        const selectedPma = activePmaDocuments.find((pma: any) => pma.pmaNumber === pmaNumber);
                        console.log("Auto-population: Selected PMA document:", selectedPma);
                      
                      if (selectedPma) {
                        // Use setTimeout to ensure DOM elements are ready
                        setTimeout(() => {
                          // Update form fields by setting their values
                          const specField = document.getElementById('materialSpecification') as HTMLInputElement;
                          const gradeField = document.getElementById('materialGrade') as HTMLInputElement;
                          const certifiedByField = document.getElementById('certifiedBy') as HTMLInputElement;
                          const issueDateField = document.getElementById('issueDate') as HTMLInputElement;
                          const expiryDateField = document.getElementById('expiryDate') as HTMLInputElement;
                          const statusField = document.getElementById('status') as HTMLSelectElement;
                          
                          console.log("Auto-population: Found fields:", {
                            specField: !!specField,
                            gradeField: !!gradeField,
                            certifiedByField: !!certifiedByField,
                            issueDateField: !!issueDateField,
                            expiryDateField: !!expiryDateField,
                            statusField: !!statusField
                          });
                          
                          if (specField) {
                            specField.value = selectedPma.specification || '';
                            specField.dispatchEvent(new Event('input', { bubbles: true }));
                          }
                          if (gradeField) {
                            gradeField.value = selectedPma.grade || '';
                            gradeField.dispatchEvent(new Event('input', { bubbles: true }));
                          }
                          if (certifiedByField) {
                            certifiedByField.value = selectedPma.certifiedBy || '';
                            certifiedByField.dispatchEvent(new Event('input', { bubbles: true }));
                          }
                          if (issueDateField) {
                            // Format date properly for input field (YYYY-MM-DD)
                            const formattedDate = selectedPma.issueDate ? 
                              new Date(selectedPma.issueDate).toISOString().split('T')[0] : '';
                            issueDateField.value = formattedDate;
                            issueDateField.dispatchEvent(new Event('input', { bubbles: true }));
                          }
                          if (expiryDateField) {
                            // Format date properly for input field (YYYY-MM-DD)
                            const formattedDate = selectedPma.expiryDate ? 
                              new Date(selectedPma.expiryDate).toISOString().split('T')[0] : '';
                            expiryDateField.value = formattedDate;
                            expiryDateField.dispatchEvent(new Event('input', { bubbles: true }));
                          }
                          
                          // For the status field, we need to map the PMA status to the form options
                          // PMA status might be "Active" but form expects lowercase "active"
                          const statusValue = selectedPma.status ? selectedPma.status.toLowerCase() : 'active';
                          setSelectedPmaStatus(statusValue);
                          if (statusField) {
                            statusField.value = statusValue;
                            // Trigger change event to ensure any listeners are notified
                            statusField.dispatchEvent(new Event('change', { bubbles: true }));
                          }
                          
                          console.log("Auto-population: Fields populated with values:", {
                            specification: selectedPma.specification,
                            grade: selectedPma.grade,
                            certifiedBy: selectedPma.certifiedBy,
                            issueDate: selectedPma.issueDate,
                            expiryDate: selectedPma.expiryDate,
                            status: statusValue
                          });
                        }, 100); // Small delay to ensure DOM is ready
                        }
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">
                    {editingPmaRecord ? "Select or keep current PMA" : "Select PMA Number"}
                  </option>
                  {activePmaDocuments
                    ?.filter((pma: any) => {
                      // Filter to only show active PMA documents that haven't expired
                      const today = new Date().toISOString().split('T')[0];
                      return pma.status === 'Active' && pma.expiryDate >= today;
                    })
                    ?.map((pma: any) => (
                      <option key={pma.id} value={pma.pmaNumber}>
                        {pma.pmaNumber} - {pma.specification} {pma.grade}
                      </option>
                    ))
                  }
                  {isLoadingActivePma && (
                    <option disabled>Loading active PMA documents...</option>
                  )}
                  {!isLoadingActivePma && (!activePmaDocuments || activePmaDocuments.length === 0) && (
                    <option disabled>No active PMA documents available</option>
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="materialSpecification" className="text-sm font-medium">Material Specification *</label>
                <input
                  type="text"
                  id="materialSpecification"
                  name="materialSpecification"
                  required
                  defaultValue={editingPmaRecord?.materialSpecification || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter material specification"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="materialGrade" className="text-sm font-medium">Material Grade *</label>
                <input
                  type="text"
                  id="materialGrade"
                  name="materialGrade"
                  required
                  defaultValue={editingPmaRecord?.materialGrade || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter material grade"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="certifiedBy" className="text-sm font-medium">Certified By *</label>
                <input
                  type="text"
                  id="certifiedBy"
                  name="certifiedBy"
                  required
                  defaultValue={editingPmaRecord?.certifiedBy || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter certifying authority"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="issueDate" className="text-sm font-medium">Issue Date *</label>
                <input
                  type="date"
                  id="issueDate"
                  name="issueDate"
                  required
                  defaultValue={editingPmaRecord?.issueDate || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="expiryDate" className="text-sm font-medium">Expiry Date *</label>
                <input
                  type="date"
                  id="expiryDate"
                  name="expiryDate"
                  required
                  defaultValue={editingPmaRecord?.expiryDate || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">Status *</label>
                <select
                  id="status"
                  name="status"
                  required
                  value={selectedPmaStatus || editingPmaRecord?.status || "active"}
                  onChange={(e) => setSelectedPmaStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="pending">Pending</option>
                  <option value="canceled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="remarks" className="text-sm font-medium">Remarks</label>
              <textarea
                id="remarks"
                name="remarks"
                rows={3}
                defaultValue={editingPmaRecord?.remarks || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any additional remarks..."
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsPmaDialogOpen(false);
                  setEditingPmaRecord(null);
                  setSelectedPmaDocument("");
                  setSelectedPmaStatus("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingPmaRecord ? 'Update Record' : 'Add Record'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Procedures Dialog */}
      <Dialog open={isProceduresDialogOpen} onOpenChange={(open) => {
        setIsProceduresDialogOpen(open);
        if (!open) {
          setEditingProcedureRecord(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProcedureRecord ? 'Edit Test Procedure Link' : 'Link Test Procedure'}
            </DialogTitle>
            <DialogDescription>
              {editingProcedureRecord 
                ? `Edit test procedure link ${editingProcedureRecord.id} for this inspection order.`
                : 'Link an active test procedure to this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            
            const procedureData = {
              procedureNumber: formData.get('procedureNumber') as string,
              procedureName: formData.get('procedureName') as string,
              ndtMethod: formData.get('ndtMethod') as string,
              applicableStandard: formData.get('applicableStandard') as string,
              notes: formData.get('notes') as string
            };
            
            if (editingProcedureRecord) {
              editProcedureRecord(procedureData);
            } else {
              addProcedureRecord(procedureData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="procedureNumber" className="text-sm font-medium">Procedure Number *</label>
                <select
                  id="procedureNumber"
                  name="procedureNumber"
                  required
                  defaultValue={editingProcedureRecord?.procedureNumber || ""}
                  onChange={(e) => {
                    const selectedProcedure = testProcedures.find(proc => proc.procedureNumber === e.target.value);
                    if (selectedProcedure) {
                      // Auto-populate fields when procedure is selected
                      const form = e.target.closest('form');
                      if (form) {
                        (form.elements.namedItem('procedureName') as HTMLInputElement).value = selectedProcedure.procedureName || '';
                        (form.elements.namedItem('ndtMethod') as HTMLInputElement).value = selectedProcedure.ndtMethod || '';
                        (form.elements.namedItem('applicableStandard') as HTMLInputElement).value = selectedProcedure.applicableStandard || '';
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a test procedure...</option>
                  {testProcedures.map((procedure) => (
                    <option key={procedure.id} value={procedure.procedureNumber}>
                      {procedure.procedureNumber} - {procedure.procedureName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="procedureName" className="text-sm font-medium">Procedure Name *</label>
                <input
                  type="text"
                  id="procedureName"
                  name="procedureName"
                  required
                  defaultValue={editingProcedureRecord?.procedureName || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-populated from selection"
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ndtMethod" className="text-sm font-medium">NDT Method *</label>
                <input
                  type="text"
                  id="ndtMethod"
                  name="ndtMethod"
                  required
                  defaultValue={editingProcedureRecord?.ndtMethod || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-populated from selection"
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="applicableStandard" className="text-sm font-medium">Applicable Standard</label>
                <input
                  type="text"
                  id="applicableStandard"
                  name="applicableStandard"
                  defaultValue={editingProcedureRecord?.applicableStandard || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-populated from selection"
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">Notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={editingProcedureRecord?.notes || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any additional notes about this procedure link..."
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsProceduresDialogOpen(false);
                  setEditingProcedureRecord(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingProcedureRecord ? 'Update Link' : 'Link Procedure'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* DVR Dialog */}
      <Dialog open={isDvrDialogOpen} onOpenChange={(open) => {
        setIsDvrDialogOpen(open);
        if (!open) {
          setEditingDvrRecord(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDvrRecord ? 'Edit DVR Record' : 'Add DVR Record'}
            </DialogTitle>
            <DialogDescription>
              {editingDvrRecord 
                ? `Edit document verification record ${editingDvrRecord.id} for this inspection order.`
                : 'Add a new document verification record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            
            // Validate files before proceeding
            if (!editingDvrRecord && dvrFiles.length === 0) {
              toast({
                title: "Files Required",
                description: "Please select files before creating the DVR record.",
                variant: "destructive"
              });
              return;
            }
            
            if (editingDvrRecord && !hasExistingDvrFiles && dvrFiles.length === 0) {
              toast({
                title: "Additional Files Required",
                description: "Please select additional files before updating the DVR record.",
                variant: "destructive"
              });
              return;
            }

            const formData = new FormData(e.currentTarget);
            const recordData = {
              designDocument: formData.get('designDocument') as string,
              reviewType: formData.get('reviewType') as string,
              reviewer: formData.get('reviewer') as string,
              reviewDate: formData.get('reviewDate') as string,
              status: formData.get('status') as string,
              comments: formData.get('comments') as string,
            };
            if (editingDvrRecord) {
              editDvrRecord(recordData);
            } else {
              addDvrRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="designDocument" className="text-sm font-medium">Design Document *</label>
                <input
                  type="text"
                  id="designDocument"
                  name="designDocument"
                  required
                  defaultValue={editingDvrRecord?.designDocument || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter design document reference"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="reviewType" className="text-sm font-medium">Review Type *</label>
                <select
                  id="reviewType"
                  name="reviewType"
                  required
                  defaultValue={editingDvrRecord?.reviewType || "design_review"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="design_review">Design Review</option>
                  <option value="document_verification">Document Verification</option>
                  <option value="compliance_check">Compliance Check</option>
                  <option value="technical_review">Technical Review</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="reviewer" className="text-sm font-medium">Reviewer *</label>
                <input
                  type="text"
                  id="reviewer"
                  name="reviewer"
                  required
                  defaultValue={editingDvrRecord?.reviewer || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter reviewer name"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="reviewDate" className="text-sm font-medium">Review Date *</label>
                <input
                  type="date"
                  id="reviewDate"
                  name="reviewDate"
                  required
                  defaultValue={editingDvrRecord?.reviewDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">Status *</label>
                <select
                  id="status"
                  name="status"
                  required
                  defaultValue={editingDvrRecord?.status || "pending"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="requires_revision">Requires Revision</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="comments" className="text-sm font-medium">Comments</label>
              <textarea
                id="comments"
                name="comments"
                rows={3}
                defaultValue={editingDvrRecord?.comments || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any additional comments or observations..."
              />
            </div>

            {/* File Upload Section - Available for both new and edit */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editingDvrRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
              </label>
              {editingDvrRecord && (
                <div className="text-sm">
                  {isCheckingExistingDvrFiles ? (
                    <div className="flex items-center text-blue-600">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking for existing files...
                    </div>
                  ) : hasExistingDvrFiles ? (
                    <div className="text-orange-600">
                      ⚠️ Existing files found on GCS. New files will replace existing ones.
                    </div>
                  ) : (
                    <div className="text-red-600">
                      ⚠️ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setDvrFiles(files);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Select PDF, DOC, DOCX, JPG, JPEG, or PNG files
                </p>
                {dvrFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-green-600">
                      {dvrFiles.length} file(s) selected
                    </p>
                    <ul className="text-xs text-gray-600 mt-1">
                      {dvrFiles.map((file, index) => (
                        <li key={index} className="truncate">
                          {file.name} ({Math.round(file.size / 1024)} KB)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsDvrDialogOpen(false);
                  setEditingDvrRecord(null);
                  setDvrFiles([]);
                  setHasExistingDvrFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingDvrFiles || isCheckingExistingDvrFiles || dvrFiles.length === 0}
              >
                {isUploadingDvrFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingDvrRecord ? 'Updating & Replacing...' : 'Creating & Uploading...'}
                  </>
                ) : isCheckingExistingDvrFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking existing files...
                  </>
                ) : dvrFiles.length === 0 ? (
                  editingDvrRecord ? 'Select Files to Continue' : 'Select Files to Continue'
                ) : (
                  editingDvrRecord ? 'Update & Replace Files' : 'Add & Upload Files'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ITP Dialog */}
      <Dialog open={isItpDialogOpen} onOpenChange={(open) => {
        setIsItpDialogOpen(open);
        if (!open) {
          setEditingItpRecord(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItpRecord ? 'Edit ITP Record' : 'Add ITP Record'}
            </DialogTitle>
            <DialogDescription>
              {editingItpRecord 
                ? `Edit ITP record ${editingItpRecord.id} for this inspection order.`
                : 'Add a new Inspection and Test Plan (ITP) record for this inspection order.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const recordData = {
              itpNumber: formData.get('itpNumber') as string,
              itemDescription: formData.get('itemDescription') as string,
              inspectionStage: formData.get('inspectionStage') as string,
              inspector: formData.get('inspector') as string,
              inspectionDate: formData.get('inspectionDate') as string,
              status: formData.get('status') as string,
              remarks: formData.get('remarks') as string,
            };
            if (editingItpRecord) {
              editItpRecord(recordData);
            } else {
              addItpRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="itpNumber" className="text-sm font-medium">ITP Number *</label>
                <input
                  type="text"
                  id="itpNumber"
                  name="itpNumber"
                  required
                  defaultValue={editingItpRecord?.itpNumber || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter ITP number (e.g., ITP-001-2025)"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="itemDescription" className="text-sm font-medium">Item Description *</label>
                <input
                  type="text"
                  id="itemDescription"
                  name="itemDescription"
                  required
                  defaultValue={editingItpRecord?.itemDescription || 
                    (editInspectionOrderDetails?.description || 
                     (editInspectionOrderDetails?.items && editInspectionOrderDetails.items.length > 0 ? 
                      editInspectionOrderDetails.items[0].description : ""))}
                  readOnly={!editingItpRecord && (editInspectionOrderDetails?.description || 
                    (editInspectionOrderDetails?.items && editInspectionOrderDetails.items.length > 0 && 
                     editInspectionOrderDetails.items[0].description))}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !editingItpRecord && (editInspectionOrderDetails?.description || 
                    (editInspectionOrderDetails?.items && editInspectionOrderDetails.items.length > 0 && 
                     editInspectionOrderDetails.items[0].description)) ? 'bg-gray-50 text-gray-700' : ''
                  }`}
                  placeholder="Enter item description"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="inspectionStage" className="text-sm font-medium">Inspection Stage *</label>
                <select
                  id="inspectionStage"
                  name="inspectionStage"
                  required
                  defaultValue={editingItpRecord?.inspectionStage || "incoming"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="incoming">Incoming Inspection</option>
                  <option value="inprocess">In-Process Inspection</option>
                  <option value="final">Final Inspection</option>
                  <option value="predelivery">Pre-Delivery Inspection</option>
                  <option value="witness">Witness Point</option>
                  <option value="hold">Hold Point</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="inspector" className="text-sm font-medium">Inspector *</label>
                <input
                  type="text"
                  id="inspector"
                  name="inspector"
                  required
                  defaultValue={editingItpRecord?.inspector || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter inspector name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="inspectionDate" className="text-sm font-medium">Inspection Date *</label>
                <input
                  type="date"
                  id="inspectionDate"
                  name="inspectionDate"
                  required
                  defaultValue={editingItpRecord?.inspectionDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium">Status *</label>
                <select
                  id="status"
                  name="status"
                  required
                  defaultValue={editingItpRecord?.status || "Pending"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Pending">Pending</option>
                  <option value="Pass">Pass</option>
                  <option value="Failed">Failed</option>
                  <option value="Conditional">Conditional Pass</option>
                  <option value="Waived">Waived</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="remarks" className="text-sm font-medium">Remarks</label>
              <textarea
                id="remarks"
                name="remarks"
                rows={3}
                defaultValue={editingItpRecord?.remarks || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any additional remarks or observations..."
              />
            </div>

            {/* File Upload Section */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-medium">
                {editingItpRecord ? 'Upload Replacement Files *' : 'Upload Files *'}
              </h3>
              
              {/* File existence status for Edit mode */}
              {editingItpRecord && (
                <div className="mb-4 p-3 border rounded-lg">
                  {isCheckingExistingItpFiles ? (
                    <div className="flex items-center space-x-2 text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking for existing files...</span>
                    </div>
                  ) : hasExistingItpFiles ? (
                    <div className="text-orange-600 font-medium">
                      ⚠️ Existing files found on GCS. New files will replace existing ones.
                    </div>
                  ) : (
                    <div className="text-red-600 font-medium">
                      ⚠ No existing files found. Please add files to proceed.
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50">
                <div className="text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <label htmlFor="itp-file-upload" className="cursor-pointer">
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        Click to upload files or drag and drop
                      </span>
                      <span className="text-xs text-gray-500">
                        PDF, DOC, DOCX, JPG, JPEG, PNG files up to 10MB each
                      </span>
                    </label>
                    <input
                      id="itp-file-upload"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const validFiles = files.filter(file => {
                          const maxSize = 10 * 1024 * 1024; // 10MB
                          if (file.size > maxSize) {
                            toast({
                              title: "File too large",
                              description: `${file.name} is larger than 10MB`,
                              variant: "destructive"
                            });
                            return false;
                          }
                          return true;
                        });
                        setItpFiles(validFiles);
                      }}
                      className="hidden"
                    />
                  </div>
                  
                  {itpFiles.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Selected Files:</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {itpFiles.map((file, index) => (
                          <li key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                            <span>{file.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setItpFiles(prev => prev.filter((_, i) => i !== index));
                              }}
                            >
                              ×
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsItpDialogOpen(false);
                  setEditingItpRecord(null);
                  setItpFiles([]);
                  setHasExistingItpFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isUploadingItpFiles || isCheckingExistingItpFiles || (!hasExistingItpFiles && itpFiles.length === 0)}
              >
                {isUploadingItpFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingItpRecord ? 'Updating & Replacing...' : 'Creating & Uploading...'}
                  </>
                ) : isCheckingExistingItpFiles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking existing files...
                  </>
                ) : (!hasExistingItpFiles && itpFiles.length === 0) ? (
                  editingItpRecord ? 'Select Files to Continue' : 'Select Files to Continue'
                ) : (
                  editingItpRecord ? 'Update & Replace Files' : 'Add & Upload Files'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Material Traceability Dialog */}
      <Dialog open={isMaterialDialogOpen} onOpenChange={(open) => {
        setIsMaterialDialogOpen(open);
        if (!open) {
          setEditingMaterialRecord(null);
          setSelectedMaterialType("");
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMaterialRecord ? 'Edit Material Record' : 'Add Material Record'}
            </DialogTitle>
            <DialogDescription>
              {editingMaterialRecord 
                ? 'Edit material traceability record for this inspection order.'
                : 'Add a new material traceability record linking materials from Material Identification module.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const materialId = formData.get('materialId') as string;
            const filteredMaterials = selectedMaterialType 
              ? availableMaterials.filter(m => m.material_type === selectedMaterialType)
              : availableMaterials;
            const selectedMaterial = filteredMaterials.find(m => m.id === parseInt(materialId));
            
            const recordData = {
              materialId: selectedMaterial?.id,
              materialIdentificationId: selectedMaterial?.material_identification_id,
              materialCertificateNumber: selectedMaterial?.mill_test_certificate_number || '',
              heatNumber: selectedMaterial?.heat_number || '',
              materialGrade: selectedMaterial?.material_grade || '',
              materialSpecification: selectedMaterial?.specification || '',
              allocatedQuantity: formData.get('allocatedQuantity') as string,
              quantityUnit: formData.get('quantityUnit') as string,
              description: selectedMaterial?.material_description || '',
              materialType: selectedMaterialType // Include material type from state
            };
            
            if (editingMaterialRecord) {
              updateMaterialRecord(recordData);
            } else {
              addMaterialRecord(recordData);
            }
          }} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="materialType" className="text-sm font-medium">Material Type *</label>
                <select
                  id="materialType"
                  name="materialType"
                  required
                  value={selectedMaterialType}
                  onChange={(e) => {
                    setSelectedMaterialType(e.target.value);
                    // Reset material selection when material type changes
                    const form = e.target.closest('form') as HTMLFormElement;
                    const materialField = form.querySelector('#materialId') as HTMLSelectElement;
                    if (materialField) materialField.value = "";
                    
                    // Clear auto-populated fields
                    const certificateField = form.querySelector('#materialCertificateNumber') as HTMLInputElement;
                    const heatField = form.querySelector('#heatNumber') as HTMLInputElement;
                    const gradeField = form.querySelector('#materialGrade') as HTMLInputElement;
                    const specField = form.querySelector('#materialSpecification') as HTMLInputElement;
                    const unitField = form.querySelector('#quantityUnit') as HTMLInputElement;
                    
                    if (certificateField) certificateField.value = '';
                    if (heatField) heatField.value = '';
                    if (gradeField) gradeField.value = '';
                    if (specField) specField.value = '';
                    if (unitField) unitField.value = '';
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select material type...</option>
                  <option value="Bars">Bars</option>
                  <option value="Flanges">Flanges</option>
                  <option value="Nut Bolts">Nut Bolts</option>
                  <option value="Pipe Fittings">Pipe Fittings</option>
                  <option value="Pipes">Pipes</option>
                  <option value="Plates">Plates</option>
                  <option value="Sheets">Sheets</option>
                  <option value="Structural Materials">Structural Materials</option>
                  <option value="Valves">Valves</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="materialId" className="text-sm font-medium">Material *</label>
                <select
                  id="materialId"
                  name="materialId"
                  required
                  defaultValue={editingMaterialRecord?.materialId?.toString() || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => {
                    const filteredMaterials = selectedMaterialType 
                      ? availableMaterials.filter(m => m.material_type === selectedMaterialType)
                      : availableMaterials;
                    const selectedMaterial = filteredMaterials.find(m => m.id === parseInt(e.target.value));
                    if (selectedMaterial) {
                      // Update other fields based on selected material
                      const form = e.target.closest('form') as HTMLFormElement;
                      const certificateField = form.querySelector('#materialCertificateNumber') as HTMLInputElement;
                      const heatField = form.querySelector('#heatNumber') as HTMLInputElement;
                      const gradeField = form.querySelector('#materialGrade') as HTMLInputElement;
                      const specField = form.querySelector('#materialSpecification') as HTMLInputElement;
                      const unitField = form.querySelector('#quantityUnit') as HTMLInputElement; // Added unit field auto-population
                      
                      if (certificateField) certificateField.value = selectedMaterial.mill_test_certificate_number || '';
                      if (heatField) heatField.value = selectedMaterial.heat_number || '';
                      if (gradeField) gradeField.value = selectedMaterial.material_grade || '';
                      if (specField) specField.value = selectedMaterial.specification || '';
                      if (unitField) unitField.value = selectedMaterial.unit || 'Pcs'; // Auto-populate unit field
                    }
                  }}
                >
                  <option value="">Select a material...</option>
                  {(() => {
                    const filteredMaterials = selectedMaterialType 
                      ? availableMaterials.filter(m => m.material_type === selectedMaterialType)
                      : availableMaterials;
                    
                    return filteredMaterials
                      .sort((a, b) => (a.material_identification_id || '').localeCompare(b.material_identification_id || '', undefined, { numeric: true, sensitivity: 'base' }))
                      .map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.material_identification_id} - {material.material_description}
                        </option>
                      ));
                  })()}
                </select>
                {selectedMaterialType && (
                  <p className="text-xs text-gray-500">
                    Showing {availableMaterials.filter(m => m.material_type === selectedMaterialType).length} materials of type "{selectedMaterialType}"
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="allocatedQuantity" className="text-sm font-medium">Allocated Quantity *</label>
                <input
                  type="number"
                  id="allocatedQuantity"
                  name="allocatedQuantity"
                  required
                  step="0.01"
                  defaultValue={editingMaterialRecord?.allocatedQuantity || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter quantity"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="quantityUnit" className="text-sm font-medium">Unit *</label>
                <input
                  type="text"
                  id="quantityUnit"
                  name="quantityUnit"
                  required
                  defaultValue={editingMaterialRecord?.quantityUnit || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., kg, meters, pieces"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="materialCertificateNumber" className="text-sm font-medium">Certificate Number</label>
                <input
                  type="text"
                  id="materialCertificateNumber"
                  name="materialCertificateNumber"
                  defaultValue={editingMaterialRecord?.materialCertificateNumber || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-filled from material"
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="heatNumber" className="text-sm font-medium">Heat Number</label>
                <input
                  type="text"
                  id="heatNumber"
                  name="heatNumber"
                  defaultValue={editingMaterialRecord?.heatNumber || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-filled from material"
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="materialGrade" className="text-sm font-medium">Material Grade</label>
                <input
                  type="text"
                  id="materialGrade"
                  name="materialGrade"
                  defaultValue={editingMaterialRecord?.materialGrade || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-filled from material"
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="materialSpecification" className="text-sm font-medium">Specification</label>
                <input
                  type="text"
                  id="materialSpecification"
                  name="materialSpecification"
                  defaultValue={editingMaterialRecord?.materialSpecification || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Auto-filled from material"
                  readOnly
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsMaterialDialogOpen(false);
                  setEditingMaterialRecord(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingMaterialRecord ? 'Update Record' : 'Add Record'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
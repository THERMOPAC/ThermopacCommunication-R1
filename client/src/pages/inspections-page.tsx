import React, { useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, ClipboardCheck, Calendar as CalendarIcon, CheckCircle2, AlertCircle, XCircle, FileText, Hourglass, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  } = useQuery<any[]>({
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
  
  // Fetch details for a specific inspection order
  const {
    data: inspectionOrderDetails,
    isLoading: isLoadingOrderDetails,
  } = useQuery({
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
      
      if (responseData.buyItemsCount > 0 || responseData.componentItemsCount > 0) {
        description = `Successfully created ${responseData.count} inspection orders (${responseData.buyItemsCount} buy item(s), ${responseData.componentItemsCount} component item(s))`;
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
                    This will generate {previewData.items.length} inspection orders for project {previewData.projectCode}.
                    Please review the items below before confirming.
                  </AlertDescription>
                </Alert>
                
                <div className="overflow-y-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seq #</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Make/Buy</TableHead>
                        <TableHead>Item Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.items.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{item.sequenceNumber}</TableCell>
                          <TableCell className="font-medium">{item.itemCode}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity} {item.unit}</TableCell>
                          <TableCell>{item.makeOrBuy}</TableCell>
                          <TableCell>
                            {item.itemType === 'Parent' ? (
                              <Badge className="bg-blue-500">Parent</Badge>
                            ) : (
                              <Badge className="bg-purple-500">Child</Badge>
                            )}
                            {item.isVirtual && (
                              <Badge variant="outline" className="ml-1">Virtual</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                  <TableCaption>List of inspection reports for the selected project.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Inspector</TableHead>
                      <TableHead>Qty Inspected</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections?.map((inspection: any) => (
                      <TableRow key={inspection.id}>
                        <TableCell className="font-medium">{inspection.reportNumber}</TableCell>
                        <TableCell>{inspection.title}</TableCell>
                        <TableCell>{inspection.reportType}</TableCell>
                        <TableCell>{getStatusBadge(inspection.status)}</TableCell>
                        <TableCell>{format(new Date(inspection.inspectionDate), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{inspection.inspectorId === user?.id ? "You" : "Other Inspector"}</TableCell>
                        <TableCell>
                          {inspection.quantityInspected} 
                          {inspection.quantityAccepted || inspection.quantityRejected ? 
                            ` (${inspection.quantityAccepted} passed, ${inspection.quantityRejected} failed)` : 
                            ''}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">View</Button>
                            <Button variant="outline" size="sm">Edit</Button>
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

        <Card>
          <CardHeader>
            <CardTitle>Quality Metrics</CardTitle>
            <CardDescription>
              Overview of quality performance metrics for the selected project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedProject ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Please select a project to view quality metrics.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {inspections?.length > 0 ? 
                        Math.round(
                          (inspections.reduce((acc: number, curr: any) => acc + (curr.quantityAccepted || 0), 0) / 
                           inspections.reduce((acc: number, curr: any) => acc + (curr.quantityInspected || 0), 0)) * 100
                        ) + '%' : 
                        'N/A'
                      }
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Inspections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {inspections?.length || 0}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">NCRs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {inspections?.filter((inspection: any) => inspection.status === 'failed').length || 0}
                    </div>
                  </CardContent>
                </Card>
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
                {isGeneratingOrders || isLoadingPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isLoadingPreview ? "Loading Preview..." : "Generating..."}
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" /> Generate Inspection Orders
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedProject ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <FileText className="h-16 w-16 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium">No Project Selected</h3>
                <p className="text-muted-foreground mt-2">
                  Please select a project to view or create inspection orders.
                </p>
              </div>
            ) : isLoadingInspectionOrders ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : inspectionOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                <FileText className="h-16 w-16 text-gray-400 mb-2" />
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
                              View Details
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
        <DialogContent className="max-w-4xl">
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
                      <div className="text-sm">{inspectionOrderDetails.creator?.username || 'N/A'}</div>
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
                      <div className="text-sm">{inspectionOrderDetails.project?.name || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Project Code:</div>
                      <div className="text-sm">{inspectionOrderDetails.projectCode}</div>
                      
                      <div className="text-sm font-medium">Item Code:</div>
                      <div className="text-sm">{inspectionOrderDetails.itemCode || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Description:</div>
                      <div className="text-sm">{inspectionOrderDetails.description}</div>
                      
                      <div className="text-sm font-medium">Make/Buy:</div>
                      <div className="text-sm">{inspectionOrderDetails.makeOrBuy || 'N/A'}</div>
                      
                      <div className="text-sm font-medium">Sequence Number:</div>
                      <div className="text-sm">{inspectionOrderDetails.sequenceNumber}</div>
                      
                      <div className="text-sm font-medium">Parent Order:</div>
                      <div className="text-sm">{inspectionOrderDetails.parentInspectionOrderId ? 'Yes' : 'No (Parent Item)'}</div>
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Information</TabsTrigger>
                  <TabsTrigger value="details">Inspection Details</TabsTrigger>
                  <TabsTrigger value="findings">Findings & Results</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-4 pt-4">
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
                    
                    <FormField
                      control={form.control}
                      name="projectCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Code</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter project code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="workOrderId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Order (Optional)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a work order" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {workOrders?.map((workOrder: any) => (
                              <SelectItem key={workOrder.id} value={workOrder.id.toString()}>
                                {workOrder.workOrderNumber}: {workOrder.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Link this inspection to a specific work order if applicable.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="reportNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Report Number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="QC-2023-001" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter inspection title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="reportType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Report Type</FormLabel>
                        <Select 
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select report type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="incoming">Incoming Inspection</SelectItem>
                            <SelectItem value="in-process">In-Process Inspection</SelectItem>
                            <SelectItem value="final">Final Inspection</SelectItem>
                            <SelectItem value="customer">Customer Inspection</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Inspection Details Tab */}
                <TabsContent value="details" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="inspectionDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Inspection Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className="pl-3 text-left font-normal flex justify-between"
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => date > new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter inspection location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="inspectorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspector</FormLabel>
                        <FormControl>
                          <Input 
                            type="hidden" 
                            {...field} 
                            value={user?.id} 
                          />
                        </FormControl>
                        <div className="p-2 border rounded-md bg-muted/50">
                          {user?.username} ({user?.role})
                        </div>
                        <FormDescription>
                          The current user is set as the inspector by default.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="quantityInspected"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity Inspected</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="1"
                              onChange={(e) => field.onChange(e.target.valueAsNumber)}
                              placeholder="Enter quantity" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="quantityAccepted"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity Accepted</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="0"
                              onChange={(e) => field.onChange(e.target.valueAsNumber)}
                              placeholder="Enter quantity" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="quantityRejected"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity Rejected</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="0"
                              onChange={(e) => field.onChange(e.target.valueAsNumber)}
                              placeholder="Enter quantity" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                {/* Findings & Results Tab */}
                <TabsContent value="findings" className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="findings"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Findings</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Enter inspection findings"
                            rows={4}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="recommendations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recommendations</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Enter recommendations"
                            rows={4}
                          />
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
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="passed">Passed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="conditionally_passed">Conditionally Passed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
import { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { Loader2 } from "lucide-react";
import Layout from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function ProcurementPlanningPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();

  // Define project and purchase order types
  interface Project {
    id: number;
    code: string;
    name: string;
    description?: string;
  }

  interface PurchaseOrder {
    id: number;
    purchaseOrderNumber: string;
    title: string;
    projectCode: string;
    vendorName: string;
    status: string;
    requiredByDate: string;
    totalAmount: number;
  }

  interface Vendor {
    id: number;
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
  }

  // Fetch projects for both filtering and selection
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  // Fetch purchase orders from the API
  const { data: purchaseOrders, isLoading, error } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/procurement/purchase-orders"],
    enabled: true, // Enable the query to fetch real data
  });

  // Mock purchase orders data
  const mockPurchaseOrders = [
    {
      id: 1,
      purchaseOrderNumber: "PO-2526-1-001",
      title: "Raw Materials for Heat Exchanger",
      projectCode: "2526-1",
      vendorName: "Steel Suppliers Ltd.",
      status: "draft",
      requiredByDate: "2025-05-15",
      totalAmount: 125000,
    },
    {
      id: 2,
      purchaseOrderNumber: "PO-2526-1-002",
      title: "Pressure Gauges and Sensors",
      projectCode: "2526-1",
      vendorName: "Precision Instruments Inc.",
      status: "submitted",
      requiredByDate: "2025-05-10",
      totalAmount: 42500,
    },
    {
      id: 3,
      purchaseOrderNumber: "PO-2526-2-001",
      title: "Pump Components",
      projectCode: "2526-2",
      vendorName: "Flow Systems Corp.",
      status: "approved",
      requiredByDate: "2025-06-05",
      totalAmount: 78900,
    },
  ];

  // Use real data from API if available, otherwise fall back to mock data for now
  const dataSource = purchaseOrders || mockPurchaseOrders || [];
  
  // Preview purchase orders for a selected project
  const { data: previewPurchaseOrders, isLoading: isLoadingPreview } = useQuery({
    queryKey: ["/api/procurement/purchase-orders/preview", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return null;
      try {
        console.log("Fetching preview for project ID:", selectedProjectId);
        const res = await fetch(`/api/procurement/purchase-orders/preview/${selectedProjectId}`);
        if (!res.ok) {
          const errorText = await res.text();
          console.error("API error:", errorText);
          throw new Error(`Failed to fetch purchase order preview: ${errorText}`);
        }
        const data = await res.json();
        console.log("Preview data:", data);
        return data;
      } catch (error) {
        console.error("Error fetching preview:", error);
        throw error;
      }
    },
    enabled: !!selectedProjectId,
    staleTime: 0, // Don't cache this request
  });

  // Set preview data when it's available
  useEffect(() => {
    if (previewPurchaseOrders) {
      console.log("Setting preview data:", previewPurchaseOrders);
      setPreviewData(previewPurchaseOrders);
    }
  }, [previewPurchaseOrders]);

  // Create purchase orders for a project
  const generatePurchaseOrdersMutation = useMutation({
    mutationFn: async (data: { projectId: number, confirm: boolean }) => {
      const res = await apiRequest(
        "POST", 
        `/api/procurement/purchase-orders/generate-for-project/${data.projectId}`,
        { confirm: data.confirm }
      );
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Successfully generated ${data.purchaseOrders?.length || 0} purchase orders.`,
      });
      setShowPreview(false);
      setSelectedProjectId(null);
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/procurement/purchase-orders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate purchase orders.",
        variant: "destructive",
      });
    }
  });

  // Handle project selection for purchase order generation
  const handleProjectSelect = (projectId: string) => {
    console.log("Project selected:", projectId);
    setSelectedProjectId(Number(projectId));
    // No longer need this with the new Dialog component
    // setShowPreview(true);
  };

  // Handle generate purchase orders
  const handleGeneratePurchaseOrders = () => {
    if (selectedProjectId) {
      generatePurchaseOrdersMutation.mutate({ 
        projectId: selectedProjectId, 
        confirm: true 
      });
    }
  };
  
  // Filter function for purchase orders
  const filteredPurchaseOrders = Array.isArray(dataSource) ? dataSource.filter((po: PurchaseOrder) => {
    // Handle potential undefined values safely
    const poNumber = po.purchaseOrderNumber || '';
    const poTitle = po.title || '';
    const poVendorName = po.vendorName || '';
    const poStatus = po.status || '';
    const poProjectCode = po.projectCode || '';
    const poProject = (po as any).project || {};
    
    const matchesSearch = 
      poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      poTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      poVendorName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProject = projectFilter && projectFilter !== "all" ? 
      (poProjectCode === projectFilter || 
      (poProject && poProject.code === projectFilter)) : true;
    
    const matchesStatus = statusFilter && statusFilter !== "all" ? poStatus === statusFilter : true;
    
    return matchesSearch && matchesProject && matchesStatus;
  }) : [];

  const statusColorMap: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    submitted: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    ordered: "bg-purple-100 text-purple-800",
    received: "bg-teal-100 text-teal-800",
    on_hold: "bg-yellow-100 text-yellow-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <Layout>
      <Helmet>
        <title>Procurement Planning | ThermoPac</title>
      </Helmet>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Procurement Planning</h1>
            <p className="text-muted-foreground">
              Generate and manage purchase orders for all your procurement needs
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button className="mt-2 sm:mt-0">Create Purchase Order</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Create New Purchase Order</DialogTitle>
                  <DialogDescription>
                    Fill in the details to create a new purchase order request
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label htmlFor="title" className="text-sm font-medium">Title</label>
                    <Input id="title" placeholder="Purchase Order Title" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="project" className="text-sm font-medium">Project</label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project: any) => (
                            <SelectItem key={project.id} value={project.code}>
                              {project.code} - {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="vendor" className="text-sm font-medium">Vendor</label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors?.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id.toString()}>
                              {vendor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Required By Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !date && "text-muted-foreground"
                            )}
                          >
                            {date ? format(date, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid gap-2">
                      <label htmlFor="priority" className="text-sm font-medium">Priority</label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="description" className="text-sm font-medium">Description</label>
                    <textarea 
                      id="description" 
                      className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Enter purchase order description..."
                    ></textarea>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Create Purchase Order</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Project-Based Purchase Order Generation - Simplified to use Dialog instead of AlertDialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="mt-2 sm:mt-0">
                  Create Purchase Orders for Project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[700px]">
                <DialogHeader>
                  <DialogTitle>Generate Purchase Orders for Project</DialogTitle>
                  <DialogDescription>
                    Select a project to generate purchase orders for all "Buy" items in the project.
                  </DialogDescription>
                </DialogHeader>
                
                {!selectedProjectId ? (
                  <div className="py-4">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <label htmlFor="project-select" className="text-sm font-medium">
                          Select Project
                        </label>
                        <Select onValueChange={handleProjectSelect}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((project: any) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.code} - {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : isLoadingPreview ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : previewData ? (
                  <div className="py-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium">
                        Project: {previewData.project?.code} - {previewData.project?.name}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                        {previewData.itemCount} items will be included in purchase orders
                      </p>
                    </div>
                    
                    <div className="rounded-md border max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Unit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.items?.length > 0 ? (
                            previewData.items.map((item: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{item.itemCode}</TableCell>
                                <TableCell>{item.description}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.unit}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-4">
                                No items found to generate purchase orders.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}
                
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => {
                    // Reset state when dialog is closed
                    setSelectedProjectId(null);
                  }}>
                    Cancel
                  </Button>
                  {selectedProjectId && previewData && (
                    <Button
                      onClick={handleGeneratePurchaseOrders}
                      disabled={generatePurchaseOrdersMutation.isPending || !previewData?.items?.length}
                    >
                      {generatePurchaseOrdersMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Purchase Orders"
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>
              View and manage all purchase orders across projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 mb-4">
              <div className="w-full sm:w-1/3">
                <Input
                  placeholder="Search purchase orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.code}>
                        {project.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="ordered">Ordered</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator className="my-4" />
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="bg-destructive/10 p-4 rounded-md text-destructive">
                Error loading purchase orders. Please try again.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Required By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchaseOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          No purchase orders found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPurchaseOrders.map((po: any) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.purchaseOrderNumber || ''}</TableCell>
                          <TableCell>{po.title || ''}</TableCell>
                          <TableCell>{po.projectCode || (po.project ? po.project.code : '')}</TableCell>
                          <TableCell>{po.vendorName || ''}</TableCell>
                          <TableCell>
                            {po.status && (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColorMap[po.status] || 'bg-gray-100 text-gray-800'}`}>
                                {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{po.requiredByDate || ''}</TableCell>
                          <TableCell className="text-right">
                            {po.totalAmount !== undefined ? `₹${po.totalAmount.toLocaleString()}` : ''}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {filteredPurchaseOrders.length} of {dataSource.length} purchase orders
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>Previous</Button>
              <Button variant="outline" size="sm" disabled>Next</Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
}
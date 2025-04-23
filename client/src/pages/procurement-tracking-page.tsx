import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
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
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, PackageCheck, Calendar as CalendarIcon, CheckCircle2, Hourglass, AlertTriangle, XCircle, Truck, Loader2, Search, Package, Clock, Download, Upload, FileText, Eye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Placeholder schema for tracking update
const trackingUpdateSchema = z.object({
  purchaseOrderId: z.number().positive({ message: "Purchase order ID is required" }),
  status: z.string().min(1, { message: "Status is required" }),
  trackingNumber: z.string().optional(),
  deliveryDate: z.date().optional(),
  receivedQuantity: z.number().nonnegative().optional(),
  qualityStatus: z.string().optional(),
  notes: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

type TrackingUpdateFormValues = z.infer<typeof trackingUpdateSchema>;

export default function ProcurementTrackingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPurchaseOrders, setFilteredPurchaseOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  
  // Fetch projects for dropdown
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });
  
  // Placeholder for purchase orders - this would be replaced with a real API call
  const { 
    data: purchaseOrders = [], 
    isLoading: isLoadingPurchaseOrders,
    refetch: refetchPurchaseOrders
  } = useQuery<any[]>({
    queryKey: ['/api/procurement/purchase-orders/project', selectedProject],
    queryFn: async ({ queryKey }) => {
      // This would be a real API call in the future
      // For now, return an empty array as we haven't implemented the backend yet
      return [];
    },
    enabled: !!selectedProject,
  });

  // Form for updating tracking information
  const form = useForm<TrackingUpdateFormValues>({
    resolver: zodResolver(trackingUpdateSchema),
    defaultValues: {
      status: '',
      attachments: [],
    },
  });

  const onSubmit = async (data: TrackingUpdateFormValues) => {
    try {
      // This would call the API
      console.log("Would submit:", data);
      
      toast({
        title: "Tracking Updated",
        description: "Purchase order tracking has been updated successfully.",
      });
      
      setIsUpdateDialogOpen(false);
    } catch (error) {
      console.error("Error updating tracking:", error);
      toast({
        title: "Error Updating Tracking",
        description: "There was an error updating the tracking information. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Filter purchase orders based on search term and status tab
  useEffect(() => {
    if (!purchaseOrders) return;
    
    let filtered = [...purchaseOrders];
    
    // Apply status filter
    if (activeTab !== "all") {
      filtered = filtered.filter(po => po.status === activeTab);
    }
    
    // Apply search filter if search term exists
    if (searchTerm.trim() !== '') {
      const lowercaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(po => {
        return (
          po.purchaseOrderNumber?.toLowerCase().includes(lowercaseSearch) ||
          po.title?.toLowerCase().includes(lowercaseSearch) ||
          po.vendorName?.toLowerCase().includes(lowercaseSearch)
        );
      });
    }
    
    setFilteredPurchaseOrders(filtered);
  }, [purchaseOrders, searchTerm, activeTab]);

  // Helper function to render status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> Draft</Badge>;
      case "submitted":
        return <Badge variant="secondary" className="flex items-center gap-1"><Upload className="h-3 w-3" /> Submitted</Badge>;
      case "approved":
        return <Badge variant="outline" className="flex items-center gap-1 bg-blue-100 text-blue-800"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case "ordered":
        return <Badge variant="outline" className="flex items-center gap-1 bg-indigo-100 text-indigo-800"><Package className="h-3 w-3" /> Ordered</Badge>;
      case "shipped":
        return <Badge variant="outline" className="flex items-center gap-1 bg-violet-100 text-violet-800"><Truck className="h-3 w-3" /> Shipped</Badge>;
      case "received":
        return <Badge variant="outline" className="flex items-center gap-1 bg-green-100 text-green-800"><PackageCheck className="h-3 w-3" /> Received</Badge>;
      case "on_hold":
        return <Badge variant="outline" className="flex items-center gap-1 bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> On Hold</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Procurement Tracking | Thermopac ERP</title>
      </Helmet>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Procurement Tracking</h1>
          <p className="text-muted-foreground">
            Track and manage purchase orders throughout the procurement lifecycle
          </p>
        </div>
      </div>
      
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle>Project Selection</CardTitle>
          <CardDescription>
            Select a project to track its purchase orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="w-full sm:w-1/3">
              <Label htmlFor="project">Project</Label>
              <Select 
                value={selectedProject?.toString() || ""} 
                onValueChange={(value) => setSelectedProject(parseInt(value))}
              >
                <SelectTrigger id="project" className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Projects</SelectLabel>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name} ({project.projectCode})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full sm:w-2/3">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search purchase orders..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedProject && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Purchase Order Tracking</CardTitle>
                <CardDescription>
                  {isLoadingPurchaseOrders 
                    ? "Loading purchase orders..." 
                    : purchaseOrders.length > 0 
                      ? `${purchaseOrders.length} purchase orders found` 
                      : "No purchase orders found"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid grid-cols-4 md:grid-cols-8 mb-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="submitted">Submitted</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="ordered">Ordered</TabsTrigger>
                <TabsTrigger value="shipped">Shipped</TabsTrigger>
                <TabsTrigger value="received">Received</TabsTrigger>
                <TabsTrigger value="on_hold">On Hold</TabsTrigger>
              </TabsList>
            </Tabs>
          
            {isLoadingPurchaseOrders ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : purchaseOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Required By</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Purchase orders would be listed here */}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">No Purchase Orders</h3>
                <p className="mb-4">There are no purchase orders for this project yet.</p>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    toast({
                      title: "Procurement Planning",
                      description: "Please go to the Procurement Planning page to create purchase orders.",
                    });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Purchase Order
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Update Tracking Dialog */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Update Tracking Information</DialogTitle>
            <DialogDescription>
              Update the status and tracking details for this purchase order.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="submitted">Submitted</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="ordered">Ordered</SelectItem>
                            <SelectItem value="shipped">Shipped</SelectItem>
                            <SelectItem value="received">Received</SelectItem>
                            <SelectItem value="on_hold">On Hold</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="trackingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tracking Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter shipping tracking number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Delivery Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Select delivery date</span>
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
                  name="receivedQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Received Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="0" 
                          {...field} 
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="qualityStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quality Status</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select quality status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending Inspection</SelectItem>
                            <SelectItem value="passed">Passed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="conditional">Conditional Accept</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter tracking notes or comments..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsUpdateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Update Tracking</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
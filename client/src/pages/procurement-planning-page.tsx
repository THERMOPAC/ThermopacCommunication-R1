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
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Plus, ShoppingCart, Calendar as CalendarIcon, CheckCircle2, Hourglass, AlertTriangle, XCircle, Trash2, Loader2, Search, Info as InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";

// Placeholder schema for Purchase Order
const purchaseOrderSchema = z.object({
  projectId: z.number().positive({ message: "Please select a project" }),
  projectCode: z.string().min(1, { message: "Project code is required" }),
  purchaseOrderNumber: z.string().min(1, { message: "Purchase order number is required" }),
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
  status: z.string().default("draft"),
  priority: z.string().default("Medium"),
  vendorId: z.number().positive({ message: "Please select a vendor" }),
  requestedDate: z.date({ required_error: "Requested date is required" }),
  requiredByDate: z.date({ required_error: "Required by date is required" }),
  paymentTerms: z.string().optional(),
  shippingTerms: z.string().optional(),
  totalAmount: z.number().nonnegative().optional(),
  currency: z.string().default("INR"),
  notes: z.string().optional(),
});

type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

export default function ProcurementPlanningPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [isGeneratingPurchaseOrders, setIsGeneratingPurchaseOrders] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  
  // State for searching
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [masterItems, setMasterItems] = useState<any[]>([]);
  const [projectItems, setProjectItems] = useState<any[]>([]);
  const [filteredPurchaseOrders, setFilteredPurchaseOrders] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  
  // Fetch projects for dropdown
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });
  
  // Fetch master items
  const { data: allMasterItems = [], isLoading: isLoadingMasterItems } = useQuery<any[]>({
    queryKey: ['/api/master-items'],
  });
  
  // Update masterItems state when the data changes
  useEffect(() => {
    if (allMasterItems) {
      setMasterItems(allMasterItems);
    }
  }, [allMasterItems]);
  
  // Fetch project items when a project is selected
  const { 
    data: selectedProjectItems = [], 
    isLoading: isLoadingProjectItems,
    refetch: refetchProjectItems
  } = useQuery<any[]>({
    queryKey: ['/api/projects', selectedProject, 'items'],
    queryFn: async ({ queryKey }) => {
      const [_, projectId] = queryKey;
      if (!projectId) return [];
      
      const response = await fetch(`/api/projects/${projectId}/items`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch project items");
      }
      return response.json();
    },
    enabled: !!selectedProject,
  });
  
  // Update project items when data changes
  useEffect(() => {
    if (selectedProjectItems) {
      setProjectItems(selectedProjectItems);
    }
  }, [selectedProjectItems]);

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
  
  // Form for creating new purchase order
  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      status: "draft",
      priority: "Medium",
      currency: "INR",
    },
  });

  const onSubmit = async (data: PurchaseOrderFormValues) => {
    try {
      // This would call the API
      console.log("Would submit:", data);
      
      toast({
        title: "Purchase Order Created",
        description: "Purchase order has been created successfully.",
      });
      
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error("Error creating purchase order:", error);
      toast({
        title: "Error Creating Purchase Order",
        description: "There was an error creating the purchase order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Helper function to render status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> Draft</Badge>;
      case "submitted":
        return <Badge variant="secondary" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> Submitted</Badge>;
      case "approved":
        return <Badge variant="outline" className="flex items-center gap-1 bg-blue-100 text-blue-800"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case "ordered":
        return <Badge variant="outline" className="flex items-center gap-1 bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Ordered</Badge>;
      case "on_hold":
        return <Badge variant="outline" className="flex items-center gap-1 bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> On Hold</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Helper function to render priority badge
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "High":
        return <Badge variant="destructive">High</Badge>;
      case "Medium":
        return <Badge variant="secondary">Medium</Badge>;
      case "Low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Procurement Planning | Thermopac ERP</title>
      </Helmet>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Procurement Planning</h1>
          <p className="text-muted-foreground">
            Create and manage purchase orders for procurement items
          </p>
        </div>
      </div>
      
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle>Project Selection</CardTitle>
          <CardDescription>
            Select a project to view or create purchase orders
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

            <Button 
              variant="outline" 
              className="w-full sm:w-auto"
              disabled={!selectedProject}
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Purchase Order
            </Button>

            <Button 
              variant="secondary" 
              className="w-full sm:w-auto"
              disabled={!selectedProject}
              onClick={() => {
                toast({
                  title: "Feature in Development",
                  description: "Auto-generation of purchase orders will be available soon!",
                });
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Generate Purchase Orders
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedProject && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Purchase Orders</CardTitle>
                <CardDescription>
                  {isLoadingPurchaseOrders 
                    ? "Loading purchase orders..." 
                    : purchaseOrders.length > 0 
                      ? `${purchaseOrders.length} purchase orders found` 
                      : "No purchase orders found"}
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search purchase orders..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                    <TableHead>Priority</TableHead>
                    <TableHead>Required By</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Purchase orders would be listed here */}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">No Purchase Orders</h3>
                <p className="mb-4">There are no purchase orders for this project yet.</p>
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Purchase Order
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Purchase Order Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create New Purchase Order</DialogTitle>
            <DialogDescription>
              Fill in the details to create a new purchase order.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Purchase Order for..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="purchaseOrderNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PO Number</FormLabel>
                      <FormControl>
                        <Input placeholder="PO-2023-00001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vendorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          defaultValue={field.value?.toString()}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a vendor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Sample Vendor 1</SelectItem>
                            <SelectItem value="2">Sample Vendor 2</SelectItem>
                          </SelectContent>
                        </Select>
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
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requiredByDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Required By</FormLabel>
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
                            disabled={(date) =>
                              date < new Date()
                            }
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
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Amount</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="0.00" 
                          {...field} 
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter purchase order details..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Purchase Order</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
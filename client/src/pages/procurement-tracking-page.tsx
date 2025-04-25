import { useState } from "react";
import { Helmet } from "react-helmet";
import { Loader2, CheckCircle, Clock, AlertTriangle, Search, FileText, Edit, Trash2, AlertCircle } from "lucide-react";
import Layout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

export default function ProcurementTrackingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [poToDelete, setPoToDelete] = useState<number | null>(null);
  const [editingPO, setEditingPO] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch projects from the API
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Fetch purchase orders from the API 
  const { data: purchaseOrders, isLoading, error } = useQuery({
    queryKey: ["/api/procurement/purchase-orders"],
  });

  // Delete purchase order mutation
  const deletePOMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        // Use parseJson=false to get the Response object directly
        const response = await apiRequest("DELETE", `/api/procurement/purchase-orders/${id}`, undefined, false, false) as Response;
        
        // Check if the response is valid before trying to parse JSON
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        // Try-catch for JSON parsing
        try {
          const responseText = await response.text();
          // If empty response, return a default success object
          if (!responseText.trim()) {
            return { success: true, message: "Purchase order deleted successfully" };
          }
          
          try {
            // Try to parse as JSON
            return JSON.parse(responseText);
          } catch (jsonError) {
            console.log("Could not parse response as JSON:", responseText);
            // If JSON parsing fails but request was successful, still count as success
            return { success: true, message: "Purchase order deleted successfully" };
          }
        } catch (textError) {
          console.error("Error reading response text:", textError);
          // If we couldn't even read the response text, but the request succeeded
          return { success: true, message: "Purchase order deleted successfully" };
        }
      } catch (err) {
        console.error("Delete PO error:", err);
        throw err;
      }
    },
    onSuccess: () => {
      toast({
        title: "Purchase order deleted",
        description: "The purchase order has been successfully deleted.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/procurement/purchase-orders"] });
      setPoToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete purchase order",
        description: error.message || "An error occurred while deleting the purchase order.",
        variant: "destructive",
      });
    },
  });

  // Update purchase order status mutation
  const updatePOStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      try {
        // Use parseJson=false to get the Response object directly
        const response = await apiRequest("PUT", `/api/procurement/purchase-orders/${id}`, { status }, false, false) as Response;
        
        // Check if the response is valid before trying to parse JSON
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        // Try-catch for JSON parsing
        try {
          const responseText = await response.text();
          // If empty response, return a default success object
          if (!responseText.trim()) {
            return { success: true, message: "Purchase order status updated successfully" };
          }
          
          try {
            // Try to parse as JSON
            return JSON.parse(responseText);
          } catch (jsonError) {
            console.log("Could not parse response as JSON:", responseText);
            // If JSON parsing fails but request was successful, still count as success
            return { success: true, message: "Purchase order status updated successfully" };
          }
        } catch (textError) {
          console.error("Error reading response text:", textError);
          // If we couldn't even read the response text, but the request succeeded
          return { success: true, message: "Purchase order status updated successfully" };
        }
      } catch (err) {
        console.error("Update PO error:", err);
        throw err;
      }
    },
    onSuccess: () => {
      toast({
        title: "Status updated",
        description: "Purchase order status has been updated successfully.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/procurement/purchase-orders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message || "An error occurred while updating the purchase order.",
        variant: "destructive",
      });
    },
  });
  
  // Full purchase order update mutation
  const updatePOMutation = useMutation({
    mutationFn: async (updatedPO: any) => {
      try {
        console.log("Updating PO with data:", JSON.stringify(updatedPO, null, 2));
        
        // Create a clean version of the PO for the API
        const cleanPO = {
          id: updatedPO.id,
          title: updatedPO.title, // Make sure we use title, not description 
          notes: updatedPO.notes,
          vendor_id: updatedPO.vendor_id,
          status: updatedPO.status,
          priority: updatedPO.priority,
          required_by_date: updatedPO.required_by_date,
          tracking_number: updatedPO.tracking_number,
          actual_delivery_date: updatedPO.actual_delivery_date,
          progress: updatedPO.progress,
          items: Array.isArray(updatedPO.items) ? updatedPO.items.map((item: any) => ({
            id: typeof item.id === 'number' ? item.id : undefined,
            item_code: item.item_code || item.code || '',
            description: item.description || item.name || '',
            quantity: item.quantity || 0,
            uom: item.uom || item.unit || 'EA',
            drawing_no: item.drawing_no || '',
            status: item.status || 'pending'
          })) : []
        };
        
        console.log("Sending cleaned PO data:", JSON.stringify(cleanPO, null, 2));
        
        // Use parseJson=false to get the Response object directly
        const response = await apiRequest("PUT", `/api/procurement/purchase-orders/${updatedPO.id}`, cleanPO, false, false) as Response;
        
        // Check if the response is valid before trying to parse JSON
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Server error response:", errorText);
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        // Try-catch for JSON parsing
        try {
          const responseText = await response.text();
          console.log("Server response:", responseText);
          
          // Check if the response is empty
          if (!responseText.trim()) {
            console.log("Response was empty, treating as success");
            return { success: true, message: "Purchase order updated successfully" };
          }
          
          try {
            // Try to parse as JSON
            return JSON.parse(responseText);
          } catch (jsonError) {
            console.log("Could not parse response as JSON:", responseText);
            // If JSON parsing fails but request was successful, still count as success
            return { success: true, message: "Purchase order updated successfully" };
          }
        } catch (textError) {
          console.error("Error reading response text:", textError);
          // If we couldn't even read the response text, but the request succeeded
          return { success: true, message: "Purchase order updated successfully" };
        }
      } catch (err) {
        console.error("Update PO error:", err);
        throw err;
      }
    },
    onSuccess: () => {
      toast({
        title: "Purchase order updated",
        description: "The purchase order has been successfully updated.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/procurement/purchase-orders"] });
      setIsEditModalOpen(false);
      setEditingPO(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update purchase order",
        description: error.message || "An error occurred while updating the purchase order.",
        variant: "destructive",
      });
    },
  });

  // Placeholder for purchase order data from the API
  const purchaseOrdersData = purchaseOrders || [];
  
  // Filter function for purchase orders
  const filteredPurchaseOrders = Array.isArray(purchaseOrdersData) ? purchaseOrdersData.filter((po: any) => {
    // Handle potential undefined values safely
    const poNumber = po.purchase_order_number || '';
    const poTitle = po.title || ''; // Using title field from database
    const poVendorName = po.vendor_name || '';
    const poStatus = po.status || '';
    const poProjectCode = po.project_code || '';
    
    // Check if any item description matches the search term
    const itemDescriptionMatches = po.items && Array.isArray(po.items) && po.items.some((item: any) => {
      const itemDescription = item.description || item.name || '';
      return itemDescription.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    const matchesSearch = 
      poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      poTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      poVendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itemDescriptionMatches; // Add item description matching
    
    const matchesProject = projectFilter && projectFilter !== "all" ? poProjectCode === projectFilter : true;
    const matchesStatus = statusFilter && statusFilter !== "all" ? poStatus === statusFilter : true;
    
    return matchesSearch && matchesProject && matchesStatus;
  }) : [];

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (poToDelete) {
      deletePOMutation.mutate(poToDelete);
    }
  };
  
  // Handle edit button click
  const handleEditPO = async (po: any) => {
    try {
      // Fetch the full purchase order with items
      const response = await fetch(`/api/procurement/purchase-orders/${po.id}`);
      if (!response.ok) {
        throw new Error(`Error fetching purchase order: ${response.statusText}`);
      }
      
      const fullPO = await response.json();
      setEditingPO(fullPO);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("Error fetching purchase order details:", error);
      toast({
        title: "Error",
        description: "Could not fetch purchase order details. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Handle save edit 
  const handleSaveEdit = () => {
    if (editingPO) {
      console.log("Submitting for update:", editingPO);
      // Add basic validation
      const items = editingPO.items || [];
      if (Array.isArray(items)) {
        const invalidItems = items.filter(item => 
          !item.item_code && !item.description && !item.quantity
        );
        if (invalidItems.length > 0) {
          console.warn("Found invalid items:", invalidItems);
          toast({
            title: "Invalid items",
            description: "Please complete all item fields or remove empty items",
            variant: "destructive",
          });
          return;
        }
      }
      updatePOMutation.mutate(editingPO);
    } else {
      console.error("No PO selected for editing");
    }
  };

  const statusBadgeMap: Record<string, JSX.Element> = {
    draft: <Badge variant="outline" className="bg-gray-100 text-gray-800">Draft</Badge>,
    submitted: <Badge variant="outline" className="bg-blue-100 text-blue-800">Submitted</Badge>,
    approved: <Badge variant="outline" className="bg-green-100 text-green-800">Approved</Badge>,
    ordered: <Badge variant="outline" className="bg-purple-100 text-purple-800">Ordered</Badge>,
    shipped: <Badge variant="outline" className="bg-indigo-100 text-indigo-800">Shipped</Badge>,
    partially_received: <Badge variant="outline" className="bg-amber-100 text-amber-800">Partially Received</Badge>,
    received: <Badge variant="outline" className="bg-teal-100 text-teal-800">Received</Badge>,
    on_hold: <Badge variant="outline" className="bg-yellow-100 text-yellow-800">On Hold</Badge>,
    cancelled: <Badge variant="outline" className="bg-red-100 text-red-800">Cancelled</Badge>,
  };

  const itemStatusIconMap: Record<string, JSX.Element> = {
    pending: <Clock className="h-4 w-4 text-gray-500" />,
    in_production: <Loader2 className="h-4 w-4 text-blue-500" />,
    shipped: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    partial: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    received: <CheckCircle className="h-4 w-4 text-green-500" />,
  };

  return (
    <Layout>
      <Helmet>
        <title>Procurement Tracking | ThermoPac</title>
      </Helmet>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Procurement Tracking</h1>
            <p className="text-muted-foreground">
              Track and manage your purchase orders and deliveries
            </p>
          </div>
        </div>
        
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Orders</TabsTrigger>
            <TabsTrigger value="ordered">Ordered</TabsTrigger>
            <TabsTrigger value="shipped">Shipped</TabsTrigger>
            <TabsTrigger value="received">Received</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-0">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Purchase Order Tracking</CardTitle>
                <CardDescription>
                  Monitor status and delivery of your purchase orders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 mb-4">
                  <div className="flex items-center w-full sm:w-1/3 relative">
                    <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search orders..."
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
                        {Array.isArray(projects) && projects.map((project: any) => (
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
                        <SelectItem value="ordered">Ordered</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="partially_received">Partially Received</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
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
                          <TableHead className="w-[180px]">PO Number</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Est. Delivery</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
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
                              <TableCell className="font-medium">{po.purchase_order_number || ''}</TableCell>
                              <TableCell>
                                {po.items && Array.isArray(po.items) && po.items.length > 0 
                                  ? po.items[0].description || po.title || ''
                                  : po.title || ''}
                              </TableCell>
                              <TableCell>{po.vendor_name || ''}</TableCell>
                              <TableCell>
                                {statusBadgeMap[po.status] || '-'}
                              </TableCell>
                              <TableCell>
                                {po.required_by_date || ''}
                                {po.actual_delivery_date && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Actual: {po.actual_delivery_date}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={po.progress || 0} className="h-2 w-[100px]" />
                                  <span className="text-xs">{po.progress || 0}%</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Sheet>
                                    <SheetTrigger asChild>
                                      <Button variant="ghost" size="sm">
                                        Details
                                      </Button>
                                    </SheetTrigger>
                                    <SheetContent>
                                      <SheetHeader>
                                        <SheetTitle>Purchase Order Details</SheetTitle>
                                        <SheetDescription>
                                          {po.purchase_order_number || ''} - {po.title || ''}
                                        </SheetDescription>
                                      </SheetHeader>
                                      <div className="py-4">
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                          <div>
                                            <h4 className="text-sm font-medium">Project</h4>
                                            <p className="text-sm">{po.project_code || ''}</p>
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-medium">Vendor</h4>
                                            <p className="text-sm">{po.vendor_name || ''}</p>
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-medium">Status</h4>
                                            <div className="mt-1">{statusBadgeMap[po.status] || '-'}</div>
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-medium">Tracking Number</h4>
                                            <p className="text-sm">{po.tracking_number || "N/A"}</p>
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-medium">Est. Delivery</h4>
                                            <p className="text-sm">{po.required_by_date || ''}</p>
                                          </div>
                                          <div>
                                            <h4 className="text-sm font-medium">Actual Delivery</h4>
                                            <p className="text-sm">{po.actual_delivery_date || "Pending"}</p>
                                          </div>
                                        </div>
                                        
                                        <Separator className="my-4" />
                                        
                                        <h4 className="text-sm font-medium mb-2">Order Items</h4>
                                        <div className="rounded-md border mb-4">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Qty</TableHead>
                                                <TableHead>Unit</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Received</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {po.items && Array.isArray(po.items) && po.items.length > 0 ? (
                                                po.items.map((item: any) => (
                                                  <TableRow key={item.id}>
                                                    <TableCell className="font-medium">{item.description || item.name || item.item_code || ''}</TableCell>
                                                    <TableCell>{item.quantity}</TableCell>
                                                    <TableCell>{item.unit}</TableCell>
                                                    <TableCell>
                                                      <div className="flex items-center gap-1">
                                                        {itemStatusIconMap[item.status]}
                                                        <span className="text-xs capitalize">
                                                          {item.status?.replace("_", " ") || "pending"}
                                                        </span>
                                                      </div>
                                                    </TableCell>
                                                    <TableCell>
                                                      {item.receivedQuantity || 0}/{item.quantity || 0}
                                                    </TableCell>
                                                  </TableRow>
                                                ))
                                              ) : (
                                                <TableRow>
                                                  <TableCell colSpan={5} className="h-12 text-center text-muted-foreground">
                                                    No items available for this purchase order
                                                  </TableCell>
                                                </TableRow>
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                        
                                        <div className="flex flex-col gap-2">
                                          <Button size="sm" variant="outline" className="flex gap-2 justify-center">
                                            <FileText className="h-4 w-4" />
                                            View Documents
                                          </Button>
                                          
                                          {po.status === "shipped" && (
                                            <Button 
                                              size="sm" 
                                              className="flex gap-2 justify-center"
                                              onClick={() => updatePOStatusMutation.mutate({ id: po.id, status: "received" })}
                                            >
                                              <CheckCircle className="h-4 w-4" />
                                              Mark as Received
                                            </Button>
                                          )}
                                          
                                          {po.status === "partially_received" && (
                                            <Button 
                                              size="sm" 
                                              className="flex gap-2 justify-center"
                                              onClick={() => updatePOStatusMutation.mutate({ id: po.id, status: "received" })}
                                            >
                                              <CheckCircle className="h-4 w-4" />
                                              Update Received Items
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <SheetFooter>
                                        <SheetClose asChild>
                                          <Button variant="outline">Close</Button>
                                        </SheetClose>
                                      </SheetFooter>
                                    </SheetContent>
                                  </Sheet>

                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="text-blue-600 hover:text-blue-800"
                                    onClick={() => handleEditPO(po)}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    Edit
                                  </Button>

                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="text-red-600 hover:text-red-800"
                                    onClick={() => setPoToDelete(po.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
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
                  Showing {filteredPurchaseOrders.length} of {Array.isArray(purchaseOrdersData) ? purchaseOrdersData.length : 0} purchase orders
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                  <Button variant="outline" size="sm" disabled>Next</Button>
                </div>
              </CardFooter>
            </Card>
          </TabsContent>
          
          {["ordered", "shipped", "received"].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>{tab.charAt(0).toUpperCase() + tab.slice(1)} Purchase Orders</CardTitle>
                  <CardDescription>
                    Viewing purchase orders with status: {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center w-full sm:w-1/3 relative mb-4">
                    <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search orders..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Separator className="my-4" />
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">PO Number</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Est. Delivery</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchaseOrders
                          .filter((po: any) => 
                            tab === "ordered" ? po.status === "ordered" : 
                            tab === "shipped" ? po.status === "shipped" : 
                            ["received", "partially_received"].includes(po.status)
                          )
                          .length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                              No {tab} purchase orders found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredPurchaseOrders
                            .filter((po: any) => 
                              tab === "ordered" ? po.status === "ordered" : 
                              tab === "shipped" ? po.status === "shipped" : 
                              ["received", "partially_received"].includes(po.status)
                            )
                            .map((po: any) => (
                              <TableRow key={po.id}>
                                <TableCell className="font-medium">{po.purchase_order_number || ''}</TableCell>
                                <TableCell>
                                  {po.items && Array.isArray(po.items) && po.items.length > 0 
                                    ? po.items[0].description || po.title || ''
                                    : po.title || ''}
                                </TableCell>
                                <TableCell>{po.vendor_name || ''}</TableCell>
                                <TableCell>
                                  {po.required_by_date || ''}
                                  {po.actual_delivery_date && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Actual: {po.actual_delivery_date}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={po.progress || 0} className="h-2 w-[100px]" />
                                    <span className="text-xs">{po.progress || 0}%</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex space-x-2">
                                    <Button variant="ghost" size="sm">
                                      Details
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      className="text-blue-600 hover:text-blue-800"
                                      onClick={() => handleEditPO(po)}
                                    >
                                      <Edit className="h-4 w-4 mr-1" />
                                      Edit
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      className="text-red-600 hover:text-red-800"
                                      onClick={() => setPoToDelete(po.id)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      Delete
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={poToDelete !== null} onOpenChange={(open) => !open && setPoToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this purchase order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => setPoToDelete(null)}
              disabled={deletePOMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteConfirm}
              disabled={deletePOMutation.isPending}
            >
              {deletePOMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit PO Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={(open) => !open && setIsEditModalOpen(false)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Edit Purchase Order</DialogTitle>
            <DialogDescription>
              Make changes to the purchase order details below.
            </DialogDescription>
          </DialogHeader>
          
          {editingPO && (
            <>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">PO Number</label>
                  <Input 
                    value={editingPO.purchase_order_number || ''} 
                    onChange={(e) => setEditingPO({...editingPO, purchase_order_number: e.target.value})}
                    disabled
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Project</label>
                  <Input 
                    value={editingPO.project_code || ''} 
                    onChange={(e) => setEditingPO({...editingPO, project_code: e.target.value})}
                    disabled
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input 
                    value={editingPO.title || ''} 
                    onChange={(e) => setEditingPO({...editingPO, title: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vendor</label>
                  <Input 
                    value={editingPO.vendor_name || ''} 
                    onChange={(e) => setEditingPO({...editingPO, vendor_name: e.target.value})}
                    disabled
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select 
                    value={editingPO.status || ''}
                    onValueChange={(value) => setEditingPO({...editingPO, status: value})}
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
                      <SelectItem value="partially_received">Partially Received</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Required By Date</label>
                  <Input 
                    type="date"
                    value={editingPO.required_by_date || ''} 
                    onChange={(e) => setEditingPO({...editingPO, required_by_date: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Actual Delivery Date</label>
                  <Input 
                    type="date"
                    value={editingPO.actual_delivery_date || ''} 
                    onChange={(e) => setEditingPO({...editingPO, actual_delivery_date: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tracking Number</label>
                  <Input 
                    value={editingPO.tracking_number || ''} 
                    onChange={(e) => setEditingPO({...editingPO, tracking_number: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Progress (%)</label>
                  <Input 
                    type="number"
                    min="0"
                    max="100"
                    value={editingPO.progress || 0} 
                    onChange={(e) => setEditingPO({...editingPO, progress: parseInt(e.target.value) || 0})}
                  />
                </div>
                
                <div className="space-y-2 col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input 
                    value={editingPO.notes || ''} 
                    onChange={(e) => setEditingPO({...editingPO, notes: e.target.value})}
                  />
                </div>
              </div>
              
              {/* Purchase Order Items */}
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-4">Purchase Order Items</h3>
                <div className="rounded-md border mb-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/5">Item Code</TableHead>
                        <TableHead className="w-2/5">Description</TableHead>
                        <TableHead className="w-1/10">Quantity</TableHead>
                        <TableHead className="w-1/10">UOM</TableHead>
                        <TableHead className="w-1/5">Drawing No</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingPO.items && Array.isArray(editingPO.items) && editingPO.items.length > 0 ? (
                        editingPO.items.map((item: any, index: number) => (
                          <TableRow key={item.id || index}>
                            <TableCell>
                              <Input 
                                value={item.item_code || item.code || ''} 
                                className="w-full text-red-600"
                                disabled
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                value={item.description || item.name || ''} 
                                className="w-full text-red-600"
                                disabled
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                type="number"
                                min="1"
                                value={item.quantity || 0} 
                                className="w-full text-red-600"
                                disabled
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                value={item.uom || item.unit || ''} 
                                className="w-full text-red-600"
                                disabled
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                value={item.drawing_no || ''} 
                                className="w-full text-red-600"
                                disabled
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-12 text-center text-muted-foreground">
                            No items available for this purchase order
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
          
          <DialogFooter className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => setIsEditModalOpen(false)}
              disabled={updatePOMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              variant="default" 
              onClick={handleSaveEdit}
              disabled={updatePOMutation.isPending}
            >
              {updatePOMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
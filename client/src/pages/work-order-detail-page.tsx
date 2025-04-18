import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Edit, CheckCircle2, Hourglass, AlertTriangle, XCircle, Printer, FileSpreadsheet, Clock, FileEdit, MessageSquare, AlertCircle, RotateCcw } from "lucide-react";
import Layout from "@/components/layout";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Fetch work order details
  const { 
    data: workOrder, 
    isLoading: isLoadingWorkOrder,
    error: workOrderError
  } = useQuery<any>({
    queryKey: ['/api/production/work-orders', workOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/production/work-orders/${workOrderId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch work order");
      }
      return response.json();
    },
    enabled: !isNaN(workOrderId),
  });
  
  // Fetch work order items
  const { 
    data: workOrderItems = [], 
    isLoading: isLoadingItems,
    error: itemsError
  } = useQuery<any[]>({
    queryKey: ['/api/production/work-orders', workOrderId, 'items'],
    queryFn: async () => {
      const response = await fetch(`/api/production/work-orders/${workOrderId}/items`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch work order items");
      }
      return response.json();
    },
    enabled: !isNaN(workOrderId),
  });
  
  // Fetch work order history
  const { 
    data: workOrderHistory = [], 
    isLoading: isLoadingHistory,
    error: historyError
  } = useQuery<any[]>({
    queryKey: ['/api/production/work-orders', workOrderId, 'history'],
    queryFn: async () => {
      const response = await fetch(`/api/production/work-orders/${workOrderId}/history`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch work order history");
      }
      return response.json();
    },
    enabled: !isNaN(workOrderId),
  });
  
  // Helper function to render status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "planned":
        return <Badge variant="outline" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> Planned</Badge>;
      case "in_progress":
        return <Badge variant="secondary" className="flex items-center gap-1"><Hourglass className="h-3 w-3" /> In Progress</Badge>;
      case "on_hold":
        return <Badge variant="outline" className="flex items-center gap-1 bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> On Hold</Badge>;
      case "completed":
        return <Badge variant="outline" className="flex items-center gap-1 bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
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

  // Error handling
  useEffect(() => {
    if (workOrderError || itemsError) {
      toast({
        title: "Error",
        description: "Failed to load work order data. Please try again.",
        variant: "destructive",
      });
    }
  }, [workOrderError, itemsError, toast]);

  if (isLoadingWorkOrder) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!workOrder && !isLoadingWorkOrder) {
    return (
      <Layout>
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-red-600">Work Order Not Found</h2>
          <p className="mt-2 text-gray-600">
            The requested work order could not be found.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/production-planning")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Production Planning
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>{workOrder?.workOrderNumber || "Work Order"} | Thermopac</title>
      </Helmet>
      
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/production-planning")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <h1 className="text-3xl font-bold">{workOrder?.workOrderNumber}</h1>
            {workOrder?.status && getStatusBadge(workOrder.status)}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/production/work-orders/${workOrderId}/edit`)}
            >
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
            >
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                toast({
                  title: "Export",
                  description: "Export functionality is not implemented yet.",
                });
              }}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        </div>
        
        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="items">Items ({workOrderItems.length})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Information</CardTitle>
                <CardDescription>
                  Detailed information about the work order.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Work Order Number</h3>
                    <p className="font-semibold">{workOrder?.workOrderNumber}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Title</h3>
                    <p className="font-semibold">{workOrder?.title}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Project Code</h3>
                    <p className="font-semibold">{workOrder?.projectCode}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                    <div>{workOrder?.status && getStatusBadge(workOrder.status)}</div>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Priority</h3>
                    <div>{workOrder?.priority && getPriorityBadge(workOrder.priority)}</div>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Production Line</h3>
                    <p className="font-semibold">{workOrder?.productionLine || "Not specified"}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Planned Start Date</h3>
                    <p className="font-semibold">
                      {workOrder?.plannedStartDate ? format(new Date(workOrder.plannedStartDate), 'dd MMM yyyy') : "Not specified"}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Planned End Date</h3>
                    <p className="font-semibold">
                      {workOrder?.plannedEndDate ? format(new Date(workOrder.plannedEndDate), 'dd MMM yyyy') : "Not specified"}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Batch Number</h3>
                    <p className="font-semibold">{workOrder?.batchNumber || "Not specified"}</p>
                  </div>
                </div>
                
                <Separator className="my-6" />
                
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                  <p className="text-sm">
                    {workOrder?.description || "No description provided."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="items" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Work Order Items</CardTitle>
                <CardDescription>
                  List of items to be manufactured in this work order.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingItems ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : workOrderItems.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-gray-500">No items found for this work order.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Seq #</TableHead>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workOrderItems.map((item: any) => {
                          // Use the masterItem data from our enhanced API
                          const isVirtualComponent = item.isVirtual || (item.notes && item.notes.includes('Virtual component:'));
                          
                          // Get item code and description from masterItem if available,
                          // otherwise fall back to projectItem or extraction from notes
                          let itemCode = "Unknown";
                          let itemDescription = "Unknown";
                          
                          if (item.masterItem) {
                            // Use the masterItem data that comes directly from the API
                            itemCode = item.masterItem.itemCode;
                            itemDescription = item.masterItem.description;
                          } else if (item.projectItem?.itemCode) {
                            // Fallback to projectItem if masterItem isn't available
                            itemCode = item.projectItem.itemCode;
                            itemDescription = item.projectItem.description || "Unknown";
                          } else if (isVirtualComponent && item.notes) {
                            // Last resort - extract from notes for legacy data
                            const match = item.notes.match(/Virtual component: ([^-]+) - ([^(]+)/);
                            if (match && match.length >= 3) {
                              itemCode = match[1].trim();
                              itemDescription = match[2].trim();
                            }
                          }
                          
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{item.sequenceNumber}</TableCell>
                              <TableCell className="font-medium">
                                {itemCode}
                                {isVirtualComponent && (
                                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                    Virtual
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {itemDescription}
                              </TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{getStatusBadge(item.status || "pending")}</TableCell>
                              <TableCell className="max-w-md truncate">
                                {isVirtualComponent 
                                  ? "Virtual component (not added to project items)" 
                                  : (item.notes || "No notes")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Work Order History</CardTitle>
                <CardDescription>
                  Timeline of changes and activities for this work order.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-10">
                  <p className="text-gray-500">Work order history is not implemented yet.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
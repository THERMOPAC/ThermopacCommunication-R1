import { useState } from "react";
import { Helmet } from "react-helmet";
import { Loader2, CheckCircle, Clock, AlertTriangle, Search, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

export default function ProcurementTrackingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Mock data - will be replaced with actual data once API is implemented
  const projects = [
    { id: 1, code: "2526-1", name: "NTPC Ramagundam" },
    { id: 2, code: "2526-2", name: "NTPC Simhadri" },
    { id: 3, code: "2526-3", name: "ISGEC Heavy Engineering" },
  ];

  // Placeholder query - will be replaced with actual API call
  const { data: purchaseOrders, isLoading, error } = useQuery({
    queryKey: ["/api/purchase-orders/tracking"],
    enabled: false, // Disable the query for now until we implement the API
  });

  // Mock purchase orders data
  const mockPurchaseOrders = [
    {
      id: 1,
      purchaseOrderNumber: "PO-2526-1-001",
      title: "Raw Materials for Heat Exchanger",
      projectCode: "2526-1",
      vendorName: "Steel Suppliers Ltd.",
      status: "ordered",
      estimatedDeliveryDate: "2025-05-15",
      actualDeliveryDate: null,
      trackingNumber: "ST123456789",
      progress: 25,
      totalAmount: 125000,
      items: [
        { id: 1, name: "Steel Plates", quantity: 20, unit: "EA", status: "in_production", receivedQuantity: 0 },
        { id: 2, name: "Copper Tubes", quantity: 50, unit: "MTR", status: "shipped", receivedQuantity: 0 },
      ]
    },
    {
      id: 2,
      purchaseOrderNumber: "PO-2526-1-002",
      title: "Pressure Gauges and Sensors",
      projectCode: "2526-1",
      vendorName: "Precision Instruments Inc.",
      status: "shipped",
      estimatedDeliveryDate: "2025-05-10",
      actualDeliveryDate: null,
      trackingNumber: "PI987654321",
      progress: 75,
      totalAmount: 42500,
      items: [
        { id: 3, name: "Pressure Gauges", quantity: 10, unit: "EA", status: "shipped", receivedQuantity: 0 },
        { id: 4, name: "Temperature Sensors", quantity: 15, unit: "EA", status: "shipped", receivedQuantity: 0 },
      ]
    },
    {
      id: 3,
      purchaseOrderNumber: "PO-2526-2-001",
      title: "Pump Components",
      projectCode: "2526-2",
      vendorName: "Flow Systems Corp.",
      status: "partially_received",
      estimatedDeliveryDate: "2025-04-20",
      actualDeliveryDate: "2025-04-22",
      trackingNumber: "FS567891234",
      progress: 60,
      totalAmount: 78900,
      items: [
        { id: 5, name: "Pump Impellers", quantity: 5, unit: "EA", status: "received", receivedQuantity: 5 },
        { id: 6, name: "Shaft Seals", quantity: 10, unit: "EA", status: "partial", receivedQuantity: 6 },
        { id: 7, name: "Bearings", quantity: 20, unit: "EA", status: "pending", receivedQuantity: 0 },
      ]
    },
  ];

  // Filter function for mock data
  const filteredPurchaseOrders = mockPurchaseOrders.filter((po) => {
    const matchesSearch = 
      po.purchaseOrderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendorName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProject = projectFilter && projectFilter !== "all" ? po.projectCode === projectFilter : true;
    const matchesStatus = statusFilter && statusFilter !== "all" ? po.status === statusFilter : true;
    
    return matchesSearch && matchesProject && matchesStatus;
  });

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
    <>
      <Helmet>
        <title>Procurement Tracking | ThermoPac</title>
      </Helmet>

      <div className="flex flex-col gap-6 p-4 lg:p-8">
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
                          <TableHead>PO Number</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Est. Delivery</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Actions</TableHead>
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
                          filteredPurchaseOrders.map((po) => (
                            <TableRow key={po.id}>
                              <TableCell className="font-medium">{po.purchaseOrderNumber}</TableCell>
                              <TableCell>{po.title}</TableCell>
                              <TableCell>{po.vendorName}</TableCell>
                              <TableCell>
                                {statusBadgeMap[po.status]}
                              </TableCell>
                              <TableCell>
                                {po.estimatedDeliveryDate}
                                {po.actualDeliveryDate && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Actual: {po.actualDeliveryDate}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={po.progress} className="h-2 w-[100px]" />
                                  <span className="text-xs">{po.progress}%</span>
                                </div>
                              </TableCell>
                              <TableCell>
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
                                        {po.purchaseOrderNumber} - {po.title}
                                      </SheetDescription>
                                    </SheetHeader>
                                    <div className="py-4">
                                      <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                          <h4 className="text-sm font-medium">Project</h4>
                                          <p className="text-sm">{po.projectCode}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Vendor</h4>
                                          <p className="text-sm">{po.vendorName}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Status</h4>
                                          <div className="mt-1">{statusBadgeMap[po.status]}</div>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Tracking Number</h4>
                                          <p className="text-sm">{po.trackingNumber || "N/A"}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Est. Delivery</h4>
                                          <p className="text-sm">{po.estimatedDeliveryDate}</p>
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-medium">Actual Delivery</h4>
                                          <p className="text-sm">{po.actualDeliveryDate || "Pending"}</p>
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
                                            {po.items.map((item) => (
                                              <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell>{item.quantity}</TableCell>
                                                <TableCell>{item.unit}</TableCell>
                                                <TableCell>
                                                  <div className="flex items-center gap-1">
                                                    {itemStatusIconMap[item.status]}
                                                    <span className="text-xs capitalize">
                                                      {item.status.replace("_", " ")}
                                                    </span>
                                                  </div>
                                                </TableCell>
                                                <TableCell>
                                                  {item.receivedQuantity}/{item.quantity}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                      
                                      <div className="flex flex-col gap-2">
                                        <Button size="sm" variant="outline" className="flex gap-2 justify-center">
                                          <FileText className="h-4 w-4" />
                                          View Documents
                                        </Button>
                                        
                                        {po.status === "shipped" && (
                                          <Button size="sm" className="flex gap-2 justify-center">
                                            <CheckCircle className="h-4 w-4" />
                                            Mark as Received
                                          </Button>
                                        )}
                                        
                                        {po.status === "partially_received" && (
                                          <Button size="sm" className="flex gap-2 justify-center">
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
                  Showing {filteredPurchaseOrders.length} of {mockPurchaseOrders.length} purchase orders
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
                          <TableHead>PO Number</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Est. Delivery</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchaseOrders
                          .filter(po => 
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
                            .filter(po => 
                              tab === "ordered" ? po.status === "ordered" : 
                              tab === "shipped" ? po.status === "shipped" : 
                              ["received", "partially_received"].includes(po.status)
                            )
                            .map((po) => (
                              <TableRow key={po.id}>
                                <TableCell className="font-medium">{po.purchaseOrderNumber}</TableCell>
                                <TableCell>{po.title}</TableCell>
                                <TableCell>{po.vendorName}</TableCell>
                                <TableCell>
                                  {po.estimatedDeliveryDate}
                                  {po.actualDeliveryDate && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Actual: {po.actualDeliveryDate}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={po.progress} className="h-2 w-[100px]" />
                                    <span className="text-xs">{po.progress}%</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm">
                                    Details
                                  </Button>
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
    </>
  );
}
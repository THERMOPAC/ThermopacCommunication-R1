import { useState } from "react";
import { Helmet } from "react-helmet";
import { Loader2 } from "lucide-react";
import Layout from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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

  // Mock data - will be replaced with actual data once API is implemented
  const projects = [
    { id: 1, code: "2526-1", name: "NTPC Ramagundam" },
    { id: 2, code: "2526-2", name: "NTPC Simhadri" },
    { id: 3, code: "2526-3", name: "ISGEC Heavy Engineering" },
  ];

  // Fetch purchase orders from the API
  const { data: purchaseOrders, isLoading, error } = useQuery({
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
                        {projects.map((project) => (
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
                        <SelectItem value="vendor1">Steel Suppliers Ltd.</SelectItem>
                        <SelectItem value="vendor2">Precision Instruments Inc.</SelectItem>
                        <SelectItem value="vendor3">Flow Systems Corp.</SelectItem>
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
                      filteredPurchaseOrders.map((po) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.purchaseOrderNumber}</TableCell>
                          <TableCell>{po.title}</TableCell>
                          <TableCell>{po.projectCode}</TableCell>
                          <TableCell>{po.vendorName}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColorMap[po.status]}`}>
                              {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell>{po.requiredByDate}</TableCell>
                          <TableCell className="text-right">₹{po.totalAmount.toLocaleString()}</TableCell>
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
      </div>
    </Layout>
  );
}
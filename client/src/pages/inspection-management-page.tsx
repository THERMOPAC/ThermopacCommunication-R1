import React, { useState } from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileCheck, 
  ClipboardCheck, 
  Search, 
  Filter, 
  PlusCircle,
  Eye,
  Edit2,
  Loader2,
  BarChart3,
  FileOutput
} from "lucide-react";
import InspectionDashboard from "@/components/inspection/dashboard";
import InspectionExport from "@/components/inspection/export";

export default function InspectionManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  // Fetch projects for dropdown
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
  });
  
  // Fetch inspection orders for the selected project
  const {
    data: inspectionOrders = [],
    isLoading: isLoadingInspectionOrders,
  } = useQuery<Array<{
    id: number;
    inspectionOrderNumber: string;
    title: string;
    inspectionType: string;
    status: string;
    createdAt: string;
    itemCode?: string;
    description?: string;
    quantity: number;
    unit: string;
    drawingNo?: string;
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
  
  // Filter inspection orders based on search text and status filter
  const filteredOrders = inspectionOrders.filter(order => {
    const matchesSearch = !searchText || 
      order.inspectionOrderNumber.toLowerCase().includes(searchText.toLowerCase()) ||
      order.title.toLowerCase().includes(searchText.toLowerCase()) ||
      (order.itemCode && order.itemCode.toLowerCase().includes(searchText.toLowerCase())) ||
      (order.description && order.description.toLowerCase().includes(searchText.toLowerCase()));
    
    const matchesStatus = !statusFilter || statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  // Get status badge color based on status
  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">In Progress</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  return (
    <Layout>
      <Helmet>
        <title>Inspection Management | Thermopac ERP</title>
      </Helmet>
      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inspection Management</h1>
          <p className="text-muted-foreground">
            Manage and track inspection orders across all projects
          </p>
        </div>
      </div>
      
      <Tabs defaultValue="orders" className="mb-6">
        <TabsList>
          <TabsTrigger value="orders">Inspection Orders</TabsTrigger>
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="schedule">Inspection Schedule</TabsTrigger>
          <TabsTrigger value="reports">Inspection Reports</TabsTrigger>
          <TabsTrigger value="export">
            <FileOutput className="h-4 w-4 mr-2" />
            Export
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Inspection Orders</CardTitle>
                  <CardDescription>
                    Manage inspection orders for quality control
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast({ title: "Feature coming soon" })}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    New Order
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="flex items-center gap-2 w-full max-w-lg">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="project-select">Project</Label>
                    <Select 
                      value={selectedProject?.toString() || ""}
                      onValueChange={(value) => {
                        setSelectedProject(value ? parseInt(value) : null);
                      }}
                    >
                      <SelectTrigger id="project-select">
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
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="status-filter">Status</Label>
                    <Select 
                      value={statusFilter || ""}
                      onValueChange={(value) => {
                        setStatusFilter(value || null);
                      }}
                    >
                      <SelectTrigger id="status-filter">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search orders..."
                    className="pl-8"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
              </div>
              
              {isLoadingProjects || isLoadingInspectionOrders ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !selectedProject ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="mx-auto h-12 w-12 mb-4 text-muted-foreground/80" />
                  <h3 className="text-lg font-medium mb-2">No Project Selected</h3>
                  <p>Select a project to view its inspection orders.</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardCheck className="mx-auto h-12 w-12 mb-4 text-muted-foreground/80" />
                  <h3 className="text-lg font-medium mb-2">No Inspection Orders Found</h3>
                  <p>No inspection orders match your current filters.</p>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Inspection Type</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.inspectionOrderNumber}</TableCell>
                          <TableCell>{order.itemCode || "-"}</TableCell>
                          <TableCell className="max-w-xs truncate">{order.description || order.title}</TableCell>
                          <TableCell>{order.inspectionType.replace('_', ' ')}</TableCell>
                          <TableCell>{order.quantity} {order.unit}</TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  window.location.href = `/inspections?orderId=${order.id}`;
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  window.location.href = `/inspections?edit=${order.id}`;
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
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
        </TabsContent>
        
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>Inspection Schedule</CardTitle>
              <CardDescription>
                Plan and schedule upcoming inspection activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileCheck className="h-12 w-12 mb-4" />
                <h3 className="text-lg font-medium mb-2">Inspection Schedule Coming Soon</h3>
                <p>This feature is currently under development.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Inspection Reports</CardTitle>
              <CardDescription>
                Track and manage inspection result reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileCheck className="h-12 w-12 mb-4" />
                <h3 className="text-lg font-medium mb-2">Inspection Reports Coming Soon</h3>
                <p>This feature is currently under development.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <CardTitle>Inspection Analytics Dashboard</CardTitle>
              <CardDescription>
                Key metrics and analytics for inspection management
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedProject ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="mx-auto h-12 w-12 mb-4 text-muted-foreground/80" />
                  <h3 className="text-lg font-medium mb-2">No Project Selected</h3>
                  <p>Select a project to view its inspection analytics.</p>
                </div>
              ) : (
                <InspectionDashboard projectId={selectedProject} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>Export & Reporting</CardTitle>
              <CardDescription>
                Generate and export inspection reports and documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedProject ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileOutput className="mx-auto h-12 w-12 mb-4 text-muted-foreground/80" />
                  <h3 className="text-lg font-medium mb-2">No Project Selected</h3>
                  <p>Select a project to export inspection data and reports.</p>
                </div>
              ) : (
                <InspectionExport projectId={selectedProject} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
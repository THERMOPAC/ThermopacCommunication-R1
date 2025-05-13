import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, ChevronRight, Check, Activity, Clock, Users, Settings, Search, 
         ChevronDown, ChevronUp, Download, FileSpreadsheet, Save } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

// Define WorkOrder type
interface WorkOrder {
  id: number;
  projectId: number; 
  workOrderNumber: string;
  title: string;
  description: string | null;
  status: 'planned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  priority: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  productionLine: string | null;
  batchNumber: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

// Define Team type
interface Team {
  name: string;
  workload: number;
  activeOrders: number;
}

// Status color mapping for visual indicators
const statusColors: Record<string, string> = {
  planned: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  on_hold: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800"
};

// Configuration settings interface
interface ConfigSettings {
  // View settings
  autoRefreshInterval: number; // in seconds
  showCompletedOrders: boolean;
  showCancelledOrders: boolean;
  defaultSortField: string;
  defaultSortOrder: 'asc' | 'desc';
  
  // Notification settings
  alertOnHighPriority: boolean;
  alertOnDelay: boolean;
  alertOnCompletion: boolean;
  
  // Production settings
  enableResourceTracking: boolean;
  maxTeamWorkload: number; // percentage
  allowAutoAssignment: boolean;
}

export default function ShopFloorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("active");
  const [isExpanded, setIsExpanded] = useState(false); // Default collapsed
  const [searchTerm, setSearchTerm] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  
  // Shop floor configuration settings with default values
  const [config, setConfig] = useState<ConfigSettings>({
    // View settings
    autoRefreshInterval: 60, // 60 seconds
    showCompletedOrders: true,
    showCancelledOrders: false,
    defaultSortField: "workOrderNumber",
    defaultSortOrder: "asc",
    
    // Notification settings
    alertOnHighPriority: true,
    alertOnDelay: true,
    alertOnCompletion: false,
    
    // Production settings
    enableResourceTracking: true,
    maxTeamWorkload: 85, // 85% maximum workload
    allowAutoAssignment: false
  });

  // Fetch all active work orders
  const { data: workOrders, isLoading, isError, error } = useQuery<WorkOrder[]>({
    queryKey: ["/api/production/work-orders"],
    refetchInterval: 60000, // Refresh every minute
    retry: 1, // Only retry once to avoid excessive failed requests
  });

  // Fetch all production teams and resources
  const { data: resources } = useQuery({
    queryKey: ["/api/production/resources"],
    enabled: false, // This is a placeholder as we don't have the endpoint yet
  });

  // Calculate work order progress
  const getWorkOrderProgress = (status: string): number => {
    switch (status) {
      case "planned": return 10;
      case "in_progress": return 50;
      case "on_hold": return 30;
      case "completed": return 100;
      case "cancelled": return 0;
      default: return 0;
    }
  };

  // Filter work orders by status, search term and sort by project order
  const getFilteredWorkOrders = (): WorkOrder[] => {
    if (!workOrders) return [];
    
    // First filter by status
    let filteredOrders: WorkOrder[] = [];
    switch (activeTab) {
      case "active":
        filteredOrders = workOrders.filter(wo => wo.status === "in_progress" || wo.status === "planned");
        break;
      case "completed":
        filteredOrders = workOrders.filter(wo => wo.status === "completed");
        break;
      case "onhold":
        filteredOrders = workOrders.filter(wo => wo.status === "on_hold");
        break;
      case "all":
        filteredOrders = workOrders;
        break;
      default:
        filteredOrders = workOrders;
    }
    
    // Then filter by search term if provided
    if (searchTerm.trim() !== "") {
      const searchTermLower = searchTerm.toLowerCase();
      filteredOrders = filteredOrders.filter(wo => 
        wo.workOrderNumber.toLowerCase().includes(searchTermLower) || 
        wo.title.toLowerCase().includes(searchTermLower) ||
        (wo.description && wo.description.toLowerCase().includes(searchTermLower)) ||
        (wo.batchNumber && wo.batchNumber.toLowerCase().includes(searchTermLower))
      );
    }
    
    // Sort by Project ID and then by work order number
    return filteredOrders.sort((a, b) => {
      // First sort by project ID
      if (a.projectId !== b.projectId) {
        return a.projectId - b.projectId;
      }
      
      // If same project, sort by work order number
      return a.workOrderNumber.localeCompare(b.workOrderNumber);
    });
  };

  // Production teams data (mock data for now)
  const productionTeams: Team[] = [
    { name: "Production Team-1", workload: 80, activeOrders: 3 },
    { name: "Production Team-2", workload: 45, activeOrders: 2 },
    { name: "Production Team-3", workload: 90, activeOrders: 4 },
    { name: "Production Team-4", workload: 30, activeOrders: 1 },
    { name: "Production Team-5", workload: 0, activeOrders: 0 },
  ];
  
  // Function to generate and download work orders report
  const generateReport = async () => {
    try {
      // Don't proceed if there's no data
      if (!workOrders || workOrders.length === 0) {
        toast({
          title: "No data available",
          description: "There are no work orders to include in the report.",
          variant: "destructive",
        });
        return;
      }

      setIsGeneratingReport(true);
      
      // Get filtered work orders based on current tab selection
      const reportData = getFilteredWorkOrders();
      
      // Format data for Excel
      const worksheetData = reportData.map(order => ({
        "Work Order Number": order.workOrderNumber,
        "Project ID": order.projectId,
        "Title": order.title,
        "Description": order.description || "",
        "Status": order.status.charAt(0).toUpperCase() + order.status.slice(1).replace("_", " "),
        "Priority": order.priority,
        "Production Line": order.productionLine || "Unassigned",
        "Batch Number": order.batchNumber || "",
        "Planned Start Date": order.plannedStartDate ? format(new Date(order.plannedStartDate), 'dd/MM/yyyy') : "",
        "Planned End Date": order.plannedEndDate ? format(new Date(order.plannedEndDate), 'dd/MM/yyyy') : "",
        "Actual Start Date": order.actualStartDate ? format(new Date(order.actualStartDate), 'dd/MM/yyyy') : "",
        "Actual End Date": order.actualEndDate ? format(new Date(order.actualEndDate), 'dd/MM/yyyy') : "",
        "Created Date": format(new Date(order.createdAt), 'dd/MM/yyyy'),
        "Progress": `${getWorkOrderProgress(order.status)}%`
      }));
      
      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Work Orders");
      
      // Format column widths for better readability
      const columnWidths = [
        { wch: 20 }, // Work Order Number
        { wch: 10 }, // Project ID
        { wch: 30 }, // Title
        { wch: 40 }, // Description
        { wch: 12 }, // Status
        { wch: 10 }, // Priority
        { wch: 15 }, // Production Line
        { wch: 15 }, // Batch Number
        { wch: 15 }, // Planned Start Date
        { wch: 15 }, // Planned End Date
        { wch: 15 }, // Actual Start Date
        { wch: 15 }, // Actual End Date
        { wch: 15 }, // Created Date
        { wch: 10 }  // Progress
      ];
      worksheet['!cols'] = columnWidths;

      // Get current date for filename
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const tabName = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
      const filename = `Thermopac_Work_Orders_${tabName}_${dateStr}.xlsx`;
      
      // Generate and download Excel file
      XLSX.writeFile(workbook, filename);
      
      toast({
        title: "Report generated successfully",
        description: `${worksheetData.length} work orders exported to Excel.`,
      });
    } catch (err) {
      console.error("Error generating report:", err);
      toast({
        title: "Error generating report",
        description: "An error occurred while generating the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Handle saving configuration
  const handleSaveConfig = () => {
    // In a real application, save config to API or localStorage
    // For now, we'll just close the dialog and show a success message
    setConfigDialogOpen(false);
    toast({
      title: "Configuration saved",
      description: "Your shop floor settings have been updated.",
    });
    
    // Apply new refresh interval if it has changed
    // This would typically be implemented in useEffect watching for config changes
  };
  
  // Update individual configuration setting
  const updateConfig = (key: keyof ConfigSettings, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Log debugging information
  React.useEffect(() => {
    if (isError) {
      console.error("Error fetching work orders:", error);
    } else if (workOrders) {
      console.log(`Successfully fetched ${workOrders.length} work orders`);
    }
  }, [isError, error, workOrders]);

  return (
    <Layout>
      <Helmet>
        <title>Shop Floor | Thermopac</title>
      </Helmet>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Shop Floor Management</h1>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setConfigDialogOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Configure
          </Button>
        </div>
        
        {/* Configuration Dialog */}
        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle>Shop Floor Configuration</DialogTitle>
              <DialogDescription>
                Customize shop floor display and behavior settings. Changes will apply immediately after saving.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-6 py-4">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">View Settings</h3>
                
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="autoRefreshInterval">Auto refresh interval (seconds)</Label>
                  <div className="flex items-center">
                    <Input
                      id="autoRefreshInterval"
                      type="number"
                      value={config.autoRefreshInterval}
                      onChange={(e) => updateConfig('autoRefreshInterval', parseInt(e.target.value) || 30)}
                      min={15}
                      max={300}
                      className="w-24"
                    />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {config.autoRefreshInterval < 30 && "Min: 30s"}
                    </span>
                  </div>
                  
                  <Label htmlFor="showCompletedOrders">Show completed work orders</Label>
                  <Switch
                    id="showCompletedOrders"
                    checked={config.showCompletedOrders}
                    onCheckedChange={(checked) => updateConfig('showCompletedOrders', checked)}
                  />
                  
                  <Label htmlFor="showCancelledOrders">Show cancelled work orders</Label>
                  <Switch
                    id="showCancelledOrders"
                    checked={config.showCancelledOrders}
                    onCheckedChange={(checked) => updateConfig('showCancelledOrders', checked)}
                  />
                  
                  <Label htmlFor="defaultSortField">Default sort field</Label>
                  <Select
                    value={config.defaultSortField}
                    onValueChange={(value) => updateConfig('defaultSortField', value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="workOrderNumber">Work Order Number</SelectItem>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="plannedStartDate">Planned Start Date</SelectItem>
                      <SelectItem value="productionLine">Production Line</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Label htmlFor="defaultSortOrder">Sort order</Label>
                  <Select
                    value={config.defaultSortOrder}
                    onValueChange={(value) => updateConfig('defaultSortOrder', value as 'asc' | 'desc')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Notification Settings</h3>
                
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="alertOnHighPriority">Alert on high priority work orders</Label>
                  <Switch
                    id="alertOnHighPriority"
                    checked={config.alertOnHighPriority}
                    onCheckedChange={(checked) => updateConfig('alertOnHighPriority', checked)}
                  />
                  
                  <Label htmlFor="alertOnDelay">Alert on delayed work orders</Label>
                  <Switch
                    id="alertOnDelay"
                    checked={config.alertOnDelay}
                    onCheckedChange={(checked) => updateConfig('alertOnDelay', checked)}
                  />
                  
                  <Label htmlFor="alertOnCompletion">Alert on work order completion</Label>
                  <Switch
                    id="alertOnCompletion"
                    checked={config.alertOnCompletion}
                    onCheckedChange={(checked) => updateConfig('alertOnCompletion', checked)}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Production Settings</h3>
                
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="enableResourceTracking">Enable resource tracking</Label>
                  <Switch
                    id="enableResourceTracking"
                    checked={config.enableResourceTracking}
                    onCheckedChange={(checked) => updateConfig('enableResourceTracking', checked)}
                  />
                  
                  <Label htmlFor="maxTeamWorkload">Maximum team workload (%)</Label>
                  <div className="flex items-center">
                    <Input
                      id="maxTeamWorkload"
                      type="number"
                      value={config.maxTeamWorkload}
                      onChange={(e) => updateConfig('maxTeamWorkload', parseInt(e.target.value) || 85)}
                      min={50}
                      max={100}
                      className="w-24"
                    />
                    <span className="ml-2 text-sm text-muted-foreground">%</span>
                  </div>
                  
                  <Label htmlFor="allowAutoAssignment">Allow auto assignment of work orders</Label>
                  <Switch
                    id="allowAutoAssignment"
                    checked={config.allowAutoAssignment}
                    onCheckedChange={(checked) => updateConfig('allowAutoAssignment', checked)}
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveConfig} className="bg-blue-600 hover:bg-blue-700">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Production Summary Cards */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Active Work Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-3xl font-bold">
                  {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : 
                    (workOrders?.filter(wo => wo.status === "in_progress").length || 0)}
                </div>
                <div className="ml-auto bg-blue-50 p-2 rounded-full">
                  <Activity className="h-8 w-8 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Planned Work Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-3xl font-bold">
                  {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : 
                    (workOrders?.filter(wo => wo.status === "planned").length || 0)}
                </div>
                <div className="ml-auto bg-amber-50 p-2 rounded-full">
                  <Clock className="h-8 w-8 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Production Teams Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-3xl font-bold">
                  {productionTeams.filter(team => team.activeOrders > 0).length}
                </div>
                <div className="ml-auto bg-green-50 p-2 rounded-full">
                  <Users className="h-8 w-8 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab}>
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="onhold">On Hold</TabsTrigger>
              <TabsTrigger value="all">All Orders</TabsTrigger>
            </TabsList>
            <Button 
              variant="outline" 
              onClick={generateReport}
              disabled={isLoading || isGeneratingReport}
              className="flex items-center"
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Work Orders</CardTitle>
                    <CardDescription>
                      View and manage all {activeTab} work orders from the shop floor.
                    </CardDescription>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center"
                  >
                    {isExpanded ? (
                      <>Collapse <ChevronUp className="ml-1 h-4 w-4" /></>
                    ) : (
                      <>Expand <ChevronDown className="ml-1 h-4 w-4" /></>
                    )}
                  </Button>
                </div>
                
                {/* Search bar for work orders */}
                <div className="flex items-center space-x-2 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search work orders by number, title, or drawing no."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="pt-4">
                  {isLoading ? (
                    <div className="flex justify-center items-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mr-2" /> 
                      <span>Loading work orders...</span>
                    </div>
                  ) : isError ? (
                    <div className="flex flex-col justify-center items-center py-8 text-red-600">
                      <div className="flex items-center mb-2">
                        <AlertCircle className="h-8 w-8 mr-2" /> 
                        <span className="font-medium">Error loading work orders</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        Please refresh the page or check your connection
                      </div>
                    </div>
                  ) : getFilteredWorkOrders().length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {searchTerm ? `No work orders matching "${searchTerm}"` : `No ${activeTab} work orders found`}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {getFilteredWorkOrders().map(workOrder => (
                        <div key={workOrder.id} className="border rounded-lg p-2 hover:bg-muted/50 transition-colors">
                          {/* Single line work order information - simplified with exact layout matching screenshot */}
                          <div className="flex items-center">
                            {/* Work Order Number */}
                            <div className="font-medium text-sm min-w-[85px]">{workOrder.workOrderNumber}</div>
                            
                            {/* Status */}
                            <Badge className={`text-xs min-w-[60px] text-center ${statusColors[workOrder.status]}`}>
                              {workOrder.status === "in_progress" ? "In Progress" : 
                               workOrder.status.charAt(0).toUpperCase() + workOrder.status.slice(1)}
                            </Badge>
                            
                            {/* Title - adjust to take appropriate space */}
                            <div className="flex-1 truncate font-medium text-sm px-2">{workOrder.title}</div>
                            
                            {/* Team, Date, Priority in more compact format */}
                            <div className="flex items-center mr-2">
                              <div className="text-xs text-right mr-4">
                                <span className="text-muted-foreground">Team:</span> {workOrder.productionLine || "Unassigned"}
                              </div>
                              
                              <div className="text-xs text-right mr-4">
                                <span className="text-muted-foreground">Date:</span> {workOrder.plannedStartDate ? 
                                  format(new Date(workOrder.plannedStartDate), 'dd MMM yyyy') : "Not scheduled"}
                              </div>
                              
                              <div className="text-xs text-right mr-4">
                                <span className="text-muted-foreground">Priority:</span> {workOrder.priority || "Medium"}
                              </div>
                            </div>
                            
                            {/* Edit button */}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex items-center h-7 text-xs px-2" 
                              onClick={() => {
                                // Navigate to work order edit page
                                window.location.href = `/production/work-orders/details/${workOrder.id}`;
                              }}
                            >
                              Edit <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          </div>
                          
                          {/* Progress bar in a separate row at the bottom with minimal spacing */}
                          <div className="mt-1">
                            <div className="flex justify-between text-xs mb-0.5">
                              <span>Progress</span>
                              <span>{getWorkOrderProgress(workOrder.status)}%</span>
                            </div>
                            <Progress value={getWorkOrderProgress(workOrder.status)} className="h-1.5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
              
              {!isExpanded && getFilteredWorkOrders().length > 0 && (
                <div className="px-6 py-4 text-sm text-muted-foreground">
                  {getFilteredWorkOrders().length} work orders found. Click "Expand" to view details.
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Production Team Status</CardTitle>
              <CardDescription>Current workload and capacity of production teams</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {productionTeams.map((team, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">{team.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {team.activeOrders} Active Orders
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Progress value={team.workload} className="flex-1 mr-4" />
                      <span className="text-sm">{team.workload}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today's Priorities</CardTitle>
              <CardDescription>Work orders requiring immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> 
                  <span>Loading priorities...</span>
                </div>
              ) : isError ? (
                <div className="flex items-center justify-center h-24 text-red-600">
                  <AlertCircle className="h-5 w-5 mr-2" /> Unable to load priorities
                </div>
              ) : (
                <div className="space-y-2">
                  {workOrders && workOrders
                    .filter(wo => wo.priority === "High" && wo.status !== "completed" && wo.status !== "cancelled")
                    .slice(0, 5)
                    .map(wo => (
                      <div 
                        key={wo.id} 
                        className="flex items-center p-2 border rounded-md hover:bg-muted/30 transition-colors"
                      >
                        {/* Work Order Number with status indicator */}
                        <div className="flex items-center min-w-[90px]">
                          <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${wo.status === "in_progress" ? "bg-amber-500" : "bg-blue-500"}`}></div>
                          <div className="font-medium text-xs">{wo.workOrderNumber}</div>
                        </div>
                        
                        {/* Status */}
                        <Badge className={`mr-2 text-xs ${statusColors[wo.status]}`}>
                          {wo.status === "in_progress" ? "In Progress" : 
                           wo.status.charAt(0).toUpperCase() + wo.status.slice(1)}
                        </Badge>
                        
                        {/* Title */}
                        <div className="flex-1 truncate ml-1 mr-3 text-xs">{wo.title}</div>
                        
                        {/* Production Team */}
                        <div className="text-xs text-muted-foreground mr-3">{wo.productionLine || "Unassigned"}</div>
                        
                        {/* Edit button */}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            window.location.href = `/production/work-orders/details/${wo.id}`;
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                    
                  {(!workOrders || workOrders.filter(wo => wo.priority === "High" && wo.status !== "completed" && wo.status !== "cancelled").length === 0) && (
                    <div className="flex items-center justify-center h-24 text-muted-foreground">
                      <Check className="h-5 w-5 mr-2" /> No high priority work orders
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
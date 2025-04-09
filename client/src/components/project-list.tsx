import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from 'date-fns';
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  Loader2, Plus, Search, Calendar, Info, Users, CheckSquare, FileText, RefreshCw,
  Upload, Truck, LayoutList, Settings, ClipboardList, BadgePercent, Pencil, X, 
  FileSpreadsheet
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import CustomerImport from "./customer-import";

// Define project item schema
const projectItemSchema = z.object({
  id: z.number().optional(), // Optional for new items
  itemCode: z.string().min(1, "Item code is required"),
  description: z.string().min(3, "Item description must be at least 3 characters"),
  specification: z.string().optional(),
  quantity: z.number().positive("Quantity must be positive"),
  uom: z.string().min(1, "Unit of Measurement is required"),
  makeOrBuy: z.enum(["Make", "Buy"]).optional(),
});

// Define the main project form schema
const projectFormSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  code: z.string().min(2, "Project code must be at least 2 characters"),
  financialYear: z.string(),
  status: z.enum(["planning", "active", "on_hold", "completed", "canceled"]),
  priority: z.enum(["Low", "Medium", "High"]),
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Start date must be a valid date"
  }),
  targetEndDate: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Target end date must be a valid date"
  }),
  customerId: z.number().optional(),
  client: z.string().optional(),
  budget: z.number().optional(),
  tags: z.array(z.string()).optional(),
  items: z.array(projectItemSchema).optional(), // Add items array
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;
type ProjectItemValues = z.infer<typeof projectItemSchema>;

// Function to get the current financial year in the format "FY23-24"
function getCurrentFinancialYear(): string {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11 (Jan-Dec)
  
  // In India, financial year starts from April 1 and ends on March 31
  let financialYearStart: number;
  
  // If current month is January to March, financial year started in previous calendar year
  // Otherwise, financial year started in current calendar year
  if (currentMonth < 3) { // January to March
    financialYearStart = today.getFullYear() - 1;
  } else { // April to December
    financialYearStart = today.getFullYear();
  }
  
  // Financial year is represented as "FY23-24" where 23 is the last two digits of start year
  // and 24 is the last two digits of end year
  const startYearShort = (financialYearStart % 100).toString().padStart(2, '0');
  const endYearShort = ((financialYearStart + 1) % 100).toString().padStart(2, '0');
  
  return `FY${startYearShort}-${endYearShort}`;
}

// Function to convert financial year to the format used for project codes
function convertFinancialYearToCode(financialYear: string): string {
  if (financialYear.startsWith('FY')) {
    // Extract year digits from FY format: FY25-26 -> 2526
    const matches = financialYear.match(/FY(\d{2})-(\d{2})/);
    if (matches && matches.length === 3) {
      return matches[1] + matches[2];
    }
  } else {
    // If direct format like 2025-2026, extract last two digits of each year
    const matches = financialYear.match(/(\d{4})-(\d{4})/);
    if (matches && matches.length === 3) {
      return matches[1].slice(-2) + matches[2].slice(-2);
    }
  }
  return '';
}

// Function to get the next project code from the server
async function getNextProjectCode(financialYear: string): Promise<string> {
  try {
    const response = await fetch(`/api/projects/next-code/${financialYear}`);
    if (!response.ok) {
      throw new Error('Failed to get next project code');
    }
    const data = await response.json();
    return data.nextCode;
  } catch (error) {
    console.error('Error getting next project code:', error);
    
    // Fallback: Generate a code in the format 2526-1
    const yearCode = convertFinancialYearToCode(financialYear);
    return `${yearCode}-1`;
  }
}

export default function ProjectList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [isCustomerImportOpen, setIsCustomerImportOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [currentItems, setCurrentItems] = useState<ProjectItemValues[]>([]);
  const [editingItem, setEditingItem] = useState<ProjectItemValues | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const [_, navigate] = useLocation();
  const { toast } = useToast();

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects");
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      return response.json();
    }
  });
  
  // Fetch customers for dropdown
  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const response = await fetch("/api/customers");
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }
      return response.json();
    }
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: ProjectFormValues) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsNewProjectDialogOpen(false);
      toast({
        title: "Project created",
        description: "Your new project has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create project",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      code: "",
      financialYear: getCurrentFinancialYear(),
      status: "planning",
      priority: "Medium",
      startDate: new Date().toISOString().split('T')[0],
      targetEndDate: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0],
      customerId: undefined,
      client: "",
      budget: undefined,
      tags: [],
    },
  });

  function onSubmit(data: ProjectFormValues) {
    // Add current items to the form data before submitting
    const submissionData = {
      ...data,
      items: currentItems.length > 0 ? currentItems : undefined
    };
    createProjectMutation.mutate(submissionData);
  }
  
  // Initialize the form with default values and get a project code
  const initializeProjectForm = async () => {
    // Set default form values
    const currentFY = getCurrentFinancialYear();
    form.setValue("financialYear", currentFY);
    form.setValue("status", "planning");
    form.setValue("priority", "Medium");
    form.setValue("startDate", new Date().toISOString().split('T')[0]);
    form.setValue("targetEndDate", new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0]);
    
    // Get the next project code from the server
    try {
      const nextCode = await getNextProjectCode(currentFY);
      form.setValue("code", nextCode);
    } catch (error) {
      console.error("Error getting next project code:", error);
      // Fallback in case of errors
      const yearCode = convertFinancialYearToCode(currentFY);
      form.setValue("code", `${yearCode}-1`);
    }
  };

  function formatDate(dateString: string) {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "planning":
        return "bg-blue-100 text-blue-800";
      case "active":
        return "bg-green-100 text-green-800";
      case "on_hold":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-purple-100 text-purple-800";
      case "canceled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case "High":
        return "bg-red-100 text-red-800";
      case "Medium":
        return "bg-orange-100 text-orange-800";
      case "Low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4">
        <p className="text-red-600">Error loading projects</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/projects"] })}>
          Retry
        </Button>
      </div>
    );
  }

  const filteredProjects = projects?.filter((project) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      project.description.toLowerCase().includes(query) ||
      project.code.toLowerCase().includes(query) ||
      project.client?.toLowerCase().includes(query) ||
      (project.tags && project.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  });

  // Sort projects by priority (High > Medium > Low)
  const prioritySortedProjects = filteredProjects ? [...filteredProjects].sort((a, b) => {
    const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  }) : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Projects</h2>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              className="pl-8 w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {/* Import Customers Dialog */}
          <CustomerImport 
            open={isCustomerImportOpen}
            onOpenChange={setIsCustomerImportOpen}
          />

          <Button 
            variant="outline" 
            onClick={() => setIsCustomerImportOpen(true)} 
            className="mr-2"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Import Customers
          </Button>
          
          <Dialog 
            open={isNewProjectDialogOpen} 
            onOpenChange={(open) => {
              if (open) {
                // Initialize form when opening dialog
                initializeProjectForm();
                // Reset items
                setCurrentItems([]);
              }
              setIsNewProjectDialogOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Project</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Fill in the details to create a new project. This will automatically create default phases.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Main Project Details (always visible) */}
                  <div className="space-y-4 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter project name"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project Code</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter project code" {...field} />
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
                            <Input placeholder="Project description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
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
                                <SelectItem value="planning">Planning</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="on_hold">On Hold</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="canceled">Canceled</SelectItem>
                              </SelectContent>
                            </Select>
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
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Low">Low</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="High">High</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="financialYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Financial Year</FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-2">
                                <Input 
                                  placeholder="FY23-24" 
                                  {...field}
                                  onChange={async (e) => {
                                    field.onChange(e);
                                    
                                    // Update project code with sequential number
                                    const financialYear = e.target.value;
                                    
                                    if (financialYear.length >= 5) { // Make sure it's a valid financial year
                                      try {
                                        const nextCode = await getNextProjectCode(financialYear);
                                        form.setValue("code", nextCode);
                                      } catch (error) {
                                        console.error("Error getting next project code:", error);
                                        // Fallback in case of errors
                                        const yearCode = convertFinancialYearToCode(financialYear);
                                        if (yearCode) {
                                          form.setValue("code", `${yearCode}-1`);
                                        }
                                      }
                                    }
                                  }} 
                                />
                                <Button 
                                  type="button" 
                                  size="icon" 
                                  variant="outline"
                                  onClick={async () => {
                                    const currentFY = getCurrentFinancialYear();
                                    field.onChange(currentFY);
                                    
                                    // Get sequential project code from server
                                    try {
                                      const nextCode = await getNextProjectCode(currentFY);
                                      form.setValue("code", nextCode);
                                    } catch (error) {
                                      console.error("Error getting next project code:", error);
                                      // Fallback in case of errors
                                      const yearCode = convertFinancialYearToCode(currentFY);
                                      form.setValue("code", `${yearCode}-1`);
                                    }
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="customerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select customer" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {customers?.map((customer) => (
                                <SelectItem key={customer.id} value={customer.id.toString()}>
                                  {customer.bpName} {customer.bpCode ? `(${customer.bpCode})` : ''}
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
                      name="budget"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Budget (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="Budget amount" 
                              {...field}
                              value={field.value || ''}
                              onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="targetEndDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Target End Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <Tabs defaultValue="project-details" className="w-full">
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="project-details" className="flex items-center gap-1">
                          <ClipboardList className="h-4 w-4" />
                          <span>Details</span>
                        </TabsTrigger>
                        <TabsTrigger value="project-stages" className="flex items-center gap-1">
                          <LayoutList className="h-4 w-4" />
                          <span>Stages</span>
                        </TabsTrigger>
                        <TabsTrigger value="logistics" className="flex items-center gap-1">
                          <Truck className="h-4 w-4" />
                          <span>Logistics</span>
                        </TabsTrigger>
                        <TabsTrigger value="attachments" className="flex items-center gap-1">
                          <Upload className="h-4 w-4" />
                          <span>Attachments</span>
                        </TabsTrigger>
                      </TabsList>
                      
                      {/* Project Details Tab */}
                      <TabsContent value="project-details" className="space-y-4 mt-4">
                        {/* Project Items Section */}
                        <div className="space-y-3 border rounded-md p-4">
                          <div className="flex justify-between items-center">
                            <h3 className="text-sm font-medium">Project Items</h3>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm" 
                              className="h-8"
                              onClick={() => {
                                setEditingItem(null);
                                setEditingItemIndex(null);
                                setIsItemDialogOpen(true);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                            </Button>
                          </div>
                          
                          <div className="border rounded-md">
                            <div className="grid grid-cols-12 gap-2 p-2 bg-muted/50 text-xs font-medium border-b">
                              <div className="col-span-1">#</div>
                              <div className="col-span-4">Item Description</div>
                              <div className="col-span-2">Specification</div>
                              <div className="col-span-1">Quantity</div>
                              <div className="col-span-1">UOM</div>
                              <div className="col-span-2">Make/Brand</div>
                              <div className="col-span-1">Actions</div>
                            </div>
                            
                            <div className="max-h-[300px] overflow-y-auto">
                              {currentItems.length === 0 ? (
                                <div className="py-8 text-center text-muted-foreground text-sm">
                                  No items added. Click "Add Item" to add project items.
                                </div>
                              ) : (
                                currentItems.map((item, index) => (
                                  <div key={index} className="grid grid-cols-12 gap-2 p-2 border-b hover:bg-muted/20 text-sm">
                                    <div className="col-span-1">{index + 1}</div>
                                    <div className="col-span-4">{item.description}</div>
                                    <div className="col-span-2">{item.specification || '-'}</div>
                                    <div className="col-span-1">{item.quantity}</div>
                                    <div className="col-span-1">{item.uom}</div>
                                    <div className="col-span-2">{item.makeOrBuy || '-'}</div>
                                    <div className="col-span-1 flex space-x-1">
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          setEditingItem(item);
                                          setEditingItemIndex(index);
                                          setIsItemDialogOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive/90"
                                        onClick={() => {
                                          // Remove the item
                                          const updatedItems = [...currentItems];
                                          updatedItems.splice(index, 1);
                                          setCurrentItems(updatedItems);
                                          form.setValue('items', updatedItems);
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          
                          <p className="text-xs text-muted-foreground">
                            Add up to 50 items for this project with their specifications, quantities, and units of measurement.
                          </p>
                          
                          {/* Project Item Dialog */}
                          <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
                            <DialogContent className="sm:max-w-[500px]">
                              <DialogHeader>
                                <DialogTitle>{editingItem ? 'Edit Project Item' : 'Add Project Item'}</DialogTitle>
                                <DialogDescription>
                                  {editingItem 
                                    ? 'Edit the details of this project item.'
                                    : 'Add a new item to this project with its details.'}
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="item-code">Item Code*</Label>
                                  <Input 
                                    id="item-code"
                                    placeholder="TH001"
                                    defaultValue={editingItem?.itemCode || ''}
                                    ref={input => {
                                      if (input && !editingItem) input.focus();
                                    }}
                                  />
                                </div>
                                
                                <div className="space-y-2">
                                  <Label htmlFor="item-description">Item Description*</Label>
                                  <Input 
                                    id="item-description"
                                    placeholder="Thermal Oil Heater"
                                    defaultValue={editingItem?.description || ''}
                                  />
                                </div>
                                
                                <div className="space-y-2">
                                  <Label htmlFor="item-specification">Specification</Label>
                                  <Input 
                                    id="item-specification"
                                    placeholder="500kW"
                                    defaultValue={editingItem?.specification || ''}
                                  />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="item-quantity">Quantity*</Label>
                                    <Input 
                                      id="item-quantity"
                                      type="number"
                                      placeholder="2"
                                      defaultValue={editingItem?.quantity || ''}
                                      min="0.01"
                                      step="0.01"
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label htmlFor="item-uom">Unit of Measurement*</Label>
                                    <Input 
                                      id="item-uom"
                                      placeholder="Nos"
                                      defaultValue={editingItem?.uom || ''}
                                    />
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label htmlFor="item-makeorbuy">Make or Buy</Label>
                                  <Select defaultValue={editingItem?.makeOrBuy || ''}>
                                    <SelectTrigger id="item-makeorbuy">
                                      <SelectValue placeholder="Select Make or Buy" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Make">Make (In-house)</SelectItem>
                                      <SelectItem value="Buy">Buy (Purchase)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              
                              <DialogFooter>
                                <Button 
                                  variant="outline" 
                                  onClick={() => setIsItemDialogOpen(false)}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={() => {
                                    // Get values from form
                                    const itemCodeEl = document.getElementById('item-code') as HTMLInputElement;
                                    const descriptionEl = document.getElementById('item-description') as HTMLInputElement;
                                    const specificationEl = document.getElementById('item-specification') as HTMLInputElement;
                                    const quantityEl = document.getElementById('item-quantity') as HTMLInputElement;
                                    const uomEl = document.getElementById('item-uom') as HTMLInputElement;
                                    const makeOrBuyEl = document.getElementById('item-makeorbuy') as HTMLSelectElement;
                                    
                                    // Validate
                                    if (!itemCodeEl.value) {
                                      toast({
                                        title: "Missing information",
                                        description: "Item code is required",
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    
                                    if (!descriptionEl.value) {
                                      toast({
                                        title: "Missing information",
                                        description: "Item description is required",
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    
                                    if (!quantityEl.value || parseFloat(quantityEl.value) <= 0) {
                                      toast({
                                        title: "Invalid quantity",
                                        description: "Quantity must be greater than zero",
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    
                                    if (!uomEl.value) {
                                      toast({
                                        title: "Missing information",
                                        description: "Unit of measurement is required",
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    
                                    // Create item object
                                    const item: ProjectItemValues = {
                                      itemCode: itemCodeEl.value,
                                      description: descriptionEl.value,
                                      specification: specificationEl.value || undefined,
                                      quantity: parseFloat(quantityEl.value),
                                      uom: uomEl.value,
                                      makeOrBuy: makeOrBuyEl.value as "Make" | "Buy" || undefined
                                    };
                                    
                                    // Update or add item
                                    const updatedItems = [...currentItems];
                                    if (editingItemIndex !== null) {
                                      updatedItems[editingItemIndex] = item;
                                    } else {
                                      updatedItems.push(item);
                                    }
                                    
                                    // Update state and form
                                    setCurrentItems(updatedItems);
                                    form.setValue('items', updatedItems);
                                    setIsItemDialogOpen(false);
                                    
                                    // Show success toast
                                    toast({
                                      title: editingItem ? "Item updated" : "Item added",
                                      description: editingItem 
                                        ? "The project item has been updated successfully"
                                        : "A new item has been added to the project"
                                    });
                                  }}
                                >
                                  {editingItem ? 'Update Item' : 'Add Item'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TabsContent>
                      
                      {/* Project Stages Tab */}
                      <TabsContent value="project-stages" className="space-y-4 mt-4">
                        <div className="space-y-4 border rounded-md p-4">
                          <h3 className="text-sm font-medium mb-2">Default Project Phases</h3>
                          <div className="grid grid-cols-4 gap-2">
                            <div className="border rounded p-2 bg-blue-50">
                              <div className="text-xs font-semibold">Design</div>
                              <div className="text-[10px] text-muted-foreground">Requirements analysis & planning</div>
                            </div>
                            <div className="border rounded p-2 bg-amber-50">
                              <div className="text-xs font-semibold">Procurement</div>
                              <div className="text-[10px] text-muted-foreground">Sourcing materials & components</div>
                            </div>
                            <div className="border rounded p-2 bg-green-50">
                              <div className="text-xs font-semibold">Manufacturing</div>
                              <div className="text-[10px] text-muted-foreground">Production & assembly</div>
                            </div>
                            <div className="border rounded p-2 bg-purple-50">
                              <div className="text-xs font-semibold">Quality</div>
                              <div className="text-[10px] text-muted-foreground">Testing & validation</div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">These phases will be created automatically upon project creation.</p>
                        </div>
                      </TabsContent>
                      
                      {/* Logistics Tab */}
                      <TabsContent value="logistics" className="space-y-4 mt-4">
                        <FormField
                          control={form.control}
                          name="client"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Client (Optional)</FormLabel>
                              <FormControl>
                                <Input placeholder="Client name" {...field} value={field.value || ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Delivery Terms</Label>
                            <Select>
                              <SelectTrigger>
                                <SelectValue placeholder="Select delivery terms" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ex_works">Ex Works (EXW)</SelectItem>
                                <SelectItem value="fob">Free On Board (FOB)</SelectItem>
                                <SelectItem value="cif">Cost, Insurance & Freight (CIF)</SelectItem>
                                <SelectItem value="ddp">Delivered Duty Paid (DDP)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Payment Terms</Label>
                            <Select>
                              <SelectTrigger>
                                <SelectValue placeholder="Select payment terms" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="advance">100% Advance</SelectItem>
                                <SelectItem value="50_50">50% Advance, 50% Before Dispatch</SelectItem>
                                <SelectItem value="30_days">Net 30 Days</SelectItem>
                                <SelectItem value="lc">Letter of Credit</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Shipping Address</Label>
                          <Input placeholder="Enter shipping address" />
                        </div>
                      </TabsContent>
                      
                      {/* Attachments Tab */}
                      <TabsContent value="attachments" className="space-y-4 mt-4">
                        <div className="border-2 border-dashed rounded-lg p-8 text-center">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm mb-1">Drag & drop files here or click to browse</p>
                          <p className="text-xs text-muted-foreground">Upload proposal documents, specifications, or requirement files</p>
                          <Button variant="outline" size="sm" className="mt-4">
                            <Upload className="h-4 w-4 mr-2" /> Select Files
                          </Button>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          You can upload additional documents after project creation.
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>

                  <DialogFooter className="mt-6">
                    <Button 
                      type="submit" 
                      disabled={createProjectMutation.isPending}
                    >
                      {createProjectMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>Create Project</>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredProjects?.length === 0 ? (
        <div className="text-center p-8 border rounded-lg">
          <p className="text-muted-foreground">No projects found. Create your first project to get started.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Collapsed view of all projects */}
          <div className="border rounded-md p-4">
            <h3 className="text-xl font-semibold mb-4">All Projects (Collapsed View)</h3>
            <div className="space-y-2">
              {filteredProjects?.map((project) => (
                <div 
                  key={`collapsed-${project.id}`} 
                  className="flex items-center justify-between p-3 rounded border hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${project.status === 'active' ? 'bg-green-500' : project.status === 'completed' ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                    <span className="font-medium">{project.name}</span>
                    <span className="text-sm text-gray-500">{project.code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${getPriorityColor(project.priority)}`}>
                      {project.priority}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(project.targetEndDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Projects by Priority (High to Low) */}
          <div>
            <h3 className="text-xl font-semibold mb-4">Projects by Priority</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prioritySortedProjects.map((project) => (
                <Card key={`priority-${project.id}`} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex gap-2 mb-1">
                          <span className={`text-xs rounded-full px-2 py-0.5 ${getStatusColor(project.status)}`}>
                            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 ${getPriorityColor(project.priority)}`}>
                            {project.priority}
                          </span>
                        </div>
                        <CardTitle className="text-xl">{project.name}</CardTitle>
                        <div className="text-xs text-gray-500 mt-1">Code: {project.code}</div>
                      </div>
                    </div>
                    <CardDescription className="line-clamp-2 mt-2">
                      {project.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2 text-sm">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>Start: {formatDate(project.startDate)}</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>End: {formatDate(project.targetEndDate)}</span>
                      </div>
                      {project.client && (
                        <div className="flex items-center col-span-2">
                          <Info className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span>Client: {project.client}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-between items-center">
                    <div className="flex space-x-2 text-xs text-muted-foreground">
                      <span className="flex items-center"><Users className="h-3 w-3 mr-1" /> {project.memberCount || 0}</span>
                      <span className="flex items-center"><CheckSquare className="h-3 w-3 mr-1" /> {project.completedTasks || 0}/{project.totalTasks || 0}</span>
                      <span className="flex items-center"><FileText className="h-3 w-3 mr-1" /> {project.documentCount || 0}</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        if (project.id) {
                          console.log('Using project ID for navigation:', project.id);
                          navigate(`/projects/${project.id}`);
                        } else {
                          toast({
                            title: "Invalid Project ID",
                            description: "Unable to open this project due to an invalid ID.",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      View Details
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
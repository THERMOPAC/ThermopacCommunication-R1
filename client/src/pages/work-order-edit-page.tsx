import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, Check, CalendarIcon, Loader2 } from "lucide-react";
import Layout from "@/components/layout";

// Work Order schema
const workOrderSchema = z.object({
  workOrderNumber: z.string().min(1, { message: "Work order number is required" }),
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  plannedStartDate: z.date({ required_error: "Start date is required" }),
  plannedEndDate: z.date({ required_error: "End date is required" }),
  productionLine: z.string().optional(),
  batchNumber: z.string().optional(),
  quantity: z.number().optional(),
  changeComment: z.string().optional(), // Optional comment to record with change history
});

type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

export default function WorkOrderEditPage() {
  const params = useParams<{ id: string }>();
  const workOrderId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  
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
  
  // Fetch work order items to get the UOM (unit)
  const {
    data: workOrderItems,
    isLoading: isLoadingItems
  } = useQuery<any>({
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
  
  // Combine the work order and items data
  useEffect(() => {
    if (workOrder && workOrderItems) {
      // Add the items to the work order object
      workOrder.workOrderItems = workOrderItems;
    }
  }, [workOrder, workOrderItems]);
  
  // Initialize form with default values
  const form = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      workOrderNumber: "",
      title: "",
      description: "",
      status: "planned",
      priority: "Medium",
      plannedStartDate: new Date(),
      plannedEndDate: new Date(),
      productionLine: "",
      batchNumber: "",
      changeComment: "", // Add empty default for change comment
    },
  });
  
  // Update form when work order data is loaded
  useEffect(() => {
    if (workOrder) {
      form.reset({
        workOrderNumber: workOrder.workOrderNumber,
        title: workOrder.title,
        description: workOrder.description || "",
        status: workOrder.status,
        priority: workOrder.priority,
        plannedStartDate: new Date(workOrder.plannedStartDate),
        plannedEndDate: new Date(workOrder.plannedEndDate),
        productionLine: workOrder.productionLine || "",
        batchNumber: workOrder.batchNumber || "",
        quantity: workOrder.quantity || undefined,
        changeComment: "", // Reset change comment to empty
      });
    }
  }, [workOrder, form]);
  
  // Handle form submission
  const onSubmit = async (data: WorkOrderFormValues) => {
    try {
      setIsSaving(true);
      
      const response = await fetch(`/api/production/work-orders/${workOrderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update work order");
      }
      
      const updatedWorkOrder = await response.json();
      
      // Invalidate cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/production/work-orders', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/production/work-orders/project'] });
      
      toast({
        title: "Work Order Updated",
        description: "Work order has been updated successfully.",
      });
      
      // Navigate back to work order detail page
      navigate(`/production/work-orders/${workOrderId}`);
    } catch (error: any) {
      console.error("Error updating work order:", error);
      toast({
        title: "Error Updating Work Order",
        description: error.message || "An error occurred while updating the work order.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Error handling
  useEffect(() => {
    if (workOrderError) {
      toast({
        title: "Error",
        description: "Failed to load work order data. Please try again.",
        variant: "destructive",
      });
    }
  }, [workOrderError, toast]);
  
  // Show loading state when fetching work order or work order items
  if (isLoadingWorkOrder || isLoadingItems) {
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
        <title>Edit {workOrder?.workOrderNumber || "Work Order"} | Thermopac</title>
      </Helmet>
      
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/production/work-orders/${workOrderId}`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <h1 className="text-3xl font-bold">Edit Work Order</h1>
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Edit Work Order: {workOrder?.workOrderNumber}</CardTitle>
            <CardDescription>
              Modify work order details and settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic Information</TabsTrigger>
                    <TabsTrigger value="schedule">Schedule & Details</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="basic" className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="workOrderNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Work Order Number</FormLabel>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                            <FormDescription>
                              Work order number cannot be changed
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input {...field} disabled />
                            </FormControl>
                            <FormDescription>
                              Title cannot be modified as it's auto-generated based on item code
                            </FormDescription>
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
                              {...field} 
                              placeholder="Enter work order description"
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Planned Quantity</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                {...field} 
                                value={field.value || ''} 
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="Enter planned quantity" 
                                disabled
                              />
                            </FormControl>
                            <FormDescription>
                              Quantity from project item
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* UOM is fetched from work order items */}
                      <div className="space-y-2">
                        <div className="font-medium">Unit of Measurement</div>
                        <div className="px-3 py-2 border rounded-md bg-muted/50">
                          {workOrderItems?.length > 0 && workOrderItems[0].unit ? 
                            workOrderItems[0].unit : 
                            (workOrder?.workOrderItems?.[0]?.unit || 'No UOM')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Unit of measurement from master item
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
                                <SelectItem value="planned">Planned</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="on_hold">On Hold</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
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
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="schedule" className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="plannedStartDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Planned Start Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className="pl-3 text-left font-normal flex justify-between"
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
                                  disabled={(date) => date < new Date("1900-01-01")}
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
                        name="plannedEndDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Planned End Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className="pl-3 text-left font-normal flex justify-between"
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
                                  disabled={(date) => date < new Date("1900-01-01")}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="productionLine"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Production Team</FormLabel>
                            <Select 
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select production team" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Production Team-1">Production Team-1</SelectItem>
                                <SelectItem value="Production Team-2">Production Team-2</SelectItem>
                                <SelectItem value="Production Team-3">Production Team-3</SelectItem>
                                <SelectItem value="Production Team-4">Production Team-4</SelectItem>
                                <SelectItem value="Production Team-5">Production Team-5</SelectItem>
                                <SelectItem value="Production Team-6">Production Team-6</SelectItem>
                                <SelectItem value="Production Team-7">Production Team-7</SelectItem>
                                <SelectItem value="Production Team-8">Production Team-8</SelectItem>
                                <SelectItem value="Production Team-9">Production Team-9</SelectItem>
                                <SelectItem value="Production Team-10">Production Team-10</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="batchNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Drawing No.</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                readOnly 
                                className="bg-muted/50"
                                placeholder="Drawing number (read-only)" 
                              />
                            </FormControl>
                            <div className="text-xs text-muted-foreground">
                              Drawing number from master item (read-only)
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                
                {/* Change Comment Field */}
                <div className="space-y-4 pt-6 border-t mt-6">
                  <FormField
                    control={form.control}
                    name="changeComment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Change Comment</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Add a note about the changes you're making (optional)"
                            rows={2}
                          />
                        </FormControl>
                        <FormDescription>
                          Your comment will be recorded in the work order history
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(`/production/work-orders/${workOrderId}`)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600"
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" /> Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
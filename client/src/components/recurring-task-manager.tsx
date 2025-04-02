import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { insertRecurringPatternSchema, RecurringPattern, User } from "@shared/schema";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronRight, Edit, Plus, Trash2 } from "lucide-react";

// Create a schema for the recurring task form
const recurringTaskSchema = insertRecurringPatternSchema.extend({
  patternType: z.enum(["daily", "weekly", "monthly", "yearly"]),
  daysOfWeek: z.array(z.string()).optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  hasEndDate: z.boolean().default(false),
});

type RecurringTaskForm = z.infer<typeof recurringTaskSchema>;

interface RecurringTaskManagerProps {
  users: User[];
}

export default function RecurringTaskManager({ users }: RecurringTaskManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPattern, setEditingPattern] = useState<RecurringPattern | null>(null);
  
  // Get all recurring patterns for the current user
  const { data: patterns = [], isLoading: patternsLoading } = useQuery({
    queryKey: ["/api/recurring-patterns"],
    queryFn: async () => {
      const res = await fetch("/api/recurring-patterns");
      if (!res.ok) throw new Error("Failed to fetch recurring patterns");
      return res.json();
    },
  });

  // Create a new recurring pattern
  const createPatternMutation = useMutation({
    mutationFn: async (data: any) => {
      try {
        console.log("⭐ Creating pattern with data:", JSON.stringify(data, null, 2));
        // Clone the data to avoid any reference issues
        const dataToSubmit = { ...data };
        
        // CRITICAL: Make absolutely sure userId is set and is a number
        if (user) {
          dataToSubmit.userId = Number(user.id);
          dataToSubmit.createdBy = Number(user.id);
          console.log("⭐ Setting userId to:", dataToSubmit.userId, "and createdBy to:", dataToSubmit.createdBy);
        } else {
          console.error("⚠️ No user found when creating task!");
          throw new Error("You must be logged in to create recurring tasks");
        }
        
        // Ensure all required fields are present and of the correct type
        const requiredFields = ['pattern', 'interval', 'startDate', 'templateTitle', 
          'templateDescription', 'templatePriority', 'userId', 'createdBy'];
          
        const missingFields = requiredFields.filter(field => !(field in dataToSubmit));
        if (missingFields.length > 0) {
          console.error(`⚠️ Missing required fields: ${missingFields.join(', ')}`);
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Set creation date if not present
        if (!dataToSubmit.createdAt) {
          dataToSubmit.createdAt = new Date().toISOString();
        }
        
        // Validate numeric fields
        dataToSubmit.interval = Number(dataToSubmit.interval);
        dataToSubmit.templateDurationDays = Number(dataToSubmit.templateDurationDays);
        if (dataToSubmit.dayOfMonth) dataToSubmit.dayOfMonth = Number(dataToSubmit.dayOfMonth);
        if (dataToSubmit.monthOfYear) dataToSubmit.monthOfYear = Number(dataToSubmit.monthOfYear);
        if (dataToSubmit.templateAssignedTo) dataToSubmit.templateAssignedTo = Number(dataToSubmit.templateAssignedTo);
        if (dataToSubmit.maxOccurrences) dataToSubmit.maxOccurrences = Number(dataToSubmit.maxOccurrences);
        
        console.log("⭐ Submitting data to API:", JSON.stringify(dataToSubmit, null, 2));
        
        const res = await apiRequest("POST", "/api/recurring-patterns", dataToSubmit);
        console.log("⭐ API Response status:", res.status, res.statusText);
        
        if (!res.ok) {
          let errorMessage = `Request failed with status ${res.status}`;
          try {
            const errorData = await res.json();
            console.error("⚠️ API error response:", errorData);
            errorMessage = errorData?.message || errorMessage;
            
            // Add more details if available
            if (errorData?.details) {
              console.error("⚠️ API error details:", errorData.details);
              if (typeof errorData.details === 'object') {
                errorMessage += ` (${JSON.stringify(errorData.details)})`;
              }
            }
          } catch (parseError) {
            console.error("⚠️ Could not parse error response:", parseError);
          }
          throw new Error(errorMessage);
        }
        
        const responseData = await res.json();
        console.log("⭐ Task created successfully:", responseData);
        return responseData;
      } catch (err) {
        console.error("⚠️ Error in createPatternMutation:", err);
        throw err;
      }
    },
    onSuccess: (data) => {
      console.log("Pattern created successfully:", data);
      toast({
        title: "Pattern created",
        description: "Recurring task pattern has been created successfully",
      });
      setOpenDialog(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-patterns"] });
    },
    onError: (error: Error) => {
      console.error("Create pattern error:", error);
      toast({
        title: "Failed to create pattern",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Update a recurring pattern
  const updatePatternMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: RecurringTaskForm }) => {
      // Transform the form data to the pattern expected by the API
      const transformedData = transformFormDataToPattern(data);
      const res = await apiRequest("PATCH", `/api/recurring-patterns/${id}`, transformedData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Pattern updated",
        description: "Recurring task pattern has been updated successfully",
      });
      setOpenDialog(false);
      setEditingPattern(null);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-patterns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update pattern",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete a recurring pattern
  const deletePatternMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/recurring-patterns/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Pattern deleted",
        description: "Recurring task pattern has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-patterns"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete pattern",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form for creating/editing a recurring pattern
  const form = useForm<RecurringTaskForm>({
    resolver: zodResolver(recurringTaskSchema),
    defaultValues: {
      patternType: "daily",
      pattern: "daily",
      interval: 1,
      daysOfWeek: [],
      dayOfMonth: undefined,
      monthOfYear: undefined,
      startDate: new Date().toISOString(),
      endDate: undefined,
      hasEndDate: false,
      maxOccurrences: undefined,
      templateTitle: "",
      templateDescription: "",
      templatePriority: "Medium",
      templateAssignedTo: undefined,
      templateCategory: "work",
      templateDurationDays: 1,
      isActive: true,
    },
  });

  // Handle form submission
  const onSubmit = (data: RecurringTaskForm) => {
    try {
      // Show a loading toast
      toast({
        title: editingPattern ? "Updating recurring task..." : "Creating recurring task...",
        description: "Please wait while we process your request.",
      });
      
      console.log("🔵 FORM SUBMISSION STARTED");
      console.log("🔵 Form data being submitted:", JSON.stringify(data, null, 2));
      
      if (!user) {
        console.error("🔴 No authenticated user found!");
        throw new Error("You must be logged in to create or update recurring tasks");
      }
      
      console.log("🔵 Current user:", JSON.stringify(user, null, 2));
      
      if (editingPattern) {
        console.log("🔵 UPDATING PATTERN:", editingPattern.id);
        console.log("🔵 Data before transformation:", JSON.stringify(data, null, 2));
        
        const transformedData = transformFormDataToPattern(data);
        // Double-check userId is set for updates too
        transformedData.userId = Number(user.id);
        transformedData.createdBy = Number(user.id);
        
        console.log("🔵 Data after transformation:", JSON.stringify(transformedData, null, 2));
        
        // Add validation for critical fields
        if (!transformedData.userId) {
          console.error("🔴 userId is missing or invalid!");
          throw new Error("User ID is required");
        }
        
        if (!transformedData.pattern) {
          console.error("🔴 pattern is missing!");
          throw new Error("Pattern type is required");
        }
        
        console.log("🔵 Calling updatePatternMutation with:", editingPattern.id, transformedData);
        updatePatternMutation.mutate({ id: editingPattern.id, data: transformedData });
      } else {
        console.log("🔵 CREATING NEW PATTERN");
        console.log("🔵 Data before transformation:", JSON.stringify(data, null, 2));
        
        const transformedData = transformFormDataToPattern(data);
        
        // CRITICAL: Always ensure userId is included and not undefined
        transformedData.userId = Number(user.id);
        transformedData.createdBy = Number(user.id);
        transformedData.createdAt = new Date().toISOString();
        
        console.log("🔵 userId being set to:", transformedData.userId);
        console.log("🔵 createdBy being set to:", transformedData.createdBy);
        console.log("🔵 createdAt being set to:", transformedData.createdAt);
        
        // Add validation for critical fields before submission
        if (!transformedData.userId) {
          console.error("🔴 userId is missing or invalid!");
          throw new Error("User ID is required");
        }
        
        if (!transformedData.pattern) {
          console.error("🔴 pattern is missing!");
          throw new Error("Pattern type is required");
        }
        
        if (!transformedData.templateTitle) {
          console.error("🔴 templateTitle is missing!");
          throw new Error("Task title is required");
        }
        
        if (!transformedData.templateDescription) {
          console.error("🔴 templateDescription is missing!");
          throw new Error("Task description is required");
        }
        
        console.log("🔵 Final transformed data for API:", JSON.stringify(transformedData, null, 2));
        console.log("🔵 Calling createPatternMutation");
        
        // Show additional toast to confirm submission
        toast({
          title: "Submitting task...",
          description: "Sending data to server",
        });
        
        createPatternMutation.mutate(transformedData);
      }
    } catch (error) {
      console.error("🔴 ERROR IN FORM SUBMISSION:", error);
      toast({
        title: "Form submission error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Handle edit button click
  const handleEdit = (pattern: RecurringPattern) => {
    setEditingPattern(pattern);
    
    // Convert pattern data back to form data
    const formData = transformPatternToFormData(pattern);
    
    // Reset form with pattern data
    form.reset(formData);
    setOpenDialog(true);
  };

  // Handle delete button click
  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this recurring pattern?")) {
      // Show a loading toast
      toast({
        title: "Deleting recurring task...",
        description: "Please wait while we process your request.",
      });
      
      deletePatternMutation.mutate(id);
    }
  };

  // Function to transform form data to pattern data
  function transformFormDataToPattern(data: RecurringTaskForm) {
    const patternData: any = {
      pattern: data.patternType,
      interval: Number(data.interval),  // Ensure it's a number
      startDate: data.startDate,
      templateTitle: data.templateTitle,
      templateDescription: data.templateDescription,
      templatePriority: data.templatePriority,
      templateCategory: data.templateCategory,
      templateDurationDays: Number(data.templateDurationDays), // Ensure it's a number
      isActive: Boolean(data.isActive), // Ensure it's a boolean
      userId: user?.id, // Always ensure userId is set
      createdBy: user?.id, // Set createdBy as well
      createdAt: new Date().toISOString() // Set creation date
    };

    // Debug log
    console.log("✅ Transformed form data:", JSON.stringify(patternData, null, 2));

    // Explicitly log critical fields
    console.log(`✅ pattern: ${patternData.pattern}, type: ${typeof patternData.pattern}`);
    console.log(`✅ interval: ${patternData.interval}, type: ${typeof patternData.interval}`);
    console.log(`✅ userId: ${patternData.userId}, type: ${typeof patternData.userId}`);
    console.log(`✅ createdBy: ${patternData.createdBy}, type: ${typeof patternData.createdBy}`);

    // Add days of week for weekly pattern
    if (data.patternType === "weekly" && data.daysOfWeek && data.daysOfWeek.length > 0) {
      patternData.daysOfWeek = data.daysOfWeek.join(",");
    }

    // Add day of month for monthly pattern
    if (data.patternType === "monthly" && data.dayOfMonth) {
      patternData.dayOfMonth = Number(data.dayOfMonth); // Ensure it's a number
    }

    // Add month of year for yearly pattern
    if (data.patternType === "yearly" && data.monthOfYear) {
      patternData.monthOfYear = Number(data.monthOfYear); // Ensure it's a number
    }

    // Add assigned to if provided
    if (data.templateAssignedTo) {
      patternData.templateAssignedTo = Number(data.templateAssignedTo); // Ensure it's a number
    }

    // Add end date if provided
    if (data.hasEndDate && data.endDate) {
      patternData.endDate = data.endDate;
    }

    // Add max occurrences if provided
    if (data.maxOccurrences) {
      patternData.maxOccurrences = Number(data.maxOccurrences); // Ensure it's a number
    }

    return patternData;
  }

  // Function to transform pattern data to form data
  function transformPatternToFormData(pattern: RecurringPattern): RecurringTaskForm {
    const formData: any = {
      patternType: pattern.pattern,
      pattern: pattern.pattern,
      interval: pattern.interval,
      startDate: pattern.startDate,
      hasEndDate: !!pattern.endDate,
      endDate: pattern.endDate,
      maxOccurrences: pattern.maxOccurrences,
      templateTitle: pattern.templateTitle,
      templateDescription: pattern.templateDescription,
      templatePriority: pattern.templatePriority,
      templateAssignedTo: pattern.templateAssignedTo,
      templateCategory: pattern.templateCategory,
      templateDurationDays: pattern.templateDurationDays,
      isActive: pattern.isActive,
    };

    // Add days of week for weekly pattern
    if (pattern.pattern === "weekly" && pattern.daysOfWeek) {
      formData.daysOfWeek = pattern.daysOfWeek.split(",");
    }

    // Add day of month for monthly pattern
    if (pattern.pattern === "monthly" && pattern.dayOfMonth) {
      formData.dayOfMonth = pattern.dayOfMonth;
    }

    // Add month of year for yearly pattern
    if (pattern.pattern === "yearly" && pattern.monthOfYear) {
      formData.monthOfYear = pattern.monthOfYear;
    }

    return formData;
  }

  // Helper to render the pattern in human-readable form
  function renderPatternDescription(pattern: RecurringPattern) {
    let description = "";

    switch (pattern.pattern) {
      case "daily":
        description = `Every ${pattern.interval > 1 ? pattern.interval + ' days' : 'day'}`;
        break;
      case "weekly":
        if (pattern.daysOfWeek) {
          const days = pattern.daysOfWeek
            .split(",")
            .map(day => day.charAt(0).toUpperCase() + day.slice(1))
            .join(", ");
          description = `Every ${pattern.interval > 1 ? pattern.interval + ' weeks' : 'week'} on ${days}`;
        } else {
          description = `Every ${pattern.interval > 1 ? pattern.interval + ' weeks' : 'week'}`;
        }
        break;
      case "monthly":
        if (pattern.dayOfMonth) {
          description = `Every ${pattern.interval > 1 ? pattern.interval + ' months' : 'month'} on day ${pattern.dayOfMonth}`;
        } else {
          description = `Every ${pattern.interval > 1 ? pattern.interval + ' months' : 'month'}`;
        }
        break;
      case "yearly":
        if (pattern.monthOfYear && pattern.dayOfMonth) {
          const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          description = `Every ${pattern.interval > 1 ? pattern.interval + ' years' : 'year'} on ${months[pattern.monthOfYear - 1]} ${pattern.dayOfMonth}`;
        } else {
          description = `Every ${pattern.interval > 1 ? pattern.interval + ' years' : 'year'}`;
        }
        break;
    }

    // Add end information
    if (pattern.endDate) {
      description += ` until ${formatDate(pattern.endDate)}`;
    } else if (pattern.maxOccurrences) {
      description += ` for ${pattern.maxOccurrences} occurrences`;
    }

    return description;
  }

  // Helper to format dates
  function formatDate(dateString: string) {
    try {
      return format(new Date(dateString), "MMMM d, yyyy");
    } catch (e) {
      return dateString;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Recurring Tasks</h2>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              console.log("Add Recurring Task button clicked");
              setEditingPattern(null);
              form.reset({
                patternType: "daily",
                pattern: "daily",
                interval: 1,
                daysOfWeek: [],
                startDate: new Date().toISOString(),
                hasEndDate: false,
                templateTitle: "",
                templateDescription: "",
                templatePriority: "Medium",
                templateCategory: "work",
                templateDurationDays: 1,
                isActive: true,
              });
              console.log("Setting dialog to open");
              setOpenDialog(true);
              console.log("Dialog state after setting:", openDialog);
            }}>
              <Plus className="mr-2 h-4 w-4" /> Add Recurring Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editingPattern ? "Edit Recurring Task" : "Create Recurring Task"}</DialogTitle>
              <DialogDescription>
                Define a pattern for automatically generating tasks.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="schedule" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="schedule">Schedule</TabsTrigger>
                    <TabsTrigger value="taskDetails">Task Details</TabsTrigger>
                  </TabsList>
                  
                  {/* Schedule Tab */}
                  <TabsContent value="schedule" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="patternType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recurrence Pattern</FormLabel>
                            <Select 
                              onValueChange={(value: "daily" | "weekly" | "monthly" | "yearly") => {
                                field.onChange(value);
                                form.setValue("pattern", value as "daily" | "weekly" | "monthly" | "yearly"); // Sync with pattern field
                              }}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="interval"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repeat every</FormLabel>
                            <FormControl>
                              <div className="flex items-center space-x-2">
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                />
                                <span>
                                  {form.watch("patternType") === "daily" && "day(s)"}
                                  {form.watch("patternType") === "weekly" && "week(s)"}
                                  {form.watch("patternType") === "monthly" && "month(s)"}
                                  {form.watch("patternType") === "yearly" && "year(s)"}
                                </span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Weekly pattern options */}
                    {form.watch("patternType") === "weekly" && (
                      <FormField
                        control={form.control}
                        name="daysOfWeek"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Days of the week</FormLabel>
                            <div className="grid grid-cols-4 gap-2">
                              {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => (
                                <FormItem
                                  key={day}
                                  className="flex flex-row items-center space-x-2 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(day)}
                                      onCheckedChange={(checked) => {
                                        const currentValue = field.value || [];
                                        const newValue = checked
                                          ? [...currentValue, day]
                                          : currentValue.filter((d) => d !== day);
                                        field.onChange(newValue);
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal capitalize">
                                    {day}
                                  </FormLabel>
                                </FormItem>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    {/* Monthly pattern options */}
                    {form.watch("patternType") === "monthly" && (
                      <FormField
                        control={form.control}
                        name="dayOfMonth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Day of the month</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(parseInt(value))}
                              defaultValue={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                  <SelectItem key={day} value={day.toString()}>
                                    {day}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    {/* Yearly pattern options */}
                    {form.watch("patternType") === "yearly" && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="monthOfYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Month</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(parseInt(value))}
                                defaultValue={field.value?.toString()}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select month" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {[
                                    "January", "February", "March", "April",
                                    "May", "June", "July", "August",
                                    "September", "October", "November", "December"
                                  ].map((month, index) => (
                                    <SelectItem key={month} value={(index + 1).toString()}>
                                      {month}
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
                          name="dayOfMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Day</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(parseInt(value))}
                                defaultValue={field.value?.toString()}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select day" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                    <SelectItem key={day} value={day.toString()}>
                                      {day}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                    
                    {/* Date range */}
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Start date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(new Date(field.value), "PPP")
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
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={(date) => date && field.onChange(date.toISOString())}
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
                        name="hasEndDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                End date
                              </FormLabel>
                              <FormDescription>
                                Specify when to stop generating tasks
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      
                      {form.watch("hasEndDate") && (
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>End by</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className={cn(
                                          "w-full pl-3 text-left font-normal",
                                          !field.value && "text-muted-foreground"
                                        )}
                                      >
                                        {field.value ? (
                                          format(new Date(field.value), "PPP")
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
                                      selected={field.value ? new Date(field.value) : undefined}
                                      onSelect={(date) => date && field.onChange(date.toISOString())}
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
                            name="maxOccurrences"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max occurrences</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Unlimited"
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Leave empty for no limit
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Task Details Tab */}
                  <TabsContent value="taskDetails" className="space-y-4">
                    <FormField
                      control={form.control}
                      name="templateTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task title</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="templateDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the task"
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="templatePriority"
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
                        name="templateCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select 
                              onValueChange={(value: string) => field.onChange(value)}
                              defaultValue={field.value || 'work'}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="work">Work</SelectItem>
                                <SelectItem value="personal">Personal</SelectItem>
                                <SelectItem value="meeting">Meeting</SelectItem>
                                <SelectItem value="report">Report</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="templateAssignedTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign to</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                            defaultValue={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select user" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {user && (
                                <SelectItem value={user.id.toString()}>
                                  {user.username} (Self)
                                </SelectItem>
                              )}
                              {users
                                .filter(u => u.id !== user?.id)
                                .map((u) => (
                                  <SelectItem key={u.id} value={u.id.toString()}>
                                    {u.username}
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
                      name="templateDurationDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (days)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            />
                          </FormControl>
                          <FormDescription>
                            Number of days to complete the task
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Active
                            </FormLabel>
                            <FormDescription>
                              Enable or disable automatic task generation
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                </Tabs>
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setOpenDialog(false);
                      setEditingPattern(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createPatternMutation.isPending || updatePatternMutation.isPending}
                  >
                    {(createPatternMutation.isPending || updatePatternMutation.isPending) && (
                      <span className="mr-2 h-4 w-4 animate-spin">⟳</span>
                    )}
                    {editingPattern ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {patternsLoading ? (
          <div className="text-center p-4">Loading patterns...</div>
        ) : patterns.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            {patterns.map((pattern: RecurringPattern) => (
              <AccordionItem key={pattern.id} value={`pattern-${pattern.id}`}>
                <AccordionTrigger className="px-4 py-2 hover:bg-secondary/20">
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <span className="font-medium">{pattern.templateTitle}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        pattern.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {pattern.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {renderPatternDescription(pattern)}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Card className="border-0 shadow-none">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium mb-1">Task Details</h4>
                          <div className="space-y-1 text-sm">
                            <p><span className="font-medium">Title:</span> {pattern.templateTitle}</p>
                            <p><span className="font-medium">Description:</span> {pattern.templateDescription}</p>
                            <p>
                              <span className="font-medium">Priority:</span>{" "}
                              <span className={`capitalize ${
                                pattern.templatePriority === "High" 
                                  ? "text-red-600" 
                                  : pattern.templatePriority === "Medium" 
                                    ? "text-amber-600" 
                                    : "text-blue-600"
                              }`}>
                                {pattern.templatePriority}
                              </span>
                            </p>
                            <p><span className="font-medium">Category:</span> {pattern.templateCategory}</p>
                            <p>
                              <span className="font-medium">Assigned To:</span>{" "}
                              {pattern.templateAssignedTo 
                                ? users.find(u => u.id === pattern.templateAssignedTo)?.username || "Unknown User" 
                                : "Unassigned"}
                            </p>
                            <p><span className="font-medium">Duration:</span> {pattern.templateDurationDays} day(s)</p>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-1">Schedule Information</h4>
                          <div className="space-y-1 text-sm">
                            <p><span className="font-medium">Pattern:</span> {renderPatternDescription(pattern)}</p>
                            <p><span className="font-medium">Starts:</span> {formatDate(pattern.startDate)}</p>
                            {pattern.endDate && (
                              <p><span className="font-medium">Ends:</span> {formatDate(pattern.endDate)}</p>
                            )}
                            {pattern.maxOccurrences && (
                              <p><span className="font-medium">Max occurrences:</span> {pattern.maxOccurrences}</p>
                            )}
                            <p>
                              <span className="font-medium">Tasks generated:</span> {pattern.generatedCount || 0}
                            </p>
                            {pattern.nextGenerationDate && (
                              <p>
                                <span className="font-medium">Next generation:</span> {formatDate(pattern.nextGenerationDate)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2 p-4 pt-0">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(pattern)}
                      >
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDelete(pattern.id)}
                        disabled={deletePatternMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </CardFooter>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Card className="border border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-6">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-medium">No recurring tasks</h3>
                <p className="text-sm text-muted-foreground">
                  Create your first recurring task to automate your workflow.
                </p>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setEditingPattern(null);
                    form.reset({
                      patternType: "daily",
                      pattern: "daily",
                      interval: 1,
                      daysOfWeek: [],
                      startDate: new Date().toISOString(),
                      hasEndDate: false,
                      templateTitle: "",
                      templateDescription: "",
                      templatePriority: "Medium",
                      templateCategory: "work",
                      templateDurationDays: 1,
                      isActive: true,
                    });
                    setOpenDialog(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Recurring Task
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
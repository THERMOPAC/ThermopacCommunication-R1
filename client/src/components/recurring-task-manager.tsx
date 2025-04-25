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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { roles, roleHierarchy } from "@shared/roles";
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
const recurringTaskSchema = z.object({
  // Core fields
  patternType: z.enum(["daily", "weekly", "monthly", "yearly"]), // UI field, maps to 'pattern' in the database
  interval: z.coerce.number().int().min(1, "Interval must be at least 1"),
  
  // Template fields - all required
  templateTitle: z.string().min(1, "Title is required"),
  templateDescription: z.string().min(1, "Description is required"),
  templatePriority: z.enum(["Low", "Medium", "High"]),
  templateCategory: z.string().min(1, "Category is required"),
  templateDurationDays: z.coerce.number().int().min(1, "Duration must be at least 1 day"),
  templateAssignedTo: z.coerce.number().optional(),
  
  // Weekly pattern fields
  daysOfWeek: z.array(z.string()).default([]),
  
  // Monthly pattern fields
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
  
  // Yearly pattern fields
  monthOfYear: z.coerce.number().int().min(1).max(12).optional(),
  
  // Common fields
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().nullable().optional(),
  hasEndDate: z.boolean().default(false),
  maxOccurrences: z.coerce.number().int().min(1).nullable().optional(),
  isActive: z.boolean().default(true),
  
  // System fields - will be set automatically
  userId: z.number().optional(),
  createdBy: z.number().optional(),
  createdAt: z.string().optional(),
  generatedCount: z.number().optional(),
})
.superRefine((data, ctx) => {
  // For weekly pattern, validate days of week
  if (data.patternType === "weekly") {
    if (!Array.isArray(data.daysOfWeek) || data.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Weekly pattern requires at least one day of the week to be selected",
        path: ["daysOfWeek"]
      });
    }
  }
  
  // For monthly pattern, validate day of month
  if (data.patternType === "monthly") {
    if (data.dayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monthly pattern requires a day of the month",
        path: ["dayOfMonth"]
      });
    }
  }
  
  // For yearly pattern, validate month of year and day of month
  if (data.patternType === "yearly") {
    if (data.monthOfYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yearly pattern requires a month of the year",
        path: ["monthOfYear"]
      });
    }
    
    if (data.dayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yearly pattern requires a day of the month",
        path: ["dayOfMonth"]
      });
    }
  }
  
  // Validate end date if hasEndDate is true
  if (data.hasEndDate && (!data.endDate || data.endDate.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date is required when 'Set end date' is enabled",
      path: ["endDate"]
    });
  }
});

type RecurringTaskForm = z.infer<typeof recurringTaskSchema>;

// Define a type for the API submission data
interface RecurringPatternSubmitData {
  pattern: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  startDate: string;
  templateTitle: string;
  templateDescription: string;
  templatePriority: "Low" | "Medium" | "High";
  templateCategory?: string;
  templateDurationDays: number;
  templateAssignedTo?: number;
  userId: number; // Required
  createdBy: number; // Required
  createdAt: string;
  isActive: boolean;
  generatedCount: number;
  daysOfWeek?: string;
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: string | null;
  maxOccurrences?: number | null;
  [key: string]: any; // For dynamic access when validating fields
}

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
  
  // Group users by role for the dropdown
  const groupedUsers = users.length > 0 
    ? [...roles]
      .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
      .reduce((acc: Record<string, User[]>, role: string) => {
        const usersInRole = users.filter(u => u.role === role);
        if (usersInRole.length > 0) {
          acc[role] = usersInRole;
        }
        return acc;
      }, {} as Record<string, User[]>)
    : {};

  // Create a new recurring pattern
  const createPatternMutation = useMutation({
    mutationFn: async (data: RecurringPatternSubmitData) => {
      try {
        console.log("⭐ Creating pattern with data:", JSON.stringify(data, null, 2));
        
        // Data is already formatted correctly from the onSubmit function
        // No need for additional transformations here
        
        // Just validate the required fields as a safety measure
        const requiredFields = ['pattern', 'interval', 'startDate', 'templateTitle', 
          'templateDescription', 'templatePriority', 'userId', 'createdBy'];
          
        const missingFields = requiredFields.filter(field => !(field in data));
        if (missingFields.length > 0) {
          console.error(`⚠️ Missing required fields: ${missingFields.join(', ')}`);
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
        
        console.log("⭐ Submitting data to API:", JSON.stringify(data, null, 2));
        
        const res = await apiRequest("POST", "/api/recurring-patterns", data);
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
        console.log("⭐ Pattern created successfully:", responseData);
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
    mutationFn: async ({ id, data }: { id: number; data: RecurringPatternSubmitData }) => {
      const res = await apiRequest("PATCH", `/api/recurring-patterns/${id}`, data);
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
      patternType: "daily", // This will be transformed to 'pattern' before sending to API
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
      // These will be set automatically from the user
      userId: undefined,
      createdBy: undefined,
      createdAt: undefined,
      generatedCount: undefined,
    },
  });
  
  // Log any form errors
  console.log("Form errors:", form.formState.errors);

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
      
      // Debug for specific pattern types
      if (data.patternType === "weekly") {
        console.log("🔍 WEEKLY PATTERN DEBUG:");
        console.log("  - daysOfWeek:", data.daysOfWeek);
        console.log("  - daysOfWeek type:", typeof data.daysOfWeek);
        console.log("  - daysOfWeek is array:", Array.isArray(data.daysOfWeek));
        console.log("  - daysOfWeek length:", data.daysOfWeek?.length);
      } else if (data.patternType === "monthly") {
        console.log("🔍 MONTHLY PATTERN DEBUG:");
        console.log("  - dayOfMonth:", data.dayOfMonth);
        console.log("  - dayOfMonth type:", typeof data.dayOfMonth);
      } else if (data.patternType === "yearly") {
        console.log("🔍 YEARLY PATTERN DEBUG:");
        console.log("  - monthOfYear:", data.monthOfYear);
        console.log("  - monthOfYear type:", typeof data.monthOfYear);
        console.log("  - dayOfMonth:", data.dayOfMonth);
      }
      
      if (!user) {
        console.error("🔴 No authenticated user found!");
        throw new Error("You must be logged in to create or update recurring tasks");
      }
      
      console.log("🔵 Current user:", JSON.stringify(user, null, 2));
      
      if (editingPattern) {
        console.log("🔵 UPDATING PATTERN:", editingPattern.id);
        console.log("🔵 Data before transformation:", JSON.stringify(data, null, 2));
        
        // The key change here is to map patternType to pattern for update
        const dataToSubmit: RecurringPatternSubmitData = {
          // Core pattern fields
          pattern: data.patternType, // IMPORTANT: Map patternType to pattern for API
          interval: Number(data.interval),
          startDate: data.startDate,
          
          // Template fields
          templateTitle: data.templateTitle,
          templateDescription: data.templateDescription,
          templatePriority: data.templatePriority,
          templateCategory: data.templateCategory || undefined,
          templateDurationDays: Number(data.templateDurationDays),
          templateAssignedTo: data.templateAssignedTo ? Number(data.templateAssignedTo) : undefined,
          
          // Required user fields - preserve the original user
          userId: editingPattern.userId, 
          createdBy: editingPattern.createdBy,
          createdAt: editingPattern.createdAt,
          
          // Status fields - preserve existing status
          isActive: data.isActive || true,
          generatedCount: editingPattern.generatedCount || 0
        };
        
        // Add pattern-specific fields
        if (data.patternType === "weekly") {
          // Weekly patterns require days of week
          if (!data.daysOfWeek || data.daysOfWeek.length === 0) {
            throw new Error("Weekly pattern requires at least one day of the week to be selected");
          }
          dataToSubmit.daysOfWeek = data.daysOfWeek.join(",");
          console.log("🔵 Added daysOfWeek for edit:", dataToSubmit.daysOfWeek);
        }
        
        if (data.patternType === "monthly") {
          // Monthly patterns require day of month
          if (!data.dayOfMonth) {
            throw new Error("Monthly pattern requires a day of the month");
          }
          dataToSubmit.dayOfMonth = Number(data.dayOfMonth);
          console.log("🔵 Added dayOfMonth for edit:", dataToSubmit.dayOfMonth);
        }
        
        if (data.patternType === "yearly") {
          // Yearly patterns require month of year and day of month
          if (!data.monthOfYear) {
            throw new Error("Yearly pattern requires a month of the year");
          }
          if (!data.dayOfMonth) {
            throw new Error("Yearly pattern requires a day of the month");
          }
          dataToSubmit.monthOfYear = Number(data.monthOfYear);
          dataToSubmit.dayOfMonth = Number(data.dayOfMonth);
          console.log("🔵 Added monthOfYear for edit:", dataToSubmit.monthOfYear, "and dayOfMonth:", dataToSubmit.dayOfMonth);
        }
        
        // Add end date or max occurrences if applicable
        if (data.hasEndDate && data.endDate) {
          dataToSubmit.endDate = data.endDate;
        } else {
          dataToSubmit.endDate = undefined; // Don't include if not provided
        }
        
        if (data.maxOccurrences) {
          dataToSubmit.maxOccurrences = Number(data.maxOccurrences);
        } else {
          dataToSubmit.maxOccurrences = undefined; // Don't include if not provided
        }
        
        console.log("🔵 Data for update:", JSON.stringify(dataToSubmit, null, 2));
        
        // Add validation for critical fields
        if (!dataToSubmit.pattern) {
          console.error("🔴 pattern is missing!");
          throw new Error("Pattern type is required");
        }
        
        console.log("🔵 Calling updatePatternMutation with:", editingPattern.id, dataToSubmit);
        updatePatternMutation.mutate({ id: editingPattern.id, data: dataToSubmit });
      } else {
        console.log("🔵 CREATING NEW PATTERN");
        console.log("🔵 Data before transformation:", JSON.stringify(data, null, 2));
        
        // Transform the form data to match API expectations
        // The key change here is to map patternType to pattern
        const dataToSubmit: RecurringPatternSubmitData = {
          // Core pattern fields
          pattern: data.patternType, // IMPORTANT: Map patternType to pattern for API
          interval: Number(data.interval),
          startDate: data.startDate,
          
          // Template fields
          templateTitle: data.templateTitle,
          templateDescription: data.templateDescription,
          templatePriority: data.templatePriority,
          templateCategory: data.templateCategory || undefined,
          templateDurationDays: Number(data.templateDurationDays),
          templateAssignedTo: data.templateAssignedTo ? Number(data.templateAssignedTo) : undefined,
          
          // Required user fields
          userId: Number(user.id),
          createdBy: Number(user.id),
          createdAt: new Date().toISOString(),
          
          // Status fields
          isActive: true,
          generatedCount: 0
        };
        
        // Add pattern-specific fields
        if (data.patternType === "weekly") {
          // Weekly patterns require days of week
          if (!data.daysOfWeek || data.daysOfWeek.length === 0) {
            throw new Error("Weekly pattern requires at least one day of the week to be selected");
          }
          dataToSubmit.daysOfWeek = data.daysOfWeek.join(",");
          console.log("🔵 Added daysOfWeek for new:", dataToSubmit.daysOfWeek);
        }
        
        if (data.patternType === "monthly") {
          // Monthly patterns require day of month
          if (!data.dayOfMonth) {
            throw new Error("Monthly pattern requires a day of the month");
          }
          dataToSubmit.dayOfMonth = Number(data.dayOfMonth);
          console.log("🔵 Added dayOfMonth for new:", dataToSubmit.dayOfMonth);
        }
        
        if (data.patternType === "yearly") {
          // Yearly patterns require month of year and day of month
          if (!data.monthOfYear) {
            throw new Error("Yearly pattern requires a month of the year");
          }
          if (!data.dayOfMonth) {
            throw new Error("Yearly pattern requires a day of the month");
          }
          dataToSubmit.monthOfYear = Number(data.monthOfYear);
          dataToSubmit.dayOfMonth = Number(data.dayOfMonth);
          console.log("🔵 Added monthOfYear for new:", dataToSubmit.monthOfYear, "and dayOfMonth:", dataToSubmit.dayOfMonth);
        }
        
        // Add end date or max occurrences if applicable
        if (data.hasEndDate && data.endDate) {
          dataToSubmit.endDate = data.endDate;
        } else {
          dataToSubmit.endDate = undefined; // Don't include if not provided
        }
        
        if (data.maxOccurrences) {
          dataToSubmit.maxOccurrences = Number(data.maxOccurrences);
        } else {
          dataToSubmit.maxOccurrences = undefined; // Don't include if not provided
        }
        
        console.log("🔵 Final data for API:", JSON.stringify(dataToSubmit, null, 2));
        
        // Validate required fields
        const requiredFields = [
          'pattern', 'interval', 'startDate', 'templateTitle', 
          'templateDescription', 'templatePriority', 'userId', 'createdBy'
        ];
        
        for (const field of requiredFields) {
          if (!(field in dataToSubmit) || dataToSubmit[field] === undefined || dataToSubmit[field] === null) {
            console.error(`🔴 Required field missing: ${field}`);
            throw new Error(`Required field missing: ${field}`);
          }
        }
        
        // Show additional toast to confirm submission
        toast({
          title: "Submitting recurring pattern...",
          description: "Sending data to server",
        });
        
        // Submit the data
        createPatternMutation.mutate(dataToSubmit);
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
  function transformFormDataToPattern(data: RecurringTaskForm): RecurringPatternSubmitData {
    // Create an object with the correct field names for the API
    if (!user || !user.id) {
      throw new Error("User is not logged in or missing ID");
    }
    
    const patternData: RecurringPatternSubmitData = {
      // CRITICAL: Field name mapping - patternType from form → pattern for API/database
      pattern: data.patternType, // This maps to the 'pattern' field expected by the schema
      interval: Number(data.interval),  // Ensure it's a number
      startDate: data.startDate,
      templateTitle: data.templateTitle,
      templateDescription: data.templateDescription,
      templatePriority: data.templatePriority,
      templateCategory: data.templateCategory || undefined, // Set to undefined if empty string
      templateDurationDays: Number(data.templateDurationDays), // Ensure it's a number
      isActive: data.isActive === undefined ? true : Boolean(data.isActive), // Ensure it's a boolean
      // CRITICAL: Always ensure userId and createdBy are set and are numbers
      userId: Number(user.id), // We've validated user.id exists above
      createdBy: Number(user.id), // We've validated user.id exists above
      createdAt: new Date().toISOString(), // Set creation date
      generatedCount: 0 // Initialize to 0 for new patterns
    };

    // Debug log
    console.log("✅ Transformed form data:", JSON.stringify(patternData, null, 2));

    // Explicitly log critical fields to help with debugging
    console.log(`✅ pattern: ${patternData.pattern}, type: ${typeof patternData.pattern}`);
    console.log(`✅ interval: ${patternData.interval}, type: ${typeof patternData.interval}`);
    console.log(`✅ userId: ${patternData.userId}, type: ${typeof patternData.userId}`);
    console.log(`✅ createdBy: ${patternData.createdBy}, type: ${typeof patternData.createdBy}`);

    // Add days of week for weekly pattern - format as a comma-separated string
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

    // Handle the templateAssignedTo field properly
    // If it's undefined, null, or empty string, don't include it
    // Otherwise convert it to a number
    if (data.templateAssignedTo !== undefined && 
        data.templateAssignedTo !== null) {
      // Convert to number or undefined
      const assignedToValue = data.templateAssignedTo ? Number(data.templateAssignedTo) : undefined;
      console.log("Setting templateAssignedTo to:", assignedToValue);
      if (assignedToValue) {
        patternData.templateAssignedTo = assignedToValue;
      }
    } else {
      console.log("No templateAssignedTo provided, leaving field undefined");
    }

    // Add end date if provided
    if (data.hasEndDate && data.endDate) {
      patternData.endDate = data.endDate;
    } else {
      patternData.endDate = undefined;
    }

    // Add max occurrences if provided
    if (data.maxOccurrences) {
      patternData.maxOccurrences = Number(data.maxOccurrences); // Ensure it's a number
    } else {
      patternData.maxOccurrences = undefined;
    }

    return patternData;
  }

  // Function to transform pattern data to form data
  function transformPatternToFormData(pattern: RecurringPattern): RecurringTaskForm {
    const formData: any = {
      // CRITICAL: Field name mapping - pattern from database → patternType for form
      patternType: pattern.pattern, // Map the database 'pattern' field to the form's 'patternType'
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
    if (pattern.pattern === "yearly") {
      if (pattern.monthOfYear) {
        formData.monthOfYear = pattern.monthOfYear;
      }
      // Also add day of month for yearly pattern
      if (pattern.dayOfMonth) {
        formData.dayOfMonth = pattern.dayOfMonth;
      }
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
        <div className="flex space-x-3">
          <Button 
            variant="secondary"
            onClick={async () => {
              try {
                console.log("Processing recurring patterns...");
                toast({
                  title: "Processing recurring patterns...",
                  description: "Generating tasks from active patterns",
                });
                
                console.log("Processing recurring patterns...");
                const response = await apiRequest("POST", "/api/process-recurring-patterns", {});
                console.log("Process response:", response);
                
                // Since our apiRequest already handles response parsing, we can use it directly
                // Only try to parse JSON if there's actual content to parse
                let tasksGenerated = 0;
                if (response && typeof response === 'object' && 'tasksGenerated' in response) {
                  tasksGenerated = response.tasksGenerated || 0;
                }
                
                toast({
                  title: "Patterns processed successfully",
                  description: `${tasksGenerated} new tasks were generated.`,
                });
                
                // Refresh the patterns and tasks lists
                queryClient.invalidateQueries({ queryKey: ["/api/recurring-patterns"] });
                queryClient.invalidateQueries({ queryKey: ["/api/recurring-tasks"] });
              } catch (error) {
                console.error("Error processing patterns:", error);
                toast({
                  title: "Process failed",
                  description: error instanceof Error ? error.message : "An unknown error occurred",
                  variant: "destructive",
                });
              }
            }}
          >
            Process Recurring Patterns
          </Button>
          
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                console.log("Add Recurring Task button clicked");
                setEditingPattern(null);
                form.reset({
                  patternType: "daily", // This maps to 'pattern' in the DB
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
                  // These will be set from the user when submitted
                  userId: undefined,
                  createdBy: undefined,
                  createdAt: undefined,
                  generatedCount: undefined,
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
                                  // No need to sync with pattern field anymore, as it's handled in the transformation
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
                        </div>
                      )}
                      
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
                                      variant={"outline"}
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
                                    onSelect={(date) => {
                                      field.onChange(date ? date.toISOString() : "");
                                    }}
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
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>
                                  Set end date
                                </FormLabel>
                                <FormDescription>
                                  Specify when to stop generating tasks from this pattern
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                        
                        {form.watch("hasEndDate") && (
                          <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>End date</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
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
                                      onSelect={(date) => {
                                        field.onChange(date ? date.toISOString() : "");
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                        
                        {!form.watch("hasEndDate") && (
                          <FormField
                            control={form.control}
                            name="maxOccurrences"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Maximum occurrences</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                    placeholder="Optional"
                                  />
                                </FormControl>
                                <FormDescription>
                                  Limit the number of tasks to generate (leave empty for no limit)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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
                            <FormLabel>Task Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter task title"
                                {...field}
                                className="w-full"
                              />
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
                                {...field}
                                className="min-h-[120px]"
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
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="work">Work</SelectItem>
                                  <SelectItem value="personal">Personal</SelectItem>
                                  <SelectItem value="finance">Finance</SelectItem>
                                  <SelectItem value="health">Health</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
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
                                Expected days to complete this task
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="templateAssignedTo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Assign to</FormLabel>
                              <Select 
                                onValueChange={(value) => {
                                  // If value is "0" (unassigned), set to undefined
                                  field.onChange(value === "0" ? undefined : parseInt(value));
                                }}
                                defaultValue={field.value?.toString() || "0"}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Assign to user" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="0">Unassigned</SelectItem>
                                  {Object.entries(groupedUsers).map(([role, users]) => (
                                    <SelectGroup key={role}>
                                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                        {role}s
                                      </SelectLabel>
                                      {users.map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                          {user.username}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Leave empty to assign later
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
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
                                Only active patterns will generate new tasks
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                  </Tabs>
                  
                  <DialogFooter className="flex flex-col space-y-2">
                    {Object.keys(form.formState.errors).length > 0 && (
                      <div className="w-full p-2 mb-2 text-sm text-red-800 bg-red-100 rounded-md">
                        <p className="font-medium">Please fix the following errors:</p>
                        <ul className="ml-4 list-disc">
                          {Object.entries(form.formState.errors).map(([field, error]) => (
                            <li key={field}>
                              {field}: {error?.message as string}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-end space-x-2 w-full">
                      <Button variant="outline" type="button" onClick={() => setOpenDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        onClick={() => {
                          console.log("Submit button clicked");
                          console.log("Form values:", form.getValues());
                          console.log("Form errors:", form.formState.errors);
                        }}
                      >
                        {editingPattern ? "Update Pattern" : "Create Pattern"}
                      </Button>
                    </div>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {patternsLoading ? (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : patterns.length > 0 ? (
        <div className="space-y-4">
          <Accordion type="multiple" className="w-full">
            {patterns.map((pattern: RecurringPattern) => (
              <AccordionItem value={`pattern-${pattern.id}`} key={pattern.id}>
                <AccordionTrigger className="hover:no-underline px-4 py-2 hover:bg-muted/50 rounded-lg">
                  <div className="flex-1 flex items-center justify-between mr-2">
                    <div>
                      <h3 className="text-sm font-semibold">{pattern.templateTitle}</h3>
                      <p className="text-xs text-muted-foreground">{renderPatternDescription(pattern)}</p>
                    </div>
                    <div className="flex items-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${pattern.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {pattern.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold text-sm">Description</h4>
                        <p className="text-sm text-muted-foreground">{pattern.templateDescription}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Priority:</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            pattern.templatePriority === 'High' ? 'bg-red-100 text-red-800' :
                            pattern.templatePriority === 'Medium' ? 'bg-amber-100 text-amber-800' :
                            'bg-green-100 text-green-800'
                          }`}>{pattern.templatePriority}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Category:</span>
                          <span className="text-sm">{pattern.templateCategory}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Duration:</span>
                          <span className="text-sm">{pattern.templateDurationDays} day(s)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">Tasks Generated:</span>
                          <span className="text-sm">{pattern.generatedCount}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(pattern)}
                      >
                        <Edit className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(pattern.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : (
        <div className="text-center my-8 p-6 border rounded-lg bg-muted/20">
          <h3 className="font-medium text-lg mb-2">No recurring task patterns yet</h3>
          <p className="text-muted-foreground mb-4">Create your first recurring task pattern to automate task generation.</p>
        </div>
      )}
    </div>
  );
}
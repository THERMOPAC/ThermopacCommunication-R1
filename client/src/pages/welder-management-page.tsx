import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, Search, UserCheck, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Layout from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

// Define interfaces for our data
interface Welder {
  id: number;
  welderId: string;
  name: string;
  trade: string;
  processQualified: string[];
  materialGroupQualified: string[];
  thicknessRange: string;
  positionQualified: string[];
  wpsNumber: string;
  testDate: string;
  testResults: string;
  certificateNo: string;
  certificateExpiryDate: string;
  status: string;
  remarks: string;
}

interface WelderFormData {
  name: string;
  trade: string;
  processQualified: string[];
  materialGroupQualified: string[];
  thicknessRange: string;
  positionQualified: string[];
  wpsNumber: string;
  testDate: string;
  testResults: string;
  certificateExpiryDate: string;
  status: string;
  remarks: string;
}

// Form validation schema
const welderFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  trade: z.string().min(1, "Please select a trade"),
  processQualified: z.array(z.string()).min(1, "Select at least one process"),
  materialGroupQualified: z.array(z.string()).min(1, "Select at least one material group"),
  thicknessRange: z.string().min(1, "Thickness range is required"),
  positionQualified: z.array(z.string()).min(1, "Select at least one position"),
  wpsNumber: z.string().min(1, "WPQR number is required"),
  testDate: z.string().min(1, "Test date is required"),
  testResults: z.string().min(1, "Test result is required"),
  certificateExpiryDate: z.string().min(1, "Certificate expiry date is required"),
  status: z.string().min(1, "Status is required"),
  remarks: z.string().optional().or(z.literal("")),
});

const processOptions = ["SMAW", "GTAW", "FCAW", "SAW"];
const materialGroupOptions = ["Carbon Steel", "Stainless Steel", "Alloy Steel"];
const positionOptions = ["1G", "2G", "3G", "4G", "5G", "6G"];
const tradeOptions = ["Welder", "Fitter", "Fabricator"];
const testResultOptions = ["Passed", "Failed"];
const statusOptions = ["Active", "Expired", "Revoked"];

export default function WelderManagementPage() {
  const { toast } = useToast();
  const [isAddWelderOpen, setIsAddWelderOpen] = useState(false);
  const [isEditWelderOpen, setIsEditWelderOpen] = useState(false);
  const [selectedWelder, setSelectedWelder] = useState<Welder | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  // Handle status filter selection
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value === "all_statuses" ? null : value);
  };
  
  // Fetch WPQR data for dropdown
  const { data: wpqrData = [] } = useQuery<any[]>({
    queryKey: ["/api/quality/wpqr"],
    staleTime: 60000, // 1 minute
    onError: (error) => {
      console.error("Error fetching WPQR data:", error);
    }
  });
  
  // Fetch welders data
  const { data: welders = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/quality/welders"],
    onSuccess: () => {
      console.log("Welders data loaded successfully");
    },
    onError: (error) => {
      toast({
        title: "Error loading welders",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create new welder mutation
  const createWelderMutation = useMutation({
    mutationFn: async (data: WelderFormData) => {
      const response = await apiRequest("POST", "/api/quality/welders", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Welder record created successfully",
      });
      setIsAddWelderOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/quality/welders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating welder record",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update welder mutation
  const updateWelderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: WelderFormData }) => {
      const response = await apiRequest("PUT", `/api/quality/welders/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Welder record updated successfully",
      });
      setIsEditWelderOpen(false);
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/quality/welders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating welder record",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form setup for adding a new welder
  const form = useForm<z.infer<typeof welderFormSchema>>({
    resolver: zodResolver(welderFormSchema),
    defaultValues: {
      name: "",
      trade: "",
      processQualified: [],
      materialGroupQualified: [],
      thicknessRange: "",
      positionQualified: [],
      wpsNumber: "",
      testDate: "",
      testResults: "",
      certificateExpiryDate: "",
      status: "Active",
      remarks: "",
    },
  });

  // Form setup for editing a welder
  const editForm = useForm<z.infer<typeof welderFormSchema>>({
    resolver: zodResolver(welderFormSchema),
    defaultValues: {
      name: "",
      trade: "",
      processQualified: [],
      materialGroupQualified: [],
      thicknessRange: "",
      positionQualified: [],
      wpsNumber: "",
      testDate: "",
      testResults: "",
      certificateExpiryDate: "",
      status: "",
      remarks: "",
    },
  });

  // Calculate dashboard statistics
  const totalWelders = Array.isArray(welders) ? welders.length : 0;
  const activeWelders = Array.isArray(welders) ? welders.filter((w: any) => w.status === "Active").length : 0;
  const expiringWelders = Array.isArray(welders) ? welders.filter((w: any) => {
    if (w.status !== "Active") return false;
    const expiryDate = new Date(w.certificateExpiryDate);
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);
    return expiryDate <= thirtyDaysLater && expiryDate > today;
  }).length : 0;
  const expiredWelders = Array.isArray(welders) ? welders.filter((w: any) => w.status === "Expired").length : 0;

  // Filter welders based on search term and status filter
  const filteredWelders = Array.isArray(welders) ? welders.filter((welder: any) => {
    const matchesSearch = 
      welder.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.welderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.wpsNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (Array.isArray(welder.processQualified) && welder.processQualified.some((p: string) => p.toLowerCase().includes(searchTerm.toLowerCase())));
    
    const matchesStatusFilter = statusFilter === null || welder.status === statusFilter;
    
    return matchesSearch && matchesStatusFilter;
  }) : [];

  // Submit handler for adding a new welder
  const onSubmit = (values: z.infer<typeof welderFormSchema>) => {
    createWelderMutation.mutate({
      ...values,
      remarks: values.remarks || ""
    });
  };

  // Submit handler for editing a welder
  const onEditSubmit = (values: z.infer<typeof welderFormSchema>) => {
    if (selectedWelder) {
      updateWelderMutation.mutate({ 
        id: selectedWelder.id, 
        data: {
          ...values,
          remarks: values.remarks || ""
        }
      });
    }
  };

  // Set up the edit form when a welder is selected for editing
  useEffect(() => {
    if (selectedWelder) {
      editForm.reset({
        name: selectedWelder.name,
        trade: selectedWelder.trade,
        processQualified: selectedWelder.processQualified,
        materialGroupQualified: selectedWelder.materialGroupQualified,
        thicknessRange: selectedWelder.thicknessRange,
        positionQualified: selectedWelder.positionQualified,
        wpsNumber: selectedWelder.wpsNumber,
        testDate: selectedWelder.testDate,
        testResults: selectedWelder.testResults,
        certificateExpiryDate: selectedWelder.certificateExpiryDate,
        status: selectedWelder.status,
        remarks: selectedWelder.remarks,
      });
    }
  }, [selectedWelder, editForm]);

  // Handle edit button click
  const handleEditClick = (welder: Welder) => {
    setSelectedWelder(welder);
    setIsEditWelderOpen(true);
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch(status) {
      case "Active":
        return <Badge className="bg-green-500">{status}</Badge>;
      case "Expired":
        return <Badge variant="destructive">{status}</Badge>;
      case "Revoked":
        return <Badge variant="outline" className="border-red-500 text-red-500">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Check if certificate is expiring soon (within 30 days)
  const isExpiringSoon = (expiryDateStr: string) => {
    const expiryDate = new Date(expiryDateStr);
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);
    return expiryDate <= thirtyDaysLater && expiryDate > today;
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Welder Management</h1>
          <Dialog open={isAddWelderOpen} onOpenChange={setIsAddWelderOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add New Welder
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Welder</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="basic">Basic Information</TabsTrigger>
                      <TabsTrigger value="qualification">Qualification Details</TabsTrigger>
                    </TabsList>
                    <TabsContent value="basic" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Welder Name*</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter welder's full name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="trade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Trade*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select trade" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {tradeOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
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
                          name="processQualified"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Process Qualified*</FormLabel>
                              <div className="space-y-2">
                                {processOptions.map((process) => (
                                  <div className="flex items-center space-x-2" key={process}>
                                    <Checkbox
                                      id={`process-${process}`}
                                      checked={field.value?.includes(process)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          field.onChange([...field.value, process]);
                                        } else {
                                          field.onChange(
                                            field.value?.filter((value) => value !== process)
                                          );
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={`process-${process}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {process}
                                    </label>
                                  </div>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="materialGroupQualified"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Material Group Qualified*</FormLabel>
                              <div className="space-y-2">
                                {materialGroupOptions.map((material) => (
                                  <div className="flex items-center space-x-2" key={material}>
                                    <Checkbox
                                      id={`material-${material}`}
                                      checked={field.value?.includes(material)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          field.onChange([...field.value, material]);
                                        } else {
                                          field.onChange(
                                            field.value?.filter((value) => value !== material)
                                          );
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={`material-${material}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {material}
                                    </label>
                                  </div>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="thicknessRange"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Thickness Range*</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 5-10mm" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="positionQualified"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Position Qualified*</FormLabel>
                              <div className="space-y-2">
                                {positionOptions.map((position) => (
                                  <div className="flex items-center space-x-2" key={position}>
                                    <Checkbox
                                      id={`position-${position}`}
                                      checked={field.value?.includes(position)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          field.onChange([...field.value, position]);
                                        } else {
                                          field.onChange(
                                            field.value?.filter((value) => value !== position)
                                          );
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor={`position-${position}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {position}
                                    </label>
                                  </div>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="qualification" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="wpsNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>WPQR Number*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select WPQR number" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Array.isArray(wpqrData) && wpqrData.length > 0 ? (
                                    wpqrData.map((wpqr: any) => (
                                      <SelectItem key={wpqr.documentId} value={wpqr.documentId || "no_number"}>
                                        {wpqr.documentId || "No Number"}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="no_wpqr_available" disabled>No WPQR available</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="testDate"
                          render={({ field }) => {
                            // Parse date value for controlled inputs
                            const dateValue = field.value ? new Date(field.value) : new Date();
                            const [day, setDay] = useState(field.value ? dateValue.getDate().toString() : "");
                            const [month, setMonth] = useState(field.value ? (dateValue.getMonth() + 1).toString() : "");
                            const [year, setYear] = useState(field.value ? dateValue.getFullYear().toString() : "");
                            
                            // Update field value when day, month, or year changes
                            const updateDate = (newDay: string, newMonth: string, newYear: string) => {
                              if (newDay && newMonth && newYear) {
                                const dateStr = `${newYear}-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`;
                                field.onChange(dateStr);
                              }
                            };

                            // Generate options for days, months, and years
                            const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
                            const months = [
                              { value: "1", label: "January" },
                              { value: "2", label: "February" },
                              { value: "3", label: "March" },
                              { value: "4", label: "April" },
                              { value: "5", label: "May" },
                              { value: "6", label: "June" },
                              { value: "7", label: "July" },
                              { value: "8", label: "August" },
                              { value: "9", label: "September" },
                              { value: "10", label: "October" },
                              { value: "11", label: "November" },
                              { value: "12", label: "December" },
                            ];
                            const years = Array.from(
                              { length: 51 }, 
                              (_, i) => (2000 + i).toString()
                            );

                            return (
                              <FormItem>
                                <FormLabel>Test Date*</FormLabel>
                                <div className="flex space-x-2">
                                  {/* Day Select */}
                                  <Select
                                    value={day}
                                    onValueChange={(value) => {
                                      setDay(value);
                                      updateDate(value, month, year);
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-[80px]">
                                        <SelectValue placeholder="Day" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {days.map((d) => (
                                        <SelectItem key={d} value={d}>
                                          {d}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Month Select */}
                                  <Select
                                    value={month}
                                    onValueChange={(value) => {
                                      setMonth(value);
                                      updateDate(day, value, year);
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Month" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {months.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>
                                          {m.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Year Select */}
                                  <Select
                                    value={year}
                                    onValueChange={(value) => {
                                      setYear(value);
                                      updateDate(day, month, value);
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-[90px]">
                                        <SelectValue placeholder="Year" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {years.map((y) => (
                                        <SelectItem key={y} value={y}>
                                          {y}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name="testResults"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Test Results*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select test result" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {testResultOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
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
                          name="certificateExpiryDate"
                          render={({ field }) => {
                            // Parse date value for controlled inputs
                            const dateValue = field.value ? new Date(field.value) : new Date();
                            const [day, setDay] = useState(field.value ? dateValue.getDate().toString() : "");
                            const [month, setMonth] = useState(field.value ? (dateValue.getMonth() + 1).toString() : "");
                            const [year, setYear] = useState(field.value ? dateValue.getFullYear().toString() : "");
                            
                            // Update field value when day, month, or year changes
                            const updateDate = (newDay: string, newMonth: string, newYear: string) => {
                              if (newDay && newMonth && newYear) {
                                const dateStr = `${newYear}-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`;
                                field.onChange(dateStr);
                              }
                            };

                            // Generate options for days, months, and years
                            const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
                            const months = [
                              { value: "1", label: "January" },
                              { value: "2", label: "February" },
                              { value: "3", label: "March" },
                              { value: "4", label: "April" },
                              { value: "5", label: "May" },
                              { value: "6", label: "June" },
                              { value: "7", label: "July" },
                              { value: "8", label: "August" },
                              { value: "9", label: "September" },
                              { value: "10", label: "October" },
                              { value: "11", label: "November" },
                              { value: "12", label: "December" },
                            ];
                            const years = Array.from(
                              { length: 51 }, 
                              (_, i) => (2000 + i).toString()
                            );

                            return (
                              <FormItem>
                                <FormLabel>Certificate Expiry Date*</FormLabel>
                                <div className="flex space-x-2">
                                  {/* Day Select */}
                                  <Select
                                    value={day}
                                    onValueChange={(value) => {
                                      setDay(value);
                                      updateDate(value, month, year);
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-[80px]">
                                        <SelectValue placeholder="Day" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {days.map((d) => (
                                        <SelectItem key={d} value={d}>
                                          {d}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Month Select */}
                                  <Select
                                    value={month}
                                    onValueChange={(value) => {
                                      setMonth(value);
                                      updateDate(day, value, year);
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Month" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {months.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>
                                          {m.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Year Select */}
                                  <Select
                                    value={year}
                                    onValueChange={(value) => {
                                      setYear(value);
                                      updateDate(day, month, value);
                                    }}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="w-[90px]">
                                        <SelectValue placeholder="Year" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {years.map((y) => (
                                        <SelectItem key={y} value={y}>
                                          {y}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status*</FormLabel>
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
                                  {statusOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
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
                          name="remarks"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Remarks</FormLabel>
                              <FormControl>
                                <Input placeholder="Optional notes" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsAddWelderOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createWelderMutation.isPending}>
                          {createWelderMutation.isPending ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                          ) : (
                            "Create Welder"
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Welders
              </CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWelders}</div>
              <p className="text-xs text-muted-foreground">
                Registered welders
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Welders
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeWelders}</div>
              <p className="text-xs text-muted-foreground">
                With valid certification
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Expiring Soon
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringWelders}</div>
              <p className="text-xs text-muted-foreground">
                Expiring within 30 days
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Expired Certifications
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiredWelders}</div>
              <p className="text-xs text-muted-foreground">
                Need recertification
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, welder ID, WPQR number..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter || "all_statuses"}
            onValueChange={handleStatusFilterChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_statuses">All Statuses</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Welders Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Welder ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Processes</TableHead>
                <TableHead>WPQR Number</TableHead>
                <TableHead>Certificate No.</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <span className="mt-2 block text-sm text-muted-foreground">Loading welder data...</span>
                  </TableCell>
                </TableRow>
              ) : filteredWelders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    {searchTerm || statusFilter ? (
                      <span className="text-sm text-muted-foreground">No welders found matching your search criteria.</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No welders have been added yet.</span>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredWelders.map((welder: any) => (
                  <TableRow key={welder.id}>
                    <TableCell className="font-medium">{welder.welderId}</TableCell>
                    <TableCell>{welder.name}</TableCell>
                    <TableCell>
                      {Array.isArray(welder.processQualified) ? welder.processQualified.join(", ") : ""}
                    </TableCell>
                    <TableCell>{welder.wpsNumber}</TableCell>
                    <TableCell>{welder.certificateNo}</TableCell>
                    <TableCell className={isExpiringSoon(welder.certificateExpiryDate) ? "text-amber-500 font-medium" : ""}>
                      {new Date(welder.certificateExpiryDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(welder.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="16" 
                              height="16" 
                              fill="currentColor" 
                              className="bi bi-three-dots-vertical" 
                              viewBox="0 0 16 16"
                            >
                              <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
                            </svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditClick(welder)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              // Delete functionality would go here
                              toast({
                                title: "Not implemented",
                                description: "Delete functionality is not yet implemented",
                                variant: "destructive",
                              });
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Welder Dialog */}
        <Dialog open={isEditWelderOpen} onOpenChange={setIsEditWelderOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Welder</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic Information</TabsTrigger>
                    <TabsTrigger value="qualification">Qualification Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Welder Name*</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter welder's full name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="trade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade*</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select trade" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {tradeOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="processQualified"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Process Qualified*</FormLabel>
                            <div className="space-y-2">
                              {processOptions.map((process) => (
                                <div className="flex items-center space-x-2" key={process}>
                                  <Checkbox
                                    id={`edit-process-${process}`}
                                    checked={field.value?.includes(process)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange([...field.value, process]);
                                      } else {
                                        field.onChange(
                                          field.value?.filter((value) => value !== process)
                                        );
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`edit-process-${process}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    {process}
                                  </label>
                                </div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="materialGroupQualified"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Material Group Qualified*</FormLabel>
                            <div className="space-y-2">
                              {materialGroupOptions.map((material) => (
                                <div className="flex items-center space-x-2" key={material}>
                                  <Checkbox
                                    id={`edit-material-${material}`}
                                    checked={field.value?.includes(material)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange([...field.value, material]);
                                      } else {
                                        field.onChange(
                                          field.value?.filter((value) => value !== material)
                                        );
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`edit-material-${material}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    {material}
                                  </label>
                                </div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="thicknessRange"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Thickness Range*</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. 5-10mm" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="positionQualified"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Position Qualified*</FormLabel>
                            <div className="space-y-2">
                              {positionOptions.map((position) => (
                                <div className="flex items-center space-x-2" key={position}>
                                  <Checkbox
                                    id={`edit-position-${position}`}
                                    checked={field.value?.includes(position)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange([...field.value, position]);
                                      } else {
                                        field.onChange(
                                          field.value?.filter((value) => value !== position)
                                        );
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`edit-position-${position}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                  >
                                    {position}
                                  </label>
                                </div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="qualification" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="wpsNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>WPQR Number*</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select WPQR number" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Array.isArray(wpqrData) && wpqrData.length > 0 ? (
                                  wpqrData.map((wpqr: any) => (
                                    <SelectItem key={wpqr.documentId} value={wpqr.documentId || "no_number"}>
                                      {wpqr.documentId || "No Number"}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="no_wpqr_available" disabled>No WPQR available</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="testDate"
                        render={({ field }) => {
                          // Parse date value for controlled inputs
                          const dateValue = field.value ? new Date(field.value) : new Date();
                          const [day, setDay] = useState(field.value ? dateValue.getDate().toString() : "");
                          const [month, setMonth] = useState(field.value ? (dateValue.getMonth() + 1).toString() : "");
                          const [year, setYear] = useState(field.value ? dateValue.getFullYear().toString() : "");
                          
                          // Update field value when day, month, or year changes
                          const updateDate = (newDay: string, newMonth: string, newYear: string) => {
                            if (newDay && newMonth && newYear) {
                              const dateStr = `${newYear}-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`;
                              field.onChange(dateStr);
                            }
                          };

                          // Generate options for days, months, and years
                          const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
                          const months = [
                            { value: "1", label: "January" },
                            { value: "2", label: "February" },
                            { value: "3", label: "March" },
                            { value: "4", label: "April" },
                            { value: "5", label: "May" },
                            { value: "6", label: "June" },
                            { value: "7", label: "July" },
                            { value: "8", label: "August" },
                            { value: "9", label: "September" },
                            { value: "10", label: "October" },
                            { value: "11", label: "November" },
                            { value: "12", label: "December" },
                          ];
                          const years = Array.from(
                            { length: 51 }, 
                            (_, i) => (2000 + i).toString()
                          );

                          return (
                            <FormItem>
                              <FormLabel>Test Date*</FormLabel>
                              <div className="flex space-x-2">
                                {/* Day Select */}
                                <Select
                                  value={day}
                                  onValueChange={(value) => {
                                    setDay(value);
                                    updateDate(value, month, year);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-[80px]">
                                      <SelectValue placeholder="Day" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {days.map((d) => (
                                      <SelectItem key={d} value={d}>
                                        {d}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Month Select */}
                                <Select
                                  value={month}
                                  onValueChange={(value) => {
                                    setMonth(value);
                                    updateDate(day, value, year);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-[120px]">
                                      <SelectValue placeholder="Month" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {months.map((m) => (
                                      <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Year Select */}
                                <Select
                                  value={year}
                                  onValueChange={(value) => {
                                    setYear(value);
                                    updateDate(day, month, value);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-[90px]">
                                      <SelectValue placeholder="Year" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {years.map((y) => (
                                      <SelectItem key={y} value={y}>
                                        {y}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                      <FormField
                        control={editForm.control}
                        name="testResults"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Test Results*</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select test result" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {testResultOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="certificateExpiryDate"
                        render={({ field }) => {
                          // Parse date value for controlled inputs
                          const dateValue = field.value ? new Date(field.value) : new Date();
                          const [day, setDay] = useState(field.value ? dateValue.getDate().toString() : "");
                          const [month, setMonth] = useState(field.value ? (dateValue.getMonth() + 1).toString() : "");
                          const [year, setYear] = useState(field.value ? dateValue.getFullYear().toString() : "");
                          
                          // Update field value when day, month, or year changes
                          const updateDate = (newDay: string, newMonth: string, newYear: string) => {
                            if (newDay && newMonth && newYear) {
                              const dateStr = `${newYear}-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`;
                              field.onChange(dateStr);
                            }
                          };

                          // Generate options for days, months, and years
                          const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
                          const months = [
                            { value: "1", label: "January" },
                            { value: "2", label: "February" },
                            { value: "3", label: "March" },
                            { value: "4", label: "April" },
                            { value: "5", label: "May" },
                            { value: "6", label: "June" },
                            { value: "7", label: "July" },
                            { value: "8", label: "August" },
                            { value: "9", label: "September" },
                            { value: "10", label: "October" },
                            { value: "11", label: "November" },
                            { value: "12", label: "December" },
                          ];
                          const years = Array.from(
                            { length: 51 }, 
                            (_, i) => (2000 + i).toString()
                          );

                          return (
                            <FormItem>
                              <FormLabel>Certificate Expiry Date*</FormLabel>
                              <div className="flex space-x-2">
                                {/* Day Select */}
                                <Select
                                  value={day}
                                  onValueChange={(value) => {
                                    setDay(value);
                                    updateDate(value, month, year);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-[80px]">
                                      <SelectValue placeholder="Day" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {days.map((d) => (
                                      <SelectItem key={d} value={d}>
                                        {d}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Month Select */}
                                <Select
                                  value={month}
                                  onValueChange={(value) => {
                                    setMonth(value);
                                    updateDate(day, value, year);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-[120px]">
                                      <SelectValue placeholder="Month" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {months.map((m) => (
                                      <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Year Select */}
                                <Select
                                  value={year}
                                  onValueChange={(value) => {
                                    setYear(value);
                                    updateDate(day, month, value);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-[90px]">
                                      <SelectValue placeholder="Year" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {years.map((y) => (
                                      <SelectItem key={y} value={y}>
                                        {y}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                      <FormField
                        control={editForm.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status*</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {statusOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remarks</FormLabel>
                            <FormControl>
                              <Input placeholder="Optional notes" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditWelderOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateWelderMutation.isPending}>
                        {updateWelderMutation.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                        ) : (
                          "Update Welder"
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// Helper function to format date
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, PlusCircle, Search, UserCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
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
  wpsNumber: z.string().min(1, "WPS number is required"),
  testDate: z.string().min(1, "Test date is required"),
  testResults: z.string().min(1, "Test result is required"),
  certificateExpiryDate: z.string().min(1, "Certificate expiry date is required"),
  status: z.string().min(1, "Status is required"),
  remarks: z.string().optional(),
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
  
  // Fetch WPS data for dropdown
  const { data: wpsData = [] } = useQuery({
    queryKey: ["/api/quality/wps"],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch welders data
  const { data: welders = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/quality/welders"],
    onError: (error: Error) => {
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
  const totalWelders = welders.length;
  const activeWelders = welders.filter(w => w.status === "Active").length;
  const expiringWelders = welders.filter(w => {
    if (w.status !== "Active") return false;
    const expiryDate = new Date(w.certificateExpiryDate);
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);
    return expiryDate <= thirtyDaysLater && expiryDate > today;
  }).length;
  const expiredWelders = welders.filter(w => w.status === "Expired").length;

  // Filter welders based on search term and status filter
  const filteredWelders = welders.filter(welder => {
    const matchesSearch = 
      welder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.welderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.wpsNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.processQualified.some(p => p.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatusFilter = statusFilter === null || welder.status === statusFilter;
    
    return matchesSearch && matchesStatusFilter;
  });

  // Submit handler for adding a new welder
  const onSubmit = (values: z.infer<typeof welderFormSchema>) => {
    createWelderMutation.mutate(values);
  };

  // Submit handler for editing a welder
  const onEditSubmit = (values: z.infer<typeof welderFormSchema>) => {
    if (selectedWelder) {
      updateWelderMutation.mutate({ id: selectedWelder.id, data: values });
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
                    </TabsContent>
                    <TabsContent value="qualification" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="thicknessRange"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Thickness Range*</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 3mm - 20mm" {...field} />
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
                        <FormField
                          control={form.control}
                          name="wpsNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>WPS Number*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select WPS number" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {wpsData.map((wps: any) => (
                                    <SelectItem key={wps.wpsNumber} value={wps.wpsNumber}>
                                      {wps.wpsNumber}
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
                          name="testDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Test Date*</FormLabel>
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
                                    onSelect={(date) => field.onChange(date ? date.toISOString() : "")}
                                    disabled={(date) => date > new Date()}
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
                                    <SelectValue placeholder="Select result" />
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
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Certificate Expiry Date*</FormLabel>
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
                                    onSelect={(date) => field.onChange(date ? date.toISOString() : "")}
                                    disabled={(date) => date < new Date()}
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
                            <FormItem className="col-span-2">
                              <FormLabel>Remarks</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Enter any additional notes or remarks" 
                                  rows={3}
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setIsAddWelderOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createWelderMutation.isPending}>
                      {createWelderMutation.isPending ? "Saving..." : "Save Welder"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

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
                    </TabsContent>
                    <TabsContent value="qualification" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={editForm.control}
                          name="thicknessRange"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Thickness Range*</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 3mm - 20mm" {...field} />
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
                        <FormField
                          control={editForm.control}
                          name="wpsNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>WPS Number*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select WPS number" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {wpsData.map((wps: any) => (
                                    <SelectItem key={wps.wpsNumber} value={wps.wpsNumber}>
                                      {wps.wpsNumber}
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
                          name="testDate"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Test Date*</FormLabel>
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
                                    onSelect={(date) => field.onChange(date ? date.toISOString() : "")}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editForm.control}
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
                                    <SelectValue placeholder="Select result" />
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
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Certificate Expiry Date*</FormLabel>
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
                                    onSelect={(date) => field.onChange(date ? date.toISOString() : "")}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editForm.control}
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
                          control={editForm.control}
                          name="remarks"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Remarks</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Enter any additional notes or remarks" 
                                  rows={3}
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setIsEditWelderOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateWelderMutation.isPending}>
                      {updateWelderMutation.isPending ? "Updating..." : "Update Welder"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Total Welders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalWelders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Active Welders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                <div className="text-3xl font-bold">{activeWelders}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
                <div className="text-3xl font-bold">{expiringWelders}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Expired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                <div className="text-3xl font-bold">{expiredWelders}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search welders by name, ID, WPS number, or process"
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {statusFilter ? `Filter: ${statusFilter}` : "Filter by Status"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setStatusFilter(null)}>
                All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Active")}>
                Active
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Expired")}>
                Expired
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Revoked")}>
                Revoked
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        {/* Welders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Welder Qualification Records</CardTitle>
            <CardDescription>
              Manage and track welder qualifications, certificates, and status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Loading welders...</span>
                </div>
              </div>
            ) : filteredWelders.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Welder ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Process</TableHead>
                      <TableHead>Certificate No</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWelders.map((welder) => (
                      <TableRow key={welder.id} className={isExpiringSoon(welder.certificateExpiryDate) && welder.status === 'Active' ? 'bg-amber-50' : ''}>
                        <TableCell className="font-medium">{welder.welderId}</TableCell>
                        <TableCell>{welder.name}</TableCell>
                        <TableCell>{welder.processQualified.join(", ")}</TableCell>
                        <TableCell>{welder.certificateNo}</TableCell>
                        <TableCell className={
                          isExpiringSoon(welder.certificateExpiryDate) && welder.status === 'Active' 
                            ? 'text-amber-600 font-medium' 
                            : ''
                        }>
                          {format(new Date(welder.certificateExpiryDate), "dd MMM yyyy")}
                          {isExpiringSoon(welder.certificateExpiryDate) && welder.status === 'Active' && (
                            <span className="ml-2 text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded">
                              Expiring Soon
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(welder.status)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditClick(welder)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                <UserCheck className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="text-lg font-medium">No welders found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter
                    ? "Try adjusting your search or filter criteria"
                    : "Add a new welder to get started"}
                </p>
                {(searchTerm || statusFilter) && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter(null);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
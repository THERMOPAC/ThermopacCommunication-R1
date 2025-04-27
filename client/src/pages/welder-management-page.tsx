import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { Search, Plus, FileText, MoreHorizontal, AlertTriangle, CheckCircle } from "lucide-react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Types
interface Welder {
  id: number;
  welderId: string;
  welderName: string;
  trade: string;
  processQualified: string[];
  materialGroupQualified: string[];
  thicknessRange: string;
  positionQualified: string[];
  certificateNo: string;
  testDate: string;
  testResults: string;
  certificateExpiryDate: string;
  status: 'Active' | 'Expired' | 'Revoked';
  remarks?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

// Form schema for adding/editing welders
const welderFormSchema = z.object({
  welderName: z.string().min(1, "Welder name is required"),
  trade: z.string().min(1, "Trade is required"),
  processQualified: z.array(z.string()).min(1, "At least one process must be selected"),
  materialGroupQualified: z.array(z.string()).min(1, "At least one material group must be selected"),
  thicknessRange: z.string().min(1, "Thickness range is required"),
  positionQualified: z.array(z.string()).min(1, "At least one position must be selected"),
  wpsId: z.string().min(1, "WPS number is required"),
  testDate: z.date({
    required_error: "Test date is required",
  }),
  testResults: z.string().min(1, "Test result is required"),
  certificateExpiryDate: z.date({
    required_error: "Certificate expiry date is required",
  }).refine(date => {
    const today = new Date();
    return date > today;
  }, {
    message: "Expiry date must be in the future",
  }),
  status: z.string().min(1, "Status is required"),
  remarks: z.string().optional(),
});

type WelderFormValues = z.infer<typeof welderFormSchema>;

export default function WelderManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [isAddWelderOpen, setIsAddWelderOpen] = useState(false);
  const [isEditWelderOpen, setIsEditWelderOpen] = useState(false);
  const [selectedWelder, setSelectedWelder] = useState<Welder | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all_welders");
  
  // Form for adding/editing welders
  const form = useForm<WelderFormValues>({
    resolver: zodResolver(welderFormSchema),
    defaultValues: {
      welderName: "",
      trade: "",
      processQualified: [],
      materialGroupQualified: [],
      thicknessRange: "",
      positionQualified: [],
      wpsId: "",
      testResults: "Passed",
      status: "Active",
      remarks: "",
    },
  });
  
  // Update form values when editing a welder
  useEffect(() => {
    if (selectedWelder && isEditWelderOpen) {
      form.reset({
        welderName: selectedWelder.welderName,
        trade: selectedWelder.trade,
        processQualified: selectedWelder.processQualified,
        materialGroupQualified: selectedWelder.materialGroupQualified,
        thicknessRange: selectedWelder.thicknessRange,
        positionQualified: selectedWelder.positionQualified,
        wpsId: "", // This needs to be fetched separately
        testDate: new Date(selectedWelder.testDate),
        testResults: selectedWelder.testResults,
        certificateExpiryDate: new Date(selectedWelder.certificateExpiryDate),
        status: selectedWelder.status,
        remarks: selectedWelder.remarks || "",
      });
    }
  }, [selectedWelder, isEditWelderOpen, form]);
  
  // Handle status filter selection
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value === "all_status" ? null : value);
  };
  
  // Fetch welders data
  const {
    data: welders = [],
    isLoading,
    refetch
  } = useQuery<Welder[]>({
    queryKey: ["/api/quality/welders"],
  });
  
  // Fetch WPS documents for dropdown
  const { data: wpsDocuments = [] } = useQuery<any[]>({
    queryKey: ["/api/quality/wps-pqr/wps"],
  });
  
  // Create new welder mutation
  const createWelderMutation = useMutation({
    mutationFn: async (data: WelderFormValues) => {
      const response = await apiRequest("POST", "/api/quality/welders", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welder Added",
        description: "New welder qualification record has been created",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/welders"] });
      setIsAddWelderOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add welder: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Update welder mutation
  const updateWelderMutation = useMutation({
    mutationFn: async (data: WelderFormValues & { id: number }) => {
      const response = await apiRequest(
        "PUT",
        `/api/quality/welders/${data.id}`,
        data
      );
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welder Updated",
        description: "Welder qualification record has been updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/welders"] });
      setIsEditWelderOpen(false);
      setSelectedWelder(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update welder: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Delete welder mutation
  const deleteWelderMutation = useMutation({
    mutationFn: async (welderId: number) => {
      const response = await apiRequest(
        "DELETE",
        `/api/quality/welders/${welderId}`,
        {}
      );
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welder Deleted",
        description: "Welder qualification record has been deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/welders"] });
      setIsDeleteDialogOpen(false);
      setSelectedWelder(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete welder: ${error.message}`,
        variant: "destructive",
      });
    },
  });
  
  // Form submit handlers
  const onAddWelderSubmit = (data: WelderFormValues) => {
    createWelderMutation.mutate(data);
  };
  
  const onEditWelderSubmit = (data: WelderFormValues) => {
    if (selectedWelder) {
      updateWelderMutation.mutate({
        ...data,
        id: selectedWelder.id,
      });
    }
  };
  
  // Delete welder handler
  const handleDeleteWelder = () => {
    if (selectedWelder) {
      deleteWelderMutation.mutate(selectedWelder.id);
    }
  };
  
  // Filter welders based on search term and status
  const filteredWelders = welders.filter((welder) => {
    const matchesSearch =
      searchTerm === "" ||
      welder.welderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.welderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      welder.certificateNo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === null || welder.status === statusFilter;
    
    // Filter by tab
    if (activeTab === "all_welders") {
      return matchesSearch && matchesStatus;
    } else if (activeTab === "active_welders") {
      return matchesSearch && welder.status === "Active";
    } else if (activeTab === "expiring_soon") {
      const expiryDate = new Date(welder.certificateExpiryDate);
      const today = new Date();
      const daysDifference = Math.floor(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return matchesSearch && daysDifference <= 30 && daysDifference > 0;
    } else if (activeTab === "expired") {
      return matchesSearch && welder.status === "Expired";
    }
    
    return matchesSearch && matchesStatus;
  });
  
  // Dashboard statistics
  const totalWelders = welders.length;
  const activeWelders = welders.filter(welder => welder.status === "Active").length;
  const expiringSoon = welders.filter(welder => {
    const expiryDate = new Date(welder.certificateExpiryDate);
    const today = new Date();
    const daysDifference = Math.floor(
      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDifference <= 30 && daysDifference > 0;
  }).length;
  const expiredWelders = welders.filter(welder => welder.status === "Expired").length;
  
  return (
    <Layout>
      <Helmet>
        <title>Welder Management | Thermopac</title>
      </Helmet>
      
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Welder Management</h1>
            <p className="text-muted-foreground mt-1">
              Track welder qualification records and certification status
            </p>
          </div>
          
          <Button onClick={() => setIsAddWelderOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add New Welder
          </Button>
        </div>
        
        {/* Dashboard stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">Total Welders</span>
                <span className="text-4xl font-bold mt-2">{totalWelders}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">Active Welders</span>
                <span className="text-4xl font-bold mt-2 text-green-500">{activeWelders}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">Expiring Soon</span>
                <span className="text-4xl font-bold mt-2 text-amber-500">{expiringSoon}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">Expired</span>
                <span className="text-4xl font-bold mt-2 text-red-500">{expiredWelders}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Tabs and Filters */}
        <div className="flex flex-col md:flex-row md:justify-between gap-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="all_welders">All Welders</TabsTrigger>
              <TabsTrigger value="active_welders">Active</TabsTrigger>
              <TabsTrigger value="expiring_soon">Expiring Soon</TabsTrigger>
              <TabsTrigger value="expired">Expired</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                className="pl-8 w-[250px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        {/* Welders Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Welder ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Trade</TableHead>
                  <TableHead>Process Qualified</TableHead>
                  <TableHead>Certificate No.</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWelders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      {isLoading ? (
                        <div className="flex justify-center items-center">
                          <svg
                            className="animate-spin h-6 w-6 text-primary mr-2"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span>Loading welders...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <p className="text-muted-foreground">No welders found</p>
                          <Button
                            variant="link"
                            onClick={() => setIsAddWelderOpen(true)}
                          >
                            Add your first welder
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWelders.map((welder) => {
                    // Check if certificate is expiring soon (within 30 days)
                    const expiryDate = new Date(welder.certificateExpiryDate);
                    const today = new Date();
                    const daysDifference = Math.floor(
                      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    const isExpiringSoon = daysDifference <= 30 && daysDifference > 0;
                    const isExpired = daysDifference <= 0;
                    
                    return (
                      <TableRow key={welder.id}>
                        <TableCell className="font-medium">{welder.welderId}</TableCell>
                        <TableCell>{welder.welderName}</TableCell>
                        <TableCell>{welder.trade}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {welder.processQualified.map((process) => (
                              <Badge key={process} variant="outline">
                                {process}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{welder.certificateNo}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {isExpiringSoon && (
                              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1.5" />
                            )}
                            {isExpired && (
                              <AlertTriangle className="h-4 w-4 text-red-500 mr-1.5" />
                            )}
                            {format(new Date(welder.certificateExpiryDate), "MMM dd, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              welder.status === "Active"
                                ? "default"
                                : welder.status === "Expired"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {welder.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedWelder(welder);
                                  setIsEditWelderOpen(true);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedWelder(welder);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        {/* Add Welder Dialog */}
        <Dialog open={isAddWelderOpen} onOpenChange={setIsAddWelderOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Welder</DialogTitle>
              <DialogDescription>
                Create a new welder qualification record. Fields marked with * are required.
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[65vh]">
              <div className="p-1">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onAddWelderSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Welder Name */}
                      <FormField
                        control={form.control}
                        name="welderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Welder Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter welder's full name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Trade */}
                      <FormField
                        control={form.control}
                        name="trade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade *</FormLabel>
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
                                <SelectItem value="Welder">Welder</SelectItem>
                                <SelectItem value="Fitter">Fitter</SelectItem>
                                <SelectItem value="Fabricator">Fabricator</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Process Qualified */}
                    <FormField
                      control={form.control}
                      name="processQualified"
                      render={() => (
                        <FormItem>
                          <div className="mb-4">
                            <FormLabel>Process Qualified *</FormLabel>
                            <FormDescription>
                              Select all welding processes the welder is qualified for.
                            </FormDescription>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            {["SMAW", "GTAW", "FCAW", "SAW"].map((process) => (
                              <FormField
                                key={process}
                                control={form.control}
                                name="processQualified"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={process}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(process)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, process])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== process
                                                  )
                                                );
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal">
                                        {process}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Material Group Qualified */}
                    <FormField
                      control={form.control}
                      name="materialGroupQualified"
                      render={() => (
                        <FormItem>
                          <div className="mb-4">
                            <FormLabel>Material Group Qualified *</FormLabel>
                            <FormDescription>
                              Select all material groups the welder is qualified for.
                            </FormDescription>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            {["Carbon Steel", "Stainless Steel", "Alloy Steel"].map((material) => (
                              <FormField
                                key={material}
                                control={form.control}
                                name="materialGroupQualified"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={material}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(material)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, material])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== material
                                                  )
                                                );
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal">
                                        {material}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Thickness Range */}
                    <FormField
                      control={form.control}
                      name="thicknessRange"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Thickness Range *</FormLabel>
                          <FormControl>
                            <Input placeholder="E.g., 3mm - 20mm" {...field} />
                          </FormControl>
                          <FormDescription>
                            Enter the range of material thickness the welder is qualified for.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Position Qualified */}
                    <FormField
                      control={form.control}
                      name="positionQualified"
                      render={() => (
                        <FormItem>
                          <div className="mb-4">
                            <FormLabel>Position Qualified *</FormLabel>
                            <FormDescription>
                              Select all welding positions the welder is qualified for.
                            </FormDescription>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            {["1G", "2G", "3G", "4G", "5G", "6G"].map((position) => (
                              <FormField
                                key={position}
                                control={form.control}
                                name="positionQualified"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={position}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(position)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, position])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== position
                                                  )
                                                );
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal">
                                        {position}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* WPS Number */}
                    <FormField
                      control={form.control}
                      name="wpsId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WPS Number *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select WPS" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {wpsDocuments.length === 0 ? (
                                <SelectItem value="" disabled>
                                  No WPS documents found
                                </SelectItem>
                              ) : (
                                wpsDocuments.map((wps: any) => (
                                  <SelectItem key={wps.id} value={wps.wpsId}>
                                    {wps.wpsId}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            WPS number this welder is qualified under.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Test Date */}
                      <FormField
                        control={form.control}
                        name="testDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Test Date *</FormLabel>
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
                                      format(field.value, "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Test Results */}
                      <FormField
                        control={form.control}
                        name="testResults"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Test Results *</FormLabel>
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
                                <SelectItem value="Passed">Passed</SelectItem>
                                <SelectItem value="Failed">Failed</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Certificate Expiry Date */}
                      <FormField
                        control={form.control}
                        name="certificateExpiryDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Certificate Expiry Date *</FormLabel>
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
                                      format(field.value, "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) =>
                                    date < new Date() ||
                                    date < new Date("1900-01-01")
                                  }
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Status */}
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status *</FormLabel>
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
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Expired">Expired</SelectItem>
                                <SelectItem value="Revoked">Revoked</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Remarks */}
                    <FormField
                      control={form.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks</FormLabel>
                          <FormControl>
                            <Input placeholder="Additional notes (optional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddWelderOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createWelderMutation.isPending}>
                        {createWelderMutation.isPending ? "Saving..." : "Save Welder"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        
        {/* Edit Welder Dialog */}
        <Dialog open={isEditWelderOpen} onOpenChange={setIsEditWelderOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Edit Welder</DialogTitle>
              <DialogDescription>
                Update the welder qualification record.
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[65vh]">
              <div className="p-1">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onEditWelderSubmit)} className="space-y-6">
                    {/* The form fields are identical to the Add Welder form */}
                    {/* ... Same fields as Add Welder Dialog ... */}
                    
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsEditWelderOpen(false);
                          setSelectedWelder(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateWelderMutation.isPending}>
                        {updateWelderMutation.isPending ? "Updating..." : "Update Welder"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        
        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this welder record? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setSelectedWelder(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteWelder}
                disabled={deleteWelderMutation.isPending}
              >
                {deleteWelderMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
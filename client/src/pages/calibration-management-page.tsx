import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Download, FileSpreadsheet, CalendarClock, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

// Form schema for calibration instruments
const calibrationInstrumentSchema = z.object({
  instrument_name: z.string().min(2, { message: "Instrument name is required" }),
  instrument_type: z.string().min(1, { message: "Instrument type is required" }),
  manufacturer: z.string().min(1, { message: "Manufacturer is required" }),
  serial_number: z.string().min(1, { message: "Serial number is required" }),
  location: z.string().min(1, { message: "Location is required" }),
  calibration_frequency: z.string().min(1, { message: "Calibration frequency is required" }),
  last_calibration_date: z.string().min(1, { message: "Last calibration date is required" }),
  calibration_status: z.string().min(1, { message: "Calibration status is required" }),
  certificate_number: z.string().optional(),
  remarks: z.string().optional(),
});

// Type for the form data
type CalibrationInstrumentFormData = z.infer<typeof calibrationInstrumentSchema>;

// Type for instrument data received from API
type CalibrationInstrument = {
  id: number;
  instrument_id: string;
  instrument_name: string;
  instrument_type: string;
  manufacturer: string;
  serial_number: string;
  location: string;
  calibration_frequency: string;
  last_calibration_date: string;
  next_calibration_date: string;
  calibration_status: string;
  certificate_number?: string;
  certificate_file_path?: string;
  certificate_url?: string; // Added for GCS signed URLs
  remarks?: string;
  created_at: string;
  updated_at: string;
};

// Dashboard statistics type
type DashboardStats = {
  total: number;
  calibrated: number;
  dueSoon: number;
  overdue: number;
};

// Options for dropdowns
const instrumentTypeOptions = [
  "Welding Machine",
  "Micrometer",
  "Vernier Caliper",
  "Torque Wrench",
  "Coating Thickness Gauge",
  "Level / Spirit Level",
  "Pressure Gauge"
];

const calibrationFrequencyOptions = [
  "1 Month",
  "3 Months",
  "6 Months",
  "1 Year",
  "2 Years",
  "3 Years",
  "5 Years"
];

const calibrationStatusOptions = [
  "Calibrated",
  "Overdue",
  "Out of Service",
  "Pending"
];

export default function CalibrationManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for UI
  const [isAddInstrumentOpen, setIsAddInstrumentOpen] = useState(false);
  const [isEditInstrumentOpen, setIsEditInstrumentOpen] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<CalibrationInstrument | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  
  // Handle status filter selection
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value === "all_statuses" ? null : value);
  };
  
  // Fetch instruments data
  const { 
    data: instruments = [], 
    isLoading, 
    refetch 
  } = useQuery<CalibrationInstrument[]>({
    queryKey: ["/api/quality/calibration/instruments"],
  });
  
  // Fetch dashboard stats
  const { 
    data: stats = { total: 0, calibrated: 0, dueSoon: 0, overdue: 0 },
    isLoading: isStatsLoading,
  } = useQuery<DashboardStats>({
    queryKey: ["/api/quality/calibration/instruments/stats/dashboard"],
  });
  
  // Create new instrument mutation
  const createInstrumentMutation = useMutation({
    mutationFn: async (data: CalibrationInstrumentFormData) => {
      const formData = new FormData();
      
      // Append form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append certificate file if available
      if (certificateFile) {
        formData.append("certificate", certificateFile);
      }
      
      const response = await fetch("/api/quality/calibration/instruments", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create instrument");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Calibration instrument created successfully",
      });
      setIsAddInstrumentOpen(false);
      form.reset();
      setCertificateFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/calibration/instruments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/calibration/instruments/stats/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating calibration instrument",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update instrument mutation
  const updateInstrumentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CalibrationInstrumentFormData }) => {
      const formData = new FormData();
      
      // Append form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Append certificate file if available
      if (certificateFile) {
        formData.append("certificate", certificateFile);
      }
      
      const response = await fetch(`/api/quality/calibration/instruments/${id}`, {
        method: "PUT",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update instrument");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Calibration instrument updated successfully",
      });
      setIsEditInstrumentOpen(false);
      editForm.reset();
      setCertificateFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/quality/calibration/instruments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/calibration/instruments/stats/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating calibration instrument",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Form setup for adding a new instrument
  const form = useForm<CalibrationInstrumentFormData>({
    resolver: zodResolver(calibrationInstrumentSchema),
    defaultValues: {
      instrument_name: "",
      instrument_type: "",
      manufacturer: "",
      serial_number: "",
      location: "",
      calibration_frequency: "",
      last_calibration_date: "",
      calibration_status: "Calibrated",
      certificate_number: "",
      remarks: "",
    },
  });
  
  // Form setup for editing an instrument
  const editForm = useForm<CalibrationInstrumentFormData>({
    resolver: zodResolver(calibrationInstrumentSchema),
    defaultValues: {
      instrument_name: "",
      instrument_type: "",
      manufacturer: "",
      serial_number: "",
      location: "",
      calibration_frequency: "",
      last_calibration_date: "",
      calibration_status: "",
      certificate_number: "",
      remarks: "",
    },
  });
  
  // Filter instruments based on search term and status filter
  const filteredInstruments = Array.isArray(instruments) ? instruments.filter((instrument) => {
    const matchesSearch = 
      instrument.instrument_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instrument.instrument_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instrument.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instrument.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instrument.location?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatusFilter = statusFilter === null || instrument.calibration_status === statusFilter;
    
    return matchesSearch && matchesStatusFilter;
  }) : [];
  
  // Submit handler for adding a new instrument
  const onSubmit = (values: CalibrationInstrumentFormData) => {
    createInstrumentMutation.mutate(values);
  };
  
  // Submit handler for editing an instrument
  const onEditSubmit = (values: CalibrationInstrumentFormData) => {
    if (selectedInstrument) {
      updateInstrumentMutation.mutate({ 
        id: selectedInstrument.id, 
        data: values
      });
    }
  };
  
  // Set up the edit form when an instrument is selected for editing
  useEffect(() => {
    if (selectedInstrument) {
      editForm.reset({
        instrument_name: selectedInstrument.instrument_name,
        instrument_type: selectedInstrument.instrument_type,
        manufacturer: selectedInstrument.manufacturer,
        serial_number: selectedInstrument.serial_number,
        location: selectedInstrument.location,
        calibration_frequency: selectedInstrument.calibration_frequency,
        last_calibration_date: selectedInstrument.last_calibration_date,
        calibration_status: selectedInstrument.calibration_status,
        certificate_number: selectedInstrument.certificate_number || "",
        remarks: selectedInstrument.remarks || "",
      });
    }
  }, [selectedInstrument, editForm]);
  
  // Handle edit button click
  const handleEditClick = (instrument: CalibrationInstrument) => {
    setSelectedInstrument(instrument);
    setIsEditInstrumentOpen(true);
  };
  
  // Handle certificate file selection
  const handleCertificateFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setCertificateFile(event.target.files[0]);
    }
  };
  
  // Download certificate
  const handleDownloadCertificate = async (instrumentId: number) => {
    try {
      window.open(`/api/quality/calibration/instruments/${instrumentId}/certificate`, '_blank');
    } catch (error) {
      toast({
        title: "Error downloading certificate",
        description: "The certificate could not be downloaded",
        variant: "destructive",
      });
    }
  };
  
  // Export instruments data to CSV
  const handleExportData = () => {
    try {
      // Create CSV content
      const headers = ["Instrument ID", "Name", "Type", "Manufacturer", "Serial Number", "Location", "Last Calibration", "Next Calibration", "Status"];
      const rows = filteredInstruments.map(i => [
        i.instrument_id,
        i.instrument_name,
        i.instrument_type,
        i.manufacturer,
        i.serial_number,
        i.location,
        new Date(i.last_calibration_date).toLocaleDateString(),
        new Date(i.next_calibration_date).toLocaleDateString(),
        i.calibration_status
      ]);
      
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
      ].join("\n");
      
      // Create a download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `calibration-instruments-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast({
        title: "Error exporting data",
        description: "There was an error exporting the data",
        variant: "destructive",
      });
    }
  };
  
  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch(status) {
      case "Calibrated":
        return <Badge className="bg-green-500">{status}</Badge>;
      case "Overdue":
        return <Badge variant="destructive">{status}</Badge>;
      case "Out of Service":
        return <Badge variant="outline" className="border-red-500 text-red-500">{status}</Badge>;
      case "Pending":
        return <Badge variant="secondary">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
  
  // Check if calibration is due soon (within 30 days)
  const isDueSoon = (dueDateStr: string) => {
    const dueDate = new Date(dueDateStr);
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);
    return dueDate <= thirtyDaysLater && dueDate > today;
  };
  
  // Check if calibration is overdue
  const isOverdue = (dueDateStr: string) => {
    const dueDate = new Date(dueDateStr);
    const today = new Date();
    return dueDate < today;
  };
  
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Calibration Management</h1>
          <Dialog open={isAddInstrumentOpen} onOpenChange={setIsAddInstrumentOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add New Instrument
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Calibration Instrument</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="basic">Basic Information</TabsTrigger>
                      <TabsTrigger value="calibration">Calibration Details</TabsTrigger>
                    </TabsList>
                    <TabsContent value="basic" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="instrument_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Instrument Name*</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter instrument name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="instrument_type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Instrument Type*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select instrument type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {instrumentTypeOptions.map((option) => (
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
                          name="manufacturer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Manufacturer*</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter manufacturer" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="serial_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Serial Number*</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter serial number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location*</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter location" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="calibration" className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="calibration_frequency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Calibration Frequency*</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select frequency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {calibrationFrequencyOptions.map((option) => (
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
                          name="last_calibration_date"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Last Calibration Date*</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn(
                                        "pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                    >
                                      {field.value ? (
                                        format(new Date(field.value), "PPP")
                                      ) : (
                                        <span>Pick a date</span>
                                      )}
                                      <CalendarClock className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value ? new Date(field.value) : undefined}
                                    onSelect={(date) => {
                                      field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                                    }}
                                    disabled={(date) =>
                                      date > new Date() || date < new Date("1900-01-01")
                                    }
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
                          name="calibration_status"
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
                                  {calibrationStatusOptions.map((option) => (
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
                          name="certificate_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Certificate Number</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter certificate number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="col-span-2">
                          <Label htmlFor="certificate_file">Certificate Upload</Label>
                          <Input
                            id="certificate_file"
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleCertificateFileChange}
                            className="mt-1"
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            {certificateFile ? 
                              `Selected file: ${certificateFile.name}` : 
                              "Select a PDF or image file (.pdf, .jpg, .png)"}
                          </p>
                        </div>
                        <div className="col-span-2">
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
                      </div>
                    </TabsContent>
                  </Tabs>
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddInstrumentOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createInstrumentMutation.isPending}>
                      {createInstrumentMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</>
                      ) : (
                        "Add Instrument"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Dashboard Statistics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Instruments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isStatsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Calibrated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{isStatsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.calibrated}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due Soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{isStatsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.dueSoon}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{isStatsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats.overdue}</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search instruments..."
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
                {calibrationStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExportData}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export Data
          </Button>
        </div>
        
        {/* Instruments Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instrument ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Last Calibration</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <span className="mt-2 block text-sm text-muted-foreground">Loading instrument data...</span>
                  </TableCell>
                </TableRow>
              ) : filteredInstruments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    {searchTerm || statusFilter ? (
                      <span className="text-sm text-muted-foreground">No instruments found matching your search criteria.</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No instruments have been added yet.</span>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInstruments.map((instrument) => (
                  <TableRow key={instrument.id}>
                    <TableCell className="font-medium">{instrument.instrument_id}</TableCell>
                    <TableCell>{instrument.instrument_name}</TableCell>
                    <TableCell>{instrument.instrument_type}</TableCell>
                    <TableCell>{instrument.manufacturer}</TableCell>
                    <TableCell>{instrument.location}</TableCell>
                    <TableCell>{new Date(instrument.last_calibration_date).toLocaleDateString()}</TableCell>
                    <TableCell 
                      className={cn(
                        isOverdue(instrument.next_calibration_date) ? "text-red-600 font-bold" : "",
                        isDueSoon(instrument.next_calibration_date) ? "text-amber-500 font-medium" : ""
                      )}
                    >
                      {new Date(instrument.next_calibration_date).toLocaleDateString()}
                      {isOverdue(instrument.next_calibration_date) && 
                        <AlertTriangle className="inline-block ml-1 h-4 w-4 text-red-600" />
                      }
                    </TableCell>
                    <TableCell>{getStatusBadge(instrument.calibration_status)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEditClick(instrument)}
                        >
                          Edit
                        </Button>
                        {instrument.certificate_file_path && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDownloadCertificate(instrument.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Edit Instrument Dialog */}
        <Dialog open={isEditInstrumentOpen} onOpenChange={setIsEditInstrumentOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Calibration Instrument</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic Information</TabsTrigger>
                    <TabsTrigger value="calibration">Calibration Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="instrument_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Instrument Name*</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter instrument name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="instrument_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Instrument Type*</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select instrument type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {instrumentTypeOptions.map((option) => (
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
                        name="manufacturer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Manufacturer*</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter manufacturer" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="serial_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Serial Number*</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter serial number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location*</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter location" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="calibration" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editForm.control}
                        name="calibration_frequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Calibration Frequency*</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {calibrationFrequencyOptions.map((option) => (
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
                        name="last_calibration_date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Last Calibration Date*</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(new Date(field.value), "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                    <CalendarClock className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={(date) => {
                                    field.onChange(date ? format(date, "yyyy-MM-dd") : "");
                                  }}
                                  disabled={(date) =>
                                    date > new Date() || date < new Date("1900-01-01")
                                  }
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
                        name="calibration_status"
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
                                {calibrationStatusOptions.map((option) => (
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
                        name="certificate_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Certificate Number</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter certificate number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="col-span-2 space-y-4">
                        {/* Display current certificate if available */}
                        {(selectedInstrument?.certificate_url || selectedInstrument?.certificate_file_path) && (
                          <div className="p-4 border rounded-md bg-gray-50">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium">Current Certificate</h4>
                                <p className="text-sm text-muted-foreground">
                                  {selectedInstrument.certificate_number ? 
                                    `Certificate #${selectedInstrument.certificate_number}` : 
                                    'Certificate file available'}
                                </p>
                              </div>
                              <Button 
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadCertificate(selectedInstrument.id)}
                                className="ml-2"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View Certificate
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Upload new certificate */}
                        <div>
                          <Label htmlFor="edit_certificate_file">
                            {selectedInstrument?.certificate_file_path ? 
                              "Replace Certificate" : 
                              "Upload Certificate"}
                          </Label>
                          <Input
                            id="edit_certificate_file"
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleCertificateFileChange}
                            className="mt-1"
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            {certificateFile ? 
                              `Selected file: ${certificateFile.name}` : 
                              "Select a PDF or image file (.pdf, .jpg, .png)"}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-2">
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
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditInstrumentOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateInstrumentMutation.isPending}>
                    {updateInstrumentMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                    ) : (
                      "Update Instrument"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
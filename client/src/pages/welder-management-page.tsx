import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { PlusCircle, Search, UserCheck, AlertTriangle, Loader2 } from "lucide-react";
import Layout from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import WelderPhotoUpload from "@/components/welder-photo-upload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, addDays, parseISO, isAfter, isBefore } from "date-fns";

// Define interfaces for our data
interface Welder {
  id: number;
  welderId: string;
  name: string;
  trade: string;
  status: string;
  remarks: string;
  photoPath?: string;
  dateOfBirth?: string;
  contactNumber?: string;
  hireDate?: string;
  identificationType?: string;
  identificationNumber?: string;
}

interface WelderCertificate {
  id: number;
  // Support both camelCase and snake_case property names
  // Frontend expected properties (camelCase)
  welderId?: number;
  certificateNo?: string;
  certificateType?: string;
  description?: string;
  issueDate?: string;
  expiryDate?: string;
  filePath?: string;
  fileUrl?: string;
  status?: string;
  createdAt?: string;
  createdByUsername?: string;
  wpqrId?: number;
  wpqrDocumentId?: string;
  processQualified?: string[];
  materialGroupQualified?: string[];
  thicknessRange?: string;
  positionQualified?: string[];
  
  // Backend properties (snake_case)
  welder_id?: number;
  certificate_no?: string;
  certificate_type?: string;
  issue_date?: string;
  expiry_date?: string;
  file_path?: string;
  file_url?: string;
  created_at?: string;
  created_by_username?: string;
  wpqr_id?: number;
  wpqr_document_id?: string;
}

interface WelderFormData {
  name: string;
  trade: string;
  status: string;
  remarks: string;
  dateOfBirth?: string | null;
  contactNumber?: string;
  hireDate?: string | null;
  identificationType?: string;
  identificationNumber?: string;
  photoFile?: File | null;
  photoPath?: string | null;
}

// Form validation schema - simplified for basic welder information
const welderFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  trade: z.string().min(1, "Please select a trade"),
  status: z.string().min(1, "Status is required"),
  remarks: z.string().optional().or(z.literal("")),
  dateOfBirth: z.string().nullable().optional(),
  contactNumber: z.string().optional(),
  hireDate: z.string().nullable().optional(),
  identificationType: z.string().optional(),
  identificationNumber: z.string().optional(),
  photoFile: z.instanceof(File).nullable().optional(),
  photoPath: z.string().nullable().optional(),
});

const tradeOptions = ["Welder", "Fitter", "Fabricator"];
const statusOptions = ["Active", "Expired", "Revoked"];
const certificateTypeOptions = ["WELDER_QUALIFICATION", "SKILL_CERTIFICATE", "SAFETY_TRAINING"];

export default function WelderManagementPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isAddWelderOpen, setIsAddWelderOpen] = useState(false);
  const [isEditWelderOpen, setIsEditWelderOpen] = useState(false);
  const [isViewCertificatesOpen, setIsViewCertificatesOpen] = useState(false);
  const [selectedWelder, setSelectedWelder] = useState<Welder | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState("all_welders");
  
  // Handle status filter selection
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value === "all_statuses" ? null : value);
  };
  
  // Add welder form
  const form = useForm<WelderFormData>({
    resolver: zodResolver(welderFormSchema),
    defaultValues: {
      name: "",
      trade: "",
      status: "Active",
      remarks: "",
      dateOfBirth: null,
      contactNumber: "",
      hireDate: null,
      identificationType: "",
      identificationNumber: "",
      photoFile: null,
      photoPath: null
    },
  });

  // Edit welder form
  const editForm = useForm<WelderFormData>({
    resolver: zodResolver(welderFormSchema),
    defaultValues: {
      name: "",
      trade: "",
      status: "Active",
      remarks: "",
      dateOfBirth: null,
      contactNumber: "",
      hireDate: null,
      identificationType: "",
      identificationNumber: "",
      photoFile: null,
      photoPath: null
    },
  });
  
  // Fetch welders data
  const { data: welders = [], isLoading, refetch } = useQuery<Welder[]>({
    queryKey: ["/api/quality/welders"],
  });
  
  // Fetch all certificates for dashboard
  const { data: allCertificates = [] } = useQuery<WelderCertificate[]>({
    queryKey: ["/api/quality/welder-certificates/all"],
    queryFn: async () => {
      const response = await fetch("/api/quality/welder-certificates/all");
      if (!response.ok) {
        throw new Error("Failed to fetch all certificates");
      }
      const data = await response.json();
      console.log("Fetched all certificates:", data); // Debug log
      return data;
    },
  });
  
  // Fetch certificates for selected welder
  const { data: certificates = [], refetch: refetchCertificates } = useQuery<WelderCertificate[]>({
    queryKey: ["/api/quality/welder-certificates", selectedWelder?.id],
    queryFn: async () => {
      if (!selectedWelder) return [];
      const response = await fetch(`/api/quality/welder-certificates/welder/${selectedWelder.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch certificates");
      }
      return response.json();
    },
    enabled: !!selectedWelder && isViewCertificatesOpen,
  });

  // Create new welder mutation
  const createWelderMutation = useMutation({
    mutationFn: async (data: WelderFormData) => {
      // Use photoPath directly from form data if it was set by the WelderPhotoUpload component
      let photoPath = data.photoPath || null;
      
      // Handle file upload if a photo is selected (this is a fallback for the old flow)
      if (data.photoFile) {
        const formData = new FormData();
        formData.append("file", data.photoFile);
        
        const uploadResponse = await fetch("/api/upload/welder-photo", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(errorText || "Failed to upload welder photo");
        }
        
        const uploadResult = await uploadResponse.json();
        photoPath = uploadResult.path;
      }
      
      // Create welder with all the data
      const welderData = {
        ...data,
        photoPath,
        photoFile: undefined  // Remove the file from the data sent to API
      };
      
      const response = await fetch("/api/quality/welders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(welderData),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to create welder");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Welder created successfully",
      });
      setIsAddWelderOpen(false);
      form.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating welder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update welder mutation
  const updateWelderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: WelderFormData }) => {
      // Use photoPath directly from form data if it was set by the WelderPhotoUpload component
      // Otherwise fall back to existing photoPath or null
      let photoPath = data.photoPath || selectedWelder?.photoPath || null;
      
      // Handle file upload if a new photo is selected (this is a fallback for the old flow)
      if (data.photoFile) {
        const formData = new FormData();
        formData.append("file", data.photoFile);
        formData.append("welderId", id.toString());
        
        const uploadResponse = await fetch("/api/upload/welder-photo", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(errorText || "Failed to upload welder photo");
        }
        
        const uploadResult = await uploadResponse.json();
        photoPath = uploadResult.path;
      }
      
      // Update welder with all the data
      const welderData = {
        ...data,
        photoPath,
        photoFile: undefined  // Remove the file from the data sent to API
      };
      
      const response = await fetch(`/api/quality/welders/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(welderData),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update welder");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Welder updated successfully",
      });
      setIsEditWelderOpen(false);
      editForm.reset();
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating welder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submissions
  const onSubmit = (data: WelderFormData) => {
    createWelderMutation.mutate(data);
  };

  const onEditSubmit = (data: WelderFormData) => {
    if (selectedWelder) {
      updateWelderMutation.mutate({ id: selectedWelder.id, data });
    }
  };

  // Open edit dialog
  const handleEditWelder = (welder: Welder) => {
    setSelectedWelder(welder);
    editForm.reset({
      name: welder.name,
      trade: welder.trade,
      status: welder.status,
      remarks: welder.remarks || "",
      dateOfBirth: welder.dateOfBirth || null,
      contactNumber: welder.contactNumber || "",
      hireDate: welder.hireDate || null,
      identificationType: welder.identificationType || "",
      identificationNumber: welder.identificationNumber || "",
      photoFile: null,
      photoPath: welder.photoPath || null
    });
    setIsEditWelderOpen(true);
  };

  // Open certificates dialog
  const handleViewCertificates = (welder: Welder) => {
    setSelectedWelder(welder);
    setIsViewCertificatesOpen(true);
  };

  // Filter welders based on search term and status
  const filteredWelders = welders.filter((welder) => {
    const matchesSearch = searchTerm
      ? welder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        welder.welderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        welder.trade.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    
    const matchesStatus = statusFilter ? welder.status === statusFilter : true;
    
    return matchesSearch && matchesStatus;
  });

  // Dashboard statistics and filtered lists
  const today = new Date();
  const thirtyDaysFromNow = addDays(today, 30);
  
  const expiringSoonCertificates = allCertificates.filter(cert => {
    try {
      const expiryDate = parseISO(cert.expiryDate);
      return isAfter(expiryDate, today) && isBefore(expiryDate, thirtyDaysFromNow);
    } catch (e) {
      return false;
    }
  });
  
  const expiredCertificates = allCertificates.filter(cert => {
    try {
      const expiryDate = parseISO(cert.expiryDate);
      return isBefore(expiryDate, today);
    } catch (e) {
      return false;
    }
  });
  
  const uniqueWelderIds = new Set(welders.map(w => w.id));
  const weldersWithCertificates = allCertificates
    .filter(cert => uniqueWelderIds.has(cert.welderId))
    .reduce((acc, cert) => {
      if (!acc[cert.welderId]) {
        const welder = welders.find(w => w.id === cert.welderId);
        if (welder) {
          acc[cert.welderId] = {
            welder,
            certificates: []
          };
        }
      }
      if (acc[cert.welderId]) {
        acc[cert.welderId].certificates.push(cert);
      }
      return acc;
    }, {} as Record<number, { welder: Welder, certificates: WelderCertificate[] }>);

  // Get welders with expiring certificates
  const weldersWithExpiringSoonCertificates = Object.values(weldersWithCertificates)
    .filter(({ certificates }) => 
      certificates.some(cert => {
        try {
          const expiryDate = parseISO(cert.expiryDate);
          return isAfter(expiryDate, today) && isBefore(expiryDate, thirtyDaysFromNow);
        } catch (e) {
          return false;
        }
      })
    );

  // Get welders with expired certificates
  const weldersWithExpiredCertificates = Object.values(weldersWithCertificates)
    .filter(({ certificates }) => 
      certificates.some(cert => {
        try {
          const expiryDate = parseISO(cert.expiryDate);
          return isBefore(expiryDate, today);
        } catch (e) {
          return false;
        }
      })
    );

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Welder Management</h1>
          <Dialog open={isAddWelderOpen} onOpenChange={setIsAddWelderOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add New Welder
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Welder</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="flex mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium">Personal Information</h3>
                    </div>
                    <div className="w-48">
                      <FormField
                        control={form.control}
                        name="photoFile"
                        render={({ field: { value, onChange } }) => (
                          <FormItem>
                            <FormControl>
                              <WelderPhotoUpload
                                onPhotoUploadSuccess={(path) => {
                                  // When a photo is uploaded, update the form data
                                  // with the path so we can use it in form submission
                                  form.setValue("photoPath", path);
                                }}
                                // Note: No welderId for new welders until after creation
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                      name="contactNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Number</FormLabel>
                          <FormControl>
                            <Input placeholder="Phone number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field} 
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hireDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Hire Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field} 
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="identificationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Identification Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select ID type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Passport">Passport</SelectItem>
                              <SelectItem value="Pan Card">Pan Card</SelectItem>
                              <SelectItem value="Aadhar Card">Aadhar Card</SelectItem>
                              <SelectItem value="Voter ID">Voter ID</SelectItem>
                              <SelectItem value="Driving License">Driving License</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="identificationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Identification Number</FormLabel>
                          <FormControl>
                            <Input placeholder="ID number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks</FormLabel>
                          <FormControl>
                            <Input placeholder="Optional remarks" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={createWelderMutation.isPending}
                    >
                      {createWelderMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Welder
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Total Welders</CardTitle>
              <CardDescription>Active and registered welders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{welders.length}</div>
              <div className="mt-2 text-sm text-gray-500">
                {welders.filter(w => w.status === "Active").length} active welders
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Certificates Expiring Soon</CardTitle>
              <CardDescription>Within next 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{expiringSoonCertificates.length}</div>
              <div className="mt-2 text-sm text-gray-500">
                {weldersWithExpiringSoonCertificates.length} welders affected
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Expired Certificates</CardTitle>
              <CardDescription>Require renewal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{expiredCertificates.length}</div>
              <div className="mt-2 text-sm text-gray-500">
                {weldersWithExpiredCertificates.length} welders affected
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Filters */}
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="all_welders">All Welders</TabsTrigger>
              <TabsTrigger value="expiring_soon">Certificates Expiring Soon</TabsTrigger>
              <TabsTrigger value="expired">Expired Certificates</TabsTrigger>
            </TabsList>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search welders..."
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
          </div>

          <TabsContent value="all_welders" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Welder ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Trade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Certificates</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredWelders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10">
                          No welders found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredWelders.map((welder) => {
                        const welderCertificates = Object.values(weldersWithCertificates)
                          .find(w => w.welder.id === welder.id)?.certificates || [];
                        
                        const hasExpired = welderCertificates.some(cert => {
                          try {
                            return isBefore(parseISO(cert.expiryDate), today);
                          } catch (e) {
                            return false;
                          }
                        });
                        
                        const hasExpiringSoon = welderCertificates.some(cert => {
                          try {
                            const expiryDate = parseISO(cert.expiryDate);
                            return isAfter(expiryDate, today) && isBefore(expiryDate, thirtyDaysFromNow);
                          } catch (e) {
                            return false;
                          }
                        });

                        return (
                          <TableRow key={welder.id}>
                            <TableCell>{welder.welderId}</TableCell>
                            <TableCell>{welder.name}</TableCell>
                            <TableCell>{welder.trade}</TableCell>
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
                            <TableCell>
                              <div className="flex gap-1">
                                {welderCertificates.length > 0 && (
                                  <Badge variant="outline" className="bg-primary/10">
                                    {welderCertificates.length}
                                  </Badge>
                                )}
                                
                                {hasExpiringSoon && (
                                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-400">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Expiring
                                  </Badge>
                                )}
                                
                                {hasExpired && (
                                  <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-400">
                                    Expired
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleEditWelder(welder)}
                                  >
                                    Edit Welder
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleViewCertificates(welder)}
                                  >
                                    View Certificates
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => navigate(`/quality/welder-certificates/${welder.id}`)}
                                  >
                                    Manage Certificates
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
          </TabsContent>

          <TabsContent value="expiring_soon" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Welder ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weldersWithExpiringSoonCertificates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10">
                          No certificates expiring soon.
                        </TableCell>
                      </TableRow>
                    ) : (
                      weldersWithExpiringSoonCertificates.flatMap(({ welder, certificates }) => 
                        certificates
                          .filter(cert => {
                            try {
                              const expiryDate = parseISO(cert.expiryDate);
                              return isAfter(expiryDate, today) && isBefore(expiryDate, thirtyDaysFromNow);
                            } catch (e) {
                              return false;
                            }
                          })
                          .map(cert => (
                            <TableRow key={`${welder.id}-${cert.id}`}>
                              <TableCell>{welder.welderId}</TableCell>
                              <TableCell>{welder.name}</TableCell>
                              <TableCell>{cert.certificateNo}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-400">
                                  {format(parseISO(cert.expiryDate), "dd MMM yyyy")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/quality/welder-certificates/${welder.id}`)}
                                >
                                  Renew
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                      )
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expired" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Welder ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weldersWithExpiredCertificates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10">
                          No expired certificates.
                        </TableCell>
                      </TableRow>
                    ) : (
                      weldersWithExpiredCertificates.flatMap(({ welder, certificates }) => 
                        certificates
                          .filter(cert => {
                            try {
                              return isBefore(parseISO(cert.expiryDate), today);
                            } catch (e) {
                              return false;
                            }
                          })
                          .map(cert => (
                            <TableRow key={`${welder.id}-${cert.id}`}>
                              <TableCell>{welder.welderId}</TableCell>
                              <TableCell>{welder.name}</TableCell>
                              <TableCell>{cert.certificateNo}</TableCell>
                              <TableCell>
                                <Badge variant="destructive">
                                  {format(parseISO(cert.expiryDate), "dd MMM yyyy")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/quality/welder-certificates/${welder.id}`)}
                                >
                                  Renew
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                      )
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Welder Dialog */}
        <Dialog open={isEditWelderOpen} onOpenChange={setIsEditWelderOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Welder</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
                <div className="flex mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium">Personal Information</h3>
                  </div>
                  <div className="w-48">
                    <FormField
                      control={editForm.control}
                      name="photoFile"
                      render={({ field: { value, onChange } }) => (
                        <FormItem>
                          <FormControl>
                            <WelderPhotoUpload
                              onPhotoUploadSuccess={(path) => {
                                // When a photo is uploaded, update the form data
                                // with the path so we can use it in form submission
                                editForm.setValue("photoPath", path);
                              }}
                              welderId={selectedWelder?.id}
                              welderCode={selectedWelder?.welderId} // Add the string format welderId (W-001)
                              existingPhotoUrl={selectedWelder?.photoPath ? `/api/welder-photos/${selectedWelder.id}` : undefined}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status*</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
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
                    name="contactNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Phone number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="hireDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Hire Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="identificationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Identification Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select ID type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Passport">Passport</SelectItem>
                            <SelectItem value="Pan Card">Pan Card</SelectItem>
                            <SelectItem value="Aadhar Card">Aadhar Card</SelectItem>
                            <SelectItem value="Voter ID">Voter ID</SelectItem>
                            <SelectItem value="Driving License">Driving License</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="identificationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Identification Number</FormLabel>
                        <FormControl>
                          <Input placeholder="ID number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={editForm.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Remarks</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional remarks" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={updateWelderMutation.isPending}
                  >
                    {updateWelderMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Update Welder
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* View Certificates Dialog */}
        <Dialog open={isViewCertificatesOpen} onOpenChange={setIsViewCertificatesOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {selectedWelder?.name} - Certificates
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
              {certificates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No certificates found for this welder.</p>
                  <Button
                    className="mt-4"
                    onClick={() => navigate(`/quality/welder-certificates/${selectedWelder?.id}`)}
                  >
                    Add Certificate
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate No</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>WPQR</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((certificate) => {
                      // Get normalized property names (handle both camelCase and snake_case)
                      const expiryDate = certificate.expiryDate || (certificate as any).expiry_date;
                      const issueDate = certificate.issueDate || (certificate as any).issue_date;
                      const certNumber = certificate.certificateNo || (certificate as any).certificate_no;
                      const certType = certificate.certificateType || (certificate as any).certificate_type;
                      const wpqrId = certificate.wpqrDocumentId || (certificate as any).wpqr_document_id || "N/A";
                      
                      // Safe date parsing
                      const parseDate = (dateStr: string | undefined) => {
                        if (!dateStr) return new Date();
                        try {
                          return parseISO(dateStr);
                        } catch (e) {
                          console.error("Error parsing date:", dateStr, e);
                          return new Date();
                        }
                      };
                      
                      const expiryDateObj = parseDate(expiryDate);
                      const issueDateObj = parseDate(issueDate);
                      
                      const isExpired = isBefore(expiryDateObj, today);
                      const isExpiring = isAfter(expiryDateObj, today) && 
                                        isBefore(expiryDateObj, thirtyDaysFromNow);
                      
                      // Safe date formatting
                      const formatDate = (date: Date) => {
                        try {
                          return format(date, "dd MMM yyyy");
                        } catch (e) {
                          return "Invalid date";
                        }
                      };
                      
                      return (
                        <TableRow key={certificate.id}>
                          <TableCell>{certNumber}</TableCell>
                          <TableCell>{certType}</TableCell>
                          <TableCell>{wpqrId}</TableCell>
                          <TableCell>{formatDate(issueDateObj)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={isExpired ? "destructive" : isExpiring ? "outline" : "default"}
                              className={isExpiring ? "bg-yellow-500/10 text-yellow-600 border-yellow-400" : ""}
                            >
                              {formatDate(expiryDateObj)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                certificate.status === "Active"
                                  ? "default"
                                  : certificate.status === "Expired"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {certificate.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  // Get a fresh signed URL for this certificate
                                  const response = await fetch(`/api/quality/welder-certificates/${certificate.id}/url`);
                                  if (!response.ok) {
                                    throw new Error("Failed to get certificate URL");
                                  }
                                  const data = await response.json();
                                  if (!data.fileUrl) {
                                    throw new Error("No file URL returned");
                                  }
                                  
                                  // Show a loading toast
                                  toast({
                                    title: "Opening certificate",
                                    description: "Certificate file is being loaded...",
                                  });
                                  
                                  // Open in new tab - with error handling on the URL
                                  const newTab = window.open("about:blank", "_blank");
                                  if (!newTab) {
                                    throw new Error("Could not open new tab. Please check your popup blocker settings.");
                                  }
                                  
                                  try {
                                    // Try to navigate to the URL
                                    newTab.location.href = data.fileUrl;
                                  } catch (navigateError) {
                                    newTab.close();
                                    throw new Error("The file could not be accessed. It may be unavailable or have restricted permissions.");
                                  }
                                } catch (error) {
                                  toast({
                                    title: "Error",
                                    description: error instanceof Error ? error.message : "Failed to view certificate",
                                    variant: "destructive"
                                  });
                                }
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => navigate(`/quality/welder-certificates/${selectedWelder?.id}`)}
              >
                Manage Certificates
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
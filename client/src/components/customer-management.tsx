import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Customer, InsertCustomer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import CustomerImport from "./customer-import";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusCircle,
  Pencil,
  Trash2,
  Search,
  X,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const countryToContinent: Record<string, string> = {
  "Afghanistan": "Asia", "Albania": "Europe", "Algeria": "Africa", "Andorra": "Europe",
  "Angola": "Africa", "Argentina": "South America", "Armenia": "Asia", "Australia": "Oceania",
  "Austria": "Europe", "Azerbaijan": "Asia", "Bahrain": "Asia", "Bangladesh": "Asia",
  "Belarus": "Europe", "Belgium": "Europe", "Benin": "Africa", "Bhutan": "Asia",
  "Bolivia": "South America", "Bosnia and Herzegovina": "Europe", "Botswana": "Africa",
  "Brazil": "South America", "Brunei": "Asia", "Bulgaria": "Europe", "Burkina Faso": "Africa",
  "Burundi": "Africa", "Cambodia": "Asia", "Cameroon": "Africa", "Canada": "North America",
  "Central African Republic": "Africa", "Chad": "Africa", "Chile": "South America",
  "China": "Asia", "Colombia": "South America", "Comoros": "Africa", "Congo": "Africa",
  "Costa Rica": "North America", "Croatia": "Europe", "Cuba": "North America", "Cyprus": "Europe",
  "Czech Republic": "Europe", "Denmark": "Europe", "Djibouti": "Africa",
  "Dominican Republic": "North America", "Ecuador": "South America", "Egypt": "Africa",
  "El Salvador": "North America", "Equatorial Guinea": "Africa", "Eritrea": "Africa",
  "Estonia": "Europe", "Eswatini": "Africa", "Ethiopia": "Africa", "Fiji": "Oceania",
  "Finland": "Europe", "France": "Europe", "Gabon": "Africa", "Gambia": "Africa",
  "Georgia": "Asia", "Germany": "Europe", "Ghana": "Africa", "Greece": "Europe",
  "Guatemala": "North America", "Guinea": "Africa", "Guinea-Bissau": "Africa",
  "Guyana": "South America", "Haiti": "North America", "Honduras": "North America",
  "Hungary": "Europe", "Iceland": "Europe", "India": "Asia", "Indonesia": "Asia",
  "Iran": "Asia", "Iraq": "Asia", "Ireland": "Europe", "Israel": "Asia", "Italy": "Europe",
  "Ivory Coast": "Africa", "Jamaica": "North America", "Japan": "Asia", "Jordan": "Asia",
  "Kazakhstan": "Asia", "Kenya": "Africa", "Kuwait": "Asia", "Kyrgyzstan": "Asia",
  "Laos": "Asia", "Latvia": "Europe", "Lebanon": "Asia", "Lesotho": "Africa",
  "Liberia": "Africa", "Libya": "Africa", "Liechtenstein": "Europe", "Lithuania": "Europe",
  "Luxembourg": "Europe", "Madagascar": "Africa", "Malawi": "Africa", "Malaysia": "Asia",
  "Maldives": "Asia", "Mali": "Africa", "Malta": "Europe", "Mauritania": "Africa",
  "Mauritius": "Africa", "Mexico": "North America", "Moldova": "Europe", "Monaco": "Europe",
  "Mongolia": "Asia", "Montenegro": "Europe", "Morocco": "Africa", "Mozambique": "Africa",
  "Myanmar": "Asia", "Namibia": "Africa", "Nepal": "Asia", "Netherlands": "Europe",
  "New Zealand": "Oceania", "Nicaragua": "North America", "Niger": "Africa", "Nigeria": "Africa",
  "North Korea": "Asia", "North Macedonia": "Europe", "Norway": "Europe", "Oman": "Asia",
  "Pakistan": "Asia", "Palestine": "Asia", "Panama": "North America",
  "Papua New Guinea": "Oceania", "Paraguay": "South America", "Peru": "South America",
  "Philippines": "Asia", "Poland": "Europe", "Portugal": "Europe", "Qatar": "Asia",
  "Romania": "Europe", "Russia": "Europe", "Rwanda": "Africa", "Saudi Arabia": "Asia",
  "Senegal": "Africa", "Serbia": "Europe", "Sierra Leone": "Africa", "Singapore": "Asia",
  "Slovakia": "Europe", "Slovenia": "Europe", "Somalia": "Africa", "South Africa": "Africa",
  "South Korea": "Asia", "South Sudan": "Africa", "Spain": "Europe", "Sri Lanka": "Asia",
  "Sudan": "Africa", "Suriname": "South America", "Sweden": "Europe", "Switzerland": "Europe",
  "Syria": "Asia", "Taiwan": "Asia", "Tajikistan": "Asia", "Tanzania": "Africa",
  "Thailand": "Asia", "Togo": "Africa", "Trinidad and Tobago": "North America",
  "Tunisia": "Africa", "Turkey": "Europe", "Turkmenistan": "Asia", "Uganda": "Africa",
  "Ukraine": "Europe", "United Arab Emirates": "Asia", "United Kingdom": "Europe",
  "United States": "North America", "Uruguay": "South America", "Uzbekistan": "Asia",
  "Venezuela": "South America", "Vietnam": "Asia", "Yemen": "Asia", "Zambia": "Africa",
  "Zimbabwe": "Africa"
};
const countries = Object.keys(countryToContinent).sort();

const countryToPhoneCode: Record<string, string> = {
  "Afghanistan": "+93", "Albania": "+355", "Algeria": "+213", "Andorra": "+376",
  "Angola": "+244", "Argentina": "+54", "Armenia": "+374", "Australia": "+61",
  "Austria": "+43", "Azerbaijan": "+994", "Bahrain": "+973", "Bangladesh": "+880",
  "Belarus": "+375", "Belgium": "+32", "Benin": "+229", "Bhutan": "+975",
  "Bolivia": "+591", "Bosnia and Herzegovina": "+387", "Botswana": "+267",
  "Brazil": "+55", "Brunei": "+673", "Bulgaria": "+359", "Burkina Faso": "+226",
  "Burundi": "+257", "Cambodia": "+855", "Cameroon": "+237", "Canada": "+1",
  "Central African Republic": "+236", "Chad": "+235", "Chile": "+56",
  "China": "+86", "Colombia": "+57", "Comoros": "+269", "Congo": "+242",
  "Costa Rica": "+506", "Croatia": "+385", "Cuba": "+53", "Cyprus": "+357",
  "Czech Republic": "+420", "Denmark": "+45", "Djibouti": "+253",
  "Dominican Republic": "+1", "Ecuador": "+593", "Egypt": "+20",
  "El Salvador": "+503", "Equatorial Guinea": "+240", "Eritrea": "+291",
  "Estonia": "+372", "Eswatini": "+268", "Ethiopia": "+251", "Fiji": "+679",
  "Finland": "+358", "France": "+33", "Gabon": "+241", "Gambia": "+220",
  "Georgia": "+995", "Germany": "+49", "Ghana": "+233", "Greece": "+30",
  "Guatemala": "+502", "Guinea": "+224", "Guinea-Bissau": "+245",
  "Guyana": "+592", "Haiti": "+509", "Honduras": "+504",
  "Hungary": "+36", "Iceland": "+354", "India": "+91", "Indonesia": "+62",
  "Iran": "+98", "Iraq": "+964", "Ireland": "+353", "Israel": "+972", "Italy": "+39",
  "Ivory Coast": "+225", "Jamaica": "+1", "Japan": "+81", "Jordan": "+962",
  "Kazakhstan": "+7", "Kenya": "+254", "Kuwait": "+965", "Kyrgyzstan": "+996",
  "Laos": "+856", "Latvia": "+371", "Lebanon": "+961", "Lesotho": "+266",
  "Liberia": "+231", "Libya": "+218", "Liechtenstein": "+423", "Lithuania": "+370",
  "Luxembourg": "+352", "Madagascar": "+261", "Malawi": "+265", "Malaysia": "+60",
  "Maldives": "+960", "Mali": "+223", "Malta": "+356", "Mauritania": "+222",
  "Mauritius": "+230", "Mexico": "+52", "Moldova": "+373", "Monaco": "+377",
  "Mongolia": "+976", "Montenegro": "+382", "Morocco": "+212", "Mozambique": "+258",
  "Myanmar": "+95", "Namibia": "+264", "Nepal": "+977", "Netherlands": "+31",
  "New Zealand": "+64", "Nicaragua": "+505", "Niger": "+227", "Nigeria": "+234",
  "North Korea": "+850", "North Macedonia": "+389", "Norway": "+47", "Oman": "+968",
  "Pakistan": "+92", "Palestine": "+970", "Panama": "+507",
  "Papua New Guinea": "+675", "Paraguay": "+595", "Peru": "+51",
  "Philippines": "+63", "Poland": "+48", "Portugal": "+351", "Qatar": "+974",
  "Romania": "+40", "Russia": "+7", "Rwanda": "+250", "Saudi Arabia": "+966",
  "Senegal": "+221", "Serbia": "+381", "Sierra Leone": "+232", "Singapore": "+65",
  "Slovakia": "+421", "Slovenia": "+386", "Somalia": "+252", "South Africa": "+27",
  "South Korea": "+82", "South Sudan": "+211", "Spain": "+34", "Sri Lanka": "+94",
  "Sudan": "+249", "Suriname": "+597", "Sweden": "+46", "Switzerland": "+41",
  "Syria": "+963", "Taiwan": "+886", "Tajikistan": "+992", "Tanzania": "+255",
  "Thailand": "+66", "Togo": "+228", "Trinidad and Tobago": "+1",
  "Tunisia": "+216", "Turkey": "+90", "Turkmenistan": "+993", "Uganda": "+256",
  "Ukraine": "+380", "United Arab Emirates": "+971", "United Kingdom": "+44",
  "United States": "+1", "Uruguay": "+598", "Uzbekistan": "+998",
  "Venezuela": "+58", "Vietnam": "+84", "Yemen": "+967", "Zambia": "+260",
  "Zimbabwe": "+263"
};

// Create a schema for customer validation
const customerSchema = z.object({
  bpCode: z.string().min(1, "BP Code is required").max(50),
  bpName: z.string().min(1, "BP Name is required").max(100),
  contactPerson: z.string().min(1, "Contact Person is required"),
  contactPosition: z.string().optional(),
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  phone1: z.string().min(1, "Cellular is required"),
  contact2Name: z.string().optional(),
  contact2Position: z.string().optional(),
  contact2Email: z.string().optional(),
  contact2Phone: z.string().optional(),
  contact3Name: z.string().optional(),
  contact3Position: z.string().optional(),
  contact3Email: z.string().optional(),
  contact3Phone: z.string().optional(),
  billToAddress: z.string().min(1, "Billing Address is required"),
  shipToAddress: z.string().min(1, "Shipping Address is required"),
  cardType: z.string().default("C"),
  glblLocNum: z.string().default("NA"),
  uStateSupply: z.string().default("MH"),
  uBpGstType: z.string().default("G"),
  currency: z.string().default("USD"),
  continent: z.string().min(1, "Continent is required"),
  countryName: z.string().min(1, "Country is required"),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function CustomerManagement({ customers }: { customers: Customer[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [emailVerifyStatus, setEmailVerifyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [emailVerifyMessage, setEmailVerifyMessage] = useState("");

  const verifyEmail = async (email: string) => {
    if (!email || !email.includes('@')) {
      setEmailVerifyStatus('idle');
      return;
    }
    setEmailVerifyStatus('checking');
    try {
      const res = await apiRequest("POST", "/api/customers/verify-email", { email });
      if (res.valid) {
        setEmailVerifyStatus('valid');
        setEmailVerifyMessage('Email domain verified');
      } else {
        setEmailVerifyStatus('invalid');
        setEmailVerifyMessage(res.reason || 'Email verification failed');
      }
    } catch {
      setEmailVerifyStatus('idle');
    }
  };
  
  // Define form
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      bpCode: "",
      bpName: "",
      contactPerson: "",
      contactPosition: "",
      email: "",
      phone1: "",
      contact2Name: "",
      contact2Position: "",
      contact2Email: "",
      contact2Phone: "",
      contact3Name: "",
      contact3Position: "",
      contact3Email: "",
      contact3Phone: "",
      billToAddress: "",
      shipToAddress: "",
      cardType: "C",
      glblLocNum: "NA",
      uStateSupply: "MH",
      uBpGstType: "G",
      currency: "USD",
      continent: "",
      countryName: "",
    },
  });

  // Create customer mutation
  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormValues) => {
      // Set parseJson to true so apiRequest will handle the JSON parsing
      return await apiRequest("POST", "/api/customers", data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const sapStatus = response?.sapSyncStatus;
      toast({
        title: "Customer created",
        description: sapStatus === 'synced' 
          ? "Customer created and synced to SAP B1 successfully." 
          : sapStatus === 'failed'
          ? `Customer created locally. SAP sync failed: ${response?.sapSyncError || 'Unknown error'}`
          : "Customer created locally. SAP sync was skipped.",
        variant: sapStatus === 'failed' ? "destructive" : "default",
      });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to create customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update customer mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CustomerFormValues }) => {
      // Set parseJson to true so apiRequest will handle the JSON parsing
      return await apiRequest("PUT", `/api/customers/${id}`, data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const sapStatus = response?.sapSyncStatus;
      toast({
        title: "Customer updated",
        description: sapStatus === 'synced' 
          ? "Customer updated and synced to SAP B1 successfully." 
          : sapStatus === 'failed'
          ? `Customer updated locally. SAP sync failed: ${response?.sapSyncError || 'Unknown error'}`
          : "Customer updated locally. SAP sync was skipped.",
        variant: sapStatus === 'failed' ? "destructive" : "default",
      });
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Customer deleted",
        description: "The customer has been deleted successfully.",
      });
      setIsDeleteDialogOpen(false);
      setCustomerToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter customers based on search query
  const filteredCustomers = customers.filter((customer) => {
    const searchTerm = searchQuery.toLowerCase();
    return (
      customer.bpCode.toLowerCase().includes(searchTerm) ||
      customer.bpName.toLowerCase().includes(searchTerm) ||
      (customer.contactPerson && customer.contactPerson.toLowerCase().includes(searchTerm)) ||
      (customer.email && customer.email.toLowerCase().includes(searchTerm))
    );
  });

  // Handle form submissions
  const onSubmitCreate = (data: CustomerFormValues) => {
    createMutation.mutate(data);
  };

  const onSubmitEdit = (data: CustomerFormValues) => {
    if (editingCustomer) {
      // Don't need to manually set updatedAt as the server will handle it
      updateMutation.mutate({ id: editingCustomer.id, data });
    }
  };

  const handleDelete = () => {
    if (customerToDelete) {
      deleteMutation.mutate(customerToDelete.id);
    }
  };

  // Open edit dialog and populate form with customer data
  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    form.reset({
      bpCode: customer.bpCode,
      bpName: customer.bpName,
      contactPerson: customer.contactPerson || "",
      contactPosition: (customer as any).contactPosition || "",
      email: customer.email || "",
      phone1: (customer as any).phone1 || "",
      contact2Name: (customer as any).contact2Name || "",
      contact2Position: (customer as any).contact2Position || "",
      contact2Email: (customer as any).contact2Email || "",
      contact2Phone: (customer as any).contact2Phone || "",
      contact3Name: (customer as any).contact3Name || "",
      contact3Position: (customer as any).contact3Position || "",
      contact3Email: (customer as any).contact3Email || "",
      contact3Phone: (customer as any).contact3Phone || "",
      billToAddress: customer.billToAddress || "",
      shipToAddress: customer.shipToAddress || "",
      cardType: (customer as any).cardType || "C",
      glblLocNum: (customer as any).glblLocNum || "NA",
      uStateSupply: (customer as any).uStateSupply || "MH",
      uBpGstType: (customer as any).uBpGstType || "G",
      currency: (customer as any).currency || (customer.countryName === 'India' ? 'INR' : 'USD'),
      continent: customer.continent || "",
      countryName: customer.countryName || "",
    });
    setIsEditDialogOpen(true);
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Search and Create bar */}
      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import Customers
          </Button>
          <Button
            onClick={async () => {
              form.reset({
                bpCode: "",
                bpName: "",
                contactPerson: "",
                contactPosition: "",
                email: "",
                phone1: "",
                contact2Name: "",
                contact2Position: "",
                contact2Email: "",
                contact2Phone: "",
                contact3Name: "",
                contact3Position: "",
                contact3Email: "",
                contact3Phone: "",
                billToAddress: "",
                shipToAddress: "",
                cardType: "C",
                glblLocNum: "NA",
                uStateSupply: "MH",
                uBpGstType: "G",
                currency: "USD",
                continent: "",
                countryName: "",
              });
              setEmailVerifyStatus('idle');
              try {
                const res = await apiRequest("GET", "/api/customers/next-bp-code");
                if (res?.nextBpCode) {
                  form.setValue('bpCode', res.nextBpCode);
                }
              } catch (e) {
                console.error('Failed to fetch next BP code:', e);
              }
              setIsCreateDialogOpen(true);
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Manage your business partners with full CRUD operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No customers found matching your search"
                  : "No customers found. Create your first customer!"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[75px]">BP Code</TableHead>
                    <TableHead className="min-w-[250px]">BP Name</TableHead>
                    <TableHead className="w-[80px]">Card Type</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cellular</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Continent</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium font-mono text-xs">{customer.bpCode}</TableCell>
                      <TableCell className="font-medium">{customer.bpName}</TableCell>
                      <TableCell>
                        <Badge variant={(customer as any).cardType === "S" ? "secondary" : (customer as any).cardType === "L" ? "outline" : "default"} className="text-xs">
                          {(customer as any).cardType === "S" ? "Supplier" : (customer as any).cardType === "L" ? "Lead" : "Customer"}
                        </Badge>
                      </TableCell>
                      <TableCell>{customer.contactPerson || "-"}</TableCell>
                      <TableCell className="text-xs">{customer.email || "-"}</TableCell>
                      <TableCell className="text-xs">{(customer as any).phone1 || "-"}</TableCell>
                      <TableCell>{customer.countryName || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{customer.continent || "-"}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(customer)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Customer Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Enter the customer details below to create a new business partner record.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-2">
              <div className="rounded-lg border p-2 px-3 space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Partner Info</h4>
                <div className="grid grid-cols-[1fr_3fr] gap-2">
                  <FormField
                    control={form.control}
                    name="bpCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BP Code *</FormLabel>
                        <FormControl>
                          <Input placeholder="C00001" {...field} readOnly disabled className="opacity-70 cursor-not-allowed" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bpName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BP Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., ABC Industries Ltd." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

              </div>

              <div className="rounded-lg border p-2 px-3 space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact 1 (Primary)</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., John Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Managing Director" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="e.g., contact@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cellular *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., +91 98211 37879" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Contact 2 (Optional)</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField
                    control={form.control}
                    name="contact2Name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Jane Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact2Position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Purchase Manager" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact2Email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="e.g., jane@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact2Phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cellular</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., +91 98765 43210" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Contact 3 (Optional)</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField
                    control={form.control}
                    name="contact3Name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Bob Wilson" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact3Position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Technical Head" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact3Email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="e.g., bob@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact3Phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cellular</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., +44 7911 123456" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="rounded-lg border p-2 px-3 space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address & Location</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="billToAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Address *</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., 123 Business St, Mumbai" rows={5} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shipToAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center justify-between">
                          Shipping Address *
                          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => form.setValue('shipToAddress', form.getValues('billToAddress') || '')}>
                            Copy from Billing
                          </Button>
                        </FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., 123 Business St, Mumbai" rows={5} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="countryName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country *</FormLabel>
                        <Select onValueChange={(val) => { field.onChange(val); const cont = countryToContinent[val]; if (cont) form.setValue('continent', cont); form.setValue('currency', val === 'India' ? 'INR' : 'USD'); const phoneCode = countryToPhoneCode[val]; if (phoneCode) { const currentPhone = form.getValues('phone1') || ''; const stripped = currentPhone.replace(/^\+\d+\s*/, ''); form.setValue('phone1', phoneCode + ' ' + stripped); } }} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60">
                            {countries.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="continent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Continent *</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} readOnly className="bg-muted" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Customer"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update the customer details below.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-2">
              <div className="rounded-lg border p-2 px-3 space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Partner Info</h4>
                <div className="grid grid-cols-[1fr_3fr] gap-2">
                  <FormField
                    control={form.control}
                    name="bpCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BP Code *</FormLabel>
                        <FormControl>
                          <Input placeholder="C00001" {...field} readOnly={true} disabled={true} className="opacity-70 cursor-not-allowed" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bpName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BP Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., ABC Industries Ltd." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

              </div>

              <div className="rounded-lg border p-2 px-3 space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact 1 (Primary)</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., John Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Managing Director" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="e.g., contact@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cellular *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., +91 98211 37879" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Contact 2 (Optional)</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField
                    control={form.control}
                    name="contact2Name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Jane Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact2Position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Purchase Manager" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact2Email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="e.g., jane@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact2Phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cellular</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., +91 98765 43210" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-1">Contact 3 (Optional)</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField
                    control={form.control}
                    name="contact3Name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Bob Wilson" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact3Position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Technical Head" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact3Email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="e.g., bob@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact3Phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cellular</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., +44 7911 123456" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="rounded-lg border p-2 px-3 space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address & Location</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="billToAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Address *</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., 123 Business St, Mumbai" rows={5} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shipToAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center justify-between">
                          Shipping Address *
                          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => form.setValue('shipToAddress', form.getValues('billToAddress') || '')}>
                            Copy from Billing
                          </Button>
                        </FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., 123 Business St, Mumbai" rows={5} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="countryName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country *</FormLabel>
                        <Select onValueChange={(val) => { field.onChange(val); const cont = countryToContinent[val]; if (cont) form.setValue('continent', cont); form.setValue('currency', val === 'India' ? 'INR' : 'USD'); const phoneCode = countryToPhoneCode[val]; if (phoneCode) { const currentPhone = form.getValues('phone1') || ''; const stripped = currentPhone.replace(/^\+\d+\s*/, ''); form.setValue('phone1', phoneCode + ' ' + stripped); } }} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60">
                            {countries.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="continent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Continent *</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} readOnly className="bg-muted" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Customer"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {customerToDelete && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  You are about to delete {customerToDelete.bpName} ({customerToDelete.bpCode}).
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Customer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Customer Import Dialog */}
      <CustomerImport 
        open={isImportDialogOpen} 
        onOpenChange={setIsImportDialogOpen} 
      />
    </div>
  );
}
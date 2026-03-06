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

// Create a schema for customer validation
const customerSchema = z.object({
  bpCode: z.string().min(1, "BP Code is required").max(50),
  bpName: z.string().min(1, "BP Name is required").max(100),
  contactPerson: z.string().min(1, "Contact Person is required"),
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  phone1: z.string().min(1, "Phone is required"),
  billToAddress: z.string().min(1, "Billing Address is required"),
  shipToAddress: z.string().min(1, "Shipping Address is required"),
  continent: z.string().optional().nullable(),
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
  
  // Define form
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      bpCode: "",
      bpName: "",
      contactPerson: "",
      email: "",
      phone1: "",
      billToAddress: "",
      shipToAddress: "",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Customer created",
        description: "The customer has been created successfully.",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Customer updated",
        description: "The customer has been updated successfully.",
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
      email: customer.email || "",
      phone1: (customer as any).phone1 || "",
      billToAddress: customer.billToAddress || "",
      shipToAddress: customer.shipToAddress || "",
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
            onClick={() => {
              form.reset({
                bpCode: "",
                bpName: "",
                contactPerson: "",
                email: "",
                phone1: "",
                billToAddress: "",
                shipToAddress: "",
                continent: "",
                countryName: "",
              });
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
                    <TableHead>BP Code</TableHead>
                    <TableHead>BP Name</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.bpCode}</TableCell>
                      <TableCell>{customer.bpName}</TableCell>
                      <TableCell>{customer.contactPerson || "-"}</TableCell>
                      <TableCell>{customer.email || "-"}</TableCell>
                      <TableCell>{customer.countryName || "-"}</TableCell>
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
        <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Enter the customer details below to create a new business partner record.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bpCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BP Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., C00001" {...field} />
                      </FormControl>
                      <FormDescription>
                        Unique business partner code
                      </FormDescription>
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
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., John Smith" {...field} />
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="e.g., contact@example.com"
                          {...field}
                        />
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
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., +91 22 2617 8080" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="billToAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123 Business St, Mumbai" {...field} />
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
                        Shipping Address
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => form.setValue('shipToAddress', form.getValues('billToAddress') || '')}>
                          Copy from Billing
                        </Button>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123 Business St, Mumbai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="countryName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select onValueChange={(val) => { field.onChange(val); const cont = countryToContinent[val]; if (cont) form.setValue('continent', cont); }} value={field.value || ""}>
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
                      <FormLabel>Continent</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} readOnly className="bg-muted" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
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
        <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update the customer details below.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bpCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BP Code *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., C00001" 
                          {...field} 
                          readOnly={true}
                          disabled={true}
                          className="opacity-70 cursor-not-allowed"
                        />
                      </FormControl>
                      <FormDescription>
                        BP Code cannot be modified after creation
                      </FormDescription>
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
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., John Smith" {...field} />
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="e.g., contact@example.com"
                          {...field}
                        />
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
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., +91 22 2617 8080" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="billToAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123 Business St, Mumbai" {...field} />
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
                        Shipping Address
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => form.setValue('shipToAddress', form.getValues('billToAddress') || '')}>
                          Copy from Billing
                        </Button>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123 Business St, Mumbai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="countryName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select onValueChange={(val) => { field.onChange(val); const cont = countryToContinent[val]; if (cont) form.setValue('continent', cont); }} value={field.value || ""}>
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
                      <FormLabel>Continent</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} readOnly className="bg-muted" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
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
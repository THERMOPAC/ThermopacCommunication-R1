import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, MoreHorizontal, Phone, Mail, Building, Users, BarChart, Calendar, Info, Percent, DollarSign, UserCircle, Globe, Loader2, User, Eye } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Customer } from "@shared/schema";

// Industry options, sorted alphabetically
const industryOptions = [
  "Automotive",
  "Automotive Service & Maintenance",
  "Consultant",
  "Energy & Renewables",
  "Fleet Management Companies",
  "Industrial Equipment Maintenance",
  "Lubricants & Additives",
  "Manufacturing",
  "Marine & Shipping",
  "Mining & Heavy Machinery",
  "Oil & Gas",
  "Power Generation",
  "Re-refining & Base Oil Production",
  "Transportation & Logistics",
  "Waste Management & Recycling",
];

// Lead form schema with validations and additional fields for customer selection
const leadFormSchema = z.object({
  // Source of the lead: existing customer or new company
  leadSource: z.enum(['existing', 'new']).default('new'),
  
  // For existing customer selection
  customerId: z.string().optional(),
  
  // Common fields
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().url("Please enter a valid URL").optional().or(z.string().length(0)),
  currency: z.string().optional(),
  expectedRevenue: z.string().optional(),
  contactName: z.string().min(1, "Contact name is required"),
  contactTitle: z.string().optional(),
  contactEmail: z.string().email("Please enter a valid email address").optional().or(z.string().length(0)),
  contactPhone: z.string().optional(),
  sourceId: z.string().min(1, "Source is required"),
  statusId: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
  probability: z.string().regex(/^\d{1,3}$/, "Must be a number between 0-100").optional(),
  expectedCloseDate: z.string().optional(),
  assignedTo: z.string().optional(),
  createdBy: z.number().optional(),
});

// Lead type definition
type Lead = {
  id: number;
  companyName: string;
  industry: string | null;
  website: string | null;
  currency: string | null;
  expectedRevenue: string | null;
  contactName: string;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceId: number;
  sourceName: string;
  statusId: number;
  statusName: string;
  statusColor: string;
  notes: string | null;
  probability: number | null;
  estimatedValue: string | null;
  expectedCloseDate: string | null;
  assignedTo: number | null;
  assignedToName: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

// Lead source type
type LeadSource = {
  id: number;
  name: string;
  description: string | null;
};

// Lead status type
type LeadStatus = {
  id: number;
  name: string;
  description: string | null;
  color: string;
};

// LeadActivity type
type LeadActivity = {
  id: number;
  leadId: number;
  activityType: string;
  description: string;
  activityDate: string;
  createdBy: number;
  createdByName: string;
  nextFollowUp: string | null;
  createdAt: string;
};

export default function LeadsPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isViewingLead, setIsViewingLead] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Fetch leads
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ['/api/sales-marketing/leads'],
    refetchOnWindowFocus: false,
  });

  // Fetch lead sources
  const { data: leadSources = [], isLoading: isLoadingSources } = useQuery({
    queryKey: ['/api/sales-marketing/lead-sources'],
    refetchOnWindowFocus: false,
  });

  // Fetch lead statuses
  const { data: leadStatuses = [], isLoading: isLoadingStatuses } = useQuery({
    queryKey: ['/api/sales-marketing/lead-statuses'],
    refetchOnWindowFocus: false,
  });

  // Fetch existing customers
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    refetchOnWindowFocus: false,
  });

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (data: z.infer<typeof leadFormSchema>) => {
      // Prepare the data to send to the API
      const { leadSource, customerId, ...restData } = data;
      
      // If using an existing customer, populate fields from the selected customer
      let finalData = { ...restData };
      
      if (leadSource === 'existing' && customerId) {
        const selectedCustomer = customers.find(c => c.id.toString() === customerId);
        if (selectedCustomer) {
          finalData = {
            ...finalData,
            companyName: selectedCustomer.bpName,
            contactName: selectedCustomer.contactPerson || finalData.contactName,
            contactEmail: selectedCustomer.email || finalData.contactEmail,
          };
        }
      }
      
      // Ensure expectedCloseDate is properly formatted and convert types as needed
      const formattedData = {
        ...finalData,
        // Convert sourceId and statusId from string to number
        sourceId: finalData.sourceId ? parseInt(finalData.sourceId) : undefined,
        statusId: finalData.statusId ? parseInt(finalData.statusId) : undefined,
        // Make sure the date is in YYYY-MM-DD format for the server
        expectedCloseDate: finalData.expectedCloseDate ? finalData.expectedCloseDate : null,
        // Convert probability to number if it exists
        probability: finalData.probability ? parseInt(finalData.probability) : undefined
      };
      
      console.log('Creating lead with data:', formattedData);
      return apiRequest('POST', '/api/sales-marketing/leads', formattedData);
    },
    onSuccess: () => {
      toast({
        title: "Lead created",
        description: "New lead has been created successfully",
      });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
    },
    onError: (error) => {
      toast({
        title: "Error creating lead",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Update lead mutation
  const updateLeadMutation = useMutation({
    mutationFn: async (data: { id: number; formData: z.infer<typeof leadFormSchema> }) => {
      // Remove the leadSource and customerId fields as they're only needed for creation
      const { leadSource, customerId, ...restData } = data.formData;
      
      // Ensure expectedCloseDate is properly formatted
      const updatedData = {
        ...restData,
        // Make sure the date is in YYYY-MM-DD format for the server
        expectedCloseDate: restData.expectedCloseDate ? restData.expectedCloseDate : null
      };
      
      console.log('Updating lead with data:', updatedData);
      return apiRequest('PATCH', `/api/sales-marketing/leads/${data.id}`, updatedData);
    },
    onSuccess: (data) => {
      toast({
        title: "Lead updated",
        description: "Lead has been updated successfully",
      });
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
      console.log('Updated lead data:', data);
    },
    onError: (error) => {
      toast({
        title: "Error updating lead",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Delete lead mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/sales-marketing/leads/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Lead deleted",
        description: "Lead has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
    },
    onError: (error) => {
      toast({
        title: "Error deleting lead",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });
  
  // Convert lead to customer mutation
  const convertLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      return apiRequest('POST', `/api/sales-marketing/leads/${leadId}/convert`, {
        // Optional extra data can be passed here if needed
        bpCode: `L${leadId}`, // Generate default BP code
        continent: 'Asia' // Default continent
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Lead converted",
        description: "Lead has been successfully converted to a customer",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      
      // Close lead view
      setIsViewingLead(false);
    },
    onError: (error) => {
      toast({
        title: "Error converting lead",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Lead creation form
  const createForm = useForm<z.infer<typeof leadFormSchema>>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      leadSource: 'new',
      customerId: '',
      companyName: "",
      industry: "",
      website: "",
      currency: "USD",
      expectedRevenue: "",
      contactName: "",
      contactTitle: "",
      contactEmail: "",
      contactPhone: "",
      sourceId: "",
      statusId: "",
      notes: "",
      probability: "",
      expectedCloseDate: "",
      assignedTo: "",
    },
  });
  
  // Watch the leadSource field to conditionally show fields
  const leadSourceValue = createForm.watch('leadSource');
  const selectedCustomerId = createForm.watch('customerId');
  
  // When a customer is selected, populate relevant fields
  React.useEffect(() => {
    if (leadSourceValue === 'existing' && selectedCustomerId) {
      const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId);
      if (selectedCustomer) {
        createForm.setValue('companyName', selectedCustomer.bpName);
        if (selectedCustomer.contactPerson) {
          createForm.setValue('contactName', selectedCustomer.contactPerson);
        }
        if (selectedCustomer.email) {
          createForm.setValue('contactEmail', selectedCustomer.email);
        }
      }
    }
  }, [selectedCustomerId, leadSourceValue, customers]);

  // Lead edit form
  const editForm = useForm<z.infer<typeof leadFormSchema>>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      leadSource: 'new', // This is not relevant for editing
      companyName: "",
      industry: "",
      website: "",
      currency: "USD",
      expectedRevenue: "",
      contactName: "",
      contactTitle: "",
      contactEmail: "",
      contactPhone: "",
      sourceId: "",
      statusId: "",
      notes: "",
      probability: "",
      expectedCloseDate: "",
      assignedTo: "",
    },
  });

  // Handle lead creation submission
  const onCreateLeadSubmit = (data: z.infer<typeof leadFormSchema>) => {
    // Convert string numbers to actual numbers and ensure values exist before conversion
    const formattedData = {
      ...data,
      expectedRevenue: data.expectedRevenue || null,
      probability: data.probability ? parseInt(data.probability) : null,
      // Convert ID strings to numbers and ensure values exist
      sourceId: data.sourceId ? parseInt(data.sourceId) : 1,  // Default to first source if none selected
      statusId: data.statusId ? parseInt(data.statusId) : 1,  // Default to first status if none selected
      assignedTo: data.assignedTo ? (data.assignedTo === 'null' ? null : parseInt(data.assignedTo)) : null,
    };
    createLeadMutation.mutate(formattedData);
  };

  // Handle lead edit submission
  const onEditLeadSubmit = (data: z.infer<typeof leadFormSchema>) => {
    if (!selectedLead) return;
    
    // Convert string numbers to actual numbers and ensure values exist before conversion
    const formattedData = {
      ...data,
      expectedRevenue: data.expectedRevenue || null,
      probability: data.probability ? parseInt(data.probability) : null,
      // Convert ID strings to numbers and ensure values exist
      sourceId: data.sourceId ? parseInt(data.sourceId) : 1,  // Default to first source if none selected
      statusId: data.statusId ? parseInt(data.statusId) : 1,  // Default to first status if none selected
      assignedTo: data.assignedTo ? (data.assignedTo === 'null' ? null : parseInt(data.assignedTo)) : null,
    };
    
    updateLeadMutation.mutate({ id: selectedLead.id, formData: formattedData });
  };

  // Transform the nested lead data structure returned from API
  const processedLeads = React.useMemo(() => {
    if (!Array.isArray(leads)) {
      console.log('Leads is not an array:', leads);
      return [];
    }
    
    // Process and extract lead data from nested response
    return leads.map((item: any) => {
      if (!item || !item.lead) {
        console.log('Invalid lead item:', item);
        return null;
      }
      
      // Extract the main lead data
      const lead = item.lead;
      
      // Combine with related data
      return {
        ...lead,
        sourceName: item.source?.name || 'Unknown',
        statusName: item.status?.name || 'Unknown',
        statusColor: item.status?.color || '#CCCCCC',
        assignedToName: item.assignedTo?.username || null,
        createdByName: 'System' // We'll need to update this if we track created by
      };
    }).filter(Boolean);
  }, [leads]);
  
  // Filter leads based on active tab
  const filteredLeads = React.useMemo(() => {
    if (!processedLeads.length) return [];
    
    if (activeTab === "all") return processedLeads;
    return processedLeads.filter((lead: Lead) => 
      lead.statusName.toLowerCase() === activeTab.toLowerCase()
    );
  }, [processedLeads, activeTab]);

  // Handle opening edit dialog
  const handleEditClick = (lead: Lead) => {
    console.log('Editing lead:', lead);
    setSelectedLead(lead);
    
    // Reset and populate edit form with null safety checks
    editForm.reset({
      leadSource: 'new', // This is not relevant for editing
      companyName: lead.companyName || "",
      industry: lead.industry || "",
      website: lead.website || "",
      currency: lead.currency || "USD",
      expectedRevenue: lead.expectedRevenue ? lead.expectedRevenue.toString() : "",
      contactName: lead.contactName || "",
      contactTitle: lead.contactTitle || "",
      contactEmail: lead.contactEmail || "",
      contactPhone: lead.contactPhone || "",
      sourceId: lead.sourceId ? lead.sourceId.toString() : "1", // Default to first source
      statusId: lead.statusId ? lead.statusId.toString() : "1", // Default to first status
      notes: lead.notes || "",
      probability: lead.probability ? lead.probability.toString() : "",
      expectedCloseDate: lead.expectedCloseDate ? new Date(lead.expectedCloseDate).toISOString().split('T')[0] : "",
      assignedTo: lead.assignedTo ? lead.assignedTo.toString() : "",
    });
    
    setIsEditDialogOpen(true);
  };

  // Function to handle viewing lead details
  const handleViewLead = (lead: Lead) => {
    console.log('Viewing lead:', lead);
    setSelectedLead(lead);
    setIsViewingLead(true);
  };

  // Function to format date strings
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Fetch lead activities if a lead is selected for viewing
  const { data: leadActivities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ['/api/sales-marketing/leads', selectedLead?.id, 'activities'],
    enabled: !!selectedLead && isViewingLead,
    refetchOnWindowFocus: false,
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lead Management</h1>
            <p className="text-muted-foreground">Manage your sales leads and track conversions</p>
          </div>
          
          <Button onClick={() => setIsCreateDialogOpen(true)} className="ml-auto">
            <Plus className="mr-2 h-4 w-4" /> Add New Lead
          </Button>
        </div>

        {isViewingLead && selectedLead ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setIsViewingLead(false)}>
                  Back to Leads
                </Button>
                <h2 className="text-xl font-semibold">{selectedLead.companyName}</h2>
                <Badge style={{ backgroundColor: selectedLead.statusColor }}>
                  {selectedLead.statusName}
                </Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditClick(selectedLead)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-green-600"
                    onClick={() => {
                      if (confirm(`Convert ${selectedLead.companyName} to a customer? This action cannot be undone.`)) {
                        convertLeadMutation.mutate(selectedLead.id);
                      }
                    }}
                  >
                    <User className="mr-2 h-4 w-4" /> Convert to Customer
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete ${selectedLead.companyName}?`)) {
                        deleteLeadMutation.mutate(selectedLead.id);
                        setIsViewingLead(false);
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-2">
                    <Building className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{selectedLead.companyName}</p>
                      {selectedLead.industry && <p className="text-sm text-muted-foreground">{selectedLead.industry}</p>}
                    </div>
                  </div>
                  
                  {selectedLead.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <a href={selectedLead.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                        {selectedLead.website}
                      </a>
                    </div>
                  )}
                  
                  {selectedLead.currency && selectedLead.expectedRevenue && (
                    <div className="flex items-center gap-2">
                      <BarChart className="h-5 w-5 text-muted-foreground" />
                      <p className="text-sm">Expected Revenue: {selectedLead.currency} {selectedLead.expectedRevenue}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-2">
                    <UserCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{selectedLead.contactName}</p>
                      {selectedLead.contactTitle && <p className="text-sm text-muted-foreground">{selectedLead.contactTitle}</p>}
                    </div>
                  </div>
                  
                  {selectedLead.contactEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <a href={`mailto:${selectedLead.contactEmail}`} className="text-sm text-blue-600 hover:underline">
                        {selectedLead.contactEmail}
                      </a>
                    </div>
                  )}
                  
                  {selectedLead.contactPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <a href={`tel:${selectedLead.contactPhone}`} className="text-sm text-blue-600 hover:underline">
                        {selectedLead.contactPhone}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Lead Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Source</p>
                      <p className="text-sm">{selectedLead.sourceName}</p>
                    </div>
                  </div>
                  
                  {selectedLead.industry && (
                    <div className="flex items-center gap-2">
                      <Building className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Industry</p>
                        <p className="text-sm">{selectedLead.industry}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedLead.probability !== null && (
                    <div className="flex items-center gap-2">
                      <Percent className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Probability</p>
                        <p className="text-sm">{selectedLead.probability}%</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedLead.estimatedValue && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Estimated Value</p>
                        <p className="text-sm">{selectedLead.estimatedValue}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedLead.expectedCloseDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Expected Close Date</p>
                        <p className="text-sm">{formatDate(selectedLead.expectedCloseDate)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedLead.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{selectedLead.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes available</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Activity History</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingActivities ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : leadActivities.length > 0 ? (
                  <div className="space-y-4">
                    {leadActivities.map((activity: LeadActivity) => (
                      <Card key={activity.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{activity.activityType}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{formatDate(activity.activityDate)}</p>
                            <p className="text-xs text-muted-foreground">{activity.createdByName}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No activities recorded yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All Leads</TabsTrigger>
                {leadStatuses.map((status: LeadStatus) => (
                  <TabsTrigger key={status.id} value={status.name.toLowerCase()}>
                    {status.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              <TabsContent value={activeTab} className="mt-6">
                {isLoadingLeads ? (
                  <div className="w-full space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Building className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No leads found</h3>
                    <p className="text-muted-foreground mb-6">
                      {activeTab === "all" ? 
                        "You don't have any leads yet. Start by adding your first lead." : 
                        `You don't have any ${activeTab} leads yet.`}
                    </p>
                    <Button 
                      onClick={() => setIsCreateDialogOpen(true)}
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add your first lead
                    </Button>
                  </div>
                ) : (
                  <div className="w-full space-y-2">
                    {/* Column Headers */}
                    <div className="flex items-center p-2 bg-muted text-sm font-medium">
                      <div className="flex-shrink-0 w-1/5 mr-2">Company Name</div>
                      <div className="flex-shrink-0 w-1/6 mr-2">Contact Title</div>
                      <div className="flex-shrink-0 w-1/6 mr-2">Contact Phone</div>
                      <div className="flex-shrink-0 w-1/8 mr-2">Expected Revenue</div>
                      <div className="flex-shrink-0 w-1/12 mr-2">Probability</div>
                      <div className="flex-shrink-0 w-1/8 mr-2">Weighted Value</div>
                      <div className="flex-shrink-0 w-1/8 mr-2">Est. Close Date</div>
                      <div className="flex-shrink-0 ml-auto">Actions</div>
                    </div>
                    
                    {filteredLeads.map((lead: Lead) => (
                      <Card key={lead.id} className="overflow-hidden">
                        <div className="flex items-center p-3">
                          {/* Company Name */}
                          <div className="flex-shrink-0 w-1/5 mr-2">
                            <span className="font-medium truncate">{lead.companyName}</span>
                          </div>
                          
                          {/* Contact Title */}
                          <div className="flex-shrink-0 w-1/6 mr-2">
                            <span className="text-sm truncate">{lead.contactTitle || 'N/A'}</span>
                          </div>
                          
                          {/* Contact Phone */}
                          <div className="flex-shrink-0 w-1/6 mr-2">
                            {lead.contactPhone ? (
                              <a href={`tel:${lead.contactPhone}`} className="text-sm text-blue-600 hover:underline truncate">
                                {lead.contactPhone}
                              </a>
                            ) : (
                              <span className="text-sm text-muted-foreground">No phone</span>
                            )}
                          </div>
                          
                          {/* Expected Revenue */}
                          <div className="flex-shrink-0 w-1/8 mr-2">
                            <span className="text-sm">
                              {lead.currency || 'USD'} {lead.expectedRevenue || '0'}
                            </span>
                          </div>
                          
                          {/* Probability */}
                          <div className="flex-shrink-0 w-1/12 mr-2">
                            <span className="text-sm">
                              {lead.probability || '0'}%
                            </span>
                          </div>
                          
                          {/* Expected Revenue × Probability */}
                          <div className="flex-shrink-0 w-1/8 mr-2">
                            <span className="text-sm font-medium">
                              {lead.currency || 'USD'} {
                                ((parseFloat(lead.expectedRevenue || '0') * (lead.probability || 0)) / 100).toFixed(2)
                              }
                            </span>
                          </div>
                          
                          {/* Expected Close Date */}
                          <div className="flex-shrink-0 w-1/8 mr-2">
                            <span className="text-sm">
                              {lead.expectedCloseDate ? 
                                new Date(lead.expectedCloseDate).toLocaleDateString() : 
                                'Not set'}
                            </span>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2 ml-auto">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewLead(lead)}>
                                  <Eye className="mr-2 h-4 w-4" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditClick(lead)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete ${lead.companyName}?`)) {
                                      deleteLeadMutation.mutate(lead.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  if (confirm(`Convert ${lead.companyName} to a customer?`)) {
                                    convertLeadMutation.mutate(lead.id);
                                  }
                                }}>
                                  <Building className="mr-2 h-4 w-4" /> Convert to Customer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Create Lead Dialog with option to select existing customer */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>
              Enter the details of the potential customer to add them to your leads.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateLeadSubmit)} className="space-y-6">
              {/* Lead Source Selection */}
              <FormField
                control={createForm.control}
                name="leadSource"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Lead Source</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="new" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Enter new lead details manually
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="existing" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Select an existing customer
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Customer Selection Dropdown - Only shown when "existing" is selected */}
              {leadSourceValue === 'existing' && (
                <FormField
                  control={createForm.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer*</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingCustomers ? (
                            <div className="p-2 text-center">Loading customers...</div>
                          ) : customers.length === 0 ? (
                            <div className="p-2 text-center">No customers found</div>
                          ) : (
                            customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.bpName}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={createForm.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter company name" {...field} 
                            disabled={leadSourceValue === 'existing' && !!selectedCustomerId}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {industryOptions.map((industry) => (
                              <SelectItem key={industry} value={industry}>
                                {industry}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EURO</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="expectedRevenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Revenue</FormLabel>
                          <FormControl>
                            <Input placeholder="10000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="space-y-6">
                  <FormField
                    control={createForm.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter contact name" {...field}
                            disabled={leadSourceValue === 'existing' && !!selectedCustomerId && !!customers.find(c => c.id.toString() === selectedCustomerId)?.contactPerson}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="contactTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. CEO, Purchasing Manager" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input placeholder="email@example.com" {...field} 
                            disabled={leadSourceValue === 'existing' && !!selectedCustomerId && !!customers.find(c => c.id.toString() === selectedCustomerId)?.email}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 234 567 8900" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={createForm.control}
                    name="sourceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead Source*</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select lead source" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {leadSources.map((source: LeadSource) => (
                              <SelectItem key={source.id} value={source.id.toString()}>
                                {source.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="statusId"
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
                            {leadStatuses.map((status: LeadStatus) => (
                              <SelectItem key={status.id} value={status.id.toString()}>
                                {status.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={createForm.control}
                    name="probability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Probability (%)</FormLabel>
                        <FormControl>
                          <Input placeholder="50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="expectedCloseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Close Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={createForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional notes or details about this lead"
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLeadMutation.isPending}>
                  {createLeadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Lead
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Lead Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>
              Update the details of this lead.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditLeadSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={editForm.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter company name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {industryOptions.map((industry) => (
                              <SelectItem key={industry} value={industry}>
                                {industry}
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
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EURO</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="expectedRevenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Revenue</FormLabel>
                          <FormControl>
                            <Input placeholder="10000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="space-y-6">
                  <FormField
                    control={editForm.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter contact name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="contactTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. CEO, Purchasing Manager" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input placeholder="email@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 234 567 8900" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={editForm.control}
                    name="sourceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead Source*</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select lead source" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {leadSources.map((source: LeadSource) => (
                              <SelectItem key={source.id} value={source.id.toString()}>
                                {source.name}
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
                    name="statusId"
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
                            {leadStatuses.map((status: LeadStatus) => (
                              <SelectItem key={status.id} value={status.id.toString()}>
                                {status.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={editForm.control}
                    name="probability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Probability (%)</FormLabel>
                        <FormControl>
                          <Input placeholder="50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="expectedCloseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Close Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional notes or details about this lead"
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateLeadMutation.isPending}>
                  {updateLeadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Lead
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
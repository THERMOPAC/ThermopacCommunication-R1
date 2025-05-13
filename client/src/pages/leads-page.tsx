import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, MoreHorizontal, Phone, Mail, Building, Users, BarChart, Calendar } from "lucide-react";
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

// Lead form schema with validations
const leadFormSchema = z.object({
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
  estimatedCloseDate: z.string().optional(),
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
  estimatedCloseDate: string | null;
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

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (data: z.infer<typeof leadFormSchema>) => {
      return apiRequest('/api/sales-marketing/leads', {
        method: 'POST',
        data,
      });
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
      return apiRequest(`/api/sales-marketing/leads/${data.id}`, {
        method: 'PATCH',
        data: data.formData,
      });
    },
    onSuccess: () => {
      toast({
        title: "Lead updated",
        description: "Lead has been updated successfully",
      });
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
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
      return apiRequest(`/api/sales-marketing/leads/${id}`, {
        method: 'DELETE',
      });
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

  // Lead creation form
  const createForm = useForm<z.infer<typeof leadFormSchema>>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
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
      estimatedValue: "",
      estimatedCloseDate: "",
      assignedTo: "",
    },
  });

  // Lead edit form
  const editForm = useForm<z.infer<typeof leadFormSchema>>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
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
      estimatedValue: "",
      estimatedCloseDate: "",
      assignedTo: "",
    },
  });

  // Handle lead creation submission
  const onCreateLeadSubmit = (data: z.infer<typeof leadFormSchema>) => {
    // Convert string numbers to actual numbers
    const formattedData = {
      ...data,
      expectedRevenue: data.expectedRevenue || null,
      probability: data.probability ? parseInt(data.probability) : null,
      sourceId: parseInt(data.sourceId),
      statusId: parseInt(data.statusId),
      assignedTo: data.assignedTo ? parseInt(data.assignedTo) : null,
    };
    createLeadMutation.mutate(formattedData);
  };

  // Handle lead edit submission
  const onEditLeadSubmit = (data: z.infer<typeof leadFormSchema>) => {
    if (!selectedLead) return;
    
    // Convert string numbers to actual numbers
    const formattedData = {
      ...data,
      expectedRevenue: data.expectedRevenue || null,
      probability: data.probability ? parseInt(data.probability) : null,
      sourceId: parseInt(data.sourceId),
      statusId: parseInt(data.statusId),
      assignedTo: data.assignedTo ? parseInt(data.assignedTo) : null,
    };
    
    updateLeadMutation.mutate({ id: selectedLead.id, formData: formattedData });
  };

  // Filter leads based on active tab
  const filteredLeads = React.useMemo(() => {
    if (activeTab === "all") return leads;
    return leads.filter((lead: Lead) => 
      lead.statusName.toLowerCase() === activeTab.toLowerCase()
    );
  }, [leads, activeTab]);

  // Handle opening edit dialog
  const handleEditClick = (lead: Lead) => {
    setSelectedLead(lead);
    
    // Reset and populate edit form
    editForm.reset({
      companyName: lead.companyName,
      industry: lead.industry || "",
      website: lead.website || "",
      currency: lead.currency || "USD",
      expectedRevenue: lead.expectedRevenue ? lead.expectedRevenue.toString() : "",
      contactName: lead.contactName,
      contactTitle: lead.contactTitle || "",
      contactEmail: lead.contactEmail || "",
      contactPhone: lead.contactPhone || "",
      sourceId: lead.sourceId.toString(),
      statusId: lead.statusId.toString(),
      notes: lead.notes || "",
      probability: lead.probability ? lead.probability.toString() : "",
      estimatedValue: lead.estimatedValue || "",
      estimatedCloseDate: lead.estimatedCloseDate ? new Date(lead.estimatedCloseDate).toISOString().split('T')[0] : "",
      assignedTo: lead.assignedTo ? lead.assignedTo.toString() : "",
    });
    
    setIsEditDialogOpen(true);
  };

  // Function to handle viewing lead details
  const handleViewLead = (lead: Lead) => {
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
                  
                  {selectedLead.estimatedCloseDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Estimated Close</p>
                        <p className="text-sm">{formatDate(selectedLead.estimatedCloseDate)}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedLead.assignedToName && (
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Assigned To</p>
                        <p className="text-sm">{selectedLead.assignedToName}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {selectedLead.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line">{selectedLead.notes}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Activity History</CardTitle>
                <Button size="sm" variant="outline" onClick={() => {
                  // Add activity logic would go here
                  toast({
                    title: "Coming soon",
                    description: "Add activity functionality will be implemented soon",
                  });
                }}>
                  <Plus className="mr-2 h-4 w-4" /> Add Activity
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingActivities ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : leadActivities.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>No activities recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leadActivities.map((activity: LeadActivity) => (
                      <div key={activity.id} className="border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{activity.activityType}</p>
                            <p className="text-sm">{activity.createdByName} - {formatDate(activity.activityDate)}</p>
                          </div>
                          {activity.nextFollowUp && (
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(activity.nextFollowUp)}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm">{activity.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 w-full">
                <TabsTrigger value="all">All Leads</TabsTrigger>
                <TabsTrigger value="new">New</TabsTrigger>
                <TabsTrigger value="contacted">Contacted</TabsTrigger>
                <TabsTrigger value="qualified">Qualified</TabsTrigger>
                <TabsTrigger value="proposal">Proposal</TabsTrigger>
                <TabsTrigger value="negotiation">Negotiation</TabsTrigger>
                <TabsTrigger value="won">Won</TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab} className="mt-6">
                {isLoadingLeads ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Card key={i} className="overflow-hidden">
                        <CardHeader className="pb-2">
                          <Skeleton className="h-5 w-2/3" />
                          <Skeleton className="h-4 w-1/3 mt-2" />
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-4 rounded-full" />
                              <Skeleton className="h-4 w-2/3" />
                            </div>
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-4 rounded-full" />
                              <Skeleton className="h-4 w-1/2" />
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                          <Skeleton className="h-8 w-16" />
                          <Skeleton className="h-8 w-8 rounded-full" />
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-medium">No leads found</h3>
                    <p className="text-muted-foreground mt-2">
                      {activeTab === "all" 
                        ? "You haven't added any leads yet."
                        : `You don't have any ${activeTab} leads.`}
                    </p>
                    <Button 
                      onClick={() => setIsCreateDialogOpen(true)}
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add your first lead
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredLeads.map((lead: Lead) => (
                      <Card key={lead.id} className="overflow-hidden">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <CardTitle className="line-clamp-1">{lead.companyName}</CardTitle>
                              {lead.industry && (
                                <CardDescription>{lead.industry}</CardDescription>
                              )}
                            </div>
                            <Badge style={{ backgroundColor: lead.statusColor }}>
                              {lead.statusName}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <UserCircle className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm line-clamp-1">{lead.contactName}</span>
                            </div>
                            {lead.contactEmail && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <a href={`mailto:${lead.contactEmail}`} className="text-sm text-blue-600 hover:underline line-clamp-1">
                                  {lead.contactEmail}
                                </a>
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                              <Calendar className="h-4 w-4" />
                              <span>Added {formatDate(lead.createdAt)}</span>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewLead(lead)}
                          >
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
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
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Create Lead Dialog */}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={createForm.control}
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
                    control={createForm.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Manufacturing, Technology" {...field} />
                        </FormControl>
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
                            defaultValue={field.value || "USD"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EURO">EURO</SelectItem>
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
                            <Input placeholder="e.g. 50000" {...field} />
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
                          <Input placeholder="Enter contact name" {...field} />
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
                          <Input placeholder="e.g. CEO, Marketing Director" {...field} />
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
                          <Input placeholder="email@example.com" {...field} />
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
                          <Input placeholder="+1 123 456 7890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
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
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={createForm.control}
                  name="probability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Probability (%)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="estimatedValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Value</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. $10,000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="estimatedCloseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Close Date</FormLabel>
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
                        placeholder="Enter any additional information about this lead"
                        className="min-h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createLeadMutation.isPending}
                >
                  {createLeadMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
              Update the details of {selectedLead?.companyName}.
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
                        <FormControl>
                          <Input placeholder="e.g. Manufacturing, Technology" {...field} />
                        </FormControl>
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
                            defaultValue={field.value || "USD"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EURO">EURO</SelectItem>
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
                            <Input placeholder="e.g. 50000" {...field} />
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
                          <Input placeholder="e.g. CEO, Marketing Director" {...field} />
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
                          <Input placeholder="+1 123 456 7890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
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
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={editForm.control}
                  name="probability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Probability (%)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="estimatedValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Value</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. $10,000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="estimatedCloseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Close Date</FormLabel>
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
                        placeholder="Enter any additional information about this lead"
                        className="min-h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={updateLeadMutation.isPending}
                >
                  {updateLeadMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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

// Missing component imports
const DollarSign = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>

const Globe = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>

const Info = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>

const Loader2 = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>

const Percent = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>

const User = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>

const UserCircle = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  MoreHorizontal, 
  Calendar, 
  Megaphone,
  BarChart,
  Target,
  Clock,
  Users,
  DollarSign,
  TrendingUp,
  Eye
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";

// Campaign form schema with validations
const campaignFormSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().optional(),
  objective: z.string().min(1, "Campaign objective is required"),
  channelId: z.string().min(1, "Channel is required"),
  status: z.enum(["Planned", "Active", "Completed", "Cancelled"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  budget: z.string().optional(),
  targetAudience: z.string().optional(),
  // Performance metrics
  ctr: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  cpc: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  conversions: z.string().regex(/^\d*$/, "Must be a valid number").optional(),
  conversionRate: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  cpa: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  impressions: z.string().regex(/^\d*$/, "Must be a valid number").optional(),
  qualityScore: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  roas: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  impressionShare: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  bounceRate: z.string().regex(/^\d*\.?\d*$/, "Must be a valid number").optional(),
  expectedLeadCount: z.string().regex(/^\d*$/, "Must be a valid number").optional(),
  notes: z.string().optional(),
});

// Campaign type definition
type Campaign = {
  id: number;
  name: string;
  description: string | null;
  objective: string;
  channelId: number;
  channelName: string;
  status: "Planned" | "Active" | "Completed" | "Cancelled";
  startDate: string;
  endDate: string | null;
  budget: string | null;
  targetAudience: string | null;
  // Performance metrics
  ctr: number | null;
  cpc: number | null;
  conversions: number | null;
  conversionRate: number | null;
  cpa: number | null;
  impressions: number | null;
  qualityScore: number | null;
  roas: number | null;
  impressionShare: number | null;
  bounceRate: number | null;
  expectedLeadCount: number | null;
  actualLeadCount: number | null;
  notes: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

// Campaign Channel type
type CampaignChannel = {
  id: number;
  name: string;
  description: string | null;
};

// Campaign Activity type
type CampaignActivity = {
  id: number;
  campaignId: number;
  activityType: string;
  description: string;
  activityDate: string;
  results: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
};

export default function CampaignsPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isViewingCampaign, setIsViewingCampaign] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Fetch campaigns
  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['/api/sales-marketing/campaigns'],
    refetchOnWindowFocus: false,
  });

  // Fetch campaign channels
  const { data: campaignChannels = [], isLoading: isLoadingChannels } = useQuery({
    queryKey: ['/api/sales-marketing/campaign-channels'],
    refetchOnWindowFocus: false,
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: z.infer<typeof campaignFormSchema>) => {
      return apiRequest('POST', '/api/sales-marketing/campaigns', data);
    },
    onSuccess: () => {
      toast({
        title: "Campaign created",
        description: "New campaign has been created successfully",
      });
      setIsCreateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/campaigns'] });
    },
    onError: (error) => {
      toast({
        title: "Error creating campaign",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Update campaign mutation
  const updateCampaignMutation = useMutation({
    mutationFn: async (data: { id: number; formData: z.infer<typeof campaignFormSchema> }) => {
      return apiRequest('PATCH', `/api/sales-marketing/campaigns/${data.id}`, data.formData);
    },
    onSuccess: () => {
      toast({
        title: "Campaign updated",
        description: "Campaign has been updated successfully",
      });
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/campaigns'] });
    },
    onError: (error) => {
      toast({
        title: "Error updating campaign",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  // Campaign creation form
  const createForm = useForm<z.infer<typeof campaignFormSchema>>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      description: "",
      objective: "",
      channelId: "",
      status: "Planned",
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      budget: "",
      targetAudience: "",
      // Performance metrics
      ctr: "",
      cpc: "",
      conversions: "",
      conversionRate: "",
      cpa: "",
      impressions: "",
      qualityScore: "",
      roas: "",
      impressionShare: "",
      bounceRate: "",
      expectedLeadCount: "",
      notes: "",
    },
  });

  // Campaign edit form
  const editForm = useForm<z.infer<typeof campaignFormSchema>>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      description: "",
      objective: "",
      channelId: "",
      status: "Planned",
      startDate: "",
      endDate: "",
      budget: "",
      targetAudience: "",
      // Performance metrics
      ctr: "",
      cpc: "",
      conversions: "",
      conversionRate: "",
      cpa: "",
      impressions: "",
      qualityScore: "",
      roas: "",
      impressionShare: "",
      bounceRate: "",
      expectedLeadCount: "",
      notes: "",
    },
  });

  // Handle campaign creation submission
  const onCreateCampaignSubmit = (data: z.infer<typeof campaignFormSchema>) => {
    try {
      // Convert string numbers to actual numbers with safety checks
      const formattedData = {
        ...data,
        channelId: data.channelId ? parseInt(data.channelId) : null,
        expectedLeadCount: data.expectedLeadCount ? parseInt(data.expectedLeadCount) : null,
        // Convert performance metrics to numbers
        ctr: data.ctr ? parseFloat(data.ctr) : null,
        cpc: data.cpc ? parseFloat(data.cpc) : null,
        conversions: data.conversions ? parseInt(data.conversions) : null,
        conversionRate: data.conversionRate ? parseFloat(data.conversionRate) : null,
        cpa: data.cpa ? parseFloat(data.cpa) : null,
        impressions: data.impressions ? parseInt(data.impressions) : null,
        qualityScore: data.qualityScore ? parseFloat(data.qualityScore) : null,
        roas: data.roas ? parseFloat(data.roas) : null,
        impressionShare: data.impressionShare ? parseFloat(data.impressionShare) : null,
        bounceRate: data.bounceRate ? parseFloat(data.bounceRate) : null,
      };
      createCampaignMutation.mutate(formattedData);
    } catch (error) {
      console.error("Error formatting campaign data:", error);
      toast({
        title: "Error creating campaign",
        description: "There was an error processing your form data. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle campaign edit submission
  const onEditCampaignSubmit = (data: z.infer<typeof campaignFormSchema>) => {
    if (!selectedCampaign) return;
    
    try {
      // Convert string numbers to actual numbers with safety checks
      const formattedData = {
        ...data,
        channelId: data.channelId ? parseInt(data.channelId) : null,
        expectedLeadCount: data.expectedLeadCount ? parseInt(data.expectedLeadCount) : null,
        // Convert performance metrics to numbers
        ctr: data.ctr ? parseFloat(data.ctr) : null,
        cpc: data.cpc ? parseFloat(data.cpc) : null,
        conversions: data.conversions ? parseInt(data.conversions) : null,
        conversionRate: data.conversionRate ? parseFloat(data.conversionRate) : null,
        cpa: data.cpa ? parseFloat(data.cpa) : null,
        impressions: data.impressions ? parseInt(data.impressions) : null,
        qualityScore: data.qualityScore ? parseFloat(data.qualityScore) : null,
        roas: data.roas ? parseFloat(data.roas) : null,
        impressionShare: data.impressionShare ? parseFloat(data.impressionShare) : null,
        bounceRate: data.bounceRate ? parseFloat(data.bounceRate) : null,
      };
      
      updateCampaignMutation.mutate({ id: selectedCampaign.id, formData: formattedData });
    } catch (error) {
      console.error("Error formatting campaign data:", error);
      toast({
        title: "Error updating campaign",
        description: "There was an error processing your form data. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Filter campaigns based on active tab
  const filteredCampaigns = React.useMemo(() => {
    if (activeTab === "all") return campaigns;
    return campaigns.filter((campaign: Campaign) => 
      campaign.status.toLowerCase() === activeTab.toLowerCase()
    );
  }, [campaigns, activeTab]);

  // Handle opening edit dialog
  const handleEditClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    
    // Reset and populate edit form with safe defaults
    editForm.reset({
      name: campaign.name || "",
      description: campaign.description || "",
      objective: campaign.objective || "",
      channelId: campaign.channelId ? campaign.channelId.toString() : "",
      status: campaign.status || "Planned",
      startDate: campaign.startDate ? 
        (function() {
          try {
            return new Date(campaign.startDate).toISOString().split('T')[0];
          } catch (e) {
            console.error("Invalid startDate:", campaign.startDate);
            return "";
          }
        })() : "",
      endDate: campaign.endDate ? 
        (function() {
          try {
            return new Date(campaign.endDate).toISOString().split('T')[0];
          } catch (e) {
            console.error("Invalid endDate:", campaign.endDate);
            return "";
          }
        })() : "",
      budget: campaign.budget || "",
      targetAudience: campaign.targetAudience || "",
      // Performance metrics fields
      ctr: campaign.ctr ? campaign.ctr.toString() : "",
      cpc: campaign.cpc ? campaign.cpc.toString() : "",
      conversions: campaign.conversions ? campaign.conversions.toString() : "",
      conversionRate: campaign.conversionRate ? campaign.conversionRate.toString() : "",
      cpa: campaign.cpa ? campaign.cpa.toString() : "",
      impressions: campaign.impressions ? campaign.impressions.toString() : "",
      qualityScore: campaign.qualityScore ? campaign.qualityScore.toString() : "",
      roas: campaign.roas ? campaign.roas.toString() : "",
      impressionShare: campaign.impressionShare ? campaign.impressionShare.toString() : "",
      bounceRate: campaign.bounceRate ? campaign.bounceRate.toString() : "",
      expectedLeadCount: campaign.expectedLeadCount ? campaign.expectedLeadCount.toString() : "",
      notes: campaign.notes || "",
    });
    
    setIsEditDialogOpen(true);
  };

  // Function to handle viewing campaign details
  const handleViewCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsViewingCampaign(true);
  };

  // Function to format date strings
  const formatDate = (dateString: string) => {
    try {
      if (!dateString) return "-";
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return "-";
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return "-";
    }
  };

  // Calculate campaign completion percentage
  const calculateProgress = (campaign: Campaign) => {
    try {
      if (campaign.status === "Completed") return 100;
      if (campaign.status === "Cancelled") return 0;
      if (!campaign.startDate || !campaign.endDate) return 0;
      
      const start = new Date(campaign.startDate).getTime();
      const end = new Date(campaign.endDate).getTime();
      const now = new Date().getTime();
      
      // Validate that we have valid timestamps
      if (isNaN(start) || isNaN(end) || isNaN(now)) {
        console.warn('Invalid date detected in campaign', campaign.id);
        return 0;
      }
      
      if (now <= start) return 0;
      if (now >= end) return 100;
      
      return Math.round(((now - start) / (end - start)) * 100);
    } catch (error) {
      console.error('Error calculating progress:', error);
      return 0;
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Planned": return "bg-blue-500";
      case "Active": return "bg-green-500";
      case "Completed": return "bg-purple-500";
      case "Cancelled": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  // Fetch campaign activities if a campaign is selected for viewing
  const { data: campaignActivities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ['/api/sales-marketing/campaigns', selectedCampaign?.id, 'activities'],
    enabled: !!selectedCampaign && isViewingCampaign,
    refetchOnWindowFocus: false,
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Marketing Campaigns</h1>
            <p className="text-muted-foreground">Create and manage your marketing campaigns</p>
          </div>
          
          <Button onClick={() => setIsCreateDialogOpen(true)} className="ml-auto">
            <Plus className="mr-2 h-4 w-4" /> Create Campaign
          </Button>
        </div>

        {isViewingCampaign && selectedCampaign ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setIsViewingCampaign(false)}>
                  Back to Campaigns
                </Button>
                <h2 className="text-xl font-semibold">{selectedCampaign.name}</h2>
                <Badge className={getStatusColor(selectedCampaign.status)}>
                  {selectedCampaign.status}
                </Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditClick(selectedCampaign)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Description</p>
                    <p>{selectedCampaign.description || "No description provided"}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Objective</p>
                    <p>{selectedCampaign.objective}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Channel</p>
                      <p>{selectedCampaign.channelName}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Timeline</p>
                      <p>
                        {formatDate(selectedCampaign.startDate)} 
                        {selectedCampaign.endDate && ` to ${formatDate(selectedCampaign.endDate)}`}
                      </p>
                    </div>
                  </div>
                  
                  {selectedCampaign.budget && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Budget</p>
                        <p>{selectedCampaign.budget}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedCampaign.startDate && selectedCampaign.endDate && selectedCampaign.status === "Active" && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{calculateProgress(selectedCampaign)}%</span>
                      </div>
                      <Progress value={calculateProgress(selectedCampaign)} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Target & Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCampaign.targetAudience && (
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Target Audience</p>
                        <p>{selectedCampaign.targetAudience}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <h3 className="text-base font-medium mb-3">Performance Metrics</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedCampaign.ctr !== null && (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">CTR</p>
                            <p>{selectedCampaign.ctr}%</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.cpc !== null && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">CPC</p>
                            <p>${selectedCampaign.cpc}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.conversions !== null && (
                        <div className="flex items-center gap-2">
                          <BarChart className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Conversions</p>
                            <p>{selectedCampaign.conversions}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.conversionRate !== null && (
                        <div className="flex items-center gap-2">
                          <Target className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Conversion Rate</p>
                            <p>{selectedCampaign.conversionRate}%</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.cpa !== null && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">CPA</p>
                            <p>${selectedCampaign.cpa}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.impressions !== null && (
                        <div className="flex items-center gap-2">
                          <Eye className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Impressions</p>
                            <p>{selectedCampaign.impressions}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.qualityScore !== null && (
                        <div className="flex items-center gap-2">
                          <BarChart className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Quality Score</p>
                            <p>{selectedCampaign.qualityScore}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.roas !== null && (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">ROAS</p>
                            <p>{selectedCampaign.roas}x</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.impressionShare !== null && (
                        <div className="flex items-center gap-2">
                          <Eye className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Impression Share</p>
                            <p>{selectedCampaign.impressionShare}%</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedCampaign.bounceRate !== null && (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-muted-foreground rotate-180" />
                          <div>
                            <p className="text-sm font-medium">Bounce Rate</p>
                            <p>{selectedCampaign.bounceRate}%</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {selectedCampaign.expectedLeadCount && (
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Expected Leads</p>
                        <p>{selectedCampaign.expectedLeadCount}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedCampaign.actualLeadCount !== null && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Actual Leads</p>
                        <p>{selectedCampaign.actualLeadCount}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedCampaign.expectedLeadCount && selectedCampaign.actualLeadCount !== null && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Lead Generation</span>
                        <span>
                          {selectedCampaign.actualLeadCount} / {selectedCampaign.expectedLeadCount} 
                          ({Math.round((selectedCampaign.actualLeadCount / selectedCampaign.expectedLeadCount) * 100)}%)
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(
                          100, 
                          (selectedCampaign.actualLeadCount / selectedCampaign.expectedLeadCount) * 100
                        )} 
                        className="h-2" 
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {selectedCampaign.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line">{selectedCampaign.notes}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Campaign Activities</CardTitle>
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
                ) : campaignActivities.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>No activities recorded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {campaignActivities.map((activity: CampaignActivity) => (
                      <div key={activity.id} className="border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{activity.activityType}</p>
                            <p className="text-sm">{activity.createdByName} - {formatDate(activity.activityDate)}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-sm">{activity.description}</p>
                        {activity.results && (
                          <div className="mt-2 bg-muted p-2 rounded">
                            <p className="text-sm font-medium">Results:</p>
                            <p className="text-sm">{activity.results}</p>
                          </div>
                        )}
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
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 w-full">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="planned">Planned</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab} className="mt-6">
                {isLoadingCampaigns ? (
                  <div className="space-y-4">
                    <Card>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Timeline</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Skeleton className="h-5 w-[180px]" />
                              </TableCell>
                              <TableCell>
                                <Skeleton className="h-5 w-24" />
                              </TableCell>
                              <TableCell>
                                <Skeleton className="h-5 w-20" />
                              </TableCell>
                              <TableCell>
                                <Skeleton className="h-5 w-32" />
                              </TableCell>
                              <TableCell>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <Skeleton className="h-4 w-12" />
                                    <Skeleton className="h-4 w-8" />
                                  </div>
                                  <Skeleton className="h-2 w-full" />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Skeleton className="h-8 w-8 rounded-full" />
                                  <Skeleton className="h-8 w-8 rounded-full" />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-medium">No campaigns found</h3>
                    <p className="text-muted-foreground mt-2">
                      {activeTab === "all" 
                        ? "You haven't created any campaigns yet."
                        : `You don't have any ${activeTab} campaigns.`}
                    </p>
                    <Button 
                      onClick={() => setIsCreateDialogOpen(true)}
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Create your first campaign
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Card>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Timeline</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCampaigns.map((campaign: Campaign) => (
                            <TableRow key={campaign.id}>
                              <TableCell className="font-medium">
                                <div className="max-w-[300px] truncate">{campaign.name}</div>
                              </TableCell>
                              <TableCell>{campaign.channelName || "-"}</TableCell>
                              <TableCell>
                                <Badge className={getStatusColor(campaign.status)}>
                                  {campaign.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <span>{campaign.startDate ? formatDate(campaign.startDate) : "-"}</span>
                                  {campaign.endDate && (
                                    <>
                                      <span className="text-muted-foreground">-</span>
                                      <span>{formatDate(campaign.endDate)}</span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {campaign.startDate && campaign.endDate && (
                                  <div className="w-full space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span>Progress</span>
                                      <span>{calculateProgress(campaign)}%</span>
                                    </div>
                                    <Progress value={calculateProgress(campaign)} className="h-2 w-full" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleViewCampaign(campaign)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleEditClick(campaign)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>
              Fill in the details to create a new marketing campaign.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateCampaignSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter campaign name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="objective"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Objective*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Increase brand awareness, Generate leads" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={createForm.control}
                    name="channelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select channel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {campaignChannels.map((channel: CampaignChannel) => (
                              <SelectItem key={channel.id} value={channel.id.toString()}>
                                {channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-6">
                  <FormField
                    control={createForm.control}
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
                            <SelectItem value="Planned">Planned</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date*</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
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
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Budget</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. $5,000" {...field} />
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
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Business owners, aged 30-50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="border p-4 rounded-md mb-4 mt-2">
                  <h4 className="text-base font-medium mb-3">Performance Metrics</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="ctr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CTR (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g. 2.5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="cpc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CPC ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g. 1.25" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="conversions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conversions</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g. 45" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="conversionRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conversion Rate (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g. 3.2" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="cpa"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CPA ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g. 25.50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="impressions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Impressions</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g. 10000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="qualityScore"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quality Score</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" placeholder="e.g. 7.5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="roas"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ROAS (x)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" placeholder="e.g. 3.5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="impressionShare"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Impression Share (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g. 25.4" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="bounceRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bounce Rate (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="e.g. 45.2" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <FormField
                control={createForm.control}
                name="expectedLeadCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Lead Count</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the campaign details"
                        className="min-h-20"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={createForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional notes about this campaign"
                        className="min-h-20"
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
                  disabled={createCampaignMutation.isPending}
                >
                  {createCampaignMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Campaign
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Campaign Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>
              Update the details of {selectedCampaign?.name}.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditCampaignSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Name*</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter campaign name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="objective"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Objective*</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Increase brand awareness, Generate leads" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="channelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Channel*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select channel" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {campaignChannels.map((channel: CampaignChannel) => (
                              <SelectItem key={channel.id} value={channel.id.toString()}>
                                {channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-6">
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
                            <SelectItem value="Planned">Planned</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date*</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
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
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Budget</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. $5,000" {...field} />
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
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Business owners, aged 30-50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="kpis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>KPIs</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CTR, Conversion rate" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={editForm.control}
                name="expectedLeadCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Lead Count</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the campaign details"
                        className="min-h-20"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional notes about this campaign"
                        className="min-h-20"
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
                  disabled={updateCampaignMutation.isPending}
                >
                  {updateCampaignMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Campaign
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// Missing component import
const Loader2 = (props: any) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
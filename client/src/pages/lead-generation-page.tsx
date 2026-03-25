import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Search, Filter, Download, Loader2, AlertCircle, CheckCircle, Star,
  Globe, Mail, Calendar, Factory, TrendingUp, Eye, Plus, History,
  Target, Brain, Lightbulb, Zap, Award, Flame, Phone, Building2,
  Shield, Copy, ExternalLink, FileSpreadsheet, RefreshCw, Info
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getErrorMessage } from "@/lib/queryClient";

const searchFormSchema = z.object({
  query: z.string().min(3, "Search query must be at least 3 characters"),
  industry: z.string().optional(),
  country: z.string().optional(),
  siteSearch: z.string().optional(),
});

type SearchFormData = z.infer<typeof searchFormSchema>;

const INDUSTRY_OPTIONS = [
  { value: "all", label: "All Industries" },
  { value: "oil-refining", label: "Oil Re-refining & Recycling" },
  { value: "waste-oil-management", label: "Waste Oil Management" },
  { value: "petrochemical", label: "Petrochemical" },
  { value: "oil-gas", label: "Oil & Gas" },
  { value: "refining", label: "Petroleum Refining" },
  { value: "lubricants", label: "Lubricants & Base Oil" },
  { value: "environmental-services", label: "Environmental Services" },
  { value: "chemical", label: "Chemical Processing" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "automotive", label: "Automotive Industry" },
  { value: "industrial-equipment", label: "Industrial Equipment" },
  { value: "pharmaceutical", label: "Pharmaceutical" },
  { value: "food-beverage", label: "Food & Beverage" },
  { value: "engineering", label: "Engineering Services" },
];

const SMART_SEARCH_SUGGESTIONS = [
  {
    category: "Oil Collection Companies",
    icon: Factory,
    searches: [
      "waste oil collection services automotive",
      "used engine oil disposal companies",
      "industrial lubricant collection fleet"
    ]
  },
  {
    category: "Automotive Service Centers",
    icon: Building2,
    searches: [
      "auto service centers waste oil disposal",
      "car dealership oil change waste management",
      "fleet maintenance used oil generation"
    ]
  },
  {
    category: "Industrial Manufacturers",
    icon: Factory,
    searches: [
      "manufacturing plant used hydraulic oil",
      "industrial machinery lubricant waste",
      "heavy equipment oil maintenance contracts"
    ]
  },
  {
    category: "Environmental Agencies",
    icon: Globe,
    searches: [
      "environmental waste oil regulations tender",
      "government oil recycling procurement",
      "sustainability waste management RFP"
    ]
  },
  {
    category: "Refineries & Energy",
    icon: Zap,
    searches: [
      "petroleum refinery waste oil recycling",
      "energy company lubricant reprocessing",
      "oil terminal waste management systems"
    ]
  }
];

const COUNTRY_OPTIONS_BY_CONTINENT: Record<string, { value: string; label: string }[]> = {
  "All Countries": [{ value: "all", label: "All Countries" }],
  "Asia": [
    { value: "IN", label: "India" }, { value: "CN", label: "China" },
    { value: "JP", label: "Japan" }, { value: "SA", label: "Saudi Arabia" },
    { value: "AE", label: "UAE" }, { value: "BH", label: "Bahrain" },
    { value: "SG", label: "Singapore" }, { value: "KR", label: "South Korea" },
    { value: "TH", label: "Thailand" }, { value: "MY", label: "Malaysia" },
    { value: "ID", label: "Indonesia" }, { value: "VN", label: "Vietnam" },
    { value: "PH", label: "Philippines" }, { value: "TW", label: "Taiwan" },
    { value: "QA", label: "Qatar" }, { value: "KW", label: "Kuwait" },
    { value: "OM", label: "Oman" }, { value: "IR", label: "Iran" },
    { value: "IQ", label: "Iraq" }, { value: "TR", label: "Turkey" },
    { value: "IL", label: "Israel" }, { value: "BD", label: "Bangladesh" },
    { value: "PK", label: "Pakistan" }, { value: "LK", label: "Sri Lanka" },
  ],
  "Europe": [
    { value: "DE", label: "Germany" }, { value: "GB", label: "United Kingdom" },
    { value: "FR", label: "France" }, { value: "IT", label: "Italy" },
    { value: "ES", label: "Spain" }, { value: "NL", label: "Netherlands" },
    { value: "BE", label: "Belgium" }, { value: "CH", label: "Switzerland" },
    { value: "AT", label: "Austria" }, { value: "SE", label: "Sweden" },
    { value: "NO", label: "Norway" }, { value: "DK", label: "Denmark" },
    { value: "FI", label: "Finland" }, { value: "PL", label: "Poland" },
    { value: "RO", label: "Romania" }, { value: "GR", label: "Greece" },
    { value: "PT", label: "Portugal" }, { value: "IE", label: "Ireland" },
    { value: "RU", label: "Russia" }, { value: "UA", label: "Ukraine" },
  ],
  "Africa": [
    { value: "ZA", label: "South Africa" }, { value: "NG", label: "Nigeria" },
    { value: "EG", label: "Egypt" }, { value: "KE", label: "Kenya" },
    { value: "GH", label: "Ghana" }, { value: "TZ", label: "Tanzania" },
    { value: "DZ", label: "Algeria" }, { value: "MA", label: "Morocco" },
  ],
  "North America": [
    { value: "US", label: "United States" }, { value: "CA", label: "Canada" },
    { value: "MX", label: "Mexico" },
  ],
  "South America": [
    { value: "BR", label: "Brazil" }, { value: "AR", label: "Argentina" },
    { value: "CL", label: "Chile" }, { value: "CO", label: "Colombia" },
  ],
  "Oceania": [
    { value: "AU", label: "Australia" }, { value: "NZ", label: "New Zealand" },
  ]
};

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  formattedUrl: string;
}

interface ProcessedLead {
  id: number;
  company_name: string | null;
  company_type: string | null;
  company_classification: string | null;
  classification_confidence: number;
  country: string | null;
  country_name: string | null;
  capacity_lph: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  business_intent: string | null;
  llm_score: number;
  score_reasoning: string;
  score_breakdown: { industry_relevance: number; business_signals: number; contact_availability: number; company_size: number; urgency: number } | null;
  data_completeness_score: number;
  urgency_level: string;
  estimated_volume: string | null;
  contact_likelihood: string;
  website_content_summary: string | null;
  website_crawled: boolean;
  is_duplicate: boolean;
  duplicate_of_id: number | null;
  promoted_to_lead: boolean;
  title: string;
  link: string;
  snippet: string;
  search_query: string;
  created_at: string;
}

interface QuotaStatus {
  dailyLimit: number;
  monthlyLimit: number;
  remainingToday: number;
  canProceed: boolean;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  oil_collector: "bg-amber-100 text-amber-800",
  waste_manager: "bg-green-100 text-green-800",
  automotive_service: "bg-blue-100 text-blue-800",
  industrial_manufacturer: "bg-purple-100 text-purple-800",
  environmental_agency: "bg-emerald-100 text-emerald-800",
  refinery: "bg-orange-100 text-orange-800",
  equipment_supplier: "bg-cyan-100 text-cyan-800",
  energy_company: "bg-yellow-100 text-yellow-800",
  chemical_processor: "bg-pink-100 text-pink-800",
  government: "bg-indigo-100 text-indigo-800",
  other: "bg-gray-100 text-gray-800",
};

function getClassificationLabel(type: string | null): string {
  if (!type) return "Unknown";
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function LeadGenerationPage() {
  const [activeTab, setActiveTab] = useState('search');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [selectedLead, setSelectedLead] = useState<ProcessedLead | null>(null);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [promotionNotes, setPromotionNotes] = useState('');
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: { query: "", industry: "", country: "", siteSearch: "" },
  });

  const { data: quotaStatus } = useQuery<QuotaStatus>({
    queryKey: ['/api/lead-generation/quota-status'],
  });

  const searchMutation = useMutation({
    mutationFn: async (data: SearchFormData) => {
      return apiRequest('POST', '/api/lead-generation/search', {
        query: data.query,
        filters: { industry: data.industry, country: data.country, siteSearch: data.siteSearch }
      });
    },
    onSuccess: (data: any) => {
      setActiveSearchId(data.searchId);
      toast({
        title: "Search Completed",
        description: `Found ${data.results?.length || 0} results. AI processing started in background...`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation'] });
    },
    onError: (error: any) => {
      toast({ title: "Search Failed", description: error.message || "Failed to perform search", variant: "destructive" });
    },
  });

  const { data: processingStatus } = useQuery({
    queryKey: [`/api/lead-generation/processing-status/${activeSearchId}`],
    enabled: !!activeSearchId,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.isComplete ? false : 5000;
    },
  });

  useEffect(() => {
    if ((processingStatus as any)?.isComplete && activeSearchId) {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/processed-leads?minScore=0'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/search-history'] });
      toast({ title: "AI Processing Complete", description: `${(processingStatus as any).processed} leads analyzed, ${(processingStatus as any).highScoreLeads} high-quality leads found.` });
    }
  }, [(processingStatus as any)?.isComplete]);

  const { data: processedLeadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['/api/lead-generation/processed-leads?minScore=0'],
  });

  const { data: searchHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/lead-generation/search-history'],
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ leadId, notes }: { leadId: number; notes: string }) => {
      return apiRequest('POST', `/api/lead-generation/promote-lead/${leadId}`, { additionalNotes: notes });
    },
    onSuccess: () => {
      toast({ title: "Lead Promoted", description: "Lead added to your leads database for follow-up" });
      setIsPromoteDialogOpen(false);
      setPromotionNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/processed-leads?minScore=0'] });
    },
    onError: (error: any) => {
      toast({ title: "Promotion Failed", description: error.message || "Failed to promote lead", variant: "destructive" });
    },
  });

  const onSearch = (data: SearchFormData) => {
    if (!quotaStatus?.canProceed) {
      toast({ title: "Quota Exceeded", description: "Daily search quota exceeded. Try again tomorrow.", variant: "destructive" });
      return;
    }
    searchMutation.mutate(data);
  };

  const handleExport = async (minScore: number = 0) => {
    try {
      const response = await fetch(`/api/lead-generation/export?minScore=${minScore}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: "CSV file downloaded successfully" });
    } catch (error) {
      toast({ title: "Export Failed", description: "Failed to export leads", variant: "destructive" });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-600";
    if (score >= 0.4) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
    if (score >= 0.7) return "default";
    if (score >= 0.4) return "secondary";
    return "destructive";
  };

  const getUrgencyColor = (urgency: string) => {
    if (urgency === 'high') return "bg-red-100 text-red-800";
    if (urgency === 'medium') return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  const processedLeads = (processedLeadsData as any)?.leads || [];
  const searchHistory = (searchHistoryData as any)?.searches || [];

  return (
    <Layout>
    <TooltipProvider>
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Lead Generation</h1>
            <p className="text-gray-600">
              AI-powered lead discovery with website crawling, company classification, and intelligent scoring
            </p>
          </div>
          {processedLeads.length > 0 && (
            <Button variant="outline" onClick={() => handleExport(0)} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Export All CSV
            </Button>
          )}
        </div>

        {quotaStatus && (
          <Alert className="mb-6">
            <Target className="h-4 w-4" />
            <AlertTitle>Daily Quota Status</AlertTitle>
            <AlertDescription className="flex items-center gap-4">
              <span>{quotaStatus.remainingToday} of {quotaStatus.dailyLimit} searches remaining today</span>
              <Progress value={(quotaStatus.remainingToday / quotaStatus.dailyLimit) * 100} className="w-32" />
              {!quotaStatus.canProceed && <Badge variant="destructive">Quota Exceeded</Badge>}
            </AlertDescription>
          </Alert>
        )}

        {activeSearchId && processingStatus !== undefined && !(processingStatus as any)?.isComplete && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>AI Processing in Progress</AlertTitle>
            <AlertDescription className="flex items-center gap-4">
              <span>Crawling websites and analyzing leads with AI...</span>
              <Progress value={(processingStatus as any)?.progress || 0} className="w-32" />
              <span className="text-sm text-blue-600">
                {(processingStatus as any)?.processed || 0} / {(processingStatus as any)?.rawCount || 0} processed
              </span>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="ai-insights" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Qualified Leads
              {processedLeads.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{processedLeads.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Search History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-insights" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    Smart Search Suggestions
                  </CardTitle>
                  <CardDescription>
                    AI-powered search terms optimized for oil re-refining business
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {SMART_SEARCH_SUGGESTIONS.map((category, index) => {
                    const Icon = category.icon;
                    return (
                      <div key={index} className="border rounded-lg p-4">
                        <h4 className="font-medium text-sm mb-3 text-gray-700 flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {category.category}
                        </h4>
                        <div className="space-y-2">
                          {category.searches.map((search, si) => (
                            <Button
                              key={si}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-left h-auto py-2 px-3"
                              onClick={() => {
                                form.setValue('query', search);
                                form.setValue('industry', 'oil-refining');
                                setActiveTab('search');
                              }}
                            >
                              <Search className="h-3 w-3 mr-2 flex-shrink-0" />
                              <span className="text-xs leading-tight">{search}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-500" />
                    AI Intelligence Features
                  </CardTitle>
                  <CardDescription>Advanced capabilities powered by GPT-4o</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Globe className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Website Crawling</h4>
                        <p className="text-xs text-gray-600 mt-1">
                          Automatically crawls company websites (homepage, about, contact, services) to extract emails, phones, and business intelligence
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Target className="h-5 w-5 text-red-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">AI Company Classification</h4>
                        <p className="text-xs text-gray-600 mt-1">
                          Classifies companies into specific categories: Oil Collector, Waste Manager, Automotive, Refinery, Industrial, Environmental, etc.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Award className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Enhanced Scoring (5 Factors)</h4>
                        <p className="text-xs text-gray-600 mt-1">
                          Multi-factor scoring: Industry Relevance (30%), Business Signals (25%), Contact Availability (20%), Company Size (15%), Urgency (10%)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Copy className="h-5 w-5 text-orange-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Duplicate Detection</h4>
                        <p className="text-xs text-gray-600 mt-1">
                          Identifies duplicate companies using domain fingerprinting and fuzzy name matching to keep your lead list clean
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">CSV Export</h4>
                        <p className="text-xs text-gray-600 mt-1">
                          Export all qualified leads to CSV with company details, scores, contact info, and classification for your sales team
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      How It Works
                    </h4>
                    <ol className="text-xs text-gray-700 space-y-1 list-decimal list-inside">
                      <li>Search Google for potential customers</li>
                      <li>System crawls each company's website for deeper data</li>
                      <li>GPT-4o classifies and scores each lead</li>
                      <li>Duplicates are detected and flagged</li>
                      <li>Qualified leads appear in the Leads tab</li>
                      <li>Promote top leads to your CRM</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  New Search
                </CardTitle>
                <CardDescription>
                  Search for potential leads - results are automatically crawled, classified, and scored by AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSearch)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="query"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Search Query</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., waste oil collection company India" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="industry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Industry Filter</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select industry" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {INDUSTRY_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country Filter</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select country" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[300px]">
                                {Object.entries(COUNTRY_OPTIONS_BY_CONTINENT).map(([continent, countries]) => (
                                  <div key={continent}>
                                    {continent !== "All Countries" && (
                                      <div className="px-2 py-1.5 text-sm font-semibold text-gray-500 bg-gray-50 sticky top-0">{continent}</div>
                                    )}
                                    {countries.map((country) => (
                                      <SelectItem key={country.value} value={country.value} className={continent !== "All Countries" ? "pl-6" : ""}>
                                        {country.label}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="siteSearch"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Site Search (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., linkedin.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        {quotaStatus && <span>{quotaStatus.remainingToday} searches remaining today</span>}
                      </div>
                      <Button type="submit" disabled={searchMutation.isPending || !quotaStatus?.canProceed} className="min-w-32">
                        {searchMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching...</>
                        ) : (
                          <><Search className="h-4 w-4 mr-2" />Search</>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {searchMutation.data && (
              <Card>
                <CardHeader>
                  <CardTitle>Search Results</CardTitle>
                  <CardDescription>
                    Found {(searchMutation.data as any).results?.length || 0} results.
                    {(searchMutation.data as any).duplicatesSkipped > 0 && ` ${(searchMutation.data as any).duplicatesSkipped} duplicates skipped.`}
                    {' '}AI is crawling websites and classifying leads in the background...
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(searchMutation.data as any).results?.map((result: SearchResult, index: number) => (
                      <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-blue-600 hover:underline">
                            <a href={result.link} target="_blank" rel="noopener noreferrer">{result.title}</a>
                          </h3>
                          <Badge variant="outline" className="text-xs">Rank #{index + 1}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{result.snippet}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />{result.displayLink}
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedResult(result)}>
                            <Eye className="h-3 w-3 mr-1" />Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      AI-Qualified Leads ({processedLeads.length})
                    </CardTitle>
                    <CardDescription>
                      Leads processed by AI with website crawling, classification, and scoring
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/processed-leads?minScore=0'] })}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />Refresh
                    </Button>
                    {processedLeads.length > 0 && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleExport(0.7)}>
                          <Download className="h-4 w-4 mr-1" />Export Top Leads
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport(0)}>
                          <FileSpreadsheet className="h-4 w-4 mr-1" />Export All
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {leadsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading leads...
                  </div>
                ) : processedLeads.length > 0 ? (
                  <div className="space-y-4">
                    {processedLeads.map((lead: ProcessedLead) => (
                      <div key={lead.id} className={`border rounded-lg p-4 ${lead.is_duplicate ? 'border-yellow-300 bg-yellow-50/30' : ''}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">{lead.company_name || "Unknown Company"}</h3>
                              {lead.company_type && (
                                <Badge className={`text-xs ${CLASSIFICATION_COLORS[lead.company_type] || CLASSIFICATION_COLORS.other}`}>
                                  {getClassificationLabel(lead.company_type)}
                                </Badge>
                              )}
                              {lead.website_crawled && (
                                <Badge variant="outline" className="text-xs border-green-300 text-green-600">
                                  <Globe className="h-3 w-3 mr-1" />Crawled
                                </Badge>
                              )}
                              {lead.is_duplicate && (
                                <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">
                                  <Copy className="h-3 w-3 mr-1" />Duplicate
                                </Badge>
                              )}
                              {lead.urgency_level && lead.urgency_level !== 'low' && (
                                <Badge className={`text-xs ${getUrgencyColor(lead.urgency_level)}`}>
                                  {lead.urgency_level === 'high' ? 'Urgent' : 'Medium'}
                                </Badge>
                              )}
                            </div>
                            {lead.company_classification && (
                              <p className="text-sm text-gray-500 mt-1">{lead.company_classification}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant={getScoreBadgeVariant(lead.llm_score)} className="cursor-help">
                                  Score: {(lead.llm_score * 100).toFixed(0)}%
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <div className="text-xs space-y-1">
                                  <p className="font-semibold mb-1">Score Breakdown</p>
                                  {lead.score_breakdown && (
                                    <>
                                      <div className="flex justify-between"><span>Industry Relevance:</span><span>{((lead.score_breakdown.industry_relevance || 0) * 100).toFixed(0)}%</span></div>
                                      <div className="flex justify-between"><span>Business Signals:</span><span>{((lead.score_breakdown.business_signals || 0) * 100).toFixed(0)}%</span></div>
                                      <div className="flex justify-between"><span>Contact Availability:</span><span>{((lead.score_breakdown.contact_availability || 0) * 100).toFixed(0)}%</span></div>
                                      <div className="flex justify-between"><span>Company Size:</span><span>{((lead.score_breakdown.company_size || 0) * 100).toFixed(0)}%</span></div>
                                      <div className="flex justify-between"><span>Urgency:</span><span>{((lead.score_breakdown.urgency || 0) * 100).toFixed(0)}%</span></div>
                                    </>
                                  )}
                                  {lead.score_reasoning && <p className="mt-2 text-gray-400 italic">{lead.score_reasoning}</p>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            {lead.promoted_to_lead && (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />Promoted
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                          {(lead.country_name || lead.country) && (
                            <div className="flex items-center gap-2 text-sm">
                              <Globe className="h-4 w-4 text-gray-400" />
                              <span>{lead.country_name || lead.country}</span>
                            </div>
                          )}
                          {lead.contact_email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-4 w-4 text-gray-400" />
                              <span className="truncate">{lead.contact_email}</span>
                            </div>
                          )}
                          {lead.contact_phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <span>{lead.contact_phone}</span>
                            </div>
                          )}
                          {lead.capacity_lph && (
                            <div className="flex items-center gap-2 text-sm">
                              <Factory className="h-4 w-4 text-gray-400" />
                              <span>{lead.capacity_lph}</span>
                            </div>
                          )}
                        </div>

                        {lead.website_content_summary && (
                          <div className="bg-gray-50 rounded p-3 mb-3">
                            <p className="text-sm text-gray-700">{lead.website_content_summary}</p>
                          </div>
                        )}

                        {lead.business_intent && !lead.website_content_summary && (
                          <p className="text-sm text-gray-700 mb-3">{lead.business_intent}</p>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500 flex items-center gap-3">
                            <span>Completeness: {(lead.data_completeness_score * 100).toFixed(0)}%</span>
                            <span>Found: {new Date(lead.created_at).toLocaleDateString()}</span>
                            {lead.search_query && <span>Query: "{lead.search_query}"</span>}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => window.open(lead.link, '_blank')}>
                              <ExternalLink className="h-3 w-3 mr-1" />Visit
                            </Button>
                            {!lead.promoted_to_lead && (
                              <Button
                                size="sm"
                                onClick={() => { setSelectedLead(lead); setIsPromoteDialogOpen(true); }}
                                disabled={promoteMutation.isPending}
                              >
                                <Plus className="h-3 w-3 mr-1" />Promote
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Star className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No qualified leads found yet.</p>
                    <p className="text-sm">Perform searches to discover and qualify new leads. Results appear here after AI processing completes.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Search History
                </CardTitle>
                <CardDescription>View your previous searches and their results</CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading...
                  </div>
                ) : searchHistory.length > 0 ? (
                  <div className="space-y-4">
                    {searchHistory.map((search: any) => (
                      <div key={search.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold">{search.search_query}</h3>
                          <span className="text-xs text-gray-500">
                            {new Date(search.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm text-gray-600">
                          <div><span className="font-medium">Total:</span> {search.total_results}</div>
                          <div><span className="font-medium">Processed:</span> {search.processed_results}</div>
                          <div><span className="font-medium">High Score:</span> {search.high_score_leads}</div>
                          {search.industry && <div><span className="font-medium">Industry:</span> {search.industry}</div>}
                          {search.country && <div><span className="font-medium">Country:</span> {search.country}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No search history yet.</p>
                    <p className="text-sm">Your previous searches will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Search Result Details</DialogTitle>
              <DialogDescription>Detailed view of the search result</DialogDescription>
            </DialogHeader>
            {selectedResult && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-lg text-blue-900 mb-2">{selectedResult.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-blue-700 mb-3">
                    <Globe className="h-4 w-4" />
                    <a href={selectedResult.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {selectedResult.displayLink}
                    </a>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{selectedResult.snippet}</p>
                </div>
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2 text-gray-900">Technical Details</h4>
                  <div className="bg-gray-50 p-3 rounded text-sm font-mono text-gray-600">
                    <div><strong>URL:</strong> {selectedResult.formattedUrl}</div>
                    <div><strong>Link:</strong> {selectedResult.link}</div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelectedResult(null)}>Close</Button>
                  <Button onClick={() => window.open(selectedResult.link, '_blank')}>
                    <ExternalLink className="h-4 w-4 mr-2" />Visit Website
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Promote Lead to Database</DialogTitle>
              <DialogDescription>Add this qualified lead to your leads database for follow-up.</DialogDescription>
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{selectedLead.company_name || "Unknown Company"}</h4>
                    {selectedLead.company_type && (
                      <Badge className={`text-xs ${CLASSIFICATION_COLORS[selectedLead.company_type] || CLASSIFICATION_COLORS.other}`}>
                        {getClassificationLabel(selectedLead.company_type)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{selectedLead.website_content_summary || selectedLead.business_intent}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                    <span>Score: {(selectedLead.llm_score * 100).toFixed(0)}%</span>
                    {(selectedLead.country_name || selectedLead.country) && <span>Country: {selectedLead.country_name || selectedLead.country}</span>}
                    {selectedLead.contact_email && <span>Email: {selectedLead.contact_email}</span>}
                    {selectedLead.contact_phone && <span>Phone: {selectedLead.contact_phone}</span>}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Additional Notes (Optional)</label>
                  <Textarea
                    value={promotionNotes}
                    onChange={(e) => setPromotionNotes(e.target.value)}
                    placeholder="Add any additional notes about this lead..."
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsPromoteDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => selectedLead && promoteMutation.mutate({ leadId: selectedLead.id, notes: promotionNotes })}
                    disabled={promoteMutation.isPending}
                  >
                    {promoteMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Promoting...</>
                    ) : (
                      <><Plus className="h-4 w-4 mr-2" />Promote Lead</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
    </Layout>
  );
}

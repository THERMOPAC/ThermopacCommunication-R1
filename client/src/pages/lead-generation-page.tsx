import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Search, 
  Filter, 
  Download, 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Star,
  Globe,
  Mail,
  Calendar,
  Factory,
  TrendingUp,
  Eye,
  Plus,
  History,
  Target,
  Brain,
  Lightbulb,
  Zap,
  Award,
  Flame
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Search form schema
const searchFormSchema = z.object({
  query: z.string().min(3, "Search query must be at least 3 characters"),
  industry: z.string().optional(),
  country: z.string().optional(),
  siteSearch: z.string().optional(),
});

type SearchFormData = z.infer<typeof searchFormSchema>;

// Industry options for filtering
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

// Smart search suggestions for oil re-refining business
const SMART_SEARCH_SUGGESTIONS = [
  {
    category: "🏭 Oil Collection Companies",
    searches: [
      "waste oil collection services automotive",
      "used engine oil disposal companies",
      "industrial lubricant collection fleet"
    ]
  },
  {
    category: "🚗 Automotive Service Centers", 
    searches: [
      "auto service centers waste oil disposal",
      "car dealership oil change waste management",
      "fleet maintenance used oil generation"
    ]
  },
  {
    category: "🏢 Industrial Manufacturers",
    searches: [
      "manufacturing plant used hydraulic oil",
      "industrial machinery lubricant waste",
      "heavy equipment oil maintenance contracts"
    ]
  },
  {
    category: "🌍 Environmental Agencies",
    searches: [
      "environmental waste oil regulations tender",
      "government oil recycling procurement",
      "sustainability waste management RFP"
    ]
  },
  {
    category: "⚡ Refineries & Energy",
    searches: [
      "petroleum refinery waste oil recycling",
      "energy company lubricant reprocessing",
      "oil terminal waste management systems"
    ]
  }
];

// Country options grouped by continent
const COUNTRY_OPTIONS_BY_CONTINENT = {
  "All Countries": [
    { value: "all", label: "All Countries" }
  ],
  "Asia": [
    { value: "IN", label: "India" },
    { value: "CN", label: "China" },
    { value: "JP", label: "Japan" },
    { value: "SA", label: "Saudi Arabia" },
    { value: "AE", label: "UAE" },
    { value: "BH", label: "Bahrain" },
    { value: "SG", label: "Singapore" },
    { value: "KR", label: "South Korea" },
    { value: "TH", label: "Thailand" },
    { value: "MY", label: "Malaysia" },
    { value: "ID", label: "Indonesia" },
    { value: "VN", label: "Vietnam" },
    { value: "PH", label: "Philippines" },
    { value: "TW", label: "Taiwan" },
    { value: "HK", label: "Hong Kong" },
    { value: "QA", label: "Qatar" },
    { value: "KW", label: "Kuwait" },
    { value: "OM", label: "Oman" },
    { value: "IR", label: "Iran" },
    { value: "IQ", label: "Iraq" },
    { value: "TR", label: "Turkey" },
    { value: "IL", label: "Israel" },
    { value: "LB", label: "Lebanon" },
    { value: "JO", label: "Jordan" },
    { value: "BD", label: "Bangladesh" },
    { value: "PK", label: "Pakistan" },
    { value: "LK", label: "Sri Lanka" },
    { value: "MM", label: "Myanmar" },
    { value: "KH", label: "Cambodia" },
    { value: "LA", label: "Laos" }
  ],
  "Europe": [
    { value: "DE", label: "Germany" },
    { value: "GB", label: "United Kingdom" },
    { value: "FR", label: "France" },
    { value: "IT", label: "Italy" },
    { value: "ES", label: "Spain" },
    { value: "NL", label: "Netherlands" },
    { value: "BE", label: "Belgium" },
    { value: "CH", label: "Switzerland" },
    { value: "AT", label: "Austria" },
    { value: "SE", label: "Sweden" },
    { value: "NO", label: "Norway" },
    { value: "DK", label: "Denmark" },
    { value: "FI", label: "Finland" },
    { value: "PL", label: "Poland" },
    { value: "CZ", label: "Czech Republic" },
    { value: "HU", label: "Hungary" },
    { value: "SK", label: "Slovakia" },
    { value: "SI", label: "Slovenia" },
    { value: "HR", label: "Croatia" },
    { value: "RO", label: "Romania" },
    { value: "BG", label: "Bulgaria" },
    { value: "GR", label: "Greece" },
    { value: "PT", label: "Portugal" },
    { value: "IE", label: "Ireland" },
    { value: "LU", label: "Luxembourg" },
    { value: "MT", label: "Malta" },
    { value: "CY", label: "Cyprus" },
    { value: "EE", label: "Estonia" },
    { value: "LV", label: "Latvia" },
    { value: "LT", label: "Lithuania" },
    { value: "RU", label: "Russia" },
    { value: "UA", label: "Ukraine" },
    { value: "BY", label: "Belarus" }
  ],
  "Africa": [
    { value: "ZA", label: "South Africa" },
    { value: "NG", label: "Nigeria" },
    { value: "EG", label: "Egypt" },
    { value: "KE", label: "Kenya" },
    { value: "ET", label: "Ethiopia" },
    { value: "GH", label: "Ghana" },
    { value: "TZ", label: "Tanzania" },
    { value: "UG", label: "Uganda" },
    { value: "DZ", label: "Algeria" },
    { value: "MA", label: "Morocco" },
    { value: "TN", label: "Tunisia" },
    { value: "LY", label: "Libya" },
    { value: "SD", label: "Sudan" },
    { value: "ZM", label: "Zambia" },
    { value: "ZW", label: "Zimbabwe" },
    { value: "BW", label: "Botswana" },
    { value: "NA", label: "Namibia" },
    { value: "MZ", label: "Mozambique" },
    { value: "AO", label: "Angola" },
    { value: "CM", label: "Cameroon" },
    { value: "CI", label: "Ivory Coast" },
    { value: "SN", label: "Senegal" },
    { value: "ML", label: "Mali" },
    { value: "BF", label: "Burkina Faso" }
  ],
  "North America": [
    { value: "US", label: "United States" },
    { value: "CA", label: "Canada" },
    { value: "MX", label: "Mexico" },
    { value: "GT", label: "Guatemala" },
    { value: "BZ", label: "Belize" },
    { value: "SV", label: "El Salvador" },
    { value: "HN", label: "Honduras" },
    { value: "NI", label: "Nicaragua" },
    { value: "CR", label: "Costa Rica" },
    { value: "PA", label: "Panama" },
    { value: "CU", label: "Cuba" },
    { value: "JM", label: "Jamaica" },
    { value: "HT", label: "Haiti" },
    { value: "DO", label: "Dominican Republic" },
    { value: "PR", label: "Puerto Rico" },
    { value: "TT", label: "Trinidad and Tobago" }
  ],
  "South America": [
    { value: "BR", label: "Brazil" },
    { value: "AR", label: "Argentina" },
    { value: "CL", label: "Chile" },
    { value: "PE", label: "Peru" },
    { value: "CO", label: "Colombia" },
    { value: "VE", label: "Venezuela" },
    { value: "EC", label: "Ecuador" },
    { value: "BO", label: "Bolivia" },
    { value: "PY", label: "Paraguay" },
    { value: "UY", label: "Uruguay" },
    { value: "GY", label: "Guyana" },
    { value: "SR", label: "Suriname" },
    { value: "GF", label: "French Guiana" }
  ],
  "Oceania": [
    { value: "AU", label: "Australia" },
    { value: "NZ", label: "New Zealand" },
    { value: "FJ", label: "Fiji" },
    { value: "PG", label: "Papua New Guinea" },
    { value: "NC", label: "New Caledonia" },
    { value: "SB", label: "Solomon Islands" },
    { value: "VU", label: "Vanuatu" },
    { value: "WS", label: "Samoa" },
    { value: "TO", label: "Tonga" },
    { value: "PW", label: "Palau" },
    { value: "FM", label: "Micronesia" },
    { value: "MH", label: "Marshall Islands" },
    { value: "KI", label: "Kiribati" },
    { value: "TV", label: "Tuvalu" },
    { value: "NR", label: "Nauru" }
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
  country: string | null;
  capacity_lph: number | null;
  contact_email: string | null;
  deadline_date: string | null;
  business_intent: string | null;
  llm_score: number;
  score_reasoning: string;
  data_completeness_score: number;
  promoted_to_lead: boolean;
  title: string;
  link: string;
  snippet: string;
  search_query: string;
  search_date: string;
}

interface QuotaStatus {
  dailyLimit: number;
  monthlyLimit: number;
  remainingToday: number;
  canProceed: boolean;
}

export default function LeadGenerationPage() {
  const [activeTab, setActiveTab] = useState('search');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [selectedLead, setSelectedLead] = useState<ProcessedLead | null>(null);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [promotionNotes, setPromotionNotes] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form setup
  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      query: "",
      industry: "",
      country: "",
      siteSearch: "",
    },
  });

  // Get API quota status
  const { data: quotaStatus, isLoading: quotaLoading } = useQuery<QuotaStatus>({
    queryKey: ['/api/lead-generation/quota-status'],
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (data: SearchFormData) => {
      return apiRequest('POST', '/api/lead-generation/search', {
        query: data.query,
        filters: {
          industry: data.industry,
          country: data.country,
          siteSearch: data.siteSearch,
        }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Search Completed",
        description: `Found ${data.results?.length || 0} results. ${data.newResults} new, ${data.duplicatesSkipped} duplicates skipped.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation'] });
    },
    onError: (error: any) => {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to perform search",
        variant: "destructive",
      });
    },
  });

  // Get processed leads with high scores
  const { data: processedLeads, isLoading: leadsLoading } = useQuery({
    queryKey: ['/api/lead-generation/processed-leads', { minScore: 0.7 }],
  });

  // Get search history
  const { data: searchHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/lead-generation/search-history'],
  });

  // Promote lead mutation
  const promoteMutation = useMutation({
    mutationFn: async ({ leadId, notes }: { leadId: number; notes: string }) => {
      return apiRequest('POST', `/api/lead-generation/promote-lead/${leadId}`, {
        additionalNotes: notes
      });
    },
    onSuccess: () => {
      toast({
        title: "Lead Promoted",
        description: "Lead successfully added to leads database",
      });
      setIsPromoteDialogOpen(false);
      setPromotionNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/processed-leads'] });
    },
    onError: (error: any) => {
      toast({
        title: "Promotion Failed",
        description: error.message || "Failed to promote lead",
        variant: "destructive",
      });
    },
  });

  // Handle search form submission
  const onSearch = (data: SearchFormData) => {
    if (!quotaStatus?.canProceed) {
      toast({
        title: "Quota Exceeded",
        description: "Daily search quota exceeded. Please try again tomorrow.",
        variant: "destructive",
      });
      return;
    }
    searchMutation.mutate(data);
  };

  // Handle lead promotion
  const handlePromoteLead = (lead: ProcessedLead) => {
    setSelectedLead(lead);
    setIsPromoteDialogOpen(true);
  };

  const confirmPromotion = () => {
    if (selectedLead) {
      promoteMutation.mutate({
        leadId: selectedLead.id,
        notes: promotionNotes
      });
    }
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  // Get score badge variant
  const getScoreBadge = (score: number) => {
    if (score >= 0.8) return "default";
    if (score >= 0.6) return "secondary";
    return "destructive";
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Lead Generation</h1>
        <p className="text-gray-600">
          Discover potential leads using Google Custom Search with AI-powered scoring and qualification
        </p>
      </div>

      {/* Quota Status Alert */}
      {quotaStatus && (
        <Alert className="mb-6">
          <Target className="h-4 w-4" />
          <AlertTitle>Daily Quota Status</AlertTitle>
          <AlertDescription className="flex items-center gap-4">
            <span>
              {quotaStatus.remainingToday} of {quotaStatus.dailyLimit} searches remaining today
            </span>
            <Progress 
              value={(quotaStatus.remainingToday / quotaStatus.dailyLimit) * 100} 
              className="w-32" 
            />
            {!quotaStatus.canProceed && (
              <Badge variant="destructive">Quota Exceeded</Badge>
            )}
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
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Search History
          </TabsTrigger>
        </TabsList>

        {/* AI Insights Tab */}
        <TabsContent value="ai-insights" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Smart Search Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Smart Search Suggestions
                </CardTitle>
                <CardDescription>
                  AI-powered search terms optimized for your oil re-refining business
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {SMART_SEARCH_SUGGESTIONS.map((category, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-3 text-gray-700">
                      {category.category}
                    </h4>
                    <div className="space-y-2">
                      {category.searches.map((search, searchIndex) => (
                        <Button
                          key={searchIndex}
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
                ))}
              </CardContent>
            </Card>

            {/* AI Intelligence Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  AI Intelligence Features
                </CardTitle>
                <CardDescription>
                  Advanced capabilities powered by GPT-4o
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm">Smart Query Enhancement</h4>
                      <p className="text-xs text-gray-600 mt-1">
                        Automatically adds relevant terms and business intent indicators to improve search results
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Award className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm">Intelligent Lead Scoring</h4>
                      <p className="text-xs text-gray-600 mt-1">
                        Multi-factor scoring considering industry relevance, business indicators, and buying intent
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Target className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm">Customer Type Detection</h4>
                      <p className="text-xs text-gray-600 mt-1">
                        Identifies oil collectors, automotive centers, industrial manufacturers, and environmental agencies
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Flame className="h-5 w-5 text-orange-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm">Hot Lead Alerts</h4>
                      <p className="text-xs text-gray-600 mt-1">
                        Real-time notifications for high-scoring leads (0.8+ score) with immediate follow-up recommendations
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="my-4" />
                
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    Industry-Specific Analysis
                  </h4>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    Our AI specializes in the used engine oil re-refining industry, understanding key customer types:
                  </p>
                  <ul className="text-xs text-gray-600 mt-2 space-y-1">
                    <li>• Oil collection companies needing processing equipment</li>
                    <li>• Automotive service centers with waste oil disposal needs</li>
                    <li>• Industrial manufacturers generating used oil</li>
                    <li>• Government environmental agencies and regulators</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                New Search
              </CardTitle>
              <CardDescription>
                Search for potential leads using Google Custom Search with freshness filters
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
                            <Input 
                              placeholder="e.g., oil refinery equipment manufacturing India"
                              {...field}
                            />
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
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
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
                                    <div className="px-2 py-1.5 text-sm font-semibold text-gray-500 bg-gray-50 sticky top-0">
                                      {continent}
                                    </div>
                                  )}
                                  {countries.map((country) => (
                                    <SelectItem 
                                      key={country.value} 
                                      value={country.value}
                                      className={continent !== "All Countries" ? "pl-6" : ""}
                                    >
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
                            <Input 
                              placeholder="e.g., site:linkedin.com OR site:company-website.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                      {quotaStatus && (
                        <span>
                          {quotaStatus.remainingToday} searches remaining today
                        </span>
                      )}
                    </div>
                    <Button 
                      type="submit" 
                      disabled={searchMutation.isPending || !quotaStatus?.canProceed}
                      className="min-w-32"
                    >
                      {searchMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Search
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchMutation.data && (
            <Card>
              <CardHeader>
                <CardTitle>Search Results</CardTitle>
                <CardDescription>
                  Found {searchMutation.data.results?.length || 0} results. 
                  Processing with AI for lead qualification...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {searchMutation.data.results?.map((result: SearchResult, index: number) => (
                    <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-blue-600 hover:underline">
                          <a href={result.link} target="_blank" rel="noopener noreferrer">
                            {result.title}
                          </a>
                        </h3>
                        <Badge variant="outline" className="text-xs">
                          Rank #{index + 1}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{result.snippet}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {result.displayLink}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedResult(result)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Qualified Leads Tab */}
        <TabsContent value="leads" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                AI-Qualified Leads (Score ≥ 0.7)
              </CardTitle>
              <CardDescription>
                Leads processed by AI with high qualification scores, ready for promotion
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading qualified leads...
                </div>
              ) : processedLeads?.leads?.length > 0 ? (
                <div className="space-y-4">
                  {processedLeads.leads.map((lead: ProcessedLead) => (
                    <div key={lead.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {lead.company_name || "Unknown Company"}
                          </h3>
                          <p className="text-sm text-gray-600">{lead.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getScoreBadge(lead.llm_score)}>
                            Score: {(lead.llm_score * 100).toFixed(0)}%
                          </Badge>
                          {lead.promoted_to_lead && (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Promoted
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                        {lead.country && (
                          <div className="flex items-center gap-2 text-sm">
                            <Globe className="h-4 w-4 text-gray-400" />
                            <span>{lead.country}</span>
                          </div>
                        )}
                        {lead.capacity_lph && (
                          <div className="flex items-center gap-2 text-sm">
                            <Factory className="h-4 w-4 text-gray-400" />
                            <span>{lead.capacity_lph.toLocaleString()} L/h</span>
                          </div>
                        )}
                        {lead.contact_email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="truncate">{lead.contact_email}</span>
                          </div>
                        )}
                      </div>

                      {lead.business_intent && (
                        <p className="text-sm text-gray-700 mb-3">{lead.business_intent}</p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                          <span>Completeness: {(lead.data_completeness_score * 100).toFixed(0)}%</span>
                          <span className="mx-2">•</span>
                          <span>Found: {new Date(lead.search_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => window.open(lead.link, '_blank')}
                          >
                            <Globe className="h-3 w-3 mr-1" />
                            Visit Site
                          </Button>
                          {!lead.promoted_to_lead && (
                            <Button 
                              size="sm"
                              onClick={() => handlePromoteLead(lead)}
                              disabled={promoteMutation.isPending}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Promote to Lead
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
                  <p className="text-sm">Perform searches to discover and qualify new leads.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Search History
              </CardTitle>
              <CardDescription>
                View your previous searches and their results
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading search history...
                </div>
              ) : searchHistory?.searches?.length > 0 ? (
                <div className="space-y-4">
                  {searchHistory.searches.map((search: any, index: number) => (
                    <div key={search.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{search.search_query}</h3>
                        <span className="text-xs text-gray-500">
                          {new Date(search.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Total Results:</span> {search.total_results}
                        </div>
                        <div>
                          <span className="font-medium">Processed:</span> {search.processed_results}
                        </div>
                        <div>
                          <span className="font-medium">High Score:</span> {search.high_score_leads}
                        </div>
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

      {/* View Search Result Details Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Search Result Details</DialogTitle>
            <DialogDescription>
              Detailed view of the search result
            </DialogDescription>
          </DialogHeader>
          
          {selectedResult && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg text-blue-900 mb-2">
                  {selectedResult.title}
                </h3>
                <div className="flex items-center gap-2 text-sm text-blue-700 mb-3">
                  <Globe className="h-4 w-4" />
                  <a 
                    href={selectedResult.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {selectedResult.displayLink}
                  </a>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  {selectedResult.snippet}
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2 text-gray-900">Technical Details</h4>
                <div className="bg-gray-50 p-3 rounded text-sm font-mono text-gray-600">
                  <div><strong>URL:</strong> {selectedResult.formattedUrl}</div>
                  <div><strong>Link:</strong> {selectedResult.link}</div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4">
                <div className="text-sm text-gray-500">
                  <p>This result will be processed by AI for lead qualification</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedResult(null)}>
                    Close
                  </Button>
                  <Button onClick={() => window.open(selectedResult.link, '_blank')}>
                    <Globe className="h-4 w-4 mr-2" />
                    Visit Website
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Promote Lead Dialog */}
      <Dialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote Lead to Database</DialogTitle>
            <DialogDescription>
              Add this qualified lead to your leads database for follow-up.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold">{selectedLead.company_name || "Unknown Company"}</h4>
                <p className="text-sm text-gray-600 mt-1">{selectedLead.business_intent}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>Score: {(selectedLead.llm_score * 100).toFixed(0)}%</span>
                  {selectedLead.country && <span>Country: {selectedLead.country}</span>}
                  {selectedLead.capacity_lph && <span>Capacity: {selectedLead.capacity_lph.toLocaleString()} L/h</span>}
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
                <Button variant="outline" onClick={() => setIsPromoteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={confirmPromotion} disabled={promoteMutation.isPending}>
                  {promoteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Promoting...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Promote Lead
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
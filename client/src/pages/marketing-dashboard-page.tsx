import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  LineChart,
  Line,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label
} from "recharts";
import {
  TrendingUp,
  Users,
  LineChart as LineChartIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  Calendar,
  Target,
  DollarSign,
  RefreshCw
} from "lucide-react";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchExchangeRates, convertCurrency, formatCurrency, formatINRInCrores } from "@/lib/currencyConverter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";

// Sample data for the dashboard
// In a real implementation, this would come from the API
const LEAD_SOURCE_COLORS = [
  "#8884d8", // Google Ads
  "#82ca9d", // Website
  "#ffc658", // Referral
  "#ff8042", // Cold Call
  "#0088fe"  // Event
];

const LEAD_STATUS_COLORS = {
  "New": "#8884d8",
  "Contacted": "#82ca9d",
  "Qualified": "#ffc658",
  "Negotiation": "#ff8042",
  "Won": "#22c55e",
  "Lost": "#ef4444"
};

export default function MarketingDashboardPage() {
  // Helper function to get current financial year dates (April 1 - March 31)
  const getCurrentFinancialYearDates = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // If current month is January to March (0-2), financial year is previous year to current year
    // If current month is April to December (3-11), financial year is current year to next year
    const financialYearStart = currentMonth < 3 
      ? new Date(currentYear - 1, 3, 1) // April 1st of previous year
      : new Date(currentYear, 3, 1);    // April 1st of current year
    
    const financialYearEnd = currentMonth < 3
      ? new Date(currentYear, 2, 31)    // March 31st of current year
      : new Date(currentYear + 1, 2, 31); // March 31st of next year
    
    return { from: financialYearStart, to: financialYearEnd };
  };
  
  // Initialize date range with current financial year
  const [dateRange, setDateRange] = useState(getCurrentFinancialYearDates());
  
  // Date filter info to display
  const [dateFilterLabel, setDateFilterLabel] = useState("Current Financial Year");
  
  // For dropdown preset selection
  const [selectedPreset, setSelectedPreset] = useState("current");
  
  // State for currency conversion
  const [exchangeRates, setExchangeRates] = useState(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Define types for leads data
  type Lead = {
    id: number;
    companyName: string;
    contactPerson: string;
    contactEmail: string;
    contactPhone: string;
    industry: string;
    status: string;
    source: string;
    expectedRevenue: number;
    currency: string;
    probability: number;
    weightedValue: number;
    expectedCloseDate: string;
    assignedTo: number;
    assignedToName: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  
  type LeadWithDetails = {
    lead: Lead;
    source: { id: number; name: string; };
    status: { id: number; name: string; };
  };
  
  // Format date for API queries
  const formatDateForApi = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  // Get queryClient for manual refetching
  const queryClient = useQueryClient();
  
  // Fetch leads data with date range filter
  const { data: rawLeadsData, isLoading: isLoadingLeads } = useQuery({
    queryKey: ['/api/sales-marketing/leads', dateRange],
    queryFn: async () => {
      const from = formatDateForApi(dateRange.from);
      const to = formatDateForApi(dateRange.to);
      const response = await fetch(`/api/sales-marketing/leads?from=${from}&to=${to}`);
      if (!response.ok) {
        throw new Error('Failed to fetch leads');
      }
      return response.json();
    },
    refetchOnWindowFocus: false
  });
  
  // Process the nested lead data structure
  const leadsData = React.useMemo(() => {
    if (!rawLeadsData || !Array.isArray(rawLeadsData)) return [];
    return rawLeadsData.map((item) => ({
      ...item.lead,
      sourceName: item.source?.name,
      statusName: item.status?.name
    }));
  }, [rawLeadsData]);

  // Define Campaign type
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
  
  // Fetch campaign data with date range filter
  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['/api/sales-marketing/campaigns', dateRange],
    queryFn: async () => {
      const from = formatDateForApi(dateRange.from);
      const to = formatDateForApi(dateRange.to);
      const response = await fetch(`/api/sales-marketing/campaigns?from=${from}&to=${to}`);
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }
      return response.json();
    },
    refetchOnWindowFocus: false
  });
  
  // Fetch exchange rates on component mount
  useEffect(() => {
    const loadExchangeRates = async () => {
      setIsLoadingRates(true);
      try {
        const rates = await fetchExchangeRates();
        setExchangeRates(rates);
        setLastUpdated(new Date());
      } catch (error) {
        console.error("Failed to fetch exchange rates:", error);
      } finally {
        setIsLoadingRates(false);
      }
    };
    
    loadExchangeRates();
  }, []);

  // Convert leads to source distribution data
  const leadSourceData = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0) return [];
    
    const sourceCount = {};
    
    leadsData.forEach((lead) => {
      const sourceName = lead.sourceName || 'Unknown';
      if (!sourceCount[sourceName]) {
        sourceCount[sourceName] = 0;
      }
      sourceCount[sourceName]++;
    });
    
    return Object.entries(sourceCount).map(([name, value]) => ({
      name,
      value
    }));
  }, [leadsData]);

  // Convert leads to status distribution data
  const leadStatusData = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0) return [];
    
    const statusCount = {};
    
    leadsData.forEach((lead) => {
      const statusName = lead.statusName || 'Unknown';
      if (!statusCount[statusName]) {
        statusCount[statusName] = 0;
      }
      statusCount[statusName]++;
    });
    
    return Object.entries(statusCount).map(([name, value]) => ({
      name,
      value
    }));
  }, [leadsData]);

  // Count active campaigns
  const activeCampaignsCount = React.useMemo(() => {
    if (!campaignsData || campaignsData.length === 0) return 0;
    return campaignsData.filter((campaign) => campaign.status === "Active").length;
  }, [campaignsData]);

  // Create monthly lead trend data
  const leadMonthlyTrends = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0) return [];
    
    const monthlyData = {};
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 5);
    
    // Initialize the last 6 months with 0 counts
    for (let i = 0; i < 6; i++) {
      const date = new Date(sixMonthsAgo);
      date.setMonth(sixMonthsAgo.getMonth() + i);
      const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      monthlyData[monthYear] = 0;
    }
    
    // Count leads by month
    leadsData.forEach((lead) => {
      const createdDate = new Date(lead.createdAt);
      // Only count leads from the last 6 months
      if (createdDate >= sixMonthsAgo) {
        const monthYear = `${createdDate.toLocaleString('default', { month: 'short' })} ${createdDate.getFullYear()}`;
        if (monthlyData[monthYear] !== undefined) {
          monthlyData[monthYear]++;
        }
      }
    });
    
    // Convert to array for chart
    return Object.entries(monthlyData).map(([name, value]) => ({
      month: name,
      leads: value
    }));
  }, [leadsData]);
  
  // Create campaign performance data
  const campaignPerformanceData = React.useMemo(() => {
    if (!campaignsData || campaignsData.length === 0) return [];
    
    return campaignsData
      .filter((campaign) => campaign.expectedLeadCount && campaign.status !== "Planned")
      .map((campaign) => ({
        name: campaign.name,
        expected: campaign.expectedLeadCount || 0,
        actual: campaign.actualLeadCount || 0,
        completion: campaign.status === "Completed" ? 100 : 
                   calculateCampaignCompletion(campaign.startDate, campaign.endDate)
      }))
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 5);
  }, [campaignsData]);

  // Calculate lead conversion rate stats
  const conversionStats = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0) return { rate: 0, total: 0, won: 0 };
    
    const totalLeads = leadsData.length;
    const wonLeads = leadsData.filter((lead) => lead.statusName === "Won").length;
    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
    
    return {
      rate: conversionRate,
      total: totalLeads,
      won: wonLeads
    };
  }, [leadsData]);
  
  // Define types for orders data
  type OrderData = {
    count: number;
    totalValueINR: number;
    valuesByCurrency: {
      [currency: string]: number;
    };
  };
  
  // Fetch orders in hand data with date range filter
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const { data: ordersData, isLoading: isLoadingOrdersInitial, refetch: refetchOrders } = useQuery({
    queryKey: ['/api/sales-marketing/dashboard/orders-in-hand', dateRange],
    queryFn: async () => {
      const from = formatDateForApi(dateRange.from);
      const to = formatDateForApi(dateRange.to);
      const response = await fetch(`/api/sales-marketing/dashboard/orders-in-hand?from=${from}&to=${to}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders in hand');
      }
      return response.json();
    },
    refetchOnWindowFocus: false
  });
  const isLoadingOrders = isLoadingOrdersInitial || refreshingOrders;
  
  // Calculate expected revenue with currency conversion
  const expectedRevenueStats = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0 || !exchangeRates) {
      return {
        totalUSD: 0,
        totalEUR: 0,
        totalINR: 0,
        bySourceUSD: {},
        bySourceINR: {}
      };
    }
    
    let totalUSD = 0;
    let totalEUR = 0;
    let totalINR = 0;
    const bySourceUSD = {};
    const bySourceINR = {};
    
    // Process each lead
    leadsData.forEach((lead) => {
      if (!lead.expectedRevenue || !lead.currency || lead.probability === null) {
        return; // Skip leads without revenue data
      }
      
      // Calculate weighted revenue based on probability
      const probability = Number(lead.probability) / 100;
      const revenue = Number(lead.expectedRevenue);
      const weightedRevenue = revenue * probability;
      
      console.log('Processing lead revenue:', { 
        companyName: lead.companyName,
        revenue, 
        probability: lead.probability,
        weightedRevenue,
        currency: lead.currency
      });
      
      // Convert to USD if needed
      let revenueInUSD = weightedRevenue;
      if (lead.currency === 'EUR' && exchangeRates.USD) {
        revenueInUSD = weightedRevenue / exchangeRates.USD;
      }
      
      // Convert to INR
      let revenueInINR = weightedRevenue;
      if (lead.currency === 'USD' && exchangeRates.INR) {
        revenueInINR = weightedRevenue * exchangeRates.INR;
      } else if (lead.currency === 'EUR' && exchangeRates.INR && exchangeRates.USD) {
        // Convert EUR to USD first, then to INR
        revenueInINR = (weightedRevenue / exchangeRates.USD) * exchangeRates.INR;
      }
      
      // Aggregate by currency
      if (lead.currency === 'USD') {
        totalUSD += weightedRevenue;
      } else if (lead.currency === 'EUR') {
        totalEUR += weightedRevenue;
      }
      
      // Convert all to INR for total
      totalINR += revenueInINR;
      
      // Aggregate by source
      const sourceName = lead.sourceName;
      if (!bySourceUSD[sourceName]) {
        bySourceUSD[sourceName] = 0;
        bySourceINR[sourceName] = 0;
      }
      bySourceUSD[sourceName] += revenueInUSD;
      bySourceINR[sourceName] += revenueInINR;
    });
    
    return {
      totalUSD,
      totalEUR,
      totalINR,
      bySourceUSD,
      bySourceINR
    };
  }, [leadsData, exchangeRates]);

  // Fetch finance data for total turnover calculation
  const { data: financeData, isLoading: isLoadingFinance } = useQuery({
    queryKey: ['/api/finance/dashboard', dateRange],
    queryFn: async () => {
      const from = formatDateForApi(dateRange.from);
      const to = formatDateForApi(dateRange.to);
      const response = await fetch(`/api/finance/dashboard?from=${from}&to=${to}`);
      if (!response.ok) {
        throw new Error('Failed to fetch finance data');
      }
      return response.json();
    },
    refetchOnWindowFocus: false
  });
  
  // Fetch leads data with date range filter
  const { data: leadsData = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ['/api/sales-marketing/leads', dateRange],
    queryFn: async () => {
      const from = formatDateForApi(dateRange.from);
      const to = formatDateForApi(dateRange.to);
      const response = await fetch(`/api/sales-marketing/leads?from=${from}&to=${to}`);
      if (!response.ok) {
        throw new Error('Failed to fetch leads data');
      }
      return response.json();
    },
    refetchOnWindowFocus: false
  });
  
  // Fetch orders in hand data with date range filter
  const { data: ordersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['/api/sales-marketing/dashboard/orders-in-hand', dateRange],
    queryFn: async () => {
      const from = formatDateForApi(dateRange.from);
      const to = formatDateForApi(dateRange.to);
      const response = await fetch(`/api/sales-marketing/dashboard/orders-in-hand?from=${from}&to=${to}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders data');
      }
      return response.json();
    },
    refetchOnWindowFocus: false
  });

  // Calculate total turnover (Expected Revenue + Orders in Hand + Invoiced Amount)
  const calculateTotalTurnover = () => {
    if (!expectedRevenueStats || !ordersData || !financeData) {
      return 0;
    }
    
    // Convert finance data (totalInvoices) from string to number if needed
    const invoicedAmount = financeData?.totalInvoices?.amount 
      ? parseFloat(financeData.totalInvoices.amount) 
      : 0;
    
    return expectedRevenueStats.totalINR + (ordersData.totalValueINR || 0) + invoicedAmount;
  };

  // Calculate campaign completion percentage
  function calculateCampaignCompletion(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = new Date().getTime();
    
    if (now <= start) return 0;
    if (now >= end) return 100;
    
    return Math.round(((now - start) / (end - start)) * 100);
  }

  // Create campaign status distribution
  const campaignStatusData = React.useMemo(() => {
    if (!campaignsData || campaignsData.length === 0) return [];
    
    const statusCount = {
      "Planned": 0,
      "Active": 0,
      "Completed": 0,
      "Cancelled": 0
    };
    
    campaignsData.forEach((campaign) => {
      statusCount[campaign.status]++;
    });
    
    return Object.entries(statusCount)
      .filter(([_, value]) => value > 0) // Only include statuses with campaigns
      .map(([name, value]) => ({
        name,
        value
      }));
  }, [campaignsData]);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header with Financial Year Filter */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Marketing Dashboard</h1>
              <p className="text-muted-foreground">Track your marketing performance and lead generation</p>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <Select 
                  value={selectedPreset} 
                  onValueChange={(value) => {
                    setSelectedPreset(value);
                    
                    let newDateRange;
                    let newLabel;
                    
                    if (value === "current") {
                      newDateRange = getCurrentFinancialYearDates();
                      newLabel = "Current Financial Year";
                    } else if (value === "previous") {
                      const { from, to } = getCurrentFinancialYearDates();
                      newDateRange = { 
                        from: new Date(from.getFullYear() - 1, from.getMonth(), from.getDate()),
                        to: new Date(to.getFullYear() - 1, to.getMonth(), to.getDate())
                      };
                      newLabel = "Previous Financial Year";
                    } else if (value === "last6months") {
                      newDateRange = {
                        from: new Date(new Date().setMonth(new Date().getMonth() - 6)),
                        to: new Date()
                      };
                      newLabel = "Last 6 Months";
                    }
                    
                    if (newDateRange) {
                      setDateRange(newDateRange);
                      setDateFilterLabel(newLabel);
                      
                      // Trigger data refresh with new date range
                      setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/campaigns'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/dashboard/orders-in-hand'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/finance/dashboard'] });
                      }, 0);
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Financial Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current FY</SelectItem>
                    <SelectItem value="previous">Previous FY</SelectItem>
                    <SelectItem value="last6months">Last 6 Months</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/campaigns'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/dashboard/orders-in-hand'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/finance/dashboard'] });
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
              
              {/* Display current date range */}
              <div className="text-xs text-muted-foreground text-right">
                <span className="font-medium">{dateFilterLabel}:</span>{' '}
                {dateRange.from.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})} - {' '}
                {dateRange.to.toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
              </div>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Showing data for: {dateFilterLabel} ({dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()})
          </div>
        </div>
        
        {/* Tabs Navigation */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab Content */}
          <TabsContent value="overview" className="space-y-6">
            {/* Total Turnover Card - Top Row */}
            <div className="mb-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                  <CardDescription>Total Turnover</CardDescription>
                  <CardTitle className="text-3xl">
                    {isLoadingLeads || isLoadingOrders || isLoadingFinance ? (
                      <Skeleton className="h-10 w-36" />
                    ) : (
                      `₹${formatINRInCrores(calculateTotalTurnover())} Cr`
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <DollarSign className="mr-1 h-4 w-4" />
                    Expected + Orders + Invoiced
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-1 p-0 h-6"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/finance/dashboard'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
                      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/dashboard/orders-in-hand'] });
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span className="text-xs">Refresh All Data</span>
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            {/* Stats Cards - Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Expected Revenue Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Expected Revenue</CardDescription>
                  <CardTitle className="text-3xl flex items-center justify-between">
                    <div>
                      {isLoadingLeads || !exchangeRates ? (
                        <Skeleton className="h-8 w-32" />
                      ) : (
                        <>
                          <div className="flex items-center">
                            <DollarSign className="h-6 w-6 mr-1" />
                            <span>USD ${expectedRevenueStats ? (expectedRevenueStats.totalUSD || 0).toLocaleString() : '0'}</span>
                          </div>
                          <div className="text-base text-green-600 font-normal">
                            ~INR ₹{expectedRevenueStats ? formatINRInCrores(expectedRevenueStats.totalINR) : '0'} Cr
                          </div>
                        </>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Based on probability
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 p-0 h-6"
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/leads'] });
                      }}
                    >
                      <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              {/* Orders in Hand Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Orders in Hand</CardDescription>
                  <CardTitle className="text-3xl flex items-center justify-between">
                    <div>
                      {isLoadingOrders ? (
                        <Skeleton className="h-8 w-32" />
                      ) : (
                        <>
                          <div className="text-xl">
                            {ordersData ? `${ordersData.count || 0} active orders` : '0 orders'}
                          </div>
                          <div className="flex items-center">
                            <DollarSign className="h-6 w-6 mr-1" />
                            <span>USD ${ordersData && ordersData.valuesByCurrency && ordersData.valuesByCurrency.USD ? 
                              ordersData.valuesByCurrency.USD.toLocaleString() : '0'}</span>
                          </div>
                          <div className="text-base text-green-600 font-normal">
                            ~INR ₹{ordersData ? formatINRInCrores(ordersData.totalValueINR) : '0'} Cr
                          </div>
                        </>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Total value of current orders
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 p-0 h-6"
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/dashboard/orders-in-hand'] });
                      }}
                    >
                      <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Stats Cards - Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Lead Count Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Leads</CardDescription>
                  <CardTitle className="text-2xl">
                    {isLoadingLeads ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      leadsData.length || 0
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <Users className="mr-1 h-4 w-4" />
                    From {leadSourceData.length || 0} sources
                  </div>
                </CardContent>
              </Card>
              
              {/* Campaign Count Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Active Campaigns</CardDescription>
                  <CardTitle className="text-2xl">
                    {isLoadingCampaigns ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      activeCampaignsCount || 0
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <Target className="mr-1 h-4 w-4" />
                    {campaignsData ? `${campaignsData.length} total campaigns` : 'No campaigns yet'}
                  </div>
                </CardContent>
              </Card>
              
              {/* Conversion Rate Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Lead Conversion Rate</CardDescription>
                  <CardTitle className="text-2xl">
                    {isLoadingLeads ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      `${conversionStats.rate}%`
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    {conversionStats.won} won out of {conversionStats.total}
                  </div>
                </CardContent>
              </Card>
              
              {/* Total Turnover Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Turnover</CardDescription>
                  <CardTitle className="text-2xl">
                    {isLoadingLeads || isLoadingOrders || isLoadingFinance ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      `₹${formatINRInCrores(calculateTotalTurnover())} Cr`
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <DollarSign className="mr-1 h-4 w-4" />
                    Expected + Orders + Invoiced
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-1 p-0 h-6"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/finance/dashboard'] });
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span className="text-xs">Refresh Finance Data</span>
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            {/* Charts - Second Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Monthly Lead Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <LineChartIcon className="mr-2 h-6 w-6" /> 
                    Monthly Lead Generation
                  </CardTitle>
                  <CardDescription>Number of new leads acquired by month</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingLeads ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart
                        data={leadMonthlyTrends}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="leads" 
                          stroke="#8884d8" 
                          activeDot={{ r: 8 }} 
                          name="Leads"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              {/* Campaign Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChartIcon className="mr-2 h-6 w-6" /> 
                    Campaign Status
                  </CardTitle>
                  <CardDescription>Distribution of campaign statuses</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingCampaigns ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={campaignStatusData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                        >
                          {campaignStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={LEAD_SOURCE_COLORS[index % LEAD_SOURCE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Charts - Third Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lead Source Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChartIcon className="mr-2 h-6 w-6" /> 
                    Lead Sources
                  </CardTitle>
                  <CardDescription>Distribution of leads by source</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingLeads ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={leadSourceData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                        >
                          {leadSourceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={LEAD_SOURCE_COLORS[index % LEAD_SOURCE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              
              {/* Lead Status Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChartIcon className="mr-2 h-6 w-6" /> 
                    Lead Status
                  </CardTitle>
                  <CardDescription>Distribution of leads by status</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingLeads ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={leadStatusData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                        >
                          {leadStatusData.map((entry, index) => {
                            const color = LEAD_STATUS_COLORS[entry.name] || LEAD_SOURCE_COLORS[index % LEAD_SOURCE_COLORS.length];
                            return <Cell key={`cell-${index}`} fill={color} />;
                          })}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Campaigns Tab Content */}
          <TabsContent value="campaigns" className="mt-0 w-full">
            <div className="mt-4 w-full">
              <h2 className="text-2xl font-bold mb-4">Campaign Performance</h2>
              <div className="space-y-4">
                {isLoadingCampaigns ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <div className="border rounded-lg overflow-x-auto w-full">
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="bg-muted">
                          <th className="px-4 py-2 text-left">Campaign Name</th>
                          <th className="px-4 py-2 text-left">Channel</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Timeline</th>
                          <th className="px-4 py-2 text-right">Leads (Expected/Actual)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignsData && campaignsData.length > 0 ? (
                          campaignsData.map((campaign) => (
                            <tr key={campaign.id} className="border-t">
                              <td className="px-4 py-3">{campaign.name}</td>
                              <td className="px-4 py-3">{campaign.channelName || 'N/A'}</td>
                              <td className="px-4 py-3">
                                <Badge 
                                  variant={campaign.status === 'Active' ? 'default' : 
                                          campaign.status === 'Completed' ? 'outline' : 
                                          campaign.status === 'Planned' ? 'secondary' : 'outline'}
                                >
                                  {campaign.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'TBD'} - {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'TBD'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {campaign.expectedLeadCount || 0} / {campaign.actualLeadCount || 0}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-center text-muted-foreground">No campaigns found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
          
          {/* Leads Tab Content */}
          <TabsContent value="leads" className="mt-0 w-full">
            <div className="mt-4">
              <h2 className="text-2xl font-bold mb-4">Lead Details</h2>
              <div className="space-y-4">
                {isLoadingLeads ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="bg-muted">
                          <th className="px-4 py-2 text-left">Company</th>
                          <th className="px-4 py-2 text-left">Contact</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Source</th>
                          <th className="px-4 py-2 text-right">Expected Revenue</th>
                          <th className="px-4 py-2 text-center">Probability</th>
                          <th className="px-4 py-2 text-right">Weighted Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadsData && leadsData.length > 0 ? (
                          leadsData.map((lead) => (
                            <tr key={lead.id} className="border-t">
                              <td className="px-4 py-3">{lead.companyName}</td>
                              <td className="px-4 py-3">
                                {lead.contactPerson}<br />
                                <span className="text-xs text-muted-foreground">{lead.contactEmail}</span>
                              </td>
                              <td className="px-4 py-3">
                                <Badge 
                                  variant={lead.statusName === 'Won' ? 'default' : 
                                          lead.statusName === 'Lost' ? 'destructive' : 
                                          'outline'}
                                >
                                  {lead.statusName}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">{lead.sourceName}</td>
                              <td className="px-4 py-3 text-right">
                                {formatCurrency(lead.expectedRevenue, lead.currency)}
                              </td>
                              <td className="px-4 py-3 text-center">{lead.probability}%</td>
                              <td className="px-4 py-3 text-right">
                                {formatCurrency(lead.weightedValue, lead.currency)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-4 py-3 text-center text-muted-foreground">No leads found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
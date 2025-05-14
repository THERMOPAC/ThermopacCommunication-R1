import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { fetchExchangeRates, convertCurrency, formatCurrency } from "@/lib/currencyConverter";

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
  // State for currency conversion
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Fetch leads data
  const { data: leadsData, isLoading: isLoadingLeads } = useQuery({
    queryKey: ['/api/sales-marketing/leads'],
    refetchOnWindowFocus: false
  });

  // Fetch campaign data
  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['/api/sales-marketing/campaigns'],
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
    
    const sourceCount: Record<string, number> = {};
    
    leadsData.forEach((lead: any) => {
      const sourceName = lead.sourceName;
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
    
    const statusCount: Record<string, number> = {};
    
    leadsData.forEach((lead: any) => {
      const statusName = lead.statusName;
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
    return campaignsData.filter((campaign: any) => campaign.status === "Active").length;
  }, [campaignsData]);

  // Create monthly lead trend data
  const leadMonthlyTrends = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0) return [];
    
    const monthlyData: Record<string, number> = {};
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
    leadsData.forEach((lead: any) => {
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
      .filter((campaign: any) => campaign.expectedLeadCount && campaign.status !== "Planned")
      .map((campaign: any) => ({
        name: campaign.name,
        expected: campaign.expectedLeadCount || 0,
        actual: campaign.actualLeadCount || 0,
        completion: campaign.status === "Completed" ? 100 : 
                   calculateCampaignCompletion(campaign.startDate, campaign.endDate)
      }))
      .sort((a: any, b: any) => b.actual - a.actual)
      .slice(0, 5);
  }, [campaignsData]);

  // Calculate lead conversion rate stats
  const conversionStats = React.useMemo(() => {
    if (!leadsData || leadsData.length === 0) return { rate: 0, total: 0, won: 0 };
    
    const totalLeads = leadsData.length;
    const wonLeads = leadsData.filter((lead: any) => lead.statusName === "Won").length;
    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
    
    return {
      rate: conversionRate,
      total: totalLeads,
      won: wonLeads
    };
  }, [leadsData]);
  
  // Fetch orders in hand data
  const { data: ordersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['/api/sales-marketing/dashboard/orders-in-hand'],
    refetchOnWindowFocus: false
  });
  
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
    const bySourceUSD: Record<string, number> = {};
    const bySourceINR: Record<string, number> = {};
    
    // Process each lead
    leadsData.forEach((lead: any) => {
      if (!lead.expectedRevenue || !lead.currency || lead.probability === null) {
        return; // Skip leads without revenue data
      }
      
      // Calculate weighted revenue based on probability
      const probability = Number(lead.probability) / 100;
      const revenue = Number(lead.expectedRevenue);
      const weightedRevenue = revenue * probability;
      
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

  // Calculate campaign completion percentage
  function calculateCampaignCompletion(startDate: string, endDate: string) {
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
    
    const statusCount: Record<string, number> = {
      "Planned": 0,
      "Active": 0,
      "Completed": 0,
      "Cancelled": 0
    };
    
    campaignsData.forEach((campaign: any) => {
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
      <div className="p-4 md:p-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Marketing Dashboard</h1>
            <p className="text-muted-foreground">Track your marketing performance and lead generation</p>
          </div>
          
          <Tabs defaultValue="overview" className="w-[400px]">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="leads">Leads</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Total Leads Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingLeads ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">{leadsData?.length || 0}</div>
              )}
              <p className="text-xs text-muted-foreground">
                leads in the system
              </p>
            </CardContent>
          </Card>

          {/* Conversion Rate Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingLeads ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">{conversionStats.rate}%</div>
              )}
              <p className="text-xs text-muted-foreground">
                {conversionStats.won} won out of {conversionStats.total} leads
              </p>
            </CardContent>
          </Card>

          {/* Active Campaigns Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingCampaigns ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">{activeCampaignsCount}</div>
              )}
              <p className="text-xs text-muted-foreground">
                currently running
              </p>
            </CardContent>
          </Card>

          {/* Leads this Month Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leads This Month</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingLeads ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {leadMonthlyTrends[leadMonthlyTrends.length - 1]?.leads || 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {leadMonthlyTrends.length > 1 ? (
                  <>
                    {leadMonthlyTrends[leadMonthlyTrends.length - 1]?.leads > leadMonthlyTrends[leadMonthlyTrends.length - 2]?.leads ? (
                      <span className="text-green-500">↑</span>
                    ) : (
                      <span className="text-red-500">↓</span>
                    )}
                    {" "}from previous month
                  </>
                ) : (
                  "new leads"
                )}
              </p>
            </CardContent>
          </Card>
          
          {/* Expected Revenue Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expected Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingLeads || isLoadingRates ? (
                <Skeleton className="h-7 w-full" />
              ) : (
                <div>
                  <div className="text-lg font-bold flex flex-col gap-0">
                    {expectedRevenueStats.totalUSD > 0 && (
                      <span>USD {formatCurrency(expectedRevenueStats.totalUSD, 'USD')}</span>
                    )}
                    {expectedRevenueStats.totalEUR > 0 && (
                      <span>EUR {formatCurrency(expectedRevenueStats.totalEUR, 'EUR')}</span>
                    )}
                  </div>
                  <div className="text-sm font-medium mt-1 text-green-600">
                    ~INR {formatCurrency(expectedRevenueStats.totalINR, 'INR')}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                <span>Based on probability</span>
                {lastUpdated && (
                  <button 
                    className="flex items-center text-xs text-blue-500 hover:text-blue-700" 
                    onClick={async () => {
                      setIsLoadingRates(true);
                      try {
                        const rates = await fetchExchangeRates();
                        setExchangeRates(rates);
                        setLastUpdated(new Date());
                      } catch (error) {
                        console.error("Failed to refresh rates:", error);
                      } finally {
                        setIsLoadingRates(false);
                      }
                    }}
                    disabled={isLoadingRates}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingRates ? 'animate-spin' : ''}`} />
                    {isLoadingRates ? 'Updating...' : 'Refresh'}
                  </button>
                )}
              </p>
            </CardContent>
          </Card>
          
          {/* Orders in Hand Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orders in Hand</CardTitle>
              <BarChartIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingOrders ? (
                <Skeleton className="h-7 w-full" />
              ) : (
                <div>
                  <div className="text-2xl font-bold">
                    {ordersData?.count || 0}
                  </div>
                  <div className="text-sm flex flex-col gap-0 mt-1">
                    {ordersData?.valuesByCurrency && Object.entries(ordersData.valuesByCurrency).map(([currency, value]) => (
                      <span key={currency} className="text-xs">
                        {currency}: {formatCurrency(value as number, currency)}
                      </span>
                    ))}
                  </div>
                  {ordersData?.totalValueINR > 0 && (
                    <div className="text-sm font-medium mt-1 text-green-600">
                      ~INR {formatCurrency(ordersData.totalValueINR, 'INR')}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                active orders as of today
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lead Trends Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Lead Generation Trends</CardTitle>
              <CardDescription>Monthly lead acquisition over time</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isLoadingLeads ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-[250px] w-full" />
                </div>
              ) : leadMonthlyTrends.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No lead data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
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

          {/* Campaign Performance Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>Expected vs actual lead generation</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isLoadingCampaigns ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-[250px] w-full" />
                </div>
              ) : campaignPerformanceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No campaign data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={campaignPerformanceData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={100} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="expected" fill="#8884d8" name="Expected Leads" />
                    <Bar dataKey="actual" fill="#82ca9d" name="Actual Leads" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Lead Source Distribution Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Lead Source Distribution</CardTitle>
              <CardDescription>Where your leads are coming from</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isLoadingLeads ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-[250px] w-full" />
                </div>
              ) : leadSourceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No lead data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leadSourceData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {leadSourceData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={LEAD_SOURCE_COLORS[index % LEAD_SOURCE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Lead Status Distribution Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Lead Status Distribution</CardTitle>
              <CardDescription>Current status of your leads</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isLoadingLeads ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-[250px] w-full" />
                </div>
              ) : leadStatusData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No lead data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leadStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {leadStatusData.map((entry) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={LEAD_STATUS_COLORS[entry.name as keyof typeof LEAD_STATUS_COLORS] || "#8884d8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
import React from "react";
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
  Target
} from "lucide-react";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// Sample data for the dashboard
// In a real implementation, this would come from the API
const LEAD_SOURCE_COLORS = [
  "#8884d8", // Google Ads
  "#82ca9d", // Website
  "#ffc658", // Referral
  "#ff8042", // Exhibition
  "#0088fe"  // Direct Contact
];

const LEAD_STATUS_COLORS = {
  "New": "#3b82f6",
  "Contacted": "#10b981",
  "Qualified": "#8b5cf6",
  "Proposal": "#f59e0b",
  "Negotiation": "#ec4899",
  "Won": "#22c55e",
  "Lost": "#ef4444"
};

export default function MarketingDashboardPage() {
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

  // Convert leads to monthly trends
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
    
    const statusCount: Record<string, number> = {};
    
    campaignsData.forEach((campaign: any) => {
      if (!statusCount[campaign.status]) {
        statusCount[campaign.status] = 0;
      }
      statusCount[campaign.status]++;
    });
    
    return Object.entries(statusCount).map(([name, value]) => ({
      name,
      value
    }));
  }, [campaignsData]);

  // Get active campaigns count
  const activeCampaignsCount = React.useMemo(() => {
    if (!campaignsData) return 0;
    return campaignsData.filter((campaign: any) => campaign.status === "Active").length;
  }, [campaignsData]);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing Dashboard</h1>
          <p className="text-muted-foreground">Overview of your sales and marketing performance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Lead Count Card */}
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
                from all sources
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lead Trends Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Lead Generation Trends</CardTitle>
              <CardDescription>Monthly lead acquisition over time</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {isLoadingLeads ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : leadMonthlyTrends.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No lead data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={leadMonthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      width={30}
                      tick={{ fontSize: 12 }}
                    >
                      <Label
                        value="Leads"
                        angle={-90}
                        position="insideLeft"
                        style={{ textAnchor: 'middle', fontSize: 12 }}
                      />
                    </YAxis>
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="leads"
                      stroke="#8884d8"
                      strokeWidth={2}
                      activeDot={{ r: 8 }}
                      name="Lead Count"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Lead Sources Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Lead Sources</CardTitle>
              <CardDescription>Distribution of leads by source</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {isLoadingLeads ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : leadSourceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No lead source data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leadSourceData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                    >
                      {leadSourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={LEAD_SOURCE_COLORS[index % LEAD_SOURCE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [`${value} leads`, `Source: ${name}`]}
                    />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lead Status Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Lead Status Distribution</CardTitle>
              <CardDescription>Breakdown of leads by current status</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {isLoadingLeads ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : leadStatusData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No lead status data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={leadStatusData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={true} vertical={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      tick={{ fontSize: 12 }}
                      width={75}
                    />
                    <Tooltip formatter={(value) => [`${value} leads`, 'Count']} />
                    <Legend />
                    <Bar 
                      dataKey="value" 
                      name="Lead Count"
                      fill="#8884d8"
                    >
                      {leadStatusData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={LEAD_STATUS_COLORS[entry.name as keyof typeof LEAD_STATUS_COLORS] || "#8884d8"} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Campaign Performance Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>Expected vs. actual leads for top campaigns</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {isLoadingCampaigns ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : campaignPerformanceData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No campaign performance data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={campaignPerformanceData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis 
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="expected" name="Expected Leads" fill="#8884d8" />
                    <Bar dataKey="actual" name="Actual Leads" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Campaign Status Distribution */}
        <Tabs defaultValue="summary" className="w-full">
          <TabsList>
            <TabsTrigger value="summary">Campaign Summary</TabsTrigger>
          </TabsList>
          <TabsContent value="summary">
            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="col-span-1">
                  <CardHeader>
                    <CardTitle>Campaign Status Distribution</CardTitle>
                    <CardDescription>Breakdown of campaigns by status</CardDescription>
                  </CardHeader>
                  <CardContent className="h-60">
                    {isLoadingCampaigns ? (
                      <div className="flex items-center justify-center h-full">
                        <Skeleton className="h-48 w-full" />
                      </div>
                    ) : campaignStatusData.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No campaign data available
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={campaignStatusData}
                                cx="50%"
                                cy="50%"
                                outerRadius={60}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                              >
                                {campaignStatusData.map((entry, index) => {
                                  let color;
                                  switch (entry.name) {
                                    case "Planned": color = "#3b82f6"; break;
                                    case "Active": color = "#10b981"; break;
                                    case "Completed": color = "#8b5cf6"; break;
                                    case "Cancelled": color = "#ef4444"; break;
                                    default: color = "#6b7280";
                                  }
                                  return <Cell key={`cell-${index}`} fill={color} />;
                                })}
                              </Pie>
                              <Tooltip formatter={(value) => [`${value} campaigns`, 'Count']} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="col-span-1 flex flex-col justify-center">
                          {campaignStatusData.map((status, index) => {
                            let bgColor;
                            switch (status.name) {
                              case "Planned": bgColor = "bg-blue-500"; break;
                              case "Active": bgColor = "bg-green-500"; break;
                              case "Completed": bgColor = "bg-purple-500"; break;
                              case "Cancelled": bgColor = "bg-red-500"; break;
                              default: bgColor = "bg-gray-500";
                            }
                            return (
                              <div key={index} className="flex items-center justify-between mb-2">
                                <div className="flex items-center">
                                  <Badge className={bgColor}>{status.name}</Badge>
                                </div>
                                <span className="text-sm font-medium">{status.value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="col-span-1">
                  <CardHeader>
                    <CardTitle>Recent Campaigns</CardTitle>
                    <CardDescription>Latest marketing campaigns</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingCampaigns ? (
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
                    ) : !campaignsData || campaignsData.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p>No campaigns available.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {campaignsData
                          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .slice(0, 5)
                          .map((campaign: any) => {
                            let badgeColor;
                            switch (campaign.status) {
                              case "Planned": badgeColor = "bg-blue-500"; break;
                              case "Active": badgeColor = "bg-green-500"; break;
                              case "Completed": badgeColor = "bg-purple-500"; break;
                              case "Cancelled": badgeColor = "bg-red-500"; break;
                              default: badgeColor = "bg-gray-500";
                            }
                            return (
                              <div key={campaign.id} className="flex justify-between items-start border-b pb-3 last:border-0 last:pb-0">
                                <div>
                                  <p className="font-medium">{campaign.name}</p>
                                  <p className="text-sm">{campaign.channelName}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(campaign.startDate).toLocaleDateString('en-US', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric'
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <Badge className={badgeColor}>{campaign.status}</Badge>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
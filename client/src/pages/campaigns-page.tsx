import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  BarChart3, TrendingUp, DollarSign, MousePointerClick, Eye, Target,
  RefreshCw, Settings, Link2, Unlink,
  Search, AlertTriangle, ChevronLeft, Loader2, CheckCircle2, XCircle,
  Zap, BarChart2
} from "lucide-react";

function getDateRange(period: string): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const endDate = fmt(today);
  switch (period) {
    case "today": return { startDate: endDate, endDate };
    case "yesterday": { const d = new Date(today); d.setDate(d.getDate() - 1); return { startDate: fmt(d), endDate: fmt(d) }; }
    case "last_7_days": { const d = new Date(today); d.setDate(d.getDate() - 7); return { startDate: fmt(d), endDate }; }
    case "last_30_days": { const d = new Date(today); d.setDate(d.getDate() - 30); return { startDate: fmt(d), endDate }; }
    case "this_month": { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { startDate: fmt(d), endDate }; }
    case "last_month": { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { startDate: fmt(s), endDate: fmt(e) }; }
    default: { const d = new Date(today); d.setDate(d.getDate() - 30); return { startDate: fmt(d), endDate }; }
  }
}

function formatCurrency(val: number): string {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(2)}K`;
  return `$${val.toFixed(2)}`;
}

function formatNumber(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ENABLED: "bg-green-100 text-green-800 border-green-200",
    PAUSED: "bg-yellow-100 text-yellow-800 border-yellow-200",
    REMOVED: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge variant="outline" className={colors[status] || "bg-gray-100 text-gray-800"}>
      {status}
    </Badge>
  );
}

function SetupScreen() {
  const connectionStatus = useQuery({ queryKey: ["/api/google-ads/connection-status"] });
  const status = connectionStatus.data as any;

  const connectMutation = useMutation({
    mutationFn: async () => {
      const data = await apiRequest("GET", "/api/google-ads/auth-url");
      window.location.href = data.url;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google-ads/disconnect"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/google-ads/connection-status"] }),
  });

  if (connectionStatus.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const isConnected = status?.connected;
  const hasDeveloperToken = status?.hasDeveloperToken;
  const hasCustomerId = status?.hasCustomerId;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Google Ads Connection Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              {hasDeveloperToken ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">Developer Token</p>
                <p className="text-sm text-muted-foreground">
                  {hasDeveloperToken ? "Configured" : "Not configured - Add GOOGLE_ADS_DEVELOPER_TOKEN to secrets"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border">
              {hasCustomerId ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">Customer ID</p>
                <p className="text-sm text-muted-foreground">
                  {hasCustomerId ? `Configured: ${status.customerId}` : "Not configured - Add GOOGLE_ADS_CUSTOMER_ID to secrets"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border">
              {isConnected ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">OAuth Connection</p>
                <p className="text-sm text-muted-foreground">
                  {isConnected ? "Connected to Google Ads" : "Not connected - Click below to authorize"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {!isConnected ? (
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={!hasDeveloperToken || !hasCustomerId || connectMutation.isPending}
                className="flex items-center gap-2"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                Connect Google Ads Account
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="flex items-center gap-2"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </Button>
            )}
          </div>

          {(!hasDeveloperToken || !hasCustomerId) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Setup Required</p>
                  <p className="text-yellow-700 mt-1">
                    Before connecting, add the required secrets in your Replit environment:
                  </p>
                  <ul className="mt-2 space-y-1 text-yellow-700">
                    {!hasDeveloperToken && <li>GOOGLE_ADS_DEVELOPER_TOKEN (from Google Ads API Center)</li>}
                    {!hasCustomerId && <li>GOOGLE_ADS_CUSTOMER_ID (your 10-digit account number without dashes)</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ title, value, icon: Icon }: {
  title: string; value: string; icon: any;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
            <Icon className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const metrics = useQuery({
    queryKey: ["/api/google-ads/dashboard/metrics", dateRange.startDate, dateRange.endDate],
    queryFn: () => apiRequest("GET", `/api/google-ads/dashboard/metrics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
  });

  const dailySpend = useQuery({
    queryKey: ["/api/google-ads/dashboard/daily-spend", dateRange.startDate, dateRange.endDate],
    queryFn: () => apiRequest("GET", `/api/google-ads/dashboard/daily-spend?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
  });

  const m = metrics.data as any;

  if (metrics.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const spendData = (dailySpend.data || []) as any[];
  const maxSpend = Math.max(...spendData.map((d: any) => d.spend), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Spend" value={formatCurrency(m?.totalSpend || 0)} icon={DollarSign} />
        <KPICard title="Impressions" value={formatNumber(m?.totalImpressions || 0)} icon={Eye} />
        <KPICard title="Clicks" value={formatNumber(m?.totalClicks || 0)} icon={MousePointerClick} />
        <KPICard title="CTR" value={`${(m?.ctr || 0).toFixed(2)}%`} icon={TrendingUp} />
        <KPICard title="Avg CPC" value={formatCurrency(m?.avgCpc || 0)} icon={BarChart3} />
        <KPICard title="Conversions" value={formatNumber(m?.totalConversions || 0)} icon={Target} />
        <KPICard title="Cost / Conv." value={formatCurrency(m?.costPerConversion || 0)} icon={Zap} />
        <KPICard title="ROAS" value={`${(m?.roas || 0).toFixed(2)}x`} icon={BarChart2} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Daily Spend Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {spendData.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-end gap-1 h-40">
                {spendData.map((d: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${formatCurrency(d.spend)}`}>
                    <div
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors min-h-[2px]"
                      style={{ height: `${(d.spend / maxSpend) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{spendData[0]?.date}</span>
                <span>{spendData[spendData.length - 1]?.date}</span>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No spend data available for this period. Run a sync first.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignsTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);

  const campaigns = useQuery({
    queryKey: ["/api/google-ads/campaigns", dateRange.startDate, dateRange.endDate],
    queryFn: () => apiRequest("GET", `/api/google-ads/campaigns?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
  });

  const campaignDetails = useQuery({
    queryKey: ["/api/google-ads/campaigns", selectedCampaign, "details"],
    queryFn: () => apiRequest("GET", `/api/google-ads/campaigns/${selectedCampaign}/details`),
    enabled: !!selectedCampaign,
  });

  if (selectedCampaign) {
    const details = campaignDetails.data as any;
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedCampaign(null)} className="flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Campaigns
        </Button>

        {campaignDetails.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{details?.campaign?.name || "Campaign"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={details?.campaign?.status} /></div>
                  <div><span className="text-muted-foreground">Type:</span> {details?.campaign?.advertising_channel_type}</div>
                  <div><span className="text-muted-foreground">Budget:</span> {formatCurrency(Number(details?.campaign?.budget_amount_micros || 0) / 1000000)}/day</div>
                </div>
              </CardContent>
            </Card>

            {details?.adGroups?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Ad Groups ({details.adGroups.length})</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">CPC Bid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.adGroups.map((ag: any) => (
                        <TableRow key={ag.google_ad_group_id}>
                          <TableCell className="font-medium">{ag.name}</TableCell>
                          <TableCell><StatusBadge status={ag.status} /></TableCell>
                          <TableCell>{ag.type}</TableCell>
                          <TableCell className="text-right">{ag.cpc_bid_micros ? formatCurrency(Number(ag.cpc_bid_micros) / 1000000) : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {details?.keywords?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Keywords ({details.keywords.length})</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Keyword</TableHead>
                        <TableHead>Match Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Quality Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.keywords.map((kw: any) => (
                        <TableRow key={kw.google_criterion_id}>
                          <TableCell className="font-medium">{kw.text}</TableCell>
                          <TableCell><Badge variant="outline">{kw.match_type}</Badge></TableCell>
                          <TableCell><StatusBadge status={kw.status} /></TableCell>
                          <TableCell className="text-right">{kw.quality_score || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  const campaignList = (campaigns.data || []) as any[];

  return (
    <div>
      {campaigns.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : campaignList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No campaigns synced yet. Click "Sync Now" to pull data from Google Ads.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Budget/Day</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Avg CPC</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignList.map((c: any) => (
                  <TableRow
                    key={c.googleCampaignId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedCampaign(c.googleCampaignId)}
                  >
                    <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-xs">{c.advertisingChannelType || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.budgetAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(c.spend)}</TableCell>
                    <TableCell className="text-right">{formatNumber(c.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right">{c.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.avgCpc)}</TableCell>
                    <TableCell className="text-right">{c.conversions}</TableCell>
                    <TableCell className="text-right">{c.roas.toFixed(2)}x</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KeywordsTab() {
  const keywords = useQuery({ queryKey: ["/api/google-ads/keywords"] });
  const kwList = (keywords.data || []) as any[];
  const [searchFilter, setSearchFilter] = useState("");

  const filtered = useMemo(() => {
    if (!searchFilter) return kwList;
    const lc = searchFilter.toLowerCase();
    return kwList.filter((kw: any) => kw.text?.toLowerCase().includes(lc) || kw.campaign_name?.toLowerCase().includes(lc));
  }, [kwList, searchFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search keywords..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground">{filtered.length} keywords</span>
      </div>

      {keywords.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No keywords synced yet.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Match Type</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quality Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((kw: any) => (
                  <TableRow key={kw.google_criterion_id}>
                    <TableCell className="font-medium">{kw.text}</TableCell>
                    <TableCell><Badge variant="outline">{kw.match_type}</Badge></TableCell>
                    <TableCell className="max-w-[150px] truncate">{kw.campaign_name || "-"}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{kw.ad_group_name || "-"}</TableCell>
                    <TableCell><StatusBadge status={kw.status} /></TableCell>
                    <TableCell className="text-right">
                      {kw.quality_score ? (
                        <span className={kw.quality_score >= 7 ? "text-green-600 font-bold" : kw.quality_score >= 5 ? "text-yellow-600" : "text-red-600"}>
                          {kw.quality_score}/10
                        </span>
                      ) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SearchTermsTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const searchTerms = useQuery({
    queryKey: ["/api/google-ads/search-terms", dateRange.startDate, dateRange.endDate],
    queryFn: () => apiRequest("GET", `/api/google-ads/search-terms?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
  });

  const [searchFilter, setSearchFilter] = useState("");
  const termList = (searchTerms.data || []) as any[];

  const filtered = useMemo(() => {
    if (!searchFilter) return termList;
    const lc = searchFilter.toLowerCase();
    return termList.filter((t: any) => t.search_term?.toLowerCase().includes(lc));
  }, [termList, searchFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search terms..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground">{filtered.length} terms</span>
      </div>

      {searchTerms.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No search terms available for this period.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search Term</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead>Waste?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((t: any, i: number) => {
                  const isWaste = t.spend > 5 && Number(t.conversions || 0) === 0;
                  return (
                    <TableRow key={i} className={isWaste ? "bg-red-50" : ""}>
                      <TableCell className="font-medium max-w-[250px] truncate">{t.search_term}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{t.campaign_name || "-"}</TableCell>
                      <TableCell className="text-right">{formatNumber(t.impressions || 0)}</TableCell>
                      <TableCell className="text-right">{formatNumber(t.clicks || 0)}</TableCell>
                      <TableCell className="text-right">{t.ctr?.toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(t.spend || 0)}</TableCell>
                      <TableCell className="text-right">{t.conversions || 0}</TableCell>
                      <TableCell>
                        {isWaste && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Waste
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const [period, setPeriod] = useState("last_30_days");
  const [activeTab, setActiveTab] = useState("overview");
  const dateRange = getDateRange(period);

  const connectionStatus = useQuery({ queryKey: ["/api/google-ads/connection-status"] });
  const syncStatus = useQuery({ queryKey: ["/api/google-ads/sync/status"] });
  const status = connectionStatus.data as any;
  const isConnected = status?.connected;

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google-ads/sync/full", { period }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
    },
  });

  const lastSync = (syncStatus.data as any[])?.[0];

  if (connectionStatus.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Google Ads</h1>
          <p className="text-sm text-muted-foreground">
            {isConnected ? `Account: ${status?.customerId || "Connected"}` : "Connect your Google Ads account to get started"}
          </p>
        </div>

        {isConnected && (
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-xs text-muted-foreground">
                Last sync: {lastSync.last_run_at ? new Date(lastSync.last_run_at).toLocaleString() : "Never"}
              </span>
            )}

            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync Now
            </Button>
          </div>
        )}
      </div>

      {!isConnected ? (
        <SetupScreen />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
            <TabsTrigger value="search-terms">Search Terms</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4">
            <CampaignsTab dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="keywords" className="mt-4">
            <KeywordsTab />
          </TabsContent>

          <TabsContent value="search-terms" className="mt-4">
            <SearchTermsTab dateRange={dateRange} />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <SetupScreen />
          </TabsContent>
        </Tabs>
      )}

      {syncMutation.isPending && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <Loader2 className="w-5 h-5 animate-spin" />
          <div>
            <p className="font-medium">Syncing Google Ads data...</p>
            <p className="text-sm opacity-90">This may take a moment</p>
          </div>
        </div>
      )}

      {syncMutation.isSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <CheckCircle2 className="w-5 h-5" />
          <p className="font-medium">Sync completed successfully!</p>
        </div>
      )}

      {syncMutation.isError && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md z-50">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Sync failed</p>
            <p className="text-sm opacity-90">{(syncMutation.error as any)?.message || "An error occurred"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

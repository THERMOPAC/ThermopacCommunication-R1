import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, TrendingUp, DollarSign, MousePointerClick, Eye, Target,
  RefreshCw, Settings, Link2, Unlink, Plus, Play, Pause, Trash2,
  Search, AlertTriangle, ChevronLeft, Loader2, CheckCircle2, XCircle,
  Zap, BarChart2, FileText, Globe, Megaphone, Sparkles, Brain,
  Info, ArrowRight, Lightbulb, Copy, Video, Monitor, Rocket
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
      window.open(data.url, "_blank");
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

const CAMPAIGN_TYPE_INFO: Record<string, { icon: any; label: string; desc: string; best: string }> = {
  SEARCH: { icon: Search, label: "Search", desc: "Text ads on Google Search results", best: "Best for capturing high-intent buyers searching for your products" },
  DISPLAY: { icon: Monitor, label: "Display", desc: "Visual ads across Google Display Network", best: "Best for brand awareness and remarketing to past visitors" },
  VIDEO: { icon: Video, label: "Video", desc: "Video ads on YouTube and partner sites", best: "Best for product demos, brand storytelling, and reaching wider audience" },
  PERFORMANCE_MAX: { icon: Rocket, label: "Performance Max", desc: "AI-optimized ads across all Google channels", best: "Best when you have conversion tracking set up and want Google AI to optimize" },
};

const BIDDING_STRATEGIES: Record<string, { strategies: Array<{ value: string; label: string; desc: string; when: string; needsTarget: boolean; targetLabel?: string; targetPlaceholder?: string }> }> = {
  SEARCH: {
    strategies: [
      { value: "MANUAL_CPC", label: "Manual CPC", desc: "You set max cost-per-click for each keyword", when: "New campaigns or when you want full control over bids", needsTarget: false },
      { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks", desc: "Google automatically sets bids to get the most clicks", when: "Building traffic and gathering data for new campaigns", needsTarget: false },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", desc: "Google automatically sets bids to get the most conversions", when: "When you have 15+ conversions/month and conversion tracking is set up", needsTarget: false },
      { value: "TARGET_CPA", label: "Target CPA", desc: "Google optimizes bids to hit your target cost per lead/conversion", when: "When you have 30+ conversions/month and know your ideal cost per lead", needsTarget: true, targetLabel: "Target Cost per Lead (INR)", targetPlaceholder: "e.g. 500" },
      { value: "TARGET_ROAS", label: "Target ROAS", desc: "Google optimizes for a target return on ad spend", when: "E-commerce or when you can track revenue from ads", needsTarget: true, targetLabel: "Target ROAS", targetPlaceholder: "e.g. 3.0 for 300% return" },
    ]
  },
  DISPLAY: {
    strategies: [
      { value: "MANUAL_CPC", label: "Manual CPC", desc: "You set max cost-per-click", when: "When starting display campaigns for the first time", needsTarget: false },
      { value: "MAXIMIZE_CLICKS", label: "Maximize Clicks", desc: "Automatically maximize clicks within budget", when: "Driving traffic for remarketing or brand awareness", needsTarget: false },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", desc: "Automatically maximize conversions", when: "When you have good conversion tracking and history", needsTarget: false },
      { value: "TARGET_CPA", label: "Target CPA", desc: "Optimize for target cost per conversion", when: "When you have 30+ conversions/month from display", needsTarget: true, targetLabel: "Target CPA (INR)", targetPlaceholder: "e.g. 200" },
    ]
  },
  VIDEO: {
    strategies: [
      { value: "TARGET_CPV", label: "Target CPV", desc: "Pay per video view (someone watches 30s or interacts)", when: "Brand awareness and product demo videos", needsTarget: true, targetLabel: "Max Cost per View (INR)", targetPlaceholder: "e.g. 2.00" },
      { value: "TARGET_CPM", label: "Target CPM", desc: "Pay per 1,000 impressions shown", when: "Maximum reach and brand exposure campaigns", needsTarget: true, targetLabel: "Target CPM (INR)", targetPlaceholder: "e.g. 50.00" },
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", desc: "Google optimizes for conversions from video", when: "Video Action campaigns with conversion tracking", needsTarget: false },
      { value: "TARGET_CPA", label: "Target CPA", desc: "Optimize video ads for target cost per conversion", when: "When video drives measurable leads/sales", needsTarget: true, targetLabel: "Target CPA (INR)", targetPlaceholder: "e.g. 300" },
    ]
  },
  PERFORMANCE_MAX: {
    strategies: [
      { value: "MAXIMIZE_CONVERSIONS", label: "Maximize Conversions", desc: "Google AI optimizes across all channels for conversions", when: "Default for Performance Max - let Google AI optimize", needsTarget: false },
      { value: "TARGET_ROAS", label: "Maximize Conv. Value (Target ROAS)", desc: "Google AI optimizes for conversion value with a ROAS target", when: "When you can assign values to different conversions", needsTarget: true, targetLabel: "Target ROAS", targetPlaceholder: "e.g. 3.0 for 300% return" },
    ]
  },
};

const AVAILABLE_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "bn", name: "Bengali" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "ur", name: "Urdu" },
];

function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [channelType, setChannelType] = useState("SEARCH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [biddingStrategy, setBiddingStrategy] = useState("MANUAL_CPC");
  const [targetValue, setTargetValue] = useState("");
  const [videoSubtype, setVideoSubtype] = useState("VIDEO_ACTION");

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["en"]);

  const [aiObjective, setAiObjective] = useState("");
  const [aiProduct, setAiProduct] = useState("");
  const [aiGeography, setAiGeography] = useState("India");
  const [aiMonthlyBudget, setAiMonthlyBudget] = useState("15000");
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const aiMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google-ads/ai/campaign-suggestions", {
      objective: aiObjective,
      product: aiProduct,
      targetAudience: "",
      geography: aiGeography,
      monthlyBudget: aiMonthlyBudget,
      campaignType: channelType,
    }),
    onSuccess: (data: any) => {
      setAiSuggestions(data);
      if (data.campaignName && !name) setName(data.campaignName);
      if (data.dailyBudget?.recommended && !dailyBudget) setDailyBudget(String(data.dailyBudget.recommended));
      if (data.biddingStrategy?.recommended) {
        const rec = data.biddingStrategy.recommended;
        const strategies = BIDDING_STRATEGIES[channelType]?.strategies || [];
        if (strategies.some(s => s.value === rec)) {
          setBiddingStrategy(rec);
          if (data.biddingStrategy.targetValue) setTargetValue(String(data.biddingStrategy.targetValue));
        }
      }
      toast({ title: "AI suggestions ready", description: "Recommendations have been applied. Review and adjust as needed." });
    },
    onError: (err: any) => {
      toast({ title: "AI suggestion failed", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const strategy = biddingStrategy;
      const payload: any = {
        name,
        dailyBudget: Number(dailyBudget),
        advertisingChannelType: channelType,
        status: "PAUSED",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      if (channelType === "VIDEO") {
        payload.advertisingChannelSubType = videoSubtype;
        payload.videoBiddingStrategy = strategy;
        if ((strategy === "TARGET_CPV" || strategy === "TARGET_CPM") && targetValue) {
          payload.targetCpv = Number(targetValue);
        }
        if (strategy === "TARGET_CPA" && targetValue) {
          payload.targetCpa = Number(targetValue);
        }
      } else if (channelType === "PERFORMANCE_MAX") {
        if (strategy === "TARGET_ROAS" && targetValue) {
          payload.targetRoas = Number(targetValue);
        }
      } else {
        if (strategy === "TARGET_CPA" && targetValue) {
          payload.targetCpa = Number(targetValue);
        }
        if (strategy === "TARGET_ROAS" && targetValue) {
          payload.targetRoas = Number(targetValue);
        }
      }

      payload.biddingStrategyType = strategy;
      if (selectedLanguages.length > 0) {
        payload.languages = selectedLanguages;
      }
      return apiRequest("POST", "/api/google-ads/campaigns/create", payload);
    },
    onSuccess: () => {
      toast({ title: "Campaign created", description: `"${name}" has been created in paused state.` });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setStep(1); setName(""); setDailyBudget(""); setStartDate(""); setEndDate("");
    setBiddingStrategy("MANUAL_CPC"); setTargetValue(""); setSelectedLanguages(["en"]);
    setAiSuggestions(null); setShowAiPanel(false);
  };

  const strategies = BIDDING_STRATEGIES[channelType]?.strategies || [];
  const selectedStrategy = strategies.find(s => s.value === biddingStrategy);
  const monthlyEstimate = dailyBudget ? (Number(dailyBudget) * 30.4).toFixed(0) : "0";

  const handleChannelChange = (val: string) => {
    setChannelType(val);
    const defaultStrat = BIDDING_STRATEGIES[val]?.strategies[0]?.value || "MANUAL_CPC";
    setBiddingStrategy(defaultStrat);
    setTargetValue("");
    setAiSuggestions(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Campaign
            {step > 1 && <span className="text-sm font-normal text-muted-foreground ml-2">Step {step} of 3</span>}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Choose your campaign type and let AI help you set it up intelligently."}
            {step === 2 && "Configure your bidding strategy - this determines how Google spends your budget."}
            {step === 3 && "Review your campaign settings before creating."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <Label className="text-sm font-medium mb-3 block">What type of campaign do you want?</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(CAMPAIGN_TYPE_INFO).map(([key, info]) => {
                  const Icon = info.icon;
                  return (
                    <div
                      key={key}
                      onClick={() => handleChannelChange(key)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                        channelType === key ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${channelType === key ? "text-blue-600" : "text-gray-500"}`} />
                        <span className="font-medium text-sm">{info.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{info.desc}</p>
                      <p className="text-xs text-blue-600 mt-1 font-medium">{info.best}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {channelType === "VIDEO" && (
              <div>
                <Label className="text-sm font-medium">Video Campaign Goal</Label>
                <Select value={videoSubtype} onValueChange={setVideoSubtype}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIDEO_ACTION">Drive Conversions (Video Action)</SelectItem>
                    <SelectItem value="VIDEO_REACH_TARGET_FREQUENCY">Brand Awareness (Video Reach)</SelectItem>
                    <SelectItem value="VIDEO_OUTSTREAM">Mobile Reach (Outstream)</SelectItem>
                    <SelectItem value="VIDEO_NON_SKIPPABLE">Full Attention (Non-Skippable 15s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Campaign Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thermopac - Heat Exchangers - India" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Daily Budget (INR) *</Label>
                <Input type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="500" className="mt-1" />
                {dailyBudget && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ~INR {Number(monthlyEstimate).toLocaleString()} per month
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Schedule (optional)</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End" />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Target Languages</Label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguages.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          if (selectedLanguages.length > 1) {
                            setSelectedLanguages(selectedLanguages.filter(c => c !== lang.code));
                          }
                        } else {
                          setSelectedLanguages([...selectedLanguages, lang.code]);
                        }
                      }}
                      className={`px-2 py-1 rounded text-xs border transition-all ${
                        isSelected
                          ? "bg-blue-100 text-blue-800 border-blue-300 font-medium"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {lang.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedLanguages.length} language{selectedLanguages.length !== 1 ? "s" : ""} selected. Your ads will show to users with these language preferences.
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAiPanel(!showAiPanel)}
                className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">AI Campaign Assistant</span>
                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-200">GPT-4o</Badge>
                </div>
                <ArrowRight className={`w-4 h-4 text-purple-500 transition-transform ${showAiPanel ? "rotate-90" : ""}`} />
              </button>
              {showAiPanel && (
                <div className="p-3 space-y-3 border-t bg-white">
                  <p className="text-xs text-muted-foreground">Tell me about your campaign goals and I will suggest the best strategy, budget, keywords, and ad copy.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Campaign Objective</Label>
                      <Select value={aiObjective} onValueChange={setAiObjective}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select goal..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Generate qualified leads">Generate Leads</SelectItem>
                          <SelectItem value="Increase brand awareness">Brand Awareness</SelectItem>
                          <SelectItem value="Drive website traffic">Website Traffic</SelectItem>
                          <SelectItem value="Promote specific product">Product Promotion</SelectItem>
                          <SelectItem value="Retarget past visitors">Remarketing</SelectItem>
                          <SelectItem value="Enter new market">New Market Entry</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Product/Service Focus</Label>
                      <Select value={aiProduct} onValueChange={setAiProduct}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select product..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Heat Exchangers">Heat Exchangers</SelectItem>
                          <SelectItem value="Thermic Fluid Heaters">Thermic Fluid Heaters</SelectItem>
                          <SelectItem value="Steam Boilers">Steam Boilers</SelectItem>
                          <SelectItem value="Hot Water Generators">Hot Water Generators</SelectItem>
                          <SelectItem value="Hot Air Generators">Hot Air Generators</SelectItem>
                          <SelectItem value="Waste Heat Recovery Systems">Waste Heat Recovery</SelectItem>
                          <SelectItem value="Re-refining Plants">Re-refining Plants</SelectItem>
                          <SelectItem value="Distillation Skids">Distillation Skids</SelectItem>
                          <SelectItem value="All Products">All Products</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Target Geography</Label>
                      <Input value={aiGeography} onChange={(e) => setAiGeography(e.target.value)} placeholder="India, Middle East" className="mt-1 h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Monthly Budget (INR)</Label>
                      <Input value={aiMonthlyBudget} onChange={(e) => setAiMonthlyBudget(e.target.value)} placeholder="15000" className="mt-1 h-8 text-xs" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => aiMutation.mutate()}
                    disabled={aiMutation.isPending}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    {aiMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing with AI...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Get AI Recommendations</>
                    )}
                  </Button>

                  {aiSuggestions && (
                    <div className="space-y-2 mt-2">
                      {aiSuggestions.biddingStrategy && (
                        <div className="bg-green-50 border border-green-200 rounded p-2">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <div className="text-xs">
                              <p className="font-medium text-green-800">Bidding: {aiSuggestions.biddingStrategy.recommended}</p>
                              <p className="text-green-700">{aiSuggestions.biddingStrategy.reason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {aiSuggestions.dailyBudget && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2">
                          <div className="flex items-start gap-2">
                            <DollarSign className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div className="text-xs">
                              <p className="font-medium text-blue-800">Budget: INR {aiSuggestions.dailyBudget.recommended}/day</p>
                              <p className="text-blue-700">{aiSuggestions.dailyBudget.reason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {aiSuggestions.optimizationTips && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                          <p className="text-xs font-medium text-yellow-800 mb-1">Optimization Tips:</p>
                          <ul className="text-xs text-yellow-700 space-y-0.5">
                            {aiSuggestions.optimizationTips.map((tip: string, i: number) => (
                              <li key={i} className="flex items-start gap-1"><span>-</span> {tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiSuggestions.adGroups && aiSuggestions.adGroups.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded p-2">
                          <p className="text-xs font-medium text-purple-800 mb-1">Suggested Ad Groups ({aiSuggestions.adGroups.length}):</p>
                          <div className="space-y-1">
                            {aiSuggestions.adGroups.map((ag: any, i: number) => (
                              <div key={i} className="text-xs text-purple-700">
                                <span className="font-medium">{ag.name}</span> - {ag.theme}
                                <span className="text-purple-500 ml-1">({ag.keywords?.length || 0} keywords)</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-purple-500 mt-1 italic">You can create these ad groups after the campaign is set up</p>
                        </div>
                      )}
                      {aiSuggestions.scheduleRecommendation && (
                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                          <p className="text-xs"><span className="font-medium">Schedule:</span> {aiSuggestions.scheduleRecommendation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-3 block">How should Google spend your budget?</Label>
              <div className="space-y-2">
                {strategies.map((s) => (
                  <div
                    key={s.value}
                    onClick={() => { setBiddingStrategy(s.value); setTargetValue(""); }}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      biddingStrategy === s.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{s.label}</span>
                      {biddingStrategy === s.value && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Info className="w-3 h-3" /> {s.when}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {selectedStrategy?.needsTarget && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Label className="text-sm font-medium">{selectedStrategy.targetLabel}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder={selectedStrategy.targetPlaceholder}
                  className="mt-1 bg-white"
                />
              </div>
            )}

            {aiSuggestions?.biddingStrategy && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-purple-800">AI Recommendation</span>
                </div>
                <p className="text-xs text-purple-700">{aiSuggestions.biddingStrategy.reason}</p>
                {aiSuggestions.biddingStrategy.recommended !== biddingStrategy && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs h-7 border-purple-300 text-purple-700"
                    onClick={() => {
                      const rec = aiSuggestions.biddingStrategy.recommended;
                      if (strategies.some(s => s.value === rec)) {
                        setBiddingStrategy(rec);
                        if (aiSuggestions.biddingStrategy.targetValue) setTargetValue(String(aiSuggestions.biddingStrategy.targetValue));
                      }
                    }}
                  >
                    <Sparkles className="w-3 h-3 mr-1" /> Apply AI suggestion: {aiSuggestions.biddingStrategy.recommended}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Card className="bg-gray-50">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-medium text-sm">Campaign Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Campaign Name</p>
                    <p className="font-medium">{name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium">{CAMPAIGN_TYPE_INFO[channelType]?.label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Daily Budget</p>
                    <p className="font-medium">INR {Number(dailyBudget).toLocaleString()}/day (~INR {Number(monthlyEstimate).toLocaleString()}/mo)</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bidding Strategy</p>
                    <p className="font-medium">{selectedStrategy?.label || biddingStrategy}</p>
                  </div>
                  {targetValue && (
                    <div>
                      <p className="text-xs text-muted-foreground">{selectedStrategy?.targetLabel}</p>
                      <p className="font-medium">INR {targetValue}</p>
                    </div>
                  )}
                  {channelType === "VIDEO" && (
                    <div>
                      <p className="text-xs text-muted-foreground">Video Subtype</p>
                      <p className="font-medium">{videoSubtype.replace(/_/g, ' ')}</p>
                    </div>
                  )}
                  {startDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Schedule</p>
                      <p className="font-medium">{startDate} {endDate ? `to ${endDate}` : "onwards"}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Languages</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {selectedLanguages.map(code => {
                        const lang = AVAILABLE_LANGUAGES.find(l => l.code === code);
                        return <Badge key={code} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{lang?.name || code}</Badge>;
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Initial Status</p>
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">PAUSED</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-800 mb-1">What happens next?</p>
              <ul className="text-xs text-blue-700 space-y-0.5">
                <li>1. Campaign is created in PAUSED state (no money spent)</li>
                <li>2. Create ad groups with themed keywords</li>
                <li>3. Write compelling ads for each ad group</li>
                <li>4. Review everything, then Enable the campaign</li>
              </ul>
            </div>

            {aiSuggestions?.adGroups && aiSuggestions.adGroups.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-purple-800">AI-suggested next steps after creation:</span>
                </div>
                <ul className="text-xs text-purple-700 space-y-0.5">
                  {aiSuggestions.adGroups.map((ag: any, i: number) => (
                    <li key={i}>Create ad group "{ag.name}" with {ag.keywords?.length || 0} keywords</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && (!name || !dailyBudget)}>
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-green-600 hover:bg-green-700">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                Create Campaign
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAdGroupDialog({ open, onOpenChange, campaignId }: { open: boolean; onOpenChange: (v: boolean) => void; campaignId: string }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [cpcBid, setCpcBid] = useState("");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google-ads/ad-groups/create", {
      name,
      campaignId,
      cpcBid: cpcBid ? Number(cpcBid) : undefined,
    }),
    onSuccess: () => {
      toast({ title: "Ad group created", description: `"${name}" has been created.` });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
      onOpenChange(false);
      setName(""); setCpcBid("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create ad group", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Ad Group</DialogTitle>
          <DialogDescription>Add a new ad group to this campaign.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Ad Group Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Heat Exchangers" />
          </div>
          <div>
            <Label>Default CPC Bid (INR)</Label>
            <Input type="number" value={cpcBid} onChange={(e) => setCpcBid(e.target.value)} placeholder="e.g. 10" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Create Ad Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddKeywordsDialog({ open, onOpenChange, adGroupId }: { open: boolean; onOpenChange: (v: boolean) => void; adGroupId: string }) {
  const { toast } = useToast();
  const [keywordsText, setKeywordsText] = useState("");
  const [matchType, setMatchType] = useState("BROAD");

  const addMutation = useMutation({
    mutationFn: () => {
      const keywords = keywordsText.split("\n").map(k => k.trim()).filter(Boolean).map(text => ({ text, matchType }));
      return apiRequest("POST", "/api/google-ads/keywords/add", { adGroupId, keywords });
    },
    onSuccess: (data: any) => {
      toast({ title: "Keywords added", description: `${data.added} keywords added successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
      onOpenChange(false);
      setKeywordsText("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to add keywords", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Keywords</DialogTitle>
          <DialogDescription>Enter one keyword per line.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Match Type</Label>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BROAD">Broad Match</SelectItem>
                <SelectItem value="PHRASE">Phrase Match</SelectItem>
                <SelectItem value="EXACT">Exact Match</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Keywords (one per line) *</Label>
            <Textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"heat exchanger manufacturer\nboiler manufacturer india\nthermic fluid heater"}
              rows={6}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {keywordsText.split("\n").filter(k => k.trim()).length} keywords
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!keywordsText.trim() || addMutation.isPending}>
            {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add Keywords
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddNegativeKeywordsDialog({ open, onOpenChange, campaignId }: { open: boolean; onOpenChange: (v: boolean) => void; campaignId: string }) {
  const { toast } = useToast();
  const [keywordsText, setKeywordsText] = useState("");
  const [matchType, setMatchType] = useState("BROAD");

  const addMutation = useMutation({
    mutationFn: () => {
      const keywords = keywordsText.split("\n").map(k => k.trim()).filter(Boolean).map(text => ({ text, matchType }));
      return apiRequest("POST", "/api/google-ads/negative-keywords/add", { campaignId, keywords });
    },
    onSuccess: (data: any) => {
      toast({ title: "Negative keywords added", description: `${data.added} negative keywords added.` });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
      onOpenChange(false);
      setKeywordsText("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to add negative keywords", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Negative Keywords</DialogTitle>
          <DialogDescription>Block search terms from triggering your ads. One per line.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Match Type</Label>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BROAD">Broad Match</SelectItem>
                <SelectItem value="PHRASE">Phrase Match</SelectItem>
                <SelectItem value="EXACT">Exact Match</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Negative Keywords (one per line) *</Label>
            <Textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={"free\njobs\nrecruit\nsalary"}
              rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!keywordsText.trim() || addMutation.isPending}>
            {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add Negative Keywords
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignLanguagesDialog({ open, onOpenChange, campaignId }: { open: boolean; onOpenChange: (v: boolean) => void; campaignId: string }) {
  const { toast } = useToast();
  const [langs, setLangs] = useState<string[]>(["en"]);
  const [initialized, setInitialized] = useState(false);

  const currentLangs = useQuery({
    queryKey: ["/api/google-ads/campaigns", campaignId, "languages"],
    queryFn: () => apiRequest("GET", `/api/google-ads/campaigns/${campaignId}/languages`),
    enabled: open && !!campaignId,
  });

  const loaded = currentLangs.data as any;

  useEffect(() => {
    if (loaded?.languages?.length > 0 && !initialized) {
      setLangs(loaded.languages);
      setInitialized(true);
    }
  }, [loaded, initialized]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/google-ads/campaigns/${campaignId}/languages`, { languages: langs }),
    onSuccess: () => {
      toast({ title: "Languages updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: "Failed to update languages", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Globe className="w-5 h-5" /> Campaign Languages</DialogTitle>
          <DialogDescription>Select which languages your ads should target. Users with these language preferences will see your ads.</DialogDescription>
        </DialogHeader>
        {currentLangs.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 border rounded-lg">
              {AVAILABLE_LANGUAGES.map((lang) => {
                const isSelected = langs.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        if (langs.length > 1) setLangs(langs.filter(c => c !== lang.code));
                      } else {
                        setLangs([...langs, lang.code]);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded text-xs border transition-all ${
                      isSelected
                        ? "bg-blue-100 text-blue-800 border-blue-300 font-medium"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {lang.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{langs.length} language{langs.length !== 1 ? "s" : ""} selected</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || langs.length === 0}>
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Languages
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAdDialog({ open, onOpenChange, adGroupId }: { open: boolean; onOpenChange: (v: boolean) => void; adGroupId: string }) {
  const { toast } = useToast();
  const [headlines, setHeadlines] = useState(["", "", ""]);
  const [descriptions, setDescriptions] = useState(["", ""]);
  const [finalUrl, setFinalUrl] = useState("https://thermopac.in");
  const [path1, setPath1] = useState("");
  const [path2, setPath2] = useState("");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/google-ads/ads/create", {
      adGroupId,
      headlines: headlines.filter(h => h.trim()),
      descriptions: descriptions.filter(d => d.trim()),
      finalUrl,
      path1: path1 || undefined,
      path2: path2 || undefined,
    }),
    onSuccess: () => {
      toast({ title: "Ad created", description: "Responsive search ad created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create ad", description: err.message, variant: "destructive" });
    },
  });

  const updateHeadline = (idx: number, val: string) => {
    const h = [...headlines]; h[idx] = val; setHeadlines(h);
  };
  const updateDescription = (idx: number, val: string) => {
    const d = [...descriptions]; d[idx] = val; setDescriptions(d);
  };

  const validHeadlines = headlines.filter(h => h.trim()).length;
  const validDescriptions = descriptions.filter(d => d.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Responsive Search Ad</DialogTitle>
          <DialogDescription>Minimum 3 headlines (max 30 chars each) and 2 descriptions (max 90 chars each).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Final URL *</Label>
            <Input value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)} placeholder="https://thermopac.in" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Display Path 1</Label>
              <Input value={path1} onChange={(e) => setPath1(e.target.value)} placeholder="products" maxLength={15} />
            </div>
            <div>
              <Label>Display Path 2</Label>
              <Input value={path2} onChange={(e) => setPath2(e.target.value)} placeholder="boilers" maxLength={15} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Headlines ({validHeadlines}/15, min 3)</Label>
              {headlines.length < 15 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setHeadlines([...headlines, ""])}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {headlines.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={h} onChange={(e) => updateHeadline(i, e.target.value)} placeholder={`Headline ${i + 1}`} maxLength={30} />
                  <span className="text-xs text-muted-foreground self-center w-8">{h.length}/30</span>
                  {i >= 3 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setHeadlines(headlines.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Descriptions ({validDescriptions}/4, min 2)</Label>
              {descriptions.length < 4 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDescriptions([...descriptions, ""])}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {descriptions.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={d} onChange={(e) => updateDescription(i, e.target.value)} placeholder={`Description ${i + 1}`} maxLength={90} />
                  <span className="text-xs text-muted-foreground self-center w-8">{d.length}/90</span>
                  {i >= 2 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDescriptions(descriptions.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {finalUrl && validHeadlines >= 3 && validDescriptions >= 2 && (
            <Card className="bg-gray-50">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Ad Preview</p>
                <p className="text-blue-700 font-medium text-sm">{headlines.filter(h => h.trim()).slice(0, 3).join(" | ")}</p>
                <p className="text-green-700 text-xs">{finalUrl}{path1 ? `/${path1}` : ""}{path2 ? `/${path2}` : ""}</p>
                <p className="text-sm text-gray-600 mt-1">{descriptions.filter(d => d.trim())[0]}</p>
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={validHeadlines < 3 || validDescriptions < 2 || !finalUrl || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Create Ad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignsTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [showCreateAdGroup, setShowCreateAdGroup] = useState(false);
  const [showAddKeywords, setShowAddKeywords] = useState<string | null>(null);
  const [showCreateAd, setShowCreateAd] = useState<string | null>(null);
  const [showNegativeKeywords, setShowNegativeKeywords] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);

  const campaigns = useQuery({
    queryKey: ["/api/google-ads/campaigns", dateRange.startDate, dateRange.endDate],
    queryFn: () => apiRequest("GET", `/api/google-ads/campaigns?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
  });

  const campaignDetails = useQuery({
    queryKey: ["/api/google-ads/campaigns", selectedCampaign, "details"],
    queryFn: () => apiRequest("GET", `/api/google-ads/campaigns/${selectedCampaign}/details`),
    enabled: !!selectedCampaign,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("POST", `/api/google-ads/campaigns/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Campaign updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const adGroupStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("POST", `/api/google-ads/ad-groups/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Ad group updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads"] });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  if (selectedCampaign) {
    const details = campaignDetails.data as any;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedCampaign(null)} className="flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Back to Campaigns
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowCreateAdGroup(true)}>
              <Plus className="w-4 h-4 mr-1" /> Ad Group
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNegativeKeywords(true)}>
              <XCircle className="w-4 h-4 mr-1" /> Negative Keywords
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowLanguages(true)}>
              <Globe className="w-4 h-4 mr-1" /> Languages
            </Button>
          </div>
        </div>

        {campaignDetails.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{details?.campaign?.name || "Campaign"}</CardTitle>
                  <div className="flex gap-2">
                    {details?.campaign?.status === "PAUSED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600"
                        onClick={() => statusMutation.mutate({ id: selectedCampaign, status: "ENABLED" })}
                        disabled={statusMutation.isPending}
                      >
                        <Play className="w-3 h-3 mr-1" /> Enable
                      </Button>
                    )}
                    {details?.campaign?.status === "ENABLED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-yellow-600"
                        onClick={() => statusMutation.mutate({ id: selectedCampaign, status: "PAUSED" })}
                        disabled={statusMutation.isPending}
                      >
                        <Pause className="w-3 h-3 mr-1" /> Pause
                      </Button>
                    )}
                  </div>
                </div>
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
                <CardHeader>
                  <CardTitle className="text-sm">Ad Groups ({details.adGroups.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">CPC Bid</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.adGroups.map((ag: any) => (
                        <TableRow key={ag.google_ad_group_id}>
                          <TableCell className="font-medium">{ag.name}</TableCell>
                          <TableCell><StatusBadge status={ag.status} /></TableCell>
                          <TableCell>{ag.type}</TableCell>
                          <TableCell className="text-right">{ag.cpc_bid_micros ? formatCurrency(Number(ag.cpc_bid_micros) / 1000000) : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {ag.status === "PAUSED" && (
                                <Button size="sm" variant="ghost" onClick={() => adGroupStatusMutation.mutate({ id: ag.google_ad_group_id, status: "ENABLED" })}>
                                  <Play className="w-3 h-3 text-green-600" />
                                </Button>
                              )}
                              {ag.status === "ENABLED" && (
                                <Button size="sm" variant="ghost" onClick={() => adGroupStatusMutation.mutate({ id: ag.google_ad_group_id, status: "PAUSED" })}>
                                  <Pause className="w-3 h-3 text-yellow-600" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => setShowAddKeywords(ag.google_ad_group_id)}>
                                <Plus className="w-3 h-3 mr-1" /> Keywords
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setShowCreateAd(ag.google_ad_group_id)}>
                                <FileText className="w-3 h-3 mr-1" /> Ad
                              </Button>
                            </div>
                          </TableCell>
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

        <CreateAdGroupDialog open={showCreateAdGroup} onOpenChange={setShowCreateAdGroup} campaignId={selectedCampaign} />
        {showAddKeywords && <AddKeywordsDialog open={!!showAddKeywords} onOpenChange={() => setShowAddKeywords(null)} adGroupId={showAddKeywords} />}
        {showCreateAd && <CreateAdDialog open={!!showCreateAd} onOpenChange={() => setShowCreateAd(null)} adGroupId={showCreateAd} />}
        <AddNegativeKeywordsDialog open={showNegativeKeywords} onOpenChange={setShowNegativeKeywords} campaignId={selectedCampaign} />
        <CampaignLanguagesDialog open={showLanguages} onOpenChange={setShowLanguages} campaignId={selectedCampaign} />
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
            <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-muted-foreground mt-1">Create your first campaign or sync existing ones from Google Ads.</p>
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignList.map((c: any) => (
                  <TableRow key={c.googleCampaignId} className="cursor-pointer hover:bg-muted/50">
                    <TableCell
                      className="font-medium max-w-[200px] truncate"
                      onClick={() => setSelectedCampaign(c.googleCampaignId)}
                    >{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-xs">{c.advertisingChannelType || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.budgetAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(c.spend)}</TableCell>
                    <TableCell className="text-right">{formatNumber(c.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right">{c.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.avgCpc)}</TableCell>
                    <TableCell className="text-right">{c.conversions}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {c.status === "PAUSED" && (
                          <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: c.googleCampaignId, status: "ENABLED" })}>
                            <Play className="w-3 h-3 text-green-600" />
                          </Button>
                        )}
                        {c.status === "ENABLED" && (
                          <Button size="sm" variant="ghost" onClick={() => statusMutation.mutate({ id: c.googleCampaignId, status: "PAUSED" })}>
                            <Pause className="w-3 h-3 text-yellow-600" />
                          </Button>
                        )}
                      </div>
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
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
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

  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const runDiagnostic = async () => {
    setDiagnosticLoading(true);
    setDiagnosticResult(null);
    try {
      const result = await apiRequest("GET", "/api/google-ads/diagnostic");
      setDiagnosticResult(result);
    } catch (err: any) {
      setDiagnosticResult({ error: err.message });
    } finally {
      setDiagnosticLoading(false);
    }
  };

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
          <div className="flex items-center gap-3 flex-wrap justify-end">
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
              onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </Button>

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

            <Button
              variant="ghost"
              size="sm"
              onClick={runDiagnostic}
              disabled={diagnosticLoading}
              className="flex items-center gap-2 text-xs"
            >
              {diagnosticLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Settings className="w-3 h-3" />
              )}
              Diagnose
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const a = document.createElement('a');
                a.href = '/api/google-ads/design-doc';
                a.download = 'Google_Ads_API_Design_Document.doc';
                a.click();
              }}
              className="flex items-center gap-2 text-xs"
            >
              <BarChart2 className="w-3 h-3" />
              Design Doc
            </Button>
          </div>
        )}
      </div>

      {diagnosticResult && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">API Diagnostic Results</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setDiagnosticResult(null)} className="text-xs h-6">Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96 whitespace-pre-wrap">
              {JSON.stringify(diagnosticResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

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

      <CreateCampaignDialog open={showCreateCampaign} onOpenChange={setShowCreateCampaign} />

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
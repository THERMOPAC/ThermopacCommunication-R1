import { useState } from "react";
import Layout from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radar, Globe, Building2, Search, AlertTriangle, Users, FileText, MapPin,
  TrendingUp, Download, ExternalLink, Star, Zap, Eye, CheckCircle, Clock,
  Bell, Target, Activity, BarChart3, Loader2, RefreshCw, ArrowUpRight,
  Shield, Flame, AlertCircle, Info, ChevronRight, Play, X, Trash2
} from "lucide-react";

function getScoreBandColor(band: string) {
  switch (band) {
    case 'hot': return 'bg-red-100 text-red-800 border-red-300';
    case 'strong': return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'qualified': return 'bg-green-100 text-green-800 border-green-300';
    case 'watchlist': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    default: return 'bg-gray-100 text-gray-600 border-gray-300';
  }
}

function getScoreBandIcon(band: string) {
  switch (band) {
    case 'hot': return <Flame className="h-3 w-3" />;
    case 'strong': return <Zap className="h-3 w-3" />;
    case 'qualified': return <CheckCircle className="h-3 w-3" />;
    case 'watchlist': return <Eye className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
}

function getCompanyTypeBadge(type: string) {
  const colors: Record<string, string> = {
    used_oil_collector: 'bg-blue-100 text-blue-800',
    waste_oil_recycler: 'bg-green-100 text-green-800',
    re_refiner: 'bg-purple-100 text-purple-800',
    waste_management_company: 'bg-teal-100 text-teal-800',
    lubricant_company: 'bg-amber-100 text-amber-800',
    base_oil_company: 'bg-indigo-100 text-indigo-800',
    industrial_recycler: 'bg-cyan-100 text-cyan-800',
    hazardous_waste_company: 'bg-red-100 text-red-800',
    trader_only: 'bg-gray-100 text-gray-800',
    unclear: 'bg-gray-100 text-gray-500',
  };
  return colors[type] || 'bg-gray-100 text-gray-600';
}

function getAlertPriorityColor(priority: string) {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-800';
    case 'high': return 'bg-orange-100 text-orange-800';
    case 'watch': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-blue-100 text-blue-800';
  }
}

function getPriorityBadge(priority: string) {
  const colors: Record<string, string> = {
    priority: 'bg-red-100 text-red-800',
    active: 'bg-green-100 text-green-800',
    watchlist: 'bg-yellow-100 text-yellow-800',
    paused: 'bg-gray-100 text-gray-500',
  };
  return colors[priority] || 'bg-gray-100 text-gray-600';
}

function formatCompanyType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function RadarPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companyDetailOpen, setCompanyDetailOpen] = useState(false);
  const [companyFilters, setCompanyFilters] = useState({ country: '', companyType: '', scoreBand: '', search: '', minScore: '' });
  const [discoveryCountry, setDiscoveryCountry] = useState('');

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['/api/radar/overview'],
  });

  const companiesQueryKey = `/api/radar/companies?${new URLSearchParams(
    Object.fromEntries(Object.entries(companyFilters).filter(([_, v]) => v))
  ).toString()}`;
  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: [companiesQueryKey],
    enabled: activeTab === 'companies',
  });

  const { data: companyDetail, isLoading: detailLoading } = useQuery({
    queryKey: [`/api/radar/companies/${selectedCompanyId}`],
    enabled: !!selectedCompanyId && companyDetailOpen,
  });

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/radar/projects'],
    enabled: activeTab === 'projects',
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['/api/radar/contacts'],
    enabled: activeTab === 'contacts',
  });

  const { data: countriesData, isLoading: countriesLoading } = useQuery({
    queryKey: ['/api/radar/countries'],
    enabled: activeTab === 'countries' || activeTab === 'discovery' || activeTab === 'overview',
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/radar/alerts'],
    enabled: activeTab === 'alerts' || activeTab === 'overview',
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['/api/radar/discovery/jobs'],
    enabled: activeTab === 'discovery',
  });

  const discoveryMutation = useMutation({
    mutationFn: async (data: { country: string; isoCode: string }) => {
      return apiRequest('POST', '/api/radar/discovery/start', data);
    },
    onSuccess: () => {
      toast({ title: "Discovery Started", description: "Country discovery job is running in the background" });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/discovery/jobs'] });
    },
    onError: (error: any) => {
      toast({ title: "Discovery Failed", description: error.message, variant: "destructive" });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (companyId: number) => {
      return apiRequest('POST', `/api/radar/companies/${companyId}/promote`);
    },
    onSuccess: (data: any) => {
      toast({ title: "Promoted to CRM", description: "Company added to leads for follow-up" });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/companies'] });
      setCompanyDetailOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Promotion Failed", description: error.message, variant: "destructive" });
    },
  });

  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: number) => {
      return apiRequest('PUT', `/api/radar/alerts/${alertId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/radar/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/overview'] });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ isoCode, priority }: { isoCode: string; priority: string }) => {
      return apiRequest('PUT', `/api/radar/countries/${isoCode}/priority`, { priority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/radar/countries'] });
      toast({ title: "Priority Updated" });
    },
  });

  const [cleanConfirmOpen, setCleanConfirmOpen] = useState(false);
  const cleanAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/radar/clean-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/radar/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/companies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/countries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/radar/discovery/jobs'] });
      setCleanConfirmOpen(false);
      toast({ title: "All Data Cleaned", description: "All radar discovery data has been wiped." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleExport = async (type: string) => {
    try {
      const response = await fetch(`/api/radar/export/${type}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `radar_${type}_export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Export Complete" });
    } catch {
      toast({ title: "Export Failed", variant: "destructive" });
    }
  };

  const overview = (overviewData as any);
  const stats = overview?.stats || {};
  const companies = (((companiesData as any)?.companies) || []).filter((c: any) => (Number(c.overall_confidence) || 0) >= 0.7);
  const projects = ((projectsData as any)?.projects) || [];
  const contacts = ((contactsData as any)?.contacts) || [];
  const countries = ((countriesData as any)?.countries) || [];
  const alerts = ((alertsData as any)?.alerts) || [];
  const jobs = ((jobsData as any)?.jobs) || [];
  const detail = companyDetail as any;

  const startDiscovery = (country: string, isoCode: string) => {
    discoveryMutation.mutate({ country, isoCode });
  };

  return (
    <Layout>
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg">
            <Radar className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Global Re-Refining Opportunity Radar</h1>
            <p className="text-sm text-muted-foreground">Waste Oil Recycler Discovery and Intelligence System</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/radar'] });
          }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-8 w-full">
          <TabsTrigger value="overview" className="text-xs"><BarChart3 className="h-3 w-3 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="companies" className="text-xs"><Building2 className="h-3 w-3 mr-1" />Companies</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs"><Target className="h-3 w-3 mr-1" />Projects</TabsTrigger>
          <TabsTrigger value="countries" className="text-xs"><Globe className="h-3 w-3 mr-1" />Countries</TabsTrigger>
          <TabsTrigger value="contacts" className="text-xs"><Users className="h-3 w-3 mr-1" />Contacts</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs"><Bell className="h-3 w-3 mr-1" />Alerts{stats.pendingAlerts > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{stats.pendingAlerts}</Badge>}</TabsTrigger>
          <TabsTrigger value="discovery" className="text-xs"><Search className="h-3 w-3 mr-1" />Discovery</TabsTrigger>
          <TabsTrigger value="admin" className="text-xs"><Shield className="h-3 w-3 mr-1" />Admin</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          {overviewLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <span className="text-xs text-muted-foreground">Total Companies</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.relevantCompanies || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Flame className="h-4 w-4 text-red-600" />
                      <span className="text-xs text-muted-foreground">Hot Opportunities</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{stats.hotOpportunities || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-orange-600" />
                      <span className="text-xs text-muted-foreground">Strong</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600">{stats.strongOpportunities || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-green-600" />
                      <span className="text-xs text-muted-foreground">Projects</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{stats.totalProjects || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-purple-600" />
                      <span className="text-xs text-muted-foreground">Contacts</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.totalContacts || 0}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4" />Top Countries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(overview?.topCountries || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No country data yet. Start a discovery job.</p>
                    ) : (
                      <div className="space-y-2">
                        {(overview?.topCountries || []).slice(0, 8).map((c: any, i: number) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{c.country}</span>
                              <Badge variant="outline" className={`text-[10px] ${getPriorityBadge(c.priority)}`}>{c.priority}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{c.relevant_company_count} companies</span>
                              <span>{c.project_count} projects</span>
                              <Badge className={getScoreBandColor(getScoreBandFromScore(Number(c.opportunity_score)))}>{c.opportunity_score}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" />Recent Alerts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(overview?.recentAlerts || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No alerts yet.</p>
                    ) : (
                      <ScrollArea className="h-[250px]">
                        <div className="space-y-2">
                          {(overview?.recentAlerts || []).map((a: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded-md border bg-card">
                              <Badge className={`${getAlertPriorityColor(a.priority)} text-[10px] mt-0.5`}>{a.priority}</Badge>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{a.title}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{a.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />Score Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(overview?.scoreBands || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No scored companies yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {['hot', 'strong', 'qualified', 'watchlist', 'low'].map(band => {
                          const data = (overview?.scoreBands || []).find((s: any) => s.score_band === band);
                          const count = Number(data?.count) || 0;
                          const total = stats.relevantCompanies || 1;
                          return (
                            <div key={band} className="flex items-center gap-3">
                              <Badge className={`${getScoreBandColor(band)} w-20 justify-center text-[10px]`}>
                                {getScoreBandIcon(band)} <span className="ml-1">{band}</span>
                              </Badge>
                              <Progress value={(count / total) * 100} className="flex-1 h-2" />
                              <span className="text-sm font-medium w-8 text-right">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Company Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(overview?.companyTypes || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No classified companies yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {(overview?.companyTypes || []).slice(0, 8).map((t: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <Badge className={`${getCompanyTypeBadge(t.company_type)} text-[10px]`}>
                              {formatCompanyType(t.company_type)}
                            </Badge>
                            <span className="text-sm font-medium">{t.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* COMPANIES TAB */}
        <TabsContent value="companies" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input placeholder="Search companies..." className="w-60" value={companyFilters.search}
              onChange={e => setCompanyFilters(f => ({ ...f, search: e.target.value }))} />
            <Select value={companyFilters.scoreBand} onValueChange={v => setCompanyFilters(f => ({ ...f, scoreBand: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Score Band" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bands</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="strong">Strong</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="watchlist">Watchlist</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={companyFilters.companyType} onValueChange={v => setCompanyFilters(f => ({ ...f, companyType: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Company Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {COMPANY_TYPES.filter(t => t !== 'not_relevant').map(t => (
                  <SelectItem key={t} value={t}>{formatCompanyType(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={companyFilters.country} onValueChange={v => setCompanyFilters(f => ({ ...f, country: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map((c: any) => (
                  <SelectItem key={c.iso_code} value={c.iso_code}>{c.country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={companyFilters.minScore} onValueChange={v => setCompanyFilters(f => ({ ...f, minScore: v === 'default' ? '' : v }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Min Score: 35" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Score 35+ (Default)</SelectItem>
                <SelectItem value="50">Score 50+ (Quality)</SelectItem>
                <SelectItem value="60">Score 60+ (Strong)</SelectItem>
                <SelectItem value="70">Score 70+ (Hot)</SelectItem>
                <SelectItem value="0">Show All</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport('companies')}>
                <Download className="h-4 w-4 mr-1" />Export CSV
              </Button>
            </div>
          </div>

          {companiesLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : companies.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No companies found. Start a discovery job to find companies.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead className="text-center">Confidence</TableHead>
                    <TableHead className="text-center">Contacts</TableHead>
                    <TableHead className="text-center">Projects</TableHead>
                    <TableHead>Indicators</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c: any) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => { setSelectedCompanyId(c.id); setCompanyDetailOpen(true); }}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{c.canonical_name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.root_domain}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getCompanyTypeBadge(c.company_type)} text-[10px]`}>
                          {formatCompanyType(c.company_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.country}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${getScoreBandColor(c.score_band)} font-mono`}>
                          {getScoreBandIcon(c.score_band)} <span className="ml-1">{c.opportunity_score}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{Math.round(c.overall_confidence * 100)}%</TableCell>
                      <TableCell className="text-center text-sm">{c.contact_count}</TableCell>
                      <TableCell className="text-center text-sm">{c.project_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {c.handles_waste_oil && <Badge variant="outline" className="text-[9px] px-1">Oil</Badge>}
                          {c.is_likely_epc_target && <Badge variant="outline" className="text-[9px] px-1 border-red-300 text-red-700">EPC</Badge>}
                          {c.is_plant_opportunity && <Badge variant="outline" className="text-[9px] px-1 border-green-300 text-green-700">Plant</Badge>}
                          {c.promoted_to_crm && <Badge className="text-[9px] px-1 bg-blue-100 text-blue-800">CRM</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* PROJECTS TAB */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Target className="h-5 w-5" />Project Signals</h2>
            <Button variant="outline" size="sm" onClick={() => handleExport('projects')}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
          </div>
          {projectsLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : projects.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No project signals detected yet.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">{p.project_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{p.project_type?.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="text-sm">{p.company_name}</TableCell>
                      <TableCell className="text-sm">{p.country}</TableCell>
                      <TableCell>
                        <Badge className={p.urgency === 'high' || p.urgency === 'critical' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'} variant="outline">
                          {p.urgency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{Math.round(Number(p.project_confidence) * 100)}%</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{p.evidence_text}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* COUNTRIES TAB */}
        <TabsContent value="countries" className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Globe className="h-5 w-5" />Country Intelligence</h2>
          {countriesLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>ISO</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-center">Companies</TableHead>
                    <TableHead className="text-center">Projects</TableHead>
                    <TableHead className="text-center">Hot</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countries.map((c: any) => (
                    <TableRow key={c.iso_code}>
                      <TableCell className="font-medium">{c.country}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.iso_code}</TableCell>
                      <TableCell>
                        <Select defaultValue={c.priority} onValueChange={v => updatePriorityMutation.mutate({ isoCode: c.iso_code, priority: v })}>
                          <SelectTrigger className="h-7 w-24 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="priority">Priority</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="watchlist">Watchlist</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">{c.relevant_company_count || 0}</TableCell>
                      <TableCell className="text-center">{c.project_count || 0}</TableCell>
                      <TableCell className="text-center">{c.hot_opportunity_count || 0}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={getScoreBandColor(getScoreBandFromScore(Number(c.opportunity_score)))}>{Number(c.opportunity_score) || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        {c.trend_direction === 'up' ? <TrendingUp className="h-4 w-4 text-green-600" /> :
                         c.trend_direction === 'down' ? <TrendingUp className="h-4 w-4 text-red-600 rotate-180" /> :
                         <span className="text-xs text-muted-foreground">--</span>}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          disabled={discoveryMutation.isPending}
                          onClick={() => startDiscovery(c.country, c.iso_code)}>
                          <Play className="h-3 w-3 mr-1" />Discover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* CONTACTS TAB */}
        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5" />Extracted Contacts</h2>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">{contacts.length} contacts from qualified companies (score 35+)</span>
              <Button variant="outline" size="sm" onClick={() => handleExport('contacts')}>
                <Download className="h-4 w-4 mr-1" />Export
              </Button>
            </div>
          </div>
          {contactsLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : contacts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No contacts extracted yet.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Contact Type</TableHead>
                    <TableHead>Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-medium">{c.company_name || '--'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${Number(c.company_score) >= 70 ? 'bg-red-100 text-red-700' : Number(c.company_score) >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {Math.round(Number(c.company_score))}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{formatCompanyType(c.company_type)}</Badge></TableCell>
                      <TableCell className="text-sm text-blue-600">{c.email || '--'}</TableCell>
                      <TableCell className="text-sm">{c.phone || '--'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{c.contact_type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.country || '--'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ALERTS TAB */}
        <TabsContent value="alerts" className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bell className="h-5 w-5" />Alert Queue</h2>
          {alertsLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : alerts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No alerts.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((a: any) => (
                <Card key={a.id} className={a.status === 'dismissed' ? 'opacity-50' : ''}>
                  <CardContent className="py-3 flex items-start gap-3">
                    <Badge className={`${getAlertPriorityColor(a.priority)} mt-0.5`}>{a.priority}</Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                      {a.company_name && <p className="text-xs mt-1"><Building2 className="h-3 w-3 inline mr-1" />{a.company_name}</p>}
                      {a.country && <p className="text-xs"><MapPin className="h-3 w-3 inline mr-1" />{a.country}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {a.source_url && (
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => window.open(a.source_url, '_blank')}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                      {a.status === 'new' && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => dismissAlertMutation.mutate(a.id)}>
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* DISCOVERY TAB */}
        <TabsContent value="discovery" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4" />Start Country Discovery</CardTitle>
                <CardDescription className="text-xs">Select a country to run multilingual search queries and discover companies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={discoveryCountry} onValueChange={setDiscoveryCountry}>
                  <SelectTrigger><SelectValue placeholder="Select Country" /></SelectTrigger>
                  <SelectContent>
                    {countries.filter((c: any) => c.priority !== 'paused').map((c: any) => (
                      <SelectItem key={c.iso_code} value={`${c.country}|${c.iso_code}`}>
                        <span className="flex items-center gap-2">
                          {c.country}
                          <Badge className={`${getPriorityBadge(c.priority)} text-[9px]`}>{c.priority}</Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="w-full" disabled={!discoveryCountry || discoveryMutation.isPending}
                  onClick={() => {
                    const [country, iso] = discoveryCountry.split('|');
                    startDiscovery(country, iso);
                  }}>
                  {discoveryMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
                  ) : (
                    <><Play className="h-4 w-4 mr-2" />Start Discovery</>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Discovery Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Each country discovery runs multilingual search queries across multiple themes:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Company Discovery (English + local language)</li>
                    <li>Recycler Discovery queries</li>
                    <li>Project Signal queries (tenders, permits, expansions)</li>
                  </ul>
                  <p className="mt-2">For each result, the system:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Crawls key website pages (homepage, about, contact, services, products)</li>
                    <li>Extracts emails, phones, and company details</li>
                    <li>Classifies the company using AI (GPT-4o)</li>
                    <li>Detects project signals (tenders, permits, expansions)</li>
                    <li>Calculates opportunity score (0-100)</li>
                    <li>Deduplicates across domains and names</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Search Jobs History</CardTitle>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No discovery jobs yet.</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Country</TableHead>
                        <TableHead>Language</TableHead>
                        <TableHead>Query</TableHead>
                        <TableHead>Family</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Results</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j: any) => (
                        <TableRow key={j.id}>
                          <TableCell className="text-sm">{j.country}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{j.language}</Badge></TableCell>
                          <TableCell className="text-xs max-w-[250px] truncate">{j.query}</TableCell>
                          <TableCell className="text-xs">{j.query_family}</TableCell>
                          <TableCell>
                            <Badge className={j.status === 'completed' ? 'bg-green-100 text-green-800' :
                              j.status === 'running' ? 'bg-blue-100 text-blue-800' :
                              j.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'} variant="outline">
                              {j.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{j.results_count || 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {j.completed_at ? new Date(j.completed_at).toLocaleString() : j.started_at ? 'Running...' : '--'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADMIN TAB */}
        <TabsContent value="admin" className="space-y-6">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="h-5 w-5" />Scoring Rules and Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Opportunity Scoring Weights</CardTitle>
                <CardDescription className="text-xs">Weights used to calculate the final opportunity score (0-100)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Feedstock Access', weight: 25, desc: 'Likelihood of waste oil feedstock availability' },
                    { label: 'Capital Capability', weight: 20, desc: 'Financial capacity for investment' },
                    { label: 'Strategic Fit', weight: 20, desc: 'Alignment with THERMOPAC offerings' },
                    { label: 'Project Signal Strength', weight: 20, desc: 'Active tenders, permits, or expansion signals' },
                    { label: 'Geography', weight: 10, desc: 'Country priority and market attractiveness' },
                    { label: 'Contactability', weight: 5, desc: 'Availability of contact information' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                      <Badge variant="outline" className="font-mono">{item.weight}%</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Score Bands</CardTitle>
                <CardDescription className="text-xs">How scores are categorized into opportunity bands</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { band: 'hot', range: '90-100', desc: 'Immediate action required' },
                    { band: 'strong', range: '75-89', desc: 'High-priority opportunity' },
                    { band: 'qualified', range: '60-74', desc: 'Worth pursuing' },
                    { band: 'watchlist', range: '40-59', desc: 'Monitor for changes' },
                    { band: 'low', range: '0-39', desc: 'Low relevance or insufficient data' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <Badge className={`${getScoreBandColor(item.band)} w-24 justify-center`}>
                          {getScoreBandIcon(item.band)} <span className="ml-1">{item.band}</span>
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.desc}</span>
                      </div>
                      <span className="text-sm font-mono">{item.range}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Company Classification Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_TYPES.map(t => (
                    <Badge key={t} className={`${getCompanyTypeBadge(t)} text-[10px]`}>{formatCompanyType(t)}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Alert Triggers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 p-2 border rounded">
                    <Badge className="bg-red-100 text-red-800 text-[10px]">critical</Badge>
                    <span>Company score crosses 90 (hot opportunity)</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 border rounded">
                    <Badge className="bg-orange-100 text-orange-800 text-[10px]">high</Badge>
                    <span>Company score crosses 75 (strong opportunity)</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 border rounded">
                    <Badge className="bg-orange-100 text-orange-800 text-[10px]">high</Badge>
                    <span>New project signal detected with high confidence</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 border rounded">
                    <Badge className="bg-blue-100 text-blue-800 text-[10px]">info</Badge>
                    <span>Country discovery completed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200 md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-red-700"><Trash2 className="h-4 w-4" />Clean All Data (Testing)</CardTitle>
                <CardDescription className="text-xs">Wipe all discovered companies, contacts, projects, alerts, search jobs and results. Use this to start fresh during testing.</CardDescription>
              </CardHeader>
              <CardContent>
                {!cleanConfirmOpen ? (
                  <Button variant="destructive" size="sm" onClick={() => setCleanConfirmOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />Clean All Radar Data
                  </Button>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-red-50 rounded border border-red-200">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <span className="text-sm text-red-800 font-medium">This will permanently delete all radar data. Are you sure?</span>
                    <div className="flex gap-2 ml-auto">
                      <Button variant="outline" size="sm" onClick={() => setCleanConfirmOpen(false)}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={() => cleanAllMutation.mutate()} disabled={cleanAllMutation.isPending}>
                        {cleanAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Yes, Delete Everything
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* COMPANY DETAIL DIALOG */}
      <Dialog open={companyDetailOpen} onOpenChange={setCompanyDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : detail?.company ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl">{detail.company.canonical_name}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                      <Badge className={getCompanyTypeBadge(detail.company.company_type)}>
                        {formatCompanyType(detail.company.company_type)}
                      </Badge>
                      <Badge className={getScoreBandColor(detail.company.score_band)}>
                        {getScoreBandIcon(detail.company.score_band)} Score: {detail.company.opportunity_score}
                      </Badge>
                      <span className="text-sm">{detail.company.country}</span>
                    </DialogDescription>
                  </div>
                  {!detail.company.promoted_to_crm && detail.company.company_type !== 'not_relevant' && (
                    <Button onClick={() => promoteMutation.mutate(detail.company.id)}
                      disabled={promoteMutation.isPending}>
                      {promoteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpRight className="h-4 w-4 mr-2" />}
                      Promote to CRM
                    </Button>
                  )}
                  {detail.company.promoted_to_crm && (
                    <Badge className="bg-blue-100 text-blue-800">Already in CRM</Badge>
                  )}
                </div>
              </DialogHeader>

              <Separator />

              <div className="space-y-6">
                {detail.company.company_summary && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Summary</h3>
                    <p className="text-sm text-muted-foreground">{detail.company.company_summary}</p>
                  </div>
                )}

                {detail.company.evidence_summary && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Evidence</h3>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">{detail.company.evidence_summary}</p>
                  </div>
                )}

                {detail.company.ai_reasoning_summary && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Score Reasoning</h3>
                    <p className="text-sm text-muted-foreground">{detail.company.ai_reasoning_summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 border rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Waste Oil</p>
                    <p className="text-lg font-bold">{detail.company.handles_waste_oil ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="p-3 border rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Plant Opportunity</p>
                    <p className="text-lg font-bold">{detail.company.is_plant_opportunity ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="p-3 border rounded text-center">
                    <p className="text-[10px] text-muted-foreground">EPC Target</p>
                    <p className="text-lg font-bold">{detail.company.is_likely_epc_target ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="p-3 border rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Re-refiner</p>
                    <p className="text-lg font-bold">{detail.company.is_existing_rerefiner ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                {detail.score && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Score Breakdown</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Feedstock', value: detail.score.feedstock_access_score, weight: '25%' },
                        { label: 'Capital', value: detail.score.capital_capability_score, weight: '20%' },
                        { label: 'Strategic Fit', value: detail.score.strategic_fit_score, weight: '20%' },
                        { label: 'Project Signal', value: detail.score.project_signal_score, weight: '20%' },
                        { label: 'Geography', value: detail.score.geography_score, weight: '10%' },
                        { label: 'Contactability', value: detail.score.contactability_score, weight: '5%' },
                      ].map((s, i) => (
                        <div key={i} className="p-2 border rounded">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{s.label}</span><span>{s.weight}</span>
                          </div>
                          <Progress value={Number(s.value)} className="h-1.5" />
                          <p className="text-xs font-medium mt-1 text-right">{Math.round(Number(s.value))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.contacts?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Contacts ({detail.contacts.length})</h3>
                    <div className="space-y-1">
                      {detail.contacts.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-2 border rounded text-sm">
                          {c.email && <span className="text-blue-600">{c.email}</span>}
                          {c.phone && <span>{c.phone}</span>}
                          <Badge variant="outline" className="text-[10px]">{c.contact_type}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.projects?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Project Signals ({detail.projects.length})</h3>
                    <div className="space-y-2">
                      {detail.projects.map((p: any, i: number) => (
                        <div key={i} className="p-3 border rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{p.project_type}</Badge>
                            <Badge className={p.urgency === 'high' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'} variant="outline">{p.urgency}</Badge>
                          </div>
                          <p className="text-sm">{p.project_summary}</p>
                          {p.evidence_text && <p className="text-xs text-muted-foreground mt-1">{p.evidence_text}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.pages?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Crawled Pages ({detail.pages.length})</h3>
                    <div className="space-y-1">
                      {detail.pages.map((p: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-2 border rounded text-xs">
                          <Badge variant="outline" className={p.crawl_status === 'completed' ? 'text-green-600' : 'text-red-600'}>
                            {p.crawl_status}
                          </Badge>
                          {p.page_type === 'news_article' && (
                            <Badge variant="outline" className="text-orange-600 bg-orange-50">Source Article</Badge>
                          )}
                          <span className="truncate flex-1">{p.url}</span>
                          <Badge variant="outline">{p.detected_language}</Badge>
                          <span className="text-muted-foreground">HTTP {p.http_status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.company.website && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Website</h3>
                    <a href={detail.company.website} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      {detail.company.website} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}

const COMPANY_TYPES = [
  'used_oil_collector', 'waste_oil_recycler', 're_refiner', 'waste_management_company',
  'lubricant_company', 'base_oil_company', 'industrial_recycler', 'hazardous_waste_company',
  'trader_only', 'unclear'
];

function getScoreBandFromScore(score: number): string {
  if (score >= 90) return 'hot';
  if (score >= 75) return 'strong';
  if (score >= 60) return 'qualified';
  if (score >= 40) return 'watchlist';
  return 'low';
}

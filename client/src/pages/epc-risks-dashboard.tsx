import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Shield, AlertTriangle, AlertCircle, CheckCircle2, Clock, RefreshCw,
  Search, Filter, Activity, BarChart3, ArrowUpDown, ExternalLink,
  Flame, Eye, TrendingDown
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { queryClient } from "@/lib/queryClient";

interface EpcFinding {
  id: number;
  fingerprint: string;
  project_id: number | null;
  project_item_id: number | null;
  finding_code: string;
  agent_key: string;
  status: string;
  severity: string;
  entity_type: string | null;
  entity_id: number | null;
  first_detected_at: string;
  last_detected_at: string;
  last_alerted_at: string | null;
  last_task_created_at: string | null;
  resolved_at: string | null;
  cooldown_hours: number;
  metadata: any;
  project_name: string | null;
  project_item_code: string | null;
  project_item_description: string | null;
  linked_task: {
    id: number;
    title: string;
    status: string;
    assigned_to: number;
    priority: string;
    assignee_name: string;
  } | null;
}

interface DashboardData {
  findings: EpcFinding[];
  counts: {
    total_active: string;
    active_critical: string;
    active_risk: string;
    active_warning: string;
    resolved_7d: string;
    overdue_unresolved: string;
  };
  byAgent: { agent_key: string; status: string; count: string }[];
  byProject: { project_id: number; project_name: string; status: string; severity: string; count: string }[];
  projects: { project_id: number; project_name: string }[];
}

const FINDING_TITLES: Record<string, string> = {
  'EPC-DC3': 'Drawing Approved Not Released',
  'EPC-DC4': 'Released Drawing No BOM',
  'EPC-BC4': 'Empty BOM Released',
  'EPC-PR2': 'Procurement Plan No Execution',
  'EPC-PR3': 'Production Plan No Execution',
  'EPC-PE2': 'Procurement Gate Block Unresolved',
  'EPC-PX2': 'Production Gate Block Unresolved',
  'EPC-PX3': 'Production Ready No WO Prep',
  'EPC-PX4': 'EPC Execution No Shop-Floor WO',
  'EPC-WP2': 'WO Prep Approved No EPC WO',
  'EPC-QP2': 'Inspection Failed No Re-Inspection',
  'EPC-QP4': 'Inspection Failed Execution Not Blocked',
  'EPC-BR1': 'Billing Ready No Invoice',
};

const AGENT_LABELS: Record<string, string> = {
  project_control: 'Project Control',
  production_management: 'Production',
  quality_management: 'Quality',
  finance: 'Finance',
};

const EPC_STAGES: Record<string, string> = {
  'EPC-DC3': 'Drawing Control',
  'EPC-DC4': 'Drawing Control',
  'EPC-BC4': 'BOM Control',
  'EPC-PR2': 'Planning',
  'EPC-PR3': 'Planning',
  'EPC-PE2': 'Procurement Execution',
  'EPC-PX2': 'Production Execution',
  'EPC-PX3': 'Production Execution',
  'EPC-PX4': 'Production Execution',
  'EPC-WP2': 'WO Preparation',
  'EPC-QP2': 'Quality',
  'EPC-QP4': 'Quality',
  'EPC-BR1': 'Billing',
};

function severityBadge(sev: string) {
  switch (sev) {
    case 'critical': return <Badge variant="destructive" className="text-xs">Critical</Badge>;
    case 'risk': return <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs">High</Badge>;
    case 'warning': return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs">Medium</Badge>;
    default: return <Badge variant="secondary" className="text-xs">{sev}</Badge>;
  }
}

function statusBadge(status: string) {
  if (status === 'active') return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Active</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Resolved</Badge>;
}

function taskStatusBadge(status: string) {
  switch (status) {
    case 'completed': return <Badge className="bg-green-100 text-green-700 text-xs">Completed</Badge>;
    case 'pending': return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Pending</Badge>;
    case 'in_progress': return <Badge className="bg-blue-100 text-blue-700 text-xs">In Progress</Badge>;
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor(diffMs / 3600000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EpcRisksDashboard() {
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filterProject !== 'all') p.set('project', filterProject);
    if (filterSeverity !== 'all') p.set('severity', filterSeverity);
    if (filterAgent !== 'all') p.set('agent', filterAgent);
    if (filterStatus !== 'all') p.set('status', filterStatus);
    return p.toString();
  }, [filterProject, filterSeverity, filterAgent, filterStatus]);

  const { data, isLoading, isRefetching, isError, error } = useQuery<DashboardData>({
    queryKey: ['/api/epc-risks/dashboard', queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/epc-risks/dashboard?${queryParams}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      return res.json();
    },
    refetchInterval: 60000,
  });

  const findings = useMemo(() => {
    if (!data?.findings) return [];
    let filtered = data.findings;

    if (filterStage !== 'all') {
      filtered = filtered.filter(f => EPC_STAGES[f.finding_code] === filterStage);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(f =>
        f.finding_code.toLowerCase().includes(q) ||
        (f.project_name || '').toLowerCase().includes(q) ||
        (f.project_item_code || '').toLowerCase().includes(q) ||
        (FINDING_TITLES[f.finding_code] || '').toLowerCase().includes(q) ||
        f.fingerprint.toLowerCase().includes(q)
      );
    }
    if (activeTab === 'critical') {
      filtered = filtered.filter(f => f.severity === 'critical' && f.status === 'active');
    } else if (activeTab === 'overdue') {
      filtered = filtered.filter(f => {
        if (f.status !== 'active') return false;
        const days = (Date.now() - new Date(f.last_detected_at).getTime()) / 86400000;
        return days > 3;
      });
    } else if (activeTab === 'resolved') {
      filtered = filtered.filter(f => f.status === 'resolved');
    }
    return filtered;
  }, [data?.findings, filterStage, searchText, activeTab]);

  const counts = data?.counts || {
    total_active: '0', active_critical: '0', active_risk: '0',
    active_warning: '0', resolved_7d: '0', overdue_unresolved: '0'
  };

  const agentSummary = useMemo(() => {
    if (!data?.byAgent) return [];
    const map: Record<string, { active: number; resolved: number }> = {};
    for (const row of data.byAgent) {
      if (!map[row.agent_key]) map[row.agent_key] = { active: 0, resolved: 0 };
      if (row.status === 'active') map[row.agent_key].active = Number(row.count);
      else map[row.agent_key].resolved = Number(row.count);
    }
    return Object.entries(map).map(([key, val]) => ({ agent: key, ...val }));
  }, [data?.byAgent]);

  const projectSummary = useMemo(() => {
    if (!data?.byProject) return [];
    const map: Record<number, { name: string; critical: number; risk: number; warning: number; resolved: number }> = {};
    for (const row of data.byProject) {
      if (!map[row.project_id]) map[row.project_id] = { name: row.project_name, critical: 0, risk: 0, warning: 0, resolved: 0 };
      if (row.status === 'resolved') { map[row.project_id].resolved += Number(row.count); continue; }
      if (row.severity === 'critical') map[row.project_id].critical += Number(row.count);
      else if (row.severity === 'risk') map[row.project_id].risk += Number(row.count);
      else map[row.project_id].warning += Number(row.count);
    }
    return Object.entries(map)
      .map(([id, val]) => ({ projectId: Number(id), ...val }))
      .sort((a, b) => (b.critical * 100 + b.risk * 10 + b.warning) - (a.critical * 100 + a.risk * 10 + a.warning));
  }, [data?.byProject]);

  const uniqueStages = useMemo(() => {
    const stages = new Set<string>();
    Object.values(EPC_STAGES).forEach(s => stages.add(s));
    return Array.from(stages).sort();
  }, []);

  return (
    <Layout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            Live EPC Risks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time monitoring of EPC lifecycle findings across all projects
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/epc-risks/dashboard'] })}
          disabled={isRefetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Active Critical</p>
                <p className="text-2xl font-bold text-red-600">{counts.active_critical}</p>
              </div>
              <Flame className="h-8 w-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Active High</p>
                <p className="text-2xl font-bold text-orange-600">{counts.active_risk}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Active Medium</p>
                <p className="text-2xl font-bold text-yellow-600">{counts.active_warning}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Total Active</p>
                <p className="text-2xl font-bold text-blue-600">{counts.total_active}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-600">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Overdue (3d+)</p>
                <p className="text-2xl font-bold text-amber-700">{counts.overdue_unresolved}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Resolved (7d)</p>
                <p className="text-2xl font-bold text-green-600">{counts.resolved_7d}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="risk">High (Risk)</SelectItem>
            <SelectItem value="warning">Medium (Warning)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="project_control">Project Control</SelectItem>
            <SelectItem value="production_management">Production</SelectItem>
            <SelectItem value="quality_management">Quality</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {(data?.projects || []).map((p: any) => (
              <SelectItem key={p.project_id} value={String(p.project_id)}>{p.project_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue placeholder="EPC Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {uniqueStages.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search findings..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="text-xs">
            <Eye className="h-3.5 w-3.5 mr-1" />
            All Findings ({data?.findings?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="critical" className="text-xs">
            <Flame className="h-3.5 w-3.5 mr-1" />
            Critical ({counts.active_critical})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="text-xs">
            <Clock className="h-3.5 w-3.5 mr-1" />
            Overdue ({counts.overdue_unresolved})
          </TabsTrigger>
          <TabsTrigger value="resolved" className="text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Recently Resolved ({counts.resolved_7d})
          </TabsTrigger>
          <TabsTrigger value="byProject" className="text-xs">
            <BarChart3 className="h-3.5 w-3.5 mr-1" />
            By Project
          </TabsTrigger>
          <TabsTrigger value="byAgent" className="text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            By Agent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="byProject" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Findings by Project</CardTitle>
            </CardHeader>
            <CardContent>
              {projectSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No findings recorded yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Project</TableHead>
                      <TableHead className="text-xs text-center">Critical</TableHead>
                      <TableHead className="text-xs text-center">High</TableHead>
                      <TableHead className="text-xs text-center">Medium</TableHead>
                      <TableHead className="text-xs text-center">Resolved</TableHead>
                      <TableHead className="text-xs text-center">Total Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectSummary.map(p => (
                      <TableRow key={p.projectId}>
                        <TableCell className="text-sm font-medium">{p.code} — {p.clientName || p.name}</TableCell>
                        <TableCell className="text-center">
                          {p.critical > 0 ? <Badge variant="destructive" className="text-xs">{p.critical}</Badge> : <span className="text-muted-foreground text-xs">0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.risk > 0 ? <Badge className="bg-orange-500 text-white text-xs">{p.risk}</Badge> : <span className="text-muted-foreground text-xs">0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.warning > 0 ? <Badge className="bg-yellow-500 text-white text-xs">{p.warning}</Badge> : <span className="text-muted-foreground text-xs">0</span>}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{p.resolved}</TableCell>
                        <TableCell className="text-center font-medium text-sm">{p.critical + p.risk + p.warning}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="byAgent" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {agentSummary.map(a => (
              <Card key={a.agent}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{AGENT_LABELS[a.agent] || a.agent}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">{a.active}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{a.resolved}</p>
                      <p className="text-xs text-muted-foreground">Resolved</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-500">{a.active + a.resolved}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {agentSummary.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-4 text-center py-8">No agent data available yet</p>
            )}
          </div>
        </TabsContent>

        {['all', 'critical', 'overdue', 'resolved'].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading findings...</span>
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-16 text-destructive">
                    <AlertCircle className="h-10 w-10 mb-2" />
                    <p className="text-sm font-medium">Failed to load EPC risks data</p>
                    <p className="text-xs mt-1 text-muted-foreground">{(error as Error)?.message || 'Unknown error'}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/epc-risks/dashboard'] })}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
                    </Button>
                  </div>
                ) : findings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <TrendingDown className="h-10 w-10 mb-2 text-green-400" />
                    <p className="text-sm font-medium">No findings match current filters</p>
                    <p className="text-xs mt-1">Adjust filters or check back later</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-[90px]">Code</TableHead>
                          <TableHead className="text-xs">Title</TableHead>
                          <TableHead className="text-xs">Project</TableHead>
                          <TableHead className="text-xs">Item</TableHead>
                          <TableHead className="text-xs w-[80px]">Severity</TableHead>
                          <TableHead className="text-xs w-[90px]">Agent</TableHead>
                          <TableHead className="text-xs w-[80px]">Stage</TableHead>
                          <TableHead className="text-xs w-[70px]">Status</TableHead>
                          <TableHead className="text-xs w-[90px]">Detected</TableHead>
                          <TableHead className="text-xs w-[90px]">Last Seen</TableHead>
                          <TableHead className="text-xs">Task</TableHead>
                          <TableHead className="text-xs w-[80px]">Alert</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {findings.map(f => (
                          <TableRow key={f.id} className={f.severity === 'critical' && f.status === 'active' ? 'bg-red-50/50' : ''}>
                            <TableCell className="font-mono text-xs font-semibold text-blue-700">{f.finding_code}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate" title={FINDING_TITLES[f.finding_code]}>
                              {FINDING_TITLES[f.finding_code] || f.finding_code}
                            </TableCell>
                            <TableCell className="text-xs">{f.project_name || '—'}</TableCell>
                            <TableCell className="text-xs max-w-[120px] truncate" title={f.project_item_description || ''}>
                              {f.project_item_code || '—'}
                            </TableCell>
                            <TableCell>{severityBadge(f.severity)}</TableCell>
                            <TableCell className="text-xs">{AGENT_LABELS[f.agent_key] || f.agent_key}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{EPC_STAGES[f.finding_code] || '—'}</TableCell>
                            <TableCell>{statusBadge(f.status)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground" title={formatDate(f.first_detected_at)}>
                              {formatDate(f.first_detected_at)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground" title={formatDate(f.last_detected_at)}>
                              {timeAgo(f.last_detected_at)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {f.linked_task ? (
                                <div className="flex items-center gap-1">
                                  {taskStatusBadge(f.linked_task.status)}
                                  <span className="text-muted-foreground truncate max-w-[80px]" title={f.linked_task.assignee_name}>
                                    {f.linked_task.assignee_name || '—'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {f.last_alerted_at ? (
                                <span className="text-muted-foreground" title={formatDate(f.last_alerted_at)}>{timeAgo(f.last_alerted_at)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
    </Layout>
  );
}

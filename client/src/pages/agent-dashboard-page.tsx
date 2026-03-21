import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Play,
  Pause,
  Power,
  PowerOff,
  RefreshCw,
  Shield,
  Zap,
  TrendingUp,
  FileWarning,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  Settings,
  BarChart3,
  ChevronRight,
  Timer,
  Target,
  XCircle,
  Info,
  Send,
  Calendar,
  ListChecks,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type AgentInfo = {
  id: number;
  agentKey: string;
  displayName: string;
  description: string;
  version: string;
  isEnabled: boolean;
  isSuspended: boolean;
  lastRunAt: string | null;
  runCount: number;
  consecutiveFailures: number;
  config: any;
};

type AgentRun = {
  id: number;
  agentKey: string;
  status: string;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
  findingsCount: number;
  insightsCount: number;
  recommendationsCount: number;
  errorMessage: string | null;
  executionMetadata: any;
};

type Finding = {
  id: number;
  agentKey: string;
  findingType: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  entityType: string | null;
  entityId: string | null;
  evidence: any;
  suggestedAction: string | null;
  assignedTo: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

type Insight = {
  id: number;
  agentKey: string;
  insightType: string;
  title: string;
  summary: string;
  details: any;
  createdAt: string;
};

type Recommendation = {
  id: number;
  agentKey: string;
  findingId: number | null;
  actionCategory: string;
  actionType: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  confidence: string;
  actionPayload: any;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
};

type AgentAction = {
  id: number;
  agentKey: string;
  recommendationId: number | null;
  actionCategory: string;
  actionType: string;
  executionStatus: string;
  resultMessage: string | null;
  resultData: any;
  createdAt: string;
  executedAt: string | null;
};

type Policy = {
  id: number;
  agentKey: string;
  actionCategory: string;
  actionType: string;
  approvalMode: string;
  maxActionsPerDay: number;
  cooldownMinutes: number;
  isEnabled: boolean;
};

type ScheduleInfo = {
  agentKey: string;
  cronExpression: string;
};

type DashboardSummary = {
  agents: AgentInfo[];
  stats: {
    totalAgents: number;
    enabledAgents: number;
    suspendedAgents: number;
    openFindings: number;
    pendingRecommendations: number;
    executedActions: number;
  };
  recentRuns: AgentRun[];
  recentFindings: Finding[];
  recentInsights: Insight[];
  recentActions: AgentAction[];
  schedules: ScheduleInfo[];
};

function severityColor(severity: string) {
  switch (severity) {
    case "critical": return "destructive";
    case "high": return "destructive";
    case "medium": return "default";
    case "low": return "secondary";
    case "info": return "outline";
    default: return "secondary";
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case "critical": return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "high": return <FileWarning className="h-4 w-4 text-orange-500" />;
    case "medium": return <Info className="h-4 w-4 text-yellow-500" />;
    case "low": return <Eye className="h-4 w-4 text-blue-400" />;
    default: return <Info className="h-4 w-4 text-gray-400" />;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge variant="default" className="bg-green-600">Completed</Badge>;
    case "running": return <Badge variant="default" className="bg-blue-600">Running</Badge>;
    case "failed": return <Badge variant="destructive">Failed</Badge>;
    case "open": return <Badge variant="default" className="bg-yellow-600">Open</Badge>;
    case "acknowledged": return <Badge variant="secondary">Acknowledged</Badge>;
    case "resolved": return <Badge variant="default" className="bg-green-600">Resolved</Badge>;
    case "pending_review": return <Badge variant="default" className="bg-orange-500">Pending Review</Badge>;
    case "approved": return <Badge variant="default" className="bg-blue-600">Approved</Badge>;
    case "auto_approved": return <Badge variant="default" className="bg-teal-600">Auto-Approved</Badge>;
    case "rejected": return <Badge variant="destructive">Rejected</Badge>;
    case "executed": return <Badge variant="default" className="bg-green-600">Executed</Badge>;
    case "executing": return <Badge variant="default" className="bg-blue-600">Executing</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function agentKeyLabel(key: string) {
  switch (key) {
    case "project_control": return "Project Control";
    case "predictive_project_control": return "Predictive Project Control";
    case "communications": return "Communications";
    case "finance": return "Finance Control";
    case "finance_control": return "Finance Control";
    case "executive_mis": return "Executive MIS";
    case "sales_marketing": return "Sales & Marketing";
    case "production_management": return "Production Management";
    case "quality_management": return "Quality Management";
    case "administration_control": return "Administration Control";
    case "master_control": return "Master Control";
    case "advisor": return "Advisor";
    default: return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

function agentKeyColor(key: string) {
  switch (key) {
    case "project_control": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "predictive_project_control": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
    case "communications": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "finance": case "finance_control": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "executive_mis": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    case "sales_marketing": return "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200";
    case "production_management": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "quality_management": return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
    case "administration_control": return "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200";
    case "master_control": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "advisor": return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200";
    default: return "bg-gray-100 text-gray-800";
  }
}

function findingTypeBadge(findingType: string) {
  const typeMap: Record<string, { label: string; className: string }> = {
    overdue: { label: 'Overdue', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200' },
    escalation: { label: 'Escalation', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' },
    completion: { label: 'Completed', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' },
    visibility: { label: 'Visibility', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200' },
    gap: { label: 'Gap', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' },
    anomaly: { label: 'Anomaly', className: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200' },
    risk: { label: 'Risk', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' },
    threshold: { label: 'Threshold', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200' },
  };
  const info = typeMap[findingType] || { label: findingType, className: 'bg-gray-100 text-gray-700' };
  return <Badge variant="outline" className={`${info.className} text-[10px] px-1.5 py-0`}>{info.label}</Badge>;
}

function cronDescription(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length < 5) return cron;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  const dow = parts[4];
  const istHour = (hour + 5 + Math.floor((minute + 30) / 60)) % 24;
  const istMinute = (minute + 30) % 60;
  const istTime = `${String(istHour).padStart(2, '0')}:${String(istMinute).padStart(2, '0')} IST`;
  if (dow === '1') return `Weekly (Mon ${istTime})`;
  if (dow === '*') return `Daily at ${istTime}`;
  return `${cron}`;
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        {severityIcon(finding.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <Badge variant={severityColor(finding.severity)} className="text-xs">
              {finding.severity}
            </Badge>
            {findingTypeBadge(finding.findingType)}
            <Badge className={`${agentKeyColor(finding.agentKey)} text-xs`} variant="outline">
              {agentKeyLabel(finding.agentKey)}
            </Badge>
          </div>
          <p className={`text-sm font-medium ${expanded ? '' : 'line-clamp-2'}`}>{finding.title}</p>
          <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}>
            {finding.description}
          </p>
          {finding.suggestedAction && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
              <Target className="h-3 w-3 shrink-0" />
              {finding.suggestedAction}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground ml-auto">
              {finding.createdAt ? formatDistanceToNow(new Date(finding.createdAt), { addSuffix: true }) : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentDashboardPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("activity");
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<string>("all");
  const [findingAgentFilter, setFindingAgentFilter] = useState<string>("all");
  const [findingTypeFilter, setFindingTypeFilter] = useState<string>("all");

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/agents/dashboard/summary"],
    refetchInterval: 30000,
  });

  const { data: findings, isLoading: findingsLoading } = useQuery<Finding[]>({
    queryKey: ["/api/agents/findings"],
  });

  const { data: recommendations } = useQuery<Recommendation[]>({
    queryKey: ["/api/agents/recommendations"],
  });

  const { data: policies } = useQuery<Policy[]>({
    queryKey: ["/api/agents/policies"],
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/agents/dashboard/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/agents/findings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/agents/recommendations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/agents/policies"] });
  };

  const triggerMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      return apiRequest("POST", `/api/agents/agents/${agentKey}/trigger`, { companyScope: "ALL" });
    },
    onSuccess: (_data, agentKey) => {
      toast({ title: "Agent triggered", description: `${agentKeyLabel(agentKey)} completed successfully.` });
      invalidateAll();
    },
    onError: (err: any) => {
      toast({ title: "Trigger failed", description: err.message, variant: "destructive" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (agentKey: string) => apiRequest("POST", `/api/agents/agents/${agentKey}/suspend`),
    onSuccess: () => { invalidateAll(); toast({ title: "Agent suspended" }); },
  });

  const resumeMutation = useMutation({
    mutationFn: async (agentKey: string) => apiRequest("POST", `/api/agents/agents/${agentKey}/resume`),
    onSuccess: () => { invalidateAll(); toast({ title: "Agent resumed" }); },
  });

  const enableMutation = useMutation({
    mutationFn: async (agentKey: string) => apiRequest("POST", `/api/agents/agents/${agentKey}/enable`),
    onSuccess: () => { invalidateAll(); toast({ title: "Agent enabled" }); },
  });

  const disableMutation = useMutation({
    mutationFn: async (agentKey: string) => apiRequest("POST", `/api/agents/agents/${agentKey}/disable`),
    onSuccess: () => { invalidateAll(); toast({ title: "Agent disabled" }); },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/agents/recommendations/${id}/approve`),
    onSuccess: () => { invalidateAll(); toast({ title: "Recommendation approved" }); },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/agents/recommendations/${id}/reject`),
    onSuccess: () => { invalidateAll(); toast({ title: "Recommendation rejected" }); },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ agentKey, cronExpression }: { agentKey: string; cronExpression: string }) =>
      apiRequest("POST", `/api/agents/scheduler/update`, { agentKey, cronExpression }),
    onSuccess: () => { invalidateAll(); toast({ title: "Schedule updated" }); },
  });

  const approveAndExecuteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/agents/recommendations/${id}/approve-and-execute`);
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast({ title: "Action executed", description: data?.message || "Recommendation approved and action completed." });
    },
    onError: (err: any) => {
      toast({ title: "Execution failed", description: err.message, variant: "destructive" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/agents/recommendations/${id}/execute`);
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast({ title: "Action executed", description: data?.message || "Action completed." });
    },
    onError: (err: any) => {
      toast({ title: "Execution failed", description: err.message, variant: "destructive" });
    },
  });

  const stats = summary?.stats;

  const filteredFindings = (findings || []).filter(f => {
    if (findingSeverityFilter !== "all" && f.severity !== findingSeverityFilter) return false;
    if (findingAgentFilter !== "all" && f.agentKey !== findingAgentFilter) return false;
    if (findingTypeFilter !== "all" && f.findingType !== findingTypeFilter) return false;
    return true;
  });

  const pendingRecs = (recommendations || []).filter(r => r.status === "pending_review");
  const approvedRecs = (recommendations || []).filter(r => r.status === "approved");
  const autoExecutedRecs = (recommendations || []).filter(r => r.status === "executed" || r.status === "auto_approved");
  const reviewedRecs = (recommendations || []).filter(r => ["rejected", "expired", "superseded"].includes(r.status));

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Layout>
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            Agent Intelligence Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Multi-agent system monitoring, automation, and control center
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={invalidateAll}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalAgents || 0}</p>
                <p className="text-xs text-muted-foreground">Total Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.enabledAgents || 0}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.openFindings || 0}</p>
                <p className="text-xs text-muted-foreground">Open Findings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.pendingRecommendations || 0}</p>
                <p className="text-xs text-muted-foreground">Pending Approvals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.executedActions || 0}</p>
                <p className="text-xs text-muted-foreground">Actions Executed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{summary?.schedules?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Approvals</span>
            {pendingRecs.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                {pendingRecs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="findings" className="flex items-center gap-1.5">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Findings</span>
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex items-center gap-1.5">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">Actions</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Agent Status
              </CardTitle>
              <CardDescription>Operational overview of all registered agents</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Agent</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Schedule</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Last Run</th>
                      <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Runs</th>
                      <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Mode</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.agents || []).map(agent => {
                      const schedule = (summary?.schedules || []).find(s => s.agentKey === agent.agentKey);
                      const isAutoEnabled = agent.isEnabled && !agent.isSuspended && !!schedule;
                      return (
                        <tr key={agent.agentKey} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${agent.isEnabled && !agent.isSuspended ? 'bg-green-500' : agent.isSuspended ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                              <div>
                                <p className="font-medium text-sm">{agent.displayName}</p>
                                <p className="text-xs text-muted-foreground line-clamp-1">{agent.description}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {agent.isEnabled && !agent.isSuspended ? (
                              <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>
                            ) : agent.isSuspended ? (
                              <Badge variant="default" className="bg-yellow-600 text-xs">Suspended</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Disabled</Badge>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {schedule ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                {cronDescription(schedule.cronExpression)}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Manual only</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-xs text-muted-foreground">
                              {agent.lastRunAt
                                ? formatDistanceToNow(new Date(agent.lastRunAt), { addSuffix: true })
                                : "Never"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-xs font-medium">{agent.runCount}</span>
                          </td>
                          <td className="py-3 px-3">
                            {isAutoEnabled ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 text-xs gap-1">
                                <Zap className="h-3 w-3" />
                                Auto Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                                <Play className="h-3 w-3" />
                                Manual
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 justify-end">
                              {!isAutoEnabled && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-xs px-2.5"
                                  onClick={() => triggerMutation.mutate(agent.agentKey)}
                                  disabled={triggerMutation.isPending || !agent.isEnabled || agent.isSuspended}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  Run Now
                                </Button>
                              )}
                              {isAutoEnabled && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs px-2"
                                  onClick={() => triggerMutation.mutate(agent.agentKey)}
                                  disabled={triggerMutation.isPending}
                                  title="Manual trigger (agent is auto-scheduled)"
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              {agent.isSuspended ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2"
                                  onClick={() => resumeMutation.mutate(agent.agentKey)}
                                  title="Resume agent"
                                >
                                  <Power className="h-3 w-3" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs px-2"
                                  onClick={() => suspendMutation.mutate(agent.agentKey)}
                                  title="Suspend agent"
                                >
                                  <Pause className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Runs
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(summary?.recentRuns || []).length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No agent runs yet. Trigger an agent above to get started.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Agent</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Trigger</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Started</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Findings</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Insights</th>
                        <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Recs</th>
                        <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary?.recentRuns || []).map(run => (
                        <tr key={run.id} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors">
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className={`p-1 rounded-full ${run.status === 'completed' ? 'bg-green-100 dark:bg-green-900' : run.status === 'failed' ? 'bg-red-100 dark:bg-red-900' : 'bg-blue-100 dark:bg-blue-900'}`}>
                                {run.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> :
                                 run.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-red-600" /> :
                                 <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin" />}
                              </div>
                              <span className="font-medium text-sm">{agentKeyLabel(run.agentKey)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant="outline" className="text-xs">{run.triggerType}</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">
                            {run.startedAt ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }) : ""}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-xs font-medium">{run.findingsCount}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-xs font-medium">{run.insightsCount}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-xs font-medium">{run.recommendationsCount}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            {statusBadge(run.status)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-xs text-muted-foreground">
                            {run.executionMetadata?.durationMs
                              ? `${(run.executionMetadata.durationMs / 1000).toFixed(1)}s`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4 space-y-4">
          {pendingRecs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-orange-500" />
                  Pending Review ({pendingRecs.length})
                </CardTitle>
                <CardDescription>
                  These recommendations need your approval before execution.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingRecs.map(rec => (
                    <div key={rec.id} className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={agentKeyColor(rec.agentKey)} variant="outline">
                              {agentKeyLabel(rec.agentKey)}
                            </Badge>
                            <Badge variant="outline">{rec.actionCategory}/{rec.actionType}</Badge>
                            <Badge variant={rec.priority === "urgent" || rec.priority === "high" ? "destructive" : rec.priority === "normal" ? "default" : "secondary"}>
                              {rec.priority}
                            </Badge>
                            {rec.confidence && (
                              <span className="text-xs text-muted-foreground">
                                Confidence: {Math.round(parseFloat(rec.confidence) * 100)}%
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium">{rec.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {rec.createdAt ? formatDistanceToNow(new Date(rec.createdAt), { addSuffix: true }) : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectMutation.mutate(rec.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate(rec.id)}
                          disabled={approveMutation.isPending}
                        >
                          <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveAndExecuteMutation.mutate(rec.id)}
                          disabled={approveAndExecuteMutation.isPending}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Approve & Execute
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {approvedRecs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                  Approved — Ready to Execute ({approvedRecs.length})
                </CardTitle>
                <CardDescription>
                  These recommendations have been approved and can be executed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {approvedRecs.map(rec => (
                    <div key={rec.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <Badge className={agentKeyColor(rec.agentKey)} variant="outline">
                            {agentKeyLabel(rec.agentKey)}
                          </Badge>
                          <Badge variant="outline">{rec.actionType}</Badge>
                          {statusBadge(rec.status)}
                        </div>
                        <p className="text-sm font-medium">{rec.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                      </div>
                      <Button
                        size="sm"
                        className="ml-3 shrink-0"
                        onClick={() => executeMutation.mutate(rec.id)}
                        disabled={executeMutation.isPending}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Execute
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {autoExecutedRecs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-green-500" />
                  Auto-Executed ({autoExecutedRecs.length})
                </CardTitle>
                <CardDescription>
                  These actions were automatically approved and executed by the agent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {autoExecutedRecs.map(rec => (
                    <div key={rec.id} className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <Badge className={agentKeyColor(rec.agentKey)} variant="outline">
                            {agentKeyLabel(rec.agentKey)}
                          </Badge>
                          <Badge variant="outline">{rec.actionType}</Badge>
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Executed
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{rec.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-500 ml-3 shrink-0" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pendingRecs.length === 0 && approvedRecs.length === 0 && autoExecutedRecs.length === 0 && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground">No pending recommendations</p>
                  <p className="text-xs text-muted-foreground mt-1">All agent recommendations have been reviewed.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {reviewedRecs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Previously Reviewed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reviewedRecs.slice(0, 20).map(rec => (
                    <div key={rec.id} className="flex items-center justify-between p-3 rounded-lg border opacity-75">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{rec.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {agentKeyLabel(rec.agentKey)} · {rec.actionType}
                          {rec.createdAt ? ` · ${formatDistanceToNow(new Date(rec.createdAt), { addSuffix: true })}` : ""}
                        </p>
                      </div>
                      {statusBadge(rec.status)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="findings" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={findingSeverityFilter} onValueChange={setFindingSeverityFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={findingAgentFilter} onValueChange={setFindingAgentFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                <SelectItem value="project_control">Project Control</SelectItem>
                <SelectItem value="predictive_project_control">Predictive Project Control</SelectItem>
                <SelectItem value="communications">Communications</SelectItem>
                <SelectItem value="finance">Finance Control</SelectItem>
                <SelectItem value="executive_mis">Executive MIS</SelectItem>
                <SelectItem value="sales_marketing">Sales & Marketing</SelectItem>
                <SelectItem value="production_management">Production Management</SelectItem>
                <SelectItem value="quality_management">Quality Management</SelectItem>
                <SelectItem value="administration_control">Administration Control</SelectItem>
                <SelectItem value="master_control">Master Control</SelectItem>
                <SelectItem value="advisor">Advisor</SelectItem>
              </SelectContent>
            </Select>
            <Select value={findingTypeFilter} onValueChange={setFindingTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="escalation">Escalation</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="completion">Completed</SelectItem>
                <SelectItem value="visibility">Visibility</SelectItem>
                <SelectItem value="gap">Gap</SelectItem>
                <SelectItem value="anomaly">Anomaly</SelectItem>
                <SelectItem value="risk">Risk</SelectItem>
                <SelectItem value="threshold">Threshold</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Findings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {findingsLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredFindings.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No findings match your filters.</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {filteredFindings.slice(0, 50).map(finding => (
                      <FindingCard key={finding.id} finding={finding} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const filteredInsights = (summary?.recentInsights || []).filter(insight =>
                    findingAgentFilter === "all" || insight.agentKey === findingAgentFilter
                  );
                  return filteredInsights.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">No insights generated yet.</p>
                  ) : (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                      {filteredInsights.map(insight => (
                        <InsightCard key={insight.id} insight={insight} />
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                Executed Actions
              </CardTitle>
              <CardDescription>
                Actions that have been executed by the agent system — tasks created, notifications sent, escalations triggered.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(summary?.recentActions || []).length === 0 ? (
                <div className="text-center py-12">
                  <ListChecks className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground">No actions executed yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Approve recommendations to trigger automated actions.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(summary?.recentActions || []).map(action => (
                    <div key={action.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-full ${action.executionStatus === 'completed' ? 'bg-green-100 dark:bg-green-900' : action.executionStatus === 'failed' ? 'bg-red-100 dark:bg-red-900' : 'bg-blue-100 dark:bg-blue-900'}`}>
                          {action.executionStatus === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                           action.executionStatus === 'failed' ? <XCircle className="h-4 w-4 text-red-600" /> :
                           <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={agentKeyColor(action.agentKey)} variant="outline">
                              {agentKeyLabel(action.agentKey)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {action.actionCategory}/{action.actionType}
                            </Badge>
                          </div>
                          <p className="text-sm mt-0.5">{action.resultMessage || 'Executing...'}</p>
                          {action.resultData && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {action.resultData.taskId ? `Task #${action.resultData.taskId} created` : ''}
                              {action.resultData.sentCount ? `${action.resultData.sentCount} notification(s) sent` : ''}
                              {action.resultData.escalatedTo ? `Escalated to ${action.resultData.escalatedTo} manager(s)` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {statusBadge(action.executionStatus)}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {action.executedAt ? formatDistanceToNow(new Date(action.executedAt), { addSuffix: true }) : action.createdAt ? formatDistanceToNow(new Date(action.createdAt), { addSuffix: true }) : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Agent Registry
                </CardTitle>
                <CardDescription>Enable or disable agents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(summary?.agents || []).map(agent => (
                    <div key={agent.agentKey} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{agent.displayName}</p>
                        <p className="text-xs text-muted-foreground">v{agent.version} · {agent.runCount} runs</p>
                        {agent.consecutiveFailures > 0 && (
                          <p className="text-xs text-red-500 mt-0.5">{agent.consecutiveFailures} consecutive failures</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={agent.isEnabled}
                          onCheckedChange={(checked) => {
                            if (checked) enableMutation.mutate(agent.agentKey);
                            else disableMutation.mutate(agent.agentKey);
                          }}
                          className={agent.isEnabled ? 'data-[state=checked]:bg-green-600' : 'data-[state=unchecked]:bg-red-500'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Policies
                </CardTitle>
                <CardDescription>Action approval policies for each agent</CardDescription>
              </CardHeader>
              <CardContent>
                {(policies || []).length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No policies configured.</p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {(policies || []).map(policy => (
                      <div key={policy.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge className={agentKeyColor(policy.agentKey)} variant="outline">
                              {agentKeyLabel(policy.agentKey)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {policy.actionCategory} / {policy.actionType}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <Badge variant={policy.approvalMode === "require_approval" ? "default" : policy.approvalMode === "auto" ? "secondary" : "outline"}>
                            {policy.approvalMode === "require_approval" ? "Manual" : policy.approvalMode === "auto" ? "Auto" : policy.approvalMode}
                          </Badge>
                          <p className="text-muted-foreground mt-1">
                            Max {policy.maxActionsPerDay}/day · {policy.cooldownMinutes}min cooldown
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Scheduler
                </CardTitle>
                <CardDescription>Set daily run time for each agent (IST)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(summary?.agents || []).map(agent => {
                    const schedule = (summary?.schedules || []).find(s => s.agentKey === agent.agentKey);
                    const cronParts = schedule?.cronExpression?.split(' ') || [];
                    const utcMin = parseInt(cronParts[0]) || 0;
                    const utcHour = parseInt(cronParts[1]) || 3;
                    const istHour = (utcHour + 5 + Math.floor((utcMin + 30) / 60)) % 24;
                    const istMin = (utcMin + 30) % 60;
                    const currentIstTime = `${String(istHour).padStart(2, '0')}:${String(istMin).padStart(2, '0')}`;

                    return (
                      <div key={agent.agentKey} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-blue-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{agent.displayName}</p>
                            {schedule ? (
                              <p className="text-xs text-muted-foreground">{cronDescription(schedule.cronExpression)}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Not scheduled</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            defaultValue={currentIstTime}
                            className="border rounded px-2 py-1 text-sm w-[110px] bg-background"
                            onBlur={(e) => {
                              const [h, m] = e.target.value.split(':').map(Number);
                              const utcM = ((m - 30) + 60) % 60;
                              const utcH = ((h - 5 - (m < 30 ? 1 : 0)) + 24) % 24;
                              const newCron = `${utcM} ${utcH} * * *`;
                              if (schedule?.cronExpression !== newCron) {
                                updateScheduleMutation.mutate({ agentKey: agent.agentKey, cronExpression: newCron });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">IST</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </Layout>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false);
  const content = insight.summary || (insight.details as any)?.content || '';
  const lines = typeof content === 'string' ? content.split('\n') : [];

  return (
    <div className="p-4 rounded-lg border space-y-2 cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={agentKeyColor(insight.agentKey)} variant="outline">
          {agentKeyLabel(insight.agentKey)}
        </Badge>
        <Badge variant="outline">{insight.insightType}</Badge>
      </div>
      <h4 className="font-medium text-sm">{insight.title}</h4>
      {expanded ? (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/30 p-3 rounded-md max-h-[500px] overflow-y-auto">
          {content}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground line-clamp-3">{lines.slice(0, 3).join(' · ')}</p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {insight.createdAt ? formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true }) : ""}
        </p>
        <span className="text-xs text-muted-foreground">{expanded ? 'Click to collapse' : 'Click to expand'}</span>
      </div>
    </div>
  );
}

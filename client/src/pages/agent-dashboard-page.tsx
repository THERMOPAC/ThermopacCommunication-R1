import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  actionType: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  payload: any;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
};

type Policy = {
  id: number;
  agentKey: string;
  actionCategory: string;
  actionType: string;
  approvalMode: string;
  maxActionsPerHour: number;
  cooldownMinutes: number;
  isActive: boolean;
};

type DashboardSummary = {
  agents: AgentInfo[];
  stats: {
    totalAgents: number;
    enabledAgents: number;
    suspendedAgents: number;
    openFindings: number;
    pendingRecommendations: number;
  };
  recentRuns: AgentRun[];
  recentFindings: Finding[];
  recentInsights: Insight[];
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
    case "approved": return <Badge variant="default" className="bg-green-600">Approved</Badge>;
    case "rejected": return <Badge variant="destructive">Rejected</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function agentKeyLabel(key: string) {
  switch (key) {
    case "project_control": return "Project Control";
    case "communications": return "Communications";
    case "executive_mis": return "Executive MIS";
    default: return key;
  }
}

function agentKeyColor(key: string) {
  switch (key) {
    case "project_control": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "communications": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "executive_mis": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    default: return "bg-gray-100 text-gray-800";
  }
}

function FindingCard({ finding, onStatusChange }: { finding: Finding; onStatusChange: (id: number, status: string) => void }) {
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
            <Badge className={`${agentKeyColor(finding.agentKey)} text-xs`} variant="outline">
              {agentKeyLabel(finding.agentKey)}
            </Badge>
            {statusBadge(finding.status)}
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
            {finding.status === "open" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={(e) => { e.stopPropagation(); onStatusChange(finding.id, "acknowledged"); }}
              >
                Acknowledge
              </Button>
            )}
            {(finding.status === "open" || finding.status === "acknowledged") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={(e) => { e.stopPropagation(); onStatusChange(finding.id, "resolved"); }}
              >
                Resolve
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {expanded ? 'Click to collapse' : 'Click to expand'}
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

  const triggerMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      return apiRequest("POST", `/api/agents/agents/${agentKey}/trigger`, { companyScope: "ALL" });
    },
    onSuccess: (_data, agentKey) => {
      toast({ title: "Agent triggered", description: `${agentKeyLabel(agentKey)} completed successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/findings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/agents"] });
    },
    onError: (err: any) => {
      toast({ title: "Trigger failed", description: err.message, variant: "destructive" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      return apiRequest("POST", `/api/agents/agents/${agentKey}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent suspended" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      return apiRequest("POST", `/api/agents/agents/${agentKey}/resume`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent resumed" });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      return apiRequest("POST", `/api/agents/agents/${agentKey}/enable`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent enabled" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (agentKey: string) => {
      return apiRequest("POST", `/api/agents/agents/${agentKey}/disable`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent disabled" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/agents/recommendations/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Recommendation approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/agents/recommendations/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Recommendation rejected" });
    },
  });

  const updateFindingStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PATCH", `/api/agents/findings/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Finding status updated" });
    },
  });

  const stats = summary?.stats;

  const filteredFindings = (findings || []).filter(f => {
    if (findingSeverityFilter !== "all" && f.severity !== findingSeverityFilter) return false;
    if (findingAgentFilter !== "all" && f.agentKey !== findingAgentFilter) return false;
    return true;
  });

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            Agent Intelligence Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Multi-agent system monitoring and control center
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <Pause className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.suspendedAgents || 0}</p>
                <p className="text-xs text-muted-foreground">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Activity Feed</span>
            <span className="sm:hidden">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Pending Approvals</span>
            <span className="sm:hidden">Approvals</span>
            {(stats?.pendingRecommendations || 0) > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                {stats?.pendingRecommendations}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="findings" className="flex items-center gap-1.5">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Findings & Insights</span>
            <span className="sm:hidden">Findings</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Configuration</span>
            <span className="sm:hidden">Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(summary?.agents || []).map(agent => (
              <Card key={agent.agentKey} className="relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${agent.isEnabled && !agent.isSuspended ? 'bg-green-500' : agent.isSuspended ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{agent.displayName}</CardTitle>
                    <div className="flex items-center gap-1">
                      {agent.isEnabled && !agent.isSuspended ? (
                        <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>
                      ) : agent.isSuspended ? (
                        <Badge variant="default" className="bg-yellow-600 text-xs">Suspended</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Disabled</Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="text-xs">{agent.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Timer className="h-3.5 w-3.5" />
                      <span className="text-xs">
                        {agent.lastRunAt
                          ? formatDistanceToNow(new Date(agent.lastRunAt), { addSuffix: true })
                          : "Never run"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span className="text-xs">{agent.runCount} runs</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={() => triggerMutation.mutate(agent.agentKey)}
                      disabled={triggerMutation.isPending || !agent.isEnabled || agent.isSuspended}
                    >
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Run Now
                    </Button>
                    {agent.isSuspended ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resumeMutation.mutate(agent.agentKey)}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => suspendMutation.mutate(agent.agentKey)}
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(summary?.recentRuns || []).length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No agent runs yet. Trigger an agent above to get started.</p>
              ) : (
                <div className="space-y-3">
                  {(summary?.recentRuns || []).map(run => (
                    <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${run.status === 'completed' ? 'bg-green-100 dark:bg-green-900' : run.status === 'failed' ? 'bg-red-100 dark:bg-red-900' : 'bg-blue-100 dark:bg-blue-900'}`}>
                          {run.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                           run.status === 'failed' ? <XCircle className="h-4 w-4 text-red-600" /> :
                           <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{agentKeyLabel(run.agentKey)}</p>
                          <p className="text-xs text-muted-foreground">
                            {run.startedAt ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }) : ""}
                            {" · "}
                            {run.triggerType}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs space-y-0.5">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <AlertTriangle className="h-3 w-3" />
                            {run.findingsCount} findings
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Lightbulb className="h-3 w-3" />
                            {run.insightsCount} insights
                          </div>
                        </div>
                        {statusBadge(run.status)}
                        {run.executionMetadata?.durationMs && (
                          <span className="text-xs text-muted-foreground">
                            {(run.executionMetadata.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Pending Recommendations
              </CardTitle>
              <CardDescription>
                Review and approve or reject agent-generated recommendations. All actions require manual approval in Phase 1.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(recommendations || []).filter(r => r.status === "pending_review").length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground">No pending recommendations</p>
                  <p className="text-xs text-muted-foreground mt-1">All agent recommendations have been reviewed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(recommendations || []).filter(r => r.status === "pending_review").map(rec => (
                    <div key={rec.id} className="p-4 rounded-lg border space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={agentKeyColor(rec.agentKey)} variant="outline">
                              {agentKeyLabel(rec.agentKey)}
                            </Badge>
                            <Badge variant="outline">{rec.actionType}</Badge>
                            <Badge variant={rec.priority === "high" ? "destructive" : rec.priority === "medium" ? "default" : "secondary"}>
                              {rec.priority}
                            </Badge>
                          </div>
                          <h4 className="font-medium">{rec.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
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
                          onClick={() => approveMutation.mutate(rec.id)}
                          disabled={approveMutation.isPending}
                        >
                          <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(recommendations || []).filter(r => r.status !== "pending_review").length > 0 && (
                <>
                  <Separator className="my-6" />
                  <h3 className="text-sm font-medium mb-3 text-muted-foreground">Previously Reviewed</h3>
                  <div className="space-y-2">
                    {(recommendations || []).filter(r => r.status !== "pending_review").map(rec => (
                      <div key={rec.id} className="flex items-center justify-between p-3 rounded-lg border opacity-75">
                        <div>
                          <p className="text-sm font-medium">{rec.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {agentKeyLabel(rec.agentKey)} · {rec.actionType}
                          </p>
                        </div>
                        {statusBadge(rec.status)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
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
                <SelectItem value="communications">Communications</SelectItem>
                <SelectItem value="executive_mis">Executive MIS</SelectItem>
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
                      <FindingCard key={finding.id} finding={finding} onStatusChange={(id, status) => updateFindingStatusMutation.mutate({ id, status })} />
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
                {(summary?.recentInsights || []).length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No insights generated yet.</p>
                ) : (
                  <div className="space-y-4">
                    {(summary?.recentInsights || []).map(insight => (
                      <div key={insight.id} className="p-4 rounded-lg border space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className={agentKeyColor(insight.agentKey)} variant="outline">
                            {agentKeyLabel(insight.agentKey)}
                          </Badge>
                          <Badge variant="outline">{insight.insightType}</Badge>
                        </div>
                        <h4 className="font-medium text-sm">{insight.title}</h4>
                        <p className="text-sm text-muted-foreground">{insight.summary}</p>
                        {insight.details && (
                          <div className="text-xs bg-muted/50 p-3 rounded-md space-y-1">
                            {Object.entries(insight.details).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                <span className="font-medium">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {insight.createdAt ? formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
                  <div className="space-y-2">
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
                          <Badge variant={policy.approvalMode === "require_approval" ? "default" : "secondary"}>
                            {policy.approvalMode === "require_approval" ? "Manual Approval" : policy.approvalMode}
                          </Badge>
                          <p className="text-muted-foreground mt-1">
                            Max {policy.maxActionsPerHour}/hr · {policy.cooldownMinutes}min cooldown
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

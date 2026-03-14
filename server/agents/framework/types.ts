export type FindingType = 'threshold_breach' | 'anomaly' | 'gap' | 'mismatch' | 'trend' | 'overdue' | 'expiry' | 'deviation';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type InsightType = 'summary' | 'trend_analysis' | 'correlation' | 'forecast' | 'briefing' | 'kpi_report';
export type ActionCategory = 'notification' | 'task_creation' | 'communication' | 'data_update' | 'report_generation' | 'escalation' | 'sync_operation';
export type FindingStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed' | 'snoozed' | 'muted';
export type RecommendationStatus = 'pending_review' | 'approved' | 'rejected' | 'auto_approved' | 'expired' | 'superseded';
export type ActionStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back' | 'skipped';
export type TriggerType = 'scheduler' | 'event' | 'data_change' | 'manual';
export type ApprovalMode = 'auto' | 'require_approval' | 'disabled';
export type ActorType = 'agent' | 'user' | 'system' | 'scheduler';

export interface AgentRunContext {
  runId: number;
  agentKey: string;
  triggerType: TriggerType;
  triggerDetail: string;
  companyScope: string;
  locationScope: string;
  config: Record<string, any>;
}

export interface AgentRunResult {
  findingsCount: number;
  insightsCount: number;
  recommendationsCount: number;
  executionMetadata: {
    durationMs: number;
    queriesRun: number;
    llmCalls: number;
    tokensUsed: number;
  };
}

export interface IAgent {
  key: string;
  displayName: string;
  category: string;
  execute(context: AgentRunContext): Promise<AgentRunResult>;
  getSubscribedEvents(): string[];
  handleEvent?(event: AgentEvent): Promise<void>;
}

export interface AgentEvent {
  name: string;
  payload: Record<string, any>;
  timestamp: Date;
  source: string;
}

export interface CreateFindingParams {
  findingType: FindingType;
  severity: Severity;
  title: string;
  description: string;
  logicType: 'rule_based' | 'llm_assisted';
  dataSnapshot?: any;
  relatedEntityType?: string;
  relatedEntityId?: string;
  companyName?: string;
  location?: string;
}

export interface CreateInsightParams {
  findingIds: number[];
  insightType: InsightType;
  title: string;
  content: string;
  logicType: 'rule_based' | 'llm_generated';
  dataSources: string[];
  companyName?: string;
  scopePeriod?: string;
}

export interface CreateRecommendationParams {
  findingId?: number;
  insightId?: number;
  actionCategory: ActionCategory;
  actionType: string;
  title: string;
  description: string;
  actionPayload: any;
  logicType: 'rule_based' | 'llm_generated';
  confidence: number;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  companyName?: string;
  assignTo?: number;
}

export interface ProjectHealthView {
  id: number;
  projectNumber: string;
  projectName: string;
  status: string;
  companyName: string;
  startDate: string;
  targetEndDate: string;
  progress: number;
  totalWorkOrders: number;
  completedWorkOrders: number;
  overdueWorkOrders: number;
  woCompletionPct: number;
}

export interface OverdueWorkOrder {
  id: number;
  workOrderNumber: string;
  title: string;
  status: string;
  priority: string;
  plannedEndDate: string;
  projectId: number;
  projectName: string;
  projectNumber: string;
  daysOverdue: number;
}

export interface OverdueTask {
  id: number;
  title: string;
  dueDate: string;
  status: string;
  assignedTo: number;
  priority: string;
  category: string;
  assigneeName: string;
  daysOverdue: number;
}

export interface UnansweredEmail {
  id: number;
  userId: number;
  subject: string;
  fromAddress: string;
  receivedAt: string;
  priority: string;
  hoursUnanswered: number;
}

export interface FinanceKPI {
  companyName: string;
  pendingInvoices: number;
  overdueInvoices: number;
  pendingAmount: number;
  overdueAmount: number;
  paidInvoicesCount: number;
  totalInvoices: number;
}

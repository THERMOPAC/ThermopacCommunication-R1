import { lazyWithRetry } from "./lazy-utils";

export const AgentDashboardPage = lazyWithRetry(() => import("@/pages/agent-dashboard-page"));
export const BusinessIntelligencePage = lazyWithRetry(() => import("@/pages/business-intelligence-page"));
export const LLMPromptEnginePage = lazyWithRetry(() => import("@/pages/llm-prompt-engine"));
export const WorkerAgentsPage = lazyWithRetry(() => import("@/pages/worker-agents-page"));
export const EpcRisksDashboardPage = lazyWithRetry(() => import("@/pages/epc-risks-dashboard"));
export const DocGovernancePage = lazyWithRetry(() => import("@/pages/doc-governance-page"));
export const GcsDocGovernancePage = lazyWithRetry(() => import("@/pages/gcs-doc-governance-page"));

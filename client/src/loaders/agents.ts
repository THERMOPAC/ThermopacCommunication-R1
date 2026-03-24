import { lazyWithRetry } from "./lazy-utils";

export const AgentDashboardPage = lazyWithRetry(() => import("@/pages/agent-dashboard-page"));
export const BusinessIntelligencePage = lazyWithRetry(() => import("@/pages/business-intelligence-page"));
export const LLMPromptEnginePage = lazyWithRetry(() => import("@/pages/llm-prompt-engine"));

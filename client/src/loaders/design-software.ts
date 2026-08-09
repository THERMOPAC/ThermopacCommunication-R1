import { lazyWithRetry } from "./lazy-utils";

export const DesignSoftwareListPage = lazyWithRetry(() => import("@/pages/design-software/design-software-list-page"));
export const DesignSoftwareWorkspacePage = lazyWithRetry(() => import("@/pages/design-software/design-software-workspace-page"));
export const CpsKnowledgeEnginePage = lazyWithRetry(() => import("@/pages/design-software/cps-knowledge-engine-page"));
export const CpsSizingCasesPage = lazyWithRetry(() => import("@/pages/design-software/cps-sizing-cases-page"));
export const CpsSizingNewCasePage = lazyWithRetry(() => import("@/pages/design-software/cps-sizing-new-case-page"));
export const CpsSizingCasePage = lazyWithRetry(() => import("@/pages/design-software/cps-sizing-case-page"));

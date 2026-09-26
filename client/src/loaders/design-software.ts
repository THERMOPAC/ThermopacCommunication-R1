import { lazyWithRetry } from "./lazy-utils";

export const CpsKnowledgeEnginePage = lazyWithRetry(() => import("@/pages/design-software/cps-knowledge-engine-page"));
export const CpsSizingCasesPage = lazyWithRetry(() => import("@/pages/design-software/cps-sizing-cases-page"));
export const CpsSizingNewCasePage = lazyWithRetry(() => import("@/pages/design-software/cps-sizing-new-case-page"));
export const CpsSizingCasePage = lazyWithRetry(() => import("@/pages/design-software/cps-sizing-case-page"));

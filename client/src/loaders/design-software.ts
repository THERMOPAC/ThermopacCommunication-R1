import { lazyWithRetry } from "./lazy-utils";

export const DesignSoftwareListPage = lazyWithRetry(() => import("@/pages/design-software/design-software-list-page"));
export const DesignSoftwareWorkspacePage = lazyWithRetry(() => import("@/pages/design-software/design-software-workspace-page"));

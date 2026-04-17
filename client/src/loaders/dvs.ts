import { lazyWithRetry } from "./lazy-utils";

export const DvsVerificationPage = lazyWithRetry(() => import("@/pages/dvs/index"));
export const DvsReleasesPage = lazyWithRetry(() => import("@/pages/dvs/releases"));

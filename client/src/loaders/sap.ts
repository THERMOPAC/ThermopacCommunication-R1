import { lazyWithRetry } from "./lazy-utils";

export const PurchaseModule = lazyWithRetry(() => import("@/pages/PurchaseModule"));
export const SapPurchasingDashboard = lazyWithRetry(() => import("@/pages/SapPurchasingDashboard"));
export const SapPurchaseOrders = lazyWithRetry(() => import("@/pages/SapPurchaseOrders"));
export const SapPurchaseQuotations = lazyWithRetry(() => import("@/pages/SapPurchaseQuotations"));
export const SapGoodsReceipts = lazyWithRetry(() => import("@/pages/SapGoodsReceipts"));
export const SapPurchaseInvoices = lazyWithRetry(() => import("@/pages/SapPurchaseInvoices"));
export const SapIntegrationPage = lazyWithRetry(() => import("@/pages/SapIntegrationPage"));

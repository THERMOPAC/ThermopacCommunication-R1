import { lazyWithRetry } from "./lazy-utils";

export const RadarPage = lazyWithRetry(() => import("@/pages/radar-page"));
export const LeadGenerationPage = lazyWithRetry(() => import("@/pages/lead-generation-page"));
export const LeadsPage = lazyWithRetry(() => import("@/pages/leads-page"));
export const ProductsPage = lazyWithRetry(() => import("@/pages/products-page"));
export const OfferTemplatesPage = lazyWithRetry(() => import("@/pages/offer-templates-page"));
export const OffersPage = lazyWithRetry(() => import("@/pages/offers-page"));
export const CampaignsPage = lazyWithRetry(() => import("@/pages/campaigns-page"));
export const MarketingDashboardPage = lazyWithRetry(() => import("@/pages/marketing-dashboard-page"));
export const MarketingToolsPage = lazyWithRetry(() => import("@/pages/marketing-tools-page"));
export const ROICalculatorPage = lazyWithRetry(() => import("@/pages/roi-calculator-page"));
export const BuyPackagesPage   = lazyWithRetry(() => import("@/pages/buy-packages-page"));

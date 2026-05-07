import { type FyTaxConfig } from './fy-2025-26';

export const FY_2026_27: FyTaxConfig = {
  financialYear: '2026-27',
  standardDeduction: 75_000,
  cessRate: 0.04,
  surchargeRate: 0,
  section87aRebateLimit: 12_00_000,
  section87aRebateCap: 60_000,
  slabs: [
    { min:        0, max:  4_00_000, rate: 0.00 },
    { min:  4_00_000, max:  8_00_000, rate: 0.05 },
    { min:  8_00_000, max: 12_00_000, rate: 0.10 },
    { min: 12_00_000, max: 16_00_000, rate: 0.15 },
    { min: 16_00_000, max: 20_00_000, rate: 0.20 },
    { min: 20_00_000, max: 24_00_000, rate: 0.25 },
    { min: 24_00_000, max: Infinity,  rate: 0.30 },
  ],
};

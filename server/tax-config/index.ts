import { FY_2025_26, type FyTaxConfig, type TaxSlab } from './fy-2025-26';
import { FY_2026_27 } from './fy-2026-27';

const FY_CONFIGS: Record<string, FyTaxConfig> = {
  '2025-26': FY_2025_26,
  '2026-27': FY_2026_27,
};

export function getTaxConfig(financialYear: string): FyTaxConfig {
  const config = FY_CONFIGS[financialYear];
  if (!config) {
    throw new Error(
      `No tax configuration found for FY ${financialYear}. ` +
      `Add a new file to server/tax-config/ and register it in index.ts before running payroll.`
    );
  }
  return config;
}

export type { FyTaxConfig, TaxSlab };

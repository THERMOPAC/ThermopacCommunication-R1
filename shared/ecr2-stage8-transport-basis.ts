/**
 * ECR-2 Stage 8 preliminary transport-property bases.
 *
 * This file closes only root properties needed to calculate preliminary
 * diffusivities. It does not provide a release-grade RRBO characterization or
 * modify any local-property, NRTL, K&H, BVP, or d32 equation.
 */

const ASTM_D341_OFFSET = 0.7;

export const ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS = {
  id: 'rrbo-sn300-viscosity-temperature-screening-v1',
  kinematicViscosity40_cSt: 68,
  kinematicViscosity100_cSt: 7,
  source:
    'Thermopac Feed Master: 68 cSt at 40 °C; TRC Base Oil SN300 product specification: 6–8 cSt at 100 °C (ASTM D445).',
  method:
    'ASTM D341/Walther viscosity-temperature relation fitted to the 40 °C master datum and the 100 °C published SN300 specification-band midpoint (7 cSt).',
  applicability:
    'RRBO SN300 preliminary pure-feed screening only, 25–100 °C. It is not a batch-specific re-refined-oil viscosity characterization.',
  warnings: [
    'RRBO_NMP_VALIDATION_PENDING',
    'The 100 °C value is the midpoint of a published SN300 6–8 cSt specification band; replace this preliminary temperature route with controlled RRBO SN300 vendor or laboratory viscosity data before release-grade use.',
  ],
} as const;

export interface RrboSn300ViscosityAtTemperature {
  value_Pa_s: number;
  kinematicViscosity_cSt: number;
  method: string;
  source: string;
  applicability: string;
  warnings: readonly string[];
}

/**
 * Calculate a pure-RRBO SN300 dynamic viscosity at the operating temperature.
 * ASTM D341 is used only within the explicitly stated preliminary applicability
 * range. The caller supplies the governed RRBO density at that same temperature
 * to convert kinematic viscosity to dynamic viscosity.
 */
export function resolveRrboSn300DynamicViscosityAtTemperature(input: {
  temperature_C: number;
  density_kg_m3: number;
  kinematicViscosity40_cSt?: number;
}): RrboSn300ViscosityAtTemperature | undefined {
  const temperature_C = input.temperature_C;
  const density_kg_m3 = input.density_kg_m3;
  const nu40 = input.kinematicViscosity40_cSt
    ?? ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS.kinematicViscosity40_cSt;
  const nu100 = ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS.kinematicViscosity100_cSt;
  if (!Number.isFinite(temperature_C) || temperature_C < 25 || temperature_C > 100
    || !Number.isFinite(density_kg_m3) || density_kg_m3 <= 0
    || !Number.isFinite(nu40) || nu40 <= 0) {
    return undefined;
  }

  const transform = (nu_cSt: number) => Math.log10(Math.log10(nu_cSt + ASTM_D341_OFFSET));
  const t40_K = 313.15;
  const t100_K = 373.15;
  const b = (transform(nu40) - transform(nu100)) / (Math.log10(t100_K) - Math.log10(t40_K));
  const a = transform(nu40) + b * Math.log10(t40_K);
  const t_K = temperature_C + 273.15;
  const kinematicViscosity_cSt = Math.pow(10, Math.pow(10, a - b * Math.log10(t_K))) - ASTM_D341_OFFSET;
  const value_Pa_s = kinematicViscosity_cSt * density_kg_m3 * 1e-6;
  if (!Number.isFinite(kinematicViscosity_cSt) || kinematicViscosity_cSt <= 0
    || !Number.isFinite(value_Pa_s) || value_Pa_s <= 0) {
    return undefined;
  }
  return {
    value_Pa_s,
    kinematicViscosity_cSt,
    method: ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS.method,
    source: ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS.source,
    applicability: ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS.applicability,
    warnings: ECR2_RRBO_SN300_VISCOSITY_PRELIMINARY_BASIS.warnings,
  };
}
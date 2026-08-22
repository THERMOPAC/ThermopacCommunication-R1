/**
 * ECR-2 NMP/RRBO interfacial-tension temperature basis.
 *
 * A project-fluid interfacial-tension datum is normally valid only at its
 * measurement temperature.  This explicit linear route is the only
 * temperature correction accepted by ECR-2 until a measured temperature
 * series or a more complete governed correlation is approved.
 *
 * The slope is deliberately an input with independent provenance.  There is
 * no defensible universal RRBO/NMP slope because RRBO composition and
 * re-refining history vary by batch.
 */

export const ECR2_RRBO_NMP_SIGMA_LINEAR_BASIS = {
  id: 'rrbo-nmp-interfacial-tension-linear-temperature-v1',
  equation: 'sigma(T) = sigma_anchor + (d_sigma/dT)_controlled * (T - T_anchor)',
  validRangeC: { min: 25, max: 100 },
  applicability:
    'NMP-continuous/RRBO-dispersed ECR-2 preliminary screening only; ' +
    '25–100 °C; the temperature coefficient must be supplied from a controlled ' +
    'NMP/RRBO measurement or approved source for the selected RRBO batch.',
  warnings: [
    'RRBO_NMP_VALIDATION_PENDING',
    'Linear NMP/RRBO interfacial-tension temperature correction is preliminary; replace with a controlled temperature series before release-grade use.',
  ],
} as const;

export interface ECR2SigmaAnchor {
  readonly value_N_m: number;
  readonly temperature_C: number;
  readonly sourceType: string;
  readonly sourceReference: string;
}

export interface ECR2SigmaTemperatureCoefficient {
  /** Interfacial-tension change per °C, in N/(m·°C). */
  readonly slopePerC: number;
  readonly sourceType: string;
  readonly sourceReference: string;
}

export interface ECR2RrboNmpSigmaAtTemperature {
  readonly value_N_m: number;
  readonly requestedTemperature_C: number;
  readonly anchor: ECR2SigmaAnchor;
  readonly method: string;
  readonly basis: string;
  readonly sourceType: string;
  readonly sourceReference: string;
  readonly warnings: readonly string[];
}

/**
 * Resolve an anchored NMP/RRBO interfacial tension at the requested
 * extraction temperature.
 *
 * Returns undefined rather than extrapolating or reusing an anchor when the
 * route is incomplete, outside its applicability range, or produces a
 * non-positive value.
 */
export function resolveEcr2RrboNmpInterfacialTensionAtTemperature(input: {
  temperature_C: number;
  anchor: ECR2SigmaAnchor;
  temperatureCoefficient: ECR2SigmaTemperatureCoefficient;
}): ECR2RrboNmpSigmaAtTemperature | undefined {
  const { temperature_C, anchor, temperatureCoefficient } = input;
  const range = ECR2_RRBO_NMP_SIGMA_LINEAR_BASIS.validRangeC;
  if (!Number.isFinite(temperature_C)
    || temperature_C < range.min
    || temperature_C > range.max
    || !Number.isFinite(anchor.value_N_m)
    || anchor.value_N_m <= 0
    || !Number.isFinite(anchor.temperature_C)
    || !Number.isFinite(temperatureCoefficient.slopePerC)
    || typeof temperatureCoefficient.sourceType !== 'string'
    || temperatureCoefficient.sourceType.trim() === ''
    || typeof temperatureCoefficient.sourceReference !== 'string'
    || temperatureCoefficient.sourceReference.trim() === ''
    || typeof anchor.sourceType !== 'string'
    || anchor.sourceType.trim() === ''
    || typeof anchor.sourceReference !== 'string'
    || anchor.sourceReference.trim() === '') {
    return undefined;
  }

  const value_N_m = anchor.value_N_m
    + temperatureCoefficient.slopePerC * (temperature_C - anchor.temperature_C);
  if (!Number.isFinite(value_N_m) || value_N_m <= 0) return undefined;

  return Object.freeze({
    value_N_m,
    requestedTemperature_C: temperature_C,
    anchor: Object.freeze({ ...anchor }),
    method: ECR2_RRBO_NMP_SIGMA_LINEAR_BASIS.equation,
    basis:
      `${ECR2_RRBO_NMP_SIGMA_LINEAR_BASIS.id}; ` +
      `applicability [${range.min}, ${range.max}] °C`,
    sourceType: anchor.sourceType,
    sourceReference: anchor.sourceReference,
    warnings: Object.freeze([
      ...ECR2_RRBO_NMP_SIGMA_LINEAR_BASIS.warnings,
      `Temperature coefficient source: ${temperatureCoefficient.sourceType}: ${temperatureCoefficient.sourceReference}.`,
    ]),
  });
}
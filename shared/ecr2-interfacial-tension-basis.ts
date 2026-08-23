/**
 * ECR-2 NMP/RRBO interfacial-tension temperature basis.
 *
 * A project-fluid interfacial-tension datum is normally valid only at its
 * measurement temperature. ECR-2 supports either an explicit linear
 * temperature route or an explicitly governed preliminary constant-over-range
 * basis. The latter does not correct the datum and must always disclose that
 * temperature dependence is not modelled.
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

/**
 * The existing preliminary screening sigma anchor may be used unchanged only
 * inside this bounded operating envelope. This is not a sigma(T) correlation:
 * it exists so the simulator can use one governed, provenance-bearing
 * screening basis for user-selected candidate temperatures without silently
 * retagging the anchor.
 */
export const ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS = {
  id: 'rrbo-nmp-interfacial-tension-constant-over-range-v1',
  method: 'Governed preliminary constant-over-range basis; sigma(T) is not modelled',
  validRangeC: { min: 25, max: 100 },
  applicability:
    'NMP-continuous/RRBO-dispersed ECR-2 preliminary screening only; ' +
    '25–100 °C; preserves the source anchor unchanged and is not a measured ' +
    'or correlated temperature dependence.',
  warnings: [
    'RRBO_NMP_VALIDATION_PENDING',
    'INTERFACIAL_TENSION_TEMPERATURE_DEPENDENCE_NOT_MODELLED',
    'NMP/RRBO interfacial tension is held at its governed preliminary anchor value within the stated range; replace with a controlled temperature series or approved correlation before release-grade use.',
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
  readonly resolutionMode:
    | 'governed_temperature_correlation'
    | 'preliminary_constant_over_range';
  readonly applicabilityRange_C: {
    readonly min: number;
    readonly max: number;
  };
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
    resolutionMode: 'governed_temperature_correlation' as const,
    applicabilityRange_C: Object.freeze({ ...range }),
  });
}

/**
 * Resolve a governed preliminary sigma anchor without applying a temperature
 * correction. This is deliberately distinct from the linear route: the value,
 * anchor temperature, and source provenance remain unchanged while the result
 * records the requested temperature and bounded applicability envelope.
 */
export function resolveEcr2RrboNmpInterfacialTensionConstantAtTemperature(input: {
  temperature_C: number;
  anchor: ECR2SigmaAnchor;
}): ECR2RrboNmpSigmaAtTemperature | undefined {
  const { temperature_C, anchor } = input;
  const range = ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.validRangeC;
  if (!Number.isFinite(temperature_C)
    || temperature_C < range.min
    || temperature_C > range.max
    || !Number.isFinite(anchor.value_N_m)
    || anchor.value_N_m <= 0
    || !Number.isFinite(anchor.temperature_C)
    || anchor.temperature_C < range.min
    || anchor.temperature_C > range.max
    || typeof anchor.sourceType !== 'string'
    || anchor.sourceType.trim() === ''
    || typeof anchor.sourceReference !== 'string'
    || anchor.sourceReference.trim() === '') {
    return undefined;
  }

  return Object.freeze({
    value_N_m: anchor.value_N_m,
    requestedTemperature_C: temperature_C,
    anchor: Object.freeze({ ...anchor }),
    method: ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.method,
    basis:
      `${ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.id}; ` +
      `applicability [${range.min}, ${range.max}] °C; ` +
      `anchor ${anchor.temperature_C} °C retained unchanged`,
    sourceType: anchor.sourceType,
    sourceReference: anchor.sourceReference,
    warnings: Object.freeze([
      ...ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.warnings,
    ]),
    resolutionMode: 'preliminary_constant_over_range' as const,
    applicabilityRange_C: Object.freeze({ ...range }),
  });
}
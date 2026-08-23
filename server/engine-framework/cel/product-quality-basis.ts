// ─────────────────────────────────────────────────────────────────────────────
// LLX product-quality basis helpers.
//
// These are reporting definitions only. They do not alter equilibrium,
// cascade, BVP, transport, or material-transfer calculations.
// ─────────────────────────────────────────────────────────────────────────────

export const AROMATIC_COMPONENT_INDICES = [1, 2, 3] as const;
export const HYDROCARBON_COMPONENT_INDICES = [0, 1, 2, 3] as const;
export const FIVE_COMPONENT_NAMES = ['saturates', 'monoAromatics', 'diAromatics', 'polyAromatics', 'NMP'] as const;

export interface AromaticFractionQuantity {
  /** Mathematical symbol used in reports and UI labels. */
  symbol: 'x_A,R^LLE' | 'x_A,R^product' | 'w_A,R^product';
  /** Fraction on the stated basis, in [0, 1]. */
  value: number;
  /** Explicit dimensional basis for the fraction. */
  unit: 'mol/mol' | 'kg/kg';
  /** Human-readable numerator component set. */
  numeratorComponents: readonly string[];
  /** Human-readable denominator component set. */
  denominatorComponents: readonly string[];
  /** Whether NMP contributes to the denominator. */
  denominatorIncludesNMP: boolean;
}

export interface LLEAromaticQuantity extends AromaticFractionQuantity {
  symbol: 'x_A,R^LLE';
  unit: 'mol/mol';
  /** The original five-component composition used by the LLE result. */
  componentMoleFractions: readonly number[];
  basis: 'full five-component phase composition';
}

export interface ProductQualityQuantities {
  /** Hydrocarbon-only aromatic molar fraction, x_A,R^product. */
  ['x_A_R_product']: AromaticFractionQuantity;
  /** Hydrocarbon-only aromatic mass fraction, w_A,R^product. */
  ['w_A_R_product']: AromaticFractionQuantity;
  basis: 'hydrocarbon-only raffinate/product composition';
  componentOrder: readonly string[];
  excludedComponents: readonly string[];
}

function sumAt(values: readonly number[], indices: readonly number[]): number {
  return indices.reduce((total, index) => total + (values[index] ?? 0), 0);
}

function assertFiveComponentVector(values: readonly number[], label: string): void {
  if (
    values.length !== FIVE_COMPONENT_NAMES.length ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${label} must contain five finite non-negative component values in [Sat, Mono, Di, Poly, NMP] order`);
  }
}

/**
 * Existing thermodynamic/LLE aromatic definition.
 *
 * This intentionally includes NMP in the denominator and must not be used as
 * a commercial hydrocarbon product-quality metric.
 */
export function calculateLLEAromaticQuantity(
  componentMoleFractions: readonly number[],
): LLEAromaticQuantity {
  assertFiveComponentVector(componentMoleFractions, 'componentMoleFractions');
  const denominator = sumAt(componentMoleFractions, [0, 1, 2, 3, 4]);
  if (!(denominator > 0)) throw new Error('componentMoleFractions must contain positive total composition');
  const numerator = sumAt(componentMoleFractions, AROMATIC_COMPONENT_INDICES);
  return {
    symbol: 'x_A,R^LLE',
    value: numerator / denominator,
    unit: 'mol/mol',
    numeratorComponents: ['Mono-aromatics', 'Di-aromatics', 'Poly-aromatics'],
    denominatorComponents: [...FIVE_COMPONENT_NAMES],
    denominatorIncludesNMP: true,
    componentMoleFractions: [...componentMoleFractions],
    basis: 'full five-component phase composition',
  };
}

/**
 * Commercial product-quality definitions.
 *
 * Both denominators deliberately contain only the four hydrocarbon classes.
 * NMP may be present in the supplied phase state, but cannot improve either
 * product-quality quantity.
 */
export function calculateHydrocarbonProductQuality(input: {
  componentMoleFractions: readonly number[];
  componentMassFlows_kg_h?: readonly number[];
  componentMolecularWeights_g_mol?: readonly number[];
}): ProductQualityQuantities {
  const { componentMoleFractions, componentMassFlows_kg_h, componentMolecularWeights_g_mol } = input;
  assertFiveComponentVector(componentMoleFractions, 'componentMoleFractions');

  const molarDenominator = sumAt(componentMoleFractions, HYDROCARBON_COMPONENT_INDICES);
  if (!(molarDenominator > 0)) throw new Error('Hydrocarbon component mole fraction denominator must be positive');
  const xProduct = sumAt(componentMoleFractions, AROMATIC_COMPONENT_INDICES) / molarDenominator;

  let massFlows: readonly number[];
  if (componentMassFlows_kg_h !== undefined) {
    assertFiveComponentVector(componentMassFlows_kg_h, 'componentMassFlows_kg_h');
    massFlows = componentMassFlows_kg_h;
  } else {
    if (
      componentMolecularWeights_g_mol === undefined ||
      componentMolecularWeights_g_mol.length !== FIVE_COMPONENT_NAMES.length ||
      componentMolecularWeights_g_mol.some((value) => !Number.isFinite(value) || value <= 0)
    ) {
      throw new Error('componentMolecularWeights_g_mol is required when componentMassFlows_kg_h is not supplied');
    }
    massFlows = componentMoleFractions.map((value, index) => value * componentMolecularWeights_g_mol[index]);
  }
  const massDenominator = sumAt(massFlows, HYDROCARBON_COMPONENT_INDICES);
  if (!(massDenominator > 0)) throw new Error('Hydrocarbon component mass denominator must be positive');
  const wProduct = sumAt(massFlows, AROMATIC_COMPONENT_INDICES) / massDenominator;

  const hydrocarbonNames = FIVE_COMPONENT_NAMES.slice(0, 4);
  const aromaticNames = ['Mono-aromatics', 'Di-aromatics', 'Poly-aromatics'];
  const base = {
    numeratorComponents: aromaticNames,
    denominatorComponents: hydrocarbonNames,
    denominatorIncludesNMP: false,
  } as const;

  return {
    x_A_R_product: {
      symbol: 'x_A,R^product',
      value: xProduct,
      unit: 'mol/mol',
      ...base,
    },
    w_A_R_product: {
      symbol: 'w_A,R^product',
      value: wProduct,
      unit: 'kg/kg',
      ...base,
    },
    basis: 'hydrocarbon-only raffinate/product composition',
    componentOrder: [...FIVE_COMPONENT_NAMES],
    excludedComponents: ['NMP'],
  };
}
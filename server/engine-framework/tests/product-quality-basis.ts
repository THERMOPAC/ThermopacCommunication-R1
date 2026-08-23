// Product-quality basis regression tests.
// Run: npx tsx server/engine-framework/tests/product-quality-basis.ts

import {
  calculateHydrocarbonProductQuality,
  calculateLLEAromaticQuantity,
} from '../cel/product-quality-basis';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function nearly(actual: number, expected: number, tolerance = 1e-12): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function main(): void {
  console.log('── Product-quality basis separation ──');

  // Same hydrocarbon product composition, with very different residual NMP.
  // The full phase has to change; neither hydrocarbon-only product metric may.
  const lowNmp = [0.70, 0.10, 0.10, 0.05, 0.05];
  const highNmp = [0.35, 0.05, 0.05, 0.025, 0.525];
  const hydrocarbonMassFlows = [70, 10, 10, 5];

  const lleLow = calculateLLEAromaticQuantity(lowNmp);
  const lleHigh = calculateLLEAromaticQuantity(highNmp);
  const productLow = calculateHydrocarbonProductQuality({
    componentMoleFractions: lowNmp,
    componentMassFlows_kg_h: [...hydrocarbonMassFlows, 5],
  });
  const productHigh = calculateHydrocarbonProductQuality({
    componentMoleFractions: highNmp,
    componentMassFlows_kg_h: [...hydrocarbonMassFlows, 105],
  });

  check('historical LLE aromatic definition retains all five components',
    nearly(lleLow.value, (lowNmp[1] + lowNmp[2] + lowNmp[3]) / lowNmp.reduce((sum, value) => sum + value, 0)));
  check('residual NMP changes full-phase LLE aromatics', !nearly(lleLow.value, lleHigh.value));
  check('residual NMP does not improve product molar aromatics',
    nearly(productLow.x_A_R_product.value, productHigh.x_A_R_product.value));
  check('residual NMP does not improve product mass aromatics',
    nearly(productLow.w_A_R_product.value, productHigh.w_A_R_product.value));
  check('product molar denominator excludes NMP',
    !productLow.x_A_R_product.denominatorIncludesNMP &&
    productLow.x_A_R_product.denominatorComponents.length === 4);
  check('product mass denominator excludes NMP',
    !productLow.w_A_R_product.denominatorIncludesNMP &&
    productLow.w_A_R_product.denominatorComponents.length === 4);
  check('product mass fraction follows hydrocarbon mass only',
    nearly(productLow.w_A_R_product.value, 25 / 95));

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
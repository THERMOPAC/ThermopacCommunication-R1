// Generated exact-source functional extraction; see source-extracts.json.
// Only TypeScript non-null assertions are removed. No source imports copied.
const finite = value => typeof value === "number" && Number.isFinite(value);
const positiveFinite = value => finite(value) && value > 0;
const fail = code => { throw new Error(code); };
export function sizeSelectedGeometry(optimizerGeometry) {
const STAGE4_HETS_DESIGN_NT = 7;
const STAGE4_DESIGN_COMPARTMENT_EFFICIENCY = 0.35;

  const optimizedHydraulics = optimizerGeometry?.status === 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY'
    && positiveFinite(optimizerGeometry.columnDiameterM)
    && positiveFinite(optimizerGeometry.compartmentHeightM)
    && positiveFinite(optimizerGeometry.hcToColumn)
    && optimizerGeometry.hcToColumn >= 0.2
    && optimizerGeometry.hcToColumn <= 0.3
    && positiveFinite(optimizerGeometry.rotorDiameterM)
    && positiveFinite(optimizerGeometry.rotorToColumn)
    && optimizerGeometry.rotorToColumn >= 0.33
    && optimizerGeometry.rotorToColumn <= 0.5
    && positiveFinite(optimizerGeometry.freeArea)
    && optimizerGeometry.freeArea >= 0.2
    && optimizerGeometry.freeArea <= 0.4
    && positiveFinite(optimizerGeometry.rpm)
    && optimizerGeometry.rpm >= 30
    && optimizerGeometry.rpm <= 70
    && Math.abs(
      optimizerGeometry.compartmentHeightM - optimizerGeometry.columnDiameterM * optimizerGeometry.hcToColumn,
    ) <= 1e-9
    && Math.abs(
      optimizerGeometry.rotorDiameterM - optimizerGeometry.columnDiameterM * optimizerGeometry.rotorToColumn,
    ) <= 1e-9;
  if (!optimizedHydraulics) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }

  const diameterM = optimizerGeometry.columnDiameterM;
  const compartmentHeightM = optimizerGeometry.compartmentHeightM;
  const requiredPhysicalCompartments = Math.ceil(
    STAGE4_HETS_DESIGN_NT / STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
  );
  const installedActiveHeightM = Math.round(
    requiredPhysicalCompartments * compartmentHeightM * 1e12,
  ) / 1e12;
  const requiredActiveHeightM = installedActiveHeightM;
  const impliedInstalledHetsMPerTheoreticalStage =
    installedActiveHeightM / STAGE4_HETS_DESIGN_NT;
  if (!finite(compartmentHeightM) || !finite(impliedInstalledHetsMPerTheoreticalStage)
    || !Number.isInteger(requiredPhysicalCompartments) || requiredPhysicalCompartments < 1
    || !finite(installedActiveHeightM)) fail('STAGE4_COMPARTMENT_EFFICIENCY_CALCULATION_INVALID');

return { diameterM, compartmentHeightM, requiredPhysicalCompartments, installedActiveHeightM, requiredActiveHeightM, impliedInstalledHetsMPerTheoreticalStage, designNt: STAGE4_HETS_DESIGN_NT, adoptedEfficiency: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY };
}

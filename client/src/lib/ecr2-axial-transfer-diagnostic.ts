const COMPONENTS = [
  { key: "saturates", label: "Saturates", index: 0 },
  { key: "mono", label: "Mono-aromatics", index: 1 },
  { key: "di", label: "Di-aromatics", index: 2 },
  { key: "poly", label: "Poly-aromatics", index: 3 },
] as const;

const AROMATIC_INDICES = [1, 2, 3] as const;
const VECTOR_LENGTH = 5;

type NumericVector = number[];

function finiteVector(value: unknown): NumericVector | null {
  if (!Array.isArray(value) || value.length < VECTOR_LENGTH) return null;
  const vector = value.slice(0, VECTOR_LENGTH).map(Number);
  return vector.every(Number.isFinite) ? vector : null;
}

function finiteAt(value: unknown, index: number): number | null {
  if (!Array.isArray(value)) return null;
  const numeric = Number(value[index]);
  return Number.isFinite(numeric) ? numeric : null;
}

function sumAt(vector: NumericVector, indices: readonly number[]) {
  return indices.reduce((total, index) => total + vector[index], 0);
}

function acceptedPreliminaryTrial(trial: any) {
  return trial?.status === "feasible_preliminary"
    && trial?.bvp?.status === "converged"
    && trial?.bvp?.massBalanceStatus === "passed";
}

export function findEcr2AcceptedAxialDiagnosticTrial(diameterSizing: any) {
  if (!Array.isArray(diameterSizing?.trials)) return null;

  return [...diameterSizing.trials]
    .filter(acceptedPreliminaryTrial)
    .sort((left, right) => Number(left.diameter_m) - Number(right.diameter_m))[0] ?? null;
}

export function buildEcr2AxialTransferDiagnostic(trial: any) {
  if (!acceptedPreliminaryTrial(trial)) return null;

  const bvp = trial.bvp;
  const compartments = Array.isArray(bvp?.compartments) ? bvp.compartments : [];
  if (compartments.length === 0) return null;

  const rrboFeed = finiteVector(compartments[0]?.dispersedIncoming_kg_h);
  const nmpFeed = finiteVector(compartments.at(-1)?.continuousIncoming_kg_h);
  const raffinate = finiteVector(bvp?.outlets?.raffinate?.componentFlows_kg_h);
  const extract = finiteVector(bvp?.outlets?.extract?.componentFlows_kg_h);
  if (!rrboFeed || !nmpFeed || !raffinate || !extract) return null;

  const profile = Array.isArray(bvp.axialProfile) ? bvp.axialProfile : [];
  const cumulative = Array(VECTOR_LENGTH).fill(0);
  const increments = compartments.map((compartment: any, index: number) => {
    const transferAmount = finiteVector(compartment?.transferAmount_kg_h);
    if (!transferAmount) return null;
    const point = profile[index] ?? {};

    for (let componentIndex = 0; componentIndex < VECTOR_LENGTH; componentIndex++) {
      cumulative[componentIndex] += transferAmount[componentIndex];
    }

    return {
      compartmentIndex: Number(compartment.compartmentIndex) || index + 1,
      zBottom_m: Number.isFinite(Number(compartment.z_bottom_m)) ? Number(compartment.z_bottom_m) : null,
      zTop_m: Number.isFinite(Number(compartment.z_top_m)) ? Number(compartment.z_top_m) : null,
      zCentre_m: Number.isFinite(Number(compartment.z_centre_m)) ? Number(compartment.z_centre_m) : null,
      holdup_phi_d: Number.isFinite(Number(compartment?.holdup?.phi))
        ? Number(compartment.holdup.phi)
        : finiteAt(point.phi_d, 0),
      d32_m: Number.isFinite(Number(compartment?.d32?.d32_m))
        ? Number(compartment.d32.d32_m)
        : Number.isFinite(Number(point.d32_m))
          ? Number(point.d32_m)
          : null,
      interfacialArea_m2_m3: Number.isFinite(Number(compartment?.interfacialArea?.a_m2_m3))
        ? Number(compartment.interfacialArea.a_m2_m3)
        : null,
      components: COMPONENTS.map((component) => ({
        ...component,
        transferAmount_kg_h: transferAmount[component.index],
        cumulativeTransfer_kg_h: cumulative[component.index],
        cumulativeFeedFraction: rrboFeed[component.index] > 0
          ? cumulative[component.index] / rrboFeed[component.index]
          : null,
        Koa_per_s: finiteAt(point.Koa_per_s, component.index),
        drivingForce_kg_m3: finiteAt(point.drivingForce_kg_m3, component.index),
        transferRate_kg_m3_s: finiteAt(point.transferRate_kg_m3_s, component.index),
      })),
    };
  });

  if (increments.some((increment) => increment === null)) return null;

  const reconciliation = COMPONENTS.map((component) => {
    const transfer_kg_h = cumulative[component.index];
    const raffinateLoss_kg_h = rrboFeed[component.index] - raffinate[component.index];
    const extractGain_kg_h = extract[component.index] - nmpFeed[component.index];
    return {
      ...component,
      feed_kg_h: rrboFeed[component.index],
      raffinate_kg_h: raffinate[component.index],
      extract_kg_h: extract[component.index],
      transfer_kg_h,
      raffinateLoss_kg_h,
      extractGain_kg_h,
      transferFeedFraction: rrboFeed[component.index] > 0
        ? transfer_kg_h / rrboFeed[component.index]
        : null,
      componentBalance_kg_h: rrboFeed[component.index] + nmpFeed[component.index]
        - raffinate[component.index] - extract[component.index],
    };
  });

  const aromaticTransfer_kg_h = sumAt(cumulative, AROMATIC_INDICES);
  const aromaticFeed_kg_h = sumAt(rrboFeed, AROMATIC_INDICES);
  const aromaticRaffinate_kg_h = sumAt(raffinate, AROMATIC_INDICES);
  const aromaticExtract_kg_h = sumAt(extract, AROMATIC_INDICES);
  const aromaticNmpFeed_kg_h = sumAt(nmpFeed, AROMATIC_INDICES);

  return {
    diameter_m: Number.isFinite(Number(trial.diameter_m)) ? Number(trial.diameter_m) : null,
    requiredActiveHeight_m: Number.isFinite(Number(trial.requiredActiveHeight_m))
      ? Number(trial.requiredActiveHeight_m)
      : null,
    selectedNumberOfCells: Number(trial?.heightSizing?.selectedNumberOfCells) || increments.length,
    selectedDeltaZ_m: Number.isFinite(Number(trial?.heightSizing?.selectedDeltaZ_m))
      ? Number(trial.heightSizing.selectedDeltaZ_m)
      : null,
    productAromaticsMoleFraction: Number.isFinite(Number(trial.productAromaticsMoleFraction))
      ? Number(trial.productAromaticsMoleFraction)
      : null,
    governance: trial.governance ?? null,
    increments,
    reconciliation,
    aromaticReconciliation: {
      label: "Total aromatics (Mono + Di + Poly)",
      feed_kg_h: aromaticFeed_kg_h,
      raffinate_kg_h: aromaticRaffinate_kg_h,
      extract_kg_h: aromaticExtract_kg_h,
      transfer_kg_h: aromaticTransfer_kg_h,
      raffinateLoss_kg_h: aromaticFeed_kg_h - aromaticRaffinate_kg_h,
      extractGain_kg_h: aromaticExtract_kg_h - aromaticNmpFeed_kg_h,
      transferFeedFraction: aromaticFeed_kg_h > 0 ? aromaticTransfer_kg_h / aromaticFeed_kg_h : null,
      componentBalance_kg_h: aromaticFeed_kg_h + aromaticNmpFeed_kg_h - aromaticRaffinate_kg_h - aromaticExtract_kg_h,
    },
  };
}
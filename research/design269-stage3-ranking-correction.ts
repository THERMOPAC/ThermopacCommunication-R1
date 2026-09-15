/**
 * Read-only research replay for the user-approved Stage-3 ranking correction.
 *
 * This script reads the existing immutable Stage-1 snapshot for design 269
 * (project 236), derives the already-governed hydrodynamic basis, and performs
 * a pure in-process optimizer calculation.  It never inserts, updates, or
 * deletes database rows and never prints actor identity or connection data.
 */
import { writeFile } from 'node:fs/promises';
import { pool } from '../server/db';
import {
  makeStage1HydrodynamicProcessBasis,
  validateStage1Snapshot,
} from '../server/ecr-pre-pilot/stage1';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
  OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM,
  optimizeStage3Stage4,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

const DESIGN_ID = 269;
const PROJECT_NUMBER = 236;
const JSON_PATH = 'research/design269-stage3-ranking-correction.json';
const MARKDOWN_PATH = 'research/design269-stage3-ranking-correction.md';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numeric(value: unknown, digits = 3): string {
  return finite(value) ? value.toFixed(digits) : '—';
}

function rankingSummary(orientation: any) {
  return {
    orientation: orientation.orientation,
    status: orientation.status,
    selectedGeometry: orientation.selectedGeometry,
    selectedOperatingWindow: orientation.operatingWindow,
    selectedRpm: orientation.selectedRpm,
    rankingEvidence: orientation.rankingEvidence ?? null,
  };
}

async function main() {
  const source = await pool.query<{ project_number: number; input_data: unknown }>(
    `SELECT project_number,input_data
       FROM ecr_pre_pilot_designs
      WHERE id=$1`,
    [DESIGN_ID],
  );
  if (!source.rows[0] || Number(source.rows[0].project_number) !== PROJECT_NUMBER) {
    throw new Error('DESIGN269_PROJECT236_READ_ONLY_SOURCE_NOT_FOUND');
  }
  const stage1 = validateStage1Snapshot(source.rows[0].input_data);
  const basis = makeStage1HydrodynamicProcessBasis(stage1);
  const result = optimizeStage3Stage4(basis, stage1.immutableHash);
  const allTrials = result.orientationComparison.flatMap((orientation) =>
    orientation.geometryGrid.flatMap((group) => group.trials));
  const feasibleTrials = allTrials.filter((trial) => trial.status === 'FEASIBLE');
  const hydraulicInvariant = {
    acceptedDesignNt: result.designNt.value,
    acceptedHcToColumnBounds: [0.2, 0.3],
    acceptedRotorToColumnBounds: [0.33, 0.5],
    acceptedFreeAreaBounds: [0.2, 0.4],
    acceptedRpmBounds: [30, 70],
    acceptedTipSpeedMaximumMS: 4.5,
    acceptedDesignFloodFractionMaximum: 0.7,
    feasibleTrialCount: feasibleTrials.length,
    allFeasibleTipSpeedsWithinBound: feasibleTrials.every((trial) =>
      finite(trial.tipSpeedMS) && trial.tipSpeedMS <= 4.5 + 1e-12),
    allFeasibleHydraulicPass: feasibleTrials.every((trial) => trial.hydraulicPass === true),
    allFeasibleLoadingWithinBound: feasibleTrials.every((trial) =>
      finite(trial.actualLoading) && trial.actualLoading <= 0.7 + 1e-12),
  };
  const report = {
    reportSchema: 'ECR_STAGE3_RANKING_CORRECTION_RESEARCH_V1',
    calculationMode: 'READ_ONLY_CURRENT_STAGE1_PURE_CALCULATION',
    source: {
      databaseTable: 'ecr_pre_pilot_designs',
      designId: DESIGN_ID,
      projectNumber: PROJECT_NUMBER,
      stage1SnapshotHash: stage1.immutableHash,
      stage1ScientificSource: 'CURRENT_IMMUTABLE_STAGE1_SNAPSHOT',
      databaseMutation: 'NONE',
      actorIdentity: 'NOT_READ_OR_REPORTED',
    },
    engine: {
      version: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
      implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
      usefulWindowPreferenceRpm: OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM,
      usefulWindowMeaning: 'RANKING_PREFERENCE_NOT_HYDRAULIC_LIMIT',
    },
    controls: result.controls,
    processBasis: result.processBasis,
    selectedOrientation: result.selectedOrientation,
    selectedGeometry: result.selectedGeometry,
    selectedOperatingWindow: result.selectedOperatingWindow,
    selectedRpm: result.selectedRpm,
    selectionRationale: result.selectionRationale,
    orientationSummaries: result.orientationComparison.map(rankingSummary),
    orientationDiagnostics: result.orientationComparison.map((orientation) => ({
      orientation: orientation.orientation,
      rejectedTrialCount: orientation.rejectedTrialCount,
      rejectionReasons: orientation.rejectionReasons,
      rootSearch: orientation.rootSearch,
      freeAreaSensitivity: orientation.freeAreaSensitivity,
    })),
    hydraulicInvariant,
  };
  await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const selected = result.selectedGeometry;
  const selectedWindow = result.selectedOperatingWindow;
  const alternatives = result.selectionRationale.alternatives ?? [];
  const sizeWindowComparisons = result.selectionRationale.sizeWindowComparisons ?? [];
  const compactComparison = sizeWindowComparisons.find((item) =>
    Math.abs(item.geometry.columnDiameterM - 0.7) <= 1e-12);
  const alternativeLines = alternatives.length
    ? alternatives.map((item) =>
      `| ${item.role} | ${numeric(item.geometry.columnDiameterM)} | ${numeric(item.geometry.compartmentHeightM)} | ${numeric(item.geometry.hcToColumn, 2)} | ${numeric(item.geometry.rotorDiameterM)} | ${numeric(item.geometry.rotorToColumn, 2)} | ${numeric(item.geometry.freeArea, 2)} | ${item.operatingWindow.rpmMin}–${item.operatingWindow.rpmMax} | ${item.operatingWindow.widthRpm} | ${numeric(item.representativeTrial?.rpm, 1)} | ${numeric(item.representativeTrial?.tipSpeedMS, 3)} | ${numeric(item.representativeTrial?.actualLoading, 3)} | ${numeric(item.representativeTrial?.designFloodFraction, 2)} | ${numeric(item.representativeTrial?.d32M, 5)} | ${item.meetsUsefulWindowPreference ? 'yes' : 'no'} | ${item.rationale} |`).join('\n')
    : '| — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | No frontier alternative was available. |';
  const sizeComparisonLines = sizeWindowComparisons.length
    ? sizeWindowComparisons.map((item) =>
      `| ${item.role} | ${numeric(item.geometry.columnDiameterM)} | ${numeric(item.geometry.compartmentHeightM)} | ${numeric(item.geometry.hcToColumn, 2)} | ${numeric(item.geometry.rotorDiameterM)} | ${numeric(item.geometry.rotorToColumn, 2)} | ${numeric(item.geometry.freeArea, 2)} | ${item.operatingWindow.rpmMin}–${item.operatingWindow.rpmMax} | ${item.operatingWindow.widthRpm} | ${numeric(item.representativeTrial?.rpm, 1)} | ${numeric(item.representativeTrial?.tipSpeedMS, 3)} | ${numeric(item.representativeTrial?.actualLoading, 3)} | ${numeric(item.representativeTrial?.designFloodFraction, 2)} | ${numeric(item.representativeTrial?.d32M, 5)} | ${item.meetsUsefulWindowPreference ? 'yes' : 'no'} | ${item.rationale} |`).join('\n')
    : '| — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | No occupied-grid size comparison was available. |';
  const markdown = `# Stage-3 ranking correction — design 269 / project 236

## Scope and method

This is a read-only pure calculation from the current immutable Stage-1
snapshot. No database row was inserted, updated, or deleted; no actor identity
was read or reported. The Stage-1 snapshot hash is
\`${stage1.immutableHash}\`.

The immutable ranking engine is **${ECR_STAGE3_STAGE4_OPTIMIZER_VERSION}**
(\`${ECR_STAGE3_STAGE4_OPTIMIZER_HASH}\`). The existing hydraulic equations,
signed force/capacity gates, fixed design \\(N_T=7\\), HETS \\(=1.0\\) m screening
basis, and geometry/RPM bounds are unchanged. A contiguous window width of
**${OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM} rpm** is a visible ranking
preference only, not a hydraulic limit. Among candidates meeting it, the
smallest adequate column is selected; the non-dominated diameter/window
frontier is retained without cost or fabricated power weights.

## Selected result

| Field | Value |
| --- | --- |
| Stage-1 orientation | ${result.selectedOrientation ?? 'none'} |
| Column diameter | ${selected ? `${selected.columnDiameterM.toFixed(3)} m` : 'none'} |
| Compartment ratio \\(h_c/D\\) | ${selected ? selected.hcToColumn.toFixed(2) : 'none'} |
| Compartment height | ${selected ? `${selected.compartmentHeightM.toFixed(3)} m` : 'none'} |
| Rotor diameter | ${selected ? `${selected.rotorDiameterM.toFixed(3)} m` : 'none'} |
| Rotor ratio \\(D_R/D\\) | ${selected ? selected.rotorToColumn.toFixed(2) : 'none'} |
| Free area | ${selected ? selected.freeArea.toFixed(2) : 'none'} |
| Selected RPM | ${result.selectedRpm ?? 'none'} |
| Useful window | ${selectedWindow ? `${selectedWindow.rpmMin}–${selectedWindow.rpmMax} rpm (${selectedWindow.widthRpm} rpm)` : 'none'} |
| Representative loading | ${numeric(result.selectedTrial?.actualLoading, 3)} |
| Representative d32 | ${numeric(result.selectedTrial?.d32M, 5)} m |
| Representative holdup | ${numeric(result.selectedTrial?.holdup, 4)} |
| Preference met | ${result.selectionRationale.usefulWindowPreference?.selectedMeetsPreference ?? false} |

## Occupied-grid size/window comparison

This table deliberately keeps the new lower-diameter selected candidate and
the occupied-grid comparison candidates visible. It is evidence, not a cost
optimization: a candidate is not removed merely because another candidate
dominates it on the diameter/window frontier. The selected-result metrics above
use the actual persisted selected trial; comparison rows use a deterministic
midpoint representative trial so each occupied geometry can be compared on
loading, tip speed, d32, and holdup.

| Role | D (m) | hc (m) | hc/D | Rotor (m) | rotor/D | Free area | Window (rpm) | Width | Representative RPM | Tip speed | Loading | Flood fraction | d32 (m) | Meets preference | Rationale |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
${sizeComparisonLines}

${compactComparison
  ? `The selected **${selected ? selected.columnDiameterM.toFixed(3) : 'none'} m** candidate is retained alongside the occupied-grid **${compactComparison.geometry.columnDiameterM.toFixed(3)} m** candidate${selectedWindow && compactComparison.operatingWindow.widthRpm === selectedWindow.widthRpm ? ' with the same window width' : ''}: the explicit 15 rpm preference is met and diameter-first ranking selects the smallest adequate geometry, without inventing an equipment-cost weight.`
  : 'No 0.700 m occupied-grid candidate was feasible in this bounded calculation; the report does not invent one.'}

## Retained frontier alternatives

| Role | D (m) | hc (m) | hc/D | Rotor (m) | rotor/D | Free area | Window (rpm) | Width | Representative RPM | Tip speed | Loading | Flood fraction | d32 (m) | Meets preference | Rationale |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
${alternativeLines}

The selected compact/wider labels are derived from the numerical Pareto
frontier; no diameter is hardcoded as the winner. If a future Stage-1 basis
produces a different smallest adequate diameter, that value is selected and
reported.

## Hydraulic invariant checks

* Feasible trial count: ${hydraulicInvariant.feasibleTrialCount}
* All feasible tip speeds \\(\\le 4.5\\) m/s: ${hydraulicInvariant.allFeasibleTipSpeedsWithinBound}
* All feasible trials pass the existing hydraulic gate: ${hydraulicInvariant.allFeasibleHydraulicPass}
* All feasible loading values \\(\\le 0.7\\): ${hydraulicInvariant.allFeasibleLoadingWithinBound}
* Bounds retained: \\(D=0.2..1.5\\) m in 0.1 m steps; 30..70 rpm in 5 rpm
  steps; \\(h_c/D=0.20,0.25,0.30\\); \\(D_R/D=0.33,0.40,0.50\\); free area
  \\(=0.20,0.30,0.40\\).

The complete ranking evidence, rejection reasons, root diagnostics, and
immutable Stage-1 process basis are in
[\`${JSON_PATH}\`](./${JSON_PATH.split('/').pop()}).
`;
  await writeFile(MARKDOWN_PATH, markdown, 'utf8');
  console.log(JSON.stringify({
    status: result.status,
    selectedOrientation: result.selectedOrientation,
    selectedDiameterM: selected?.columnDiameterM ?? null,
    selectedWindow: selectedWindow
      ? [selectedWindow.rpmMin, selectedWindow.rpmMax, selectedWindow.widthRpm]
      : null,
    alternativeCount: alternatives.length,
  }));
}

try {
  await main();
} finally {
  await pool.end();
}
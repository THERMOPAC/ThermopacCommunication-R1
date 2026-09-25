import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeStage1HydrodynamicProcessBasis, evaluateP1ReviewTrial, kuhniRunHash,
  resolveAutomaticHydraulicSelection, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION } from './runtime/engine.mjs';

export function replay(input) {
  if (input.schemaVersion !== 'STAGE3_HANDOVER_INPUT_V1') throw Error('INVALID_INPUT_SCHEMA');
  const basis = makeStage1HydrodynamicProcessBasis(input.snapshot);
  if (basis.phaseConfiguration !== 'rrbo-continuous-nmp-dispersed' || basis.operatingTemperatureC !== 40)
    throw Error('ONLY_SAVED_40C_RRBO_CONTINUOUS_ROUTE_SUPPORTED');
  const grid = input.grid;
  for (const key of ['diameterM','hcToColumn','rotorToColumn','freeArea','rpm'])
    if (!Array.isArray(grid[key]) || !grid[key].length || grid[key].some(v => !Number.isFinite(v) || v <= 0))
      throw Error(`INVALID_GRID_${key}`);
  const geometryGrid = [];
  for (const d of grid.diameterM) for (const hc of grid.hcToColumn)
    for (const rotor of grid.rotorToColumn) for (const free of grid.freeArea) {
      const geometry = { columnDiameterM: d, compartmentHeightM: d * hc, hcToColumn: hc,
        rotorDiameterM: d * rotor, rotorToColumn: rotor, freeArea: free };
      const trials = grid.rpm.map(rpm => evaluateP1ReviewTrial(basis, d, hc, rotor, free, rpm));
      geometryGrid.push({ geometry, trials });
    }
  // An explicit local envelope, NOT an optimizer/app persisted result or saved authority.
  const payload = {
    engine: { version: ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION,
      implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH },
    stage1Authority: { snapshotHash: basis.stage1SnapshotHash }, processBasis: basis,
    candidateGrid: [{ orientation: basis.phaseConfiguration, ...grid }],
    orientationComparison: [{ orientation: basis.phaseConfiguration, geometryGrid }],
  };
  const run = { id: 'LOCAL_HANDOVER_REPLAY_NOT_SAVED_APP_RUN', status: 'completed',
    sourceSnapshotHash: basis.stage1SnapshotHash, basis, phaseConfiguration: basis.phaseConfiguration,
    result: { ...payload, calculationHash: kuhniRunHash(payload) } };
  return { schemaVersion: 'STAGE3_HANDOVER_OUTPUT_V1', provenance: 'NEW_LOCAL_REPLAY_NOT_DATABASE_AUTHORITY',
    run, selection: resolveAutomaticHydraulicSelection(run, basis.stage1SnapshotHash) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(process.argv[2] ?? 'input.json', 'utf8'));
  const outputPath = process.argv[3] ?? 'replay-output/result.json';
  const output = replay(input);
  mkdirSync(new URL('.', pathToFileURL(outputPath)), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(output));
  console.log(JSON.stringify({ outputPath, provenance: output.provenance,
    trials: output.run.result.orientationComparison[0].geometryGrid.reduce((n,g)=>n+g.trials.length,0),
    feasible: output.selection.feasibleConfigurationCount, status: output.selection.status,
    selectedGeometry: output.selection.selected?.geometry, rpm: output.selection.selected?.trial.rpm }, null, 2));
}
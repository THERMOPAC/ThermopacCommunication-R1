import { writeFileSync } from 'node:fs';
import { pool } from '../server/db';
import { validateStage1Snapshot, makeStage1HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/stage1';
import { optimizeStage3Stage4 } from '../server/ecr-pre-pilot/stage3-stage4-optimizer';
import { evaluateKuhniReverseTrial } from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v140';

async function main() {
  const rows = await pool.query('SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1', [269]);
  const snapshot = validateStage1Snapshot(rows.rows[0].input_data);
  const basis = makeStage1HydrodynamicProcessBasis(snapshot);
  const result = optimizeStage3Stage4(basis, snapshot.immutableHash);
  const orientation = result.orientationComparison.find(x => x.orientation === result.selectedOrientation)!;
  const geometry = result.selectedGeometry!;
  const group = orientation.geometryGrid.find(x => JSON.stringify(x.geometry) === JSON.stringify(geometry))!;
  const window = result.selectedOperatingWindow!;
  const trials = group.trials.filter(x => x.rpm >= window.rpmMin && x.rpm <= window.rpmMax).map(x => {
    const hydraulic = evaluateKuhniReverseTrial(geometry.columnDiameterM, x.rpm, basis, {
      compartmentToColumn: geometry.hcToColumn,
      rotorToColumn: geometry.rotorToColumn,
      statorFreeArea: geometry.freeArea,
    });
    return { ...x, floodingHoldup: hydraulic.floodHoldup, independentlyRecomputedPowerW: hydraulic.powerW };
  });
  const selected = trials.find(x => x.rpm === result.selectedRpm)!;
  const report = {
    mode: 'READ_ONLY_STAGE1_PURE_CALCULATION_NO_DATABASE_WRITES',
    stage1Hash: snapshot.immutableHash, orientation: result.selectedOrientation,
    geometry, window, selected, trials,
    maximumWindowLoading: Math.max(...trials.map(x => x.actualLoading!)),
    allSampledWindowPointsPass: trials.every(x => x.hydraulicPass && x.status === 'FEASIBLE'
      && x.actualLoading! <= 0.7 && x.tipSpeedMS <= 4.5),
    windowMeaning: 'Contiguous accepted 5-rpm grid points; not a continuous-RPM mathematical proof.',
  };
  writeFileSync('research/selected-compact-point-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().finally(() => pool.end()).catch(error => { console.error(error); process.exitCode = 1; });
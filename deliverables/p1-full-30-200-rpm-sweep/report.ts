/** Output-only validation/export. No scientific evaluation or persistence imports. */
import { writeFileSync, appendFileSync } from 'node:fs';
import { dir, read, sha, save, csv, orient, key } from './common';
const input = read(dir + 'input.json'), r = read(dir + 'result.json'), o = r.orientation;
const groups = o.geometryGrid, trials = groups.flatMap((g: any) => g.trials);
const errors: string[] = [];
const check = (ok: boolean, message: string) => { if (!ok) errors.push(message); };
const keys = new Set(trials.map(key));
check(groups.length === 378 && trials.length === 13230 && keys.size === 13230, 'Geometry/trial coverage or duplicate failure');
let missing = 0, scenarioCount = 0, missingDiagnostics = 0, maxClosure = 0, maxForce = 0;
const expectedScenarios = [.36, .42, .43].flatMap(c => ['BARRY_PARLANGE_MOBILE', 'SCHILLER_NAUMANN_IMMOBILE'].map(s => c + '|' + s)).sort();
for (const g of groups) {
  const rpms = new Set(g.trials.map((t: any) => t.rpm));
  for (let rpm = 30; rpm <= 200; rpm += 5) if (!rpms.has(rpm)) missing++;
  check(g.trials.length === 35 && rpms.size === 35, 'Non-35-point geometry');
  for (const t of g.trials) {
    const m = t.hydraulicMethod;
    if (!m || m.scenarios.length !== 6) { missingDiagnostics++; continue; }
    scenarioCount += m.scenarios.length;
    check(JSON.stringify(m.scenarios.map((s: any) => s.coefficient + '|' + s.interfaceScenario).sort()) === JSON.stringify(expectedScenarios), 'Scenario identity/duplicate failure: ' + key(t));
    check(m.governing.capacityMS === Math.min(...m.scenarios.map((s: any) => s.capacityMS)), 'Governing minimum mismatch');
    const pass = t.tipSpeedMS <= 4.5 && m.scenarios.every((s: any) => s.operatingHoldup !== null && s.loading <= .70);
    check(pass === (t.status === 'FEASIBLE'), 'Acceptance mismatch: ' + key(t));
    for (const s of m.scenarios) {
      for (const name of ['d32M', 'capacityMS', 'loading', 'floodHoldup', 'terminalRe', 'characteristicRe', 'forceBalanceResidualN']) check(Number.isFinite(s[name]), 'Missing/nonfinite ' + name);
      check(s.diagnostics && Object.values(s.diagnostics).every(v => typeof v === 'number' && Number.isFinite(v)), 'Missing dimensionless diagnostics');
      check(Math.abs((m.jc + m.jd) / s.capacityMS - s.loading) <= 1e-12, 'Loading closure');
      maxForce = Math.max(maxForce, Math.abs(s.forceBalanceResidualN));
      if (s.operatingHoldup !== null) {
        const p = s.operatingHoldup, v = s.operatingSpeeds;
        check(p > 0 && p < s.floodHoldup && s.continuation.length === 16, 'Invalid lower branch');
        const closure = Math.abs(m.jd / p + m.jc / (1 - p) - v.slipMS);
        maxClosure = Math.max(maxClosure, closure);
        check(closure <= 1e-12 && Math.abs(v.superficialSwarmMS / (1 - p) - v.slipMS) <= 1e-12, 'Operating velocity closure');
        check(Math.abs(6 * p / s.d32M - s.interfacialAreaM2M3) <= 1e-10, 'Area closure');
      } else check(s.interfacialAreaM2M3 === null && s.operatingSpeeds === null, 'Absent operating root silently substituted');
    }
  }
}
check(missing === 0 && missingDiagnostics === 0 && scenarioCount === 79380, 'Incomplete diagnostics');
const overlap = trials.filter((t: any) => t.rpm <= 70);
check(overlap.length === 3402 && overlap.filter((t: any) => t.status === 'FEASIBLE').length === 158, 'Original overlap accepted count changed');
const differences: any[] = [], comparatorSummary: any[] = [];
const compare = (a: any, b: any, path: string, trialKey: string, comparator: string, tally: any) => {
  if (typeof a === 'number' && typeof b === 'number') {
    tally.numericValues++;
    const delta = Math.abs(a - b), tolerance = 1e-12 + 1e-12 * Math.max(Math.abs(a), Math.abs(b));
    tally.maxAbsDifference = Math.max(tally.maxAbsDifference, delta);
    if (a !== b) differences.push({ comparator, trialKey, field: path, current: a, prior: b, absDifference: delta, withinTolerance: delta <= tolerance });
    if (delta > tolerance) tally.failures++;
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const names = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of names) compare(a[k], b[k], path + '.' + k, trialKey, comparator, tally);
  } else if (a !== b) {
    tally.failures++;
    differences.push({ comparator, trialKey, field: path, current: a, prior: b, withinTolerance: false });
  }
};
for (const [name, path] of [['saved-row-69', dir + 'saved-comparator.json'], ['original-research', 'deliverables/rrbo-stage3-candidate/result.json']]) {
  const old = read(path), oldTrials = orient(old.result ?? old).geometryGrid.flatMap((g: any) => g.trials);
  const map = new Map(oldTrials.map((t: any) => [key(t), t]));
  const tally = { comparator: name, trialsCompared: 0, numericValues: 0, maxAbsDifference: 0, failures: 0 };
  for (const t of overlap) {
    if (!map.has(key(t))) { tally.failures++; continue; }
    compare(t, map.get(key(t)), 'trial', key(t), name, tally);
    tally.trialsCompared++;
  }
  check(tally.trialsCompared === 3402 && tally.failures === 0, 'Overlap mismatch: ' + name);
  comparatorSummary.push(tally);
}
csv('numerical-differences.csv', differences.length ? differences : [{ comparator: 'BOTH', disposition: 'NO_DIFFERENCES' }]);
save('comparison-summary.json', { tolerance: { absolute: 1e-12, relative: 1e-12 }, comparatorSummary, differenceCount: differences.length });
const runs = (ts: any[]) => {
  const out: number[][] = [];
  for (const t of ts) if (t.status === 'FEASIBLE') {
    if (!out.length || t.rpm - out.at(-1)!.at(-1)! !== 5) out.push([]);
    out.at(-1)!.push(t.rpm);
  }
  return out;
};
const histogram = (ts: any[]) => {
  const h: Record<string, number> = {};
  for (const t of ts) for (const reason of t.reasons) h[reason] = (h[reason] ?? 0) + 1;
  return h;
};
const mechanisms = (ts: any[]) => {
  const counts = { tipOnly: 0, modelOnly: 0, tipAndModel: 0, feasible: 0 };
  for (const t of ts) {
    const tip = t.reasons.includes('TIP_SPEED_LIMIT_EXCEEDED'), model = t.reasons.some((x: string) => x !== 'TIP_SPEED_LIMIT_EXCEEDED');
    if (tip && model) counts.tipAndModel++; else if (tip) counts.tipOnly++; else if (model) counts.modelOnly++; else counts.feasible++;
  }
  return counts;
};
const diameters = [...new Set(groups.map((g: any) => g.geometry.columnDiameterM))].map(d => {
  const gs = groups.filter((g: any) => g.geometry.columnDiameterM === d), ts = gs.flatMap((g: any) => g.trials);
  const high = ts.filter((t: any) => t.rpm > 70), feasible = ts.filter((t: any) => t.status === 'FEASIBLE');
  return {
    diameterM: d, trialCount: ts.length, feasibleTrialCount: feasible.length,
    feasibleGeometryCount: gs.filter((g: any) => g.operatingWindow).length,
    adequateGeometryCount: gs.filter((g: any) => g.operatingWindow?.widthRpm >= 20).length,
    maxFixedGeometryWindowRpm: Math.max(0, ...gs.map((g: any) => g.operatingWindow?.widthRpm ?? 0)),
    feasibleRpmUnionNotOneWindow: [...new Set(feasible.map((t: any) => t.rpm))].sort((a: any, b: any) => a - b),
    feasibleAbove70: high.some((t: any) => t.status === 'FEASIBLE'),
    feasibleAbove70Count: high.filter((t: any) => t.status === 'FEASIBLE').length,
    rejectionReasons: histogram(ts), highRpmRejections: histogram(high), highRpmMechanisms: mechanisms(high),
    fixedGeometryWindows: gs.filter((g: any) => g.operatingWindow).map((g: any) => ({ geometry: g.geometry, runs: runs(g.trials), longest: g.operatingWindow })),
  };
});
const gridRows = trials.map((t: any) => {
  const { hydraulicMethod: m, ...rest } = t;
  return { ...rest, controllingInterface: m.governing.interfaceScenario, controllingCoefficient: m.governing.coefficient,
    capacityMS: m.governing.capacityMS, jcMS: m.jc, jdMS: m.jd,
    qualification: m.qualification, sourceExtrapolation: m.sourceExtrapolation };
});
csv('geometry-rpm-grid.csv', gridRows);
csv('geometry-windows.csv', groups.map((g: any) => ({ ...g.geometry, runs: runs(g.trials), longestWindow: g.operatingWindow, rejectionReasons: histogram(g.trials) })));
csv('diameters.csv', diameters.map(({ fixedGeometryWindows, ...d }: any) => d));
// Scenario export in bounded chunks, preserving arrays/roots/continuation as JSON cells.
const scenarioRows = (t: any) => t.hydraulicMethod.scenarios.map((s: any) => ({
  diameterM: t.diameterM, hcToColumn: t.hcToColumn, rotorToColumn: t.rotorToColumn, freeArea: t.freeArea,
  rpm: t.rpm, trialStatus: t.status, tipSpeedMS: t.tipSpeedMS, rotorRe: t.rotorReynolds,
  jcMS: t.hydraulicMethod.jc, jdMS: t.hydraulicMethod.jd,
  isControlling: s.interfaceScenario === t.hydraulicMethod.governing.interfaceScenario && s.coefficient === t.hydraulicMethod.governing.coefficient,
  ...s, ...s.diagnostics,
  swarmReOperating: s.operatingSpeeds ? input.basis.rrboFeed.densityKgM3 * s.operatingSpeeds.superficialSwarmMS * s.d32M / input.basis.rrboFeed.dynamicViscosityPaS : null,
  slipReOperating: s.operatingSpeeds ? input.basis.rrboFeed.densityKgM3 * s.operatingSpeeds.slipMS * s.d32M / input.basis.rrboFeed.dynamicViscosityPaS : null,
  qualification: t.hydraulicMethod.qualification, sourceExtrapolation: t.hydraulicMethod.sourceExtrapolation,
}));
const columns = Object.keys(scenarioRows(trials[0])[0]);
const cell = (v: any) => '"' + (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replaceAll('"', '""') + '"';
writeFileSync(dir + 'scenarios.csv', columns.map(cell).join(',') + '\n');
for (const g of groups) appendFileSync(dir + 'scenarios.csv', g.trials.flatMap(scenarioRows).map((s: any) => columns.map(k => cell(s[k])).join(',')).join('\n') + '\n');
const summary = {
  status: errors.length ? 'VALIDATION_FAILED' : 'COMPLETE', computationStatus: o.status,
  elapsedSeconds: r.elapsedSeconds, candidateOnly: true, noAdoption: true, noStage4: true,
  coverage: { geometries: groups.length, trials: trials.length, scenarios: scenarioCount, pointsPerGeometry: 35, duplicateTrials: trials.length - keys.size, missingPoints: missing, missingDiagnostics },
  acceptedTrials: trials.filter((t: any) => t.status === 'FEASIBLE').length,
  overlapAcceptedTrials: overlap.filter((t: any) => t.status === 'FEASIBLE').length,
  highRpmMechanisms: mechanisms(trials.filter((t: any) => t.rpm > 70)),
  maxOperatingClosureMS: maxClosure, maxForceResidualN: maxForce,
  comparatorSummary, validationErrors: [...new Set(errors)], diameters,
  hypotheticalSelection: { geometry: o.selectedGeometry, rpm: o.selectedRpm, window: o.operatingWindow, rankingEvidence: o.rankingEvidence },
};
save('summary.json', summary);
save('hypothetical-selected-result.json', { candidateOnly: true, adopted: false, engineeringQualified: false, geometry: o.selectedGeometry, rpm: o.selectedRpm, window: o.operatingWindow, trial: o.selectedTrial, rankingEvidence: o.rankingEvidence });
const table = ['| Diameter m | Feasible trials / 945 | Feasible geometries / 27 | Adequate geometries | Longest fixed-geometry span rpm | Feasible above 70 | Above-70 count |',
  '|---|---|---|---|---|---|---|',
  ...diameters.map((d: any) => `| ${d.diameterM} | ${d.feasibleTrialCount} | ${d.feasibleGeometryCount} | ${d.adequateGeometryCount} | ${d.maxFixedGeometryWindowRpm} | ${d.feasibleAbove70 ? 'YES' : 'NO'} | ${d.feasibleAbove70Count} |`)].join('\n');
const md = `# P1 complete 30–200 rpm diagnostic research sweep

**${summary.status} — isolated candidate only, NOT engineering-qualified or adopted.**

Project 236 / design 269. Saved candidate b4b44349-5471-4b9c-acf8-d06e2cea8d42, ledger 69.
Current Stage-1 hash: ${input.currentStage1Hash}. Input was freshly verified by READ ONLY SELECT transaction, rolled back.
No database writes, Stage-4 calculation, adoption, or application default change.

## Envelope and provenance

Experimental envelope ${input.experimentalEnvelope}: exactly 378 unchanged geometries × 35 RPM points (30 through 200 inclusive, step 5), RRBO-continuous saved orientation only. Alternate orientation was explicitly excluded; no 26,460-point combined-orientation claim.
All six mandatory scenarios run at every point, including tip-speed failures. No early stop or numerical short-cut.
The named isolated export calls the existing optimizeOrientation implementation with corrected P1 and second-smallest ranking.
Canonical production controls still reject RPM above 70. Production and prior P1 descriptor hashes were not changed; actual source bytes and the separate experimental identity are recorded before computation in input-manifest.json.
Completion elapsed: ${r.elapsedSeconds} s. Coverage: ${JSON.stringify(summary.coverage)}.

## Actual results by diameter

${table}

Windows are discrete tested runs at one fixed geometry, NOT proof of continuous feasibility. Diameter unions are not one operating window.
geometry-windows.csv and summary.json contain every fixed-geometry run; geometry-rpm-grid.csv has one row per geometry/RPM, including rejections.

Hypothetical selection: ${JSON.stringify(summary.hypotheticalSelection)}.
Unchanged rule: second-smallest distinct accepted diameter with a fixed-geometry useful span of at least 20 rpm. No fallback or adoption. Adequacy is a ranking requirement, not a hydraulic limit.

## Observed high-RPM rejection mechanisms

${JSON.stringify(summary.highRpmMechanisms)}.
These counts directly classify engine rejection codes: tip limit (4.5 m/s), model loading above 0.70, and/or absence of a dilute-connected operating root. They are not causal hypotheses or experimental qualifications. Multiple reason counts may overlap.
Per-diameter high-RPM reason histograms and mechanisms are in diameters.csv and summary.json.

## Numerical overlap and integrity

30–70 rpm overlap: 3,402 trials; ${summary.overlapAcceptedTrials} accepted (expected 158).
Full nested trial/scenario fields compared against both saved row 69 and the original research output:
${JSON.stringify(comparatorSummary)}.
Differences: ${differences.length}; numeric tolerance absolute 1e-12 plus relative 1e-12. Every nonzero difference is retained in numerical-differences.csv. No diagnostics silently omitted.
Validation errors: ${JSON.stringify(summary.validationErrors)}.
Maximum operating balance residual: ${maxClosure} m/s. Maximum force residual: ${maxForce} N.

## Equations, units and qualifications

Unchanged C32 = 0.36, 0.42, 0.43 paired with Barry–Parlange mobile and Schiller–Naumann immobile; Np=1.2.
d32=C32(sigma/rho_c)^0.6 epsilon^-0.4 (m); capacity and superficial/relative velocities m/s; operating and flood holdup fractions; area=6 phi_op/d32 (m²/m³); loading dimensionless.
Operating balance jd/phi+jc/(1-phi)=vslip=vs/(1-phi). Governing capacity is minimum of six. Acceptance requires all six operating roots and loading≤0.70 plus tip speed≤4.5 m/s.
Absent operating roots/area remain explicit null in JSON and empty CSV cells, with NO_DILUTE_CONNECTED_ROOT branch status; they are physical rejections, not missing evaluations.
Full roots, 16-step continuation, d32, capacity, loading, area, holdup, flood turning point, signed velocities, terminal/characteristic/rotor/swarm/slip Reynolds, Eo, We and Oh are retained in scenarios.csv/result.json. No diagnostic threshold or equation changed.

This is extrapolated conditional screening. Turbulence, spherical-drop assumptions, drag range, actual interface mobility, inversion, entrainment and disengagement remain unqualified/unknown. Modeled capacity is not observed flood; lower quasi-steady continuation is not dynamic stability. The d32 scenario interval is epistemic sensitivity, not a confidence interval. No downstream engineering authority is created.

## Artifacts

input.json, input-manifest.json, saved-comparator.json, result.json, geometry-rpm-grid.csv, geometry-windows.csv, scenarios.csv, diameters.csv, comparison-summary.json, numerical-differences.csv, hypothetical-selected-result.json, summary.json, terminal.json, manifest.json and this report.
`;
writeFileSync(dir + 'report.md', md);
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
writeFileSync(dir + 'report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P1 full diagnostic sweep</title><style>body{font:15px/1.6 system-ui;margin:32px;color:#183044;background:#f5f8fa}main{max-width:1400px;margin:auto;background:white;padding:28px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style><main><pre>${escape(md)}</pre></main></html>`);
if (errors.length) throw Error('Validation failed: ' + [...new Set(errors)].join('; '));
save('terminal.json', { status: 'COMPLETE', completedAt: new Date().toISOString(), elapsedSeconds: r.elapsedSeconds, ...summary.coverage, resultSha256: sha(dir + 'result.json'), validationErrors: 0 });
const artifacts = ['input.json', 'input-manifest.json', 'saved-comparator.json', 'result.json', 'summary.json', 'terminal.json', 'report.md', 'report.html', 'geometry-rpm-grid.csv', 'geometry-windows.csv', 'scenarios.csv', 'diameters.csv', 'comparison-summary.json', 'numerical-differences.csv', 'hypothetical-selected-result.json'];
save('manifest.json', Object.fromEntries(artifacts.map(p => [p, sha(dir + p)])));
console.log(JSON.stringify({ status: 'COMPLETE', elapsedSeconds: r.elapsedSeconds, coverage: summary.coverage, acceptedTrials: summary.acceptedTrials, hypotheticalRpm: o.selectedRpm, comparisons: comparatorSummary }));
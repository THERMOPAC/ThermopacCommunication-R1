// ═══════════════════════════════════════════════════════════════════════════════
// Stage C6 Validation Suite — Common Mechanical Design Engine (mech-vessel)
// Run: npx tsx server/engine-framework/tests/c6-mechanical-vessel.ts
// ═══════════════════════════════════════════════════════════════════════════════

import { MechanicalVesselEngine } from '../../engines/common/mechanical-vessel-engine';

let passed = 0; let failed = 0;
function checkTrue(name: string, ok: boolean, detail?: unknown): void {
  if (ok) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}
function check(name: string, actual: number | null | undefined, expected: number, tol = 1e-9): void {
  const ok = actual !== null && actual !== undefined && Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  checkTrue(name, ok, { actual, expected });
}

const engine = new MechanicalVesselEngine();
const ctx = { revisionId: 1, designId: 1, moduleType: 'common', userId: 1 };

const tag = (value: number, unit: string, sourceType = 'Vendor', sourceReference = 'MEC-VD-01') => ({ value, unit, sourceType, sourceReference });

function baseInputs(): Record<string, unknown> {
  return {
    vesselOrientation: 'vertical',
    geometry: {
      sourceEngine: { engineId: 'llx-ecr', engineVersion: '1.0.0', calculationType: 'ecr' },
      sourceRunReference: 'C5-RUN-042',
      insideDiameter_m: 1.0,
      tangentToTangentHeight_m: 6.55,
      overallVesselHeight_m: 8.15,
      operatingLiquidBasis: 'liquid_full',
    },
    designPressure: tag(6.0, 'barg'),
    operatingPressure: tag(3.5, 'barg'),
    designTemperature: tag(80, 'C'),
    operatingTemperature: tag(60, 'C'),
    material: {
      materialName: 'Carbon Steel', materialSpecification: 'SA-516', materialGrade: '70',
      allowableStress: tag(118, 'MPa'), density: tag(7850, 'kg/m3'), corrosionAllowance: tag(3, 'mm'),
      source: 'Engineer-entered per project material selection',
    },
    jointEfficiency: tag(0.85, '-'),
    designCode: 'NOT_ASSIGNED',
    headType: 'ellipsoidal_2_1',
    plateThicknessSeries: { values_mm: [6, 8, 10, 12, 14, 16], sourceType: 'Vendor', sourceReference: 'Mill plate list' },
    nozzles: [
      { service: 'Feed', flowForSizing: { volumetricFlow: tag(12.5, 'm3/h'), designVelocity: tag(1.5, 'm/s') } },
      { service: 'Solvent Inlet', size: tag(80, 'DN') },
      { service: 'Raffinate Outlet', size: tag(80, 'DN') },
      { service: 'Extract Outlet', size: tag(80, 'DN') },
      { service: 'Vent', size: tag(50, 'DN') },
      { service: 'Drain', size: tag(50, 'DN') },
      { service: 'Instrument', size: tag(25, 'DN') },
      { service: 'Spare', size: tag(50, 'DN'), remarks: 'Future use' },
    ],
    nozzleDefaults: {
      rating: '150#', facing: 'RF', flangeClass: 'CL150', flangeStandard: 'ASME B16.5',
      projection: tag(150, 'mm'),
      dnSeries: { values: [25, 40, 50, 80, 100, 150, 200], sourceType: 'Vendor', sourceReference: 'Project DN series' },
    },
    nozzlesWeight: tag(150, 'kg'),
    internalsWeight: tag(400, 'kg'),
    supportsWeight: tag(250, 'kg'),
    headBlankFactor: tag(1.084, '-'),
    operatingLiquidDensity: tag(957.7, 'kg/m3'),
    waterDensity: tag(1000, 'kg/m3'),
  };
}

async function main(): Promise<void> {
  // ── 1. Hand-calculated benchmark ──
  console.log('── 1. Hand-calculated benchmark ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const d = res.data as any;
    checkTrue('run screening_complete', d.calculationRunStatus === 'screening_complete', d.calculationRunStatus);
    const SE = 118 * 0.85; const P = 0.6;
    const tShell = (P * 500) / (SE - 0.6 * P);
    check('shell t_calc = 3.002 mm', d.shellDesign.shellThicknessCalculated.result, tShell, 1e-9);
    check('shell t_req = 6.002 mm', d.shellDesign.shellThicknessRequired.result, tShell + 3, 1e-9);
    check('shell selected = 8 mm', d.shellDesign.shellThicknessSelected.result, 8);
    const tHead = (P * 1000) / (2 * SE - 0.2 * P);
    check('head t_calc = 2.993 mm', d.shellDesign.headThicknessCalculated.result, tHead, 1e-9);
    // Plan §5 hand-rounded the head plate to 8 mm; the correct next plate from
    // the entered series [6, 8, …] for t_req = 5.993 mm is 6 mm.
    check('head selected = 6 mm (next plate ≥ 5.993)', d.shellDesign.headThicknessSelected.result, 6);
    check('head depth = D/4 = 0.25 m', d.geometry.headDepth.result, 0.25);
    check('straight shell = T/T = 6.55 m', d.geometry.straightShellLength.result, 6.55);
    const shellW = Math.PI * 1.008 * 0.008 * 6.55 * 7850;
    const headsW = 2 * 1.084 * 1 * 0.006 * 7850; // selected head plate 6 mm
    check('shell weight ≈ 1302.6 kg', d.weights.shell.result, shellW, 1e-9);
    check('heads weight ≈ 102.1 kg', d.weights.heads.result, headsW, 1e-9);
    const empty = shellW + headsW + 150 + 400 + 250;
    check('empty weight breakdown sum', d.weights.emptyWeight.result, empty, 1e-9);
    const V = (Math.PI / 4) * 6.55 + 2 * Math.PI / 24;
    check('vessel volume = 5.406 m³', d.weights.vesselVolume.result, V, 1e-9);
    check('operating weight', d.weights.operatingWeight.result, empty + V * 957.7, 1e-9);
    check('hydrotest weight', d.weights.hydrotestWeight.result, empty + V * 1000, 1e-9);
    const feed = d.nozzleSchedule.find((n: any) => n.service === 'Feed');
    check('feed nozzle sized DN 80', feed.size.result, 80);
    checkTrue('support = skirt (vertical)', d.support.selection.result === 'skirt');
    checkTrue('lifting: 2 top + 1 tail = 3 lugs', d.lifting.lugQuantity.result === 3 && d.lifting.suggestedLocations.length === 3);
    checkTrue('applicability + 7 limitations', d.applicabilityStatement.includes('NOT A CODE CALCULATION') && d.limitations.length === 7);
    checkTrue('no NaN anywhere', !JSON.stringify(d).includes('NaN'));
  }

  // ── 2. Refinement 1 — explicit orientation, never inferred ──
  console.log('── 2. R1 orientation ──');
  {
    const i = baseInputs();
    delete (i as any).vesselOrientation;
    const r = await engine.calculate(i, ctx);
    checkTrue('missing orientation → blocked (never inferred)', r.status === 'error' && r.validationIssues.some((e) => e.field === 'vesselOrientation'));
    const i2 = baseInputs();
    (i2 as any).vesselOrientation = 'horizontal';
    const r2 = await engine.calculate(i2, ctx);
    const d2 = r2.data as any;
    checkTrue('horizontal → saddle × 2', d2.support.selection.result === 'saddle' && d2.support.quantity === 2);
    checkTrue('horizontal → 2 lugs above saddles', d2.lifting.lugQuantity.result === 2);
  }

  // ── 3. Refinement 2 — Material Interface ──
  console.log('── 3. R2 Material Interface ──');
  {
    for (const f of ['materialName', 'materialSpecification', 'materialGrade', 'source', 'allowableStress', 'density', 'corrosionAllowance'] as const) {
      const i = baseInputs();
      delete ((i as any).material)[f];
      const r = await engine.calculate(i, ctx);
      checkTrue(`material.${f} missing → blocked`, r.status === 'error');
    }
    const res = await engine.calculate(baseInputs(), ctx);
    const m = (res.data as any).designConditions.material;
    checkTrue('material interface echoed in full', m.materialName === 'Carbon Steel' && m.materialSpecification === 'SA-516' && m.materialGrade === '70' && m.allowableStress.result === 118 && m.density.result === 7850 && m.corrosionAllowance.result === 3 && typeof m.source === 'string');
    checkTrue('datasheet carries material interface', (res.data as any).mechanicalDatasheet.material.materialSpecification === 'SA-516');
  }

  // ── 4. Refinement 3 — head types & depths ──
  console.log('── 4. R3 head types ──');
  {
    const hemi = baseInputs(); (hemi as any).headType = 'hemispherical';
    const rh = await engine.calculate(hemi, ctx);
    const SE = 118 * 0.85; const P = 0.6;
    check('hemispherical t = P·R/(2SE−0.2P)', (rh.data as any).shellDesign.headThicknessCalculated.result, (P * 500) / (2 * SE - 0.2 * P), 1e-9);
    check('hemispherical depth = D/2', (rh.data as any).geometry.headDepth.result, 0.5);

    const tori = baseInputs();
    (tori as any).headType = 'torispherical';
    (tori as any).torisphericalGeometry = { crownRadius: tag(1.0, 'm'), knuckleRadius: tag(0.1, 'm') };
    (tori as any).headDepth = tag(0.194, 'm');
    (tori as any).headVolume = tag(0.1, 'm3');
    const rt = await engine.calculate(tori, ctx);
    check('torispherical t = 0.885·P·L/(SE−0.1P)', (rt.data as any).shellDesign.headThicknessCalculated.result, (0.885 * P * 1000) / (SE - 0.1 * P), 1e-9);
    check('torispherical depth entered', (rt.data as any).geometry.headDepth.result, 0.194);
    const toriNoGeom = baseInputs();
    (toriNoGeom as any).headType = 'torispherical';
    const rtn = await engine.calculate(toriNoGeom, ctx);
    checkTrue('torispherical without dish geometry → blocked', rtn.status === 'error');

    const flat = baseInputs(); (flat as any).headType = 'flat';
    const rf = await engine.calculate(flat, ctx);
    const df = rf.data as any;
    checkTrue('flat head thickness Not Calculable + code-method warning', df.shellDesign.headThicknessCalculated.status === 'Not Calculable' && rf.warnings.some((w) => w.code === 'FLAT_HEAD_REQUIRES_CODE_METHOD'));
    check('flat head depth = 0', df.geometry.headDepth.result, 0);

    const cust = baseInputs();
    (cust as any).headType = 'custom';
    (cust as any).headDepth = tag(0.3, 'm');
    (cust as any).headVolume = tag(0.15, 'm3');
    const rc = await engine.calculate(cust, ctx);
    checkTrue('custom head without entered thickness → Not Calculable', (rc.data as any).shellDesign.headThicknessCalculated.status === 'Not Calculable');
    (cust as any).customHeadThickness = tag(10, 'mm');
    const rc2 = await engine.calculate(cust, ctx);
    check('custom head entered thickness honored', (rc2.data as any).shellDesign.headThicknessCalculated.result, 10);
    check('custom head selected plate ≥ 10+3', (rc2.data as any).shellDesign.headThicknessSelected.result, 14);
  }

  // ── 5. Design-condition gates ──
  console.log('── 5. Design-condition gates ──');
  {
    const cases: [string, (i: Record<string, unknown>) => void][] = [
      ['Pd < Pop', (i) => { (i as any).designPressure = tag(2.0, 'barg'); }],
      ['Td < Top', (i) => { (i as any).designTemperature = tag(50, 'C'); }],
      ['missing jointEfficiency', (i) => { delete (i as any).jointEfficiency; }],
      ['missing designCode', (i) => { delete (i as any).designCode; }],
      ['S·E − 0.6P ≤ 0', (i) => { (i as any).designPressure = tag(500, 'barg'); (i as any).operatingPressure = tag(400, 'barg'); (i as any).material.allowableStress = tag(25, 'MPa'); }],
      ['E > 1', (i) => { (i as any).jointEfficiency = tag(1.2, '-'); }],
    ];
    for (const [name, mutate] of cases) {
      const i = baseInputs(); mutate(i);
      const r = await engine.calculate(i, ctx);
      checkTrue(`blocked: ${name}`, r.status === 'error' && (r.data as any).calculationRunStatus === 'calculation_blocked' && !JSON.stringify(r.data).includes('NaN'));
    }
  }

  // ── 6. Thin-wall gate ──
  console.log('── 6. Thin-wall gate ──');
  {
    const i = baseInputs();
    (i as any).designPressure = tag(120, 'barg');
    (i as any).operatingPressure = tag(100, 'barg');
    const r = await engine.calculate(i, ctx);
    const d = r.data as any;
    // t/R = 12/(118·0.85 − 7.2)·... → P=12 MPa: t = 12·500/(100.3−7.2)=64.4 mm; t/R=0.129 > 0.10
    checkTrue('t/R > 0.10 → shell Not Calculable + THIN_WALL_LIMIT_EXCEEDED', d.shellDesign.shellThicknessCalculated.status === 'Not Calculable' && r.warnings.some((w) => w.code === 'THIN_WALL_LIMIT_EXCEEDED'));
    checkTrue('weights Not Calculable when thickness unavailable', d.weights.emptyWeight.status === 'Not Calculable' && r.warnings.some((w) => w.code === 'WEIGHTS_NOT_CALCULABLE'));
    checkTrue('checklist thicknessCalculated fails', d.validationChecklist.thicknessCalculated.pass === false);
  }

  // ── 7. Plate selection ──
  console.log('── 7. Plate selection ──');
  {
    const i = baseInputs();
    delete (i as any).plateThicknessSeries;
    const r = await engine.calculate(i, ctx);
    const d = r.data as any;
    checkTrue('no series → t_req reported, selection Not Calculable + NO_PLATE_SERIES_DATA', typeof d.shellDesign.shellThicknessRequired.result === 'number' && d.shellDesign.shellThicknessSelected.status === 'Not Calculable' && r.warnings.some((w) => w.code === 'NO_PLATE_SERIES_DATA'));

    const i2 = baseInputs();
    (i2 as any).plateThicknessSeries = { values_mm: [3, 4, 5], sourceType: 'Vendor', sourceReference: 'thin mill list' };
    const r2 = await engine.calculate(i2, ctx);
    checkTrue('t_req above series max → Not Calculable + PLATE_SERIES_EXCEEDED', (r2.data as any).shellDesign.shellThicknessSelected.status === 'Not Calculable' && r2.warnings.some((w) => w.code === 'PLATE_SERIES_EXCEEDED'));

    const i3 = baseInputs();
    (i3 as any).minimumThickness = tag(10, 'mm');
    const r3 = await engine.calculate(i3, ctx);
    check('minimum-thickness floor lifts selection to 10', (r3.data as any).shellDesign.shellThicknessSelected.result, 10);

    const i4 = baseInputs();
    (i4 as any).plateThicknessSeries = { values_mm: [8, 6, 10], sourceType: 'Vendor', sourceReference: 'x' };
    const r4 = await engine.calculate(i4, ctx);
    checkTrue('non-increasing series blocked', r4.status === 'error');
  }

  // ── 8. Refinement 4 — nozzle schedule ──
  console.log('── 8. R4 nozzle schedule ──');
  {
    for (const svc of ['Feed', 'Solvent Inlet', 'Raffinate Outlet', 'Extract Outlet', 'Vent', 'Drain', 'Instrument']) {
      const i = baseInputs();
      (i as any).nozzles = ((i as any).nozzles as any[]).filter((n) => n.service !== svc);
      const r = await engine.calculate(i, ctx);
      checkTrue(`mandatory service '${svc}' missing → blocked`, r.status === 'error');
    }
    const res = await engine.calculate(baseInputs(), ctx);
    const sched = (res.data as any).nozzleSchedule as any[];
    checkTrue('all 8 rows present, tags sequenced', sched.length === 8 && sched[0].tag === 'N1' && sched[7].tag === 'N8');
    checkTrue('projection/flangeClass/flangeStandard on every row (Refinement 4)', sched.every((n) => n.projection.result === 150 && n.flangeClass === 'CL150' && n.flangeStandard === 'ASME B16.5'));
    checkTrue('reinforcement remark on every row', sched.every((n) => n.remarks.includes('No reinforcement calculation')));

    const i2 = baseInputs();
    delete ((i2 as any).nozzleDefaults as any).dnSeries;
    const r2 = await engine.calculate(i2, ctx);
    const feed2 = ((r2.data as any).nozzleSchedule as any[]).find((n) => n.service === 'Feed');
    checkTrue('no DN series → bore reported, size Not Calculable', feed2.size.status === 'Not Calculable' && r2.warnings.some((w) => w.code === 'NO_DN_SERIES_DATA'));

    const i3 = baseInputs();
    delete (i3 as any).nozzleDefaults;
    const r3 = await engine.calculate(i3, ctx);
    checkTrue('no defaults → NOT ENTERED + missing-data warnings, never invented', ((r3.data as any).nozzleSchedule as any[]).every((n) => n.rating === 'NOT ENTERED' && n.flangeClass === 'NOT ENTERED') && r3.warnings.some((w) => w.code === 'NOZZLE_RATING_MISSING') && r3.warnings.some((w) => w.code === 'NOZZLE_FLANGE_STANDARD_MISSING'));

    const i4 = baseInputs();
    ((i4 as any).nozzles as any[])[1].projection = tag(200, 'mm');
    ((i4 as any).nozzles as any[])[1].flangeClass = 'CL300';
    const r4 = await engine.calculate(i4, ctx);
    const n2 = ((r4.data as any).nozzleSchedule as any[])[1];
    checkTrue('per-nozzle values override defaults', n2.projection.result === 200 && n2.flangeClass === 'CL300');
  }

  // ── 9. Support matrix ──
  console.log('── 9. Support matrix ──');
  {
    const i = baseInputs();
    (i as any).supportOverride = 'legs';
    const r = await engine.calculate(i, ctx);
    checkTrue('legs without criteria → blocked', r.status === 'error');
    (i as any).legCriteria = { maxHeight: tag(6.0, 'm'), maxWeight: tag(5000, 'kg') };
    const r2 = await engine.calculate(i, ctx);
    checkTrue('legs with criteria honored; height criterion exceeded flagged', (r2.data as any).support.selection.result === 'legs' && r2.warnings.some((w) => w.code === 'LEG_HEIGHT_CRITERION_EXCEEDED'));
    const i3 = baseInputs();
    (i3 as any).supportOverride = 'lug';
    const r3 = await engine.calculate(i3, ctx);
    checkTrue('explicit lug override honored with rationale', (r3.data as any).support.selection.result === 'lug' && (r3.data as any).support.selection.source.includes('override'));
    checkTrue('rejected alternatives listed for rule-based selection', ((await engine.calculate(baseInputs(), ctx)).data as any).support.rejectedAlternatives.length === 3);
  }

  // ── 10. Refinement 5 — weight breakdown ──
  console.log('── 10. R5 weight breakdown ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const w = (res.data as any).weights;
    checkTrue('all breakdown lines present', ['shell', 'heads', 'nozzles', 'internals', 'supports', 'insulation', 'futurePlatforms', 'emptyWeight', 'operatingWeight', 'hydrotestWeight'].every((k) => w[k] !== undefined));
    checkTrue('insulation optional → 0 with explicit note', w.insulation.result === 0 && w.insulation.source.includes('Not entered'));
    checkTrue('futurePlatforms is a reserved placeholder', w.futurePlatforms.result === null && w.futurePlatforms.status === 'Not Calculable');

    const i2 = baseInputs();
    (i2 as any).insulationWeight = tag(120, 'kg');
    const r2 = await engine.calculate(i2, ctx);
    const w2 = (r2.data as any).weights;
    check('insulation included in empty weight', w2.emptyWeight.result, (w.emptyWeight.result as number) + 120, 1e-9);

    const i3 = baseInputs();
    ((i3 as any).geometry as any).operatingLiquidBasis = { holdupFraction: tag(0.5, '-') };
    const r3 = await engine.calculate(i3, ctx);
    const V = (Math.PI / 4) * 6.55 + 2 * Math.PI / 24;
    check('holdup-fraction operating basis', (r3.data as any).weights.operatingWeight.result, (w.emptyWeight.result as number) + V * 0.5 * 957.7, 1e-9);
  }

  // ── 11. Refinement 6 — reserved placeholders ──
  console.log('── 11. R6 reserved placeholders ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const fa = (res.data as any).futureAnalyses;
    checkTrue('all 5 reserved analyses present, not implemented', ['windLoad', 'seismicLoad', 'transportation', 'foundationLoad', 'nozzleLoad'].every((k) => fa[k] && fa[k].status === 'reserved' && fa[k].implemented === false));
    checkTrue('placeholders echoed in datasheet', (res.data as any).mechanicalDatasheet.futureAnalyses.windLoad.status === 'reserved');
  }

  // ── 12. Refinement 7 — mechanical datasheet object ──
  console.log('── 12. R7 mechanical datasheet ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const ds = (res.data as any).mechanicalDatasheet;
    checkTrue('datasheet type & revision', ds.datasheetType === 'PRELIMINARY_MECHANICAL_DATASHEET' && ds.revision === 'SCREENING');
    checkTrue('datasheet traceability', ds.service.sourceEngine.engineId === 'llx-ecr' && ds.service.sourceRunReference === 'C5-RUN-042' && ds.generatedBy.engineId === 'mech-vessel');
    checkTrue('datasheet sections complete', ['designConditions', 'material', 'geometry', 'thickness', 'nozzles', 'support', 'weights', 'lifting', 'futureAnalyses', 'assumptions'].every((k) => ds[k] !== undefined));
    checkTrue('datasheet nozzle rows carry R4 fields', ds.nozzles.every((n: any) => n.projection_mm !== undefined && n.flangeClass !== undefined && n.flangeStandard !== undefined));
    checkTrue('datasheet is not a report', ds.note.includes('not a PDF'));
  }

  // ── 13. Validation checklist ──
  console.log('── 13. Validation checklist ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const c = (res.data as any).validationChecklist;
    checkTrue('all six checks pass on benchmark', c.geometryComplete.pass && c.thicknessCalculated.pass && c.mandatoryNozzlesDefined.pass && c.supportSelected.pass && c.weightsCalculated.pass && c.mechanicalAssumptionsAcknowledged.pass);
    const i2 = baseInputs();
    (i2 as any).internalsWeight = { value: 400, unit: 'kg', sourceType: 'Assumed', sourceReference: 'estimate' };
    const r2 = await engine.calculate(i2, ctx);
    const d2 = r2.data as any;
    checkTrue('Assumed input → pending run + acknowledged in checklist', d2.calculationRunStatus === 'pending_validation' && d2.validationChecklist.mechanicalAssumptionsAcknowledged.pass && d2.assumptions.length > 0);
  }

  // ── 14. Governance ──
  console.log('── 14. Governance ──');
  {
    for (const f of ['designPressure', 'jointEfficiency', 'headBlankFactor', 'operatingLiquidDensity', 'supportsWeight'] as const) {
      const i = baseInputs();
      ((i as any)[f] as any).sourceType = 'Assumed';
      const r = await engine.calculate(i, ctx);
      checkTrue(`Assumed ${f} → pending_validation + register`, (r.data as any).calculationRunStatus === 'pending_validation' && (r.data as any).assumptions.length > 0);
    }
    // Geometry snapshot completeness
    for (const f of ['sourceEngine', 'sourceRunReference', 'insideDiameter_m', 'tangentToTangentHeight_m', 'overallVesselHeight_m', 'operatingLiquidBasis'] as const) {
      const i = baseInputs();
      delete ((i as any).geometry as any)[f];
      const r = await engine.calculate(i, ctx);
      checkTrue(`incomplete geometry snapshot (${f}) → blocked`, r.status === 'error');
    }
    // Technology neutrality: ECP-sourced snapshot equally accepted
    const ecp = baseInputs();
    ((ecp as any).geometry as any).sourceEngine = { engineId: 'llx-ecp', engineVersion: '1.0.0', calculationType: 'ecp' };
    ((ecp as any).geometry as any).sourceRunReference = 'C4-RUN-017';
    const re = await engine.calculate(ecp, ctx);
    checkTrue('ECP-sourced snapshot accepted (technology-neutral)', re.status !== 'error' && (re.data as any).designBasis.sourceEngine.engineId === 'llx-ecp');
    // Missing mandatory weight factor blocked
    const iw = baseInputs(); delete (iw as any).headBlankFactor;
    checkTrue('missing headBlankFactor blocked — never hard-coded', (await engine.calculate(iw, ctx)).status === 'error');
    // overall < T/T blocked
    const ig = baseInputs(); ((ig as any).geometry as any).overallVesselHeight_m = 5.0;
    checkTrue('overall height < T/T blocked', (await engine.calculate(ig, ctx)).status === 'error');
    // Concurrency isolation
    const runs = Array.from({ length: 10 }, (_, k) => {
      const i = baseInputs();
      ((i as any).internalsWeight as any).value = 400 + k * 10;
      return engine.calculate(i, ctx).then((r) => ({ k, w: (r.data as any).weights.internals.result as number }));
    });
    const rs = await Promise.all(runs);
    checkTrue('10 concurrent runs isolated', rs.every((r) => Math.abs(r.w - (400 + r.k * 10)) < 1e-9), rs);
    // Rich-item completeness spot check
    const res = await engine.calculate(baseInputs(), ctx);
    const it = (res.data as any).shellDesign.shellThicknessCalculated;
    checkTrue('rich item completeness', ['result', 'units', 'source', 'status', 'validation', 'warnings', 'formulaReference', 'engineVersion'].every((k) => it[k] !== undefined) && it.formulaReference === 'MEC-003' && it.engineVersion === '1.0.0');
  }

  // ── 15. Review fixes: Assumed governance completeness & matching rigor ──
  console.log('── 15. Assumed governance completeness ──');
  {
    const i1 = baseInputs();
    ((i1 as any).plateThicknessSeries as any).sourceType = 'Assumed';
    const r1 = await engine.calculate(i1, ctx);
    const d1 = r1.data as any;
    checkTrue('Assumed plate series → pending run + register + consistent item statuses', d1.calculationRunStatus === 'pending_validation' && d1.assumptions.length > 0 && d1.designConditions.designPressure.status === 'Pending Validation' && d1.shellDesign.shellThicknessSelected.status === 'Pending Validation');

    const i2 = baseInputs();
    (((i2 as any).nozzleDefaults as any).dnSeries as any).sourceType = 'Assumed';
    const r2 = await engine.calculate(i2, ctx);
    checkTrue('Assumed DN series → pending run + register', (r2.data as any).calculationRunStatus === 'pending_validation' && (r2.data as any).assumptions.some((a: any) => a.assumption.includes('DN series')));

    const i3 = baseInputs();
    (i3 as any).supportOverride = 'legs';
    (i3 as any).legCriteria = { maxHeight: { value: 10, unit: 'm', sourceType: 'Assumed', sourceReference: 'estimate' }, maxWeight: tag(5000, 'kg') };
    const r3 = await engine.calculate(i3, ctx);
    checkTrue('Assumed leg criterion → pending run + register', (r3.data as any).calculationRunStatus === 'pending_validation' && (r3.data as any).assumptions.some((a: any) => a.assumption.includes('legCriteria.maxHeight')));

    const i4 = baseInputs();
    ((((i4 as any).nozzles as any[])[0].flowForSizing) as any).volumetricFlow = { value: 12.5, unit: 'm3/h', sourceType: 'Assumed', sourceReference: 'estimate' };
    const r4 = await engine.calculate(i4, ctx);
    checkTrue('Assumed nozzle sizing flow → pending run + register', (r4.data as any).calculationRunStatus === 'pending_validation' && (r4.data as any).assumptions.some((a: any) => a.assumption.includes('sizing flow')));

    const i5 = baseInputs();
    (((i5 as any).nozzleDefaults as any).dnSeries as any).values = [100, 50, 80];
    const r5 = await engine.calculate(i5, ctx);
    checkTrue('unsorted DN series → blocked', r5.status === 'error');

    // Exact-match rigor: 'Ventilation' must NOT satisfy the mandatory 'vent' service
    const i6 = baseInputs();
    (i6 as any).nozzles = ((i6 as any).nozzles as any[]).map((n) => (n.service === 'Vent' ? { ...n, service: 'Ventilation' } : n));
    const r6 = await engine.calculate(i6, ctx);
    checkTrue("'Ventilation' does not satisfy mandatory 'vent' (exact match)", r6.status === 'error');
  }

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

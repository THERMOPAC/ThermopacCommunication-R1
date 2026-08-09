/**
 * Design Review Report (DRR) — capability & disposition review of the Stage C4
 * preliminary single-phase frictional pressure-drop framework (ECP-009/ECP-010).
 *
 * Renders ONLY the persisted frozen 'ecp' result snapshot — the engine is never
 * re-run and no value is recomputed here. The report reviews, per the governing
 * directive: (1) existing capability, (2) new capability added by the framework,
 * (3) remaining gaps, (4) recommended modifications, (5) confidence
 * classification per calculation, and (6) the disposition of every previously
 * "Not Calculable" pressure-drop-related field (Calculated / Preliminary
 * Calculated / Still Not Calculable) with justification.
 *
 * The DRR is a standalone review document — it is NOT a Process Calculation
 * Book part and carries no calculation authority of its own.
 */
import type { ReportPayload, ReportSection } from './report-framework';
import { loadCommon, collectNotCalculable } from './ecp-ecr-calculation-reports';

const rvNum = (item: any, digits = 4): string => {
  if (!item) return '—';
  if (item.result == null) return item.status ?? 'Not Calculable';
  const raw = typeof item.result === 'number' && Number.isFinite(item.result) ? item.result.toFixed(digits) : String(item.result);
  // Report-layer regime label only — the frozen snapshot string is never modified.
  return raw === 'Laminar' ? 'Preliminary Laminar Classification (published-anchor bounding only)' : raw;
};

export async function buildDesignReviewPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const { rev, res, run, di } = await loadCommon(revisionId, 'ecp');
  const ecp = res.data ?? {};
  const pred = ecp.dryPressureDropPrediction;
  const verif = ecp.dryPressureDropVerification;
  if (!pred) {
    throw Object.assign(new Error('The persisted ECP snapshot predates engine llx-ecp v1.1.0 (no ECP-009 block) — re-run the C4 calculation before generating the Design Review Report.'), { statusCode: 422 });
  }
  const spRow = (ecp.maximumCase?.diameters ?? [])[0]?.singlePhaseFrictional ?? {};
  const classification = String(pred.classification ?? '');

  // Disposition of pressure-drop-related fields previously Not Calculable / not existing
  const disposition: string[][] = [
    ['Field', 'Previous status (engine ≤ v1.0.0)', 'New disposition', 'Justification'],
    ['Packing hydraulic diameter d_h', 'Did not exist (dry Δp was reserved architecture)', 'CALCULATED', 'Published geometric definition d_h = 4/a (eq. 3, Duss 2013 / Zogg) applied to the source-tagged specific surface area. Carries Pending Validation only while that datum is Assumed.'],
    ['Continuous-phase superficial velocity u_s', 'Did not exist', 'CALCULATED', 'Definition from ECP-001 loads — no new data required.'],
    ['Phase Reynolds number Re', 'Did not exist', 'CALCULATED', 'Published definition (eq. 4) on the superficial-velocity basis; continuous-phase viscosity from entered RRBO source-tagged data or NMP EPD data.'],
    ['Load factor F_v', 'Did not exist', 'CALCULATED', 'Published definition (eq. 5) applied as a liquid-phase analog.'],
    ['Flow regime (Laminar / Transition/Turbulent)', 'Did not exist', 'PRELIMINARY CALCULATED', 'Classified only against the published experimental critical Reynolds numbers (45° → ≈250; 30° → ≈450, Zogg via Duss). Without a tagged corrugation angle, Laminar is reported only when Re is below the LOWEST published anchor (bounding argument); anchors were measured on gas-phase duty — Pending Validation for LLX.'],
    ['Re-dependent friction factor c_f', 'Did not exist', 'STILL NOT CALCULABLE (machinery in place)', 'The source paper publishes NO packing c_f(Re) correlation equation; its tabulated c_f values are vendor-software outputs, excluded by directive; the pipe relation f = 16/Re under-predicts packing c_f ~10× in the laminar regime (Zogg) and is carried as a reference anchor only. The engine now consumes a source-tagged frictionFactorData basis the moment one is entered — no value is invented until then.'],
    ['Dry packing pressure drop Δp/Δz (and total)', 'Not Calculable (reserved architecture)', 'STILL NOT CALCULABLE (framework implemented)', 'Governing equation (2)/(6) is implemented and blocked SOLELY by the missing friction factor above — d_h, u_s, Re, F_v are calculated and independently verifiable.'],
    ['Wet pressure drop Δp (ECP-007)', 'Not Calculable (no vendor wet basis in the packing record)', 'STILL NOT CALCULABLE — unchanged', 'The dry framework never substitutes the vendor wet basis; entry of vendor wet data remains the closure path for the operating-column pressure drop.'],
    ['Back-calculated verification c_f (ECP-010)', 'Did not exist', 'STILL NOT CALCULABLE (verification armed)', 'The paper\'s verification procedure (steps a–f) is implemented and runs automatically once either a vendor wet Δp basis or a friction-factor basis is entered.'],
  ];

  const confidence: string[][] = [
    ['Calculation', 'Equation ID(s)', 'Confidence classification', 'Basis'],
    ['Hydraulic diameter d_h = 4/a', 'ECP-009-DH', pred.hydraulicDiameter?.status ?? '—', 'Published geometric definition; datum currently Assumed (preliminary screening record) — value ' + rvNum(pred.hydraulicDiameter) + ' m.'],
    ['Superficial velocity u_s', 'ECP-009-US', spRow.superficialVelocity?.status ?? '—', 'Definition from entered flows and densities.'],
    ['Phase Reynolds number Re', 'ECP-009-RE', spRow.phaseReynolds?.status ?? '—', `Published definition; representative maximum-case Re = ${rvNum(spRow.phaseReynolds, 2)}. Flow regime cannot presently be determined because no source-tagged corrugation angle exists and the published regime anchors are for gas-phase structured packing. Regime classification therefore remains Pending Validation.`],
    ['Load factor F_v', 'ECP-009-FV', spRow.phaseLoadFactor?.status ?? '—', 'Published definition (gas-load-factor analog).'],
    ['Flow regime', 'ECP-009-REGIME', spRow.flowRegime?.status ?? '—', `Representative classification: ${rvNum(spRow.flowRegime)} — published anchors only, no interpolation. Not classified as laminar, transition or turbulent until sufficient governed data (source-tagged corrugation angle, and ultimately liquid-duty anchors) exist.`],
    ['Pipe reference f = 16/Re', 'ECP-009-FREF', spRow.laminarPipeReferenceFrictionFactor?.status ?? '—', 'Reference/comparison anchor only — NEVER a packing friction factor.'],
    ['Packing friction factor c_f', 'ECP-009-CF', spRow.frictionFactor?.status ?? '—', 'Data-gated — awaits a source-tagged vendor/measured/controlled-literature basis.'],
    ['Dry Δp/Δz and Δp total', 'ECP-009-DP', (spRow.dryPressureDrop?.perMeter ?? spRow.dryPressureDrop)?.status ?? '—', `When computable it is ALWAYS "${classification}" — never Calculated, because the validation basis is gas-phase.`],
    ['Verification back-calculated c_f', 'ECP-010-CFVERIF', verif?.backCalculatedFrictionFactor?.status ?? '—', 'Data-gated; Pending Validation when computed.'],
  ];

  const nc = collectNotCalculable(ecp);
  const sections: ReportSection[] = [
    { title: 'Scope, Run Identification & Governing Source', paragraphs: [
      `This Design Review Report reviews the incorporation of the single-phase frictional pressure-drop framework into the Stage C4 packed-column engine for design ${rev.design_number}${rev.title ? `, ${rev.title}` : ''}, Rev ${rev.revision_number}. It renders the frozen 'ecp' snapshot of calculation run #${run?.id ?? '—'} (engine ${run?.engine_name ?? 'llx-ecp'} v${res.engine_version ?? '—'}, status '${run?.calculation_status ?? '—'}'). The engine was NOT re-run for this report and this report carries no calculation authority of its own.`,
      `Governing source documents: ${(pred.sourceDocuments ?? []).join('; ')}. Only equations explicitly published in the source are implemented; vendor-software outputs and proprietary correlations are excluded by directive.`,
      `Overriding classification of every pressure-drop quantity in the new framework (verbatim): "${classification}".`,
    ]},
    { title: '1. Existing Capability (Before This Incorporation)', paragraphs: [
      'Stage C4 (engine llx-ecp v1.0.0) already provided: per-diameter column loadings (ECP-001); hydraulic utilization against Vendor Packing Capacity with system derating (ECP-002); vendor minimum-wetting and recommended-loading checks (ECP-003); modular distributor checks (ECP-004); packing height via HETS (ECP-005); bed split and redistributors (ECP-006); WET pressure drop from the vendor basis with interpolation-only discipline (ECP-007); and the full height breakdown and diameter rating (ECP-008).',
      'Dry pressure drop was reserved architecture: declared, never calculated, with no prediction path of any kind. No hydraulic-diameter, Reynolds-number, F-factor, friction-factor or flow-regime quantities existed anywhere in the C4 output.',
    ]},
    { title: '2. New Capability Added (Engine v1.1.0 — ECP-009/ECP-010)', paragraphs: [
      'A preliminary single-phase frictional (dry-bed analog) prediction framework, implemented strictly from the explicitly published equations of the governing source: d_h = 4/a (eq. 3); Re = u_s·ρ·d_h/η (eq. 4, superficial-velocity basis); F_v = u_s·√ρ (eq. 5); Δp/Δz = c_f·ρ·u_s²/(2·d_h) = c_f·F_v²/(2·d_h) (eqs. 2/6); f = 16/Re (eq. 1) carried as a laminar PIPE reference relation only. Flow-regime classification uses only the published experimental critical Reynolds numbers (Zogg: ≈250 at 45°, ≈450 at 30°).',
      'The Packing Database schema now accepts two optional source-tagged data: a corrugation angle and a friction-factor basis (constant, or curve vs phase Reynolds number — interpolation only). The paper\'s quantitative verification procedure (back-calculated c_f compared at the computed Re) is implemented as ECP-010 and arms automatically when the required data exist.',
      `Every quantity in the framework is emitted as a rich, source-tagged result with full derivation, variable definitions, units, applicability limits and assumptions in the frozen snapshot, and is classified "${classification}".`,
    ]},
    { title: 'Hydraulic Basis of the Preliminary Framework', intro: 'Wherever Re, F_v and superficial velocity are reported in this document and in the ECPR, the following basis applies (values verbatim from the frozen snapshot, representative maximum-case diameter). The mathematical certainty of the published equations is distinct from the maturity of the input data — the equations are exact; several inputs remain Assumed or provisional.', table: [
      ['Basis item', 'Value', 'Source / maturity'],
      ['Continuous phase used for the preliminary pressure-drop framework', String(ecp.maximumCase?.flows?.continuousPhase ?? '—') + ' (continuous liquid phase)', 'Phase configuration from design basis inputs.'],
      ['ρ_continuous', `${ecp.designBasis?.solventFluid?.densityUsed?.value != null ? Number(ecp.designBasis.solventFluid.densityUsed.value).toFixed(2) : '—'} kg/m³`, String(ecp.designBasis?.solventFluid?.densityUsed?.source ?? '—')],
      ['μ_continuous (η_c)', 'As stated verbatim in the Re basis string below', String(spRow.phaseReynolds?.source ?? '—')],
      ['Superficial velocity of the continuous phase u_s', `${rvNum(spRow.superficialVelocity)} m/s`, String(spRow.superficialVelocity?.validation ?? '—')],
    ]},
    { title: '3. Validated-Range Position (ECP-010, Verbatim)', paragraphs: [
      String(verif?.validatedRangeStatement ?? '—'),
      `Verification procedure (verbatim): ${verif?.procedure ?? '—'}`,
      `Back-calculated friction factor: ${rvNum(verif?.backCalculatedFrictionFactor)} — ${verif?.backCalculatedFrictionFactor?.validation ?? '—'}`,
    ]},
    { title: '4. Disposition of Previously Not-Calculable / Non-Existent Fields', intro: 'Per the governing directive, every pressure-drop-related field is re-dispositioned as Calculated, Preliminary Calculated, or Still Not Calculable, with justification. No field was closed by inventing data.', table: disposition },
    { title: '5. Confidence Classification per Calculation', intro: 'Statuses are read verbatim from the frozen snapshot (representative maximum-case diameter shown for per-diameter items).', table: confidence },
    { title: '6. Remaining Gaps', paragraphs: [
      '1. No packing friction-factor data: c_f and hence the dry Δp remain Not Calculable until a source-tagged vendor/measured/controlled-literature basis is entered. This is a data gap, not a capability gap.',
      `2. No corrugation-angle datum in the current packing record: with the representative maximum-case Re = ${rvNum(spRow.phaseReynolds, 2)} at or above the lowest published anchor (≈250 at 45°), the bounding argument cannot resolve the regime and the classification is ${rvNum(spRow.flowRegime)} — it remains so until a source-tagged corrugation angle (and ultimately liquid-duty regime data) is entered.`,
      '3. No vendor WET pressure-drop basis: the operating-column pressure drop (ECP-007) remains Not Calculable — the dry framework does not and must not close this gap.',
      '4. Liquid-liquid validation: the entire framework is a gas-phase analog. RRBO/NMP experimental or vendor pressure-drop data are required to validate (or re-anchor) the framework for LLX duty — hence the standing classification.',
      '5. Two-phase effects: dispersed-phase holdup influence on frictional Δp is excluded by construction (below-loading-point, single-phase scope of the source).',
    ]},
    { title: '7. Recommended Modifications / Closure Actions', paragraphs: [
      '1. Obtain a vendor-certified packing record for the selected packing including specific surface area, corrugation angle, and a friction-factor basis (c_f vs Re) or wet pressure-drop basis — this simultaneously closes ECP-002 utilization, ECP-007 wet Δp, and arms ECP-009/ECP-010.',
      '2. On receipt of RRBO/NMP pilot or vendor liquid-liquid pressure-drop data, execute the ECP-010 verification against them and either validate the analog or record its rejection — never widen tolerances to force agreement.',
      '3. Keep the classification banner on every ECP-009 output until item 2 is closed; the classification is removed only by data, never by review.',
      '4. No software modification is recommended for the friction factor: implementing any unpublished c_f correlation (or the pipe 16/Re relation) would contradict the governing source and the project\'s exact-citation rule.',
    ]},
    { title: 'Annex — Complete Not-Calculable Register (Frozen Snapshot, Verbatim)', table: [
      ['Equation Ref', 'Item (stored basis string)', 'Stored explanation (verbatim)'],
      ...nc.map(n => [n.ref || '—', n.source, n.validation]),
    ]},
  ];

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'DRR', docTypeTitle: 'Design Review Report — Preliminary Pressure-Drop Framework (ECP-009/ECP-010)',
    docNumber: `${rev.design_number}-DRR`, reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number, designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction', revisionLabel: `Rev ${rev.revision_number}`, revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', generatedByName,
    traceability: {
      revisionId,
      runs: [{ engine: run?.engine_name ?? 'llx-ecp', version: String(res.engine_version ?? '—'), runId: run?.id ?? null, ranAt: run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined }],
      note: `Design review of the frozen 'ecp' snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}) — review document only, no calculation authority.`,
    },
    sections,
    assumptions: [
      { item: 'Packing specific surface area (SSA) a — input to d_h = 4/a', value: `${pred.hydraulicDiameter?.result ? (4 / Number(pred.hydraulicDiameter.result)).toFixed(1) : '—'} m²/m³`, sourceRef: 'Thermopac Preliminary Screening Default (preliminary screening packing record)', status: 'Pending Vendor Validation — assumed engineering data; the equation d_h = 4/a is mathematically exact, but the SSA datum feeding it is assumed until a vendor-certified packing record is entered' },
      { item: 'Hydraulic diameter d_h derived from the assumed SSA', value: `${rvNum(pred.hydraulicDiameter)} m`, sourceRef: 'ECP-009-DH (published definition d_h = 4/a)', status: 'Thermopac Preliminary Screening Default — Pending Vendor Validation; inherits the maturity of the assumed SSA, not the certainty of the equation' },
    ],
    missingData: [
      { item: 'Packing friction factor (c_f) basis', reason: 'Dry Δp Still Not Calculable — see disposition table.', severity: 'warning' },
      { item: 'RRBO/NMP liquid-liquid pressure-drop validation data', reason: 'Framework remains a gas-phase analog until validated — standing classification applies.', severity: 'warning' },
    ],
    references: (pred.sourceDocuments ?? []) as string[],
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY — NOT FOR CONSTRUCTION',
  };
  return { payload, blocking: 0 };
}

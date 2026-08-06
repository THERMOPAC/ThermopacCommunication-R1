/**
 * Design Basis Report (DBR) — payload builder.
 *
 * Renders ONLY basis inputs (Stages 1–4: Design Identity, Design Basis, Fluid
 * Properties, Process Design basis values). No calculated results — those
 * belong to the Process Design Report onward. Every value carries its source
 * classification; nothing is invented and nothing is silently defaulted here:
 * the builder reads exactly what the workspace has persisted.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
};

interface FieldSpec {
  key: string;
  label: string;
  unit?: string;
  mandatory?: boolean;
  /** fixed rule citation used when the field is Auto-Populated and no *_source exists */
  ruleRef?: string;
}

const DT_RULE = 'Thermopac Design Temperature Rule (ASME Sec. VIII Div. 1): OT 50–80 °C → 100 °C; OT > 80 °C → OT + 20 °C';
const DP_RULE = 'Thermopac Design Basis Standard — LLX extraction column internal design pressure (Stage 2)';
const WB_RULE = 'Thermopac Site Condition Rule — Wet Bulb = Ambient − 5 °C';
const CW_RULE = 'Thermopac Site Condition Rule — CW inlet tracks Ambient; ΔT default 8 °C';
const OP_RULE = 'Thermopac Design Basis Master — LLX operating pressure default (1.0 bar g)';

const GENERAL: FieldSpec[] = [
  { key: 'feed_service', label: 'Feed Service', mandatory: true },
  { key: 'solvent', label: 'Solvent', mandatory: true },
  { key: 'feed_density', label: 'Feed Density', unit: 'kg/m³' },
  { key: 'design_capacity_lph', label: 'Design Capacity', unit: 'LPH', mandatory: true },
  { key: 'design_capacity_mtpa', label: 'Design Capacity (annual)', unit: 't/yr' },
  { key: 'operating_days', label: 'Operating Days', unit: 'days/yr' },
  { key: 'design_life', label: 'Design Life', unit: 'years' },
];
const OPERATING: FieldSpec[] = [
  { key: 'ambient_temperature', label: 'Ambient Temperature', unit: '°C' },
  { key: 'wet_bulb_temperature', label: 'Wet Bulb Temperature', unit: '°C', ruleRef: WB_RULE },
  { key: 'site_elevation', label: 'Site Elevation', unit: 'm above MSL' },
  { key: 'feed_flow', label: 'Feed Flow', unit: 'LPH' },
  { key: 'feed_temperature', label: 'Feed Temperature', unit: '°C' },
  { key: 'feed_pressure', label: 'Feed Pressure', unit: 'bar g' },
  { key: 'operating_pressure', label: 'Operating Pressure', unit: 'bar g', mandatory: true, ruleRef: OP_RULE },
  { key: 'operating_temperature', label: 'Operating Temperature', unit: '°C', mandatory: true },
];
const DESIGN_COND: FieldSpec[] = [
  { key: 'vessel_orientation', label: 'Vessel Orientation' },
  { key: 'column_height_m', label: 'Approx. Column Height', unit: 'm' },
  { key: 'llx_internal_design_pressure', label: 'Internal Design Pressure', unit: 'bar g', mandatory: true, ruleRef: DP_RULE },
  { key: 'llx_external_design_condition', label: 'External Design Condition', ruleRef: DP_RULE },
  { key: 'llx_full_vacuum_required', label: 'Full Vacuum Design Required' },
  { key: 'design_temperature', label: 'Design Temperature', unit: '°C', mandatory: true, ruleRef: DT_RULE },
];
const THERMAL_CW: FieldSpec[] = [
  { key: 'thermal_oil_type', label: 'Thermal Oil Type / Grade' },
  { key: 'thermal_heater_inlet', label: 'Heater Inlet Temperature', unit: '°C' },
  { key: 'thermal_heater_outlet', label: 'Heater Outlet Temperature', unit: '°C' },
  { key: 'thermal_oil_max_bulk_temp', label: 'Max Bulk Temperature', unit: '°C' },
  { key: 'thermal_oil_max_film_temp', label: 'Max Film Temperature', unit: '°C' },
  { key: 'cw_inlet_temperature', label: 'Cooling Water Inlet', unit: '°C', ruleRef: CW_RULE },
  { key: 'cw_delta_t', label: 'Cooling Water Design ΔT', unit: '°C', ruleRef: CW_RULE },
  { key: 'cw_outlet_temperature', label: 'Cooling Water Outlet', unit: '°C', ruleRef: CW_RULE },
  { key: 'cw_approach', label: 'Cooling Tower Approach', unit: '°C', ruleRef: CW_RULE },
];
const PROCESS: FieldSpec[] = [
  { key: 'so_ratio', label: 'Solvent / Oil Ratio', unit: ': 1 (vol/vol)', mandatory: true },
  { key: 'extraction_temperature', label: 'Extraction Temperature', unit: '°C' },
  { key: 'extraction_pressure', label: 'Extraction Pressure', unit: 'bar g' },
  { key: 'theoretical_stages', label: 'Theoretical Stages', unit: 'stages' },
  { key: 'stage_efficiency', label: 'Stage Efficiency', unit: '%' },
  { key: 'design_margin', label: 'Design Margin', unit: '%' },
  { key: 'phase_configuration', label: 'Phase Configuration' },
  { key: 'interface_control', label: 'Interface Control' },
];

const FLUID_GROUPS: Array<{ title: string; props: Array<{ key: string; label: string }> }> = [
  { title: 'RRBO — Re-Refined Base Oil (project fluid)', props: [
    { key: 'rrbo_density', label: 'Density' }, { key: 'rrbo_viscosity_dynamic', label: 'Dynamic Viscosity' },
    { key: 'rrbo_viscosity_kinematic', label: 'Kinematic Viscosity' }, { key: 'rrbo_temperature', label: 'Reference Temperature' },
    { key: 'rrbo_water', label: 'Water Content' }, { key: 'rrbo_colour', label: 'Colour (ASTM)' },
    { key: 'rrbo_sulphur', label: 'Sulphur Content' }, { key: 'rrbo_asphaltenes', label: 'Asphaltenes' },
  ]},
  { title: 'NMP — N-Methyl-2-Pyrrolidone', props: [
    { key: 'nmp_density', label: 'Density' }, { key: 'nmp_viscosity_dynamic', label: 'Dynamic Viscosity' },
    { key: 'nmp_temperature', label: 'Reference Temperature' }, { key: 'nmp_purity', label: 'Purity' },
    { key: 'nmp_water', label: 'Water Content' },
  ]},
  { title: 'Two-Phase Properties (NMP / RRBO)', props: [
    { key: 'interfacial_tension', label: 'Interfacial Tension' },
    { key: 'nmp_solubility_rrbo', label: 'NMP in RRBO-Rich Phase' },
    { key: 'oil_solubility_nmp', label: 'Oil/Extractables in NMP-Rich Phase' },
  ]},
];

export async function buildDesignBasisPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  const inputsQ = await pool.query(`SELECT section, data FROM design_software_inputs WHERE revision_id = $1`, [revisionId]);
  const bySection: Record<string, Record<string, string>> = {};
  for (const row of inputsQ.rows) bySection[row.section] = { ...(bySection[row.section] ?? {}), ...(row.data ?? {}) };
  const di = bySection['design_identity'] ?? {};
  const db = bySection['design_basis'] ?? {};
  const fp = bySection['fluid_properties'] ?? {};
  const pd = bySection['process_design'] ?? {};

  const assumptions: ReportPayload['assumptions'] = [];
  const missing: ReportPayload['missingData'] = [];
  const references = new Set<string>();

  const classify = (data: Record<string, string>, f: FieldSpec): ReportRow => {
    const value = String(data[f.key] ?? '').trim();
    const status = String(data[`${f.key}_status`] ?? '').trim();
    const source = String(data[`${f.key}_source`] ?? '').trim();
    const manual = String(data[`${f.key}_manual`] ?? data[`${f.key}_override`] ?? '').trim() === 'true' || status === 'Manual';
    let sourceType: string; let sourceRef: string;
    if (value === '') {
      sourceType = 'Not Entered'; sourceRef = '';
      if (f.mandatory) missing.push({ item: f.label, reason: 'Mandatory basis value not entered and not rule-populated.', severity: 'error' });
    } else if (manual) {
      // Manual/override flag takes precedence over any stale Auto-Populated status
      sourceType = 'Engineer Entry (rule overridden)'; sourceRef = source || '';
    } else if (status === 'Auto-Populated' || status === 'Auto-Calculated') {
      sourceType = 'Thermopac Rule (Auto-Populated)';
      sourceRef = source || f.ruleRef || 'Thermopac Design Basis Standard';
    } else {
      sourceType = 'Engineer Entry'; sourceRef = source || '';
    }
    if (sourceRef) references.add(sourceRef);
    return { label: f.label, value, unit: f.unit, sourceType, sourceRef };
  };

  const rowsOf = (data: Record<string, string>, specs: FieldSpec[]) => specs.map(f2 => classify(data, f2));

  // Fluid property matrix — value/unit/ref-temp/source per property
  const fluidSections: ReportSection[] = FLUID_GROUPS.map(g => ({
    title: g.title,
    rows: g.props.map(pr => {
      const value = String(fp[`${pr.key}_value`] ?? '').trim();
      const unit = String(fp[`${pr.key}_unit`] ?? '').trim();
      const refT = String(fp[`${pr.key}_ref_temp`] ?? '').trim();
      const source = String(fp[`${pr.key}_source`] ?? '').trim();
      let sourceType = 'Not Entered';
      if (value !== '') sourceType = source === 'Assumed' ? 'Assumed — Pending Validation' : source ? 'Entered (cited source)' : 'Entered (source not cited)';
      if (value !== '' && source === 'Assumed') assumptions.push({ item: `${g.title.split('—')[0].trim()} — ${pr.label}`, value: `${value} ${unit}`.trim(), sourceRef: [source, refT ? `@ ${refT} °C` : ''].filter(Boolean).join(' '), status: 'Pending Laboratory Validation' });
      if (value !== '' && source && source !== 'Assumed') references.add(source);
      if (value === '' && ['interfacial_tension', 'nmp_solubility_rrbo', 'oil_solubility_nmp'].includes(pr.key)) {
        missing.push({ item: pr.label, reason: 'No approved NMP/RRBO two-phase value — laboratory/vendor data required.', severity: 'warning' });
      }
      return { label: pr.label, value, unit, sourceType, sourceRef: [source, refT ? `@ ${refT} °C` : ''].filter(Boolean).join(' ') } as ReportRow;
    }),
  }));

  // Assumptions from rule-populated design-basis values
  for (const specs of [OPERATING, DESIGN_COND, THERMAL_CW]) {
    for (const f of specs) {
      const status = String(db[`${f.key}_status`] ?? '').trim();
      const value = String(db[f.key] ?? '').trim();
      if (value !== '' && (status === 'Auto-Populated' || status === 'Auto-Calculated')) {
        assumptions.push({ item: f.label, value: `${value} ${f.unit ?? ''}`.trim(), sourceRef: String(db[`${f.key}_source`] ?? '').trim() || f.ruleRef || 'Thermopac Design Basis Standard', status: 'Rule value — Pending Validation at design approval' });
      }
    }
  }

  // Product requirements tables
  const qualityTable = (raw: string | undefined, title: string): ReportSection | null => {
    let rows: Array<Record<string, string>> = [];
    try { rows = JSON.parse(raw || '[]'); } catch { rows = []; }
    if (!Array.isArray(rows) || !rows.length) return null;
    return { title, table: [['Parameter', 'Target', 'Unit', 'Limit', 'Notes'], ...rows.map(r => [r.parameter ?? '', r.target ?? '', r.unit ?? '', r.limitType ?? '', r.notes ?? ''])] };
  };

  const sections: ReportSection[] = [
    { title: 'Introduction & Design Identity', rows: [
      { label: 'Design Number', value: rev.design_number },
      { label: 'Design Title', value: rev.title ?? '' },
      { label: 'Module', value: 'Liquid-Liquid Extraction' },
      { label: 'Design Type', value: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design' },
      { label: 'Client / Customer', value: di.client ?? '' },
      { label: 'Plant Location', value: di.plant_location ?? '' },
    ], paragraphs: [String(db.design_objective ?? '').trim()].filter(Boolean) },
    { title: 'Scope & Process Description', paragraphs: [
      String(db.process_description ?? '').trim() || 'Process description not entered.',
      'Battery limits: this design basis covers the liquid-liquid extraction column and its directly associated design conditions. Upstream feed conditioning, downstream solvent recovery and off-plot utilities are outside the scope of this document.',
    ]},
    { title: 'Duty Specification', rows: rowsOf(db, GENERAL) },
    { title: 'Site & Operating Conditions', rows: rowsOf(db, OPERATING) },
    { title: 'Design Conditions', rows: rowsOf(db, DESIGN_COND) },
    { title: 'Thermal Oil & Cooling Water Basis', rows: rowsOf(db, THERMAL_CW) },
    ...fluidSections,
    { title: 'Process Design Basis Values', intro: 'Basis values only — calculated process results are reported in the Process Design Report.', rows: rowsOf(pd, PROCESS) },
    ...( [qualityTable(db.raffinate_quality_rows, 'Product Requirements — Raffinate Quality'), qualityTable(db.extract_quality_rows, 'Product Requirements — Extract Quality')].filter(Boolean) as ReportSection[] ),
  ];

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'DBR',
    docTypeTitle: 'Design Basis Report',
    docNumber: `${rev.design_number}-DBR`,
    reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number,
    designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction',
    revisionLabel: `Rev ${rev.revision_number}`,
    revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    generatedByName,
    traceability: { revisionId, runs: [], note: 'The Design Basis Report consumes design-basis inputs only (Stages 1–4); no calculation-engine output is rendered in this document.' },
    sections,
    assumptions,
    missingData: missing,
    references: Array.from(references),
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY — NOT FOR CONSTRUCTION',
  };
  return { payload, blocking: missing.filter(m => m.severity === 'error').length };
}

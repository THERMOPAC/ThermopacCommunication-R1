// ═══════════════════════════════════════════════════════════════════════════════
// Thermopac Controlled Nozzle Master Data + Automatic Nozzle Generation (Stage 9)
//
// Scope (per directive): automatic nozzle generation, preliminary sizing
// (A = Q/v, d = √(4A/π), next larger DN), preliminary layout elevations and
// generation-time validation. NO C6 engine equations are touched — the
// generated schedule is ordinary Stage 9 input data that the existing
// Stage 9 → C6 mapper forwards unchanged.
//
// Governance: every default lives HERE as named, source-tagged master data —
// nothing is hidden in the mapper. All generated values remain editable in
// Stage 9; engineer edits are marked "Engineer Override" by the client.
// All sizes/velocities are Assumed screening values — Pending Validation.
// ═══════════════════════════════════════════════════════════════════════════════

export const NOZZLE_MASTER_REF = 'Thermopac Preliminary Nozzle Master v1.0 (Assumed — Pending Validation)';
export const VELOCITY_MASTER_REF = 'Thermopac Preliminary Nozzle Velocity Master v1.0 (Assumed — Pending Validation)';
export const LAYOUT_REF = 'Preliminary Layout — generated from vessel geometry; to be confirmed at GA/layout stage';

/** Approved Thermopac DN series (same series the Stage 9 → C6 mapper declares). */
export const DN_SERIES = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];

/** Liquid-service design velocities, m/s, with approved screening ranges. */
export const VELOCITY_MASTER: Record<string, { design: number; min: number; max: number }> = {
  inlet:  { design: 1.5, min: 1.0, max: 3.0 },  // pumped process inlets (feed, solvent)
  outlet: { design: 1.0, min: 0.5, max: 1.5 },  // gravity/withdrawal outlets (raffinate, extract)
  drain:  { design: 1.0, min: 0.5, max: 2.0 },
};

/** Instrument Nozzle Master — fixed preliminary DNs (no manual entry required). */
export const INSTRUMENT_NOZZLE_MASTER: { tag: string; service: string; dn: number }[] = [
  { tag: 'PI1', service: 'Pressure Instrument', dn: 50 },
  { tag: 'TI1', service: 'Temperature Instrument', dn: 40 },
  { tag: 'LI1', service: 'Interphase Level Instrument', dn: 50 },
  { tag: 'LG1', service: 'Local Level Indication', dn: 50 },
  { tag: 'S1',  service: 'Sampling', dn: 25 },
];

/** Mechanical / access nozzle rules. */
export const ACCESS_RULES = {
  manwayMinVesselId_m: 0.9,  // ID ≥ 0.9 m → DN500 manway; smaller → DN250 handhole
  manwayDn: 500,
  handholeDn: 250,
  ecpPackingLoadingDn: 200,
  ecpPackingUnloadingDn: 150,
  ecrShaftOpeningDn: 200,    // preliminary — final opening is agitator-vendor-defined
  spareDn: 50,
  cleanOutDn: 80,
  ventMinDn: 50,             // vent is rule-based (min DN), not velocity-sized
};

/** Flange rating rule (preliminary screening): ASME B16.5 Class 150 covers the
 *  LLX screening envelope (≤ 19 barg at ≤ 200 °C for the material families in
 *  the Stage 9 master); above that → Class 300. */
export function flangeRating(designPressureBarg: number | undefined, designTempC: number | undefined): string {
  const p = designPressureBarg ?? 0;
  const t = designTempC ?? 0;
  return p <= 19 && t <= 200 ? '150#' : '300#';
}

export interface GeneratedNozzle {
  tag: string;
  service: string;
  flow_basis: string;        // e.g. "4.00 m³/h — Stage 2 feed flow"
  design_velocity: string;   // e.g. "1.5 m/s" ('' for rule-based sizes)
  calc_dia_mm: string;       // calculated bore, '' for rule-based sizes
  size: string;              // "DN80"
  rating: string;
  flange_std: string;
  facing: string;
  connection: string;
  orientation: string;       // degrees or location note
  elevation: string;         // metres above bottom tangent line (BTL)
  qty: string;
  source: string;            // Auto-Generated | Engineer Override
  status: string;            // Preliminary — Pending Validation
  remarks: string;
}

export interface NozzleGenerationContext {
  preferred: 'ecp' | 'ecr';
  insideDiameter_m: number;
  tangentToTangentHeight_m: number;
  feedFlow_m3h: number | null;          // Stage 2
  solventFlow_m3h: number | null;       // feed × S:F ratio (Stage 4)
  bottomDisengagement_m: number | null; // Stage 6/7 zone inputs
  topDisengagement_m: number | null;
  topDistributorAllowance_m: number | null;
  designPressureBarg: number | undefined;
  designTempC: number | undefined;
}

export interface NozzleGenerationResult {
  rows: GeneratedNozzle[];
  issues: { severity: 'error' | 'warning'; message: string }[];
  references: string[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const fmtM = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

/** A = Q/v; d = √(4A/π); select next larger DN from the approved series. */
export function sizeLiquidNozzle(flow_m3h: number, velocity_ms: number): { calcDia_mm: number; dn: number | null } {
  const area_m2 = (flow_m3h / 3600) / velocity_ms;
  const dia_mm = Math.sqrt((4 * area_m2) / Math.PI) * 1000;
  const dn = DN_SERIES.find(d => d >= dia_mm) ?? null;
  return { calcDia_mm: round1(dia_mm), dn };
}

/** Actual velocity in the selected DN (bore ≈ DN for screening). */
function actualVelocity(flow_m3h: number, dn: number): number {
  const a = Math.PI * Math.pow(dn / 1000, 2) / 4;
  return (flow_m3h / 3600) / a;
}

export function generateNozzleSchedule(ctx: NozzleGenerationContext): NozzleGenerationResult {
  const issues: NozzleGenerationResult['issues'] = [];
  const rows: GeneratedNozzle[] = [];
  const rating = flangeRating(ctx.designPressureBarg, ctx.designTempC);
  const tt = ctx.tangentToTangentHeight_m;

  const base = {
    rating,
    flange_std: 'ASME B16.5',
    facing: 'RF',
    connection: 'Flanged',
    qty: '1',
    source: 'Auto-Generated',
    status: 'Preliminary — Pending Validation',
  };

  // ── Preliminary elevations (m above BTL) ─────────────────────────────────
  const botDis = ctx.bottomDisengagement_m ?? 1.0;
  const topDis = ctx.topDisengagement_m ?? 1.0;
  const topDist = ctx.topDistributorAllowance_m ?? 0.5;
  const elFeed = Math.max(0, tt - topDis - topDist);       // heavy (aqueous) feed above bed
  const elSolvent = Math.min(tt, botDis / 2);              // light solvent below bed
  const elInterface = Math.min(tt, botDis / 2);            // interphase in bottom disengagement zone

  const liquid = (tag: string, service: string, flow: number | null, cls: 'inlet' | 'outlet', flowRef: string, orientation: string, elevation: number, remarks: string) => {
    if (flow === null || !(flow > 0)) {
      rows.push({ tag, service, flow_basis: `Not available — ${flowRef}`, design_velocity: '', calc_dia_mm: '', size: '', ...base, orientation, elevation: fmtM(elevation), remarks: `${remarks}; flow basis missing — size Not Calculable` });
      issues.push({ severity: 'warning', message: `${tag} (${service}): no flow basis available (${flowRef}) — size left blank, never assumed.` });
      return;
    }
    const v = VELOCITY_MASTER[cls];
    const { calcDia_mm, dn } = sizeLiquidNozzle(flow, v.design);
    if (dn === null) {
      issues.push({ severity: 'error', message: `${tag} (${service}): calculated bore ${calcDia_mm} mm exceeds the approved DN series maximum ${DN_SERIES[DN_SERIES.length - 1]}.` });
    } else {
      const va = actualVelocity(flow, dn);
      if (va < v.min || va > v.max) issues.push({ severity: 'warning', message: `${tag} (${service}): velocity in DN${dn} is ${va.toFixed(2)} m/s — outside the approved ${v.min}–${v.max} m/s range.` });
    }
    rows.push({
      tag, service,
      flow_basis: `${flow.toFixed(2)} m³/h — ${flowRef}`,
      design_velocity: `${v.design} m/s`,
      calc_dia_mm: String(calcDia_mm),
      size: dn !== null ? `DN${dn}` : '',
      ...base, orientation, elevation: fmtM(elevation), remarks,
    });
  };

  // ── 1. Process nozzles (aqueous feed top / solvent bottom — LLX counter-current) ──
  liquid('N1', 'Feed (Aqueous) Inlet', ctx.feedFlow_m3h, 'inlet', 'Stage 2 Design Basis feed flow', '0°', elFeed, 'Heavy-phase feed above mass-transfer zone');
  liquid('N2', 'Solvent Inlet', ctx.solventFlow_m3h, 'inlet', 'Stage 2 feed flow × Stage 4 S:F ratio', '180°', elSolvent, 'Light-phase solvent below mass-transfer zone');
  liquid('N3', 'Raffinate Outlet', ctx.feedFlow_m3h, 'outlet', 'Preliminary continuity basis — raffinate ≈ feed flow (Pending Validation)', '90°', 0.1, 'Heavy phase leaves bottom');
  liquid('N4', 'Extract Outlet', ctx.solventFlow_m3h, 'outlet', 'Preliminary continuity basis — extract ≈ solvent flow (Pending Validation)', '90°', tt, 'Light phase leaves top');
  rows.push({ tag: 'N5', service: 'Vent', flow_basis: 'Rule-based — vent minimum DN (no velocity sizing)', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.ventMinDn}`, ...base, orientation: 'Top head', elevation: fmtM(tt), remarks: 'Highest point — top head' });
  rows.push({ tag: 'N6', service: 'Drain', flow_basis: 'Rule-based — drain master DN', design_velocity: '', calc_dia_mm: '', size: 'DN50', ...base, orientation: 'Bottom head', elevation: '0.00', remarks: 'Lowest point — bottom head' });

  // ── 2. Instrument nozzles (Instrument Nozzle Master — no manual DN entry) ──
  const instEl: Record<string, number> = { PI1: Math.max(0, tt - 0.5), TI1: tt / 2, LI1: elInterface, LG1: elInterface, S1: tt / 2 };
  for (const m of INSTRUMENT_NOZZLE_MASTER) {
    rows.push({ tag: m.tag, service: m.service, flow_basis: 'Instrument Nozzle Master — fixed preliminary DN', design_velocity: '', calc_dia_mm: '', size: `DN${m.dn}`, ...base, orientation: m.tag === 'LI1' || m.tag === 'LG1' ? '270°' : '0°', elevation: fmtM(instEl[m.tag] ?? tt / 2), remarks: m.tag === 'LI1' ? 'At interphase control zone' : '' });
  }

  // ── 3. Mechanical / access nozzles ─────────────────────────────────────────
  if (ctx.insideDiameter_m >= ACCESS_RULES.manwayMinVesselId_m) {
    rows.push({ tag: 'MW1', service: 'Manway', flow_basis: 'Access rule — vessel ID ≥ 0.9 m', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.manwayDn}`, ...base, orientation: '0°', elevation: fmtM(tt / 2), remarks: 'Maintenance access' });
  } else {
    rows.push({ tag: 'HH1', service: 'Handhole (Inspection)', flow_basis: `Access rule — vessel ID ${fmtM(ctx.insideDiameter_m)} m < 0.9 m manway threshold`, design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.handholeDn}`, ...base, orientation: '0°', elevation: fmtM(tt / 2), remarks: 'Inspection access — vessel too small for a manway' });
  }
  if (ctx.preferred === 'ecp') {
    rows.push({ tag: 'PL1', service: 'Packing Loading Opening', flow_basis: 'ECP access rule', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.ecpPackingLoadingDn}`, ...base, orientation: '180°', elevation: fmtM(Math.max(0, tt - topDis)), remarks: 'Above packed bed' });
    rows.push({ tag: 'PU1', service: 'Packing Unloading Opening', flow_basis: 'ECP access rule', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.ecpPackingUnloadingDn}`, ...base, orientation: '180°', elevation: fmtM(Math.min(tt, botDis)), remarks: 'Below packed bed' });
  } else {
    rows.push({ tag: 'M1', service: 'Agitator Shaft / Drive Opening', flow_basis: 'ECR rule — preliminary; final opening is agitator-vendor-defined', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.ecrShaftOpeningDn}`, ...base, orientation: 'Top head (centre)', elevation: fmtM(tt), remarks: 'Vendor-defined — preliminary placeholder DN' });
  }
  rows.push({ tag: 'CO1', service: 'Bottom Clean-Out', flow_basis: 'Access rule', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.cleanOutDn}`, ...base, orientation: 'Bottom head', elevation: '0.00', remarks: '' });
  rows.push({ tag: 'SP1', service: 'Spare', flow_basis: 'Master rule — standard spare', design_velocity: '', calc_dia_mm: '', size: `DN${ACCESS_RULES.spareDn}`, ...base, orientation: '270°', elevation: fmtM(Math.max(0, tt - 0.5)), remarks: 'Blinded spare' });

  // ── 6. Generation-time validation ──────────────────────────────────────────
  const tags = rows.map(r => r.tag);
  const dup = tags.filter((t, i) => tags.indexOf(t) !== i);
  if (dup.length) issues.push({ severity: 'error', message: `Duplicate nozzle tags generated: ${Array.from(new Set(dup)).join(', ')}` });
  const mandatory = ['feed', 'solvent', 'raffinate', 'extract', 'vent', 'drain', 'instrument'];
  const words = rows.map(r => r.service.toLowerCase());
  for (const m of mandatory) if (!words.some(w => w.includes(m === 'instrument' ? 'instrument' : m))) issues.push({ severity: 'error', message: `Mandatory service missing from the generated schedule: ${m}` });
  for (const r of rows) {
    const el = Number(r.elevation);
    if (Number.isFinite(el) && (el < 0 || el > tt + 0.01)) issues.push({ severity: 'error', message: `${r.tag}: elevation ${r.elevation} m lies outside the vessel geometry (0 – ${fmtM(tt)} m T/T).` });
  }
  const drainEl = Number(rows.find(r => r.tag === 'N6')?.elevation ?? NaN);
  if (rows.some(r => Number(r.elevation) < drainEl)) issues.push({ severity: 'warning', message: 'Drain is not at the lowest generated elevation.' });
  const ventEl = Number(rows.find(r => r.tag === 'N5')?.elevation ?? NaN);
  if (rows.some(r => Number(r.elevation) > ventEl + 0.01)) issues.push({ severity: 'warning', message: 'Vent is not at the highest generated elevation.' });
  const feedEl = Number(rows.find(r => r.tag === 'N1')?.elevation ?? NaN);
  const solvEl = Number(rows.find(r => r.tag === 'N2')?.elevation ?? NaN);
  if (Number.isFinite(feedEl) && Number.isFinite(solvEl) && feedEl <= solvEl) {
    issues.push({ severity: 'error', message: 'Phase-flow arrangement violated — heavy (aqueous) feed must enter above the light solvent inlet for counter-current LLX operation.' });
  }

  return {
    rows,
    issues,
    references: [NOZZLE_MASTER_REF, VELOCITY_MASTER_REF, LAYOUT_REF],
  };
}

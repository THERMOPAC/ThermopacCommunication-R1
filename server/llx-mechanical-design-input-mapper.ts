// ═══════════════════════════════════════════════════════════════════════════════
// Stage 9 (Mechanical Design Basis) → C6 mech-vessel v1.0.0 input adapter.
//
// Structure + unit mapping ONLY — the C6 engine and its equations are untouched.
// Every value the workspace does not carry explicitly is supplied as an
// explicitly Assumed, source-referenced screening allowance (never a hidden
// engine default) so the run is flagged pending_validation and each assumption
// lands in the engine's assumptions register.
// ═══════════════════════════════════════════════════════════════════════════════

export interface MechGeometryContext {
  sourceEngine: { engineId: string; engineVersion: string; calculationType: string };
  sourceRunReference: string;
  insideDiameter_m: number;
  tangentToTangentHeight_m: number;
  overallVesselHeight_m: number;
}

const ALLOWANCE_REF = 'Thermopac Preliminary Mechanical Screening Allowance v1.0 (Assumed — Pending Validation)';
const MATERIAL_REF = 'Thermopac Preliminary Material Master v1.0 (Assumed screening magnitudes — Pending Validation against ASME Section II-D at design temperature)';
const PLATE_REF = 'Thermopac Standard Plate Thickness Series v1.0 (Assumed — Pending Validation)';
const DN_REF = 'Thermopac Standard Nozzle DN Series v1.0 (Assumed — Pending Validation)';

// Preliminary screening material master. Allowable stresses are Assumed
// screening magnitudes only — the engine treats them as engineer-entered and
// they are NOT code lookups (final values come from ASME Section II-D).
const MATERIAL_MASTER: Record<string, { spec: string; grade: string; allowableStressMPa: number; density: number; caDefault: number }> = {
  'SA-516 Gr 70':                    { spec: 'SA-516', grade: '70',     allowableStressMPa: 138, density: 7850, caDefault: 3 },
  'SS304L':                          { spec: 'SA-240', grade: '304L',   allowableStressMPa: 115, density: 8000, caDefault: 0 },
  'SS316L':                          { spec: 'SA-240', grade: '316L',   allowableStressMPa: 115, density: 8000, caDefault: 0 },
  'Duplex Stainless Steel (2205)':   { spec: 'SA-240', grade: 'S32205', allowableStressMPa: 155, density: 7800, caDefault: 0 },
};

const HEAD_TYPE_MAP: Record<string, string> = {
  '2:1 Ellipsoidal': 'ellipsoidal_2_1',
  'Torispherical': 'torispherical',
  'Hemispherical': 'hemispherical',
  'Flat': 'flat',
};

const SUPPORT_MAP: Record<string, string> = {
  'Skirt': 'skirt', 'Leg Support': 'legs', 'Saddle': 'saddle', 'Lug': 'lug',
  // Trunnion is not a C6 support type — no override is sent; the engine's own
  // orientation-based selection applies and the Stage 9 entry stays advisory.
};

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Presence-aware numeric read: a blank/absent entry returns undefined (an
 *  Assumed default may then apply), but a present-but-invalid entry throws a
 *  field-specific error — an engineer entry is never silently replaced. */
function numStrict(inputs: Record<string, unknown>, key: string, label: string): number | undefined {
  const raw = inputs[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const v = num(raw);
  if (v === undefined) throw new Error(`${label} ('${String(raw)}') is not a valid number — correct the Stage 9 entry or clear it to use the tagged Assumed screening default.`);
  return v;
}

function tag(value: number, unit: string, sourceReference: string, sourceType: 'Measured' | 'Vendor' | 'Literature' | 'Assumed' = 'Assumed') {
  return { value, unit, sourceType, sourceReference };
}

/** Canonicalize a Stage 9 nozzle service label to the C6 mandatory-service
 *  vocabulary using whole-word matching ('solvent' never satisfies 'vent'). */
export function canonicalNozzleService(raw: string): string {
  const words = raw.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const has = (w: string) => words.includes(w);
  if (has('feed')) return 'feed';
  if (has('solvent')) return 'solvent';
  if (has('raffinate')) return 'raffinate';
  if (has('extract')) return 'extract';
  if (has('vent')) return 'vent';
  if (has('drain')) return 'drain';
  if (has('instrument')) return 'instrument';
  if (has('sampling') || has('sample')) return 'sampling';
  return raw.trim().toLowerCase();
}

/**
 * Build the mech-vessel v1.0.0 input object from the merged workspace inputs
 * (all sections flattened) plus the geometry adopted from the selected
 * technology's accepted C4/C5 run.
 */
export function mapWorkspaceMechanicalInputs(
  inputs: Record<string, unknown>,
  geo: MechGeometryContext,
): Record<string, unknown> {
  const str = (k: string) => String(inputs[k] ?? '').trim();
  const ov = (k: string, label: string) => numStrict(inputs, k, label); // Stage 9 override — invalid entries throw

  // ── Orientation — explicit, from Design Basis (never inferred here either) ──
  const orientationRaw = str('vessel_orientation').toLowerCase();
  const vesselOrientation = orientationRaw === 'horizontal' ? 'horizontal' : orientationRaw === 'vertical' ? 'vertical' : undefined;

  // ── Design conditions (Stage 9 override wins over Design Basis) ────────────
  const opP = ov('operating_pressure_ov', 'Stage 9 operating pressure override') ?? num(inputs.operating_pressure);
  const desP = ov('design_pressure_ov', 'Stage 9 design pressure override') ?? num(inputs.llx_internal_design_pressure) ?? num(inputs.design_pressure);
  const opT = ov('operating_temperature_ov', 'Stage 9 operating temperature override') ?? num(inputs.operating_temperature);
  const desT = ov('design_temperature_ov', 'Stage 9 design temperature override') ?? num(inputs.design_temperature);
  const DB_REF = 'Stage 2 Design Basis / Stage 9 Mechanical Design Basis';

  // ── Material Interface from the Stage 9 material master selection ──────────
  const matName = str('shell_material') !== '' ? str('shell_material') : 'SA-516 Gr 70';
  const master = MATERIAL_MASTER[matName];
  const caEntered = numStrict(inputs, 'corrosion_allowance', 'Stage 9 corrosion allowance');
  const sEntered = numStrict(inputs, 'allowable_stress_mpa', 'Stage 9 allowable stress');
  const rhoEntered = numStrict(inputs, 'material_density_kgm3', 'Stage 9 material density');
  const material = master
    ? {
        materialName: matName,
        materialSpecification: master.spec,
        materialGrade: master.grade,
        allowableStress: tag(sEntered ?? master.allowableStressMPa, 'MPa', sEntered !== undefined ? 'Stage 9 engineer-entered allowable stress' : MATERIAL_REF),
        density: tag(rhoEntered ?? master.density, 'kg/m3', rhoEntered !== undefined ? 'Stage 9 engineer-entered material density' : MATERIAL_REF),
        corrosionAllowance: tag(caEntered ?? master.caDefault, 'mm', caEntered !== undefined ? 'Stage 9 Mechanical Design Basis — corrosion allowance' : 'Thermopac Design Standard — Corrosion Allowance (CS 3 mm / SS & Duplex 0 mm)'),
        source: MATERIAL_REF,
      }
    : undefined; // unknown material → engine validation reports the missing Material Interface

  // ── Head type (Conical is not a C6 screening head — surfaced as an error) ──
  const headRaw = str('head_type') !== '' ? str('head_type') : '2:1 Ellipsoidal';
  const headType = HEAD_TYPE_MAP[headRaw];
  if (headRaw === 'Conical') {
    throw new Error("Conical heads are not supported by the C6 preliminary screening engine (mech-vessel v1.0.0). Select 2:1 Ellipsoidal, Hemispherical or Flat in Stage 9, or defer the conical design to the code-certified stage.");
  }
  if (headRaw === 'Torispherical') {
    throw new Error('Torispherical screening requires engineer-entered crown radius, knuckle radius, head depth and head volume, which Stage 9 does not yet collect. Select 2:1 Ellipsoidal, Hemispherical or Flat for the C6 preliminary screening, or defer the torispherical design to the code-certified stage.');
  }

  // ── Nozzles from the structured Stage 9 schedule ────────────────────────────
  let rows: Array<Record<string, string>> = [];
  try { rows = JSON.parse(String(inputs.nozzle_rows ?? '[]')); } catch { rows = []; }
  const nozzles = rows
    .filter(r => String(r.service ?? '').trim() !== '')
    .map(r => {
      const dn = num(String(r.size ?? '').replace(/dn/i, '').trim());
      const n: Record<string, unknown> = {
        tag: String(r.tag ?? '').trim() || undefined,
        service: canonicalNozzleService(String(r.service)),
        rating: String(r.rating ?? '').trim() || undefined,
        facing: String(r.facing ?? '').trim() || undefined,
        // Generated schedule stores the ASME class in `rating` (e.g. "150#") and the
        // flange standard in `flange_std` (e.g. "ASME B16.5") — map both through.
        flangeClass: String(r.flange_class ?? r.rating ?? '').trim() || undefined,
        flangeStandard: String(r.flange_std ?? r.flange_standard ?? '').trim() || undefined,
        remarks: [String(r.remarks ?? '').trim(), String(r.orientation ?? '').trim() && `Orientation: ${String(r.orientation).trim()}`, String(r.elevation ?? '').trim() && `Elevation: ${String(r.elevation).trim()}`].filter(Boolean).join('; ') || undefined,
      };
      if (dn !== undefined && dn > 0) n.size = tag(dn, 'DN', 'Stage 9 nozzle schedule entry');
      return n;
    });

  // ── Support override ────────────────────────────────────────────────────────
  const supportOverride = SUPPORT_MAP[str('supports')];

  const out: Record<string, unknown> = {
    vesselOrientation,
    geometry: {
      sourceEngine: geo.sourceEngine,
      sourceRunReference: geo.sourceRunReference,
      insideDiameter_m: geo.insideDiameter_m,
      tangentToTangentHeight_m: geo.tangentToTangentHeight_m,
      overallVesselHeight_m: geo.overallVesselHeight_m,
      // Conservative screening basis: extraction column treated liquid-full.
      operatingLiquidBasis: 'liquid_full',
    },
    ...(opP !== undefined ? { operatingPressure: tag(opP, 'barg', DB_REF) } : {}),
    ...(desP !== undefined ? { designPressure: tag(desP, 'barg', 'Thermopac Design Rule — LLX internal design pressure (Stage 2)') } : {}),
    ...(opT !== undefined ? { operatingTemperature: tag(opT, 'C', DB_REF) } : {}),
    ...(desT !== undefined ? { designTemperature: tag(desT, 'C', String(inputs.design_temperature_source ?? '').trim() || 'Thermopac Design Temperature Rule (Stage 2)') } : {}),
    ...(material ? { material } : {}),
    jointEfficiency: (() => { const e = numStrict(inputs, 'joint_efficiency', 'Stage 9 joint efficiency'); return tag(e ?? 0.85, '-', e !== undefined ? 'Stage 9 engineer-entered joint efficiency' : `${ALLOWANCE_REF} — spot-examination screening basis`); })(),
    designCode: 'NOT_ASSIGNED',
    ...(headType ? { headType } : {}),
    plateThicknessSeries: { values_mm: [5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40], sourceType: 'Assumed', sourceReference: PLATE_REF },
    nozzles,
    nozzleDefaults: {
      projection: tag(150, 'mm', `${ALLOWANCE_REF} — standard nozzle projection`),
      dnSeries: { values: [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300], sourceType: 'Assumed', sourceReference: DN_REF },
    },
    ...(supportOverride ? { supportOverride } : {}),
    ...(supportOverride === 'legs'
      ? {
          legCriteria: (() => {
            const lh = numStrict(inputs, 'leg_max_height_m', 'Stage 9 leg height criterion');
            const lw = numStrict(inputs, 'leg_max_weight_kg', 'Stage 9 leg weight criterion');
            return {
              maxHeight: tag(lh ?? 6, 'm', lh !== undefined ? 'Stage 9 engineer-entered leg height criterion' : `${ALLOWANCE_REF} — preliminary leg height criterion`),
              maxWeight: tag(lw ?? 10000, 'kg', lw !== undefined ? 'Stage 9 engineer-entered leg weight criterion' : `${ALLOWANCE_REF} — preliminary leg weight criterion`),
            };
          })(),
        }
      : {}),
    // MEC-008 weight allowances — Stage 9 entries win; otherwise Assumed screening allowances.
    ...(() => {
      const alw = (key: string, label: string, dflt: number, unit: string, ref: string) => {
        const v = numStrict(inputs, key, label);
        return tag(v ?? dflt, unit, v !== undefined ? label.replace('Stage 9', 'Stage 9 engineer-entered') : ref);
      };
      return {
        nozzlesWeight: alw('nozzles_weight_kg', 'Stage 9 nozzles/manways weight', 200, 'kg', `${ALLOWANCE_REF} — nozzles & manways`),
        internalsWeight: alw('internals_weight_kg', 'Stage 9 internals weight', 500, 'kg', `${ALLOWANCE_REF} — packing/rotor internals`),
        supportsWeight: alw('supports_weight_kg', 'Stage 9 support-structure weight', 300, 'kg', `${ALLOWANCE_REF} — support structure`),
        headBlankFactor: alw('head_blank_factor', 'Stage 9 head blank factor', 1.1, '-', `${ALLOWANCE_REF} — head blank-mass factor`),
      };
    })(),
    operatingLiquidDensity: num(inputs.feed_density) !== undefined
      ? tag(num(inputs.feed_density)!, 'kg/m3', String(inputs.feed_density_status ?? '').trim() !== '' ? `Stage 2 Design Basis feed density (${String(inputs.feed_density_status).trim()})` : 'Stage 2 Design Basis feed density')
      : tag(1000, 'kg/m3', `${ALLOWANCE_REF} — water-like operating liquid density (no Design Basis feed density available)`),
    waterDensity: tag(1000, 'kg/m3', 'Hydrotest water density — standard basis'),
  };
  return out;
}

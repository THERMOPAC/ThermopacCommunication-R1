// ═══════════════════════════════════════════════════════════════════════════════
// Packing Database — vendor-neutral packing data module (Stage C4)
//
// ARCHITECTURE RULE (approved Stage C4 basis, refinement 1):
//   The packed-column engine CONSUMES packing data. It NEVER owns packing data.
//   This module owns the packing record schema, validation, the performance-
//   curve representation and evaluation (interpolation only — extrapolation is
//   REFUSED), and an in-memory registry keyed by packing id.
//
//   The engine is vendor neutral (refinement 9): it only ever sees
//   "Vendor Packing Capacity", "Vendor Pressure Drop", "Vendor Packing
//   Performance" through this schema. Manufacturer identity is data, not code.
//   Future records (e.g. Sulzer Mellapak/MellapakPlus, Koch Flexipac, Montz,
//   Raschig, RVT, Thermopac proprietary packing) plug in WITHOUT any change to
//   calculation code.
//
// Performance data are CURVES (refinement 2): tabulated points or an explicit
// polynomial fit, each with a stated valid range. Single-number vendor data are
// represented as a 'constant' basis with its stated applicability note — never
// silently treated as a universal curve.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SourceType } from '../epd/types';
import { SOURCE_TYPES } from '../epd/types';

// ── Tagged values ─────────────────────────────────────────────────────────────

export interface PackingTaggedValue {
  value: number;
  unit: string;
  sourceType: SourceType;
  sourceReference: string;
}

// ── Performance curves ────────────────────────────────────────────────────────

/** Tabulated vendor data — piecewise-linear interpolation INSIDE the point range only. */
export interface TabulatedCurve {
  kind: 'table';
  /** Independent variable name + unit, e.g. 'totalLiquidLoad' in 'm3/(m2.h)'. */
  independentVariable: string;
  independentUnit: string;
  dependentUnit: string;
  points: { x: number; y: number }[];   // ≥ 2 points, strictly increasing x
  sourceType: SourceType;
  sourceReference: string;
}

/** Explicit polynomial fit y = Σ c_i·x^i supplied by the vendor/engineer with its OWN valid range. */
export interface PolynomialCurve {
  kind: 'polynomial';
  independentVariable: string;
  independentUnit: string;
  dependentUnit: string;
  coefficients: number[];               // c0..cN
  validRange: { min: number; max: number };
  sourceType: SourceType;
  sourceReference: string;
}

/** Single vendor number with its stated applicability — NOT a universal curve. */
export interface ConstantBasis {
  kind: 'constant';
  value: number;
  unit: string;
  applicabilityNote: string;            // vendor's stated basis/reference system
  sourceType: SourceType;
  sourceReference: string;
}

export type PerformanceCurve = TabulatedCurve | PolynomialCurve;
export type PerformanceBasis = PerformanceCurve | ConstantBasis;

export interface CurveEvaluation {
  ok: boolean;
  value?: number;
  unit?: string;
  source?: string;
  reason?: string;                      // populated when refused (out of range etc.)
}

/** Evaluate a performance basis at x. Interpolation only — extrapolation is REFUSED. */
export function evaluatePerformanceBasis(basis: PerformanceBasis, x: number): CurveEvaluation {
  if (basis.kind === 'constant') {
    if (!Number.isFinite(basis.value)) return { ok: false, reason: 'Constant performance value is not a finite number — refused' };
    return { ok: true, value: basis.value, unit: basis.unit, source: `${basis.sourceType}: ${basis.sourceReference} (constant — ${basis.applicabilityNote})` };
  }
  if (basis.kind === 'table') {
    const pts = basis.points;
    if (x < pts[0].x || x > pts[pts.length - 1].x) {
      return { ok: false, reason: `x = ${x} ${basis.independentUnit} is outside the tabulated range [${pts[0].x}, ${pts[pts.length - 1].x}] — extrapolation of vendor performance data is refused` };
    }
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i].x) {
        const f = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
        const y = pts[i - 1].y + f * (pts[i].y - pts[i - 1].y);
        if (!Number.isFinite(y)) return { ok: false, reason: 'Tabulated performance data produced a non-finite value — refused' };
        return { ok: true, value: y, unit: basis.dependentUnit, source: `${basis.sourceType}: ${basis.sourceReference} (tabulated, interpolated)` };
      }
    }
  }
  if (basis.kind === 'polynomial') {
    if (x < basis.validRange.min || x > basis.validRange.max) {
      return { ok: false, reason: `x = ${x} ${basis.independentUnit} is outside the fit's stated valid range [${basis.validRange.min}, ${basis.validRange.max}] — extrapolation of vendor performance data is refused` };
    }
    let y = 0;
    for (let i = basis.coefficients.length - 1; i >= 0; i--) y = y * x + basis.coefficients[i];
    if (!Number.isFinite(y)) return { ok: false, reason: 'Polynomial fit produced a non-finite value — refused' };
    return { ok: true, value: y, unit: basis.dependentUnit, source: `${basis.sourceType}: ${basis.sourceReference} (polynomial fit)` };
  }
  return { ok: false, reason: 'Unknown performance-basis kind' };
}

/** True when any source tag inside the basis is Assumed. */
export function performanceBasisAssumed(basis: PerformanceBasis): boolean {
  return basis.sourceType === 'Assumed';
}

// ── Packing record (refinement 1 — full field list) ──────────────────────────

export interface PackingRecord {
  id: string;                           // stable registry key, e.g. 'generic-structured-250y-vh77'
  manufacturer: string;
  productFamily: string;
  productName: string;
  packingType: string;                  // e.g. 'structured sheet-metal', 'random ring'
  geometryClass: 'random' | 'structured';
  material: string;
  size?: PackingTaggedValue;            // nominal size / crimp designation (optional — omit when no vendor-supported physical size exists; never populate with a placeholder)
  specificSurfaceArea: PackingTaggedValue;  // m2/m3
  voidFraction: PackingTaggedValue;         // –
  packingFactor?: PackingTaggedValue;       // 1/m (optional vendor datum)
  /** Vendor Packing Capacity — max total (both-phase) liquid load. Curve vs an
   *  explicit independent variable, or a constant with stated applicability. */
  hydraulicCapacityData?: PerformanceBasis; // dependent: m3/(m2.h)
  /** Vendor Pressure Drop — DRY and WET separated (refinement 5). Only WET
   *  applies to the operating column; dry is architecture for future use. */
  pressureDropData?: {
    wet?: PerformanceBasis;                 // dependent: Pa/m vs total liquid load
    dry?: PerformanceBasis;                 // reserved — NOT used by the C4 engine
  };
  recommendedLoadingRange?: { min: PackingTaggedValue; max: PackingTaggedValue }; // m3/(m2.h) total load
  minimumWettingRate?: PackingTaggedValue;  // m3/(m2.h) continuous-phase load
  maximumBedHeight?: PackingTaggedValue;    // m per bed
  vendorNotes?: string;
  source: string;                       // overall record source, e.g. datasheet id
  revision: string;                     // record revision, e.g. 'Rev 0'
}

// ── HETS records (refinement 3 — HETS is SYSTEM data, not packing data) ──────

export interface HETSRecord {
  value: number;
  unit: string;                         // must be 'm'
  operatingTemperatureC: number;
  solvent: string;                      // system context — e.g. 'NMP'
  feed: string;                         // system context — e.g. 'RRBO'
  packing: string;                      // packing this HETS was observed/quoted for
  sourceType: SourceType;
  sourceReference: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface PackingValidationIssue { field: string; message: string }

function checkTagged(v: unknown, field: string, unit: string, issues: PackingValidationIssue[], range?: { min: number; max: number }): void {
  const o = v as PackingTaggedValue | undefined;
  if (!o || typeof o.value !== 'number' || !Number.isFinite(o.value)) { issues.push({ field, message: `${field}.value must be a finite number (${unit})` }); return; }
  if (range && (o.value < range.min || o.value > range.max)) issues.push({ field, message: `${field}.value must be in [${range.min}, ${range.max}] ${unit} (got ${o.value})` });
  if (o.unit !== unit) issues.push({ field, message: `${field}.unit must be '${unit}' (got '${o.unit ?? ''}')` });
  if (!SOURCE_TYPES.includes(o.sourceType)) issues.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}` });
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) issues.push({ field, message: `${field}.sourceReference is mandatory` });
}

/** Standalone validation of a PerformanceBasis (used by engines consuming vendor curves outside a PackingRecord). */
export function validatePerformanceBasis(b: unknown, field: string): PackingValidationIssue[] {
  const issues: PackingValidationIssue[] = [];
  checkBasis(b, field, issues);
  return issues;
}

function checkBasis(b: unknown, field: string, issues: PackingValidationIssue[]): void {
  const basis = b as PerformanceBasis;
  if (basis.kind === 'constant') {
    if (typeof basis.value !== 'number' || !Number.isFinite(basis.value) || basis.value <= 0) issues.push({ field, message: `${field}.value must be a finite number > 0` });
    if (typeof basis.applicabilityNote !== 'string' || !basis.applicabilityNote.trim()) issues.push({ field, message: `${field}.applicabilityNote is mandatory for a constant vendor datum (state the vendor's reference basis)` });
  } else if (basis.kind === 'table') {
    if (!Array.isArray(basis.points) || basis.points.length < 2) { issues.push({ field, message: `${field}.points must contain at least 2 points (use kind 'constant' for a single vendor number)` }); return; }
    basis.points.forEach((p, i) => {
      if (!p || typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.y !== 'number' || !Number.isFinite(p.y)) issues.push({ field, message: `${field}.points[${i}] must have finite numeric x and y` });
    });
    for (let i = 1; i < basis.points.length; i++) if (!(basis.points[i]?.x > basis.points[i - 1]?.x)) issues.push({ field, message: `${field}.points must have strictly increasing x` });
    if (typeof basis.independentVariable !== 'string' || !basis.independentVariable.trim()) issues.push({ field, message: `${field}.independentVariable is mandatory (states what the curve is expressed against)` });
  } else if (basis.kind === 'polynomial') {
    if (!Array.isArray(basis.coefficients) || basis.coefficients.length === 0 || basis.coefficients.some((c) => typeof c !== 'number' || !Number.isFinite(c))) issues.push({ field, message: `${field}.coefficients must be a non-empty array of finite numbers` });
    if (!basis.validRange || typeof basis.validRange.min !== 'number' || typeof basis.validRange.max !== 'number' || !Number.isFinite(basis.validRange.min) || !Number.isFinite(basis.validRange.max) || !(basis.validRange.min < basis.validRange.max)) issues.push({ field, message: `${field}.validRange { finite min < max } is mandatory for a polynomial fit` });
    if (typeof basis.independentVariable !== 'string' || !basis.independentVariable.trim()) issues.push({ field, message: `${field}.independentVariable is mandatory (states what the fit is expressed against)` });
  } else {
    issues.push({ field, message: `${field}.kind must be 'table', 'polynomial' or 'constant'` });
    return;
  }
  if (!SOURCE_TYPES.includes((basis as { sourceType: SourceType }).sourceType)) issues.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}` });
  const ref = (basis as { sourceReference?: string }).sourceReference;
  if (typeof ref !== 'string' || !ref.trim()) issues.push({ field, message: `${field}.sourceReference is mandatory` });
}

export function validatePackingRecord(record: unknown): PackingValidationIssue[] {
  const issues: PackingValidationIssue[] = [];
  const r = record as PackingRecord | undefined;
  if (!r || typeof r !== 'object') return [{ field: 'packing', message: 'packing record must be an object' }];
  for (const f of ['id', 'manufacturer', 'productFamily', 'productName', 'packingType', 'material', 'source', 'revision'] as const) {
    if (typeof r[f] !== 'string' || !r[f].trim()) issues.push({ field: `packing.${f}`, message: `packing.${f} is mandatory (non-empty string)` });
  }
  if (r.geometryClass !== 'random' && r.geometryClass !== 'structured') issues.push({ field: 'packing.geometryClass', message: "packing.geometryClass must be 'random' or 'structured'" });
  if (r.size !== undefined) checkTagged(r.size, 'packing.size', 'mm', issues, { min: 0.1, max: 500 });
  checkTagged(r.specificSurfaceArea, 'packing.specificSurfaceArea', 'm2/m3', issues, { min: 50, max: 1500 });
  checkTagged(r.voidFraction, 'packing.voidFraction', '-', issues, { min: 0.5, max: 0.99 });
  if (r.packingFactor !== undefined) checkTagged(r.packingFactor, 'packing.packingFactor', '1/m', issues, { min: 1, max: 10000 });
  if (r.hydraulicCapacityData !== undefined) checkBasis(r.hydraulicCapacityData, 'packing.hydraulicCapacityData', issues);
  if (r.pressureDropData?.wet !== undefined) checkBasis(r.pressureDropData.wet, 'packing.pressureDropData.wet', issues);
  if (r.pressureDropData?.dry !== undefined) checkBasis(r.pressureDropData.dry, 'packing.pressureDropData.dry', issues);
  if (r.recommendedLoadingRange !== undefined) {
    checkTagged(r.recommendedLoadingRange.min, 'packing.recommendedLoadingRange.min', 'm3/(m2.h)', issues, { min: 0, max: 500 });
    checkTagged(r.recommendedLoadingRange.max, 'packing.recommendedLoadingRange.max', 'm3/(m2.h)', issues, { min: 0, max: 500 });
  }
  if (r.minimumWettingRate !== undefined) checkTagged(r.minimumWettingRate, 'packing.minimumWettingRate', 'm3/(m2.h)', issues, { min: 0, max: 500 });
  if (r.maximumBedHeight !== undefined) checkTagged(r.maximumBedHeight, 'packing.maximumBedHeight', 'm', issues, { min: 0.5, max: 20 });
  return issues;
}

export function validateHETSRecord(record: unknown): PackingValidationIssue[] {
  const issues: PackingValidationIssue[] = [];
  const h = record as HETSRecord | undefined;
  if (!h || typeof h !== 'object') return [{ field: 'hets', message: 'hets record must be an object' }];
  if (typeof h.value !== 'number' || !Number.isFinite(h.value) || h.value < 0.1 || h.value > 3.0) issues.push({ field: 'hets.value', message: 'hets.value must be in [0.1, 3.0] m' });
  if (h.unit !== 'm') issues.push({ field: 'hets.unit', message: "hets.unit must be 'm'" });
  if (typeof h.operatingTemperatureC !== 'number' || !Number.isFinite(h.operatingTemperatureC)) issues.push({ field: 'hets.operatingTemperatureC', message: 'hets.operatingTemperatureC (°C) is mandatory — HETS is system data, not packing data' });
  for (const f of ['solvent', 'feed', 'packing'] as const) {
    if (typeof h[f] !== 'string' || !h[f].trim()) issues.push({ field: `hets.${f}`, message: `hets.${f} is mandatory — HETS belongs to a SYSTEM (solvent + feed + packing), never to packing alone` });
  }
  if (!SOURCE_TYPES.includes(h.sourceType)) issues.push({ field: 'hets.sourceType', message: `hets.sourceType must be one of ${SOURCE_TYPES.join(', ')}` });
  if (typeof h.sourceReference !== 'string' || !h.sourceReference.trim()) issues.push({ field: 'hets.sourceReference', message: 'hets.sourceReference is mandatory' });
  return issues;
}

// ── Registry ──────────────────────────────────────────────────────────────────
// In-memory registry. Ships EMPTY — no vendor data are invented or baked in.
// Records are registered by engineers/administrators from vendor documents.

const registry = new Map<string, PackingRecord>();

export function registerPacking(record: PackingRecord): PackingValidationIssue[] {
  const issues = validatePackingRecord(record);
  if (issues.length === 0) registry.set(record.id, structuredClone(record)); // snapshot — later caller mutations cannot bypass validation
  return issues;
}

export function getPacking(id: string): PackingRecord | undefined {
  const rec = registry.get(id);
  return rec ? structuredClone(rec) : undefined; // defensive copy — registry records are immutable to callers
}
export function listPackings(): PackingRecord[] { return Array.from(registry.values(), (r) => structuredClone(r)); }
export function clearPackingRegistry(): void { registry.clear(); }

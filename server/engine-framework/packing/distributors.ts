// ═══════════════════════════════════════════════════════════════════════════════
// Distributor Check Modules — modular interface (Stage C4, refinement 6)
//
// Distributor calculations are MODULAR. Every distributor type implements the
// same IDistributorCheckModule interface so that future types — Orifice Pan,
// Trough, Ladder, Pipe, Spray, Chimney Tray — plug into the packed-column
// engine without any change to calculation code. The engine never designs
// proprietary distributor geometry; it only checks supplied vendor limits.
//
// Stage C4 ships ONE implementation: the generic open-area distributor check
// (dispersed-phase load, total load, open-area velocity vs vendor window,
// vendor maximum capacity). Type-specific modules are future data + modules.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SourceType } from '../epd/types';

export interface DistributorTaggedValue { value: number; unit: string; sourceType: SourceType; sourceReference: string }

/** Distributor specification consumed by check modules — vendor data only. */
export interface DistributorSpec {
  /** Descriptive type label, e.g. 'orifice_pan' | 'trough' | 'ladder' | 'pipe' | 'spray' | 'chimney_tray' | free text. */
  distributorType: string;
  freeAreaFraction?: DistributorTaggedValue;                              // '-' open area / column area
  holeVelocityLimits?: { min: DistributorTaggedValue; max: DistributorTaggedValue }; // m/s vendor window
  maxCapacity?: DistributorTaggedValue;                                   // m3/h vendor max volumetric capacity
}

export interface DistributorFlows {
  columnArea_m2: number;
  dispersedVolumetricFlow_m3_h: number;
  continuousVolumetricFlow_m3_h: number;
}

export type DistributorCheckStatus = 'ok' | 'outside_vendor_limits' | 'not_calculable';

export interface DistributorCheckItem {
  status: DistributorCheckStatus;
  value?: number;
  unit?: string;
  limit?: string;
  reason?: string;                       // populated when not_calculable / outside limits
}

export interface DistributorCheckResult {
  moduleId: string;
  distributorType: string;
  dispersedPhaseLoad: DistributorCheckItem;      // m3/(m2.h) — informational load
  totalLiquidLoad: DistributorCheckItem;         // m3/(m2.h) — informational load
  openAreaVelocity: DistributorCheckItem;        // m/s vs vendor window
  vendorCapacity: DistributorCheckItem;          // m3/h vs vendor max
  assumedDataPresent: boolean;
  overallStatus: DistributorCheckStatus;
}

export interface IDistributorCheckModule {
  moduleId: string;
  /** Distributor types this module can evaluate ('*' = any). */
  supports(distributorType: string): boolean;
  evaluate(spec: DistributorSpec, flows: DistributorFlows): DistributorCheckResult;
}

/** Generic open-area distributor check — the only Stage C4 module. */
export class GenericOpenAreaDistributorModule implements IDistributorCheckModule {
  moduleId = 'generic-open-area-check';
  supports(_type: string): boolean { return true; }

  evaluate(spec: DistributorSpec, flows: DistributorFlows): DistributorCheckResult {
    const A = flows.columnArea_m2;
    const qD = flows.dispersedVolumetricFlow_m3_h;
    const qTot = flows.dispersedVolumetricFlow_m3_h + flows.continuousVolumetricFlow_m3_h;
    let assumed = false;
    const tagAssumed = (t?: DistributorTaggedValue) => { if (t?.sourceType === 'Assumed') assumed = true; };
    tagAssumed(spec.freeAreaFraction); tagAssumed(spec.holeVelocityLimits?.min); tagAssumed(spec.holeVelocityLimits?.max); tagAssumed(spec.maxCapacity);

    const dispersedPhaseLoad: DistributorCheckItem = { status: 'ok', value: qD / A, unit: 'm3/(m2.h)' };
    const totalLiquidLoad: DistributorCheckItem = { status: 'ok', value: qTot / A, unit: 'm3/(m2.h)' };

    let openAreaVelocity: DistributorCheckItem;
    if (spec.freeAreaFraction && spec.holeVelocityLimits) {
      const v = (qD / 3600) / (A * spec.freeAreaFraction.value);
      const { min, max } = spec.holeVelocityLimits;
      openAreaVelocity = v < min.value || v > max.value
        ? { status: 'outside_vendor_limits', value: v, unit: 'm/s', limit: `[${min.value}, ${max.value}] m/s (${min.sourceType}: ${min.sourceReference})`, reason: `Open-area velocity ${v.toFixed(4)} m/s is outside the vendor window` }
        : { status: 'ok', value: v, unit: 'm/s', limit: `[${min.value}, ${max.value}] m/s (${min.sourceType}: ${min.sourceReference})` };
    } else {
      openAreaVelocity = { status: 'not_calculable', reason: spec.freeAreaFraction ? 'Vendor hole-velocity window not supplied' : 'Distributor free-area fraction not supplied' };
    }

    let vendorCapacity: DistributorCheckItem;
    if (spec.maxCapacity) {
      vendorCapacity = qTot > spec.maxCapacity.value
        ? { status: 'outside_vendor_limits', value: qTot, unit: 'm3/h', limit: `${spec.maxCapacity.value} m3/h (${spec.maxCapacity.sourceType}: ${spec.maxCapacity.sourceReference})`, reason: `Total liquid flow ${qTot.toFixed(2)} m3/h exceeds the vendor maximum distributor capacity` }
        : { status: 'ok', value: qTot, unit: 'm3/h', limit: `${spec.maxCapacity.value} m3/h (${spec.maxCapacity.sourceType}: ${spec.maxCapacity.sourceReference})` };
    } else {
      vendorCapacity = { status: 'not_calculable', reason: 'Vendor maximum distributor capacity not supplied' };
    }

    const items = [openAreaVelocity, vendorCapacity];
    const overallStatus: DistributorCheckStatus = items.some((i) => i.status === 'outside_vendor_limits')
      ? 'outside_vendor_limits'
      : items.every((i) => i.status === 'not_calculable') ? 'not_calculable' : 'ok';

    return { moduleId: this.moduleId, distributorType: spec.distributorType, dispersedPhaseLoad, totalLiquidLoad, openAreaVelocity, vendorCapacity, assumedDataPresent: assumed, overallStatus };
  }
}

const modules: IDistributorCheckModule[] = [new GenericOpenAreaDistributorModule()];

export function registerDistributorModule(m: IDistributorCheckModule): void { modules.unshift(m); }
export function resolveDistributorModule(distributorType: string): IDistributorCheckModule | undefined {
  return modules.find((m) => m.supports(distributorType));
}

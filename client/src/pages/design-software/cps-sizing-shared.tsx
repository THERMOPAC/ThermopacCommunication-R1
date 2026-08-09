// ── CPS Sizing Tool — shared types, helpers and section navigation ────────────
// Sections: Dashboard (default landing) · New Sizing Case · Existing Sizing
// Cases · Output Sizing · Knowledge Engine. No sizing calculations exist yet.
import { Link, useLocation } from "wouter";
import { LayoutDashboard, FilePlus2, BookOpen } from "lucide-react";

// KE snapshot saved to cps_sizing_cases.ke_snapshot on every successful Recalculate.
// VALUE, UNIT, PARAMETER_TYPE and CATEGORY in this snapshot are the authoritative
// source for the Internal PDF — live keQ.data must NOT be used for those fields.
export type KeSnapshotParam = {
  parameter_code:  string;
  value:           string | null;
  unit:            string | null;
  parameter_type:  string | null;
  category:        string | null;
};

export type KeSnapshot = {
  calculation_timestamp: string;   // ISO-8601
  treatment_scope:       string;
  parameters:            KeSnapshotParam[];
};

export type SizingCase = {
  id: number; customer_id: number | null; customer_name: string; plant_location: string;
  cps_feed_capacity: string; rrbo_grade: string; feed_oil_visc_40c: string;
  treatment_scope: "COLOUR_ODOR" | "COLOUR_ODOR_SULPHUR";
  inlet_colour: string; target_colour: string; inlet_sulphur: string | null; target_sulphur: string | null;
  // Saved atomically on every successful Recalculate; null until first Recalculate.
  ke_snapshot:       KeSnapshot | null;
  // Frozen BuildRowsResult + calculation_inputs — written together with ke_snapshot.
  // null until first successful Recalculate.
  calculated_output: unknown | null;
  // TRUE whenever customer inputs were saved after the last successful Recalculate.
  // Reset to FALSE by the calculation-snapshot endpoint.
  calculation_stale: boolean;
  created_by_name?: string; updated_by_name?: string; created_at: string; updated_at: string;
};

export type Customer = {
  id: number; bpCode: string; bpName: string;
  shipAddrCity: string | null; billAddrCity: string | null;
  shipToAddress: string | null; billToAddress: string | null;
  countryName: string | null;
};

export const SCOPES = [
  { key: "COLOUR_ODOR", label: "Colour & Odor Improvement" },
  { key: "COLOUR_ODOR_SULPHUR", label: "Colour, Odor & Sulphur Improvement" },
];
export const scopeLabel = (k: string) => SCOPES.find(s => s.key === k)?.label ?? k;

// Standard RRBO viscosity grades with their typical viscosity range @ 40°C (cSt).
export const RRBO_VISC_RANGES: Record<string, { min: number; max: number }> = {
  "SN 80": { min: 12, max: 16 },
  "SN 100": { min: 18, max: 22 },
  "SN 150": { min: 28, max: 32 },
  "SN 300": { min: 40, max: 50 },
  "SN 400": { min: 55, max: 70 },
  "SN 500": { min: 90, max: 100 },
};
export const RRBO_GRADES = Object.keys(RRBO_VISC_RANGES);

export function fmtNum(v: string | null): string {
  if (v === null || v === "") return "";
  const n = Number(v);
  return isFinite(n) ? String(n) : String(v);
}

// Compose a location suggestion from the customer's existing address data
// (city preferred, country appended). Free to edit afterwards per project.
export function customerLocation(c: Customer): string {
  const city = c.shipAddrCity?.trim() || c.billAddrCity?.trim() || "";
  const country = c.countryName?.trim() || "";
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return c.shipToAddress?.trim() || c.billToAddress?.trim() || "";
}

const SECTIONS = [
  { href: "/design-software/cps-sizing", label: "Sizing Dashboard", icon: LayoutDashboard },
  { href: "/design-software/cps-sizing/new", label: "New Sizing Case", icon: FilePlus2 },
  { href: "/design-software/cps-sizing/knowledge-engine", label: "Knowledge Engine", icon: BookOpen },
];

export function CpsSizingNav() {
  const [location] = useLocation();
  return (
    <div className="flex flex-wrap gap-1 border-b pb-2">
      {SECTIONS.map(s => {
        const active = location === s.href;
        const Icon = s.icon;
        return (
          <Link key={s.href} href={s.href}>
            <button
              data-testid={`nav-${s.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${active ? "bg-blue-600 text-white" : "hover:bg-slate-100 text-slate-700"}`}
            >
              <Icon className="h-4 w-4" /> {s.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

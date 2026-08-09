// ── CPS Sizing Tool — Output Sizing panel ────────────────────────────────────
// Colour & Odor (COLOUR_ODOR) branch: fully computed.
// Colour, Odor & Sulphur (COLOUR_ODOR_SULPHUR) branch: INSTALLED_COLUMNS solved
// by candidate-column iteration (approved method) — eliminates circular
// dependency.  SULPHUR_ABS_FACTOR governs Required Media via sulphur mass
// balance.  All downstream steps (times, oil streams, mass balance) are shared
// with the colour-only branch and use the iteration-selected INSTALLED_COLUMNS.
//
// VOC / Regeneration Off-Gas section is COMMON to both treatment scopes.
// Driven entirely by KE category regen_offgas_tox + applicable
// regeneration_recovery parameters.  No scope-specific branching.
// TOX burner / chamber sizing is NOT implemented.
import { useState } from "react";
import { Info, RefreshCw, FileText, Lock, AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SizingCase, scopeLabel, fmtNum } from "./cps-sizing-shared";
import {
  downloadCustomerPdf, downloadInternalPdf,
  type PdfSizingResult, type CompanyInfo,
} from "./cps-pdf-reports";

// Full shape returned by GET /api/design-software/cps/parameters (SELECT p.*).
// parameter_name and symbol are used by the Internal PDF for enrichment only —
// never for calculation.  VALUE, UNIT, TYPE, CATEGORY used for KE snapshot building.
export type KnowledgeParam = {
  parameter_code:  string;
  parameter_name?: string | null;
  symbol?:         string | null;
  value:           string | null;
  unit:            string | null;
  parameter_type:  string | null;
  category:        string | null;
  description?:    string | null;
};

// Look up a Knowledge Engine parameter value; null = not defined (fail closed).
function keValue(params: KnowledgeParam[] | undefined, code: string): number | null {
  const p = params?.find(x => x.parameter_code === code);
  if (!p || p.value === null || p.value === "") return null;
  const n = Number(p.value);
  return isFinite(n) ? n : null;
}

type Row = {
  label: string; value: string; unit: string;
  computed?: boolean; emphasis?: boolean;
  /** Provenance badge text — rendered as a coloured chip beside the label. */
  tag?: string;
  /** Native tooltip shown on ⓘ icon beside the label. */
  tooltip?: string;
  /** When true the row renders as a full-width sub-section divider. */
  isSubHeader?: boolean;
};

type MassBalance = {
  totalOilInputKg: number;
  finishedOilKg: number;
  semiFinishedOilKg: number;
  blackOilKgPerCycle: number;
  burnedOilKgPerCycle: number;
  otherProcessLossKg: number;
  totalAccountedOutputKg: number;
  differenceKg: number;
  errorPct: number;
  closed: boolean;
};

const NOT_COMPUTED = "Not computed";

// ── KE parameter codes consumed per treatment branch ─────────────────────────
// These sets drive branch-specific snapshot filtering.  Update whenever a new
// keValue() call is added to buildRows for a given branch.
// Common codes: consumed by both COLOUR_ODOR and COLOUR_ODOR_SULPHUR.
const KE_CODES_COMMON: string[] = [
  "MEDIA_WT_PER_COL", "COLUMNS_PER_MODULE", "FLOW_PER_COL",
  "COL_INTERNAL_VOL", "MEDIA_VOID_FRACTION",
  "COLOUR_CUT_MARGIN", "COLOUR_CYCLE_END_DIFF", "TIME_MEDIA_SATURATION",
  "TIME_VACUUM_DRAIN", "TIME_HEATUP", "TIME_REGEN", "TIME_COOLING", "TIME_SWITCHING",
  "OIL_RECOVERED_VACUUM", "BASE_OIL_SG", "BLACK_OIL_PER_COL",
  "OIL_BURNED_REGEN", "REGEN_OFFGAS_FLOW", "OTHER_PROCESS_LOSSES",
  "REGEN_OFFGAS_TEMP", "REGEN_TEST_COLUMN_COUNT", "REGEN_TEST_SKID_COUNT",
  "AIR_CP", "AIR_DENSITY_N", "AMBIENT_TEMP", "COMBUSTION_AIR_REQ",
  "VOC_LHV", "LPG_LHV", "TOX_OPERATING_TEMP", "TOX_RESIDENCE_TIME",
  // Rotating Equipment Skid capacities — consumed by BOTH branches for common
  // multi-skid selection.  Values are read live from KE; not hard-coded below.
  "SKID_CAP_CPS_060", "SKID_CAP_CPS_120", "SKID_CAP_CPS_180",
  "SKID_CAP_CPS_200", "SKID_CAP_CPS_240",
];
// COLOUR_ODOR-specific codes (colour absorption factor governs required media).
const KE_CODES_COLOUR: string[] = [
  ...KE_CODES_COMMON,
  "COLOUR_ABS_FACTOR",
];
// COLOUR_ODOR_SULPHUR-specific codes (sulphur ABS factor + endpoint thresholds).
// SKID_CAP_CPS_* are in KE_CODES_COMMON so both branches fetch them.
const KE_CODES_SULPHUR: string[] = [
  ...KE_CODES_COMMON,
  "SULPHUR_ABS_FACTOR",
  "SEMI_FINISHED_SULPHUR_PPM", "BLACK_OIL_SULPHUR_PPM",
  "SULPHUR_DIVERSION_FACTOR", "SULPHUR_CYCLE_END_FACTOR",
];

const fmt = (n: number, dp = 2) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: dp });

// ── Sulphur branch: candidate-column iteration ────────────────────────────────
// Iterates N in COLUMNS_PER_MODULE steps until the sulphur sizing condition
// is satisfied.  The iteration is bounded by SULPHUR_ITER_SAFETY_GUARD — a
// practical engineering ceiling independent of any single rotating skid
// capacity.  A CPS system may use multiple Rotating Equipment Skids, so the
// largest single SKID_CAP_CPS_* value is NOT used as a process-sizing limit.
// Returns null only if the guard is reached without a passing candidate.
//
// Safety guard: 10,000 columns = 500 × COLUMNS_PER_MODULE modules.
// This is far beyond any practical CPS installation.
const SULPHUR_ITER_SAFETY_GUARD = 10_000;

type SulphurSolveResult = {
  installedColumns: number;
  requiredMediaKg: number;
  rawRequiredColumns: number;
};

function solveSulphurInstalledColumns(p: {
  // KE
  flowPerCol: number; columnsPerModule: number;
  oilRecoveredVacuum: number; baseOilSg: number; blackOilPerCol: number;
  sulphurAbsFactor: number; mediaWtPerCol: number;
  semiFinishedSulphurPpm: number; blackOilSulphurPpm: number;
  // Pre-computed N-independent times (h)
  columnFillingTimeH: number; semiFinishedMediaSaturationTimeH: number;
  vacuumDrainTimeH: number; heatUpTimeH: number; regenerationTimeH: number;
  coolingTimeH: number; switchingSettlingTimeH: number;
  // Customer inputs
  customerLph: number; inletSulphurPpm: number; targetSulphurPpm: number;
}): SulphurSolveResult | null {
  const {
    flowPerCol, columnsPerModule, oilRecoveredVacuum, baseOilSg, blackOilPerCol,
    sulphurAbsFactor, mediaWtPerCol, semiFinishedSulphurPpm, blackOilSulphurPpm,
    columnFillingTimeH, semiFinishedMediaSaturationTimeH,
    vacuumDrainTimeH, heatUpTimeH, regenerationTimeH, coolingTimeH, switchingSettlingTimeH,
    customerLph, inletSulphurPpm, targetSulphurPpm,
  } = p;

  // NON_FINISHED_TIME_H is N-independent (does not include Finished Polishing Time)
  const nonFinishedTimeH =
    columnFillingTimeH + semiFinishedMediaSaturationTimeH +
    vacuumDrainTimeH + heatUpTimeH + regenerationTimeH +
    coolingTimeH + switchingSettlingTimeH;

  for (let n = columnsPerModule; n <= SULPHUR_ITER_SAFETY_GUARD; n += columnsPerModule) {
    const totalCpsFlowLph = n * flowPerCol;

    // Skip if this candidate cannot meet customer demand
    if (totalCpsFlowLph <= customerLph) continue;

    // Finished Polishing Time for this candidate N
    const fpt = (customerLph * nonFinishedTimeH) / (totalCpsFlowLph - customerLph);

    // Oil volumes (L/cycle)
    const totalOilInputL = totalCpsFlowLph * (columnFillingTimeH + fpt + semiFinishedMediaSaturationTimeH);
    const finishedOilL   = totalCpsFlowLph * fpt;
    const semiProcOilL   = totalCpsFlowLph * semiFinishedMediaSaturationTimeH;
    const vacDrainOilL   = (n * oilRecoveredVacuum) / baseOilSg;
    const totalSemiOilL  = semiProcOilL + vacDrainOilL;
    const blackOilKg     = n * blackOilPerCol;

    // kg conversions
    const totalOilInputKg = totalOilInputL * baseOilSg;
    const finishedOilKg   = finishedOilL   * baseOilSg;
    const semiOilKg       = totalSemiOilL  * baseOilSg;

    // Sulphur masses (kg)
    //   SULPHUR_KG = OIL_STREAM_KG × SULPHUR_PPM / 1,000,000
    const sulphurInputKg    = totalOilInputKg * inletSulphurPpm         / 1_000_000;
    const finishedSulphurKg = finishedOilKg   * targetSulphurPpm        / 1_000_000;
    const semiSulphurKg     = semiOilKg       * semiFinishedSulphurPpm  / 1_000_000;
    const blackSulphurKg    = blackOilKg      * blackOilSulphurPpm      / 1_000_000;

    // SULPHUR_ABSORBED_KG = SULPHUR_INPUT_KG − TOTAL_DEFINED_SULPHUR_OUTPUT_KG
    const sulphurAbsorbedKg =
      sulphurInputKg - finishedSulphurKg - semiSulphurKg - blackSulphurKg;

    // Degenerate guard: absorbed cannot be ≤ 0 (would imply output ≥ input)
    if (sulphurAbsorbedKg <= 0) continue;

    const requiredMediaKg    = sulphurAbsorbedKg / sulphurAbsFactor;
    const rawRequiredColumns = requiredMediaKg    / mediaWtPerCol;

    // Pass condition: this candidate supplies enough media
    if (n >= rawRequiredColumns) {
      return { installedColumns: n, requiredMediaKg, rawRequiredColumns };
    }
  }

  // No feasible solution within the upper guard
  return null;
}

// Returned by recalculateAndSave() on success — carries exactly one calculation
// execution through DB save → UI update → optional PDF generation.
type RecalcResult = {
  calc:      BuildRowsResult;    // single buildRows() output
  keSnapshot: object;            // frozen KE snapshot that was saved
  liveKe:    KnowledgeParam[];   // full live KE — for Internal PDF name/symbol enrichment
};

type BuildRowsResult = {
  rows:               Row[];
  mb:                 MassBalance | null;
  vocRows:            Row[];
  toxRows:            Row[];
  // Sizing
  installedColumns:   number | null;
  rawRequiredColumns: number | null;
  requiredMediaKg:    number | null;
  numberOfSkids:      number | null;  // 20-column module count (installedColumns / CPM)
  totalCpsFlowLph:    number | null;
  // Rotating Equipment Skid selection (common to both branches)
  skidConfig:        string | null;   // e.g. "2 × CPS-240" or "CPS-240 + CPS-120"
  skidCount:         number | null;   // number of rotating equipment skids
  totalSkidCapacity: number | null;   // sum of selected skid capacities
  skidSpareCapacity: number | null;   // totalSkidCapacity − installedColumns
  // Branch reductions
  deltaColour:        number | null;
  deltaSulphur:       number | null;
  // Volume and timing
  columnFillVolumeL:                number | null;
  columnFillingTimeH:               number | null;
  finishedPolishingTimeH:           number | null;
  semiFinishedMediaSaturationTimeH: number | null;
  vacuumDrainTimeH:                 number | null;
  heatUpTimeH:                      number | null;
  regenerationTimeH:                number | null;
  coolingTimeH:                     number | null;
  switchingSettlingTimeH:           number | null;
  totalCycleTimeH:                  number | null;
  // Capacity flag
  capacityInsufficient: boolean;
  // Solver metadata
  sulphurSolveFailed: boolean;
  /** BASE_OIL_SG KE value — exposed for capacity validation in PDF only. */
  baseOilSg: number | null;
  isSulphurBranch:    boolean;
};

// ── Rotating Equipment Skid selection ────────────────────────────────────────
// Selects the optimal combination of active SKID_CAP_CPS_* skids to satisfy
// INSTALLED_COLUMNS.  Multiple identical skids are permitted.  Capacity values
// are read live from the Knowledge Engine — the numbers 60/120/180/200/240 are
// NEVER hard-coded into this algorithm.
//
// Selection priority:
//   P1 — minimum spare capacity (TOTAL_SKID_CAPACITY − INSTALLED_COLUMNS)
//   P2 — fewest rotating equipment skids
//   P3 — prefer larger standard skid capacities (lex-descending comparison)
//
// Common to BOTH treatment branches (called after INSTALLED_COLUMNS is known).

type SkidSelection = {
  skids:         number[];  // individual capacities, sorted descending
  totalCapacity: number;    // sum of all selected skid capacities
  spareCapacity: number;    // totalCapacity − installedColumns
  count:         number;    // number of rotating equipment skids
};

/** Lex-descending comparison of two desc-sorted skid arrays (P3 tie-break). */
function compareSkidsDesc(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * All multiset combinations of exactly `n` elements from `caps` (sorted
 * descending, repetition allowed).  Drawing left-to-right ensures each
 * result is already in descending order — no re-sort needed.
 */
function genCombinations(caps: number[], n: number, startIdx = 0): number[][] {
  if (n === 0) return [[]];
  const result: number[][] = [];
  for (let i = startIdx; i < caps.length; i++) {
    for (const rest of genCombinations(caps, n - 1, i)) {
      result.push([caps[i], ...rest]);
    }
  }
  return result;
}

function selectRotatingSkids(
  installedColumns: number,
  skidCaps: number[],        // live KE values — not hard-coded
): SkidSelection | null {
  if (skidCaps.length === 0 || installedColumns <= 0) return null;

  // Unique capacities, largest first (P3 comparison is lex-descending).
  const caps = [...new Set(skidCaps)].sort((a, b) => b - a);
  const maxCap = caps[0];

  // Lower bound on skid count; search a small window above it.
  const minN = Math.ceil(installedColumns / maxCap);
  const maxN = minN + caps.length; // practical search ceiling

  let best: SkidSelection | null = null;

  for (let n = minN; n <= maxN; n++) {
    for (const combo of genCombinations(caps, n)) {
      const total = combo.reduce((s, v) => s + v, 0);
      if (total < installedColumns) continue;
      const spare = total - installedColumns;

      if (best === null) {
        best = { skids: combo, totalCapacity: total, spareCapacity: spare, count: n };
        continue;
      }
      if (spare < best.spareCapacity) {
        // P1 wins
        best = { skids: combo, totalCapacity: total, spareCapacity: spare, count: n };
      } else if (spare === best.spareCapacity) {
        if (n < best.count) {
          // P2 wins
          best = { skids: combo, totalCapacity: total, spareCapacity: spare, count: n };
        } else if (n === best.count && compareSkidsDesc(combo, best.skids) > 0) {
          // P3 wins
          best = { skids: combo, totalCapacity: total, spareCapacity: spare, count: n };
        }
      }
    }
    // Once we have a zero-spare solution and are extending skid count,
    // adding more skids can only worsen P2 — terminate early.
    if (best !== null && best.spareCapacity === 0 && n >= best.count) break;
  }

  return best;
}

/**
 * Formats a skid array per display convention:
 *   single type, any count  → "N × CPS-XXX"   (e.g. "1 × CPS-060", "2 × CPS-240")
 *   multiple types, count=1 → "CPS-A + CPS-B"  (e.g. "CPS-240 + CPS-120")
 *   multiple types, count>1 → "N × CPS-A + CPS-B" (mixed)
 */
function buildSkidConfigString(skids: number[]): string {
  const counts = new Map<number, number>();
  for (const s of skids) counts.set(s, (counts.get(s) ?? 0) + 1);
  const entries = [...counts.entries()].sort((a, b) => b[0] - a[0]);
  const isOnlyType = entries.length === 1;
  const parts: string[] = [];
  for (const [cap, cnt] of entries) {
    const label = `CPS-${String(cap).padStart(3, "0")}`;
    // Show count prefix when cnt > 1 OR when this is the only skid type
    // (single-skid selections display as "1 × CPS-XXX" per spec).
    parts.push(cnt > 1 || isOnlyType ? `${cnt} \u00d7 ${label}` : label);
  }
  return parts.join(" + ");
}

function buildRows(c: SizingCase, ke: KnowledgeParam[] | undefined): BuildRowsResult {
  const isSulphurBranch = c.treatment_scope === "COLOUR_ODOR_SULPHUR";

  // ── Customer inputs ───────────────────────────────────────────────────────
  const inlet  = Number(c.inlet_colour);
  const target = Number(c.target_colour);
  const deltaColour = isFinite(inlet) && isFinite(target) ? inlet - target : null;

  const inletSulphur  = isSulphurBranch ? Number(c.inlet_sulphur)  : NaN;
  const targetSulphur = isSulphurBranch ? Number(c.target_sulphur) : NaN;
  const deltaSulphur  =
    isSulphurBranch && isFinite(inletSulphur) && isFinite(targetSulphur)
      ? inletSulphur - targetSulphur : null;

  const cpsFeedCapacity = Number(c.cps_feed_capacity);
  const customerLph = isFinite(cpsFeedCapacity) && cpsFeedCapacity > 0
    ? cpsFeedCapacity / 24 : null;

  // ── All KE lookups (centralised) ─────────────────────────────────────────
  const colourAbsFactor          = keValue(ke, "COLOUR_ABS_FACTOR");
  const sulphurAbsFactor         = keValue(ke, "SULPHUR_ABS_FACTOR");
  const mediaWtPerCol            = keValue(ke, "MEDIA_WT_PER_COL");
  const columnsPerModule         = keValue(ke, "COLUMNS_PER_MODULE");
  const flowPerCol               = keValue(ke, "FLOW_PER_COL");
  const colInternalVol           = keValue(ke, "COL_INTERNAL_VOL");
  const mediaVoidFraction        = keValue(ke, "MEDIA_VOID_FRACTION");
  const colourCutMargin          = keValue(ke, "COLOUR_CUT_MARGIN");
  const colourCycleEndDiff       = keValue(ke, "COLOUR_CYCLE_END_DIFF");
  const timeMediaSaturationBasis = keValue(ke, "TIME_MEDIA_SATURATION");
  const vacuumDrainTimeH         = keValue(ke, "TIME_VACUUM_DRAIN");
  const heatUpTimeH              = keValue(ke, "TIME_HEATUP");
  const regenerationTimeH        = keValue(ke, "TIME_REGEN");
  const coolingTimeH             = keValue(ke, "TIME_COOLING");
  const switchingSettlingTimeH   = keValue(ke, "TIME_SWITCHING");
  const oilRecoveredVacuum       = keValue(ke, "OIL_RECOVERED_VACUUM");
  const baseOilSg                = keValue(ke, "BASE_OIL_SG");
  const blackOilPerCol           = keValue(ke, "BLACK_OIL_PER_COL");
  const oilBurnedRegen           = keValue(ke, "OIL_BURNED_REGEN");
  const regenOffgasFlow          = keValue(ke, "REGEN_OFFGAS_FLOW");
  const otherProcessLossesPerCol = keValue(ke, "OTHER_PROCESS_LOSSES");
  const semiFinishedSulphurPpm   = keValue(ke, "SEMI_FINISHED_SULPHUR_PPM");
  const blackOilSulphurPpm       = keValue(ke, "BLACK_OIL_SULPHUR_PPM");
  // Sulphur-cycle process threshold KE parameters (APPROVED ENGINEERING BASIS 2026-08-09)
  // Formula stored in KE engineering_notes:
  //   SULPHUR_DIVERSION_FACTOR = outlet_sulphur_at_diversion / inlet_sulphur   (0.30 = 450/1500 ppm)
  //   SULPHUR_CYCLE_END_FACTOR = outlet_sulphur_at_cycle_end / inlet_sulphur   (0.667 = 1000/1500 ppm)
  const sulphurDiversionFactor   = keValue(ke, "SULPHUR_DIVERSION_FACTOR");
  const sulphurCycleEndFactor    = keValue(ke, "SULPHUR_CYCLE_END_FACTOR");
  // regen_offgas_tox KE parameters (VOC / Regeneration Off-Gas section)
  // Deleted from KE 2026-08-09 (no-placeholder policy — see dependency audit):
  //   REGEN_VOC_MASS_LOAD, REGEN_SULPHUR_MASS_LOAD,
  //   REGEN_OFFGAS_PEAK_DURATION, REGEN_OFFGAS_PEAK_FACTOR
  const regenOffgasTemp      = keValue(ke, "REGEN_OFFGAS_TEMP");
  const regenTestColumnCount = keValue(ke, "REGEN_TEST_COLUMN_COUNT");
  const regenTestSkidCount   = keValue(ke, "REGEN_TEST_SKID_COUNT");
  // TOX heat-balance KE parameters (all approved; see dependency audit)
  // AIR_CP stored in KE as kcal/kg·°C — must be converted to kJ/kg·K in code (×4.1868).
  const airCpKcal        = keValue(ke, "AIR_CP");             // kcal/kg·°C
  const airDensityN      = keValue(ke, "AIR_DENSITY_N");      // kg/Nm³ at 0°C, 1 atm
  const ambientTemp      = keValue(ke, "AMBIENT_TEMP");       // °C
  const combustionAirReq = keValue(ke, "COMBUSTION_AIR_REQ");// Nm³/kg combustible
  const vocLhv           = keValue(ke, "VOC_LHV");            // MJ/kg
  const lpgLhv           = keValue(ke, "LPG_LHV");            // MJ/kg
  const toxOperTemp      = keValue(ke, "TOX_OPERATING_TEMP"); // °C
  const toxResidenceTime = keValue(ke, "TOX_RESIDENCE_TIME"); // s — APPROVED DESIGN BASIS (1.0 s)

  // Active Rotating Equipment Skid capacities — live from KE, not hard-coded numbers.
  // Used by selectRotatingSkids() for BOTH branches after INSTALLED_COLUMNS is resolved.
  const skidCaps = (["SKID_CAP_CPS_060","SKID_CAP_CPS_120","SKID_CAP_CPS_180",
                      "SKID_CAP_CPS_200","SKID_CAP_CPS_240"] as const)
    .map(code => keValue(ke, code)).filter((v): v is number => v !== null);

  // ── N-independent times ───────────────────────────────────────────────────
  // None of these depend on INSTALLED_COLUMNS.  Computed before the branch
  // split so the sulphur iteration can use them as inputs.

  // Step 6: COLUMN_FILL_VOLUME_L = COL_INTERNAL_VOL × MEDIA_VOID_FRACTION (KE)
  const columnFillVolumeL =
    colInternalVol !== null && mediaVoidFraction !== null
      ? colInternalVol * mediaVoidFraction : null;

  // Step 7: COLUMN_FILLING_TIME_H = COLUMN_FILL_VOLUME_L / FLOW_PER_COL
  // All columns fill in parallel — NOT multiplied by INSTALLED_COLUMNS.
  const columnFillingTimeH =
    columnFillVolumeL !== null && flowPerCol !== null && flowPerCol > 0
      ? columnFillVolumeL / flowPerCol : null;

  // Step 8: Semi-finished / Media Saturation Time (colour-duty dependent, N-independent)
  //   FINISHED_CUT_COLOUR = TARGET_COLOUR + COLOUR_CUT_MARGIN     (KE)
  //   CYCLE_END_COLOUR    = INLET_COLOUR − COLOUR_CYCLE_END_DIFF  (KE)
  //   SEMI_COLOUR_DUTY    = CYCLE_END_COLOUR − FINISHED_CUT_COLOUR
  //   TIME = TIME_MEDIA_SATURATION × SEMI_COLOUR_DUTY; duty <= 0 → 0 h
  const finishedCutColour =
    isFinite(target) && colourCutMargin !== null ? target + colourCutMargin : null;
  const cycleEndColour =
    isFinite(inlet) && colourCycleEndDiff !== null ? inlet - colourCycleEndDiff : null;
  const semiColourDuty =
    finishedCutColour !== null && cycleEndColour !== null
      ? cycleEndColour - finishedCutColour : null;
  const semiFinishedMediaSaturationTimeH =
    semiColourDuty !== null && timeMediaSaturationBasis !== null
      ? (semiColourDuty <= 0 ? 0 : timeMediaSaturationBasis * semiColourDuty) : null;

  // Steps 9–13: fixed KE times (TIME_VACUUM_DRAIN … TIME_SWITCHING) — declared above.

  // NON_FINISHED_TIME_H = fill + semi-sat + drain + heatup + regen + cooling + switching
  // Does NOT include Finished Polishing Time (which depends on N).
  const nonFinishedTimeH =
    columnFillingTimeH !== null && semiFinishedMediaSaturationTimeH !== null &&
    vacuumDrainTimeH !== null && heatUpTimeH !== null && regenerationTimeH !== null &&
    coolingTimeH !== null && switchingSettlingTimeH !== null
      ? columnFillingTimeH + semiFinishedMediaSaturationTimeH + vacuumDrainTimeH +
        heatUpTimeH + regenerationTimeH + coolingTimeH + switchingSettlingTimeH
      : null;

  // ── INSTALLED_COLUMNS — branch-specific ──────────────────────────────────

  let sulphurSolveFailed = false; // true only when iteration exhausted the upper guard
  let requiredMediaKg:    number | null;
  let rawRequiredColumns: number | null;
  let installedColumns:   number | null;

  if (isSulphurBranch) {
    // Sulphur branch: candidate-column iteration (approved method).
    // All inputs must be defined — fail closed if any is null.
    const iterReady =
      flowPerCol !== null && columnsPerModule !== null &&
      oilRecoveredVacuum !== null && baseOilSg !== null && blackOilPerCol !== null &&
      sulphurAbsFactor !== null && mediaWtPerCol !== null &&
      semiFinishedSulphurPpm !== null && blackOilSulphurPpm !== null &&
      columnFillingTimeH !== null && semiFinishedMediaSaturationTimeH !== null &&
      vacuumDrainTimeH !== null && heatUpTimeH !== null && regenerationTimeH !== null &&
      coolingTimeH !== null && switchingSettlingTimeH !== null &&
      customerLph !== null && isFinite(inletSulphur) && isFinite(targetSulphur);

    if (iterReady) {
      const result = solveSulphurInstalledColumns({
        flowPerCol:                      flowPerCol!,
        columnsPerModule:                columnsPerModule!,
        oilRecoveredVacuum:              oilRecoveredVacuum!,
        baseOilSg:                       baseOilSg!,
        blackOilPerCol:                  blackOilPerCol!,
        sulphurAbsFactor:                sulphurAbsFactor!,
        mediaWtPerCol:                   mediaWtPerCol!,
        semiFinishedSulphurPpm:          semiFinishedSulphurPpm!,
        blackOilSulphurPpm:              blackOilSulphurPpm!,
        columnFillingTimeH:              columnFillingTimeH!,
        semiFinishedMediaSaturationTimeH: semiFinishedMediaSaturationTimeH!,
        vacuumDrainTimeH:                vacuumDrainTimeH!,
        heatUpTimeH:                     heatUpTimeH!,
        regenerationTimeH:               regenerationTimeH!,
        coolingTimeH:                    coolingTimeH!,
        switchingSettlingTimeH:          switchingSettlingTimeH!,
        customerLph:                     customerLph!,
        inletSulphurPpm:                 inletSulphur,
        targetSulphurPpm:                targetSulphur,
      });
      sulphurSolveFailed = result === null;
      requiredMediaKg    = result?.requiredMediaKg    ?? null;
      rawRequiredColumns = result?.rawRequiredColumns ?? null;
      installedColumns   = result?.installedColumns   ?? null;
    } else {
      requiredMediaKg    = null;
      rawRequiredColumns = null;
      installedColumns   = null;
    }
  } else {
    // Colour branch: capacity-scaled empirical formula (approved)
    //   OIL_INPUT_KL      = REQUIRED_CPS_CAPACITY_L / 1,000
    //   REQUIRED_MEDIA_KG = OIL_INPUT_KL × DELTA_COLOUR × COLOUR_ABS_FACTOR
    //   COLOUR_ABS_FACTOR units: kg media / (1,000 L oil · ASTM)
    //   Use cpsFeedCapacity (L/day) directly — do NOT divide by 24.
    const oilInputKl = isFinite(cpsFeedCapacity) && cpsFeedCapacity > 0
      ? cpsFeedCapacity / 1000 : null;
    requiredMediaKg = oilInputKl !== null && deltaColour !== null
      && colourAbsFactor !== null && colourAbsFactor > 0
      ? oilInputKl * deltaColour * colourAbsFactor : null;
    rawRequiredColumns = requiredMediaKg !== null && mediaWtPerCol !== null && mediaWtPerCol > 0
      ? requiredMediaKg / mediaWtPerCol : null;
    // Step 3: CEILING(ROUND(RAW,6) / CPM) × CPM
    // ROUND(…,6) strips floating-point residue only — NOT an engineering tolerance.
    installedColumns = rawRequiredColumns !== null && columnsPerModule !== null && columnsPerModule > 0
      ? Math.ceil(Math.round(rawRequiredColumns * 1e6) / 1e6 / columnsPerModule) * columnsPerModule
      : null;
  }

  // Step 4: NUMBER_OF_20-COLUMN_MODULES = INSTALLED_COLUMNS / COLUMNS_PER_MODULE
  // (physical column modularity — distinct from Rotating Equipment Skid count)
  const numberOfSkids =
    installedColumns !== null && columnsPerModule !== null && columnsPerModule > 0
      ? installedColumns / columnsPerModule : null;

  // Step 5: TOTAL_CPS_FLOW_LPH = INSTALLED_COLUMNS × FLOW_PER_COL (KE)
  const totalCpsFlowLph =
    installedColumns !== null && flowPerCol !== null
      ? installedColumns * flowPerCol : null;

  // ── Rotating Equipment Skid selection (common to BOTH treatment branches) ─
  // Called after INSTALLED_COLUMNS is resolved for either branch.
  // skidCaps holds active SKID_CAP_CPS_* values read live from KE.
  // The selection algorithm is independent of which treatment branch produced
  // INSTALLED_COLUMNS — it is a pure combinatorial optimisation.
  const skidSelection = installedColumns !== null && skidCaps.length > 0
    ? selectRotatingSkids(installedColumns, skidCaps)
    : null;
  const skidConfigDisplay = skidSelection !== null
    ? buildSkidConfigString(skidSelection.skids)
    : "Parameter not defined";

  // Step 14: FINISHED_POLISHING_TIME_H
  //   FPT = (CUSTOMER_LPH × NON_FINISHED_TIME_H) / (TOTAL_CPS_FLOW_LPH − CUSTOMER_LPH)
  // Solvability guard: if TOTAL_CPS_FLOW_LPH <= CUSTOMER_LPH, display warning.
  const capacityInsufficient =
    totalCpsFlowLph !== null && customerLph !== null && totalCpsFlowLph <= customerLph;
  const finishedPolishingTimeH =
    !capacityInsufficient && nonFinishedTimeH !== null &&
    totalCpsFlowLph !== null && customerLph !== null
      ? (customerLph * nonFinishedTimeH) / (totalCpsFlowLph - customerLph) : null;
  const finishedPolishingDisplay = capacityInsufficient
    ? "Installed capacity insufficient for customer demand."
    : finishedPolishingTimeH !== null
      ? fmt(finishedPolishingTimeH)
      : "Parameter not defined";

  // Step 15: TOTAL_CYCLE_TIME_H = sum of the eight time components.
  // Fails closed, naming the missing component(s).
  const cycleComponents: [string, number | null][] = [
    ["Column Filling Time",                columnFillingTimeH],
    ["Finished Polishing Time",            capacityInsufficient ? null : finishedPolishingTimeH],
    ["Semi-finished / Media Saturation Time", semiFinishedMediaSaturationTimeH],
    ["Vacuum Drain Time",                  vacuumDrainTimeH],
    ["Heat-up Time",                       heatUpTimeH],
    ["Regeneration Time",                  regenerationTimeH],
    ["Cooling Time",                       coolingTimeH],
    ["Switching / Settling Time",          switchingSettlingTimeH],
  ];
  const missingCycleComponents = cycleComponents.filter(([, v]) => v === null).map(([n]) => n);
  const totalCycleTimeH =
    missingCycleComponents.length === 0
      ? cycleComponents.reduce((s, [, v]) => s + (v as number), 0)
      : null;
  const totalCycleTimeDisplay =
    totalCycleTimeH !== null
      ? fmt(totalCycleTimeH)
      : `Cannot compute — undefined component(s): ${missingCycleComponents.join(", ")}`;

  // Step 16: TOTAL_OIL_INPUT_L_PER_CYCLE =
  //   TOTAL_CPS_FLOW_LPH × (fill + finished polishing + semi/saturation)
  // Only oil-flowing periods count.
  const totalOilFlowTimeH =
    columnFillingTimeH !== null && finishedPolishingTimeH !== null &&
    semiFinishedMediaSaturationTimeH !== null && !capacityInsufficient
      ? columnFillingTimeH + finishedPolishingTimeH + semiFinishedMediaSaturationTimeH
      : null;
  const totalOilInputLPerCycle =
    totalOilFlowTimeH !== null && totalCpsFlowLph !== null
      ? totalCpsFlowLph * totalOilFlowTimeH : null;

  // Step 17: FINISHED_OIL_L_PER_CYCLE = TOTAL_CPS_FLOW_LPH × FINISHED_POLISHING_TIME_H
  const finishedOilLPerCycle =
    totalCpsFlowLph !== null && finishedPolishingTimeH !== null && !capacityInsufficient
      ? totalCpsFlowLph * finishedPolishingTimeH : null;

  // Step 18: TOTAL_SEMI_FINISHED_OIL_L_PER_CYCLE
  //   Component 1: SEMI_PROCESSING_OIL_L = TOTAL_CPS_FLOW_LPH × SEMI_SAT_TIME_H
  //   Component 2: VACUUM_DRAIN_OIL_L = (INSTALLED_COLUMNS × OIL_RECOVERED_VACUUM) / BASE_OIL_SG
  const semiProcessingOilL =
    totalCpsFlowLph !== null && semiFinishedMediaSaturationTimeH !== null
      ? totalCpsFlowLph * semiFinishedMediaSaturationTimeH : null;
  const vacuumDrainOilKg =
    installedColumns !== null && oilRecoveredVacuum !== null
      ? installedColumns * oilRecoveredVacuum : null;
  const vacuumDrainOilL =
    vacuumDrainOilKg !== null && baseOilSg !== null && baseOilSg > 0
      ? vacuumDrainOilKg / baseOilSg : null;
  const totalSemiFinishedOilLPerCycle =
    semiProcessingOilL !== null && vacuumDrainOilL !== null
      ? semiProcessingOilL + vacuumDrainOilL : null;

  // Step 19: BLACK_OIL_KG_PER_CYCLE = INSTALLED_COLUMNS × BLACK_OIL_PER_COL (KE)
  const blackOilKgPerCycle =
    installedColumns !== null && blackOilPerCol !== null
      ? installedColumns * blackOilPerCol : null;

  // Step 20: BURNED_OIL_KG_PER_CYCLE = INSTALLED_COLUMNS × OIL_BURNED_REGEN (KE)
  const burnedOilKgPerCycle =
    installedColumns !== null && oilBurnedRegen !== null
      ? installedColumns * oilBurnedRegen : null;

  // kg conversions for litre-based streams: MASS_KG = VOLUME_L × BASE_OIL_SG
  const totalOilInputKg =
    totalOilInputLPerCycle !== null && baseOilSg !== null
      ? totalOilInputLPerCycle * baseOilSg : null;
  const finishedOilKg =
    finishedOilLPerCycle !== null && baseOilSg !== null
      ? finishedOilLPerCycle * baseOilSg : null;
  const semiFinishedOilKg =
    totalSemiFinishedOilLPerCycle !== null && baseOilSg !== null
      ? totalSemiFinishedOilLPerCycle * baseOilSg : null;

  // Step 21: REGEN_OFFGAS_TOTAL_NM3_H = INSTALLED_COLUMNS × REGEN_OFFGAS_FLOW (KE)
  const regenOffgasTotalNm3H =
    installedColumns !== null && regenOffgasFlow !== null
      ? installedColumns * regenOffgasFlow : null;

  // ── VOC / Regeneration Off-Gas computed values ────────────────────────────
  // Common to both COLOUR_ODOR and COLOUR_ODOR_SULPHUR scopes.
  // Source KE category: regen_offgas_tox + applicable regeneration_recovery.
  // No COLOUR_ABS_FACTOR or SULPHUR_ABS_FACTOR involved.

  // AVERAGE_OIL_BURN_RATE_KGH = OIL_BURNED_KG_PER_REGEN / TIME_REGEN
  // OIL_BURNED_KG_PER_REGEN = burnedOilKgPerCycle (computed above).
  // Fail closed if TIME_REGEN is zero or undefined (division guard).
  const avgOilBurnRateKgH =
    burnedOilKgPerCycle !== null && regenerationTimeH !== null && regenerationTimeH > 0
      ? burnedOilKgPerCycle / regenerationTimeH : null;

  // ── Regeneration Sulphur Load (Option B — case-specific, never stored in KE) ──
  // Source KE primitives: SULPHUR_ABS_FACTOR, MEDIA_WT_PER_COL, TIME_REGEN.
  // Case-specific input: installedColumns.
  // Fail closed if any required input is null or TIME_REGEN ≤ 0.
  //
  //   SULPHUR_PER_COLUMN  = MEDIA_WT_PER_COL × SULPHUR_ABS_FACTOR
  //   TOTAL_S_PER_REGEN   = INSTALLED_COLUMNS × SULPHUR_PER_COLUMN
  //   AVG_S_MASS_LOAD_KGH = TOTAL_S_PER_REGEN / TIME_REGEN
  //   SO2_EQUIV_KGH       = AVG_S_MASS_LOAD_KGH × 2  (M_SO2 / M_S = 64/32, exact)
  const sulphurPerColumn =
    mediaWtPerCol !== null && sulphurAbsFactor !== null
      ? mediaWtPerCol * sulphurAbsFactor : null;
  const totalSulphurPerRegen =
    installedColumns !== null && sulphurPerColumn !== null
      ? installedColumns * sulphurPerColumn : null;
  const avgSulphurMassLoadKgH =
    totalSulphurPerRegen !== null && regenerationTimeH !== null && regenerationTimeH > 0
      ? totalSulphurPerRegen / regenerationTimeH : null;
  const so2EquivalentKgH =
    avgSulphurMassLoadKgH !== null ? avgSulphurMassLoadKgH * 2 : null;

  // ── Sulphur Cycle Process Thresholds (APPROVED ENGINEERING BASIS 2026-08-09) ──
  // Applicable to COLOUR_ODOR_SULPHUR branch only (inletSulphur is NaN for colour-only).
  // Definitions:
  //   sulphurDiversionOutletPpm = inletSulphurPpm × SULPHUR_DIVERSION_FACTOR
  //     → product routes to semi-finished when CPS outlet sulphur reaches this level.
  //   sulphurCycleEndOutletPpm  = inletSulphurPpm × SULPHUR_CYCLE_END_FACTOR
  //     → cycle ends / regeneration triggered when outlet ≥ this value.
  // Cycle termination rule: sulphur endpoint OR colour endpoint, whichever occurs FIRST.
  // The sulphur endpoint must NEVER override an earlier colour endpoint.
  const sulphurDiversionOutletPpm =
    isFinite(inletSulphur) && sulphurDiversionFactor !== null
      ? inletSulphur * sulphurDiversionFactor : null;
  const sulphurCycleEndOutletPpm =
    isFinite(inletSulphur) && sulphurCycleEndFactor !== null
      ? inletSulphur * sulphurCycleEndFactor : null;

  // ── TOX: Actual off-gas volume at TOX inlet temperature ──────────────────
  // Q_ACTUAL_M3H = Q_NM3H × (273.15 + T_°C) / 273.15   (isobaric, 1 atm)
  // Fail closed if either upstream value is null.
  const qActualM3H =
    regenOffgasTotalNm3H !== null && regenOffgasTemp !== null
      ? regenOffgasTotalNm3H * (273.15 + regenOffgasTemp) / 273.15 : null;

  // ── TOX Preliminary Heat Balance ─────────────────────────────────────────
  // Approved 50/50 thermal contribution basis: Q_VOC = Q_LPG.
  // ENGINEERING ASSUMPTION: CPS off-gas density and Cp approximated by air
  //   properties (AIR_DENSITY_N, AIR_CP) — explicitly labelled in output.
  // Q_heat_loss = 0 (first approved model — external losses excluded).
  //
  // Unit conversions (applied explicitly in code, never silently):
  //   AIR_CP  : kcal/kg·°C  × 4.1868  → kJ/kg·K
  //   VOC_LHV : MJ/kg       × 1000    → kJ/kg
  //   LPG_LHV : MJ/kg       × 1000    → kJ/kg
  // All heat flows in kJ/h.
  //
  // Closed-form solution (one equation, one unknown — no iteration):
  //   50/50 basis:   m_LPG = m_VOC × (VOC_LHV / LPG_LHV)
  //   m_combustible  = m_VOC × (1 + VOC_LHV / LPG_LHV)
  //   Q_air_Nm3h     = COMBUSTION_AIR_REQ × m_combustible
  //   m_air          = Q_air_Nm3h × AIR_DENSITY_N
  //   Heat balance:  2 × m_VOC × VOC_LHV_kJ = Q_CPS_sensible + Q_air_sensible
  //                  m_VOC = Q_CPS_sensible / (2 × VOC_LHV_kJ − B)
  //   where B = COMBUSTION_AIR_REQ × (1 + VOC_LHV/LPG_LHV) × AIR_DENSITY_N
  //             × AIR_CP_kJ × (T_tox − T_amb)

  // Unit-converted thermal properties
  const airCpKJPerKgK  = airCpKcal  !== null ? airCpKcal * 4.1868  : null;
  const vocLhvKJPerKg  = vocLhv     !== null ? vocLhv    * 1000     : null;
  const lpgLhvKJPerKg  = lpgLhv     !== null ? lpgLhv    * 1000     : null;

  // CPS carrier-gas mass flow [kg/h] — air density proxy
  const mCpsGasKgH =
    regenOffgasTotalNm3H !== null && airDensityN !== null
      ? regenOffgasTotalNm3H * airDensityN : null;

  // Constant A — CPS off-gas sensible heat [kJ/h]  (independent of m_VOC)
  const qCpsSensibleKJH =
    mCpsGasKgH !== null && airCpKJPerKgK !== null &&
    toxOperTemp !== null && regenOffgasTemp !== null
      ? mCpsGasKgH * airCpKJPerKgK * (toxOperTemp - regenOffgasTemp) : null;

  // Coefficient B — combustion-air sensible heat per kg_VOC [kJ/kg/h]
  const toxHeatBalanceB =
    combustionAirReq !== null && vocLhvKJPerKg !== null && lpgLhvKJPerKg !== null &&
    airDensityN !== null && airCpKJPerKgK !== null &&
    toxOperTemp !== null && ambientTemp !== null
      ? combustionAirReq * (1 + vocLhvKJPerKg / lpgLhvKJPerKg) *
        airDensityN * airCpKJPerKgK * (toxOperTemp - ambientTemp)
      : null;

  // Denominator guard: must be > 0 (combustion heat must exceed sensible losses)
  const toxDenomKJPerKg =
    vocLhvKJPerKg !== null && toxHeatBalanceB !== null
      ? 2 * vocLhvKJPerKg - toxHeatBalanceB : null;

  // Solved m_VOC [kg/h]
  const estVocMassLoadKgH =
    qCpsSensibleKJH !== null && toxDenomKJPerKg !== null && toxDenomKJPerKg > 0
      ? qCpsSensibleKJH / toxDenomKJPerKg : null;

  // Back-substituted quantities (all fail-closed)
  const mLpgKgH =
    estVocMassLoadKgH !== null && vocLhvKJPerKg !== null && lpgLhvKJPerKg !== null
      ? estVocMassLoadKgH * (vocLhvKJPerKg / lpgLhvKJPerKg) : null;
  const mCombustibleKgH =
    estVocMassLoadKgH !== null && mLpgKgH !== null
      ? estVocMassLoadKgH + mLpgKgH : null;
  const combustionAirNm3H =
    mCombustibleKgH !== null && combustionAirReq !== null
      ? mCombustibleKgH * combustionAirReq : null;
  const mAirKgH =
    combustionAirNm3H !== null && airDensityN !== null
      ? combustionAirNm3H * airDensityN : null;
  const qAirSensibleKJH =
    mAirKgH !== null && airCpKJPerKgK !== null &&
    toxOperTemp !== null && ambientTemp !== null
      ? mAirKgH * airCpKJPerKgK * (toxOperTemp - ambientTemp) : null;
  const qTotalCombKJH =
    estVocMassLoadKgH !== null && vocLhvKJPerKg !== null
      ? 2 * estVocMassLoadKgH * vocLhvKJPerKg : null;
  const qTotalMJH        = qTotalCombKJH    !== null ? qTotalCombKJH    / 1000 : null;
  const qTotalKW         = qTotalMJH        !== null ? qTotalMJH        / 3.6  : null;
  const qCpsSensibleMJH  = qCpsSensibleKJH  !== null ? qCpsSensibleKJH  / 1000 : null;
  const qCpsSensibleKW   = qCpsSensibleMJH  !== null ? qCpsSensibleMJH  / 3.6  : null;
  const qAirSensibleMJH  = qAirSensibleKJH  !== null ? qAirSensibleKJH  / 1000 : null;
  const qAirSensibleKW   = qAirSensibleMJH  !== null ? qAirSensibleMJH  / 3.6  : null;
  const estVocPerColumn  =
    estVocMassLoadKgH !== null && installedColumns !== null && installedColumns > 0
      ? estVocMassLoadKgH / installedColumns : null;
  // Preliminary hot-gas volume (CPS off-gas + combustion air at TOX temperature)
  // Note: does not yet account for combustion-product volume change — labelled preliminary.
  const hotGasInputNm3H =
    regenOffgasTotalNm3H !== null && combustionAirNm3H !== null
      ? regenOffgasTotalNm3H + combustionAirNm3H : null;
  const hotGasActualM3H =
    hotGasInputNm3H !== null && toxOperTemp !== null
      ? hotGasInputNm3H * (273.15 + toxOperTemp) / 273.15 : null;

  // ── Combustion chamber effective volume ───────────────────────────────────
  // CHAMBER_VOLUME_M3 = hot-gas flow @ TOX temperature [m³/h] × residence time [s] ÷ 3600
  // Uses actual volumetric flow (not normal flow) — thermal expansion already applied.
  // This is the EFFECTIVE GAS RESIDENCE VOLUME, not the final fabricated shell volume.
  // Additional mechanical allowances (flame zone, refractory, dead volume, margin) must
  // be approved as separate KE parameters before a fabricated volume can be calculated.
  const chamberVolumeM3 =
    hotGasActualM3H !== null && toxResidenceTime !== null
      ? hotGasActualM3H * toxResidenceTime / 3600 : null;

  // Blocking reason string for the heat-balance chain — shown when m_VOC cannot resolve
  const hbBlockReason = estVocMassLoadKgH === null
    ? (toxDenomKJPerKg !== null && toxDenomKJPerKg <= 0
        ? "Not calculated — heat-balance denominator ≤ 0 (review TOX parameters)"
        : "Not calculated — one or more heat-balance KE parameters not defined")
    : null;

  // ── Individual thermal contributions ──────────────────────────────────────
  // Separate VOC and burner heat inputs (confirms 50/50 basis; should be equal).
  // kJ/h → kW: divide by 3600.
  const vocThermalContribKW =
    estVocMassLoadKgH !== null && vocLhvKJPerKg !== null
      ? estVocMassLoadKgH * vocLhvKJPerKg / 3600 : null;
  const lpgThermalContribKW =
    mLpgKgH !== null && lpgLhvKJPerKg !== null
      ? mLpgKgH * lpgLhvKJPerKg / 3600 : null;

  // ── Preliminary TOX Heat Requirement ──────────────────────────────────────
  // Computed from the demand side: sum of all sensible heat loads in the
  // heat-loss-free model (Q_CPS_sensible + Q_air_sensible).
  // Numerically equal to Total Combustible Heat Release by heat-balance closure;
  // shown separately to make the energy closure explicit.
  const qPrelimToxReqKJH =
    qCpsSensibleKJH !== null && qAirSensibleKJH !== null
      ? qCpsSensibleKJH + qAirSensibleKJH : null;
  const qPrelimToxReqMJH = qPrelimToxReqKJH !== null ? qPrelimToxReqKJH / 1000 : null;
  const qPrelimToxReqKW  = qPrelimToxReqMJH !== null ? qPrelimToxReqMJH / 3.6  : null;

  // ── Display helpers for sulphur failure case ──────────────────────────────
  // If the iteration exhausted the upper guard without finding a solution, show
  // a diagnostic message on the three affected rows instead of "Parameter not defined".
  const sulphurNoSolution = isSulphurBranch && sulphurSolveFailed
    ? "No feasible sulphur sizing solution within engineering safety guard — review feed conditions or sulphur model parameters."
    : null;

  const mediaDisplay = sulphurNoSolution
    ?? (requiredMediaKg !== null ? fmt(requiredMediaKg) : "Parameter not defined");
  const rawColDisplay = sulphurNoSolution
    ?? (rawRequiredColumns !== null ? fmt(rawRequiredColumns) : "Parameter not defined");
  const instColDisplay = sulphurNoSolution
    ?? (installedColumns !== null ? fmt(installedColumns, 0) : "Parameter not defined");

  const rows: Row[] = [
    // Echoed customer inputs (saved values, not calculations)
    { label: "Required Treatment", value: scopeLabel(c.treatment_scope), unit: "" },
    { label: "Required Capacity",  value: fmtNum(c.cps_feed_capacity),   unit: "L/day" },
    { label: "Inlet ASTM Colour",  value: fmtNum(c.inlet_colour),         unit: "ASTM" },
    { label: "Target ASTM Colour", value: fmtNum(c.target_colour),        unit: "ASTM" },
    // Sulphur branch — additional echoed inputs
    ...(isSulphurBranch ? [
      { label: "Inlet Sulphur",  value: isFinite(inletSulphur)  ? fmtNum(String(inletSulphur))  : "—", unit: "ppm" },
      { label: "Target Sulphur", value: isFinite(targetSulphur) ? fmtNum(String(targetSulphur)) : "—", unit: "ppm" },
    ] : []),
    // Governing sizing basis
    {
      label: "Governing Sizing Basis",
      value: isSulphurBranch
        ? "Sulphur Mass Balance (SULPHUR_ABS_FACTOR — iteration)"
        : "Colour Reduction (COLOUR_ABS_FACTOR)",
      unit: "",
    },
    // Reduction row
    ...(isSulphurBranch
      ? [{ label: "Sulphur Reduction", value: deltaSulphur !== null ? String(deltaSulphur) : NOT_COMPUTED, unit: "ppm", computed: true }]
      : [{ label: "Colour Reduction",  value: deltaColour  !== null ? String(deltaColour)  : NOT_COMPUTED, unit: "ASTM", computed: true }]
    ),
    { label: "Required Media",        value: mediaDisplay,   unit: "kg",      computed: true },
    { label: "Raw Required Columns",  value: rawColDisplay,  unit: "columns", computed: true },
    { label: "Installed Columns",     value: instColDisplay, unit: "columns", computed: true },
    { label: "Number of 20-Column Modules",        value: numberOfSkids !== null ? fmt(numberOfSkids, 0) : "Parameter not defined", unit: "modules",     computed: true },
    { label: "Rotating Equipment Skid Configuration", value: skidConfigDisplay,                                                   unit: "",            computed: true },
    { label: "Number of Rotating Equipment Skids", value: skidSelection !== null ? fmt(skidSelection.count, 0) : "Parameter not defined", unit: "skids", computed: true },
    { label: "Total Rotating Equipment Capacity",  value: skidSelection !== null ? fmt(skidSelection.totalCapacity, 0) : "Parameter not defined", unit: "columns", computed: true },
    { label: "Spare / Future Expansion Capacity",  value: skidSelection !== null ? fmt(skidSelection.spareCapacity, 0) : "Parameter not defined", unit: "columns", computed: true },
    { label: "Total CPS Flow",                     value: totalCpsFlowLph !== null ? fmt(totalCpsFlowLph) : "Parameter not defined", unit: "L/h",         computed: true },
    { label: "Column Fill Volume",                 value: columnFillVolumeL !== null ? fmt(columnFillVolumeL) : "Parameter not defined", unit: "L/column",    computed: true },
    { label: "Column Filling Time",                value: columnFillingTimeH !== null ? fmt(columnFillingTimeH) : "Parameter not defined", unit: "h",           computed: true },
    { label: "Finished Polishing Time",            value: finishedPolishingDisplay, unit: "h", computed: true },
    { label: "Semi-finished / Media Saturation Time", value: semiFinishedMediaSaturationTimeH !== null ? fmt(semiFinishedMediaSaturationTimeH) : "Parameter not defined", unit: "h", computed: true },
    { label: "Vacuum Drain Time",                  value: vacuumDrainTimeH !== null ? fmt(vacuumDrainTimeH) : "Parameter not defined", unit: "h",           computed: true },
    { label: "Heat-up Time",                       value: heatUpTimeH !== null ? fmt(heatUpTimeH) : "Parameter not defined", unit: "h",           computed: true },
    { label: "Regeneration Time",                  value: regenerationTimeH !== null ? fmt(regenerationTimeH) : "Parameter not defined", unit: "h",           computed: true },
    { label: "Cooling Time",                       value: coolingTimeH !== null ? fmt(coolingTimeH) : "Parameter not defined", unit: "h",           computed: true },
    { label: "Switching / Settling Time",          value: switchingSettlingTimeH !== null ? fmt(switchingSettlingTimeH) : "Parameter not defined", unit: "h",           computed: true },
    { label: "Total Cycle Time",                   value: totalCycleTimeDisplay, unit: "h", computed: true, emphasis: true },
    { label: "Total Oil Input / Cycle",            value: totalOilInputKg !== null ? fmt(totalOilInputKg, 0) : "Parameter not defined", unit: "kg",          computed: true },
    { label: "Finished Oil / Cycle",               value: finishedOilKg !== null ? fmt(finishedOilKg, 0) : "Parameter not defined", unit: "kg",          computed: true },
    { label: "Semi-finished Oil / Cycle",          value: semiFinishedOilKg !== null ? fmt(semiFinishedOilKg, 0) : "Parameter not defined", unit: "kg",          computed: true },
    { label: "Black Oil / Cycle",                  value: blackOilKgPerCycle !== null ? fmt(blackOilKgPerCycle, 0) : "Parameter not defined", unit: "kg",          computed: true },
    { label: "Burned Oil / Cycle",                 value: burnedOilKgPerCycle !== null ? fmt(burnedOilKgPerCycle, 0) : "Parameter not defined", unit: "kg",          computed: true },
    // Regeneration Off-Gas Flow moved to the dedicated VOC section below.
  ];

  // Step 22: MASS BALANCE — entirely in kg/cycle. Never forced closed.
  //   OTHER_PROCESS_LOSS_KG = INSTALLED_COLUMNS × OTHER_PROCESS_LOSSES (KE)
  //   TOTAL_ACCOUNTED_OUTPUT = finished + semi + black + burned + other
  //   DIFFERENCE = totalAccountedOutput − totalInput
  //   ERROR% = (DIFFERENCE / totalInput) × 100
  //   CLOSED only if |difference| < 1e-6 (floating-point precision only)
  let mb: MassBalance | null = null;
  if (
    totalOilInputKg !== null && finishedOilKg !== null && semiFinishedOilKg !== null &&
    blackOilKgPerCycle !== null && burnedOilKgPerCycle !== null &&
    installedColumns !== null && otherProcessLossesPerCol !== null
  ) {
    const otherProcessLossKg = installedColumns * otherProcessLossesPerCol;
    const totalAccountedOutputKg =
      finishedOilKg + semiFinishedOilKg + blackOilKgPerCycle + burnedOilKgPerCycle + otherProcessLossKg;
    const differenceKg = totalAccountedOutputKg - totalOilInputKg;
    const errorPct = totalOilInputKg > 0 ? (differenceKg / totalOilInputKg) * 100 : 0;
    mb = {
      totalOilInputKg, finishedOilKg, semiFinishedOilKg,
      blackOilKgPerCycle, burnedOilKgPerCycle, otherProcessLossKg,
      totalAccountedOutputKg, differenceKg, errorPct,
      closed: Math.abs(differenceKg) < 1e-6,
    };
  }

  // ── VOC / Regeneration Off-Gas rows ──────────────────────────────────────
  // Built only when INSTALLED_COLUMNS is available (both branches).
  // Deleted KE params 2026-08-09 (no-placeholder policy):
  //   REGEN_VOC_MASS_LOAD, REGEN_SULPHUR_MASS_LOAD,
  //   REGEN_OFFGAS_PEAK_DURATION, REGEN_OFFGAS_PEAK_FACTOR.
  const vocRows: Row[] = [
    // ── KE Basis (echoed from regen_offgas_tox) ──────────────────────────
    {
      label: "Off-Gas Flow Rate (per column)",
      value: regenOffgasFlow !== null ? fmt(regenOffgasFlow, 3) : "Parameter not defined",
      unit: "Nm³/h/column",
    },
    {
      label: "Off-Gas TOX Inlet Temperature",
      value: regenOffgasTemp !== null ? fmt(regenOffgasTemp, 0) : "Parameter not defined",
      unit: "°C",
    },
    {
      label: "Reference Test Column Count",
      value: regenTestColumnCount !== null ? fmt(regenTestColumnCount, 0) : "Parameter not defined",
      unit: "columns",
    },
    {
      label: "Reference Test Skid Count",
      value: regenTestSkidCount !== null ? fmt(regenTestSkidCount, 0) : "Parameter not defined",
      unit: "skids",
    },
    // ── Computed totals ───────────────────────────────────────────────────
    {
      label: "Total Regeneration Off-Gas Flow",
      value: regenOffgasTotalNm3H !== null ? fmt(regenOffgasTotalNm3H, 0) : "Parameter not defined",
      unit: "Nm³/h",
      computed: true,
      emphasis: true,
    },
    {
      label: "Oil Burned per Regeneration",
      value: burnedOilKgPerCycle !== null ? fmt(burnedOilKgPerCycle, 0) : "Parameter not defined",
      unit: "kg/regen",
      computed: true,
    },
    {
      label: "Average Oil Burn Rate",
      value: avgOilBurnRateKgH !== null ? fmt(avgOilBurnRateKgH, 2) : "Parameter not defined",
      unit: "kg/h",
      computed: true,
      emphasis: true,
    },
    // ── Regeneration Sulphur Load — derived (case-specific, never in KE) ────
    {
      label: "Sulphur Retained per Column",
      value: sulphurPerColumn !== null
        ? fmt(sulphurPerColumn, 3)
        : "Not calculated — required KE parameter not defined",
      unit: "kg S/column/regen",
      computed: true,
      tag: "DERIVED",
    },
    {
      label: "Total Sulphur per Regeneration",
      value: totalSulphurPerRegen !== null
        ? fmt(totalSulphurPerRegen, 3)
        : "Not calculated — required KE parameter not defined",
      unit: "kg S/regen",
      computed: true,
      tag: "DERIVED / MASS-BALANCE",
    },
    {
      label: "Average Sulphur Mass Load",
      value: avgSulphurMassLoadKgH !== null
        ? fmt(avgSulphurMassLoadKgH, 3)
        : "Not calculated — required KE parameter not defined",
      unit: "kg S/h",
      computed: true,
      emphasis: true,
      tag: "DERIVED / MASS-BALANCE",
    },
    {
      label: "Theoretical SO₂ Equivalent",
      value: so2EquivalentKgH !== null
        ? fmt(so2EquivalentKgH, 3)
        : "Not calculated — required KE parameter not defined",
      unit: "kg/h",
      computed: true,
      tag: "DERIVED / STOICHIOMETRIC",
      tooltip: "Theoretical SO₂ equivalent assuming all released sulphur is converted to SO₂. This is a mass-balance calculation, not a measured or predicted stack emission.",
    },
    // ── Sulphur Cycle Process Thresholds ─────────────────────────────────────
    {
      label: "Sulphur Diversion Outlet",
      value: sulphurDiversionOutletPpm !== null
        ? fmt(sulphurDiversionOutletPpm, 0)
        : isSulphurBranch
          ? "Not calculated — KE parameter not defined"
          : "N/A — colour scope only",
      unit: "ppm",
      computed: true,
      tag: "DERIVED / PROCESS THRESHOLD",
      tooltip: "Outlet sulphur concentration at which product routing switches from finished to semi-finished. " +
               "Formula: inlet sulphur × SULPHUR_DIVERSION_FACTOR (0.30). " +
               "Approved basis: inlet 1500 ppm → diversion at 450 ppm (450 ÷ 1500). " +
               "Product is routed to finished while outlet < this value.",
    },
    {
      label: "Sulphur Cycle-End Outlet",
      value: sulphurCycleEndOutletPpm !== null
        ? fmt(sulphurCycleEndOutletPpm, 0)
        : isSulphurBranch
          ? "Not calculated — KE parameter not defined"
          : "N/A — colour scope only",
      unit: "ppm",
      computed: true,
      emphasis: true,
      tag: "DERIVED / PROCESS THRESHOLD",
      tooltip: "Outlet sulphur concentration at which the sulphur cycle ends and regeneration is triggered. " +
               "Formula: inlet sulphur × SULPHUR_CYCLE_END_FACTOR (0.667). " +
               "Approved basis: inlet 1500 ppm → cycle-end at ≈ 1000 ppm (1000 ÷ 1500). " +
               "Cycle terminates when outlet ≥ this value OR the colour cycle-end criterion is reached — " +
               "whichever occurs FIRST. The sulphur endpoint does not override an earlier colour endpoint.",
    },
    {
      label: "Peak Sulphur Mass Load",
      value: "Not calculated — peak sulphur release profile not established",
      unit: "kg S/h",
      tag: "NOT DEFINED",
    },
  ];

  // ── Thermal Oxidizer Design Load rows (A–E structure, approved 2026-08-09) ─
  // All sections A–D contain live calculated values.
  // Section E carries a single explicit engineering dependency message.
  // No placeholder rows, no "Not calculated" generics in A–D.
  const tempLabel = regenOffgasTemp !== null ? `${fmt(regenOffgasTemp, 0)} °C` : "—";

  const toxRows: Row[] = [

    // ── A. PROCESS BASIS ──────────────────────────────────────────────────
    { label: "A. PROCESS BASIS", value: "", unit: "", isSubHeader: true },
    {
      label: "Installed CPS Columns",
      value: installedColumns !== null ? fmt(installedColumns, 0) : "Not calculated",
      unit: "columns",
    },
    {
      label: "Reference Test Column Basis",
      value: regenTestColumnCount !== null ? fmt(regenTestColumnCount, 0) : "Not defined",
      unit: "columns",
      tooltip: "KE value: REGEN_TEST_COLUMN_COUNT — the test skid basis from which REGEN_OFFGAS_FLOW was measured.",
    },
    {
      label: "CPS Off-Gas Normalized Flow",
      value: regenOffgasTotalNm3H !== null
        ? fmt(regenOffgasTotalNm3H, 1)
        : "Not calculated — REGEN_OFFGAS_FLOW not defined",
      unit: "Nm³/h",
      computed: true,
      tag: "DERIVED / NORMALIZED",
      tooltip: "Installed columns × REGEN_OFFGAS_FLOW per column. Referenced to 0°C, 1 atm (Normal conditions).",
    },
    {
      label: `CPS Off-Gas Flow @ ${tempLabel} (actual)`,
      value: qActualM3H !== null
        ? fmt(qActualM3H, 0)
        : "Not calculated — REGEN_OFFGAS_TEMP not defined",
      unit: "m³/h",
      computed: true,
      tag: "DERIVED / NORMALIZED",
      tooltip: "Volumetric flow at TOX inlet temperature (isobaric ideal-gas expansion).",
    },
    {
      label: "CPS Off-Gas TOX Inlet Temperature",
      value: regenOffgasTemp !== null ? fmt(regenOffgasTemp, 0) : "Not defined",
      unit: "°C",
    },
    {
      label: "TOX Operating Temperature",
      value: toxOperTemp !== null ? fmt(toxOperTemp, 0) : "Not defined",
      unit: "°C",
    },
    {
      label: "Design Ambient Temperature",
      value: ambientTemp !== null ? fmt(ambientTemp, 0) : "Not defined",
      unit: "°C",
    },

    // ── B. COMBUSTIBLE / CONTAMINANT LOAD ─────────────────────────────────
    { label: "B. COMBUSTIBLE / CONTAMINANT LOAD", value: "", unit: "", isSubHeader: true },
    {
      label: "Calculated CPS VOC Load",
      value: estVocMassLoadKgH !== null ? fmt(estVocMassLoadKgH, 3) : (hbBlockReason ?? "Not calculated"),
      unit: "kg/h",
      computed: true,
      emphasis: true,
      tag: "ENGINEERING ESTIMATE",
      tooltip: "Derived from the TOX preliminary heat balance (50/50 thermal contribution basis, Q_loss = 0). Not sourced from REGEN_VOC_MASS_LOAD — the heat-balance result is the active design input.",
    },
    {
      label: "Calculated CPS VOC Load per Column",
      value: estVocPerColumn !== null ? fmt(estVocPerColumn, 4) : (hbBlockReason ?? "Not calculated"),
      unit: "kg/h/column",
      computed: true,
      tag: "DERIVED / ENGINEERING ESTIMATE",
    },
    {
      label: "Supplementary LPG Burner Fuel",
      value: mLpgKgH !== null ? fmt(mLpgKgH, 3) : (hbBlockReason ?? "Not calculated"),
      unit: "kg/h",
      computed: true,
      tag: "ENGINEERING ESTIMATE",
      tooltip: "50/50 heat-contribution basis: m_LPG = m_VOC × (VOC_LHV / LPG_LHV).",
    },
    {
      label: "Total Combustible Mass (VOC + LPG)",
      value: mCombustibleKgH !== null ? fmt(mCombustibleKgH, 3) : (hbBlockReason ?? "Not calculated"),
      unit: "kg/h",
      computed: true,
      tag: "DERIVED / ENGINEERING ESTIMATE",
    },
    {
      label: "Combustion Air Requirement",
      value: combustionAirNm3H !== null ? fmt(combustionAirNm3H, 1) : (hbBlockReason ?? "Not calculated"),
      unit: "Nm³/h",
      computed: true,
      tag: "DERIVED / ENGINEERING ESTIMATE",
      tooltip: "V_air = COMBUSTION_AIR_REQ × m_combustible = 13 Nm³/kg × total combustible.",
    },
    {
      label: "Combustion Air Mass Flow",
      value: mAirKgH !== null ? fmt(mAirKgH, 1) : (hbBlockReason ?? "Not calculated"),
      unit: "kg/h",
      computed: true,
      tag: "DERIVED",
      tooltip: "m_air = V_air × AIR_DENSITY_N.",
    },
    {
      label: "Average Sulphur Load",
      value: avgSulphurMassLoadKgH !== null
        ? fmt(avgSulphurMassLoadKgH, 3)
        : "Not calculated — SULPHUR_ABS_FACTOR or TIME_REGEN not defined",
      unit: "kg S/h",
      computed: true,
      tag: "DERIVED / MASS-BALANCE",
      tooltip: "Installed columns × MEDIA_WT_PER_COL × SULPHUR_ABS_FACTOR ÷ TIME_REGEN.",
    },
    {
      label: "Theoretical SO₂ Equivalent",
      value: so2EquivalentKgH !== null
        ? fmt(so2EquivalentKgH, 3)
        : "Not calculated — sulphur load not resolved",
      unit: "kg/h",
      computed: true,
      tag: "DERIVED / STOICHIOMETRIC",
      tooltip: "Theoretical SO₂ mass assuming all released sulphur oxidises: S + O₂ → SO₂, ratio 2.0 (mol mass 64/32). This is a mass-balance upper bound, not a measured stack emission.",
    },

    // ── C. THERMAL BALANCE ────────────────────────────────────────────────
    { label: "C. THERMAL BALANCE", value: "", unit: "", isSubHeader: true },
    {
      label: "CPS Carrier-Gas Mass Flow",
      value: mCpsGasKgH !== null ? fmt(mCpsGasKgH, 1) : "Not calculated — AIR_DENSITY_N not defined",
      unit: "kg/h",
      computed: true,
      tag: "DERIVED / ENGINEERING ASSUMPTION",
      tooltip: "m_gas = Q_NM3H × AIR_DENSITY_N. CPS off-gas density approximated using dry-air properties (AIR_DENSITY_N = 1.293 kg/Nm³ at 0°C, 1 atm) — engineering assumption pending validated off-gas composition data.",
    },
    {
      label: "CPS Off-Gas Sensible Duty",
      value: qCpsSensibleMJH !== null
        ? `${fmt(qCpsSensibleMJH, 1)} MJ/h   (${fmt(qCpsSensibleKW!, 1)} kW)`
        : "Not calculated — AIR_DENSITY_N or AIR_CP not defined",
      unit: "",
      computed: true,
      emphasis: true,
      tag: "DERIVED / ENGINEERING ASSUMPTION",
      tooltip: "Q_CPS = m_gas × AIR_CP_kJ × (T_tox − T_inlet). AIR_CP converted from KE kcal/kg·°C to kJ/kg·K (×4.1868). External heat losses excluded — Q_loss = 0, first approved model.",
    },
    {
      label: "Combustion-Air Sensible Duty",
      value: qAirSensibleMJH !== null
        ? `${fmt(qAirSensibleMJH, 1)} MJ/h   (${fmt(qAirSensibleKW!, 1)} kW)`
        : (hbBlockReason ?? "Not calculated"),
      unit: "",
      computed: true,
      tag: "DERIVED",
      tooltip: "Q_air = m_air × AIR_CP_kJ × (T_tox − T_amb).",
    },
    {
      label: "CPS VOC Thermal Contribution",
      value: vocThermalContribKW !== null ? fmt(vocThermalContribKW, 1) : (hbBlockReason ?? "Not calculated"),
      unit: "kW",
      computed: true,
      tag: "ENGINEERING ESTIMATE",
      tooltip: "Q_VOC = m_VOC × VOC_LHV. Equals supplementary burner input by the 50/50 basis.",
    },
    {
      label: "Supplementary Burner Thermal Input",
      value: lpgThermalContribKW !== null ? fmt(lpgThermalContribKW, 1) : (hbBlockReason ?? "Not calculated"),
      unit: "kW",
      computed: true,
      tag: "ENGINEERING ESTIMATE",
      tooltip: "Q_LPG = m_LPG × LPG_LHV. Equals CPS VOC contribution by the 50/50 basis (confirms symmetry).",
    },
    {
      label: "Total Combustible Heat Release",
      value: qTotalMJH !== null
        ? `${fmt(qTotalMJH, 1)} MJ/h   (${fmt(qTotalKW!, 1)} kW)`
        : (hbBlockReason ?? "Not calculated"),
      unit: "",
      computed: true,
      tag: "DERIVED / ENGINEERING ESTIMATE",
      tooltip: "Q_comb = Q_VOC + Q_LPG = 2 × m_VOC × VOC_LHV (50/50 basis, losses excluded).",
    },
    {
      label: "Preliminary TOX Heat Requirement",
      value: qPrelimToxReqMJH !== null
        ? `${fmt(qPrelimToxReqMJH, 1)} MJ/h   (${fmt(qPrelimToxReqKW!, 1)} kW)`
        : (hbBlockReason ?? "Not calculated"),
      unit: "",
      computed: true,
      emphasis: true,
      tag: "PRELIMINARY ENGINEERING ESTIMATE",
      tooltip: "Computed from demand side: Q_CPS_sensible + Q_air_sensible. Numerically equal to Total Combustible Heat Release by heat-balance closure (confirms zero-loss model). External heat losses excluded — first approved model.",
    },

    // ── D. GAS FLOW ───────────────────────────────────────────────────────
    { label: "D. GAS FLOW", value: "", unit: "", isSubHeader: true },
    {
      label: "Preliminary Hot-Gas Reference Flow",
      value: hotGasInputNm3H !== null
        ? fmt(hotGasInputNm3H, 1)
        : (hbBlockReason ?? "Not calculated — combustion air not resolved"),
      unit: "Nm³/h",
      computed: true,
      tag: "PRELIMINARY ENGINEERING ESTIMATE",
      tooltip: "CPS off-gas + combustion air at normal conditions (0°C, 1 atm). Does not yet account for combustion-product volume change — preliminary until validated off-gas composition is available.",
    },
    {
      label: `Preliminary Hot-Gas Flow @ ${toxOperTemp !== null ? fmt(toxOperTemp, 0) : "—"} °C`,
      value: hotGasActualM3H !== null
        ? `${fmt(hotGasActualM3H, 0)}`
        : (hbBlockReason ?? "Not calculated — combustion air not resolved"),
      unit: "m³/h",
      computed: true,
      tag: "PRELIMINARY ENGINEERING ESTIMATE",
      tooltip: "Hot-gas reference flow scaled from normal to TOX operating temperature (isobaric ideal-gas expansion). Combustion-product volume change not yet accounted for.",
    },

    // ── E. FINAL EQUIPMENT SIZING ─────────────────────────────────────────
    { label: "E. FINAL EQUIPMENT SIZING", value: "", unit: "", isSubHeader: true },
    {
      label: "TOX Residence Time",
      value: toxResidenceTime !== null
        ? fmt(toxResidenceTime, 1)
        : "Not defined — TOX_RESIDENCE_TIME not set in KE",
      unit: toxResidenceTime !== null ? "s" : "",
      tag: "DESIGN BASIS",
      tooltip: "Approved Thermopac TOX combustion-gas residence-time design basis at the TOX operating temperature. Source: Knowledge Engine — editable by Superuser.",
    },
    {
      label: "Required Effective Combustion Chamber Volume",
      value: chamberVolumeM3 !== null
        ? fmt(chamberVolumeM3, 3)
        : (hbBlockReason ?? (toxResidenceTime === null
            ? "Not calculated — TOX_RESIDENCE_TIME not defined in KE"
            : "Not calculated — preliminary hot-gas flow not resolved")),
      unit: chamberVolumeM3 !== null ? "m³" : "",
      computed: true,
      emphasis: true,
      tag: "DERIVED / DESIGN",
      tooltip: "Effective combustion-gas residence volume = Preliminary hot-gas flow at TOX operating temperature × TOX residence time ÷ 3600. This is the EFFECTIVE GAS RESIDENCE VOLUME — not the final fabricated furnace shell volume. Final mechanical chamber sizing may include additional allowances for burner flame zone, refractory geometry, dead volume, and design margin when those criteria are approved as KE parameters.",
    },
  ];

  return {
    rows, mb, vocRows, toxRows,
    installedColumns, rawRequiredColumns, requiredMediaKg,
    numberOfSkids, totalCpsFlowLph,
    skidConfig:        skidSelection ? buildSkidConfigString(skidSelection.skids) : null,
    skidCount:         skidSelection?.count         ?? null,
    totalSkidCapacity: skidSelection?.totalCapacity ?? null,
    skidSpareCapacity: skidSelection?.spareCapacity ?? null,
    deltaColour, deltaSulphur,
    columnFillVolumeL, columnFillingTimeH,
    finishedPolishingTimeH, semiFinishedMediaSaturationTimeH,
    vacuumDrainTimeH, heatUpTimeH, regenerationTimeH, coolingTimeH, switchingSettlingTimeH,
    totalCycleTimeH,
    capacityInsufficient,
    sulphurSolveFailed, isSulphurBranch,
    baseOilSg,
  };
}

// ── Provenance badge ─────────────────────────────────────────────────────────
// Coloured chip rendered beside row labels in the VOC and TOX panels.
// tag → colour mapping is exhaustive; unknown tags fall back to grey.
const TAG_COLORS: Record<string, string> = {
  "DERIVED":                          "bg-sky-50 text-sky-700 border-sky-200",
  "DERIVED / MASS-BALANCE":           "bg-purple-50 text-purple-700 border-purple-200",
  "DERIVED / STOICHIOMETRIC":         "bg-indigo-50 text-indigo-700 border-indigo-200",
  "DERIVED / NORMALIZED":             "bg-teal-50 text-teal-700 border-teal-200",
  "DERIVED / ENGINEERING ESTIMATE":   "bg-orange-50 text-orange-700 border-orange-200",
  "DERIVED / ENGINEERING ASSUMPTION": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "ENGINEERING ESTIMATE":             "bg-orange-50 text-orange-700 border-orange-200",
  "PRELIMINARY ENGINEERING ESTIMATE": "bg-rose-50 text-rose-700 border-rose-200",
  "DESIGN BASIS":                     "bg-emerald-50 text-emerald-700 border-emerald-200",
  "DERIVED / DESIGN":                 "bg-cyan-50 text-cyan-700 border-cyan-200",
  "DERIVED / PROCESS THRESHOLD":      "bg-violet-50 text-violet-700 border-violet-200",
  "MASS-BALANCE":                     "bg-purple-50 text-purple-700 border-purple-200",
  "NOT DEFINED":                      "bg-amber-50 text-amber-700 border-amber-200",
};
function ProvenanceBadge({ tag }: { tag: string }) {
  const cls = TAG_COLORS[tag] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-block text-[9px] font-semibold tracking-wide px-1 py-0.5 rounded border leading-none ${cls}`}>
      {tag}
    </span>
  );
}

// Helper: true for any "not computed" display value — drives italic/muted styling.
const isUncalculated = (v: string) =>
  v === "Parameter not defined" || v.startsWith("Not calculated") || v === "Not defined";

// Shared row renderer used by both VOC and TOX tables.
function DataRow({ r }: { r: Row }) {
  if (r.isSubHeader) {
    return (
      <tr className="border-t bg-muted/40">
        <td colSpan={3} className="px-3 py-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          {r.label}
        </td>
      </tr>
    );
  }
  return (
    <tr className={`border-t ${r.emphasis ? "bg-muted/20 font-semibold" : ""}`}>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">{r.label}</span>
          {r.tag && <ProvenanceBadge tag={r.tag} />}
          {r.tooltip && (
            <span title={r.tooltip} className="cursor-help text-muted-foreground/50 hover:text-muted-foreground text-xs select-none">ⓘ</span>
          )}
        </div>
      </td>
      <td className={`px-3 py-1.5 text-right ${isUncalculated(r.value) ? "text-muted-foreground italic text-xs" : "font-medium"}`}>
        {r.value}
      </td>
      <td className="px-3 py-1.5 text-right text-muted-foreground">{r.unit}</td>
    </tr>
  );
}

export default function CpsOutputSizing({ sizingCase }: { sizingCase: SizingCase | null }) {
  const keQ = useQuery<KnowledgeParam[]>({
    queryKey: ["/api/design-software/cps/parameters"],
    queryFn: () => apiRequest("GET", "/api/design-software/cps/parameters") as Promise<KnowledgeParam[]>,
    enabled: sizingCase !== null &&
      (sizingCase.treatment_scope === "COLOUR_ODOR" || sizingCase.treatment_scope === "COLOUR_ODOR_SULPHUR"),
  });

  // Company identity — fetched once and passed to both PDF generators so that
  // no company name is hard-coded in the PDF report module.
  const companyQ = useQuery<{ company: CompanyInfo }>({
    queryKey: ["/api/company/active"],
    queryFn: () => apiRequest("GET", "/api/company/active") as Promise<{ company: CompanyInfo }>,
    staleTime: 5 * 60_000,
  });
  const companyInfo: CompanyInfo | null = companyQ.data?.company ?? null;

  // buildResult — used for UI display only (driven by live keQ.data).
  // PDF generation uses recalculateAndSave() which runs buildRows() independently.
  const buildResult = sizingCase ? buildRows(sizingCase, keQ.data) : null;

  // ── Single isRecalculating guard — shared by all three buttons ────────────
  // Prevents parallel executions and double-clicks on Recalculate / PDF buttons.
  const [isRecalculating, setIsRecalculating] = useState(false);
  const queryClient = useQueryClient();

  // ── recalculateAndSave() — the single source of truth for all three buttons ─
  // Fetches live KE, runs buildRows() ONCE, validates, builds ke_snapshot and
  // calculated_output from that same result, saves them atomically, then returns
  // the result for optional PDF generation.
  //
  // On any failure: returns null; the previous successful DB record is untouched.
  // No PDF is generated when this returns null.
  async function recalculateAndSave(): Promise<RecalcResult | null> {
    if (!sizingCase) return null;

    // Step 1 — Fetch current live KE values.
    const refetchResult = await keQ.refetch();
    if (!refetchResult.isSuccess || !refetchResult.data) return null;

    // Step 2 — ONE and only buildRows() execution for this event.
    const calc = buildRows(sizingCase, refetchResult.data);

    // Step 3 — Validate: null installedColumns means the calculation failed
    //   (undefined KE param, sulphur iteration exhausted, or formula error).
    //   No snapshot or calculated_output is written on failure.
    if (calc.installedColumns === null) return null;

    // Step 4 — Build branch-scoped ke_snapshot from the SAME refetch.
    const scope  = sizingCase.treatment_scope;
    const codes  = scope === "COLOUR_ODOR_SULPHUR" ? KE_CODES_SULPHUR : KE_CODES_COLOUR;
    const ts     = new Date().toISOString();
    const parameters = refetchResult.data
      .filter(p => codes.includes(p.parameter_code))
      .map(p => ({
        parameter_code: p.parameter_code,
        value:          p.value,
        unit:           p.unit,
        parameter_type: p.parameter_type,
        category:       p.category,
      }));
    const keSnapshot = { calculation_timestamp: ts, treatment_scope: scope, parameters };

    // Step 5 — Build calculated_output from the SAME calc object.
    //   schema_version lets future code detect snapshots from older engine versions.
    //   calculation_inputs freezes the exact customer inputs used in this run.
    //   Raw engineering scalars, flags, mass balance, and formatted display rows are
    //   all stored — raw values are authoritative; rows are stored additionally for
    //   exact report reproduction even if display formatting changes later.
    const calculatedOutput = {
      schema_version: 1,
      calculation_timestamp: ts,
      calculation_inputs: {
        treatment_scope:   sizingCase.treatment_scope,
        cps_feed_capacity: sizingCase.cps_feed_capacity,
        rrbo_grade:        sizingCase.rrbo_grade,
        feed_oil_visc_40c: sizingCase.feed_oil_visc_40c,
        inlet_colour:      sizingCase.inlet_colour,
        target_colour:     sizingCase.target_colour,
        inlet_sulphur:     sizingCase.inlet_sulphur,
        target_sulphur:    sizingCase.target_sulphur,
      },
      sizing: {
        requiredMediaKg:                  calc.requiredMediaKg,
        rawRequiredColumns:               calc.rawRequiredColumns,
        installedColumns:                 calc.installedColumns,
        numberOfSkids:                    calc.numberOfSkids,
        totalCpsFlowLph:                  calc.totalCpsFlowLph,
        skidConfig:                       calc.skidConfig,
        skidCount:                        calc.skidCount,
        totalSkidCapacity:                calc.totalSkidCapacity,
        skidSpareCapacity:                calc.skidSpareCapacity,
        deltaColour:                      calc.deltaColour,
        deltaSulphur:                     calc.deltaSulphur,
        columnFillVolumeL:                calc.columnFillVolumeL,
        columnFillingTimeH:               calc.columnFillingTimeH,
        finishedPolishingTimeH:           calc.finishedPolishingTimeH,
        semiFinishedMediaSaturationTimeH: calc.semiFinishedMediaSaturationTimeH,
        vacuumDrainTimeH:                 calc.vacuumDrainTimeH,
        heatUpTimeH:                      calc.heatUpTimeH,
        regenerationTimeH:                calc.regenerationTimeH,
        coolingTimeH:                     calc.coolingTimeH,
        switchingSettlingTimeH:           calc.switchingSettlingTimeH,
        totalCycleTimeH:                  calc.totalCycleTimeH,
        baseOilSg:                        calc.baseOilSg,
      },
      flags: {
        isSulphurBranch:      calc.isSulphurBranch,
        sulphurSolveFailed:   calc.sulphurSolveFailed,
        capacityInsufficient: calc.capacityInsufficient,
      },
      massBalance: calc.mb,
      rows:        calc.rows,
      vocRows:     calc.vocRows,
      toxRows:     calc.toxRows,
    };

    // Step 6 — Atomic DB save: ke_snapshot + calculated_output + calculation_stale=FALSE.
    //   Both columns are written in ONE UPDATE statement.
    //   If this throws, return null — no PDF will be generated and the previous
    //   successful DB record remains exactly as it was.
    try {
      await apiRequest(
        "POST",
        `/api/design-software/cps/sizing-cases/${sizingCase.id}/calculation-snapshot`,
        { treatment_scope: scope, ke_snapshot: keSnapshot, calculated_output: calculatedOutput },
      );
    } catch {
      return null;
    }

    // Step 7 — Invalidate React Query so the parent refetches the updated row
    //   (calculation_stale = FALSE, updated ke_snapshot, updated calculated_output).
    await queryClient.invalidateQueries({ queryKey: ["/api/design-software/cps/sizing-cases"] });

    return { calc, keSnapshot, liveKe: refetchResult.data };
  }

  // Recalculate button — runs recalculateAndSave(), updates UI, no PDF.
  async function handleRecalculate() {
    if (isRecalculating) return;
    setIsRecalculating(true);
    try { await recalculateAndSave(); }
    finally { setIsRecalculating(false); }
  }

  // Customer PDF — recalculates + saves first, then generates PDF from the SAME result.
  async function handleCustomerPdf() {
    if (isRecalculating || !sizingCase) return;
    setIsRecalculating(true);
    try {
      const result = await recalculateAndSave();
      if (result) downloadCustomerPdf(sizingCase, result.calc as PdfSizingResult, companyInfo);
    } finally { setIsRecalculating(false); }
  }

  // Internal PDF — recalculates + saves first, then generates PDF from the SAME result.
  // result.liveKe is passed for name/symbol enrichment only — no numeric values come from it.
  async function handleInternalPdf() {
    if (isRecalculating || !sizingCase) return;
    setIsRecalculating(true);
    try {
      const result = await recalculateAndSave();
      if (result) downloadInternalPdf(sizingCase, result.calc as PdfSizingResult, result.liveKe, companyInfo);
    } finally { setIsRecalculating(false); }
  }

  if (!sizingCase) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900 flex gap-3" data-testid="text-output-save-first">
        <Info className="h-5 w-5 shrink-0 mt-0.5" />
        <div>Save the sizing case first — Output Sizing is generated from the saved Customer Inputs.</div>
      </div>
    );
  }

  const { rows, mb, vocRows, toxRows } = buildResult!;

  // Split rows into themed cards
  const CYCLE_TIME_LABELS = new Set([
    "Column Filling Time",
    "Finished Polishing Time",
    "Semi-finished / Media Saturation Time",
    "Vacuum Drain Time",
    "Heat-up Time",
    "Regeneration Time",
    "Cooling Time",
    "Switching / Settling Time",
    "Total Cycle Time",
  ]);
  const COLUMN_SIZING_LABELS = new Set([
    "Required Media",
    "Raw Required Columns",
    "Installed Columns",
    "Number of 20-Column Modules",
    "Rotating Equipment Skid Configuration",
    "Number of Rotating Equipment Skids",
    "Total Rotating Equipment Capacity",
  ]);
  const CASE_SUMMARY_LABELS = new Set([
    "Required Treatment",
    "Required Capacity",
    "Inlet ASTM Colour",
    "Target ASTM Colour",
    "Inlet Sulphur",
    "Target Sulphur",
    "Governing Sizing Basis",
    "Sulphur Reduction",
    "Colour Reduction",
  ]);
  const isCardLabel = (r: Row) =>
    CYCLE_TIME_LABELS.has(r.label) ||
    COLUMN_SIZING_LABELS.has(r.label) ||
    CASE_SUMMARY_LABELS.has(r.label);
  const mainRows        = rows.filter(r => !isCardLabel(r));
  const cycleRows       = rows.filter(r =>  CYCLE_TIME_LABELS.has(r.label));
  const columnSizRows   = rows.filter(r =>  COLUMN_SIZING_LABELS.has(r.label));
  const caseSummaryRows = rows.filter(r =>  CASE_SUMMARY_LABELS.has(r.label));
  const skidCountLabel  = columnSizRows.find(r => r.label === "Number of Rotating Equipment Skids")?.value ?? "";

  return (
    <div className="space-y-3">
      {/* ── Stale calculation banner ───────────────────────────────────────── */}
      {sizingCase.calculation_stale && sizingCase.calculated_output !== null && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <span>
            Customer inputs were changed after the last successful calculation.
            Click <strong>Recalculate</strong> (or any PDF button) to update.
          </span>
        </div>
      )}

      {/* ── Case Summary (inputs echo + sizing basis) ──────────────────────── */}
      {caseSummaryRows.length > 0 && (
        <div className="border border-rose-200 rounded-lg overflow-hidden bg-rose-50">
          <div className="bg-rose-100 px-3 py-2 text-sm font-medium text-rose-900">Case Summary</div>
          <table className="w-full text-sm">
            <thead className="bg-rose-50/80">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-rose-800">Parameter</th>
                <th className="px-3 py-1.5 text-right font-medium text-rose-800">Value</th>
                <th className="px-3 py-1.5 text-right font-medium text-rose-800 w-28">Unit</th>
              </tr>
            </thead>
            <tbody>
              {caseSummaryRows.map(r => (
                <tr key={r.label} className={`border-t ${r.emphasis ? "bg-rose-100/60 font-semibold" : ""}`}>
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className={`px-3 py-1.5 text-right ${r.computed && r.value === NOT_COMPUTED ? "text-muted-foreground italic" : "font-medium"}`}>
                    {r.value}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Main sizing table ──────────────────────────────────────────────── */}
      <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50">
        <table className="w-full text-sm" data-testid="table-output-sizing">
          <thead className="bg-blue-100 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-blue-900">Output</th>
              <th className="px-3 py-2 font-medium text-right text-blue-900">Value</th>
              <th className="px-3 py-2 font-medium text-right w-32 text-blue-900">Unit</th>
            </tr>
          </thead>
          <tbody>
            {mainRows.map(r => (
              <tr key={r.label} className={`border-t ${r.emphasis ? "bg-muted/30 font-semibold" : ""}`}>
                <td className="px-3 py-1.5">{r.label}</td>
                <td className={`px-3 py-1.5 text-right ${r.computed && r.value === NOT_COMPUTED ? "text-muted-foreground italic" : "font-medium"}`}>
                  {r.value}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Column Sizing ──────────────────────────────────────────────────── */}
      {columnSizRows.length > 0 && (
        <div className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50">
          <div className="bg-indigo-100 px-3 py-2 text-sm font-medium text-indigo-900">Column Sizing</div>
          <table className="w-full text-sm">
            <thead className="bg-indigo-50/80">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-indigo-800">Parameter</th>
                <th className="px-3 py-1.5 text-right font-medium text-indigo-800">Value</th>
                <th className="px-3 py-1.5 text-right font-medium text-indigo-800 w-28">Unit</th>
              </tr>
            </thead>
            <tbody>
              {columnSizRows.map(r => (
                <tr key={r.label} className={`border-t ${r.emphasis ? "bg-indigo-100/60 font-semibold" : ""}`}>
                  <td className="px-3 py-1.5">
                    {r.label === "Total Rotating Equipment Capacity"
                      ? `${skidCountLabel} Rotating Equipment Skids For`
                      : r.label}
                  </td>
                  <td className={`px-3 py-1.5 text-right ${r.computed && r.value === NOT_COMPUTED ? "text-muted-foreground italic" : "font-medium"}`}>
                    {r.value}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cycle Times ────────────────────────────────────────────────────── */}
      {cycleRows.length > 0 && (
        <div className="border border-sky-200 rounded-lg overflow-hidden bg-sky-50">
          <div className="bg-sky-100 px-3 py-2 text-sm font-medium text-sky-900">Cycle Times</div>
          <table className="w-full text-sm">
            <thead className="bg-sky-50/80">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-sky-800">Step</th>
                <th className="px-3 py-1.5 text-right font-medium text-sky-800">Time</th>
                <th className="px-3 py-1.5 text-right font-medium text-sky-800 w-20">Unit</th>
              </tr>
            </thead>
            <tbody>
              {cycleRows.map(r => (
                <tr key={r.label} className={`border-t ${r.emphasis ? "bg-sky-100/60 font-semibold" : ""}`}>
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className={`px-3 py-1.5 text-right ${r.computed && r.value === NOT_COMPUTED ? "text-muted-foreground italic" : "font-medium"}`}>
                    {r.value}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mass Balance Status ────────────────────────────────────────────── */}
      <div className="border border-emerald-200 rounded-lg overflow-hidden bg-emerald-50" data-testid="section-mass-balance">
        <div className="bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900">Mass Balance Status</div>
        {mb === null ? (
          <div className="px-3 py-3 text-sm text-muted-foreground italic">
            Cannot compute — one or more upstream values are undefined.
          </div>
        ) : (() => {
          const pct = (val: number, signed = false): string => {
            if (!mb.totalOilInputKg) return "—";
            const p = (val / mb.totalOilInputKg) * 100;
            const s = signed && p >= 0 ? "+" : "";
            return s + p.toFixed(2) + "%";
          };
          return (
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Stream</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">kg / cycle</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground w-24">% of Input</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t bg-muted/10 font-semibold">
                  <td className="px-3 py-1.5">Total Oil Input</td>
                  <td className="px-3 py-1.5 text-right">{fmt(mb.totalOilInputKg, 0)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">100%</td>
                </tr>
                {([
                  ["Finished Oil",         mb.finishedOilKg],
                  ["Semi-finished Oil",    mb.semiFinishedOilKg],
                  ["Black Oil",            mb.blackOilKgPerCycle],
                  ["Burned Oil",           mb.burnedOilKgPerCycle],
                  ["Other Process Losses", mb.otherProcessLossKg],
                ] as [string, number][]).map(([label, val]) => (
                  <tr key={label} className="border-t">
                    <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmt(val, 0)}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{pct(val)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/20 font-semibold">
                  <td className="px-3 py-1.5">Total Accounted Output</td>
                  <td className="px-3 py-1.5 text-right">{fmt(mb.totalAccountedOutputKg, 0)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{pct(mb.totalAccountedOutputKg)}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground">Mass Balance Difference</td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    {(mb.differenceKg >= 0 ? "+" : "") + fmt(mb.differenceKg, 0)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{pct(mb.differenceKg, true)}</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground">Mass Balance Error</td>
                  <td className="px-3 py-1.5 text-right font-medium" colSpan={2}>
                    {(mb.errorPct >= 0 ? "+" : "") + fmt(mb.errorPct, 2)}%
                  </td>
                </tr>
                <tr className={`border-t font-semibold ${mb.closed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  <td className="px-3 py-2" colSpan={3}>
                    {mb.closed
                      ? "✓ CLOSED"
                      : `✗ NOT CLOSED — Difference ${(mb.differenceKg >= 0 ? "+" : "") + fmt(mb.differenceKg, 0)} kg`}
                  </td>
                </tr>
              </tbody>
            </table>
          );
        })()}
      </div>

      {/* ── VOC / Regeneration Off-Gas ─────────────────────────────────────── */}
      <div className="border border-violet-200 rounded-lg overflow-hidden bg-violet-50" data-testid="section-voc-offgas">
        <div className="bg-violet-100 px-3 py-2 text-sm font-medium text-violet-900">VOC / Regeneration Off-Gas</div>
        <table className="w-full text-sm">
          <thead className="bg-violet-50/80">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-violet-800">Parameter</th>
              <th className="px-3 py-1.5 text-right font-medium text-violet-800">Value</th>
              <th className="px-3 py-1.5 text-right font-medium text-violet-800 w-36">Unit</th>
            </tr>
          </thead>
          <tbody>
            {vocRows.map(r => <DataRow key={r.label} r={r} />)}
          </tbody>
        </table>
      </div>

      {/* ── Thermal Oxidizer Design Load ───────────────────────────────────── */}
      <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50" data-testid="section-tox-design-load">
        <div className="bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">Thermal Oxidizer Design Load</div>
        <table className="w-full text-sm">
          <thead className="bg-amber-50/80">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-amber-800">Parameter</th>
              <th className="px-3 py-1.5 text-right font-medium text-amber-800">Value</th>
              <th className="px-3 py-1.5 text-right font-medium text-amber-800 w-36">Unit</th>
            </tr>
          </thead>
          <tbody>
            {toxRows.map(r => <DataRow key={r.isSubHeader ? `hdr-${r.label}` : r.label} r={r} />)}
          </tbody>
        </table>
      </div>

      {/* ── Recalculate + PDF Downloads ─────────────────────────────────────── */}
      {/* ── Recalculate + PDF Downloads ─────────────────────────────────────── */}
      {/* All three buttons share isRecalculating — disabled together while any  */}
      {/* operation is running.  Each PDF button calls recalculateAndSave() first */}
      {/* and uses the SAME BuildRowsResult for the DB write and the PDF file.   */}
      {/* buildRows() is called exactly once per button click.                   */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          disabled={isRecalculating}
          onClick={handleCustomerPdf}
          data-testid="button-download-customer-pdf"
        >
          <FileText className={`h-4 w-4 mr-2 text-blue-600 ${isRecalculating ? "opacity-50" : ""}`} />
          {isRecalculating ? "Working…" : "Download PDF (Customer)"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={isRecalculating}
          onClick={handleInternalPdf}
          data-testid="button-download-internal-pdf"
        >
          <Lock className={`h-4 w-4 mr-2 text-red-600 ${isRecalculating ? "opacity-50" : ""}`} />
          {isRecalculating ? "Working…" : "Download PDF (Internal)"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={isRecalculating}
          data-testid="button-recalculate-output"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRecalculating ? "animate-spin" : ""}`} />
          {isRecalculating ? "Recalculating…" : "Recalculate"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// V&V Phase B — C2 (llx-process-design) and C3 (llx-hydraulics) Equation Register seed
//
// Source discipline:
//   Every statement and citation below is transcribed from the project's
//   governing Engineering Correlation Register
//   (server/engine-framework/CORRELATION-REGISTER.md, CEL Level 1 v1.0.0),
//   sections 7 (Stage C2, PD-001…PD-008, PD-010) and 8 (Stage C3, HYD-001…HYD-008),
//   plus the Level-1 CEL entries those items delegate to (sections 1–3).
//   PD-009 (Kremser) is retired for Stage C2 and is NOT registered.
//   Nothing is invented: where the register's basis is a definition, identity,
//   governance rule, or screening practice, that is recorded verbatim — no
//   external literature citation is fabricated for such items.
//
// Idempotent: ON CONFLICT (engine_id, equation_ref) DO NOTHING (never overwrites
// evidence already recorded).
//
// Run: npx tsx server/vv/seed-c2-c3-equation-register.ts
// ═══════════════════════════════════════════════════════════════════════════════
import pg from 'pg';

const REG = 'Engineering Correlation Register (server/engine-framework/CORRELATION-REGISTER.md), CEL Level 1 v1.0.0';

interface Entry { ref: string; statement: string; citation: string; unitsNote: string; rangeNote: string }

const C2: Entry[] = [
  {
    ref: 'PD-001', statement: 'Flow basis conversion: ṁ = Q·ρ(T); Q = ṁ/ρ(T) for feed and solvent (normal + maximum). ρ_NMP from EPD library; ρ_RRBO from mandatory source-tagged project-fluid entry (no default correlations).',
    citation: `${REG}, §7 PD-001 — mass conservation identity`,
    unitsNote: 'kg/h, m³/h, kg/m³', rangeNote: 'Universal identity; property validity limited by the source-tagged density entry (referenceTemperatureC / validRangeC).',
  },
  {
    ref: 'PD-002', statement: 'Solvent-to-oil ratio: R_SO = normalSolventMassFlow / feedMassFlow. Basis: normal NMP mass flow / total RRBO feed mass flow (ratioBasis: total_feed_mass; future alternative de_solvated_oil_carrier_mass reserved, never mixed).',
    citation: `${REG}, §7 PD-002 — definition`,
    unitsNote: 'kg/kg', rangeNote: 'Definition; basis string stored with every result.',
  },
  {
    ref: 'PD-003', statement: 'Solvent-flow consistency: relativeDifference = |impliedRatio − enteredRatio| / max(|enteredRatio|, 1e-12); reject > 0.001 (0.1 %). Stores entered flow, entered ratio, implied ratio, absolute & relative difference, acceptance tolerance.',
    citation: `${REG}, §7 PD-003 — input governance`,
    unitsNote: 'dimensionless', rangeNote: 'Acceptance tolerance 0.1 % (RATIO_TOLERANCE = 0.001); exceedance ⇒ calculation_blocked.',
  },
  {
    ref: 'PD-004', statement: 'Design cases: maximumSolventMassFlow = maxCirculationFactor × normalSolventMassFlow. maxCirculationFactor required (warn outside 1.1–1.5). Normal and maximum continuous cases are fully independent balances; split reuse only via explicit applyNormalSplitsToMaximumCase ⇒ CASE_SPLIT_ASSUMPTIONS_REUSED + maximum case Pending Validation.',
    citation: `${REG}, §7 PD-004 — design practice`,
    unitsNote: 'kg/h', rangeNote: 'maxCirculationFactor ≥ 1.0 enforced; 1.1–1.5 typical screening band (warning only).',
  },
  {
    ref: 'PD-005', statement: 'Phase configuration: controlled inputs rrbo_continuous_nmp_dispersed | nmp_continuous_rrbo_dispersed. Continuity from engineer input ONLY; density gives buoyancy direction (lighter/heavier phase) and Δρ = |ρ_NMP − ρ_RRBO|. Δρ = 0 → Not Calculable; Δρ < 30 kg/m³ → LOW_DENSITY_DIFFERENCE.',
    citation: `${REG}, §7 PD-005 — governance rule`,
    unitsNote: 'kg/m³', rangeNote: 'Δρ = 0 ⇒ Not Calculable; Δρ < 30 kg/m³ ⇒ warning.',
  },
  {
    ref: 'PD-006', statement: 'Three-pseudo-component balance: oilCarrier = F(1−x_F); solute = F·x_F; soluteToExtract = r·F·x_F; soluteToRaffinate = (1−r)·F·x_F; nmpToRaffinate = s_L·S; nmpToExtract = (1−s_L)·S; oilToExtract = o_L·F(1−x_F); oilToRaffinate = (1−o_L)·F(1−x_F); R and E by summation; verify F + S = R + E with absolute & relative closure error. No zero defaults: any of x_F, r, s_L, o_L missing ⇒ only gross inlet balance F + S calculated; outlet split Pending Validation. Zero loss only as explicit source-tagged entry, stored in the assumptions register.',
    citation: `${REG}, §7 PD-006 — screening mass balance; approved hand calc F=5000, S=7500, x_F=0.30, r=0.90, s_L=0.02, o_L=0.01 → R=3765, E=8735, closure 0.0 kg/h`,
    unitsNote: 'kg/h', rangeNote: 'x_F ∈ (0,1); r, s_L, o_L ∈ [0,1]; closure warning above 1e-9 relative.',
  },
  {
    ref: 'PD-007', statement: 'Yield definitions: grossRaffinateToFeedRatio = R/F; grossExtractToFeedRatio = E/F; solventFreeRaffinateYield = (oilToRaffinate+soluteToRaffinate)/F; recoveredOilCarrierYield = oilToRaffinate/oilCarrierInFeed; extractedSoluteRecovery = soluteToExtract/soluteInFeed; solventRecoveryToExtract = nmpToExtract/S; nmpCarryoverToRaffinate = nmpToRaffinate/S. Solvent-containing stream ratios are never presented as product yields.',
    citation: `${REG}, §7 PD-007 — definitions`,
    unitsNote: 'dimensionless', rangeNote: 'Denominator guards: oilCarrierInFeed > 0 and soluteInFeed > 0 else null.',
  },
  {
    ref: 'PD-008', statement: 'Extraction factor (definition only): A = m·S/F (symbol A — never E or ε). m = engineer-supplied, source-tagged equilibrium solute distribution ratio with mandatory metadata (numerator phase, denominator phase, concentration basis, temperature, sourceType, sourceReference). Incomplete basis or Assumed source ⇒ Pending Validation. Never used to predict recovery in Stage C2.',
    citation: `${REG}, §7 PD-008 — definition (Treybal, Mass-Transfer Operations, 3rd ed., for the group definition)`,
    unitsNote: 'dimensionless', rangeNote: 'm > 0 enforced; solventBasis = normal case.',
  },
  {
    ref: 'PD-010', statement: 'Preliminary Stage-Equivalent Estimate: estimatedPhysicalStages = ceil(theoreticalStages / compartmentOrStageEfficiency). Labelled Preliminary Stage-Equivalent Estimate — NOT an ECP packing-stage or ECR compartment count (those engines compute their own active height/compartment count).',
    citation: `${REG}, §7 PD-010 — screening practice`,
    unitsNote: 'dimensionless (stage count)', rangeNote: 'theoreticalStages integer ≥ 1 (warn > 20); efficiency ∈ (0,1] (warn < 0.2).',
  },
];

const C3: Entry[] = [
  {
    ref: 'HYD-001', statement: 'Geometry & superficial velocities: A = π·D²/4; u = Q/A per phase per case. RRBO ρ and μ are mandatory source-tagged project-fluid entries (calculation-scoped context); NMP ρ, μ from the EPD library. Flow basis / solvent-consistency rules identical to PD-001/PD-003.',
    citation: `${REG}, §8 HYD-001 — definitions (delegates to CEL HYD-GEO-001 A = π·D²/4, geometry; HYD-USF-001 u = Q/A, definition)`,
    unitsNote: 'm², m/s', rangeNote: 'D > 0; solvent-consistency acceptance 0.1 %.',
  },
  {
    ref: 'HYD-002', statement: 'Phase-dependent velocity assignment: engineer-selected configuration ONLY (continuity never from density): RRBO-continuous → u_c = u_RRBO, u_d = u_NMP; NMP-continuous → u_c = u_NMP, u_d = u_RRBO. Flow-ratio definition R = u_c/u_d and phase names stored in every result. Δρ ≈ 0 → blocked; Δρ < 30 kg/m³ → LOW_DENSITY_DIFFERENCE.',
    citation: `${REG}, §8 HYD-002 — governance rule`,
    unitsNote: 'dimensionless (R), kg/m³ (Δρ)', rangeNote: 'Δρ ≈ 0 ⇒ calculation_blocked.',
  },
  {
    ref: 'HYD-003', statement: 'Droplet-size treatment: NO droplet-size prediction (technology-specific — deferred to ECP/ECR). Sauter mean d₃₂ is an optional engineer-supplied source-tagged input. Warning band is configurable and source-tagged; without a defensible reference it is labelled User-defined screening range (no citation invented). Assumed d₃₂ ⇒ Pending Validation.',
    citation: `${REG}, §8 HYD-003 — governance rule`,
    unitsNote: 'm', rangeNote: 'd₃₂ ∈ (0, 0.1] m enforced.',
  },
  {
    ref: 'HYD-004', statement: 'Rigid-sphere terminal-velocity screening: CEL terminalVelocitySphere force balance u_t = √(4·g·d·|Δρ|/(3·Cd·ρc)) with piecewise Cd: 24/Re (Stokes, Re < 0.1); (24/Re)(1 + 0.15·Re^0.687) (0.1 ≤ Re < 1000); 0.44 (10³ ≤ Re ≤ 2×10⁵, warns beyond). Isolated-droplet SCREENING value only — every result carries RIGID_SPHERE_SCREENING. Independent of interfacial tension.',
    citation: `${REG}, §8 HYD-004 via §2 CEL entries — HYD-CD-001 Stokes (1851); HYD-CD-002 Schiller & Naumann, Z. Ver. Dtsch. Ing. 77 (1933); HYD-CD-003 standard Newton-regime constant; HYD-UT-001 Clift, Grace & Weber, Bubbles, Drops and Particles (1978), rigid-sphere baseline`,
    unitsNote: 'm/s', rangeNote: 'Cd pieces valid per regime; Re > 2×10⁵ (drag crisis) warned. NOT a validated liquid-drop terminal velocity.',
  },
  {
    ref: 'HYD-005', statement: 'Shape-regime indicators: Eo = Δρ·g·d²/σ, Mo = g·μc⁴·Δρ/(ρc²·σ³), We = ρc·u_t²·d/σ — indicators only, no drop-drag correlation applied. Require engineer-entered source-tagged NMP/RRBO interfacial tension. Missing IFT ⇒ these items Not Calculable; it never blocks area, velocities, Δρ, terminal velocity, or holdup with an independent u_K. Eo > 40 → EOTVOS_ABOVE_RIGID_SPHERE_RANGE.',
    citation: `${REG}, §8 HYD-005 via §1 CEL entries — DIM-EO-001 standard definition (Bond); DIM-MO-001 standard definition (Grace diagram group); DIM-WE-001 standard definition`,
    unitsNote: 'dimensionless', rangeNote: 'Pure definitions — no drop-shape or liquid-drop drag correlation implemented or claimed.',
  },
  {
    ref: 'HYD-006', statement: 'Generic slip model: u_slip(φ) = u_K·(1−φ)^n. u_K (characteristic swarm/slip velocity) and n (hindrance exponent) BOTH engineer-supplied source-tagged — no defaults; n = 1 permitted only as an explicit Assumed entry (ASSUMED_HINDRANCE_EXPONENT, Pending Validation), NOT a universal LLE relationship. Rigid-sphere u_t may be reused as provisional u_K only via explicit option (CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING; all holdup/throughput Pending Validation). No u_K basis ⇒ holdup items Not Calculable, everything else proceeds.',
    citation: `${REG}, §8 HYD-006 — generic screening form; u_K and n require experimental/vendor validation`,
    unitsNote: 'm/s (u_K), dimensionless (n, φ)', rangeNote: 'u_K ∈ (0, 10] m/s; n ∈ (0, 10]; moderate-holdup applicability limit φ ≤ 0.60. VERIFICATION/VALIDATION SPLIT (directive 2026-08-06): verification evidence on this entry covers correct IMPLEMENTATION of u_slip = u_K·(1−φ)^n only. Validation/calibration of u_K and n for the RRBO/NMP system is a separate engineering-confidence item — correct coding of the equation shall not validate the project-specific values. Rev 0 u_K is a provisional rigid-sphere reuse and remains Pending Validation regardless of software verification status.',
  },
  {
    ref: 'HYD-007', statement: 'Counter-current holdup & root selection: CEL slip balance u_d/φ + u_c/(1−φ) = u_slip(φ) solved on CONFIGURABLE bounds (default φ ∈ [0.005, 0.60]; bounds stored in snapshot). ALL roots returned and classified (lower operating candidate / upper approach-to-limit). Preliminary operating branch = lowest root below φ* only when inside bounds AND isolated from every other root by the configured tolerance (default 0.02, stored); otherwise AMBIGUOUS_HOLDUP_BRANCH + Pending Validation, no silent choice. Interfacial area a = 6·φ/d₃₂ ONLY from an established (non-ambiguous) operating holdup.',
    citation: `${REG}, §8 HYD-007 — screening practice (delegates to CEL HYD-SLIP-001 counter-current kinematic identity; HYD-HOLD-001 numerical utility, scan + bisection; HYD-IA-001 Sauter-mean definition)`,
    unitsNote: 'dimensionless (φ), m²/m³ (a)', rangeNote: 'Bounds configurable in (0,1); upper bound > 0.60 flagged outside moderate-holdup applicability.',
  },
  {
    ref: 'HYD-008', statement: 'Generic throughput sensitivity & diameter sweep: u_d(φ) = u_K·(1−φ)^(n+1)·φ/((1−φ)+R·φ) maximized per case per diameter at THAT case\'s ratio (CEL golden-section; normal and maximum cases fully independent). Percentage of Generic Hydraulic Throughput Maximum vs a CONFIGURABLE screening band (default 40–80 %, stored, explicitly "not a universal engineering rule"). Sweep returns CLASSIFICATIONS: hydraulically infeasible / above band / within band / below minimum loading band, plus minimum feasible diameter and screening-band diameter range. NO recommended diameter — selectedTrialDiameter is echoed only when engineer-chosen.',
    citation: `${REG}, §8 HYD-008 — screening practice (delegates to CEL HYD-FMAX-001 numerical utility, golden-section; NUM-GSM-001)`,
    unitsNote: '%, m', rangeNote: 'Sweep 0 < min < max, step > 0, ≤ 200 points; ≥ 100 % of generic maximum ⇒ hydraulically_infeasible.',
  },
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let inserted = 0, skipped = 0;
    for (const [engineId, entries] of [['llx-process-design', C2], ['llx-hydraulics', C3]] as const) {
      for (const e of entries) {
        const res = await pool.query(
          `INSERT INTO vv_equation_register (engine_id, equation_ref, statement, source_citation, units_note, valid_range_note, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
           ON CONFLICT (engine_id, equation_ref) DO NOTHING`,
          [engineId, e.ref, e.statement, e.citation, e.unitsNote, e.rangeNote],
        );
        if (res.rowCount === 1) { inserted++; console.log(`  + ${engineId}:${e.ref}`); }
        else { skipped++; console.log(`  = ${engineId}:${e.ref} (exists, untouched)`); }
      }
    }
    console.log(`Done. Inserted ${inserted}, skipped ${skipped}.`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

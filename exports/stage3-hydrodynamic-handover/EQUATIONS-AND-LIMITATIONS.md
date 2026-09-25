# Equations, source mapping and limitations

This guide describes existing implementation; it does not introduce or change formulas. Authoritative executable expressions are the unmodified files under `source/server/ecr-pre-pilot/`. File SHA256 in `provenance.json` identifies the exact implementation.

## Calculation chain

1. `stage1.ts`, `makeStage1HydrodynamicProcessBasis`: converts saved physical inputs and mass-ratio flow basis to SI. No property fitting or temperature extrapolation.
2. `rrbo-wetnmp-hydraulic-p1.ts`, `evaluateRrboHydraulicTrial`: area A=πD²/4; n=RPM/60; rotor power P=1.2 ρc n³ Dr⁵; ε=P/(ρc A hc); tip speed πDr n. Np=1.2 is a fixed engineering assumption. Rotor Reynolds=ρc n Dr²/μc.
3. Conditional Sauter-mean proxy d32=C32(σ/ρc)^0.6 ε^-0.4, with mandatory C32=0.36,0.42,0.43. This is not a validated Hinze maximum stable diameter to d32 conversion.
4. `dragCoefficient`: two mandatory interface hypotheses: Barry–Parlange mobile and Schiller–Naumann immobile. SN uses Cd=24/Re(1+0.15 Re^0.687); the full BP viscosity/density-ratio expression is in source. Neither scenario is established as the actual interface condition.
5. Terminal force balance: Cd(Re) Re²=(4/3)Ar; Ar=ρc(ρd−ρc)g d32³/μc², g=9.80665 m/s². Speeds are positive magnitudes; denser dispersed wet NMP is signed downward. Density is not swapped to accommodate a lighter-dispersed formula.
6. Garthe characteristic-speed correction uses source power number 1.08+10.94/sqrt(Re_rotor)+257.37/Re_rotor^1.5 and the source geometry correction in the kernel. This source power number is distinct from fixed engineering Np=1.2.
7. `swarmSpeeds`: Cd(Re_swarm) v_swarm² = Cd(Re0) v0² (1−φ)^4.65. Slip=v_swarm/(1−φ), not v_swarm. Garthe Eq.8.3 terminology refers to superficial swarm speed; confusing it with slip changes the holdup closure.
8. Countercurrent closure: jd/φ + jc/(1−φ)=slip(φ). Capacity is the maximum total superficial flux at fixed jd/jc, solved along φ. Loading=(jc+jd)/capacity. Find operating roots and track dilute-connected lower branch over 16 flow steps. Interfacial area a=6φ/d32.
9. Acceptance in P1: all six scenarios have connected lower roots and loading≤0.70, tip≤4.5 m/s. Numerical policy uses 512 holdup mesh intervals, 70 bisections, 60 capacity refinements and 16 continuation steps. These are implementation assumptions, not literature qualification thresholds.
10. `automatic-hydraulic-selection.ts`: validate source integrity and eligibility; per diameter choose minimum worst-six loading, with RPM/hc/rotor/free-area tie-breaks. Drop dominated area/loading references; normalize loading reduction and area growth to global endpoints; maximize interior chord departure with 32×Number.EPSILON tie tolerance. If none is resolved choose smallest eligible diameter. This is a discrete grid-dependent policy, not a cost optimum or proof of physical superiority. No RPM-window acceptance criterion is added.

## Source attribution and scope

Original resolver source explicitly labels Garthe (2005) Eqs.5.6–5.7 for characteristic velocity and Eq.8.3 for swarm closure. Related legacy drag citations in resolver modules include Myint et al. (2006); those older branches are **not** the P1 BP/SN drag choice. P1 function/scenario names identify Barry–Parlange and Schiller–Naumann. The package does not include copyrighted papers and does not claim independent primary-literature equation transcription verification or new validation. Unprovided DOI, page citations and experimental datasets are not fabricated.

The P1 source reports extrapolation relative to Garthe maximum column D=0.152 m, rotor=0.085 m, compartment=0.072 m and a source continuous-viscosity maximum=0.00161 Pa·s. Current RRBO is 0.0598 Pa·s. Source ratios are diagnostics, not safety factors. Legacy dependency code and presentation source preserve original historical-method definitions for traceability; they do not supply current project evidence.

## Non-negotiable limitations

- PREPILOT_EXTRAPOLATED_METHOD; PROVISIONAL_SAVED_40C; not SN300 grade-validated or final design.
- Spherical-drop validity, rotor turbulence, SN correlation range, actual interface mobility, phase inversion, entrainment and disengagement remain UNKNOWN.
- Eötvös, Weber, Reynolds and Ohnesorge are diagnostics, not invented acceptance thresholds.
- Lower quasi-steady admissibility does not establish dynamic stability; numerical residual closure does not establish model validity.
- Capacity turning point is not observed flooding. Six scenarios are a conditional envelope, not a statistical confidence interval.
- d32, holdup and interfacial area do not determine sulfur removal, mass-transfer coefficient, residence-time adequacy, HETS, total height, stage count or recovery. Saved sulfur/composition targets are preserved but not predicted by this replay.
- Scale-up, actual wet-solvent properties, contamination-dependent interface behavior, coalescence and mechanical details require separate evidence and pilot qualification before engineering release.
- No Stage-2 rerun, full optimizer orchestration, application authorization, saved Stage-3 result, Stage-4 promotion, database write or publishing action occurs.
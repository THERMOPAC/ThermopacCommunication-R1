Relevant governed/audit records found (read-only; no optimizer/scripts run):

Core Project 236 drag audit:
- `research/kuhni-drag-architecture-audit.md` (complete negative qualification; lines 61-74 persisted basis, 79-127 Barry Eq.10 and auxiliaries, 176-212 dimensionless/shape equations, 214-238 fixed grid, 242-275 Grace limits, 307-334 Garthe/Stichlmair compatibility, 336-350 d32, 388-424 final gate/status, 431-460 reproducibility/sources).
- `research/kuhni_drag_architecture_audit.py` (terminal force balance, Grace sensitivity, Barry calculations; functions around lines 133-205).
- `research/kuhni_drag_architecture_results.csv` (exact 0.5–5.0 mm numerical mapping).
- `research/kuhni-drag-shape/notes.md` (research scope explicitly X=33.6, Mo≈2.86e-9, Re_t≤50 blocker; all mapping checklist items remain pending).
- `research/sources.json`; `research/sources/terminal-velocity-review-pmc.md`; `research/sources/terminal-velocity-review-raw.html`; `research/kuhni-drag-shape/sources/` (Garthe, Stichlmair, Grace/Wairegi/Nguyen, Wellek, Loth, Henschke-related primary/source material).
- `.agents/outputs/garthe-2005-review/garthe-kuhni-review.md`, `garthe-evidence-audit.md`, `paper.txt`, `topic-index.txt`; `.agents/memory/garthe-kuhni-swarm-boundary.md`.

Project 236 persisted inputs: rhoC=1006 kg/m3, rhoD=862, muC=0.00125 Pa·s, muD=0.042, sigma=0.0106 N/m, T=50°C, X=33.6, P=0.856858846918489, Mo=2.860287330808981e-9. Equations: Eo=(rhoC-rhoD)g d²/sigma; terminal force Cd Re²=(4/3)sqrt(Eo³/Mo); Barry Eq10 Cd(Re,X,P); Wellek aspect ratio a/b=1+0.163 Eo^0.757; Garthe/Stichlmair Eq8.3 vs/vo=sqrt[(Cd,o(Reo)/Cd,o(Res))(1-h)^4.65]. d32 interpretation: Calabrese d32=Σ(n_i d_i³)/Σ(n_i d_i²), representative equivalent-volume diameter only.

Exact terminal-state table from `research/kuhni_drag_architecture_results.csv` (Barry spherical kernel; Grace is independent sensitivity, not swarm Cd):
|d mm|Eo|Barry Re_t|Barry Cd|U_t m/s|We|Grace Re|Grace U m/s|Wellek a/b|
|0.5|0.0333056|4.315673|8.136034|0.010724834|0.00545812|—|—|1.012409|
|1.0|0.1332224|20.703441|2.828230|0.025724952|0.0628060|26.2513|0.032618410|1.035440|
|1.47|0.2878803|47.060587|1.738750|0.039778833|0.2207565|59.7652|0.050517619|1.063505|
|1.75|0.4079936|67.839028|1.411740|0.048167444|0.3853340|82.6738|0.058700516|1.082690|
|2.0|0.5328897|89.608022|1.207803|0.055670988|0.5882744|104.7972|0.065107608|1.101217|
|2.5|0.8326401|142.277554|0.935723|0.070714490|1.1864487|153.3750|0.076230111|1.141897|
|3.0|1.1990017|207.162575|0.762678|0.085802922|2.0961267|207.2400|0.085834997|1.187005|
|4.0|2.1315586|373.792674|0.555288|0.116113529|5.118206|329.1249|0.102238118|1.289076|
|5.0|3.3305604|590.001630|0.435315|0.146620683|10.201231|425.6358|0.105774311|1.405260|

Characteristic/swarm outputs: no Project-236/X=33.6 characteristic or swarm-slip numerical point exists in the drag-architecture CSV. The only archived hydraulic sweep is `research/kuhni_hydraulic_screen_results.csv`, but it is a different immutable basis (muD/muC=63.6255, QD=0.00111111111111, QC=0.000474492001729, dR/D=0.5, hc/D=0.5, phi_s=0.35). Its first/latest rows give (GARTHE_STICHLMAIR, 60→12.202 rpm, D=1.635615 m, d32=0.864682 mm, vt=0.020323 m/s, Re_t=10.843379, vchar=0.007207 m/s, Re_char=3.845341) and (300→20.000 rpm, D=8.714453 m, d32=0.210688 mm, vt=0.002103, Re_t=0.273390, vchar=0.000470, Re_char=0.061040). These must not be presented as Project 236 X=33.6 results.

Garthe/Stichlmair source boundary: `.agents/memory/garthe-kuhni-swarm-boundary.md` states Eq 5.6 is characteristic-velocity candidate only (does not predict d32 or terminal velocity); swarm model uses single-particle drag plus implicit holdup; validation used measured average Sauter diameter and reported 23.5% error; no independently replayed Kühni flooding envelope; dimensioning requires tests. `garthe-kuhni-review.md` records vrs=vd/hd+vc/(1-hd), vs=vrs(1-hd), Richardson–Zaki vs/vo=(1-hd)^n, drag closure Cd,s/Cd,o=(1-hd)^-4.65 and Eq8.3.

Latest D/RPM point: no uniquely governed Project-236 D/RPM record was found. Metadata (`.agents/agent_assets_metadata.toml` around descriptions near lines 646, 794-816) references a latest persisted ECR-2 diagnostic with D=0.60 m, H=0.279375 m, but its actual report/data file is not present under workspace paths. Needed mapping inputs: authoritative D, rotor/stator geometry, compartment height, stator free area, rotor power number/rotor Re, RPM, phase superficial velocities/flow rates, holdup/flood fraction, and the intended d32. Also required for a governed deformed-drop closure: RRBO/NMP single-drop shape/terminal data or fitted Henschke/ReDrop parameters and a Cd(Re,Eo,Mo,X,P,shape,interface) valid at terminal, characteristic, and every swarm-slip root. Current final status is RESEARCH HOLD / DEPENDENCY_BLOCKED; optimizer rerun explicitly prohibited.
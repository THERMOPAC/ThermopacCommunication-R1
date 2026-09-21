# Terminal stator → jet/return → quiet disengagement → raffinate

**FIRST conditional calculation, not a simple gravity settler or calibrated pipeline solver. PASS mathematics / HOLD actual performance.** Ø700 ×1600 top reservation, application, DB, saved records and all old deliverables remain unchanged. No equipment or coalescer is selected.

## Frozen basis and assumptions

Inherited Qc=3.82179423 m³/h, d32=6.068 mm; RRBO 869 kg/m³, 0.0598 Pa·s; NMP 1015 kg/m³, 0.001416 Pa·s; sigma=0.011 N/m; g=9.80665 m/s². Active Ø700 ×4200, 20 ×210 compartments, Ø231 rotor, 30 rpm, Np=1.2 and existing bottom reservation are not changed or requalified.

Top-local datum is the terminal/active-top boundary, with exact stator face needing mechanical confirmation: calming z=0–200 mm, distributor 200–300, quiet 300–900, outlet opening 900–970, CL935. The shell height 1600 mm is not a settling travel length. No jet-decay length, hole diameter, aperture count or residence time is deduced from open area.

Assumed uniform opening-local alpha and DSD, not actual terminal DSD: number ln(d/mm)~N(muN,s²), muN=ln(6.068)−2.5s²; volume muV=ln(6.068)+0.5s². Widths .35/.44 are conditional donor transfers, not measured target widths; .7/1 are broad analyst stresses. The inherited compartment mean is not a measured opening-local mean; unresolved fine modes remain unknown. No selected-trial holdup is transferred.

## First calculation and units

A=0.384845100 m²; open fraction=0.4; U=2.75853716 mm/s; nominal dilute Uj=U/0.4=6.89634289 mm/s. This is a carrier-only mean scale, not a two-phase velocity field.

pVlocal=phi((ln(d/mm)−muV)/s)/(s*d_mm) [1/mm].
Jj(d)=A*0.4*alpha*pVlocal*max(Uj−vt,0) [m³/s/mm].
**Kj=0.4 integral pVlocal*max(Uj−vt,0) dd [m/s]** is full-area referenced; Kopening=Kj/0.4 is opening-area referenced. Qgross=A*alpha*Kj; pVj=pVlocal*max(Uj−vt,0)/Kopening. d32j=1/integral(pVj/d)dd. Weighting is gross upcrossing **volume**, not number or local inventory.

Exact inherited SN bulk root=1.45534318 mm; calculated mean-jet root=2.33917138 mm, Re=0.234422602. SN is an inherited isolated spherical immobile-interface assumption, not terminal-flow validation.

- I: vt<U, d<bulk root: eligible for persistent mean bulk upflow, not guaranteed outlet.
- II: U≤vt<Uj: opening-lifted but bulk-settling eligible; not automatically returned.
- III: vt≥Uj: zero mean-jet upcrossing weight, not proof that actual turbulence cannot lift it.

| s | Kj m/s | Kj/U | Qgross m³/h per alpha | I volume % | II volume % | d32j mm | dV10/50/90 mm |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.35 | 8.48029851e-7 | 0.000307420130 | 0.00117489648 | 2.22130419 | 97.7786958 | 1.94308895 | 1.66889860/2.00358801/2.22312181 |
| 0.44 | 0.00000521229918 | 0.00188951567 | 0.00722134008 | 9.43553971 | 90.5644603 | 1.80085034 | 1.46664263/1.88406292/2.17750915 |
| 0.7 | 0.0000437045700 | 0.0158433864 | 0.0605501626 | 38.7425658 | 61.2574342 | 1.43233312 | 1.01523235/1.58219701/2.05313197 |
| 1 | 0.0000964289232 | 0.0349565431 | 0.133596715 | 59.8263552 | 40.1736448 | 1.09978573 | 0.687202228/1.32284335/1.93592389 |

Per-alpha coefficients are not actual flow or ppm. Alpha is unknown; at alpha=0 no physical cohort exists.

### Gross upcrossing volume CDF (fractions)

| s | cutoff mm | local volume CDF | gross jet CDF | gross jet survival |
|---:|---:|---:|---:|---:|
| 0.35 | 0.500000000 | 1.36655268e-13 | 4.24948433e-10 | 1.00000000 |
| 0.35 | 1.00000000 | 5.00584435e-8 | 0.000135134185 | 0.999864866 |
| 0.35 | 1.45500000 | 0.0000104493599 | 0.0221515274 | 0.977848473 |
| 0.35 | 1.45534318 | 0.0000104808731 | 0.0222130419 | 0.977786958 |
| 0.35 | 2.08100000 | 0.000613220153 | 0.644283104 | 0.355716896 |
| 0.35 | 2.33917138 | 0.00187463677 | 1.00000000 | 0.00000000 |
| 0.44 | 0.500000000 | 1.89476519e-9 | 9.60532944e-7 | 0.999999040 |
| 0.44 | 1.00000000 | 0.00000787984482 | 0.00349858264 | 0.996501418 |
| 0.44 | 1.45500000 | 0.000264616194 | 0.0941877283 | 0.905812272 |
| 0.44 | 1.45534318 | 0.000265144134 | 0.0943553971 | 0.905644603 |
| 0.44 | 2.08100000 | 0.00399812106 | 0.779586579 | 0.220413422 |
| 0.44 | 2.33917138 | 0.00850625966 | 1.00000000 | 0.00000000 |
| 0.7 | 0.500000000 | 0.0000450214579 | 0.00273843492 | 0.997261565 |
| 0.7 | 1.00000000 | 0.00171810274 | 0.0937367544 | 0.906263246 |
| 0.7 | 1.45500000 | 0.00842342750 | 0.387132865 | 0.612867135 |
| 0.7 | 1.45534318 | 0.00843115772 | 0.387425658 | 0.612574342 |
| 0.7 | 2.08100000 | 0.0301339021 | 0.917122047 | 0.0828779527 |
| 0.7 | 2.33917138 | 0.0434704130 | 1.00000000 | 0.00000000 |
| 1 | 0.500000000 | 0.00136694188 | 0.0379129427 | 0.962087057 |
| 1 | 1.00000000 | 0.0106386040 | 0.270197595 | 0.729802405 |
| 1 | 1.45500000 | 0.0269261227 | 0.598011721 | 0.401988279 |
| 1 | 1.45534318 | 0.0269407923 | 0.598263552 | 0.401736448 |
| 1 | 2.08100000 | 0.0581865608 | 0.957182815 | 0.0428171851 |
| 1 | 2.33917138 | 0.0730796328 | 1.00000000 | 0.00000000 |

Rounded 1.455 mm is a reporting cutoff, not the exact class boundary. All CDFs at/above the jet root equal one.

## Comparison to earlier full-bore kernel — NOT matched-plane closure

| s | earlier Kfull m/s | Kj/Kfull | earlier Kfull/U |
|---:|---:|---:|---:|
| 0.35 | 3.72548984e-9 | 227.629087 | 0.00000135053096 |
| 0.44 | 1.32406479e-7 | 39.3658921 | 0.0000479988022 |
| 0.7 | 0.00000744418673 | 5.87096637 | 0.00269859940 |
| 1 | 0.0000327490102 | 2.94448359 | 0.0118718757 |

Both calculations stipulate the same local DSD and alpha, but at different idealized planes with different speeds and areas. Their ratio is a conditional diagnostic, **not** an entrance-to-outlet transmission or a mass loss. The prior full-bore-selected cohort has no class II; it cannot simply be equated to the downstream product of this opening-selected cohort. Concentration redistribution, inventories, returns, supply and recrossings must close that connection.

## Deceleration is not a return mechanism

For an illustrative overdamped trajectory dz/dt=u(z)−vt, if u decreases monotonically from above vt to below vt, an equilibrium z* with u(z*)=vt has u'(z*)<0: below it motion is upward, above it downward. It is a **stable levitation/trapping point**, not a 1-D stall followed by permanent return. Reaching a low-velocity downward path requires cross-stream escape, recirculation or another justified mechanism. Inertia, turbulence and changing size may alter this, but none is closed here.

Nor may Uj be gradually reduced as a full-bore axial mean at fixed A and Qc: that violates continuity. Real jet deceleration involves spreading and entrainment with spatial return/compensating flow; cross-sectional carrier flux remains Qc under the nominal assumptions. Open fraction alone fixes neither spatial topology nor escape probability. No fabricated u(z), hole size or decay correlation is used.

## Cohort-conserving pipeline ledger

- **status:** Conserving architecture ready for closures; not a calibrated solver
- **rate_units:** m3/s of tagged dispersed NMP at fixed reference density; I is m3, dI/dt is m3/s
- **opening:** Qgross = A*alpha*Kj = Qfirst + Qreup; gross crossing events need not be unique supplied volume
- **jet_zone:** dIjet/dt = Qgross - Rjet - Tjq + Tqj
- **quiet_and_withdrawal_zone:** dIquiet/dt = Tjq - Tqj - Rquiet - Qout
- **total:** d(Ijet+Iquiet)/dt = Qfirst + Qreup - Rjet - Rquiet - Qout
- **definitions:** Rjet and Rquiet are actual downward fluxes across the external lower return boundary, distinguished by route; Tjq/Tqj are internal jet/quiet exchanges, which cancel. Return-path inventory is included in its originating zone until boundary crossing. Qout is actual raffinate interception, not arrival at a whole-plane proxy.
- **unique_pulse_absorbing_return:** V0 = Vreturned_jet(t)+Vreturned_quiet(t)+Vout(t)+Ijet(t)+Iquiet(t), initially zero downstream inventory; stop each tag at its first external exit. For re-entry track the same tag, not a new cohort.
- **optional_conditional:** For noninteracting unchanged-diameter tags, rI,rII are probabilities of irreversible jet return. Given no jet return, qk,ok,ik are quiet-return, outlet and residual-inventory fractions with qk+ok+ik=1. Rjet/V0=sum wk*rk; Rquiet/V0=sum wk*(1-rk)*qk; Vout/V0=sum wk*(1-rk)*ok; I/V0=sum wk*(1-rk)*ik. No probabilities or rates assigned.
- **survival:** Sk(t)=1-FjetReturn,k(t)-FquietReturn,k(t)-Fout,k(t) for mutually exclusive absorbing first exits. Survival includes trapped and transiting volume, not removal.
- **transformations:** Coalescence/breakup require volume-conserving size-transition operators and tagged-volume mixing, not disappearance sinks. Initial class labels track origin, not current size.
- **separate_sources:** Fresh distributor NMP has a separate ledger/source Ffresh and its own DSD; do not use the fresh feed rate as Qfirst, Qgross or alpha. Dissolved NMP requires separate species/phase-transfer balances.
- **turbulence:** Actual gross flux is integral over opening area of E[alpha(d,x,t)*max(uz-vt,0)] dd dA, with matching downward crossings. Mean positive-part replacement omits velocity/concentration correlations and recrossings; do not add an invented turbulence factor.

These are control-volume identities, not fitted rates. Internal jet/quiet exchange cancels exactly. If quiet-return droplets pass back through the jet control volume, represent that leg as Tqj and count external return once in Rjet, not again in Rquiet. Redefine route inventories consistently when changing boundaries. Sustained input with trapping can accumulate; do not silently impose steady state.

For independent tags the optional fractions sum to one algebraically because rk+(1−rk)(qk+ok+ik)=1. With coalescence, carry tagged NMP volume through size changes and mixed-source drops; origin labels must not be reassigned by current diameter. Coalescence itself conserves NMP volume and is not successful removal. Fresh distributor solvent, dissolved solvent and repeatedly crossing terminal-origin solvent have distinct source/accounting roles.

## Two explicit ideal scenarios, not calibrated bounds

| s | II all return / I all outlet: outlet % | return % | outlet m³/h per alpha | no return / all outlet % | no-return outlet m³/h per alpha |
|---:|---:|---:|---:|---:|---:|
| 0.35 | 2.22130419 | 97.7786958 | 0.0000260980247 | 100 | 0.00117489648 |
| 0.44 | 9.43553971 | 90.5644603 | 0.000681372411 | 100 | 0.00722134008 |
| 0.7 | 38.7425658 | 61.2574342 | 0.0234586866 | 100 | 0.0605501626 |
| 1 | 59.8263552 | 40.1736448 | 0.0799260452 | 100 | 0.133596715 |

The first is optimistic class-II removal with zero final inventory and class-I survival=1. It is not a rigorous lower outlet bound: class I can also return or coalesce into return-eligible sizes. The second is the trivial all-volume outlet ceiling for a unique, isolated, conserved cohort with no other source and zero final inventory; it is not attainable in unchanged-drop uniform bulk flow for class II without additional transport. Together these are **not a validated physical bracket**. At finite time neither scenario resolves accumulated volume, and a gross event denominator can count the same NMP repeatedly. No actual transmission, removal efficiency or absolute carryover is established.

## Closure requirements and checks

Needed: actual opening geometry and position; local alpha/DSD and joint size-resolved velocities; spatially continuous jet/return field and cross-stream exchange; terminal first-entry versus recrossing tagging; distributor source and evolution; volume-conserving coalescence/breakup; quiet-zone dispersion and inventory; actual lateral nozzle interception; irreversible return versus re-entrainment; representative interface properties and agreed carryover criterion. No new literature-access claim is made.

Numerical checks PASS: log-diameter Jacobian, local normalization and inverse-volume d32, nonnegative supported kernel, 101-point CDF monotonicity, CDF complements and refined values, flux percentiles/inverse moment refinement, exact root force balance, I+II=1, scenario volume balance, A*0.4*Uj=Qc, Qgross/(alpha*Qc)=Kj/U, previous full-bore coefficient reproduction. Simpson 2048/4096/8192 panels; maximum coarse/refined relative error=3.35032369e-9. Lower support −16 extended to −18; omitted Kj/U≤6.41351920e-58. These checks validate arithmetic, not physical closure.

359 pre-existing deliverables SHA-256 verified unchanged; hashes and residuals retained in JSON. Run `node deliverables/kuhni-terminal-chain.mjs` from repository root; Node built-ins only, writes only its new JSON/Markdown. No application, DB, network or workflow access. Architecture and conservation are ready for evidence-based closures; **not a calibrated solver, equipment selection or hydraulic/fabrication release**.

# Offline upward transported DSD — conditional, not outlet certification

**700 × 1600 mm remains the unchanged top reservation. No app, DB, saved design, old deliverable or PDF is changed.** This resolves the next mathematical question: under specified local lognormal hypotheses, how does upward slip selection change the DSD? It does not establish the actual terminal population or solve the actual 700-mm carryover problem.

## Classifications and basis

I = inherited fixed inputs; A = assumptions; C = calculated conditional results; E = reporting choices. All tables are C conditional on A, not predictions. Inputs [I]: d32=6.068 mm (calculated compartment mean, not measured local top mean), Qc=3.82179423 m³/h, RRBO rho=869 kg/m³ and mu=0.0598 Pa·s, NMP rho=1015 kg/m³ and mu=0.001416 Pa·s, sigma=0.011 N/m, g=9.80665 m/s². At 700 mm, U=2.75853716 mm/s.

Number-lognormal [A]: ln(d/1 mm) ~ N(muN,s²), muN=ln(6.068)-2.5s²; volume-lognormal muV=ln(6.068)+0.5s². Widths .35/.44 are conditional transfers from Oliveira et al. (2008), DOI 10.1590/S0104-66322008000400010, as audited in the prior investigation. Neither is a fitted target width. Widths .70/1 are deliberately broad sensitivities. Donor local photographs are not upward flux measurements; no sub-500 µm completeness or target transfer has been established.

## Transport definition and units

pVlocal(d)=phi((ln(d/mm)-muV)/s)/(s*d_mm), normalized per mm. Jup(d)=alpha*pVlocal(d)*max(U-vt(d),0). K_up=integral pVlocal*max(U-vt,0) dd [m/s]; pVup=Jup/(alpha*K_up). Flux percentiles are volume-flux weighted, not local volume or number weighted. d32up=1/integral(pVup/d)dd, not the inherited 6.068 mm.

U=Qc/A is the inherited nominal dilute approximation, not Qc/[A*(1-alpha)]. Alpha is the unknown local dispersed volume fraction, assumed uniform across the plane. Qup=A*alpha*K_up and ppmv=Qup/Qc*1e6=alpha*(K_up/U)*1e6. The denominator is **continuous flow**, not total dispersion. No fresh solvent flow is used as source load or holdup.

## 700-mm SN results

Exact zero-net root **1.455343178360020 mm**, not the reporting cutoff 1.455 mm. At 2.081 mm the upward CDF is exactly one because it exceeds that root; this is not a capture guarantee. No factor-of-two design velocity screen is applied to the one-way physical crossing kernel.

| s | K_up m/s | K_up/U | dV10 mm | dV50 mm | dV90 mm | d32up mm | ppmv per 1 vol% alpha ONLY |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.35 | 3.72548984e-9 | 0.00000135053096 | 1.12125923 | 1.29490923 | 1.40136230 | 1.26440303 | 0.0135053096 |
| 0.44 | 1.32406479e-7 | 0.0000479988022 | 1.00217933 | 1.22946445 | 1.37759820 | 1.18590449 | 0.479988022 |
| 0.7 | 0.00000744418673 | 0.00269859940 | 0.714210029 | 1.05029324 | 1.30752600 | 0.966461839 | 26.9859940 |
| 1 | 0.0000327490102 | 0.0118718757 | 0.490243101 | 0.884646623 | 1.23617626 | 0.754666749 | 118.718757 |

The last column is **illustrative scaling per 1 vol% local holdup, NOT actual holdup or actual ppm**. Multiply that column by alpha/0.01 only if an applicable local alpha becomes established. At alpha=0 no physical flux exists. For K_up=0 normalized flux statistics would be undefined; none of these assumed full-support lognormal cases has K_up=0.

### CDFs as fractions, not percentages

| s | cutoff mm | local volume CDF | upward flux CDF | upward survival above cutoff |
|---:|---:|---:|---:|---:|
| 0.35 | 0.5 | 1.36655268e-13 | 9.00470688e-8 | 0.999999910 |
| 0.35 | 1 | 5.00584435e-8 | 0.0213025526 | 0.978697448 |
| 0.35 | 1.455 | 0.0000104493599 | 0.999994617 | 0.00000538295532 |
| 0.35 | 2.081 | 0.000613220154 | 1.00000000 | 0.00000000 |
| 0.35 | 1.45534318 (exact root) | 0.0000104808731 | 1.00000000 | 0.00000000 |
| 0.44 | 0.5 | 1.89476519e-9 | 0.0000353177008 | 0.999964683 |
| 0.44 | 1 | 0.00000787984483 | 0.0980607708 | 0.901939230 |
| 0.44 | 1.455 | 0.000264616194 | 0.999997462 | 0.00000253781913 |
| 0.44 | 2.081 | 0.00399812106 | 1.00000000 | 0.00000000 |
| 0.44 | 1.45534318 (exact root) | 0.000265144134 | 1.00000000 | 0.00000000 |
| 0.7 | 0.5 | 0.0000450214579 | 0.0151682460 | 0.984831754 |
| 0.7 | 1 | 0.00171810274 | 0.420816418 | 0.579183582 |
| 0.7 | 1.455 | 0.00842342750 | 0.999999339 | 6.61052172e-7 |
| 0.7 | 2.081 | 0.0301339021 | 1.00000000 | 0.00000000 |
| 0.7 | 1.45534318 (exact root) | 0.00843115772 | 1.00000000 | 0.00000000 |
| 1 | 0.5 | 0.00136694188 | 0.106373311 | 0.893626689 |
| 1 | 1 | 0.0106386040 | 0.644803646 | 0.355196354 |
| 1 | 1.455 | 0.0269261227 | 0.999999715 | 2.85172448e-7 |
| 1 | 2.081 | 0.0581865608 | 1.00000000 | 0.00000000 |
| 1 | 1.45534318 (exact root) | 0.0269407923 | 1.00000000 | 0.00000000 |

The tiny nonzero survival above rounded 1.455 mm is integrated directly, not lost by reporting the rounded cutoff as the exact root. Large normalized fine fractions can coexist with extremely small flux mass. Conversely, widening the assumed local DSD raises available fine volume greatly; neither width is known for this service.

## Mobility diagnostic — EXTRAPOLATION, not validation

Myint et al. 2006 DOI 10.1299/jfst.1.72 Eq.9 clean C/mu=0: CD=24/Re*(2+3lambda)/(3*(1+lambda))*(1+0.15Re^0.687). EXTRAPOLATION: lambda=0.02368 below tested 0.1; contributing Re and Eo also partly below tested ranges (0.17<Re<200, 0.017<Eo<12.1). Not validation or guaranteed bound. Correct creeping limit is HR, v/Stokes=3*(1+lambda)/(2+3lambda).

The calculation uses that published finite-Re form, not an unlabelled HR speed at finite Re. SN remains the unchanged base. These sensitivities do not validate either clean interfaces or spherical drops; no mobility or swarm bound is claimed.

| s | model | root mm | root Re | root Eo | K_up/U | dV10/50/90 mm | d32up mm | ppmv per 1 vol% ONLY |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.35 | clean EXTRAPOLATION | 1.19354643 | 0.0478450211 | 0.185421242 | 8.38568870e-8 | 0.941251827/1.07381892/1.15355487 | 1.05078214 | 0.000838568870 |
| 0.44 | clean EXTRAPOLATION | 1.19354643 | 0.0478450211 | 0.185421242 | 0.00000752158614 | 0.846714033/1.02303062/1.13537621 | 0.989735807 | 0.0752158614 |
| 0.7 | clean EXTRAPOLATION | 1.19354643 | 0.0478450211 | 0.185421242 | 0.00113849735 | 0.610932174/0.879914838/1.08032120 | 0.814299697 | 11.3849735 |
| 1 | clean EXTRAPOLATION | 1.19354643 | 0.0478450211 | 0.185421242 | 0.00711484742 | 0.422245407/0.743764785/1.02262724 | 0.640410820 | 71.1484742 |

All clean-model CDFs and per-alpha flux coefficients are retained in JSON.

## Larger area: same assumed local DSD and alpha, no geometry selection

| diameter mm [E] | s [A] | U mm/s | SN root mm | K_up/U | Qup m³/h per 1 vol% ONLY | ppmv per 1 vol% ONLY |
|---:|---:|---:|---:|---:|---:|---:|
| 700 | 0.35 | 2.75853716 | 1.45534318 | 0.00000135053096 | 5.16145143e-8 | 0.0135053096 |
| 700 | 0.44 | 2.75853716 | 1.45534318 | 0.0000479988022 | 0.00000183441545 | 0.479988022 |
| 700 | 0.7 | 2.75853716 | 1.45534318 | 0.00269859940 | 0.000103134916 | 26.9859940 |
| 700 | 1 | 2.75853716 | 1.45534318 | 0.0118718757 | 0.000453718660 | 118.718757 |
| 900 | 0.35 | 1.66874470 | 1.12713186 | 3.56858849e-8 | 1.36384109e-9 | 0.000356858849 |
| 900 | 0.44 | 1.66874470 | 1.12713186 | 0.00000426994293 | 1.63188433e-7 | 0.0426994293 |
| 900 | 0.7 | 1.66874470 | 1.12713186 | 0.000878238070 | 0.0000335644519 | 8.78238070 |
| 900 | 1 | 1.66874470 | 1.12713186 | 0.00611159878 | 0.000233572730 | 61.1159878 |
| 1000 | 0.35 | 1.35168321 | 1.01317689 | 6.75374449e-9 | 2.58114217e-10 | 0.0000675374449 |
| 1000 | 0.44 | 1.35168321 | 1.01317689 | 0.00000141848657 | 5.42116379e-8 | 0.0141848657 |
| 1000 | 0.7 | 1.35168321 | 1.01317689 | 0.000530703303 | 0.0000202823882 | 5.30703303 |
| 1000 | 1 | 1.35168321 | 1.01317689 | 0.00455445325 | 0.000174061832 | 45.5445325 |
| 1200 | 0.35 | 0.938668894 | 0.842978251 | 3.10289998e-10 | 1.18586452e-11 | 0.00000310289998 |
| 1200 | 0.44 | 0.938668894 | 0.842978251 | 1.86095092e-7 | 7.11217148e-9 | 0.00186095092 |
| 1200 | 0.7 | 0.938668894 | 0.842978251 | 0.000211770060 | 0.00000809341595 | 2.11770060 |
| 1200 | 1 | 0.938668894 | 0.842978251 | 0.00267731479 | 0.000102321462 | 26.7731479 |

These are conditional transport sensitivities at 900/1000/1200 mm with the SAME local DSD and alpha, not a recalculated steady population or a recommendation. A real area change changes flow, spatial holdup, supply and coalescence, which this model does not solve.

## Numerical verification (PASS means mathematics only)

- Integration uses standardized log diameter z=(ln d-muV)/s with pV dd=phi(z)dz. Physical local support is (0,infinity); numerical lower z=-16 excludes less than 6.41351920e-58 local volume and K_up/U. Extending to -18 agrees. No donor detection limit is imposed as a physical minimum.
- Upward support is explicitly truncated at the exact model vt=U root; no unresolved corner is integrated across. Every CDF above the root is exactly one.
- Compensated composite Simpson with 2048/4096/8192 panels checks refinement; maximum coarse/refined relative K error 1.52833836e-8. CDFs, percentiles and inverse moments are also checked against refined quadrature.
- Number moments 0–3, local d32, volume inverse moment, full local normalization and prior local CDFs agree. vt=0 gives K_up/U=1, pVup=pVlocal and d32up=6.068 mm. Reference normal tails include z=-8 without cancellation.
- Upward normalization, complement CDF integrals, positive bounded coefficients and percentiles, 1001-point finite nonnegative density/speed and monotonic CDF scans pass in every case. Increasing area lowers K_up/U for each identical local DSD; clean extrapolation lowers it relative to SN. Exact 700 SN root agrees with the inherited physics JSON.
- 353 pre-existing deliverable files were hashed and verified unchanged. JSON contains provenance hashes and check residuals. No application module, database, workflow or network was accessed.

## What can be concluded about the actual problem?

The upward transported population is a strongly selected fine subset, not a local snapshot volume DSD, and its mean is not 6.068 mm. The calculated conditional flux varies strongly with the unmeasured tail width. This makes local d32 alone insufficient to certify or reject the 700-mm top.

This is an instantaneous **one-way plane crossing** calculation for a stipulated snapshot concentration and velocity, not steady outlet escape. Selective depletion/return, resupply, fresh-feed droplet formation, turbulent crossings, residence time, coalescence, breakup and nonuniform flow are not closed. No assigned capture grade efficiency or absolute carryover is inferred. Required next evidence: applicable local/plane DSD and alpha, size-resolved upward velocity or flux, feed/drop supply and quiet-zone evolution, plus an agreed carryover specification. Retain the reservation and performance HOLD; neither enlargement nor a coalescer is selected.

## Reproduction and sources

Run `node deliverables/kuhni-upward-transport-dsd.mjs` from repository root. Node built-ins only; writes only this prefix's JSON and Markdown. Sources are the inherited investigation/physics generators and JSON, latest DSD moment/literature/coalescence reports and drag evidence; hashes are in JSON. No new literature-access claim is made.

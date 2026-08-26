# Step 4 — Independent Thermodynamic Proof-of-Concept

Generated: 2026-08-26T03:12:44.205Z

## Executive conclusion

This proof establishes a reproducible research engine and a quantitative baseline, but it does **not** yet qualify the sulfur model for Stage 8. The direct-data-calibrated **NRTL** route improves the admitted hydrocarbon benchmarks relative to fixed predictive priors. The calibrated UNIQUAC comparator has lower conditional errors on some successful flashes but frequently misses the measured two-phase split, so it is a documented failed comparator rather than an overall improvement. Held-out performance remains materially worse than in-sample performance and the current evidence has no raw thiophene/benzothiophene/DBT tie-line table. BT/DBT/heavy-sulfur results are therefore predictive-only envelopes.

The architecture is credible for continued pre-pilot research because it preserves method separation, direct-data calibration boundaries, held-out validation, phase-topology failures, and uncertainty. It is not yet credible as a release-ready physical LLE foundation until the direct sulfur datasets are retrieved/admitted and a real COSMO-RS/COSMO-SAC implementation replaces the descriptor proxy.

## Scope and evidence

- Coto 2022 Table 3: 17 controlled NMP/hydrocarbon tie-lines at 298.15 K; 17 rows retained.
- NMP/hydrocarbon multi-temperature records: 219 rows from Fahim (2005), Fandary (2006), and Aljimaz (2006), spanning 289,293.2,298,303.2,308,313.2,318,323.2,328 K.
- All benchmark rows are direct two-phase experimental rows with normalized phase compositions and recorded composition uncertainty.
- Coto source: B. Coto, I. Suárez, M.J. Tenorio, S. Nieto, N. Alvarez, J.J. Espada, "Extraction of aromatic and polyaromatic compounds with NMP: Experimental and model description", Fluid Phase Equilibria 554 (2022) 113293, Table 3.
- The admitted benchmark/feed basis contains SAT, MONO, DI, POLY, and NMP only; no separate sulfur-bearing polar/heteroaromatic component is present.
- Sulfur feed mass fractions/speciation are not available, so an actual sulfur-removal mass balance is `NOT_CALCULABLE_NO_FEED_SULFUR_COMPONENT`.
- No raw Mguni/thiophene, heptane/thiophene, Murata DBT, or other sulfur tie-line table is present in the admitted workspace; those sources cannot be scored against experiment here.

## Method contract

| Method | Use in this proof | Data fitted before scoring? |
|---|---|---:|
| COSMO-SAC descriptor proxy | Fixed polarity/aromaticity/size molecular-surface prior | No |
| Modified UNIFAC Dortmund group proxy | Fixed group-contrast prior | No |
| Direct NRTL | NRTL binary interactions fitted only to the stated training rows; multi-temperature scopes use `τ(T)=τ₀+b(1/T−1/T₀)` | Yes |
| Direct UNIQUAC | UNIQUAC residual interactions fitted only to the stated training rows; multi-temperature scopes use the same residual temperature form and fixed representative r/q values | Yes |

The first two methods are explicitly **proxies**, not full COSMO-RS or Dortmund database implementations. They are useful for proving the comparison and provenance machinery, not for claiming molecular-level validation.

## Pure predictive benchmark

Pure predictive mode is run before calibration. Phase recall is the fraction of experimental two-phase rows for which the predicted flash converges to a non-trivial two-phase split. Composition RMSD covers both phases and all components.

| scope | model | n | phaseRecall | compRMSD | NMP_xR_RMSE | HC_yE_RMSE | lnK_RMSE | aromaticSel_ln_RMSE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Coto2022 17 tie-lines | COSMO_SAC_DESCRIPTOR_PROXY | 17 | 1 | 0.15446 | 0.07786 | 0.40274 | 2.59697 | 0.56243 |
| fahim2005 | COSMO_SAC_DESCRIPTOR_PROXY | 106 | 1 | 0.16099 | 0.2734 | 0.15143 | 2.3022 | — |
| fandary2006 | COSMO_SAC_DESCRIPTOR_PROXY | 78 | 1 | 0.14825 | 0.2536 | 0.13866 | 2.18021 | — |
| aljimaz2006 | COSMO_SAC_DESCRIPTOR_PROXY | 35 | 1 | 0.18217 | 0.33569 | 0.11322 | 2.20228 | — |
| Coto2022 17 tie-lines | MODIFIED_UNIFAC_DORTMUND_PROXY | 17 | 1 | 0.16753 | 0.09099 | 0.43935 | 4.95275 | 2.10278 |
| fahim2005 | MODIFIED_UNIFAC_DORTMUND_PROXY | 106 | 1 | 0.17153 | 0.2853 | 0.17443 | 3.78286 | — |
| fandary2006 | MODIFIED_UNIFAC_DORTMUND_PROXY | 78 | 1 | 0.15927 | 0.2656 | 0.16216 | 3.67951 | — |
| aljimaz2006 | MODIFIED_UNIFAC_DORTMUND_PROXY | 35 | 1 | 0.19316 | 0.35053 | 0.13806 | 3.6775 | — |

Interpretation:

- `lnK_RMSE` is the RMSE of ln(K_pred/K_exp), so zero is exact and 0.693 is approximately a factor-of-two error.
- NMP-in-raffinate and hydrocarbon-in-extract metrics directly test mutual solubility, rather than assuming one phase is pure solvent or pure hydrocarbon.
- Aromatic selectivity is evaluated against the available MONO/DI/POLY aromatic components. Experimental thiophenic selectivity is not scored because no raw sulfur tie-line system is admitted.
- Predictive failures are retained. This run recorded 0 predictive failed/single-phase cases across the reported scopes; they are not imputed.

## Direct-data calibration

The calibrated models fit isoactivity residuals using only the direct rows in each reported training scope. Calibration metrics are deliberately reported separately from cross-validation metrics.

| scope | model | n | phaseRecall | compRMSD | NMP_xR_RMSE | HC_yE_RMSE | lnK_RMSE | aromaticSel_ln_RMSE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Coto2022 17 tie-lines calibration | NRTL_DIRECT_CALIBRATED | 17 | 1 | 0.02498 | 0.03223 | 0.03179 | 0.22376 | 0.32393 |
| Coto2022 17 tie-lines calibration | UNIQUAC_DIRECT_CALIBRATED | 17 | 0 | — | — | — | — | — |
| fahim2005 calibration | NRTL_DIRECT_CALIBRATED | 106 | 1 | 0.07152 | 0.11475 | 0.05759 | 0.55697 | — |
| fahim2005 calibration | UNIQUAC_DIRECT_CALIBRATED | 106 | 0.03774 | 0.04309 | 0.07332 | 0.01514 | 0.49014 | — |
| fandary2006 calibration | NRTL_DIRECT_CALIBRATED | 78 | 1 | 0.07265 | 0.12513 | 0.03845 | 0.50514 | — |
| fandary2006 calibration | UNIQUAC_DIRECT_CALIBRATED | 78 | 0.29487 | 0.02888 | 0.04977 | 0.008 | 0.31855 | — |
| aljimaz2006 calibration | NRTL_DIRECT_CALIBRATED | 35 | 1 | 0.06908 | 0.12342 | 0.03435 | 0.4875 | — |
| aljimaz2006 calibration | UNIQUAC_DIRECT_CALIBRATED | 35 | 0 | — | — | — | — | — |

Fit records:

| model | scope | trainingRows | objective |
| --- | --- | --- | --- |
| NRTL_DIRECT_CALIBRATED | Coto2022 17 tie-lines | 17 | 81280.94883 |
| UNIQUAC_DIRECT_CALIBRATED | Coto2022 17 tie-lines | 17 | 93139.37647 |
| NRTL_DIRECT_CALIBRATED | fahim2005 | 106 | 398552.54403 |
| UNIQUAC_DIRECT_CALIBRATED | fahim2005 | 106 | 115759.42338 |
| NRTL_DIRECT_CALIBRATED | fandary2006 | 78 | 245992.2591 |
| UNIQUAC_DIRECT_CALIBRATED | fandary2006 | 78 | 90187.4189 |
| NRTL_DIRECT_CALIBRATED | aljimaz2006 | 35 | 25743.11901 |
| UNIQUAC_DIRECT_CALIBRATED | aljimaz2006 | 35 | 10799.91007 |

Calibration reduces equilibrium residuals by construction. It is not evidence of predictive skill by itself.

The UNIQUAC route must also reproduce phase topology. Its lower conditional composition error is not used to claim success when the flash predicts a single phase for a measured two-phase row; those failures are retained in the phase-recall column.

## Held-out validation

For the multi-temperature systems, each source is evaluated using leave-one-temperature-out fitting. A held-out temperature is never used to fit the reported prediction. A leave-one-system-out comparison is also included where the component basis is shared; its purpose is diagnostic and it is not a substitute for sulfur-family validation.

| scope | model | n | phaseRecall | compRMSD | NMP_xR_RMSE | HC_yE_RMSE | lnK_RMSE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fahim2005 LOTO 289 K | NRTL_DIRECT_CALIBRATED | 10 | 1 | 0.04885 | 0.08301 | 0.03966 | 0.45084 |
| fahim2005 LOTO 289 K | UNIQUAC_DIRECT_CALIBRATED | 10 | 0.1 | 0.02576 | 0.04407 | 0.00702 | 0.38106 |
| fahim2005 LOTO 298 K | NRTL_DIRECT_CALIBRATED | 18 | 1 | 0.05196 | 0.08633 | 0.0338 | 0.54617 |
| fahim2005 LOTO 298 K | UNIQUAC_DIRECT_CALIBRATED | 18 | 0.05556 | 0.03192 | 0.04587 | 0.03087 | 0.73893 |
| fahim2005 LOTO 308 K | NRTL_DIRECT_CALIBRATED | 28 | 1 | 0.06291 | 0.10836 | 0.04246 | 0.5105 |
| fahim2005 LOTO 308 K | UNIQUAC_DIRECT_CALIBRATED | 28 | 0.03571 | 0.06634 | 0.11566 | 0.0003 | 0.43556 |
| fahim2005 LOTO 318 K | NRTL_DIRECT_CALIBRATED | 27 | 1 | 0.07898 | 0.11579 | 0.08247 | 0.62857 |
| fahim2005 LOTO 318 K | UNIQUAC_DIRECT_CALIBRATED | 27 | 0.07407 | 0.04389 | 0.07628 | 0.00184 | 0.3076 |
| fahim2005 LOTO 328 K | NRTL_DIRECT_CALIBRATED | 23 | 1 | 0.11237 | 0.18601 | 0.08056 | 0.80362 |
| fahim2005 LOTO 328 K | UNIQUAC_DIRECT_CALIBRATED | 23 | 0 | — | — | — | — |
| fandary2006 LOTO 298 K | NRTL_DIRECT_CALIBRATED | 20 | 1 | 0.04444 | 0.07747 | 0.01603 | 0.44686 |
| fandary2006 LOTO 298 K | UNIQUAC_DIRECT_CALIBRATED | 20 | 0.15 | 0.04538 | 0.0796 | 0.0049 | 0.44775 |
| fandary2006 LOTO 308 K | NRTL_DIRECT_CALIBRATED | 20 | 1 | 0.06426 | 0.1145 | 0.02489 | 0.44807 |
| fandary2006 LOTO 308 K | UNIQUAC_DIRECT_CALIBRATED | 20 | 0.25 | 0.02633 | 0.04541 | 0.00658 | 0.25298 |
| fandary2006 LOTO 318 K | NRTL_DIRECT_CALIBRATED | 20 | 1 | 0.07662 | 0.13242 | 0.04207 | 0.53726 |
| fandary2006 LOTO 318 K | UNIQUAC_DIRECT_CALIBRATED | 20 | 0.2 | 0.01496 | 0.02484 | 0.00688 | 0.15699 |
| fandary2006 LOTO 328 K | NRTL_DIRECT_CALIBRATED | 18 | 1 | 0.11587 | 0.1971 | 0.0618 | 0.74592 |
| fandary2006 LOTO 328 K | UNIQUAC_DIRECT_CALIBRATED | 18 | 0.05556 | 0.05702 | 0.09876 | 0.0005 | 0.46487 |
| aljimaz2006 LOTO 293.2 K | NRTL_DIRECT_CALIBRATED | 10 | 0.8 | 0.08181 | 0.14196 | 0.06312 | 0.84328 |
| aljimaz2006 LOTO 293.2 K | UNIQUAC_DIRECT_CALIBRATED | 10 | 0 | — | — | — | — |
| aljimaz2006 LOTO 303.2 K | NRTL_DIRECT_CALIBRATED | 9 | 1 | 0.06626 | 0.12244 | 0.00384 | 0.31929 |
| aljimaz2006 LOTO 303.2 K | UNIQUAC_DIRECT_CALIBRATED | 9 | 0 | — | — | — | — |
| aljimaz2006 LOTO 313.2 K | NRTL_DIRECT_CALIBRATED | 8 | 1 | 0.07932 | 0.1435 | 0.03477 | 0.57277 |
| aljimaz2006 LOTO 313.2 K | UNIQUAC_DIRECT_CALIBRATED | 8 | 0 | — | — | — | — |
| aljimaz2006 LOTO 323.2 K | NRTL_DIRECT_CALIBRATED | 8 | 1 | 0.11284 | 0.20045 | 0.05407 | 0.86477 |
| aljimaz2006 LOTO 323.2 K | UNIQUAC_DIRECT_CALIBRATED | 8 | 0 | — | — | — | — |
| LOSO test fahim2005 | NRTL_DIRECT_CALIBRATED | 106 | 1 | 0.08348 | 0.13599 | 0.06162 | 0.65178 |
| LOSO test fahim2005 | UNIQUAC_DIRECT_CALIBRATED | 106 | 0.20755 | 0.03649 | 0.06047 | 0.0182 | 0.42765 |
| LOSO test fandary2006 | NRTL_DIRECT_CALIBRATED | 78 | 1 | 0.06185 | 0.10559 | 0.04116 | 0.47111 |
| LOSO test fandary2006 | UNIQUAC_DIRECT_CALIBRATED | 78 | 0.08974 | 0.04363 | 0.07598 | 0.00354 | 0.38696 |
| LOSO test aljimaz2006 | NRTL_DIRECT_CALIBRATED | 35 | 1 | 0.11047 | 0.18454 | 0.04243 | 0.53373 |
| LOSO test aljimaz2006 | UNIQUAC_DIRECT_CALIBRATED | 35 | 0.05714 | 0.01711 | 0.02391 | 0.01453 | 0.51099 |

Held-out failures remain visible: 391 failed/single-phase cases were recorded in the cross-validation scopes. The principal validation question is whether composition, K_i, mutual solubility, and selectivity errors remain acceptable without seeing the held-out tie-lines. The report does not collapse these results into the smaller in-sample calibration errors.

## Temperature behavior

The multi-temperature records provide evidence at 289,293.2,298,303.2,308,313.2,318,323.2,328 K. The LOTO rows above test the fitted (τ(T)) behavior only within those admitted hydrocarbon systems and temperatures. The two predictive priors carry fixed method-specific temperature sensitivity, not direct sulfur temperature calibration. No validated temperature law is claimed for BT/DBT/heavy sulfur. Any 343.15 K envelope below is model extrapolation and remains preliminary.

## Preliminary sulfur partition envelopes — isolated molecular probes

The following are bounded model predictions for representative-compound variants in isolated three-component probes (saturate carrier + one sulfur-bearing molecule + NMP). The 2 mol% sulfur value is a computational tracer for estimating a partition coefficient; it is **not** a Run #948/feed-table composition, inferred feed speciation, or sulfur mass fraction.

| T_K | family | model | K_min | K_central | K_max | uncertaintyBasis |
| --- | --- | --- | --- | --- | --- | --- |
| 298.15 | BT | COSMO_SAC_DESCRIPTOR_PROXY | 0.49941 | 0.65597 | 0.91426 | representative-compound spread; model disagreement reported separately |
| 298.15 | BT | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.07176 | 0.07493 | 0.07493 | representative-compound spread; model disagreement reported separately |
| 298.15 | DBT | COSMO_SAC_DESCRIPTOR_PROXY | 1.11813 | 1.50256 | 2.36444 | representative-compound spread; model disagreement reported separately |
| 298.15 | DBT | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.06716 | 0.07029 | 0.07029 | representative-compound spread; model disagreement reported separately |
| 298.15 | HEAVY_S | COSMO_SAC_DESCRIPTOR_PROXY | 1.9877 | 3.21883 | 5.56285 | representative-compound spread; model disagreement reported separately |
| 298.15 | HEAVY_S | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.06292 | 0.06601 | 0.06601 | representative-compound spread; model disagreement reported separately |
| 308.15 | BT | COSMO_SAC_DESCRIPTOR_PROXY | 0.496 | 0.65377 | 0.91496 | representative-compound spread; model disagreement reported separately |
| 308.15 | BT | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.07094 | 0.07413 | 0.07413 | representative-compound spread; model disagreement reported separately |
| 308.15 | DBT | COSMO_SAC_DESCRIPTOR_PROXY | 1.12195 | 1.51398 | 2.39902 | representative-compound spread; model disagreement reported separately |
| 308.15 | DBT | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.06631 | 0.06946 | 0.06946 | representative-compound spread; model disagreement reported separately |
| 308.15 | HEAVY_S | COSMO_SAC_DESCRIPTOR_PROXY | 2.00915 | 3.28266 | 5.72312 | representative-compound spread; model disagreement reported separately |
| 308.15 | HEAVY_S | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.06204 | 0.06515 | 0.06515 | representative-compound spread; model disagreement reported separately |
| 343.15 | BT | COSMO_SAC_DESCRIPTOR_PROXY | 0.48623 | 0.64762 | 0.91768 | representative-compound spread; model disagreement reported separately |
| 343.15 | BT | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.06852 | 0.07173 | 0.07173 | representative-compound spread; model disagreement reported separately |
| 343.15 | DBT | COSMO_SAC_DESCRIPTOR_PROXY | 1.13425 | 1.55018 | 2.50945 | representative-compound spread; model disagreement reported separately |
| 343.15 | DBT | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.0638 | 0.06697 | 0.06697 | representative-compound spread; model disagreement reported separately |
| 343.15 | HEAVY_S | COSMO_SAC_DESCRIPTOR_PROXY | 2.07636 | 3.48847 | 6.24576 | representative-compound spread; model disagreement reported separately |
| 343.15 | HEAVY_S | MODIFIED_UNIFAC_DORTMUND_PROXY | 0.05945 | 0.06259 | 0.06259 | representative-compound spread; model disagreement reported separately |

Envelope status:

- `PREDICTIVE_ONLY`: model flash converged, but no direct sulfur tie-line validation exists.
- `NOT_CALCULABLE_SINGLE_PHASE`: the selected predictive prior did not produce a non-trivial two-phase split.
- `NOT_CALCULABLE_FLASH`: numerical flash failure; no value substituted.
- Ranges combine representative-compound variation. COSMO-proxy versus UNIFAC-proxy differences are shown as model-form disagreement by separate rows, not hidden inside one mean.
- Exact sulfur removal is not inferred from aromatic partitioning or these isolated probes. A sulfur mass balance requires measured or bounded sulfur-family feed fractions, which are absent here.

## Credibility decision

**Recommended: continue as the independent pre-pilot research foundation, not as a Stage 8 governing model yet.**

Evidence supporting continuation:

1. direct and calibrated modes are separated;
2. phase formation, composition, mutual solubility, K_i, selectivity, and temperature diagnostics are quantitative;
3. calibration error and held-out error are separate;
4. nonconvergence and unsupported sulfur data remain explicit;
5. the sulfur output is component/family partitioning rather than an empirical sulfur-removal multiplier.

Blocking evidence before promotion:

1. retrieve and quality-check the raw direct NMP/thiophene dataset;
2. retrieve direct NMP/BT and NMP/DBT composition-resolved data or mark those families permanently predictive-only;
3. replace the COSMO-SAC descriptor proxy with an actual reproducible sigma-profile implementation and versioned molecular inputs;
4. perform held-out sulfur-family validation and multi-temperature checks near the intended pilot temperature;
5. only then define a governed correction/surrogate and connect it to the physical ECR simulator.

## Reproducibility

Run:

```text
npx tsx server/research/ecr2-step4/thermodynamic-proof-of-concept.ts
```

The JSON companion contains every metric, fit record, benchmark count, and sulfur-envelope point. The runner does not import Stage 8, the production NRTL artifact, the ECR simulator, or any process-design solver.

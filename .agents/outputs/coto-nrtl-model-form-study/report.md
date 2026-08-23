# Coto 2022 Five-Component NRTL Structural Study

## Scope and preservation

This is a read-only diagnostic study of the 13 Coto 2022 xylene-family
tie-lines at 298.15 K. It did **not** change the active LLX NRTL registry,
any simulator/BVP calculation, properties, persisted inputs, or Run #711.
No fitted candidate is promoted or treated as governed.

The source compound subset and order are exact for these 13 rows:
`[n-dodecane, 1,4-xylene, 1-methylnaphthalene, pyrene, NMP]`. Its application
to RRBO classes remains a screening analogy.

## Protocol

- NRTL non-randomness factor: fixed \(\alpha=0.2\).
- Directional \(\tau_{ij}\) bounds: \([-40,40]\) at 298.15 K.
- Structures compared: 4, 8, 10, 14, and 20 fitted interactions.
- Each candidate used bounded clipped Nelder–Mead with deterministic
  multi-starts. A midpoint flash predicted both endpoints for every source
  tie-line.
- Gate: \(3u(x)=0.009\), because Coto reports \(u(x)=0.003\).
- Jacobians use 130 endpoint log-isoactivity residuals. A rank below the
  fitted parameter count or a very large condition number is an
  identifiability warning, not a successful calibration.

The individual JSON files contain the fitted matrices, every predicted and
experimental composition vector, endpoint isoactivity residual vector, flash
state, and per-row RMS error.

## Current active baseline (not refitted)

The independently re-flashed active LLX xylene-only matrix remains **2/13**
within the 0.009 gate, with RMS composition error **0.01888125** and maximum
composition error **0.09198078**. It is included only as a read-only
comparison point.

## Structural comparison

| Structure | Parameters | Best optimizer state | Jacobian rank / condition | RMS comp. error | Max comp. error | Gate passes | Endpoint \(\ln a\) RMS / max |
|---|---:|---|---|---:|---:|---:|---:|
| 4: symmetric hydrocarbon↔NMP only | 4 | converged | 4 / 44.678 | 0.029256 | 0.123602 | 0/13 | 1.500970 / 4.231312 |
| 8: directional hydrocarbon↔NMP only | 8 | iteration-limited | 8 / 497.493 | 0.024414 | 0.090839 | 0/13 | 1.683159 / 5.109543 |
| 10: all binary interactions symmetric | 10 | converged | 10 / 418.481 | 0.023353 | 0.129620 | 0/13 | 1.431539 / 4.244406 |
| 14: symmetric hydrocarbon pairs + directional solvent pairs | 14 | iteration-limited | 14 / 1,163.122 | 0.029314 | 0.119474 | 0/13 | 1.233835 / 3.694468 |
| 20: all interactions directional | 20 | iteration-limited | 19 / 118,301.927 | 0.019834 | 0.121146 | 1/13 | 0.295966 / 0.948062 |

### What the completed study establishes

1. **A — over-parameterization/non-identifiability is present in the full
   directional fit.** The 20-parameter solution has effective rank 19/20,
   condition number about \(1.18\times10^5\), and no converged start. Its
   improved isoactivity closure cannot be used as evidence for a stable,
   unique parameter vector.
2. **The lower-dimensional candidates are identifiable but insufficient at
   the stated gate.** The converged 4- and 10-parameter models have full rank
   and modest condition numbers, yet neither passes any tie-line.
3. **The numerical direction is informative, but not dispositive.** More
   interaction freedom sharply decreases endpoint isoactivity residuals
   (20-parameter maximum 0.948 versus 3.69–5.11 for the restricted models),
   while still yielding only one endpoint-composition pass.
4. **No definitive classification is justified.** The evidence does not
   separate an NRTL model-form limitation (B), a five-surrogate-component
   limitation (C), from the appropriateness of a uniform 0.009 acceptance
   criterion (D). The 20-parameter fit must be converged and independently
   validated before any stronger claim.

## Per-row compact comparison

Each cell is `maximum absolute composition error / maximum endpoint
log-isoactivity residual`. Only full composition vectors and per-row RMS
errors are omitted from this table; they are retained in the structure JSON
files named in `result.json`.

| Source row | 4p | 8p | 10p | 14p | 20p |
|---:|---:|---:|---:|---:|---:|
| 1 | 0.0486 / 3.400 | 0.0311 / 4.063 | 0.0489 / 4.244 | 0.0420 / 2.793 | 0.0338 / 0.948 |
| 2 | 0.1236 / 1.266 | 0.0908 / 1.380 | 0.1296 / 0.968 | 0.1195 / 0.837 | 0.1211 / 0.241 |
| 3 | 0.0398 / 2.664 | 0.0229 / 3.057 | 0.0442 / 3.443 | 0.0168 / 2.017 | 0.0155 / 0.892 |
| 4 | 0.0413 / 3.756 | 0.0284 / 4.407 | 0.0380 / 3.807 | 0.0290 / 3.066 | 0.0252 / 0.647 |
| 5 | 0.0608 / 1.709 | 0.0428 / 1.854 | 0.0641 / 1.133 | 0.0944 / 1.079 | 0.0579 / 0.308 |
| 6 | 0.0356 / 3.204 | 0.0316 / 3.636 | 0.0210 / 2.796 | 0.0319 / 2.413 | 0.0161 / 0.472 |
| 7 | 0.0351 / 3.556 | 0.0224 / 4.169 | 0.0320 / 3.705 | 0.0213 / 2.873 | **0.0053 / 0.712** |
| 8 | 0.0389 / 3.534 | 0.0309 / 4.216 | 0.0325 / 4.203 | 0.0388 / 3.052 | 0.0123 / 0.840 |
| 9 | 0.0622 / 1.928 | 0.0661 / 2.067 | 0.0350 / 1.288 | 0.1128 / 0.982 | 0.0235 / 0.349 |
| 10 | 0.0490 / 2.445 | 0.0512 / 2.658 | 0.0330 / 1.672 | 0.0589 / 1.542 | 0.0292 / 0.370 |
| 11 | 0.0404 / 3.393 | 0.0431 / 3.815 | 0.0180 / 2.777 | 0.0387 / 2.462 | 0.0127 / 0.466 |
| 12 | 0.0344 / 4.035 | 0.0314 / 4.750 | 0.0265 / 3.630 | 0.0293 / 3.335 | 0.0143 / 0.490 |
| 13 | 0.0339 / 4.231 | 0.0261 / 5.110 | 0.0257 / 3.939 | 0.0249 / 3.694 | 0.0133 / 0.533 |

The only candidate row within the composition gate is source row 7 of the
20-parameter structure. It is not a sufficient basis for model promotion.

## Coto Table 4 source benchmark — reported values only

Coto reports standard deviations for three UNIFAC versions and a
classical-UNIFAC refit of the *group* interactions
\(a_{\mathrm{AC,NMP}}=-145\) and \(a_{\mathrm{NMP,AC}}=-10\). These are
independent source benchmarks, **not** an executable molecular-NRTL model and
not a basis to transform values into \(\tau_{ij}\).

| Property | Maximum value | UNIFAC | Mod. UNIFAC (Dortmund) | Mod. UNIFAC (NIST) | UNIFAC AC↔NMP refit |
|---|---:|---:|---:|---:|---:|
| \(x_1^r\) | 0.893 | 0.31 | 0.19 | 0.33 | 0.11 |
| \(x_1^e\) | 0.397 | 0.14 | 0.17 | 0.17 | 0.16 |
| \(x_{ar}^r\) | 0.226 | 0.12 | 0.09 | 0.13 | 0.05 |
| \(x_{ar}^e\) | 0.361 | 0.04 | 0.05 | 0.04 | 0.06 |
| \(x_{par}^r\) | 0.090 | 0.05 | 0.02 | 0.04 | 0.09 |
| \(x_{par}^e\) | 0.200 | 0.01 | 0.02 | 0.02 | 0.02 |
| \(x^r\) | 0.893 | 0.15 | 0.09 | 0.16 | 0.06 |
| \(x^e\) | 0.756 | 0.07 | 0.08 | 0.09 | 0.08 |
| \(K\) | 0.893 | 0.12 | 0.09 | 0.13 | 0.07 |
| \(K_1\) | 1.617 | 0.23 | 0.20 | 0.20 | 0.21 |
| \(K_{ar}\) | 1.855 | 0.60 | 0.58 | 0.79 | 0.18 |
| \(K_{par}\) | 4.475 | 2.10 | 1.40 | 1.90 | 0.86 |
| \(\alpha\) | 14.23 | 2.70 | 3.60 | 1.80 | 16.00 |
| \(\alpha_{par}\) | 29.04 | 7.00 | 6.60 | 3.40 | 41.00 |

The controlled PDF does not contain a complete executable UNIFAC
group-assignment/parameter artifact or calculated composition vectors for an
exact per-row reproduction. Table 4 is therefore preserved as a reported
source benchmark rather than falsely reimplemented.
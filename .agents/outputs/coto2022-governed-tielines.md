# Coto et al. 2022 — Governed Tie-Line Dataset (Table 3, verbatim-verified transcription)

Source: Coto, Suárez, Tenorio et al., *Fluid Phase Equilibria* 554 (2022) 113293, Table 3 (p.5),
verified against PDF text extraction (not OCR) on 2026-08-10.
Conditions: T = 298.15 K, P = 101.6 kPa, u(P) = 0.5 kPa, u(x) = 0.003, u(T) = 0.05 K.
Components: (1) n-dodecane, (2) toluene, (3) 1,4-xylene, (4) 1-methylnaphtalene [paper spelling],
(5) pyrene, (6) NMP. Table 3 basis: MOLE fractions (header). Table 2 basis: MASS fraction %
(header; u(mass fraction) = 0.1%). r basis: mol NMP / mol SC ("synthetic crude", the hydrocarbon
mixture), printed in Table 3; experiments were prepared at NMP/SC g/g = 0.25, 0.5, 1.0, 1.5, 2.5,
3.0 (Section 2.2) and converted to mol/mol.

**17 tie-lines total: 13 xylene-family + 4 toluene-family.** All 34 phase sums = 1.000.

## Xylene-family tie-lines (13 rows, sorted by x1R — governed interpolation order)

| x1R | x3R | x4R | x5R | x6R | x1E | x3E | x4E | x5E | x6E | table order | r (printed) |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|
| 0.641 | 0.131 | 0.050 | 0.020 | 0.158 | 0.392 | 0.142 | 0.077 | 0.038 | 0.351 | 2 | 0.7 |
| 0.651 | 0.134 | 0.047 | 0.021 | 0.147 | 0.320 | 0.150 | 0.081 | 0.050 | 0.399 | 5 | 0.7 |
| 0.664 | 0.136 | 0.055 | 0.035 | 0.110 | 0.250 | 0.162 | 0.105 | 0.095 | 0.388 | 9 | 0.4 |
| 0.725 | 0.109 | 0.037 | 0.018 | 0.111 | 0.252 | 0.141 | 0.080 | 0.064 | 0.463 | 10 | 0.8 |
| 0.800 | 0.092 | 0.022 | 0.008 | 0.078 | 0.206 | 0.113 | 0.062 | 0.036 | 0.583 | 6 | 1.5 |
| 0.813 | 0.082 | 0.020 | 0.009 | 0.076 | 0.190 | 0.113 | 0.063 | 0.048 | 0.586 | 11 | 1.4 |
| 0.822 | 0.085 | 0.022 | 0.006 | 0.065 | 0.240 | 0.124 | 0.069 | 0.017 | 0.550 | 3 | 1.5 |
| 0.857 | 0.062 | 0.015 | 0.005 | 0.061 | 0.181 | 0.094 | 0.057 | 0.024 | 0.644 | 7 | 2.2 |
| 0.858 | 0.067 | 0.015 | 0.005 | 0.055 | 0.157 | 0.098 | 0.052 | 0.026 | 0.667 | 4 | 2.2 |
| 0.860 | 0.068 | 0.018 | 0.004 | 0.050 | 0.158 | 0.104 | 0.058 | 0.014 | 0.666 | 1 | 2.2 |
| 0.863 | 0.058 | 0.013 | 0.005 | 0.061 | 0.150 | 0.085 | 0.045 | 0.033 | 0.687 | 12 | 2.3 |
| 0.877 | 0.050 | 0.011 | 0.005 | 0.057 | 0.174 | 0.093 | 0.038 | 0.021 | 0.674 | 8 | 3.0 |
| 0.878 | 0.048 | 0.010 | 0.004 | 0.060 | 0.135 | 0.073 | 0.037 | 0.027 | 0.728 | 13 | 3.0 |

## Toluene-family tie-lines (4 rows, table order 14–17)

| r | x1R | x2R | x4R | x5R | x6R | x1E | x2E | x4E | x5E | x6E |
|---|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 0.7 | 0.645 | 0.106 | 0.048 | 0.020 | 0.181 | 0.397 | 0.142 | 0.072 | 0.032 | 0.357 |
| 1.4 | 0.783 | 0.080 | 0.025 | 0.007 | 0.105 | 0.210 | 0.113 | 0.061 | 0.028 | 0.588 |
| 2.1 | 0.861 | 0.053 | 0.016 | 0.005 | 0.065 | 0.177 | 0.088 | 0.049 | 0.022 | 0.664 |
| 4.2 | 0.894 | 0.032 | 0.009 | 0.003 | 0.062 | 0.145 | 0.054 | 0.030 | 0.013 | 0.758 |

Transcription errata (corrected 2026-08-10): earlier working notes carried wrong nominal r
labels (e.g. non-existent r = 3.4) and, in one analysis script, a phantom 14th xylene row
duplicating the toluene r = 4.2 row. The 13 xylene phase-composition vectors used in all
stage calculations were and remain verbatim-correct.

## r VERIFICATION — r itself is internally consistent
Converting the Section 2.2 g/g series to mol/mol with Table-2-derived feed MWs (139–150 g/mol)
reproduces the printed r values: 0.25→0.35–0.38 (≈0.4), 0.5→0.70–0.76 (0.7/0.8),
1.0→1.40–1.51 (1.4/1.5), 1.5→2.10–2.27 (2.1–2.3), 3.0→4.2–4.5 (4.2). Toluene family (F1,
MW=138.9) matches exactly: 0.35/0.7/1.4/2.1/3.5/4.2. Minor anomaly: printed r = 3.0 implies
g/g ≈ 2.0 (not in the stated series) and the stated 2.5 g/g (→≈3.5–3.8) never appears.

## CONFIRMED GOVERNANCE FINDING — feed/phase mass-balance closure fails
Least-squares closure over phase amounts (R, E ≥ 0, R+E = F+S) with Table 2 feeds (mass basis,
converted with pure-compound MWs) and printed r: mean rms residual 0.029 mole fraction,
per-row max up to 0.157 (52 × u(x)). Aromatic bracket test (mixing-point total aromatics must
lie between the two phases' aromatic sums — a condition independent of phase amounts):
**12 of 17 rows fail**. For several rows failure is independent of r as well (feed xylene mole
fraction 0.32–0.37 vs ≤ 0.162 in ANY phase of ANY row — impossible for any solvent amount).
Alternative bases tested and rejected: Table 2 read as mol% (residuals halve but remain ~6×u(x),
feed assignments scramble); r read as g/g (worse). No basis interpretation closes.

Attribution: NOT r (verified above). The imbalance is between Table 2 feed compositions and
Table 3 phase compositions — a systematic aromatic deficit in the measured phases. A systematic
NMR aromatics-quantification bias cannot be excluded and is carried as a dataset caveat.

Governed consequences:
1. Tie-line phase compositions retained as equilibrium data (equilibrium is a state property).
2. r and feed-family assignments MUST NOT be used quantitatively (not as interpolation
   coordinate, not in balances).
3. Interpolation coordinate = x1R (intrinsic raffinate coordinate); monotone for aromatic
   components; x6R and x1E each have one non-monotone pair within u(x) = 0.003 — declared.

## Validity envelope (composition, from data — NOT from r)
- Raffinate locus: x1R ∈ [0.641, 0.878]; raffinate aromatics ∈ [0.062, 0.226] (mole)
- Extract NMP: x6E ∈ [0.351, 0.728]
- Temperature: 298.15 K ONLY. 343.15 K design → Outside Experimental Temperature Range —
  Pending Validation.
- Mutual solubility is large (NMP in raffinate 5.0–15.8 mol%; non-NMP in extract 27.2–64.9
  mol%) → constant-F/S methods INVALID; variable-flow stage balances mandatory.

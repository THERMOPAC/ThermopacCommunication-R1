# THERMOPAC_NRTL_FIT_TO_COTO_2022_XYLENE_LLE

Status: **UNADMITTED_DIAGNOSTIC**

## Method
- 13 verified Coto 2022 xylene-family tie-lines at 298.15 K.
- Five-component basis: Sat=n-dodecane; Mono=1,4-xylene; Di=1-methylnaphthalene; Poly=pyrene; Solvent=NMP.
- Simultaneous two-phase midpoint-flash composition objective over both phases, scaled by u(x)=0.003.
- 6 deterministic bounded multi-start runs; alpha=0.2 fixed; each directional tau bound [-40, 40].
- Best scaled objective: **5656.700925**. The selected start reached the 2,500-iteration cap and did not meet the simplex convergence criterion; the result is a reproducible diagnostic candidate, not a demonstrated global optimum.
- All 13 final independent flashes converged; no fitted tau value reached a bound.

## Reproduction
- RMS error: **0.01978933**
- Maximum absolute error: **0.12055349**
- Tie-lines passing the 0.009000000000000001 gate: **1/13**
- Conclusion: **FIVE_COMPONENT_NRTL_BASIS_INADEQUATE**

| Source row | max abs error | RMS error | max abs isoactivity residual | converged | PASS |
|---:|---:|---:|---:|:---:|:---:|
| 2 | 0.12055349 | 0.05488092 | 0.23871226 | yes | FAIL |
| 5 | 0.05742669 | 0.02752957 | 0.30593556 | yes | FAIL |
| 9 | 0.02377564 | 0.01886268 | 0.34669155 | yes | FAIL |
| 10 | 0.02887008 | 0.01381959 | 0.36756772 | yes | FAIL |
| 6 | 0.01690644 | 0.00834817 | 0.49309437 | yes | FAIL |
| 11 | 0.01418171 | 0.00705768 | 0.48765977 | yes | FAIL |
| 3 | 0.01645247 | 0.00886714 | 0.91603457 | yes | FAIL |
| 7 | 0.00407297 | 0.00222982 | 0.73887005 | yes | PASS |
| 4 | 0.02692258 | 0.01184312 | 0.67415526 | yes | FAIL |
| 1 | 0.03554075 | 0.01690684 | 0.97538595 | yes | FAIL |
| 12 | 0.0159173 | 0.00720053 | 0.51596517 | yes | FAIL |
| 8 | 0.01098528 | 0.00590214 | 0.86677317 | yes | FAIL |
| 13 | 0.01488823 | 0.00765326 | 0.56032408 | yes | FAIL |

## Fitted tau matrix at 298.15 K
Rows and columns: [Sat, Mono, Di, Poly, Solvent]. Diagonal entries are zero.

```json
[
  [
    0,
    0.385989,
    -25.432864,
    6.581313,
    2.672111
  ],
  [
    -0.770476,
    0,
    19.94111,
    3.544544,
    -1.82194
  ],
  [
    0.04253,
    3.524896,
    0,
    -1.483474,
    1.988084
  ],
  [
    32.50707,
    11.791023,
    -20.957537,
    0,
    15.677759
  ],
  [
    1.287898,
    1.455011,
    -28.259166,
    2.749794,
    0
  ]
]
```

## Identifiability
- Jacobian residual rows: 130; fitted parameters: 20.
- Effective numerical rank at relative 1e-6: 19/20.
- Bound hits: 0.
- Singular values: 395.027951, 235.738657, 81.917628, 34.857342, 22.176687, 13.070187, 6.967843, 4.812450, 2.437855, 2.046263, 1.771947, 0.866944, 0.545990, 0.411763, 0.196747, 0.157944, 0.074788, 0.008582, 0.003409, 0.000299.
- Interpretation: one weak directional-parameter combination remains; the candidate parameters are not practically fully identifiable from these 13 tie-lines alone.

## Comparison with current active result
- Current: 2/13 pass; RMS error 0.01888125; maximum error 0.09198078.
- Candidate: 1/13 pass; RMS error 0.01978933; maximum error 0.12055349.

The candidate is diagnostic only and is not promoted or admitted.
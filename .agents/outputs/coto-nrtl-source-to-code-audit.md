# Coto 2022 source-to-code reconciliation

## Scope and preservation statement

This is a diagnostic audit of the controlled source and the existing LLX
implementations. No NRTL parameter, equation, flash behavior, source
tie-line, engineering input, or persisted result was changed.

Source visually verified: `attached_assets/Extraction_of_aromatic_and_polyaromatic_compounds_with_NMP_1786368615037.pdf`,
printed pages 3–5 rendered in `.agents/outputs/coto-source-render/`.

## Source facts

| Audit item | Verified source fact |
|---|---|
| Paper system and Table 3 order | n-dodecane (1), toluene (2), 1,4-xylene (3), 1-methylnaphthalene (4), pyrene (5), NMP (6) |
| Tie-line basis | Raffinate and extract **mole fractions** |
| Conditions | 298.15 K; atmospheric pressure, reported as 101.6 kPa with u(P)=0.5 kPa |
| Reported uncertainty | u(T)=0.05 K; u(x)=0.003 |
| Xylene family | 13 Table 3 rows; toluene is blank in both phases |
| Toluene family | 4 separate Table 3 rows; xylene is blank in both phases |
| Equilibrium statement | \(\gamma_i^r x_i^r = \gamma_i^e x_i^e\) |

The current five-entry xylene mapping preserves the source xylene-family
order exactly after omission of the blank toluene column:

`[n-dodecane, 1,4-xylene, 1-methylnaphthalene, pyrene, NMP]`.

It is therefore an exact compound subset for the 13 xylene rows. It remains
a screening analogy when mapped to RRBO component classes and cannot be
called the paper's complete six-component system.

## Published model versus current model

The source paper **does not publish an NRTL parameter table**, NRTL
non-randomness factors, or an NRTL temperature fit. It evaluates classical
UNIFAC, modified UNIFAC (Dortmund), and modified UNIFAC (NIST). The paper
states the UNIFAC activity-coefficient expressions are described elsewhere.

Its only reported fitting exercise is a classical-UNIFAC refit of the
directional **group** interactions between aromatic group `AC` and solvent
group `NMP`:

| Published quantity | Value |
|---|---:|
| \(a_{\mathrm{AC,NMP}}\) | -145 |
| \(a_{\mathrm{NMP,AC}}\) | -10 |

Those are UNIFAC group-interaction quantities, not molecular NRTL
\(\tau_{ij}\) values and not NRTL \(\alpha_{ij}\) values. They cannot be
converted one-to-one into the active five-component NRTL `NRTL_B_K` matrix.

Consequences:

1. The active NRTL matrix is a local, xylene-family regression, not a
   published Coto NRTL parameter set.
2. Its fixed \(\alpha=0.2\) is an LLX modeling choice; it is not a Coto
   published value.
3. The active \(\tau_{ij}=b_{ij}/T\) is an LLX modeling choice. Coto's
   experiment supplies one temperature only; it does not establish an NRTL
   temperature relation.
4. The paper's directional `AC↔NMP` constants do not establish the direction,
   units, or values of any current molecular NRTL pair.

The controlled registry's citation author list also differs from the PDF:
the PDF lists B. Coto, I. Suárez, M.J. Tenorio, and I. Huerga. This is a
bibliographic provenance defect only; it does not affect the Table 3 numbers.

## Which implementation produced 2/13?

The 2/13 result belongs to the active
`LLX_TLLE_NRTL_TAU_B_OVER_T` implementation:

- it uses the five-component xylene family only;
- its regression scripts load the 13 xylene rows only;
- it uses the active `NRTL_B_K` matrix;
- it uses Table-3-phase midpoints only as a flash test feed.

The distinct `nrtl-params-v1.json` artifact is not the active matrix. Its
regression loader combines the 13 xylene and 4 toluene rows into a common
mono-aromatic slot (17 total); that artifact is already marked
`admitted: false`. It cannot explain the active 2/13 value and must not be
described as the xylene-only calibration.

## Independent numerical checks

At 298.15 K, supplying the active `NRTL_B_K` matrix to both in-repo NRTL
activity-coefficient functions gives a largest \(\ln\gamma\) difference of
`3.55e-15`: the equation implementations are numerically identical.

Supplying the same matrix and midpoint feeds to both flash implementations
gives matching maximum phase-composition errors to approximately `1e-8`.
The active solver reports a non-convergence for source Table-3 row 9, while
the damped solver converges to the same off-target endpoints. This is a
convergence-criterion difference, not the cause of the 2/13 failure.

The largest component log-isoactivity residual for the *experimental*
endpoints ranges from about 0.54 to 1.12 by row under the active parameters.
An equilibrated endpoint pair should have residual zero. This independently
shows the active parameter vector does not satisfy the source endpoints;
the outcome is not created by midpoint selection or flash iteration.

## Reproduction result at the 0.009 gate

| Source Table 3 row | max \(|\Delta x|\) | Gate result |
|---:|---:|---|
| 1 | 0.0253 | fail |
| 2 | 0.0920 | fail |
| 3 | 0.0205 | fail |
| 4 | 0.0165 | fail |
| 5 | 0.0474 | fail |
| 6 | 0.0133 | fail |
| 7 | 0.0146 | fail |
| 8 | 0.0283 | fail |
| 9 | 0.0660 | fail |
| 10 | 0.0194 | fail |
| 11 | 0.0121 | fail |
| 12 | 0.0079 | pass |
| 13 | 0.0070 | pass |

Result: **2/13 pass; maximum deviation 0.0920**.

## Classification of the present failure

| Candidate explanation | Audit classification |
|---|---|
| Source transcription | Not indicated: visual source Table 3 and all 13 xylene values match the registry. |
| Xylene-row component mapping | Not indicated for the 13-row audit: the five source compounds and order match exactly. |
| Toluene incorrectly mixed into the active result | Not indicated: the active 2/13 regression uses xylene rows only. It is a separate, real defect in the inactive 17-row artifact path. |
| Published parameter direction or units | Not assessable as an NRTL defect: Coto publishes UNIFAC group interactions, not NRTL molecular parameters. |
| NRTL equation implementation | Not indicated: both implementations agree to machine precision for the same parameters. |
| Flash methodology | Not the cause: both flash paths return the same deviations. A midpoint is a valid interior feed on an exact tie-line, though it was not the paper's reported UNIFAC evaluation procedure. |
| Temperature treatment | Not the cause at 298.15 K. The active \(b/T\) relation is nevertheless unsupported by Coto beyond that one temperature. |
| Current parameter vector / regression outcome | Established immediate cause: it does not satisfy the source endpoints and misses 11 of 13 gate checks. |
| Intrinsic inability of NRTL as a model form | Not established. Demonstrating that would require a new, controlled regression study, which is outside this audit. |

## Conclusion

The source supports Coto Table 3 as controlled 298.15 K experimental LLE
anchors. It does **not** support describing the current NRTL parameters as
published Coto parameters, comparing their directions or \(\alpha\) values to
a Coto NRTL table, or treating the 2/13 result as a reproduction failure of
Coto's published NRTL model. The observed 2/13 result is the unsuccessful
reproduction of LLX's own xylene-only NRTL regression vector.
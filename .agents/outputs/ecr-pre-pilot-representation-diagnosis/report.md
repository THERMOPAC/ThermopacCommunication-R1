# NMP LLE molecular-representation diagnosis

## Decision

**The tested family-global NRTL and UNIQUAC parameterizations are rejected.**
The completed controlled same-equation comparison shows that molecular
identity/system information is composition-relevant on identical accepted-row
support, but is not sufficient overall because topology is a co-primary gate.
The qualified
NRTL family model gives 0.0505 training and 0.1289 holdout mean tie-line RMSD;
the independently audited flash solver passed, but holdout two-phase recall was
only 0.60. Giving UNIQUAC each row its correct molecular size and shape while
retaining family-global interactions does not cure the problem: 0.0560 training,
0.1745 holdout RMSD and 0.667 recall. Both miss the stated 0.03 target.

The defensible required *input* representation is explicit SAT and MONO molecular
identity, NMP, temperature, and composition. It is **not** yet a validated
thermodynamic minimum. A five-family collapse has not passed its tested
parameterizations and is not demonstrated as an equilibrium state space.

## Exact evidence inventory

All numbers are recalculated from the source-hashed files in `results.json`.
The analogue file has 219 ternary tie-lines and six actual molecular systems:

| SAT + MONO + NMP | rows | T / K |
|---|---:|---|
| dodecane + propylbenzene | 28 | 298, 308, 318, 328 |
| tetradecane + propylbenzene | 38 | 289, 308, 318, 328 |
| tetradecane + pentylbenzene | 38 | 298, 308, 318, 328 |
| hexadecane + 1,3,5-trimethylbenzene | 35 | 293.2, 303.2, 313.2, 323.2 |
| heptadecane + propylbenzene | 40 | 298, 308, 318, 328 |
| heptadecane + pentylbenzene | 40 | 298, 308, 318, 328 |

Exact per-system six-composition ranges are in `results.json`. Across systems,
the data cover four distinct normal-alkane SAT identities (C12, C14, C16, C17),
three MONO identities (C9 propylbenzene, C11 pentylbenzene, and branched/
multi-substituted C9 1,3,5-trimethylbenzene), and one NMP identity. “SAT” and
“MONO” in the composition objects are therefore family labels, not molecules.

The molecular co-observation graph has eight nodes, **13 unique undirected edges**, six ternary
systems, and one connected component because NMP is shared. Its informative
SAT–MONO subgraph is incomplete: C14 and C17 connect to both straight-chain
alkylbenzenes, while C12 occurs only with propylbenzene and C16 only with
trimethylbenzene. Consequently carbon-number effects are estimable in part, but
the C16/trimethylbenzene/source grid is confounded; aromatic branching cannot
yet be cleanly separated from SAT identity and study.

Coto contributes 17 **five-component** tie-lines at 298.15 K: 13 contain
n-dodecane, p-xylene, 1-methylnaphthalene, pyrene and NMP; four replace
p-xylene with toluene. Thus Coto adds one SAT molecule, two alternative MONO
molecules, one DI molecule and one POLY molecule. It does not contain a mixture
of multiple SAT identities, multiple DI identities, or multiple POLY identities,
and it has no temperature variation.

## Falsifiability and equilibrium diagnostics (non-causal)

For every positive component the analysis uses the tie-line constraint
`log K_i = log(y_i/x_i)`. Selectivity uses
`log(K_MONO/K_SAT)`, which cancels phase normalization. These are comparisons
at measured conjugate phases—not comparisons of extraction yields from
different feeds. Regression diagnostics additionally condition on temperature
and raffinate MONO/NMP composition. No excluded feed or nominal solvent ratio is
used.

Identity effects are large. Mean SAT log K changes from -1.741 (dodecane) to
-2.146 (tetradecane), -2.762 (hexadecane), and -3.087 (heptadecane). Mean NMP
log K is 0.963, 0.971, 0.994, and 1.712 over those same SAT groupings. These
unadjusted means are descriptive—not causal—because grids and co-components
differ. The adjusted nested diagnostics below are the governing contradiction.
MONO means also distinguish trimethylbenzene (-0.618) from propylbenzene
(-0.305) and pentylbenzene (-0.311), with the stated graph confounding retained.
Full ranges, standard deviations, temperatures, and normalized selectivities
are machine-readable in `results.json`.

Coto itself shows substantial composition dependence: for xylene-family rows,
SAT log K ranges -1.872 to -0.492, MONO 0.081 to 0.621, DI 0.432 to 1.335,
POLY 0.642 to 1.910, and NMP 0.798 to 2.589. The four toluene rows cannot be
paired row-for-row to xylene rows as if feeds were identical. Their separate
conditional ranges are reported; they establish a second MONO identity but do
not isolate a molecular identity coefficient.

## Non-causal diagnostic comparisons

Two different evidence levels are deliberately separated:

1. **Qualified thermodynamic flashes.** A is the existing family-global NRTL.
   B is standard UNIQUAC with authentic row-specific molecular R/Q but the same
   family-global interactions. Their independent equation, stability, Gibbs,
   mass-balance, isoactivity, multistart, and solver-isolation audits pass. Their
   poor accuracy therefore cannot be dismissed as an unevaluated flash failure.
2. **Direct equilibrium-constraint diagnostics.** A–D regress three log-K
   constraints using the same composition/temperature basis, reconstruct an
   extract composition by normalized `x_i K_i`, and never use feed identity.
   These tests isolate representational information but are not promoted as
   flash models.

| diagnostic representation | all-data fit RMSD | worst leave-one-T RMSD | mean / worst leave-one-system RMSD |
|---|---:|---:|---:|
| A family-global | 0.02795 | 0.06041 | 0.03383 / 0.07796 |
| B row molecular R/Q + global interactions | 0.01282 | 0.04602 | 0.02611 / 0.06393 |
| C molecule-pair intercept and T response | 0.01127 | 0.03777 | not defined for unseen systems |
| D C-number + aromatic-topology descriptors | 0.01244 | 0.04463 | 0.02872 / 0.06500 |

The all-data columns are fit capability, not prediction. Leave-one-temperature
excludes an entire exact temperature before fitting. Leave-one-system excludes
an entire molecular pair; C has no honest unseen-system prediction because a
system dummy has no learned coefficient. D is parsimonious and competitive
in-domain, but its worst system and temperature transfers exceed 0.03. It is a
promising hypothesis, not a governing model. The previous 323.2 K holdout is
not reused as training for any governing claim: every leave-one-T result is
trained without its stated temperature.

### Required controlled A/B thermodynamic test

`controlled_uniquac.py` is a diagnosis-local adaptation that holds the standard
UNIQUAC equation, Original-UNIFAC row R/Q, bounds, least-squares optimizer,
regularization, flash tolerances, TPD lattice/refinement, all basin starts, and
independent final checks fixed. A has one directed SAT/MONO/NMP mapping; B
changes only to one such mapping per exact SAT+MONO molecular system. It is
designed to fit every leave-one-temperature fold only on the other temperatures
and report per-fold/in-sample topology and RMSD plus Jacobian rank/condition.
All 20 version-2 checkpoints serialize each held-out row, exact component
errors/SSE, phase behavior, and row solver audit, and hash every imported
executable dependency. Aggregation uses row SSE directly; it does not reconstruct
an aggregate from fold means.

| controlled UNIQUAC mapping, leave-one-temperature pooled | accepted / rows | topology recall | accepted component RMSD |
|---|---:|---:|---:|
| A: family-global | 195 / 219 | 0.890411 | 0.065212691984 |
| B: exact molecular system | 110 / 219 | 0.502283 | 0.023377757058 |

On the identical accepted intersection of 110 rows, A has RMSD
**0.072384709785** and B has **0.023377757058**. B improves row RMSD on 104
rows, A on 6, with no ties. Thus molecular identity/system information improves
composition **conditional on valid topology**. This is not a claim that B is a
predictive model: the two-dimensional overall result fails because B topology
recall is below 0.90, its interaction dummies have no unseen-system transfer
(`NOT_CALCULABLE`), and pair-specific interactions do not establish adequate
conditioning or extrapolation. The direct log-K table remains non-causal.

## In-locus interpolation benchmark (not a representation lower bound)

For each exact molecule-pair and temperature locus, leave-one-row-out linear
interpolation between bracketing measured tie-lines predicts 171 interior rows
at **0.00437 aggregate RMSD** (mean row RMSD 0.00278; 100% at or below 0.03).
Endpoints are excluded and no extrapolation is performed. This is an in-locus
interpolation benchmark showing the measured equilibrium manifolds are
internally reproducible well below 0.03.

It is not a representation lower bound and not a molecular NRTL/UNIQUAC proof: the interpolation is an
empirical equilibrium lookup, not an interaction-parameter flash. Accordingly:

* the two tested family-global parameterizations are rejected;
* solver failure is not an adequate explanation for those two tests, because their solver
  and independent final-phase audits pass;
* the present evidence does **not** decide whether molecule-specific NRTL,
  UNIQUAC, or another excess-Gibbs equation will achieve <=0.03 under independent
  flash validation. That requires a qualified C-model fit and flash campaign.

## What Coto can and cannot identify

Coto can constrain one multicomponent 298.15 K surrogate system, composition
dependence along its measured locus, relative extraction ordering of p-xylene,
1-methylnaphthalene, and pyrene, and limited p-xylene/toluene sensitivity. It
cannot identify SAT carbon-number/branching effects, DI or POLY identity
variation, temperature dependence for DI/POLY, heavy-oil condensation effects,
heteroatom effects, or transfer to an RRBO assay. One molecule in a family is
not evidence that the family is homogeneous.

All four Coto toluene rows are in the existing frozen holdout. A
toluene-specific interaction cannot be estimated under that frozen split;
using it would require a separately declared split. DI and POLY remain one
identity at one temperature.

## Minimum representation

**Admitted evidence:** preserve the six explicit ternary systems
as molecular identities (four n-alkanes, three monoaromatics, NMP), temperature,
and measured composition domain. Preserve Coto separately as n-dodecane,
p-xylene or toluene, 1-methylnaphthalene, pyrene, and NMP at 298.15 K. A
descriptor interpolator may share parameters only where cross-system validation
passes; current C-number/topology transfer is not uniformly <=0.03.

**Validated thermodynamic next step:** use a hierarchical molecule/descriptor
representation which retains molecular identities while sharing interactions by
physical descriptors. It must be qualified on new molecule/system and
temperature holdouts. Do not deploy 72 pair-specific parameters as a predictive
representation.

**For a real RRBO pre-pilot:** use assay-derived molecular ensembles or a small,
assay-populated pseudo-component set carrying aromatic ring count, total carbon
number/alkyl side-chain length, branching versus normal/cycloalkane status,
ring condensation, polarity/heteroatoms, and explicit measured sulfur species.
Do not invent a large empty grid. Add bins only when assay mass and direct LLE
data support them. DI and POLY need multiple identities and temperatures;
cycloalkanes, branched saturates, condensed heavy aromatics, polar heteroatom
species, and sulfur species are data-required extensions before claims about
RRBO.

**No sulfur-removal inference is licensed by aromatic transfer.** Polar
Aromatics remains unresolved. Sulfur species require direct identity-resolved
NMP LLE or validated partition evidence.

## Separated conclusions, confidence, and counterfactuals

| question | conclusion / confidence | evidence that would change it |
|---|---|---|
| Representation failure | tested family-global parameterizations are inadequate; high confidence. Identity/system information is composition-relevant on common valid-topology support, but pair-specific B is insufficient overall | a hierarchical descriptor model passes topology and <=0.03 on preregistered new-system/temperature holdouts |
| Parameter identifiability | weak; UNIQUAC condition number 3.01e6 and 9 practically weak directions; DI/POLY especially unidentifiable | replicated multi-identity, multi-T DI/POLY systems and a well-conditioned sensitivity audit |
| Equation-form adequacy | unresolved for molecule-resolved models | qualified molecule-specific/descriptor NRTL or UNIQUAC flashes that either pass or consistently fail <=0.03 |
| Temperature transferability | unresolved outside measured ternary grids; descriptor worst leave-one-T 0.0446 | preregistered leave-temperature-out success, including DI/POLY |
| Solver qualification | high confidence that A/B rejection is not merely solver failure | an independent audit exposing missed lower-Gibbs basins or failed mass-balance/isoactivity checks |

## Reproduction

Run `python3 server/research/ecr-pre-pilot-representation-diagnosis/verify.py`.
It executes the deterministic analysis twice, requires byte-identical output,
checks every source SHA-256, inventory/connectivity, prior solver audits, the
in-locus interpolation benchmark, and all controlled row-level statistics. No
production simulator code is imported or modified; the controlled diagnosis
imports the hashed research UNIQUAC implementation.
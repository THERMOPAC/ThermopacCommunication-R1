# Heavy-aromatics temperature-transfer qualification

**Decision: NOT_ESTABLISHED; governing status: FAIL_CLOSED.**

The admitted direct NMP evidence contains 17 Coto tie-lines with
1-methylnaphthalene and pyrene, all at 298.15 K. Coto's 50-70 C heating step
was sample preparation to dissolve pyrene; every reported equilibrium
experiment was performed at 298.15 K. The multitemperature NMP sources found
cover monoaromatics only.

For `tau(T)=a+b/T`, the heavy-aromatic temperature design matrix has rank
**1 of 2**. Intercept and temperature slope are therefore
structurally confounded. At 373.15 K, a slope anywhere within the existing
plus/minus 2000 K research bound can depart from the 298.15 K anchor by
**1.348258**
in either direction without changing the anchor fit. This is an unresolved
range, not a prediction interval.

Task #169 does not close the gap: aromatic-ring count and condensation were
screen-only, and its transferable SAT/MONO model was rejected. DI/POLY
temperature transfer remains `FAIL_CLOSED`.

## Required evidence

- Direct conjugate-phase measurements at 298.15, 323.15, 348.15, and 373.15 K.
- At least two DI and two POLY identities to separate temperature from identity.
- Phase amounts or independently closed material balances, feed and solvent
  ratio, pressure, analytical uncertainty, and replicates.
- Preregistered temperature and unseen-identity holdouts.
- Topology recall at least 0.90 and tie-line RMSD at most 0.03, plus the existing
  stability, Gibbs, conservation, isoactivity, ambiguity, and independent
  final-phase checks.

No DI/POLY operating-temperature values, sulfur predictions, stage counts,
optimization, hydraulics, sizing, or simulator outputs are licensed by this
evidence.

# GFN2-xTB + ddCOSMO/CPCM-X PA study

## Decision

`STOPPED_PUBLISHED_MODEL_LACKS_MIXTURE_ACTIVITY_CAPABILITY`

No non-PA LLE benchmark, molecular profile generation, PA reference calculation,
or UNIQUAC regression was executed.

## Verified published basis

- CPCM-X release: `v1.1.0`
- CPCM-X commit: `e7f894c76d41ee1f703cf6f03e931cbcf046bc7f`
- Model label: GFN2-xTB + ddCOSMO/CPCM-X published parameterization
- Global CPCM-X parameters re-fitted: **no**
- openCOSMO-RS 24a claimed: **no**
- Pinned source integrity: **PASS**

The documentation does show the published xTB parameterization loading
`xtb.cosmo`. That workflow calculates a solute's solvation free energy in a
selected solvent. It does not expose the arbitrary-composition mixture
activities required for the requested NMP/hydrocarbon LLE benchmark.

## Exact blocker

CPCM-X v1.1.0 with its published xTB parameterization accepts an xTB COSMO surface for a solute and a selected pure solvent, but the released CRS implementation does not accept arbitrary mixture compositions or return composition-dependent component activity coefficients. The source explicitly marks mixed-solvent mole-fraction handling as not introduced. The separate COSMO-SAC routines are not the published CPCM-X route, are disconnected from the executable, and do not provide the requested grid.

Because the benchmark cannot be executed with the published model unchanged,
the requested fail-closed rule applies. Developing the missing mixture model
would be new thermodynamic implementation work beyond using the published
CPCM-X parameterization, even if its global constants were held fixed.

## Preserved boundaries

- No PA molecular-reference values were estimated or fabricated.
- No PA-directed UNIQUAC terms were fitted.
- No CPCM-X global parameters were changed.
- Stage 1 and production runtime behavior were not changed.
- Positive-PA results and sulfur removal remain not calculable.

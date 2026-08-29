# NMP sigma3 semantics diagnostic

## Verdict

`NMP_SIGMA3_CONVERSION_DEFECT_CONFIRMED`

The emitted NMP profile is **not** mathematically equivalent to the pinned NIST Hsieh three-profile conversion. No profile, generator, COSMO-SAC parameter, phase-stability method, or LLE solver was changed.

## Exact reference semantics

The reference is NIST COSMOSAC commit `1b82456be38026719b16cad4076109bef3fcb309`, MIT-licensed `profiles/to_sigma.py` (SHA-256 `73cd7b526568ee921e2fcd83b5d8653fccf37878fe4690abafdcd785334ace2a`). The diagnostic independently reproduces:

1. raw sigma = segment charge / segment area in e/Å²;
2. segment radius squared = area/π;
3. Hsieh weighting with r_av² = 7.25/π Å², r_av = 1.519126944937 Å, and f_decay = 3.57;
4. N/F as OT atoms, carbonyl O without bonded H as OT, and all NMP hydrogens as NHB;
5. OT assignment only for positive averaged-sigma O/N/F segments;
6. linear area interpolation onto the −0.025…+0.025 e/Å² grid; and
7. post-binning hydrogen-bond probability P_hb = 1−exp(−sigma²/(2·0.007²)).

No UD, VT2005, ThermoSAC, or other restricted profile was read, copied, transformed, retained, or used. The public source algorithm was sufficient.

## Why the current OT area is 0.074911 Å²

- The retained surface contains 757 segments and closes to 273.594550656047 Å².
- NMP atom 2 (N) and atom 7 (carbonyl O) are both classed OT by the NIST bonding rules.
- Under the profile actually emitted by CPCM-X, only 20 nitrogen segments have positive averaged sigma. Their unattenuated area is 11.055243283000 Å².
- All 68 oxygen segments, totaling 25.968825454000 Å², have negative averaged sigma and therefore enter NHB, not OT.
- Before P_hb attenuation, the nitrogen OT area is distributed as:
  - sigma +0.000: 4.286702119025 Å²
  - sigma +0.001: 6.560942369550 Å²
  - sigma +0.002: 0.207598794426 Å²
- P_hb is zero at sigma 0, 0.010152196621 at +0.001, and 0.039994558715 at +0.002. The retained OT area is therefore 0.074910799129 Å², reproducing the six-decimal emitted value 0.074911 Å² within 4.796e-05 Å² per bin.

Thus `0.074911 Å²` is not the carbonyl acceptor area. It is the small probability-weighted remainder of near-zero-sigma nitrogen surface.

## Concrete conversion defects

### 1. Wrong averaging equation for the claimed profile contract

The emitted rows came from CPCM-X using the first frozen `crs.param_h2o` value, r_av = 0.30880726 Å, with decay coefficient 1. CPCM-X source `sigma_av.f90` has no Hsieh factor 3.57. The wrapper then labels the unchanged rows with r_av = 1.519126944937 Å and f_decay = 3.57. Those metadata values describe NIST Hsieh, not the calculation that produced the rows.

Recomputing the same retained surface with the exact NIST Hsieh equation gives OT = 0.100544443904 Å², not 0.074911 Å². Across all 153 bins, the maximum absolute discrepancy is 7.530081634901 Å² and the L1 discrepancy is 35.110920263628 Å².

### 2. Carbonyl oxygen fails the NIST positive-acceptor mask

With the retained CPCM-X charge sign, every carbonyl-oxygen segment remains negative after NIST Hsieh averaging. Exact NIST partitioning therefore sends all 25.968825454000 Å² of oxygen surface to NHB. A sign-inverted diagnostic produces OT = 9.270791929509 Å², demonstrating material sensitivity, but it is diagnostic only and is not an admitted correction. This observation proves an unresolved sign/mask incompatibility; it does not by itself prove that whole-surface sign inversion is the correct repair.

## Consequence

The proposed “tiny OT is mathematically correct under NIST sigma3” explanation is rejected. The current profile must not advance to the 236 measured LLE cases. A separate governed task must resolve both averaging and charge-sign conventions, regenerate every affected profile consistently, and then repeat topology and experimental gates.

The machine-readable result is `results.json`; the complete segment trace is `segment-audit.csv`.

`NMP_SIGMA3_CONVERSION_DEFECT_CONFIRMED`

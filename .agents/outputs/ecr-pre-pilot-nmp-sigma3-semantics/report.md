# NMP sigma3 semantics repair

## Verdict

`NMP_SIGMA3_SEMANTICS_GATE_PASSED`

The charge-sign bridge is now source-supported rather than inferred from desired
chemistry. Pinned xTB source shows that `--tmcosmo` negates the native ddCOSMO
`zeta` written by `--cosmo`; pinned CPCM-X invokes the native `--cosmo` route;
and pinned NIST `to_sigma.py` consumes charge/area directly under its positive
O/N/F acceptor mask. The governed conversion therefore multiplies every native
xTB segment charge density by -1 before applying NIST Hsieh averaging.

The generator now calculates, rather than relabels:

1. r_av^2 = 7.25/pi A^2 and f_decay = 3.57;
2. NHB/OH/OT atom and sign masks;
3. linear area interpolation on the -0.025 to +0.025 e/A^2 grid; and
4. post-binning P_hb = 1-exp(-sigma^2/(2*0.007^2)).

All six SAT/MONO/DI/POLY/PA/NMP profiles passed area, sign, Hsieh, binning,
P_hb, and chemical-partition checks. NMP has 68 carbonyl-oxygen
segments assigned to OT before probability attenuation and
9.270791929509 A^2 final OT area.

No UD, VT2005, ThermoSAC, or other restricted profile was read, copied,
transformed, or retained. The basis remains research-only,
CALIBRATION_REQUIRED, non-pilot-validated, non-release-eligible, and sulfur is
NOT_CALCULABLE.

The 236-case measured-LLE benchmark was not executed.

`NMP_SIGMA3_SEMANTICS_GATE_PASSED`

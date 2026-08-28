# New RRBO analogue molecular-pair qualification

**Decision: REJECT; governing status: FAIL_CLOSED.**

Admitted 31 direct composition-resolved dodecane + sec-butylbenzene + NMP tie lines at 288.15, 298.15, 308.15, and 318.15 K from NIST ThermoML (DOI 10.1021/je050191r). The complete tetradecane + pentylbenzene edge was frozen untouched before the sole fit. Both held endpoint identities occur independently in training, but the held pair does not. Sec-butylbenzene structural R/Q uses 5 ACH + ACCH + CH2 + 2 CH3; ACCH is the single Original-UNIFAC subgroup 13.

| holdout | rows | topology recall | tie-line RMSD |
|---|---:|---:|---:|
| untouched molecular pair | 38 | 0.868421 | 0.0682088789287185 |
| leave 323.2 K out | 8 | 0.875000 | 0.1375605820585463 |

Practically weak parameter directions changed from 10 to 9. Maximum nearest normalized descriptor distance changed from 0.5656854249492379 to 0.0.

The topology, RMSD, and thermodynamic gates are unchanged. Branching remains screen-only because one branched identity cannot separate its effect from carbon number; no cycloalkane contrast was admitted. DI/POLY, sulfur, and simulator integration remain fail-closed unless all gates pass and a separate integration review is approved.

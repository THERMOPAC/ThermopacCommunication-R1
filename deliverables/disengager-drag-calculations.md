# Independent disengager drag calculation

Reproduce: `npx tsx deliverables/disengager-drag-comparison.ts`. JSON retains full JavaScript numerical precision. No app/database changes. Frozen input and drag-source SHA-256 are checked. This is an isolated-drop screening calculation, not final geometry or release evidence.

40 °C nominal proxies: bottom rho_c=1015, rho_d=869 kg/m³; mu_c=0.001416, mu_d=0.0598 Pa s; sigma=0.011 N/m. Bottom lambda=42.231638418, Morton=4.1977484003804954e-9, log10(M)=-8.376983595196432. Top reverses phases; lambda=0.023678929765886286, Morton=0.01821632051018739.

N=4 and N=7 are UNBOUND outlet scenarios, not competing approved design authorities. Extract proxies are N=4: 2240.460813836314 kg/h / 1015 = 2.207350555503758 m³/h; N=7: 2282.926436894786 kg/h / 1015 = 2.2491886077781142 m³/h.

## Bottom inverse capture cutoff
Assumed fraction=0.5; U=Q/A; solve vt(dcrit)=U/0.5 with force balance. dcrit is equality to an assumed operating screen, not the zero-net-rise size (which would use vt=U), nor a carryover specification.

| Shell ID mm | U mm/s, N4–N7 | Required vt mm/s | dcrit µm | Re at cutoff | Eo at cutoff |
|---|---|---|---|---|---|
| 500 | 3.122762–3.181951 | 6.245524–6.363902 | 366.926–371.057 | 1.6427–1.6927 | 0.01752–0.01792 |
| 700 | 1.593246–1.623444 | 3.186492–3.246889 | 250.031–252.626 | 0.5711–0.5880 | 0.00814–0.00831 |
| 800 | 1.219829–1.242950 | 2.439658–2.485899 | 216.265–218.461 | 0.3782–0.3893 | 0.00609–0.00621 |
| 900 | 0.963816–0.982084 | 1.927631–1.964167 | 190.720–192.628 | 0.2635–0.2712 | 0.00473–0.00483 |
| 1000 | 0.780691–0.795488 | 1.561381–1.590975 | 170.682–172.371 | 0.1910–0.1966 | 0.00379–0.00387 |
| 1200 | 0.542146–0.552422 | 1.084292–1.104844 | 141.198–142.574 | 0.1097–0.1129 | 0.00259–0.00265 |

## Bottom same-diameter drag comparison
Stokes/HR are diagnostic only when creeping flow does not hold. Re in this table is from SN; JSON also records Stokes and HR Reynolds numbers. Re≤0.1 is a conservative diagnostic screen, not a sharp universal physical transition.

| Drop µm | SN vt mm/s | Stokes vt mm/s | HR vt mm/s | Myint clean vt mm/s | SN Re | Eo |
|---|---|---|---|---|---|---|
| 100 | 0.552720 | 0.561743 | 0.566108 | 0.556968 | 0.0396 | 0.00130 |
| 150 | 1.218672 | 1.263922 | 1.273743 | 1.227913 | 0.1310 | 0.00293 |
| 200 | 2.108000 | 2.246973 | 2.264432 | 2.123708 | 0.3022 | 0.00521 |
| 250 | 3.185763 | 3.510895 | 3.538175 | 3.209028 | 0.5709 | 0.00814 |
| 300 | 4.416318 | 5.055688 | 5.094972 | 4.447876 | 0.9497 | 0.01171 |
| 500 | 10.271548 | 14.043578 | 14.152701 | 10.338870 | 3.6814 | 0.03254 |

At 250 µm: HR/Stokes increase=0.7770%; Stokes overpredicts SN speed by 10.2058%; published Myint-clean vs SN speed increase=0.7303%. Eo and We are 0.008135061931818182 and 0.0002341209858731409. High viscosity ratio strongly suppresses mobility sensitivity; finite-Re drag matters more. The 250-µm point is below Myint's Eo validation minimum 0.017, so its clean result is a near-spherical extrapolation diagnostic, not validated RRBO evidence.

## Required ID for assumed capture targets
Worst bottom flow (N7), no swarm/coalescence credit:
- 150 µm: 1142.584 mm required ID at vt=1.218672 mm/s.
- 200 µm: 868.753 mm required ID at vt=2.108000 mm/s.
- 250 µm: 706.684 mm required ID at vt=3.185763 mm/s.
- 500 µm: 393.563 mm required ID at vt=10.271548 mm/s.

Thus 900 mm is a preliminary physics-conditional bottom candidate for 200-µm capture; 1200 mm is a candidate for 150 µm. This does not select geometry, establish actual entrainment size, qualify nozzles/residence time, or close top disengagement.

## Top: separate unresolved issue
At 700 mm ID:
| N | U mm/s | Conditional SN dcrit mm | Re | Eo |
|---|---|---|---|---|
| 4 | 2.758537 | 2.080748 | 0.166820 | 0.563534 |
| 7 | 2.723265 | 2.066822 | 0.163584 | 0.556016 |

The saved top mean drop 6.068311766098486 mm gives SN vt=0.03666566952730411 m/s, Re=3.2333007072916304, Eo=4.793101394644852, We=0.6444870805376383. Eo is not small: bottom shape reasoning cannot validate top mean-drop SN. Myint's drop correlation is relevant literature but top lambda=0.023678929765886286 is below its tested minimum 0.1; its clean extrapolation (0.05108326966840161 m/s) is NOT a validated correction or robust bound. Top cutoff also has Eo around 0.56 and Re above 0.1. Do not declare top capture proven from the saved mean diameter. Require applicable liquid-liquid deformation/mobility evidence, actual outlet properties and a capture-size/carryover basis.

See disengager-drag-evidence.md for verified source equations and applicability.

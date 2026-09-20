# RRBO / wet-NMP proposed hydraulic method — source matrix

**Status:** `ACCEPTANCE_REQUIRED`  
**Scope:** primary-source trace for `RRBO_WETNMP_KUHNI_HYDRAULIC_P0`; not a hydraulic solution

| ID | Primary source and exact locator | Verified proposition | Proposed use | Current-service extrapolation / unresolved item |
|---|---|---|---|---|
| S1 | Hinze (1955), *AIChE J.* 1, 289–295, DOI [10.1002/aic.690010303](https://doi.org/10.1002/aic.690010303) | Inertial turbulent-breakup / maximum-stable-scale provenance | Exponents only | Does not establish a Kühni `d32` coefficient or distribution |
| S2 | Kumar & Hartland (1996), *IECR* 35, 2682–2695, DOI [10.1021/ie950674w](https://doi.org/10.1021/ie950674w); ACS abstract | Average drop-size correlations for eight extractor classes including Kühni | Preferred future replacement candidate | Primary equation and table unavailable; no executable transcription is authorized |
| S3 | Kumar & Hartland (1995), *IECR* 34, 3925–3940, DOI [10.1021/ie00038a032](https://doi.org/10.1021/ie00038a032), Table 1; Eqs. 9, 15–19; Table 2 | Kühni ranges and operating-holdup correlation | Domain comparison only | Water-continuous table `μc=0.97–1.61 mPa s`; current RRBO `59.8 mPa s` is 37.1× above maximum |
| S4 | Myint et al. (2006), *JFST* 1, 72–81, DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72) | Rising-drop drag set; `0.1<κ<100`; surfactant influence | Comparator | Current κ 0.02368 is 4.22× below lower bound; drop falls |
| S5 | Barry & Parlange (2018), *PLOS ONE* 13:e0194907, pp. 3–9, Eqs. 3 and 7–12, DOI [10.1371/journal.pone.0194907](https://doi.org/10.1371/journal.pone.0194907) | Spherical fluid-particle drag for all viscosity/density ratios; exact Hadamard–Rybczynski limit; Re to a few hundred by comparisons | Clean/mobile scenario | Numeric sphericity gate still undefined; carry immobile scenario too |
| S6 | Richardson & Zaki (1954), *Trans. IChemE* 32, 35–53 | Uniform rigid-sphere hindrance; `n≈4.65` below `Re≈0.2` with wall effects negligible | Provenance/limit | Not used directly for liquid drops with Kühni internals |
| S7 | Garthe dissertation, TUM record [601973](https://mediatum.ub.tum.de/601973), visually checked printed p. 29 Eqs. 2.37–2.38 and p. 31 Eqs. 2.41–2.42 | `vrs=jd/φ+jc/(1-φ)`; `vs=vrs(1-φ)`; low-Re exponent 4.65 | Velocity definitions and asymptotes | Requires `vslip=vs/(1-φ)`; current reverse capacity path omits conversion |
| S8 | Garthe, printed p. 86 Eqs. 5.6–5.7 | Kühni characteristic-velocity equation; 143 points and reported 10.7% error | Characteristic velocity | Conventional pilot systems and geometry only |
| S9 | Garthe, visually checked printed p. 126 Eq. 8.3 | Radical covers drag ratio × `(1-φ)^4.65`; equation predicts superficial `vs` | Governing swarm closure | Convert to relative slip before root/capacity; use same scenario drag at both states |
| S10 | Garthe, printed p. 139 Fig. 8.11 | Kühni: 118 points; 23.5% average relative error; `D=80–152 mm`, `n=28–220 min^-1`; conventional systems | Source-domain check | Current fluid and any commercial scale remain extrapolations |
| S11 | Calabrese et al. (1986), *AIChE J.* 32, 657–666, DOI [10.1002/aic.690320416](https://doi.org/10.1002/aic.690320416) | Dispersed viscosity affects equilibrium mean drop size/distribution | Model-form warning | No verified continuous-RRBO Kühni correction |
| S12 | Pacek et al. (1998), *CES* 53, 2005–2011, DOI [10.1016/S0009-2509(98)00068-2](https://doi.org/10.1016/S0009-2509(98)00068-2) | `d32` depends on distribution bounds and shape | Population warning | A single `d32` needs measured distribution evidence |
| S13 | Sathyagal et al. (1996), *AIChE J.* 42, 1421–1431, DOI [10.1002/aic.690420606](https://doi.org/10.1002/aic.690420606) | Breakup continued for at least 10 h; simple `dmax` concept challenged | Supports `dmax≠d32` caution | Stirred-vessel evidence, not current-fluid qualification |

## Evidence controls

* Primary PDFs for Garthe and Barry–Parlange were newly retrieved from the TUM and open repository records, text-extracted, and visually inspected at the equation pages.
* Web search located sources; snippets are not equation authority.
* Kumar–Hartland (1996) remains bibliographically verified but equation-unavailable. Any implementation remains prohibited until the primary equation, symbols, coefficients, and ranges are independently transcribed and checked.
* Source fit error is not treated as a transferable confidence interval.
# ECR-2 RRBO SN300 physical pseudo-component basis

**Decision:** `PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS` for all four RRBO SN300
families. This is a physical engineering basis only. It is not a replacement
for, or input to, the Coto/NRTL surrogate coordinate system.

## A. Candidate methods reviewed

1. **Project/vendor/laboratory characterization** — preferred route. The
   current project supplies the RRBO grade, bulk density-temperature table,
   viscosity inputs, and four class mass fractions, but no class-specific
   TBP50, class density/specific gravity, GC/MS, GPC, or molecular-weight
   distribution. No governed class MW can be calculated from bulk density alone.
2. **Peer-reviewed petroleum characterization** — Riazi, “Characterization
   parameters for petroleum fractions,” *Industrial & Engineering Chemistry
   Research* 26(4), 1987, DOI `10.1021/ie00064a023`. It establishes generalized
   petroleum-fraction property relationships from characterizing properties,
   but does not supply RRBO SN300 class inputs.
3. **Established pseudo-component/family correlation** — API/Riazi–Daubert
   1987 MW form, used below. Public API documentation identifies the inputs as
   median boiling point and specific gravity and limits the route to
   petroleum fractions in its published range.
4. **Engineer-approved preliminary representation** — representative TBP50
   and specific-gravity anchors are registered for screening only, with broad
   class uncertainty and explicit replacement requirements.

## B. Equation and basis

For each family:

```text
M = 42.965 exp(2.097e-4 Tb - 7.78712 SG
    + 2.08476e-3 Tb SG) Tb^1.26007 SG^4.98308
```

`Tb` is in kelvin and `SG` is specific gravity at 15.6 °C. The density anchor
is the class screening basis for the molar-volume route:

```text
V_m [cm3/mol] = 1000 M [g/mol] / rho [kg/m3]
```

| Class | MW g/mol | Density kg/m3 | V_m cm3/mol | TBP50 °C | SG15.6 | Uncertainty |
|---|---:|---:|---:|---:|---:|---|
| Saturates | 269.93 | 820 | 329.18 | 326.85 | 0.820 | ±20% |
| Mono-aromatics | 320.00 | 870 | 367.82 | 376.85 | 0.870 | ±25% |
| Di-aromatics | 377.57 | 910 | 414.91 | 426.85 | 0.910 | ±30% |
| Poly-aromatics | 459.45 | 950 | 483.63 | 486.85 | 0.950 | ±35% |

The numbers above are not the Coto values `170.34`, `106.17`, `142.20`, or
`202.25`. Coto surrogate identities remain thermodynamic coordinates only.

## C. Current inputs, gaps, and applicability

The active service is RRBO SN300. Its EPD density table is bulk RRBO data and
does not resolve class densities. The four class wt% values describe mass
fractions but cannot determine four class molecular weights without an
additional characterization model. The preliminary anchors therefore remain
`ENGINEER_APPROVED_PRELIMINARY`, not `PROJECT_MEASURED`, `VENDOR_DOCUMENTED`,
or `PHYSICAL_MW_GOVERNED`.

Required replacement evidence is class TBP50/boiling-point distribution,
class-specific density/specific gravity, and preferably GC/MS or GPC
molecular-weight distribution. The basis applies only to `rrbo-sn300`; other
RRBO grades remain unresolved rather than inheriting SN300.

## D. Resolver and downstream status

The server-owned mapper registers all four values with value, unit, source,
method/equation, version, required/available/missing inputs, applicability,
uncertainty, and warnings. This makes physical MW auto-resolvable **X/4 =
4/4** for RRBO SN300 without per-run manual entry. The candidates remain
pending engineer acceptance and RRBO/NMP validation.

This closure makes the physical MW and representative density/molar-volume
prerequisites available to the eight RRBO solute Wilke–Chang routes
(`Dc/Dd` for Saturates, Mono-aromatics, Di-aromatics, and Poly-aromatics).
It does **not** calculate diffusivities. Operating-temperature solvent
viscosities, solvent MW/association factors, NMP self-diffusion, and the
separate Kühni C2 evidence remain independent Stage 8 dependencies.

## E. Stop report

- **A:** Candidate routes reviewed in priority order above.
- **B:** RRBO grade, bulk density table, operating temperature, viscosity
  inputs, and class mass fractions used only to establish applicability; no
  bulk-density-to-class-MW inference was made.
- **C:** Saturates — `269.93 g/mol`, preliminary approved basis, 820 kg/m³.
- **D:** Mono-aromatics — `320.00 g/mol`, preliminary approved basis, 870 kg/m³.
- **E:** Di-aromatics — `377.57 g/mol`, preliminary approved basis, 910 kg/m³.
- **F:** Poly-aromatics — `459.45 g/mol`, preliminary approved basis, 950 kg/m³.
- **G:** Density/molar-volume bases are class anchors listed in the table.
- **H:** Missing class TBP50, class density/SG, and MW-distribution evidence.
- **I:** Riazi 1987/API-Riazi–Daubert citation and versioned basis registry.
- **J:** Physical MW auto-resolvability is **4/4** for RRBO SN300.
- **K:** Eight RRBO solute diffusivity routes have their physical
  MW/molar-volume prerequisites unlocked; no diffusivity calculation was made.

**Hard stop:** No NRTL, K&H, BVP, or Stage 8 equations were changed.
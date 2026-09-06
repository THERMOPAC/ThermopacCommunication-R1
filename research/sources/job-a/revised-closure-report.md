# Item-2 Job-A revised pre-pilot closure

## Verdict

`JOB_A_CLOSED_FOR_PRE_PILOT_IMPLEMENTATION`

This closure authorizes a bounded predictive implementation only. It does not
qualify the model for release, vendor guarantee, or pilot-validated use.

## Frozen K&H base route

The equation-level authority is the accepted manuscript of Laitinen et al.
(2019), *Chemical Engineering Research and Design* 146, 518-527,
DOI `10.1016/j.cherd.2019.04.018`, manuscript equations 20-23.

For each component and local compartment:

\[
\frac{Sh_c-Sh_{c,\mathrm{rigid}}}{Sh_{c,\infty}-Sh_c}
=0.0526Re_d^{1/3+0.0659Re_d^{1/4}}Sc_c^{1/3}
\left(\frac{U_{\mathrm{slip}}\mu_c}{\gamma}\right)^{1/3}
\frac{1}{1+\kappa^{1.1}}
\]

\[
Sh_d=17.7+
\frac{0.00319(Re_dSc_d^{1/3})^{1.7}}
{1+0.0143(Re_dSc_d^{1/3})^{0.7}}
\left(\frac{\rho_d}{\rho_c}\right)^{2/3}
\frac{1}{1+\kappa^{2/3}}
\]

with \(Sh_{c,\mathrm{rigid}}\) and \(Sh_{c,\infty}\) from the same paper's
equations 13 and 14. Film coefficients are
\(k_{c,i}=Sh_{c,i}D_{i,c}/d_{32}\) and
\(k_{d,i}=Sh_{d,i}D_{i,d}/d_{32}\).

This is deliberately the base/single-drop route. It has no column holdup
correction and no \(C_1\psi\) or \(C_2\psi\) enhancement. Missing Kühni
\(C_2\) is therefore not replaced with zero or any inferred value.

RPM dependence remains in the frozen Stage-3 local state: \(d_{32}\), operating
holdup, interfacial area, slip velocity, Reynolds number, and phase properties.

## Mechanical-power provenance

The frozen Stage-3 definition is
\[
\psi=P/(\rho_cV_{\mathrm{compartment}})
=4P/(\pi D_C^2H_C\rho_c).
\]
Stage 3 currently evaluates \(P=N_P\rho_cN^3D_R^5\) with its frozen
\(N_P=1.2\). It separately evaluates
\[
N_P=1.08+10.94/Re_R^{1/2}+257.37/Re_R^{3/2}
\]
inside the characteristic-velocity correction. Stage 4 must consume the
Stage-3 state and must not duplicate or change either convention.

Because the selected K&H base route contains no \(\psi\), this distinction is
provenance, not a Job-A calculation blocker.

## Exact-identity Joback-Reid estimates

The group authority is Joback's 1984 MIT thesis, equation
\(V_c=17.5+\sum_kN_k\Delta V_{c,k}\) and complete critical-property group table.

### DI: 1-methylnaphthalene, CAS 90-12-0

| Joback group | Count | Contribution | Subtotal, cm3/mol |
|---|---:|---:|---:|
| non-ring -CH3 | 1 | 65 | 65 |
| ring =CH- | 7 | 41 | 287 |
| ring =C< | 3 | 32 | 96 |

\[
V_c=17.5+448=465.5\ \mathrm{cm^3/mol}.
\]

The count reconstructs C11H10 exactly.

### PA: 4,4'-bis(alpha,alpha-dimethylbenzyl)diphenylamine, CAS 10081-67-1

Frozen PubChem connectivity:
`CC(C)(C1=CC=CC=C1)C2=CC=C(C=C2)NC3=CC=C(C=C3)C(C)(C)C4=CC=CC=C4`.

| Joback group | Count | Contribution | Subtotal, cm3/mol |
|---|---:|---:|---:|
| non-ring -CH3 | 4 | 65 | 260 |
| non-ring >C< | 2 | 27 | 54 |
| ring =CH- | 18 | 41 | 738 |
| ring =C< | 6 | 32 | 192 |
| non-ring -NH- | 1 | 35 | 35 |

\[
V_c=17.5+1279=1296.5\ \mathrm{cm^3/mol}.
\]

The count reconstructs C30H31N and four benzene rings exactly.

Using the peer-reviewed reproduced Tyn-Calus relation
\[
V_b=0.285V_c^{1.048}
\]
with both volumes entered numerically in cm3/mol gives:

- DI: \(V_b=178.17\ \mathrm{cm^3/mol}\);
- PA: \(V_b=521.23\ \mathrm{cm^3/mol}\).

Both values are chained structural estimates, not experimental boiling-point
volumes. PA's estimate remains usable even if the compound decomposes before a
physical normal boiling point because no measured-boiling claim is made.

## Frozen predictive diffusivity fallback

Measured directional diffusivity at matching composition and temperature takes
precedence when available. Otherwise the executable pre-pilot fallback is the
componentwise Wilke-Chang form:

\[
D_{i,p}^{\infty}
=7.4\times10^{-8}
\frac{(\phi_pM_p)^{1/2}T}{\mu_pV_{b,i}^{0.6}}
\quad\mathrm{cm^2/s},
\]

where \(T\) is K, \(\mu_p\) is cP, \(M_p=\sum_jx_{j,p}M_j\) is the local
phase-average molecular weight in g/mol, and \(V_{b,i}\) is cm3/mol.

For both nonaqueous pseudophases, \(\phi_p=1\) is the documented
other/unassociated screening convention, not a fitted NMP value. When water is
the solute, use the documented Kooijman correction
\(V_{b,\mathrm{H2O}}^*=4.5V_{b,\mathrm{H2O}}\).

The output is directional because each phase supplies its own composition,
average molecular weight, and viscosity. All seven components, including NMP
and H2O, are evaluated in both phases.

Siddiqi-Lucas and Tyn-Calus remain independent sensitivity checks where their
additional molecular inputs are available; they are not needed for execution.

Every estimated output must carry at least:

- `PRE_PILOT_PREDICTIVE_APPROXIMATION`;
- `DIFFUSION_MODEL_APPROXIMATE`;
- `INFINITE_DILUTION_APPLIED_TO_LOCAL_PSEUDOPHASE`;
- `NOT_PILOT_VALIDATED`;
- `NOT_RELEASE_ELIGIBLE`;
- `CORRELATION_EXTRAPOLATED` whenever published ranges are exceeded or absent.

## Closure boundary

Job A closes because the selected base K&H equations, exact structural
decompositions, \(V_c\to V_b\) route, and executable diffusivity fallback have
no unresolved mathematical symbols or missing numerical properties.

Full K&H column enhancement, full Maxwell-Stefan transport, and pilot
diffusivity measurements remain future qualification improvements. They are
not pre-pilot execution prerequisites.
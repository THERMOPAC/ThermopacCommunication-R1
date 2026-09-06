# Kumar & Hartland (1999): evidence report

## Scope and verification status

Target paper:

- A. Kumar and S. Hartland, “Correlations for Prediction of Mass Transfer Coefficients in Single Drop Systems and Liquid–Liquid Extraction Columns,” *Chemical Engineering Research and Design*, **77**(5), 372–384 (July 1999).
- DOI: https://doi.org/10.1205/026387699526359
- PII/publisher record: https://www.sciencedirect.com/science/article/pii/S0263876299718022

**Primary-source result:** the ScienceDirect publisher record verifies the title, authors, journal, volume/issue, date, pages, DOI, and abstract, but exposes only an article preview and explicitly requires institutional sign-in or purchase for full text. The PDF-shaped ScienceDirect URL returned the same preview, not the article PDF. Therefore, the original equation numbers, equation typography, complete symbol definitions, parameter ranges, test-system table, and the exact primary-source definition of \(\psi\) are **not primary-source verified and remain inaccessible** in this search. Nothing below should be represented as a transcription from the 1999 primary paper.

The publisher abstract does directly verify that:

- the continuous-phase correlation used 596 measurements from 10 investigator groups and had 14.1% average absolute error;
- dispersed-phase fitting used overall dispersed-phase coefficient data from 21 sources and gave 24.5% average absolute relative error;
- single-drop correlations were extended to columns through corrections for power input per unit mass and dispersed-phase hold-up; and
- the column correction factors used simulated overall coefficients for pulsed perforated-plate, Karr reciprocating-plate, Kühni, and rotating-disc columns.

## Best academic reproduction found

Torab-Mostaedi et al. (2011), printed p. 452, states that Kumar and Hartland developed the following correlations for pulsed, Karr, Kühni, and rotating-disc columns:

https://www.scielo.br/j/bjce/a/qQ7RfB6LNySVZWzHVRy6jyS/?format=pdf&lang=en&ilang=en

Its local equation (8), continuous phase, is extracted by `webFetch` as:

\[
\frac{Sh_c/(1-x_d)-Sh_{c,\mathrm{right}}}
{Sh_{c,\infty}-Sh_c/(1-x_d)}
=5.26\times10^{-2}
Re^{\,1/3+6.59\times10^{-2}Re^{0.25}}
Sc_c^{1/3}
\left(\frac{V_s\mu_c}{\sigma}\right)^{1/3}
\frac{1}{1+\kappa^{1.1}}
\left[1+C_1\left\{\frac{\psi}{g}
\left(\frac{\rho_c}{g\sigma}\right)^{0.25}\right\}^{1/3}\right].
\]

Its local equation (9), dispersed phase, is extracted as:

\[
Sh_d=17.7+
\frac{3.19\times10^{-3}(Re\,Sc_d^{1/3})^{1.7}\rho_d^{2/3}}
{1+1.43\times10^{-2}(Re\,Sc_d^{1/3})^{0.7}\rho_c^{2/3}}
\frac{1}{1+\kappa^{2/3}}
\left[1+C_2\left\{\frac{\psi}{g}
\left(\frac{\rho_c}{g\sigma}\right)^{0.25}\right\}^{1/3}\right].
\]

The same paper gives, as its local equations (10)–(12):

\[
Sh_{c,\mathrm{right}}=2.43+0.775Re^{1/2}Sc_c^{1/3}
+0.0103Re\,Sc_c^{1/3},
\]

\[
Sh_{c,\infty}=50+\frac{2}{\sqrt{\pi}}Pe_c^{1/2},
\]

\[
\psi=\frac{\pi^2(1-\varepsilon^2)}
{2\varepsilon^2 C_c^2h_c}(Af)^3.
\]

It then states \(C_1=C_2=4.33\) **for pulsed columns**. The reproduced \(\psi\) has units of power dissipated per unit mass, \(m^2\,s^{-3}\). In that paper: \(A\) is pulsation amplitude (m), \(f\) pulsation frequency (\(s^{-1}\)), \(\varepsilon\) fractional free area (dimensionless), \(h_c\) compartment height (m), \(g\) acceleration due to gravity (\(m\,s^{-2}\)), and \(C_c\) is the orifice coefficient (dimensionless). This is a secondary reproduction, not primary verification of Kumar–Hartland’s notation.

The same source defines:

- \(Re=d_{32}V_s\rho_c/\mu_c\) (dimensionless);
- \(Pe_c=d_{32}V_s/D_c\) (dimensionless);
- \(Sc_c=\mu_c/(\rho_cD_c)\), \(Sc_d=\mu_d/(\rho_dD_d)\) (dimensionless);
- \(Sh_c=k_cd_{32}/D_c\) and \(Sh_{oc}=k_{oc}d_{32}/D_c\) (dimensionless);
- \(V_s\), slip velocity, in \(m\,s^{-1}\);
- \(\mu\), viscosity, in Pa·s; \(\rho\), density, in \(kg\,m^{-3}\);
- \(\sigma\), interfacial tension, in \(N\,m^{-1}\);
- \(\kappa\), viscosity ratio, and \(x_d\), dispersed-phase hold-up, dimensionless.

The PDF text extraction prints the \(Sh_d\) definition as \(k_cd_{32}/D_c\), which is internally inconsistent with its “dispersed-phase Sherwood” label. It is reported as an extraction defect/possible source typo and is **not silently corrected**.

## Independent secondary reproduction and conflict

Asadollahzadeh et al. (2017), Table 3, local equation (18), independently reproduces the continuous-phase column correlation and gives:

- \(C_1=4.33\), 2.44, 7.5, and 0 for pulsed, Karr, Kühni, and rotating-disc columns, respectively.
- URL: https://ijcce.ac.ir/jufile?ar_sfile=344118

However, its extracted exponent typography conflicts with the 2011 reproduction. The table text/rendered equation reads approximately
\(Re^{1/2+6.59\times10^{-2}}Re^{1/4}\), while the 2011 extraction reads
\(Re^{1/3+6.59\times10^{-2}Re^{0.25}}\). Because the primary full text is inaccessible, this conflict is unresolved; the exponent must not be selected or “repaired” by inference.

No fetched source established non-pulsed values of \(C_2\). Only \(C_1\) has the four equipment-specific values above, while the 2011 pulsed-column paper explicitly gives \(C_1=C_2=4.33\) for pulsed columns. Missing \(C_2\) values must not be assumed equal to \(C_1\).

## Applicability and limits

Primary-source verified applicability is limited to what the abstract says: circulating and oscillating single drops, then extensions based on simulated overall coefficients for the four named column types. Numerical ranges of \(Re\), \(Sc\), \(Pe\), \(d_{32}\), physical properties, and the underlying chemical systems are not exposed in the primary preview and were not recovered from a reliable author manuscript or repository.

The 2011 source’s use of the equations in a pulsed disc-and-doughnut column is a later application, not proof that this equipment was in the original fitting set. That study also reports that Kumar–Hartland lacked sufficient accuracy for its own system; this is evidence against treating the correlation as universally transferable.

## Evidence files

- `01-sciencedirect-primary-metadata.md`: primary publisher record and abstract.
- `02-mdpi-2023-review-reproduction.md`: secondary 2023 review page (fetch truncated before all relevant material).
- `03-scielo-2011-column-study.md`: secondary HTML extraction.
- `04-scielo-2011-pdf-extracted.md`: secondary PDF extraction containing equations (8)–(12), printed p. 452.
- `05-acs-1999-companion-primary-metadata.md`: primary publisher metadata for the same authors’ companion sizing paper, https://pubs.acs.org/doi/10.1021/ie980455l; full text restricted and not used to fill gaps.
- `06-ijcce-2017-kuhni-study.md`: secondary academic paper containing Table 3 and equipment-specific \(C_1\) values.

## Search record

More than four diverse direct searches were run, including: exact title/pages; PII and DOI/publisher metadata; author manuscripts and repository PDFs; theses/dissertations reproducing \(\psi\) and \(C_1\); exact coefficient-string searches (`5.26`, `6.59`, `17.7`, `3.19×10^-3`); and equipment-specific \(C_1/C_2\) searches. Google Books/repository-oriented searches did not locate an accessible primary manuscript.
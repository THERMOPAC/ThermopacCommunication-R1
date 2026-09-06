URL: https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html
Fetched evidence (webFetch):

Transport Properties

This section includes definitions of the models available in for thermal conductivity, viscosity, and diffusivity:

|     |     |
| --- | --- |
| • | [Thermal Conductivity](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074599 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Viscosity](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074922 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Diffusivity](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075602 "Transport Properties") |

Thermal Conductivity

Vapor

Ideal

The thermal conductivity correlations is according to:

(6-133)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.001.png)

The pressure correction Δλv,P is calculated from the method of Stiel and Thodos, see [Ref. 30](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076281 "References"), which is applicable for ρr < 3, but is less accurate for H2, strongly polar gases, and gases with a high degree of hydrogen bonding, such as H2O and NH3

(6-134)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.002.png)

(6-135)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.003.png)

(6-136)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.004.png)

The mixing rules are as suggested by Yorizane, see [Ref. 31](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076283 "References"):

(6-137)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.005.png)

(6-138)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.006.png)

(6-139)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.007.png)

(6-140)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.008.png)

(6-141)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.009.png)

(6-142)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.010.png)

where the binary constants are

(6-143)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.011.png)

(6-144)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.012.png)

The Stiel and Thodos coefficients are

|     |     |     |     |
| --- | --- | --- | --- |
|  | A | B | C |
| ρr < 0.5 | A1=2.702E8 | B1=0.535 | C1=-1 |
| 0.5 ≤ ρr < 2.0 | A2=2.528E8 | B2=0.670 | C2=-1.069 |
| ρr ≥ 2.0 | A3=0.574E8 | B3=1.155 | C3= 2.016 |

Table 6-4: pressure correction parameters.

However, in order to ensure 0th-order continuity at ρr = 0.5 and ρr = 2.0, the following coefficients for 0.5 ≤ ρr < 2.0 are recalculated from

(6-145)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.013.png)

(6-146)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.014.png)

The vapor thermal conductivity correlation must be available for all species. Also critical volumes, Vc,i, critical temperatures, Tc,i, molecular weights Mi, and acentric factors ωi must be specified for all species.

Kinetic Theory

Lindsay and Bromley (see [Ref. 32](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076285 "References")) provided an equation for the interaction parameters of the method of Wassiljewa (see [Ref. 33](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076287 "References")) based on the kinetic theory, to provide mixture thermal conductivity from pure species values

(6-147)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.015.png)

(6-148)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.016.png)

where the pressure correction Δλv,P is calculated from [Equation 6-134](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074616 "Transport Properties"). Both vapor thermal conductivity correlation λi,v and the vapor viscosity correlation ηi,v must be available for all species. In addition, all normal boiling points Ti,b, molecular weights Mi, critical volumes Vc,i, critical temperatures Tc,i, and acentric factors ωi must be specified.

Water (IAPWS)

The International Association of the Properties of Water and Steam recommend an equation [Ref. 34](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076289 "References") which is valid in the following range:

(6-149)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.017.png)

(6-150)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.018.png)

(6-151)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.019.png)

Liquid

The following mixture models are available for liquid thermal conductivity

Ideal

To calculate the mixture liquid thermal conductivity, λl,m, the values of pure liquid thermal conductivity correlations are mixed ideally

(6-152)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.020.png)

The pressure dependence is based on the work of Missenard ([Ref. 51](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076323 "References")) where

(6-153)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.021.png)

where Q is correlated as

(6-154)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.022.png)

and the following mixing rules are used

(6-155)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.023.png)

(6-156)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.024.png)

(6-157)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.025.png)

(6-158)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.026.png)

(6-159)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.027.png)

(6-160)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.028.png)

All liquid thermal conductivity correlations must be specified. All values for critical temperatures, Tc,i, critical volumes, Pc,i and critical compressibility factors, Zc,i must be specified for all species i.

Power Law

The values of pure liquid vapor thermal conductivity correlations are mixed according to the following power law

(6-161)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.029.png)

All liquid thermal conductivity correlations must be specified. The model is valid for pure compound thermal conductivity values that are no more apart than a factor of 2 ([Ref. 52](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076325 "References") and [Ref. 53](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076328 "References")). The pressure dependence is introduced using [Equation 6-153](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074775 "Transport Properties") through [Equation 6-160](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074806 "Transport Properties"). All values for critical temperatures, Tc,i, critical volumes, Pc,i and critical compressibility factors, Zc,i must be specified for all spices i.

Local Composition

The local composition model by Rowley ([Ref. 53](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076328 "References")) uses an ideal and excess contribution

(6-162)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.030.png)

The ideal part is based on mass fractions

(6-163)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.031.png)

(6-164)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.032.png)

The excess term is based on NRTL local concentrations

(6-165)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.033.png)

where Gj,i follows from [Equation 6-58](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.21.html#1073846 "Thermodynamic Models"). The binary interaction terms follow from

(6-166)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.034.png)

which is symmetric, and on the diagonal,

(6-167)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.035.png)

and

(6-168)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.036.png)

with ϖi is the composition in the binary mixture of species i and j and the local composition is equi-molar

(6-169)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.037.png)

All liquid thermal conductivity correlations must be specified. The pressure dependence is introduced using [Equation 6-153](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074775 "Transport Properties") – [Equation 6-160](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074806 "Transport Properties"). All values for critical temperatures Tc,i, critical volumes Pc,i, critical compressibility factors Zc,i, and molecular weights Mi must be specified for all compounds i. In addition, all NRTL binary interaction parameters Ai,j must be specified. Unspecified values for NRTL interaction parameters Bi,j are set to zero. The randomness parameters αi,j have values of zero on the diagonal and the matrix is symmetric. All off-diagonal values must be specified. NRTL model is presented in [Equation 6-54](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.21.html#1073827 "Thermodynamic Models") to [Equation 6-65](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.21.html#1073880 "Thermodynamic Models").

Local Composition (Modified)

Rowley ([Ref. 52](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076325 "References")) adapted the local composition model by replacing the mixing rule in [Equation 6-166](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074860 "Transport Properties") by the following

(6-170)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.038.png)

which he found to produce better model predictions in most cases where both the Local Composition model and Power Law model have trouble. However, the model is not as generally applicable; for instance, systems containing H2O are not well described by this model due to the low molecular weight of H2O.

Water (IAPWS)

The International Association of the Properties of Water and Steam recommend an equation [Ref. 34](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076289 "References") which is valid in the following range:

(6-171)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.039.png)

(6-172)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.040.png)

(6-173)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.041.png)

Viscosity

Vapor

Wilke

Wilke, see [Ref. 35](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076291 "References"), based his method for mixture viscosity of the vapor phase on kinetic theory:

(6-174)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.042.png)

(6-175)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.043.png)

The vapor viscosity correlation ηi,v must be available for all species. In addition, all molecular weights Mi must be specified.

Brokaw

Brokaw (see [Ref. 36](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076293 "References")) uses the same basic equation as Wilke ([Equation 6-174](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074934 "Transport Properties")). However, [Equation 6-175](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074939 "Transport Properties") is replaced by

(6-176)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.044.png)

and the interaction parameter is defined as

(6-177)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.045.png)

where

(6-178)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.046.png), ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.047.png)

The vapor viscosity correlation, ηi,v must be available for all species i. In addition, all molecular weights Mi must be specified. If Lennard–Jones energy εi (see [Ref. 37](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076295 "References")) Stockmayer’s polar parameter δs,i ([Ref. 38](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076297 "References") and [Ref. 39](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076299 "References")) are specified for both species i and j then

(6-179)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.048.png)

Otherwise,

(6-180)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.049.png)

Davidson

The Davidson method, see [Ref. 40](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076301 "References"), requires fewer compound specific parameters than Brokaw, while reported accuracy is almost as good, and in the case of H2, even surpasses it. The Davidson model only requires molar masses and the viscosities of the pure gases. The model is based on fluidity, which is defined to be the reciprocal viscosity.

(6-181)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.050.png)

The fluidity of the mixture is then calculated as

(6-182)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.051.png)

where yi is the momentum fraction of species i; Ei,j is the momentum transfer coefficient of the species pair i, j; and A is an empirical species-independent parameter set to 1/3. The momentum fraction is given by

(6-183)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.052.png)

and the momentum transfer coefficient is taken as

(6-184)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.053.png)

High Pressure Modification

To account for the effect of pressure on vapor viscosity, a pressure correction can be applied. The pressure dependence is based on kinetic gas theory, which adds the following term to the vapor viscosity:

(6-185)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.054.png)

where ξ is calculated from the correlation of Jossi ([Ref. 41](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076303 "References")), which is applicable for ρr < 3.0. It is less accurate for H2, strongly polar gases and gases with a high degree of hydrogen bonding such as H2O and NH3.

The correction factor is due to using pressure, atm, and viscosity, cP, units in Jossi’s correlation. It is expressed as:

(6-186)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.055.png)

(6-187)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.056.png)

(6-188)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.057.png)

The following mixture rules are used

(6-189)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.058.png), ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.059.png), ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.060.png)

(6-190)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.061.png), ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.062.png)

The values for critical volumes, Vc,i, critical temperatures, Tc,i, critical compressibility factors, Zc,i and molecular weights, Mi must be specified for all species i.

The high pressure correction is available for the Wilke, Brokaw, and Davidson mixture models. The vapor viscosity follows from

(6-191)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.063.png)

where ηv,Wilke is calculated from [Equation 6-174](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1074934 "Transport Properties").

Pedersen Corresponding States Model

The corresponding states viscosity model of Pedersen ([Ref. 42](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076305 "References") and [Ref. 43](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076307 "References")) applies to both vapor and liquid phases of hydrocarbon mixtures. The selected reference species is CH4.

The CH4 viscosity is calculated from [Ref. 44](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076309 "References"), modified by Pedersen and Fredenslund ([Ref. 45](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076311 "References")) to avoid issues below 91 K where CH4 becomes solid

(6-192)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.064.png)

where

(6-193)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.065.png)

(6-194)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.066.png)

(6-195)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.067.png)

(6-196)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.068.png)

Here, ρCH4 is used in g/cm3; for the mass-mole conversion of ρCH4, a molecular weight of MCH4 = 16.042568 g/mol is used.

The dilute gas part is given by

(6-197)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.069.png)

The first density correction for the moderately dense gas is given by

(6-198)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.070.png)

The remainder is given by the empirical correlation

(6-199)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.071.png)

The correction term for solid CH4

(6-200)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.072.png)

with the values of the parameters L1 through L25 are listed in [Table 6-5](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075135 "Transport Properties") below:

|     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- |
| L1 | 2.090975·105 | L10 | 1.696985927 | L19 | 9.74602 |
| L2 | 2.647269·105 | L11 | 0.133372346 | L20 | 44.6055 |
| L3 | 1.472818·105 | L12 | 188.73011594 | L21 | 18.0834 |
| L4 | 47167.40 | L13 | 10.35060586 | L22 | 4126.66 |
| L5 | 9491.827 | L14 | 17.571599671 | L23 | 0.976544 |
| L6 | 1219.979 | L15 | 3019.3918656 | L24 | 81.8134 |
| L7 | 96.27993 | L16 | 0.042903609488 | L25 | 15649.9 |
| L8 | 4.274152 | L17 | 145.29023444 |  |  |
| L9 | 0.08141531 | L18 | 6127.6818706 |  |  |

Table 6-5: methane viscosity Numerical coefficients.

Here, ρCH4 is used in g/cm3; the critical density is given by ρc,CH4 = 0.16284 g/cm3. The following equation by McCarty ([Ref. 46](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076313 "References")) is solved for the density of CH4

(6-201)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.073.png)

where ρCH4 is used in mol/l.

|     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- |
| N1 | 0.08205616 | N13 | 2.8685285973 | N25 | 1.6428375992·106 |
| N2 | 0.018439486666 | N14 | 0.11906973942·10-3 | N26 | 0.21325387196 |
| N3 | 1.0510162064 | N15 | 0.0085315715699 | N27 | 37.791273422 |
| N4 | 16.057820303 | N16 | 3.8365063841 | N28 | 0.1185701681·10-4 |
| N5 | 848.44027562 | N17 | 0.24986828379·10-4 | N29 | 31.630780767 |
| N6 | 42738.409106 | N18 | 0.57974531455·10-5 | N30 | 0.4100678294·10-5 |
| N7 | 0.76565285254·10-3 | N19 | 0.0071648329297 | N31 | 0.0014870043284 |
| N8 | 0.48360724197 | N20 | 0.12577853784·10-3 | N32 | 3.151226153·10-9 |
| N9 | 85.195473835 | N21 | 0.0096 | N33 | 0.2167077474·10-5 |
| N10 | 16607.434721 | N22 | 22240.102466 | N34 | 0.2400055107·10-4 |
| N11 | 0.37521074532·10-4 | N23 | 1.4800512328·106 |  |  |
| N12 | 0.028616309259 | N24 | 50.498054887 |  |  |

Table 6-6: coefficients in the functional form of the mccarty eos.

With the viscosity and density of CH4 defined, the viscosity of any mixture, ηm, can be calculated from the corresponding states principle

(6-202)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.074.png)

where the CH4 viscosity ρCH4,P0,T0 is calculated at temperature T0 and pressure P0:

(6-203)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.075.png)

(6-204)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.076.png)

The following mixing rules are used for the critical properties, see [Ref. 47](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076315 "References"):

(6-205)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.077.png)

(6-206)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.078.png)

(6-207)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.079.png)

The parameter α is

(6-208)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.080.png)

(6-209)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.081.png)

where

(6-210)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.082.png)

(6-211)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.083.png)

with ρc,CH4 = 0.16284 g/cm3. For CH4

(6-212)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.084.png)

where [Equation 6-209](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075460 "Transport Properties") is used. The mixture molecular weight is a function of the weight-averaged molecular weight and the number-averaged molecular weight

(6-213)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.085.png)

(6-214)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.086.png)

(6-215)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.087.png)

where the power in [Equation 6-213](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075483 "Transport Properties") is determined by fitting to experimental viscosity data.

Note that pure species vapor viscosity correlations ηi,v are not required. However, for each species i, molecular weight Mi, critical temperature, Tc,i, and critical pressure, Pc,i must be specified.

Water (IAPWS)

The International Association of the Properties of Water and Steam recommend an equation [Ref. 48](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076317 "References")–[Ref. 49](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076319 "References") for industrial application which is valid in the following range:

(6-216)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.088.png)

(6-217)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.089.png)

(6-218)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.090.png)

(6-219)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.091.png)

(6-220)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.092.png)

where Tm is the pressure dependent melting temperature and pt is the triple-point pressure. In accordance with industrial application recommendations, critical region correction is not applied.

Liquid

The following mixture models are available for liquid viscosity.

Molar Logarithmic Mixing

The values of pure species log liquid viscosity, lnηi,l are mixed ideally using mole fractions xi

(6-221)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.093.png)

where ηm,l is the mixture viscosity of liquids.

Mass Logarithmic Mixing

The values of pure species log liquid viscosity correlation are mixed ideally using the weight fractions ωi

(6-222)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.094.png)

Pedersen Corresponding States Model

The [Pedersen Corresponding States Model](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075071 "Transport Properties") described above for the gas phase viscosity also applies to the liquid phase. Pure species liquid viscosity correlations are not required. However, for each species i, molecular weight Mi, critical temperature Tc,i, and critical pressure Pc,i, must be specified.

Cubic mixing

The mixture viscosity is defined using the cubic root average in terms of the mole fractions xi

(6-223)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.095.png)

The model is noted in [Ref. 50](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076321 "References") to provide reasonable results for hydrocarbon mixtures of similar components.

The model requires that the log liquid viscosity correlation is available for all species i.

Cubic mass mixing

The mass fraction equivalent of the previous model is

(6-224)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.096.png)

The model requires that the log liquid viscosity correlation is available for all species i.

Water (IAPWS)

The International Association of the Properties of Water and Steam recommend an equation [Ref. 48](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076317 "References")–[Ref. 49](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076319 "References") for industrial application which is valid in the following range:

(6-225)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.097.png)

(6-226)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.098.png)

(6-227)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.099.png)

(6-228)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.100.png)

(6-229)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.101.png)

where Tm is the pressure dependent melting temperature and pt is the triple-point pressure. In accordance with industrial application recommendations, critical region correction is not applied.

Diffusivity

Two types of diffusion coefficients are supported. Diffusion coefficients in infinitely diluted systems, and Maxwell–Stefan diffusion coefficients.

For dilute systems, the binary diffusion coefficient D0i,j represent the diffusivity of species i in a medium consisting of pure species j. This corresponds to the Fickian diffusion coefficient.

For any mixture, the binary Maxwell–Stefan diffusion coefficient ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.102.png), represents the inverse drag coefficient of species i moving past species j ([Ref. 54](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076330 "References")–[Ref. 57](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076334 "References")). This property is referred to as the Maxwell–Stefan diffusivity. The Maxwell–Stefan diffusivity is symmetric, ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.103.png), and the diagonal elements ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.104.png) are not used.

Gas Phase Diffusion Coefficient at Infinite Dilution

The following models are available for the diffusion coefficients at infinite dilution in the vapor phase:

|     |     |
| --- | --- |
| • | [Fuller–Schettler–Giddings](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075640 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Wilke–Lee](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075794 "Transport Properties") |

Automatic

When the Gas diffusivity property model is set to Automatic, the [Fuller–Schettler–Giddings](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075640 "Transport Properties") model is used, provided that the Fuller diffusion volume is known for both species (i and j), otherwise the [Wilke–Lee](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075794 "Transport Properties") model is used.

Fuller–Schettler–Giddings

Fuller and others ([Ref. 58](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076336 "References")) modified the Chapman–Enskog relation to correlate binary diffusion coefficient for species i and j in the vapor phase according to the Fuller–Schettler–Giddings (FGS) model:

(6-230)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.105.png)

where T denotes the temperature (K), Mi the molecular weight of species i (g/mol) and P is the pressure(Pa). vi are the atomic diffusion volumes (Fuller diffusion volume, cm3), which are estimated using group contribution for each species ([Ref. 59](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076338 "References")):

|     |     |
| --- | --- |
| group | contribution |
| C | 15.9 |
| H | 2.31 |
| O | 6.11 |
| N | 4.54 |
| F | 14.7 |
| Cl | 21 |
| Br | 21.9 |
| I | 29.8 |
| S | 22.9 |
| Aromatic Ring | -18.3 |
| Heterocyclic Ring | -18.3 |

Table 6-7: Atomic and structural diffusion volume increments.

For some simple molecules the values below, determined from regression, are used:

|     |     |
| --- | --- |
| Species | Fuller Diffusion Volume |
| He | 2.67 |
| Ne | 5.98 |
| Ar | 16.2 |
| Kr | 24.5 |
| Xe | 32.7 |
| H2 | 6.12 |
| D2 | 6.84 |
| N2 | 18.5 |
| O2 | 16.3 |
| CO | 18 |
| CO2 | 26.9 |
| N2O | 35.9 |
| NH3 | 20.7 |
| H2O | 13.1 |
| SF6 | 71.3 |
| Cl2 | 38.4 |
| Br2 | 69 |
| SO2 | 41.8 |
| Air | 19.7 |

Table 6-8: Diffusion volumes of atom and simple molecules.

Wilke–Lee

Wilke and Lee ([Ref. 60](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076340 "References")) also modified the Chapman–Enskog relation to correlate binary diffusion coefficient in vapor phase according to:

(6-231)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.106.png)

where

(6-232)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.107.png)

The length scale σi,j for the interaction is taken from the Lennard–Jones diameter parameters of species i and j:

(6-233)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.108.png)

If ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.109.png) is not specified in the database, it is instead estimated from:

(6-234)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.110.png)

where Vi,l,b is the molar volume of species at normal boiling point.

The collision integral ΩD is evaluated from ([Ref. 61](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076342 "References")):

(6-235)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.111.png)

with

(6-236)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.112.png)

The energy scale εi,j for the interaction is taken from the Lennard–Jones energy parameters of species i and j:

(6-237)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.113.png)

If ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.114.png) is not specified in the database, it is instead estimated from:

(6-238)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.115.png)

where k is the Boltzmann constant and Ti,l,b is the normal boiling point temperature.

Gas Phase Maxwell–Stefan Diffusivity

For gas phase diffusion the Maxwell–Stefan diffusivities are defined from the models for gas phase diffusivity at infinite dilution

(6-239)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.116.png)

All models for gas phase diffusion at infinite dilution are symmetric, the diffusivity of species i in species j equals that of species j in species i. In addition, under the ideal gas assumption, the Maxwell–Stefan diffusion coefficient matches the Fick diffusion coefficient. This implies that the Maxwell–Stefan gas diffusivities provided are independent of composition.

Liquid Phase Diffusion Coefficients at Infinite Dilution

The following models are available for the diffusion coefficients at infinite dilution in liquid phase:

|     |     |
| --- | --- |
| • | [Wilke–Chang](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075926 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Tyn–Calus](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075970 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Hayduk–Minhas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075984 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Siddiqi–Lucas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076008 "Transport Properties") |

|     |     |
| --- | --- |
| • | [Erkey–Rodden–Akgerman](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076029 "Transport Properties") |

Automatic

When the Liquid diffusivity at infinite dilution property model is set to Automatic, a selection for each solute i in solvent j will be made from the models according to the following rules. Except in the case of a temperature correlation and the [Erkey–Rodden–Akgerman](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076029 "Transport Properties") model, all of these rules require that the log liquid viscosity correlation, ln ηj is available in the database for species j and that the liquid volume at normal boiling point, Vi,l,b is available for the species i.

|     |     |
| --- | --- |
| • | If a temperature correlation is available for species i and j, it is used. |

|     |     |
| --- | --- |
| • | If the solvent is water, the [Siddiqi–Lucas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076008 "Transport Properties") correlation (for aqueous systems) is used. |

|     |     |
| --- | --- |
| • | If the solute and solvent are both normal paraffins, the [Hayduk–Minhas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075984 "Transport Properties") correlation (for normal paraffins) is used. |

|     |     |
| --- | --- |
| • | If the solvent is a normal paraffin, and the liquid density correlation for the solvent is available, and the solute is hydrogen, carbon-monoxide or carbon-dioxide, the [Erkey–Rodden–Akgerman](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076029 "Transport Properties") correlation (for normal paraffins) is used. |

|     |     |
| --- | --- |
| • | If parachors Pi and Pj are both available, and the liquid volume at normal boiling point, Vi,l,b is available for the solvent, the [Tyn–Calus](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075970 "Transport Properties") correlation is used. |

|     |     |
| --- | --- |
| • | If parachors Pi and Pj are both available, the [Hayduk–Minhas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075984 "Transport Properties") correlation is used. |

|     |     |
| --- | --- |
| • | If the solute and solvent are both organic molecules and the liquid volume at normal boiling point, Vi,l,b is available for the solvent, the [Siddiqi–Lucas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076008 "Transport Properties") method is used. |

|     |     |
| --- | --- |
| • | If the molecular weight Mj is available for the solvent, the [Wilke–Chang](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075926 "Transport Properties") correlation is used. |

|     |     |
| --- | --- |
| • | If the solvent is a normal paraffin, and the liquid density correlation for the solvent is available, and the solute is a normal paraffin, the [Erkey–Rodden–Akgerman](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076029 "Transport Properties") correlation (for normal paraffins) is used. |

|     |     |
| --- | --- |
| • | If the solvent is a normal paraffin, and the liquid density correlation for the solvent is available, and the Lennard–Jones diameter for the solute is available, the [Erkey–Rodden–Akgerman](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076029 "Transport Properties") correlation (for normal paraffins) is used. |

For the [Siddiqi–Lucas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076008 "Transport Properties") method, a molecule is considered organic if it has at least one C atom bound to anything other than O or C atoms. This is determined by the SMILES formula, if available. If, for any pair of species, the required input data for none of the above models is available, the entire property liquid diffusion coefficient at infinite dilution is not available.

Wilke–Chang

The correlation by Wilke and Chang ([Ref. 62](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076347 "References")) for liquid phase diffusion coefficients at infinite dilution is:

(6-240)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.117.png)

Molecular weight, Mj, and log liquid viscosity correlation, ln ηj, for species j and liquid molar volume at normal boiling point for species i, Vi,l,b, is required. The Wilke–Chang association parameter ϕj, if unavailable, is set to:

|     |     |
| --- | --- |
| Solvent | Association parameter |
| Water | 2.26 ([Ref. 63](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076349 "References")) |
| Methanol | 1.9 |
| Ethanol | 1.5 |
| Others | 1 |

Table 6-9: Association Parameters for Solvent.

Species are identified by their CAS number or SMILES formula. The Wilke–Chang correlation is not suitable for diffusion of water. If water is the solute, the correction suggested by Kooijman ([Ref. 64](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076351 "References")) is applied where liquid molar volume of water at normal boiling point, Vwater,l,b is multiplied by 4.5.

Tyn–Calus

The Correlation by Tyn and Calus ([Ref. 65](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076353 "References")) for liquid diffusion coefficients at infinite dilution reads:

(6-241)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.118.png)

The log liquid viscosity correlation ln ηj should be available for species j, The liquid volume at normal boiling point, Vi,l,b and parachor, Pi should be available for both species i and j.

If the solvent is nonpolar (dipole moment is zero), and the solvent is methanol, ethanol or1-butanol or if the solvent is a mono-hydroxy alcohol, both the liquid volume at normal boiling point, Vj,l,b and the parachor, Pj are corrected by a factor of 8 × 103ηj.

If the solute is water, both the liquid volume at normal boiling point, Vi,l,b and parachor, Pi for the solute are corrected by a factor 2. This factor also applies if it is detected from the SMILE formula that the species is an organic acid (a carboxyl group is found), except in the cases where the solvent is water, methanol, or n-butanol.

Hayduk–Minhas

Hayduk and Minhas ([Ref. 66](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076355 "References")) suggested three different correlations for liquid diffusion coefficients at infinite dilution.

Aqueous Solutions: in case the solvent is water (derived from CAS number or SMILES formula), the correlation reads:

(6-242)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.119.png)

Normal paraffin solutions: In case both the solute and solvent are normal paraffins (derived from SMILES formula), the correlation reads:

(6-243)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.120.png)

For all other systems, the correlation is:

(6-244)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.121.png)

If the solvent is nonpolar (dipole moment is zero), and the solvent is methanol, ethanol or1-butanol or if the solvent is a mono-hydroxy alcohol, both the liquid volume at normal boiling point, Vj,l,b and the parachor, Pj are corrected by a factor of 8 × 103ηj.

If the solute is water, both the liquid volume at normal boiling point, Vi,l,b and parachor, Pi for solute are corrected by a factor 2. This factor also applies if it is detected from the SMILES formula that the species is an organic acid (a carboxyl group is found), except in the cases where the solvent is water, methanol, or n-butanol.

Siddiqi–Lucas

Siddiqi and Lucas ([Ref. 67](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076357 "References")) suggested correlations for liquid diffusion coefficients at infinite dilution for aqueous system (including gases) and for organic solutions. For normal paraffins systems, they recommended the [Hayduk–Minhas](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1075984 "Transport Properties") model.

For aqueous solutions:

(6-245)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.122.png)

For all other systems, the equation for organic solution is used as:

(6-246)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.123.png)

Where T is the temperature, Vi,l,b is the liquid volume at normal boiling point and ηj is the viscosity of the solvent.

Erkey–Rodden–Akgerman

The correlation by Erkey and others ([Ref. 68](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076359 "References")) for liquid diffusion coefficients at infinite dilution in normal paraffins is:

(6-247)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.124.png)

where the reference volume is

(6-248)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.125.png)

NAv is Avogadro’s number, and the deviation from closest packing volume is given by

(6-249)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.126.png)

The correlation is fitted to normal paraffins, hydrogen, carbon monoxide and carbon dioxide diffusing in normal paraffins. The molecular weight Mi should be available for both solute and solvent. The Lennard–Jones diameter, σi is estimated from Bondi group contribution method ([Ref. 69](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076361 "References")), and for some species are taken from [Ref. 68](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076359 "References") and [Ref. 70](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076363 "References") as:

|     |     |
| --- | --- |
| Species | ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.127.png) (m) |
| H2 | 2.92 |
| CO | 3.72 |
| CO2 | 3.97 |
| n-CjH2j+2 | (21.82+32.44\*j)1/3 |

Table 6-10: Molecular Diameters for species.

To prevent the diffusion coefficients from becoming negative, the minimum difference of (V − Vjref) is considered to be 10−12 mol/m3.

Liquid Phase Maxwell–Stefan Diffusivity

The Maxwell–Stefan liquid diffusion coefficients are calculated from the liquid diffusion coefficients at infinite dilution. The diagonal values should be ignored and are set to zero. The Vignes ([Ref. 71](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076365 "References")) model for diffusion in binary solutions can be extended to multicomponent systems ([Ref. 72](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076367 "References")):

(6-250)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.128.png)

where ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.129.png) denotes the Maxwell–Stefan liquid diffusion coefficient for species i and j in the limited of pure species k. If k = j, it represents a binary system of species i and j where i is infinitely diluted. In addition, at infinite dilution the thermodynamics factor (activity) ([Ref. 57](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076334 "References")) becomes unity and the Maxwell–Stefan diffusivity equals to Fick diffusivity:

(6-251)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.130.png)

Similarly,

(6-252)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.131.png)

Models for the ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.132.png) for k ≠ i and k ≠ j remain to be defined in such a way that symmetry is ensured:

(6-253)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.133.png)

and to ensure continuity if both species i and j vanish:

(6-254)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.134.png)

For binary systems, [Equation 6-250](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076100 "Transport Properties") reduces to the Vignes interpolation formula.

Wesselingh–Krishna

Wesselingh and Krishna ([Ref. 72](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076367 "References")) proposed:

(6-255)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.135.png)

leading to:

(6-256)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.136.png)

Kooijman–Taylor

Kooijman and Taylor ([Ref. 73](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076369 "References")) found on a limited number of systems that this provides better results:

(6-257)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.137.png)

leading to:

(6-258)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.138.png)

Wesselingh and Bollen ([Ref. 74](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076371 "References")) asserted that this is a reasonable estimate.

Krishna–van Baten

Krishna and van Baten ([Ref. 75](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076373 "References")), on the basis of data obtained from molecular dynamic simulations, proposed the following Vignes-based ([Ref. 71](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.29.html#1076365 "References")) interpolation:

(6-259)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.139.png)

The model reduces to the [Kooijman–Taylor](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/chem_ug_thermo.11.27.html#1076150 "Transport Properties") model for xi = xj. The value of ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.140.png) is undefined in the limit of both xi → 0 and xj → 0. From a physical point of view this is inconsequential as the value cancels out in the expressions obtained for the fluxes using the Maxwell–Stefan equations. Nevertheless, in order to obtain well-defined values and composition derivatives of ![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.141.png)itself, the equation is modified to:

(6-260)![](https://doc.comsol.com/6.4/doc/com.comsol.help.chem/images/chem_ug_thermo.11.27.142.png)

where εx = 10−10 is taken as a small composition. The limiting case for both xi → 0 and xj → 0 also reduces to the [Kooijman–Taylor]
…[truncated]
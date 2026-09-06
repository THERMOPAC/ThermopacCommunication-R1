Source URL: https://docs.aft.com/chempakviewer3/Content/Chempak_Liquids_Technical_Information.html
Fetched directly with webFetch.

![](https://docs.aft.com/chempakviewer3/Content/Chempak_Liquids_Technical_Information.html)

## |     | | --- | | **Chempak Technical Information - Detailed Discussion** |

© Copyright 1998 Madison Technical Software Inc. Used with permission.

Note: The information in this Appendix was taken from Section 8 of the Chempak Operating & Reference Manual, Version 4, Windows Edition, Issue: January 1998. Section numbering was left unchanged, and some sections that were judged not relevant were not included so the numbering is not sequential. Notation and references in this Appendix apply only to this Appendix, and are referenced at the end.

8.1 General

This section sets out the data sources, correlations and estimation methods used in the CHEMPAK database. In putting together the database, the methods and sources were selected in the following order of preference.

·        Published experimental data

·        Published correlations based on experimental data

·        Specific category correlations

·        General estimation methods

Madison Technical Software has followed the general recommendations in Reid and in Danner and Daubert as far as selection of specific category correlations and general estimation methods are concerned. In selecting specific compound data, a combination of sources has been used wherever possible. Important sources of specific compound data used by CHEMPAK are:

·        Reid et al

·        Perry et al

·        J Chem Eng Data

·        Daubert & Danner

·        ESDU publications

·        API Technical Data Book - Petroleum Refining

·        International Critical Tables

·        CRC Handbook

·        Vargaftik

In many cases, the compound property values are a combination of published data, published correlations and general estimation methods. Several properties in certain compound categories have been estimated or adjusted by Madison Technical Software. It has been our policy to adopt and maintain a critical approach to available data sources and correlation methods.

The following sections set out details of the correlations and estimation methods used. In certain cases, the user is directed to the original references, particularly where the method is complex.

Data sources for Aqueous Solutions/Heat Transfer Liquids are published experimental data and correlations based on experimental data.

8.2 Physical Constants

8.2.1 Critical Temperature

The great majority of values are believed to be experimental. Where values had to be estimated, the Joback method was used.

8.2.2 Critical Pressure

Most of the values are experimental. In cases where experimental data were not available, the critical pressure was derived from the Joback method.

8.2.3 Critical Volume

A majority of the values are experimental. A great majority of the remaining compounds for which experimental values were not available had accurate boiling-point volumes available from which critical volume estimates were derived using the Tyn and Calus correlation. For a few substances, estimates of the critical volume were derived from the Joback method.

8.2.4 Normal Boiling Points

All values are believed to be experimental. In some cases, the values were slightly adjusted for vapor pressure.

8.2.5 Freezing Points

Where possible, quoted freezing points are experimental. No accurate method of estimation of  compound  freezing point  is available.  In the absence of experimental data, a rough estimate was derived from the Joback method.

8.2.6 Acentric Factors

The acentric factor is defined as

w = -log10(Pvr at Tr = 0.7) - 1

In all cases the acentric factor was derived from the vapor pressure correlation ( see section 8.8)

8.2.7 Joback Group Contribution Method

The Joback method is used to derive values of Tc, Pc, Vc and Tf where no experimental data or other predictive method was available.

Tc = Tb/(0.584 + 0.965 Sum(Dt) - Sum(Dt)2)

Pc = 1/(0.113 + 0.0032 na - Sum(Dp))2

Vc = 17.5 + Sum(Dv)

Tf = 122 + Sum(Df)

where na is the number of atoms in the molecule and the D contributions are given by Joback and by Reid et al (1987). Error magnitudes for the Joback method are as follows:

·        Critical Temperature: average error about 1%

·        Critical Pressure: average error about 5%

·        Critical Volume: average error about 2%

·        Freezing Point: average error about 11%

8.2.8 Tyn & Calus Relation

Tyn & Calus showed a close (< 3% error) relation between molar volume at normal boiling point and the critical molar volume of the form,

Vb = a Vcn

a = 0.285

n = 1.048

8.3 Liquid Specific Volume

Liquid specific volume rises slowly and approximately linearly with rise in temperature to about Tr  =  0.8. At higher temperatures, the values rise more rapidly to the critical point.

Experimental data or correlations derived from experimental data are available for most compounds.

8.3.1 Hankinson-Brobst-Thompson Equation

The saturated specific volume is given by,

Vs/V\* = Vr(O)(1 - wsrkVr(1))

Vr(O) = Sum{­an(1 - Trn/3)}             0.25 < Tr < 0.95

Vr(1) = Sum{­bnTrn/(Tr - 1.00001)}      0.25 < Tr < 1.0

aO = 1

a1 = -1.52816

a2 = 1.43907

a3 = -0.81446

a4 = 0.190454

bO = -0.296123

b1 = 0.386914

b2 = -0.0427258

b3 = -.0480645

V\*, wsrk and Tc are tabulated property constants. The user is referred to Hankinson, Thompson and to Reid et al (1987). Errors are typically about 1% with most being less than 2%.

8.3.2 Rackett Equation

If a reference volume (Vref at Tref) is available then

Zra = (PcVref / RTc)n

n = 1/(1 + (1 - Tref / Tc)m)

m = 2/7 or other empirical constant

The saturated specific volume is given by,

Vs = VrefZrax

with

x = -(1 - Tref / Tc)m + (1 - T/Tc)m

In most cases, an experimental value of reference density was available.  Where such a value was not available, values were derived from the group contribution method of Le Bas or derived from the critical volume using the Tyn & Calus relation. Tests by Madison Technical Software on over 80 liquids showed  that these two methods were significantly more accurate than the Spencer and Danner method for Zra.  The reader is referred to Reid et al for further  details on  these methods. With one or more experimental points, the Rackett equation gives errors of about 1% with most values less than 3%. If the reference volumes are estimated, typical errors are 3%.

8.3.4 The Effect of Pressure on Liquid Specific Volume

The effect of pressure on liquid specific volume is calculated when

P > Ps + 0.1 Pc

The correction is derived from the equation of state as follows,

VL = VLs - VLs,es + VL,es

VL = specific volume at T and P

VLs = VL at T and Ps from methods of this section

VLs,es = VL at T and Ps from the equation of state

VL,es = VL at T and P from the equation of state

Liquid specific heat can in principle be derived from the equation of state but in practise, direct analytical or group contributions are preferred where experimental data are not available.

8.4 Liquid Specific Heat

8.4.1 Rowlinson-Bondi Method

(CpL - Cpo)/R = 1.45 + 0.45/X + 0.25w(17.11 + 25.2X0.333/Tr + 1.742/X)

X = 1 - Tr

w = acentric factor

This method is generally applicable to the range from Tf to values approaching Tc. Note that CpL approaches infinity as T approaches Tc.

Errors are generally less  than 5% except in the case of hydrogen-bonding polar compounds (e.g.   alcohols) at low temperatures. For these compounds, the Missenard group contribution method is preferred.

8.4.2 Missenard Method

The Missenard group contribution method yields values of coefficients in

CpL = a + bT + cT2

The accuracy is usually better than 5%.  The method cannot deal with double bonds and is not applicable for Tr > 0.75

a = Sum{­an}

b = Sum{­bn}

c = Sum{­cn}

The group contributions are available in Missenard. See also Reid at al.

8.4.3 The Effect of Pressure on Liquid Specific Heat

As noted above, the equations of state can be employed to estimate liquid specific heat, but the methods presented in 8.4.1 and 8.4.2 are more reliable. The equations of state however can be used to estimate the effect of pressure on liquid specific heat.

CpLs = CpL at Ts and Ps determined by the methods of this section.

Cpo = ideal gas specific heat at Ts

CpL = CpL at Ts and P > Ps

The equations of state give estimates of

Ds = (CpLs - Cpo)es at Ts and Ps

D = (CpL - Cpo)es at Ts and P

The corrected value of the liquid specific heat is

CpL = CpLs + D - Ds

The correction is not applied when T is close to Tc

8.5 Liquid Viscosity

Liquid viscosity typically varies in magnitude by a factor of 100 or more between the freezing and critical temperatures. No generalized method is available to estimate or represent liquid viscosity adequately over the entire temperature range. Corresponding states methods are applicable above Tr = 0.76.  From the freezing point to the boiling point, the influence of structure is strong.

8.5.1 Method of Van Velzen

The method of Van Velzen et  al is a group contribution method of some  complexity and  range  of applicability. It is the most frequently used group contribution method. The accuracy of the estimation averages about 10% and most estimates are better than 20%.  Some of the limitations of the method are:

·        Larger errors found with the  first  members of  a homologous series

·        Only normal and iso substitutions on alkyl chains can be treated

·        Heterocyclic compounds cannot be treated

·        Application only in the range Tf to Tb

The method is complex and the reader is directed to the original references for full details.

8.5.2 Method of Morris

The method of Morris is a group contribution method.  This method is useful as a comparison and substitute for the Van Velzen method in cases where the Van Velzen method is not applicable. The accuracy of estimation is of the same order as Van Velzen. The limitations of the method are,

·        The method is less detailed than the Van Velzen method

·        Applicable only in the range Tf to Tb

·        No explicit treatment  for  heterocyclics  or  esters  (apart from acetates).

The Morris method takes the following form

ln(v/v\*) = 2.3026 J(1/Tr - 1)

J = (0.577 + Sum(Di))0.5

The values of v\* are given for various categories of compounds. The constants v\* and the group contributions D are given in Morris.

8.5.3 Method of Letsou and Stiel

This is a corresponding states method with applicability over 0.76 < Tr < 1.  The method also predicts the viscosity at the critical point  (Tr =  1). The accuracy is normally better than 5% up to Tr = 0.92 with higher errors encountered as the critical point is approached. Overall this is an excellent estimation method for high-temperature liquid viscosity. The only serious limitation is the restricted range of applicability.

The form of the relation is

v = (f0 + w.f1)/A

with

w = acentric factor

f0 = a0 + b0Tr + c0Tr2

f1 = a1 + b1Tr + c1Tr2

A = 0.176x106 Tc0.1667/M0.5Pc0.667

a0 = 2.648               a1 = 7.425

b0 = -3.725              b1 = -13.39

c0 = 1.309               c1 = 5.933

In the above relations Pc is in bar and the viscosity is in units of Pa-sec.

8.5.4 Method of Przezdziecki & Sridhar

In this method, the viscosity is related to changes in the specific volume.

v = V0/E(V - V0) centipoise

V = liquid molar volume in cc/mol

E = -1.12 + Vc/D

D = 12.94 + 0.1 M - 0.23 Pc + 0.0424 Tf - 11.58 Tf/Tc

V0 = 0.0085 wTc - 2.02 + Vf / {­0.342(Tf / Tc) + 0.894}

with

Tc = critical temperature, K

Pc = critical pressure, bar

Vc = critical volume, cc/mol

M = molecular weight

Tf = freezing point, K

w = acentric factor

Vf = specific volume at Tf

The authors recommend that the volumes be estimated from the Gunn and Yamada equation.   The reader is referred to Reid for a discussion on this method. The method is less accurate below reduced temperatures of about 0.55.   Errors vary widely but will normally be less than 20% for Tr greater than 0.55.

This method is used in CHEMPAK only where necessary. An error analysis by Reid et al indicates a higher level of error associated with this method than with the Van Velzen method for instance.

8.5.5 Interpolation and Extrapolation

Two regions are typically covered well by available experimental data, experimental correlations and by the above relations:

273 <  T < 0.6 Tc:  this region is normally  covered by published data or by one of the methods 8.5.1, 8.5.2, 8.5.4

0.76 Tc <  T < Tc: this  region is well covered by  the method of Letsou and Stiel (section 8.5.3)

This leaves two regions which are often not covered by the above methods

Tf < T  < 273: this region may be covered by extrapolation using ln(v)  versus   1/T  extrapolation. The error due to the extrapolation in practise will not normally exceed 10% with a possible 20% error in the immediate vicinity of the freezing point.

0.6 Tc < T < 0.76 Tc: this region may be covered by interpolation between the 273 < T  < 0.6 Tc region and the 0.76 Tc < T  < Tc region using ln(v) versus 1/T interpolation. The errors due to interpolation in this case rarely exceed 5%.

8.5.6 The Effect of Pressure on Liquid Viscosity

The method of Lucas is applied:

vL/vsL = (1 + B.FA)/(1 + w.C.F)

vL = viscosity at pressure P

vsL = viscosity at saturation pressure Ps

F = (P - Ps)/Pc

w = acentric factor

A = 0.9991 - 0.0004674/(1.0523/Tr0.03877 - 1.0513)

B = 0.3257/(1.0039 - Tr2.573)0.2906 - 0.2086

C = -0.07921 + 2.1616 Tr - 13.404 Tr2 + 44.1706 Tr3  -84.8291 Tr4 + 96.1209 Tr5 - 59.8127 Tr6 + 15.6719 Tr7

8.6 Liquid Thermal Conductivity

8.6.1 Method of Latini at al

For specified categories of compounds, the method of Latini et al gives correlations for liquid conductivity for the range Tr = 0.3 to 0.8

The correlations are in the form

k = A(1 - Tr)0.38/Tr0.167

A = A0TbnMmTcp

Category                                A0             n        m          p

Alkanes                                 0.0035       1.2    -0.5    -0.167

Alkenes                                0.0361       1.2    -1.0    -0.167

Cycloalkanes                         0.0310       1.2    -1.0    -0.167

Aromatics                              0.0346       1.2    -1.0    -0.167

Alcohols/Phenols                   0.00339     1.2    -0.5    -0.167

Acids                                     0.00319     1.2    -0.5    -0.167

Ketones                                 0.00383     1.2    -1.0    -0.167

Esters                                    0.0415        1.2   -1.0    -0.167

Ethers                                    0.0385        1.2    -1.0   -0.167

Halides                                  0.494          0.0    -0.5     0.167

R20,R21,R22,R23                 0.562          0.0    -0.5     0.167

Errors may be large for Diols and Glycols. The Acids equation is not applicable to Formic acid.  The reader is referred to Reid for a discussion of the method.

8.6.3 Method of Sato-Riedel

This method gives the following relation:

k = (1.11/M0.5)f(Tr)/f(Tbr)

with

f(X) = 3 + 20(1 - X)0.667

This method gives poor results for low molecular weight or branched hydrocarbons.   Errors otherwise are likely to be less than 15%. The method should not be applied for Tr > 0.8

8.6.4 Method of Ely and Hanley

The method of Ely and Hanley has application to the high-temperature liquid region (Tr > 0.8). There are few data available for high temperature liquid conductivities. The method of Ely and Hanley is probably the best method available. Error estimates are unknown.

This method is used in CHEMPAK for Tr  > 0.8 with caution.  It appears to give reasonable results for non-polar compounds. Errors with polar compounds can be large.

8.6.5 The Effect of Pressure on Liquid Conductivity

The procedure derived from Missenard as presented in Danner and Daubert is employed:

k/ks = 0.98 + 0.0079 PrTr1.4 + 0.63 Tr1.2Pr/(30 + Pr)

k = conductivity at P

ks = conductivity at Ps

8.8 Vapor Pressure

The vapor pressure is expressed in its reduced form

Pvr = Pv/Pc

Reduced vapor pressure varies from very low values at freezing point to unity at the critical point.

8.8.1 Published Correlations

The experimental correlations are commonly given in the following formats:

Wagner Equation

ln(Pvr) = (aX + bX1.5 + cX3 + dX6)/Tr

with

X = 1 - Tr

FKT Equation

ln(Pv) = a + b/T + cln(T) + dPv /T2

Antoine Equation

ln(Pv) = a + b/(T + c)

8.8.2 Gomez-Thodos Vapor Pressure Equation

Gomez-Nieto and Thodos give the following equation:

ln(Pvr) = B(1/Trm - 1) + G(Tr7 - 1)

G = aH + bB

a = (1 - 1/Tbr)/(Tbr7 - 1)

b = (1 - 1/Tbrm)/(Tbr7 - 1)

H = Tbrln(Pc/Pb)/(1 - Tbr)

For non-polar compounds,

B = -4.267 - 221.79/(H2.5exp(0.038 H2.5)) + 3.8126/exp(2272.33/H3) + D

m = 0.78425 exp(0.089315 H) - 8.5217/exp(0.74826 H)

D = 0

except D = 0.41815 for He, 0.19904 for H2, 0.02319 for Ne

For polar non-hydrogen-bonding compounds (e.g. ammonia and acetic acid),

m = 0.466 Tc0.1667

G = 0.08594 exp(0.0007462 Tc)

B = (G - aH)/b

8.8.2 Gomez-Thodos Vapor Pressure Equations

For polar hydrogen-bonding compounds (water, alcohols),

m = 0.0052 M0.29Tc0.72

G = (2.464.M) exp(0.0000098 MTc)

B = (G - aH)/b

The advantages of this method are,

·        fit guaranteed at T = Tb and T = Tc

·        good performance with polar compounds

·        good performance over Tr = 0.5 to 1

In addition, tests carried out by Madison Technical Software show the clear superiority of this method especially at low temperatures over the Lee-Kesler method.

8.8.3 Lee-Kesler Vapor Pressure Equation

Lee and Kesler give the following vapor pressure equation:

ln(Pvr) = f(0) + wf(1)

w = acentric factor

f(0) = 5.92714 - 6.09648/Tr - 1.28862 ln(Tr) + 0.169347 Tr6

f(1) = 15.2518 - 15.6875/Tr - 13.4721 ln(Tr) +0.43577 Tr6

The characteristics of this equation are,

·        guaranteed fit at Tr = 1 and 0.7

·        accurate for non-polar compounds

This equation is used in the Lee-Kesler and Wu & Stiel equations of state.

8.8.4 Interpolation and Extrapolation

In many cases an accurate empirical equation is known which does not extend to the critical point or to the freezing point. The approach taken here is to fit the Wagner equation by least squares to the empirical equation and use the Wagner equation to extrapolate to the freezing point and to the critical point.

Extrapolation by this method to the critical method is a very accurate procedure. Extrapolation to the freezing point is less accurate but it does provide reasonable values.

In CHEMPAK, the vapor pressure correlations set out in this section are used to provide the basic data. Empirical relations are used wherever possible.

8.14 Notation

C Specific Heat

e Expansion Coefficient

h Enthalpy

log Logarithm to base 10

ln Natural Logarithm

m Dipole Moment

M Molecular Weight

P Pressure

R Gas Constant

r Riedel Parameter

s Entropy

T Temperature

v Viscosity

V Specific Volume

w Acentric Factor

x Mole Fraction

Y Wu & Stiel Polarity Factor

Z Compressibility

Subscripts

b Boiling

c Critical

es Equation of State

f Freezing

ig Ideal Gas

L Liquid

m Mixture

0 Low Pressure

p Constant Pressure

ra Rackett

ref Reference

r Reduced

s Saturated

v Vapor

v Constant Volume

Superscripts

(o) Simple Fluid

(r) Reference Fluid

(p) Polar Fluid

8.15 References

API Technical Data Book - Petroleum Refining, 4 Vols, API, Washington DC, 1988

CRC Handbook of Chemistry and Physics, CRC Press Boca Raton 1991

Danner R P and Daubert T E , Data Prediction Manual, Design Institute for Physical Property Data , AIChE, NY 1983

Daubert T E and Danner R P, Physical and Thermodynamic Properties of Pure Chemicals, Data Compilation, AIChE, Hemisphere NY 1989

Engineering Sciences Data Units (ESDU), (9 Vols Data Compilation), London, England

Gomez-Nieto M and Thodos G, Ind Eng Chem Fundam, Vol 17, 45, 1978, Can J Chem Eng, Vol 55, 445, 1977, Ind Eng Chem Fundam, Vol 16, 254, 1977

Hankinson and Thomson, AIChEJ, Vol 25, 653, 1979

International Critical Tables, National Research Council, 7 Vols, McGraw-Hill, NY 1926

Joback K G, SM Thesis, MIT, June 1984

Keenan et al, Steam Tables, John Wiley, NY 1978

Knapp et al, Chem Data Ser, Vol VI, DECHEMA 1982

Kreglewski and Kay, J Phys Chem, Vol 73, 3359, 1969

Letsou A and Stiel L I, AIChEJ, Vol 19, 409, 1973

Le Bas G, Molecular Volumes of Liquid Chemical Compounds, Longmans Green, NY 1915

Lee B I and Kesler M G, AIChEJ, Vol 21, 510, 1975

Li C C, AIChEJ, Vol 22, 927, 1976

Lucas K, Chem Ing Tech, Vol 53, 959, 1981

Missenard F A, Rev Gen Thermodyn, Vol 101, 649, 1970

Morris P S, MS Thesis, Polytech Inst Brooklyn, NY 1964

Perry et al , Chemical Engineer's Handbook (various editions), McGraw Hill, NY

Plocker U J et al, Ind Eng Chem Proc Des Dev, Vol 17, 324, 1978

Prausnitz and Gunn, AIChEJ, Vol 4, 430 and 494, 1958

Reid R C at al, Properties of Liquids and Gases, 3rd Ed, McGraw Hill, NY 1977, 4th Ed, McGraw Hill, NY 1987

Schick and Prausnitz, AIChEJ, Vol 14, 673, 1968

Spencer and Danner, J Chem Eng Data, Vol 17, 236, 1972

Spencer, Daubert and Danner, AIChEJ, Vol 19, 522, 1973

Stiel and Thodos, AIChEJ, Vol 8, 229, 1962

Teja A S at al, Chem Eng Sci, Vol 33, 609, 1978, AIChEJ, Vol 26, 337 & 341, 1980, Chem Eng Sci, Vol 36, 7, 1981, Ind Eng Chem Fundam, Vol 20, 77, 1981, Chem Eng Sci, Vol 37, 790, 1982, J Chem Eng Data, Vol 28, 83, 1983, Ind Eng Chem Proc Des Dev, Vol 22, 672, 1983

Thomson, Brobst, Hankinson, AIChEJ, Vol 28, 671, 1982

Tyn M T and Calus W F, Processing, Vol21(4), 16, 1975

Van Velzen D et al, Ind Eng Chem Fundam, Vol 11, 20, 1972

Van Velzen et al, Liquid Viscosity etc, Euratom 4735e, Joint Nuclear Research Centre, ISPRA Establishment, Italy 1972

Vargaftik N B, Tables on Therm Props Liq & Gases, 2nd Ed, Hemisphere, Washington DC, 1975

Wu G Z A and Stiel L I, AIChEJ, Vol 31, 1632, 1985

Yorizane et al, Ind Eng Chem Fundam, Vol 22, 454, 1983
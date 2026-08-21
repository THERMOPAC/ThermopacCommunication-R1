---
name: ECR-2 effective transfer volume
description: Governing volume basis for converting ECR-2 local volumetric transfer rates into compartment transfer flows.
---

Use the total modeled active liquid compartment volume:

\[
V_{\mathrm{effective},j}=A_{\mathrm{column},j}\Delta z_j
\]

This is the existing ECR-2 compartment geometry basis. Do not invent a liquid-fraction, rotor, stator, shaft, vapor, or other internals-displacement deduction unless a future governed geometry definition explicitly supplies it.

**Why:** Specific interfacial area is calculated as \(a=6\phi_d/d_{32}\), which is interfacial area per total active liquid volume. It already incorporates dispersed holdup.

**How to apply:** Convert a local rate in kg/m³/s using \(M_i=r_iV_{\mathrm{effective}}3600\) for kg/h. Do not multiply the volume conversion by \(\phi_d\), \(1-\phi_d\), or \(a\) again. The equivalent direct form is \(K_{\mathrm{overall}}A_{\mathrm{interface}}\Delta C\), where \(A_{\mathrm{interface}}=aV_{\mathrm{effective}}\).
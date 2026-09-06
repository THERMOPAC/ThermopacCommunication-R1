---
name: ECR Job-B local flux boundary
description: Scalar local two-film flux is distinct from a full molar-average multicomponent column solver.
---

Job B is bounded to seven-component interfacial flux and frozen local Stage-3
coupling. Compartment count, height, efficiency, and final RPM are outside this
authorization.

**Why:** The user explicitly separated local transfer validation from column
sizing. A broader existing solver is not authority to expand that scope.

**How to apply:** Use Job-A transport values and solved pinned seven-component
local equilibrium. A preflight is not a tie-line. Preserve NT=calculated-or-7
independently of the equilibrium engine identity.

The componentwise algebraic two-film approximation requires matching film
rates and equal/opposite phase sources, not an imposed cross-component
zero-sum flux. Do not import full Maxwell–Stefan or multicompartment
molar-average constraints as prerequisites for this local approximation.

**Why:** The local Laitinen/Fells two-film route closes with a defined
concentration partition. With m=Cd*/Cc*, the continuous-basis resistance is
1/Kc=1/kc+1/(m*kd); using m/kd instead reverses the convention.

**How to apply:** Declare the fixed bulk concentration closure as preliminary,
validate both film residuals, and retain the actual local equilibrium gates.
A coincident-phase local solution blocks flux for that state without implying
whole-process infeasibility or invalidating the NT fallback.
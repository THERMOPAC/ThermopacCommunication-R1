---
name: ECR Pre-Pilot Dortmund coverage
description: Public Modified UNIFAC Dortmund coverage result for the five representative Pre-Pilot components
---

## Rule

The frozen public Modified UNIFAC (Dortmund) package has complete subgroup and
ordered interaction coverage for the five-component representative basis:
n-dodecane, toluene or 1,4-xylene, 1-methylnaphthalene, pyrene, and NMP.
Treat this as a parameter-completeness pass only. It does not validate LLE
accuracy or the 25–100 °C design range.

**Why:** all required groups and all twenty directed off-diagonal interactions
are present, but the package declares no single global temperature-validity
interval and the direct five-family benchmark is limited to 298.15 K.

**How to apply:** freeze and fingerprint the exact public parameter package,
validate closure before every calculation, and fail with a named missing-pair
blocker for any changed component basis. Never zero-fill an absent interaction
or copy its reverse direction.
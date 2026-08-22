---
name: ECR-2 Stage 4 temperature authority
description: Governs the single temperature source and evidence behavior for ECR-2 Stage 8 properties.
---

Stage 4 Extraction Temperature is the single authoritative isothermal condition for ECR-2 Stage 8. It must drive local property closure and every temperature-dependent property lookup, interpolation, calculation, and snapshot; Stage 8 must not introduce a separate operating-temperature input.

**Why:** A stale engine-shaped temperature and property anchors at another temperature could otherwise make ECR-2 calculate transport, holdup, or d32 quantities at a condition different from the governed Stage 4 process basis.

**How to apply:** An older property datum may be used only as an anchor to a governed at-temperature route. If no such route exists, preserve the datum for traceability but block the affected property specifically; never reuse it numerically. In particular, sigma without an approved temperature route must not feed holdup or d32 outside its tagged temperature.
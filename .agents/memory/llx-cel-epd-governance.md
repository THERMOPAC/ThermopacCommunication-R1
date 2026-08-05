---
name: LLX CEL/EPD governance rules
description: Binding user-approved rules for the Design Software engineering library (server/engine-framework) — RRBO meaning, flooding architecture, correlation governance.
---

# LLX Core Engineering Library / Property Database — governance rules (user-approved Aug 2026)

- **RRBO = Re-Refined Base Oil**, NOT rapeseed/rice-bran oil. It must remain a *project fluid*: engineer-entered, source-tagged values only. Never invent default RRBO correlations (composition varies by feedstock/refining severity).
- **Why:** initial implementation wrongly used vegetable-oil correlations; user issued a hard stop and correction.
- **Flooding architecture:** CEL may contain only *generic math utilities* (slip relation, holdup root solver, bounded throughput maximizer). Technology-specific flooding models (packing, rotor/compartment, Thornton pulsed-column) belong ONLY in their respective engines. Never label a generic optimizer result as "ECP flooding" or "ECR flooding".
- **Source types are a controlled vocabulary:** `Measured | Vendor | Literature | Assumed` (capitalized, matching the existing workspace DB). Assumption status derives from sourceType — no separate boolean.
- **Correlation governance:** every library correlation needs exact source title, author/organization, year, coefficients, equation units, valid range, and regression test values. Vague citations ("NIST fits", "vendor class data") are rejected. NMP has *no fitted correlation* until exact data is approved — it uses source-tagged tabular interpolation with Assumed points flagged.
- **Solver rules:** Newton-Raphson convergence requires small step AND small residual; no solver may return the last iterate as success; golden-section rejects non-finite objectives.
- **Flow-ratio binding:** percent-of-capacity comparisons are only valid at the flow ratio the maximum was computed at; off-ratio throws unless explicitly overridden (then warns).
- **Water properties:** only ρ (Kell 1975 exact rational form, valid to 150 °C), μ (Vogel), σ (IAPWS R1-76(2014)) are in scope — no steam/water package expansion in Level 1.
- **How to apply:** any Level 2+ engine work (ECP/ECR/process design) must consume these CEL/EPD APIs and follow the same governance before adding new correlations; present a correlation register for approval before coding new equations.

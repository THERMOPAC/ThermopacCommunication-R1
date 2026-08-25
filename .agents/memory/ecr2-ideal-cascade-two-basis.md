---
name: ECR-2 ideal-cascade two-basis architecture
description: Governs physical mass/mole closure versus the Coto NRTL coordinate in ECR-2 ideal-stage cascades.
---

ECR-2 ideal-stage cascades must convert every component feed and outlet between kg/h and mol/h using the project physical pseudo-component MW table. NRTL x/y/z are the corresponding mole fractions mapped onto the fixed Coto component identities; Coto surrogate MWs must never convert reported phase flow, recovery, product quality, or mass balance.

**Why:** using surrogate MWs to map a physical feed into and out of the NRTL flash produces a conserved surrogate mass representation, not a physical material balance. It materially changed the N=1 RRBO recovery for the accepted Run #924 input snapshot from the prior 61.0131% result to 53.6715%.

**How to apply:** retain both tables in each cascade snapshot and expose the stage trace: physical feed mol/h, z, oriented x/y, NMP-rich beta, outlet mol/h, outlet physical kg/h, and component balance. Do not change NRTL parameters, operating conditions, BVP, K&H, d32, or hydraulic models to reconcile the result.
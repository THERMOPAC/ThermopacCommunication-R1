---
name: Coto NRTL source boundary
description: What the Coto 2022 source does and does not support for LLX NRTL validation.
---

Coto 2022 provides six-component Table 3 LLE data and UNIFAC comparisons,
not published molecular NRTL parameters, NRTL alpha values, or NRTL
temperature functions. Do not present the LLX five-component NRTL matrix as
published Coto data or attribute its reproduction result to Coto's NRTL model.

**Why:** The paper reports only directional classical-UNIFAC AC↔NMP group
refits; this is a different model and parameter space. The current active
xylene-only NRTL vector misses 11 of 13 source tie-line gate checks, while the
source data and xylene component order were visually verified.

**How to apply:** Use the 13 xylene rows as experimental anchors and label
NRTL behavior as locally regressed/preliminary. Keep the inactive combined
17-row NRTL artifact separate: it merges distinct xylene and toluene species
into one mono-aromatic slot and is not the active xylene-only model.

The fixed-\(\alpha=0.2\) structural comparison is inconclusive by design:
the identifiable 4- and 10-parameter fits passed no source tie-line, while
the 20-directional fit reduced isoactivity residuals but was rank 19/20,
ill-conditioned, iteration-limited, and passed only 1/13. Do not promote a
five-component fit from this dataset alone or call NRTL/surrogate/gate
limitation definitive without resolving identifiability and validation.
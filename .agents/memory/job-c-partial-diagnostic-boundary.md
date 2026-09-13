---
name: Job C partial-transfer diagnostics
description: Partial lambda endpoint testing must remain separate from accepted sizing.
---

Partial-transfer endpoint tests may expose provisional frozen hydraulic inputs and numerical geometry, but must never promote those values to optimized sizing or a recovery-criterion-satisfying height.

**Why:** The user authorized a temporary small-lambda test to investigate numerical execution while explicitly preserving all physical equations and acceptance gates. A small-lambda closure cannot establish full-transfer performance.

**How to apply:** Keep the diagnostic request immutable and separate from normal full-transfer acceptance. Clearly distinguish upstream d32/holdup/flooding and input RPM/diameter from a height trial and numerical FV compartments. A qualified partial endpoint is not a scientific-complete design. The user starts every Job C run.
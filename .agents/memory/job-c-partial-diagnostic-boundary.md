---
name: Job C partial-transfer diagnostics
description: Partial lambda endpoint testing must remain separate from accepted sizing.
---

Partial-transfer endpoint tests may expose provisional frozen hydraulic inputs and numerical geometry, but must never promote those values to optimized sizing or a recovery-criterion-satisfying height.

**Why:** The user authorized a temporary small-lambda test to investigate numerical execution while explicitly preserving all physical equations and acceptance gates. A small-lambda closure cannot establish full-transfer performance.

**How to apply:** Keep the diagnostic request immutable and separate from normal full-transfer acceptance. Clearly distinguish upstream d32/holdup/flooding and input RPM/diameter from a height trial and numerical FV compartments. A qualified partial endpoint is not a scientific-complete design. The user starts every Job C run.

Workflow-only testing may bypass residual convergence as a display prerequisite, but never change or hide the original scientific gate verdicts.

**Why:** The user separately authorized testing software completion rather than thermodynamic or sizing validity. Workflow completion and scientific acceptance must remain distinct.

**How to apply:** Enforce elementwise residual finiteness, finite bounded state, strict positivity and calculation errors as hard checks. Label outputs WORKFLOW TEST ONLY — NOT AN ACCEPTED DESIGN. Preserve legitimate worker blocks rather than misclassifying them as malformed completed responses.

The user subsequently chose strict diagnostic convergence for the normal diagnostic Run/Restart control, not one-state workflow completion.

**Why:** Queuing a strict job separately while leaving the page button on the workflow-test route caused subsequent user-started jobs to use the wrong mode.

**How to apply:** Keep the button label and endpoint aligned with strict diagnostics. Preserve historical workflow-test results and their labels; do not silently reinterpret them as strict results.

Do not reuse a pre-solve complete-prepared-snapshot mismatch as a permanent scientific blocked result.

**Why:** A strict run blocked before solving was returned on every subsequent button click even after fresh preparation reproduced the original hash; changing the UI route alone did not unblock execution.

**How to apply:** Permit a user-requested new attempt for this specific mismatch after fresh preparation, then enforce the full execution-time lineage check again. Keep scientific-block deduplication and historical snapshots intact.

Keep new worker result labels ASCII-safe unless cross-language Unicode hash canonicalization is explicitly versioned and tested.

**Why:** Python's default JSON escapes Unicode while JavaScript emits Unicode literally. An em dash in a result label caused an integrity failure after the real evaluation completed; prior numeric-only hash tests missed it.

**How to apply:** Test actual emitted labels through both hash implementations. UI prose may use Unicode independently. Never bypass hash verification or rewrite historical result hashes.
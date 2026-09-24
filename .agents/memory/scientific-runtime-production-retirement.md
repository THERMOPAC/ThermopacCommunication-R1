---
name: Scientific runtime production retirement
description: Current-only production execution with immutable historical results retained.
---

Production retains only the current Predictive N_T 7C-1.6 closure. Historical standalone runtimes and retired finite-rate adapters are not deployment requirements. Preserve historical records, PDFs, scientific identities, source and evidence; never relabel historical results as current.

**Why:** The user explicitly retired historical executable replay as a production requirement after model development. This supersedes earlier guidance to deploy every historical runtime for replay, without authorizing deletion of customer results or scientific source evidence.

**How to apply:** Keep the complete current closure and manifest unchanged, including inherited older-named files inside it. Gate execution and queue reclaim to the current contract; historical reads remain snapshot-only. Do not restore retired adapters for operational Stage-4 sizing. Deployment-size savings remain separate from measured final image-layer savings.

Classify regression coverage by execution, not by historical names: frozen snapshot/PDF compatibility remains a production obligation, while standalone retired scientific replay is research-only.

**Why:** Historical result preservation does not authorize re-enqueueing the historical contract or making its retired deployment bundle a release prerequisite.

Release validation must inspect the prebuilt artifact without rebuilding or repairing it, including inside test setup.

**Why:** Repackaging before hash checks can silently replace a damaged deployment bundle and produce a false-green release result.

**How to apply:** Reject missing or corrupted artifacts before test execution; compare deployment content before and after checks, and perform negative tests in isolated temporary directories.

The frozen deployment manifest was accepted with ignored Python bytecode present; clean-build reproducibility has not been established. Do not silently regenerate its hashes during a test-only change.

**Why:** Removing bytecode from packaging changes the pinned artifact identity and needs explicit authorization, even though disabling bytecode writes during validation is safe.

**How to apply:** Disable bytecode writes for the whole validation process, not only direct Python commands. Treat clean-tree packaging normalization and canonical manifest updates as a separate scoped change.
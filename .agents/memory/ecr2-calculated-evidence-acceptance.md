---
name: ECR-2 calculated evidence acceptance
description: Audit and integrity rules for accepting server-resolved preliminary Stage 8 numerical evidence.
---

Stage 8 preliminary candidates may be used only after the engineer has selected the exact current resolver fingerprint. The calculation boundary must add the authenticated actor and server timestamp, and the engine must require all of: matching fingerprint, valid resolver signature, accepting actor, and valid acceptance time.

**Why:** A status-only acceptance can silently promote a recalculated preliminary result or leave no accountable engineering decision in the immutable run snapshot.

**How to apply:** Preserve this contract for every new resolver state, including calculated preliminary and future automatic bases. A changed candidate fingerprint must be accepted again; never trust a client-supplied user ID or clock for acceptance metadata.
---
name: ECR Pre-Pilot Stage 1 idempotent saves
description: Identical scientific Stage 1 content must retain its existing audit identity and downstream lineage.
---

When a Stage 1 save has the same full scientific content as the currently saved snapshot, retain the existing `savedAt` and immutable hash instead of manufacturing a new snapshot identity.

**Why:** A user-confirmed identical re-save changed only `savedAt`, but that field participates in the immutable audit hash. The metadata-only hash change falsely invalidated otherwise matching Stage 2, Stage 3, and Job C lineage.

**How to apply:** Compare the complete governed snapshot content while excluding only audit identity metadata. Any scientific, evidence, binding, basis, or schema difference must still create a new immutable snapshot and invalidate stale downstream work.
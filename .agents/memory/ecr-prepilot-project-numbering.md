---
name: ECR Pre-Pilot project numbering
description: Permanent allocation rules for ECR Pre-Pilot Design project numbers.
---

ECR Pre-Pilot project numbers are server-issued, read-only, sequential, unique, atomic under concurrency, permanently persisted, and never reused. A cancelled or abandoned design retains its allocation.

**Why:** The user explicitly requires project numbers to be authoritative identifiers rather than editable form values or recoverable sequence slots.

**How to apply:** Allocate and persist the number before displaying it, retain an append-only allocation ledger, use idempotent creation for retries, and never derive the next number from `MAX(...) + 1`.
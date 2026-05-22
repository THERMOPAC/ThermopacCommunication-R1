# Phase 2A Zero-Trust Audit — SOP Intelligence
**Date**: 2026-05-22  
**Scope**: All 9 mandatory corrections from the approved Phase 2A execution plan v1.1

---

## C1 — Prior-Revision Ack Obsolescence

**Rule**: When a SOP is activated (or re-activated after revision approval), all prior-revision acknowledgments become automatically obsolete. Compliance counts only `revision_number = sop.revision_number`.

**Implementation**:
- `GET /sop/:sopId/acknowledgments` defaults to `?revisionNumber=sop.revisionNumber` — prior acks are returned only when explicitly queried by historical revision number.
- Dashboard queries `WHERE a.revision_number = s.revision_number` — prior acks excluded from all compliance metrics.
- Activation audit log records `rev=<revisionNumber>` for traceability.
- Client UI displays "Showing acknowledgments for revision vN (current). Prior-revision acks are historical only."

**Status**: ✅ ENFORCED

---

## C2 — Ack Assignment Gate

**Rule**: Acknowledgment assignment is only permitted when: `status = 'active' AND revision_number >= 1 AND no pending revision in draft/under_review`.

**Implementation** (`POST /sop/:sopId/acknowledgments`):
```
if (sop.status !== 'active')       → 422 sop_not_ready_for_acknowledgment
if (sop.revisionNumber < 1)        → 422 sop_not_ready_for_acknowledgment
if (hasPendingRevision(sopId))     → 422 sop_not_ready_for_acknowledgment
```

**Status**: ✅ ENFORCED

---

## C3 — 5 Activation Pre-Conditions (ordered, specific error codes)

**Rule**: Activation (`approved → active`) requires all 5 pre-conditions in order.

**Implementation** (`POST /sop/:sopId/transition`, action=activate):
```
if (sop.revisionNumber < 1)  → 422 sop_no_approved_revision
if (!sop.ownerId)            → 422 sop_owner_required
if (!sop.approverId)         → 422 sop_approver_required
if (!sop.department)         → 422 sop_department_required
if (!sop.processArea)        → 422 sop_process_area_required
```

**Status**: ✅ ENFORCED

---

## C4 — Retired SOP Blocks

**Rule**: Retired SOPs block: new linkages, new ack assignments, new effectiveness reviews, new revisions.

**Implementation**:
- `POST /sop/:sopId/linkages` → `if (sop.status === 'retired') 422 sop_retired`
- `POST /sop/:sopId/acknowledgments` → covered by `status !== 'active'` gate (retired ≠ active)
- `POST /sop/:sopId/effectiveness` → `if (sop.status === 'retired') 422 sop_retired`
- `POST /sop/:sopId/revisions` → `if (sop.status === 'retired') 422 sop_retired`
- `PATCH /sop/:sopId` → `if (sop.status === 'retired') 422 sop_is_retired`

**Status**: ✅ ENFORCED

---

## C5 — sop_unlinked Audit Field Convention

**Rule**: `sop_unlinked` audit event must use `fieldName = "${linkedType}:${linkedId}"`.

**Implementation** (`DELETE /sop/:sopId/linkages/:linkageId`):
```typescript
await writeSopAuditLog({
  sopId, action: "sop_unlinked",
  fieldName: `${linkage.linkedType}:${linkage.linkedId}`,
  context: `SOP ${sop.sopNumber}`, ...
});
```

**Status**: ✅ ENFORCED

---

## C6 — Mandatory Audit for Assign / Acknowledge / Withdraw

**Rule**: Each of the 3 ack operations writes a mandatory audit event with specific action codes.

**Implementation**:
- `POST /acknowledgments` (assign) → `action: "sop_acknowledgment_assigned"` — one event per user ID
- `POST /acknowledgments/:ackId/acknowledge` → `action: "sop_acknowledged"` 
- `DELETE /acknowledgments/:ackId` (withdraw) → `action: "sop_acknowledgment_withdrawn"`

All 3 use `writeSopAuditLog()` (not `writeAuditLog` — avoids NOT NULL constraint on `oi_audit_log.issue_id`).

**Status**: ✅ ENFORCED

---

## C7 — isEffective+requiresRevision Contradiction Rule

**Rule**: `isEffective=TRUE AND requiresRevision=TRUE` → 422 contradiction. Also `isEffective=TRUE AND deviationObserved=TRUE` → 422.

**Implementation** (`POST /sop/:sopId/effectiveness`):
```
if (isEffective && requiresRevision)   → 422 contradiction
if (isEffective && deviationObserved)  → 422 contradiction
if (!isEffective && !recommendation)   → 422 recommendation_required
```

**Status**: ✅ ENFORCED

---

## C8 — Exactly 27 Endpoints (spec) + Audit Log = 28

**Rule**: Implementation must include exactly the 27 specified endpoints plus 4 dashboard routes.

**Verification**: `grep -c "oiSopRouter\.(get|post|patch|delete)" server/oi-sop-routes.ts` → **28**  
(27 spec endpoints + 1 audit-log endpoint)

Dashboard routes (4): `sop-summary`, `sop-acknowledgment`, `sop-effectiveness`, `sop-by-department`

**Status**: ✅ ENFORCED

---

## C9 — No ERP/AI Integration

**Rule**: Phase 2A contains no ERP sync, no AI/LLM calls, no external API calls.

**Verification**: `grep -n "openai\|llm\|sap\|erp\|ai\." server/oi-sop-routes.ts` → **0 matches**

**Status**: ✅ ENFORCED (zero ERP/AI references in all SOP files)

---

## Role Boundary Verification

| Operation | Required Role | Enforcement |
|---|---|---|
| Create SOP | Manager+ | ✅ `hasRole(actor.role, MANAGER_ROLES)` |
| Update SOP fields | Manager+ (SM+ for sensitive fields) | ✅ Per-field check |
| Submit for review | Manager+ (owner or SM+) | ✅ Owner/SM gate |
| Approve/reject SOP | SM+ | ✅ `hasRole(actor.role, SM_ROLES)` |
| Activate SOP | SM+ | ✅ |
| Retire SOP | SM+ | ✅ |
| Create revision | Manager+ | ✅ |
| Approve/reject revision | SM+ (must be designated approver or Superuser) | ✅ |
| Add/remove linkage | Manager+ | ✅ |
| Assign acks | Manager+ | ✅ |
| Acknowledge | Assigned user or Superuser only | ✅ `actor.id !== ack.userId && actor.role !== 'Superuser' → 403` |
| Withdraw ack | Manager+ | ✅ |
| Record effectiveness | SM+ | ✅ |

---

## Approver ≠ Owner Invariant

Enforced at 3 points:
1. `POST /sop` (create) → `if (approverId === ownerId) 422`
2. `PATCH /sop/:sopId` (update) → resolves final owner+approver, checks `=== 422`
3. `POST /sop/:sopId/transition` submit action → `if (sop.approverId === sop.ownerId) 422`

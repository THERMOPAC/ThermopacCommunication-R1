# Project Item SAP Sync & Custom Item Governance Baseline v1.0

**Document ID:** project-item-sap-sync-and-custom-item-governance-baseline-v1  
**Status:** APPROVED — Awaiting Implementation  
**Date:** 2026-05-18  
**Author:** THERMOPAC QMS Architecture Review  
**Supersedes:** None (first baseline)

---

## A. Scope

This baseline governs two interconnected issues identified during architectural review of the offer-to-order/project conversion pipeline:

| Issue | Title |
|---|---|
| Issue 1 | SAP Sync Resilience — silent failures, no UI visibility, no project-level retry |
| Issue 2 | Custom Item Dual Identity — malformed EPC codes, SAP/EPC identity collision, weak detection |

**In scope:**
- SAP Project Item sync behaviour during and after offer conversion
- Custom item (non-catalogue) EPC and SAP identity separation
- Mixed-offer handling (catalogue + custom lines in same offer)
- Manual retry governance (per-item and project-level)
- Controlled vocabulary for `project_items.source`

**Out of scope:** See Section G.

---

## B. Existing Problems (Pre-Baseline)

### B1. Silent SAP sync failures
The SAP batch sync runs as a fire-and-forget promise after the DB commit. If SAP Service Layer is slow, down, or rejects an item, `sap_synced = false` and `sap_sync_error` are written to the row but no alert, task, or UI indicator is raised. The project manager has no visibility without querying the database directly.

### B2. Missing UI visibility
- SAP sync status (Synced / Failed / Not Synced) is only visible inside the Project Item detail dialog. The project items table row shows nothing.
- `sap_sync_error` text is stored in DB but never displayed anywhere in the UI.

### B3. Malformed custom EPC item codes
When a user adds a Custom Item line (no `product_code`) to an offer, the conversion code at `server/offer-conversion.ts` line 645 produces:
```
baseItemCode = "C10357-"       // trailing dash — product_code is empty string
projectItemCode = "C10357--P2627-018"  // DOUBLE DASH — malformed
```
If the customer has no `bpCode`:
```
baseItemCode = ""
projectItemCode = "-P2627-018"   // starts with dash — malformed
```
Multiple custom lines in the same offer all produce identical malformed codes — duplicates in `project_items`.

### B4. SAP/EPC identity collision risk
Custom items have no catalogue product code, so the current conversion incorrectly attempts to use the malformed EPC item code as the SAP `ItemCode`. This risks creating garbage records in the SAP item master or overwriting existing records.

### B5. Duplicate custom item code risk
All custom lines in a single offer produce identical malformed item codes (e.g. three custom lines all become `C10357--P2627-018`). The `ON CONFLICT DO NOTHING` clause silently drops the duplicate rows, meaning only one of the three lines is created in `project_items`.

### B6. Weak string-based custom item detection risk
A prior proposal used `itemCode.includes('-CUSTOM-')` to detect custom items at SAP sync time. This is rejected as non-governance-safe: EPC item codes are identity strings and must not be used as business logic dispatch keys. String matching creates false-positive risk as item codes evolve.

---

## C. Approved Architecture

### C1. SAP sync remains non-blocking
The SAP batch sync fires after the DB COMMIT using fire-and-forget (`.then().catch()`). The conversion response is returned to the client before sync completes. The conversion HTTP response time is not affected by SAP availability.

### C2. Project conversion never rolls back due to SAP sync failure
The DB transaction (project record, project items, snapshot, offer status update, PDF artifact) is committed before SAP sync is attempted. SAP sync failure cannot cause a rollback. The project is always created successfully if the DB transaction succeeds.

### C3. Manual retry preferred — no auto retry queue
Failed SAP syncs are surfaced in the UI and retried manually by the user. No background retry queue, no cron-based retry, no automatic re-attempt.

### C4. SAP identity and EPC identity are separated for custom items
Custom items maintain two distinct identities that must never be conflated:

| Layer | Identity |
|---|---|
| EPC | Unique `project_item_code` (e.g. `C10357-CUSTOM-001-P2627-018`), unique CodeBars, full traceability |
| SAP | Fixed catch-all master item (`CUSTOMx-SPA-PAR-0000`) — all custom items across all projects map to this one SAP record |

### C5. Custom item SAP identity — fixed constants
The following values are fixed for all custom project items and must be defined as constants in the codebase. They must never be derived, computed, or overridden at runtime.

```typescript
SAP_CUSTOM_ITEM_CODE    = 'CUSTOMx-SPA-PAR-0000'
SAP_CUSTOM_ITEM_NAME    = 'CUSTOM ITEM SPARES PARTS 000 AS PER PO'
SAP_CUSTOM_ITEM_BARCODE = '1920001001001000'  // exactly 16 characters
```

**Correction (governance):** These constants are enterprise business constants, not route-level logic. They are defined in `shared/constants/sap-custom-item.ts` and imported wherever needed. Inline string literals are prohibited. `server/project-item-detail-routes.ts` imports from this shared location.

### C6. EPC custom items remain fully independent
Each custom project item has its own:
- Unique EPC `item_code` (e.g. `C10357-CUSTOM-001-P2627-018`)
- Unique system `code_bars` (16-char, generated by `generateCodeBars()`)
- Own `description`, `quantity`, `uom`, `estimated_cost`
- Own vendor assignment, procurement flow, documents, approvals
- Own GCS folder path under `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/`

The fixed SAP identity is used **only** for SAP API calls (item master sync, PO line push). It does not replace or affect any EPC field.

### C7. Unique EPC CodeBars always required
`generateCodeBars()` must be called for every project item — catalogue and custom — without exception. The unique CodeBars is the GCS folder identity and must not be replaced by the fixed SAP BarCode.

### C8. Explicit source classification — controlled vocabulary
The `project_items.source` column (`varchar(30)`) is extended with one new controlled value. All source values for offer-originated items are defined in `shared/schema.ts`:

```typescript
export const PROJECT_ITEM_SOURCES = {
  SALES_OFFER:        'sales_offer',          // catalogue line from Products
  SALES_OFFER_CUSTOM: 'sales_offer_custom',   // custom line (no product_code)
} as const;

export type ProjectItemSource = typeof PROJECT_ITEM_SOURCES[keyof typeof PROJECT_ITEM_SOURCES];
```

Detection rule at SAP sync time:
```typescript
const isCustomItem = pi.source === PROJECT_ITEM_SOURCES.SALES_OFFER_CUSTOM;
```

This is an explicit DB field check. String-parsing of `item_code` is prohibited for this purpose.

### C9. SAP PO line behaviour for custom items
When pushing PO lines to SAP for custom items:
- `ItemCode` field: use `SAP_CUSTOM_ITEM_CODE` (fixed)
- Line description / remarks field: use the actual `description` from the project item
- This ensures the SAP PO is human-readable while the item master remains a clean catch-all

---

## D. File-Level Implementation Plan

### Step 1 — `shared/schema.ts`
**Change:** Confirm `PROJECT_ITEM_SOURCES` and `ProjectItemSource` are exported. The constants `'sales_offer'` and `'sales_offer_custom'` replace all inline string literals for `source` in offer conversion.  
**Note:** `VALID_PROJECT_ITEM_SOURCES` already exists — extend or replace with the new enum.

### Step 2 — `server/offer-conversion.ts`
**Changes:**
1. Import `PROJECT_ITEM_SOURCES` from `@shared/schema`
2. Add `let customItemSeq = 0;` before the topological item loop
3. Per item, detect `isCustomItem = !offerItem.product_code`
4. If `isCustomItem`:
   - Increment `customItemSeq`
   - `baseItemCode = customerBpCode ? \`${customerBpCode}-CUSTOM-${String(customItemSeq).padStart(3,'0')}\` : \`CUSTOM-${String(customItemSeq).padStart(3,'0')}\``
   - `masterItemId = null` (skip `findOrCreateMasterItem`)
   - `source = PROJECT_ITEM_SOURCES.SALES_OFFER_CUSTOM`
5. If catalogue item:
   - `baseItemCode = customerBpCode ? \`${customerBpCode}-${offerItem.product_code}\` : offerItem.product_code`
   - `masterItemId` via `findOrCreateMasterItem()` as before
   - `source = PROJECT_ITEM_SOURCES.SALES_OFFER`
6. `buildProjectItemCode(baseItemCode, fyCode, projectSeq)` — called for both types
7. `generateCodeBars()` — called for both types (unchanged)
8. Update INSERT to pass computed `source` value (not hardcoded `'sales_offer'`)

**Blocked behaviour:**
- Empty `product_code` can never reach `buildProjectItemCode`
- Malformed codes (`C10357--P2627-018`) are structurally impossible

### Step 3 — `server/project-item-detail-routes.ts`
**Changes:**

**3a. Constants at file top:**
```typescript
const SAP_CUSTOM_ITEM_CODE    = 'CUSTOMx-SPA-PAR-0000';
const SAP_CUSTOM_ITEM_NAME    = 'CUSTOM ITEM SPARES PARTS 000 AS PER PO';
const SAP_CUSTOM_ITEM_BARCODE = '1920001001001000';
```

**3b. `syncProjectItemToSap()` — custom item detection:**
```typescript
const isCustomItem = pi.source === 'sales_offer_custom';
const sapItemCode  = isCustomItem ? SAP_CUSTOM_ITEM_CODE  : pi.itemCode;
const sapItemName  = isCustomItem ? SAP_CUSTOM_ITEM_NAME  : (pi.description || pi.itemCode);
const sapBarCode   = isCustomItem ? SAP_CUSTOM_ITEM_BARCODE : pi.codeBars;
```
Validation guard (`codeBars.length !== 16`) applies only when `!isCustomItem`.

**3c. New endpoint — project-level retry all:**
```
POST /api/projects/:id/sap-sync/retry-failed
```
- Selects all `project_items` where `project_id = :id AND sap_synced = false AND item_code IS NOT NULL`
- Calls `syncProjectItemToSap()` for each
- Returns `{ retried, synced, failed, errors }`

### Step 4 — `client/src/components/project-detail-fixed.tsx`
**Changes:**

**4a. SAP status badge on each project item table row:**
```
sap_synced = true                → green badge "Synced"
sap_synced = false, sap_sync_error set → red badge "Failed"
sap_synced = false, no error     → grey badge "Not Synced"
```

**4b. "Retry All Failed SAP Sync" button in project items section header:**
- Visible only when at least one item has `sap_synced = false`
- Calls `POST /api/projects/:id/sap-sync/retry-failed`
- Shows spinner while pending; invalidates project items query on completion

### Step 5 — `client/src/components/project-item-detail-dialog.tsx`
**Change:** Display `sap_sync_error` text in a red alert box below the sync button when `item.sapSyncError` is not null.

### Step 6 — `client/src/pages/offers-page.tsx`
**Change:** In the conversion success panel, replace current success text with:

> *"Project created successfully. SAP item sync has been initiated. Check Project Items for SAP sync status. Failed items can be retried manually."*

---

## E. Controlled Vocabulary

```typescript
// shared/schema.ts — Project Item Source Values
export const PROJECT_ITEM_SOURCES = {
  SALES_OFFER:        'sales_offer',          // Catalogue line from Products picker
  SALES_OFFER_CUSTOM: 'sales_offer_custom',   // Custom line — no product_code
} as const;

export type ProjectItemSource = typeof PROJECT_ITEM_SOURCES[keyof typeof PROJECT_ITEM_SOURCES];
```

**Rules:**
- All writes to `project_items.source` for offer-originated items must use these constants
- Inline string literals `'sales_offer'` and `'sales_offer_custom'` are prohibited in application code
- SAP sync detection must use `pi.source === PROJECT_ITEM_SOURCES.SALES_OFFER_CUSTOM`
- No other code may use `item_code` string parsing to determine custom item status

---

## F. Test Cases

| TC | Scenario | Input | Expected Result |
|---|---|---|---|
| TC1 | Mixed offer — 2 catalogue + 3 custom lines | `product_code` present on lines 1 & 3, absent on lines 2, 4, 5 | Lines 1, 3 → `C10357-{productCode}-P2627-018`. Lines 2, 4, 5 → `C10357-CUSTOM-001/002/003-P2627-018`. Custom counter only increments on lines 2, 4, 5. |
| TC2 | Multiple custom lines — sequence integrity | 3 custom lines in one offer | Generates `CUSTOM-001`, `CUSTOM-002`, `CUSTOM-003` — no duplicates, no gaps, no collisions |
| TC3 | SAP sync for custom item | `source = 'sales_offer_custom'` | `ItemCode = CUSTOMx-SPA-PAR-0000`, `ItemName = CUSTOM ITEM SPARES PARTS 000 AS PER PO`, `BarCode = 1920001001001000`. Detection via `source` field — no string parsing. |
| TC4 | EPC CodeBars uniqueness | 5 items (2 catalogue + 3 custom) in one project | All 5 items have different 16-char CodeBars generated by `generateCodeBars()` |
| TC5 | SAP BarCode for custom lines | Custom item at SAP sync | SAP receives `BarCode = 1920001001001000`. EPC `code_bars` (unique) is NOT sent to SAP. |
| TC6 | No malformed EPC codes | Offer with 2 custom lines, customer `bpCode = 'C10357'` | `C10357-CUSTOM-001-P2627-018` and `C10357-CUSTOM-002-P2627-018` — no double dashes, no leading dashes |
| TC7 | Manual retry — failed custom item | `POST /api/project-items/:id/sap-sync` on item with `source = 'sales_offer_custom'` | Uses fixed SAP identity. Updates `sap_synced = true`, `sap_sync_error = null`. Badge on row updates to "Synced". |
| TC8 | Manual retry — failed catalogue item | `POST /api/project-items/:id/sap-sync` on item with `source = 'sales_offer'` | Uses `item_code` + `code_bars` as before. Existing behaviour unchanged. |
| TC9 | Project-level retry all | `POST /api/projects/:id/sap-sync/retry-failed` with 3 failed items | Attempts sync for all 3. Returns `{ retried: 3, synced: N, failed: M }`. UI button disabled when no failed items. |
| TC10 | Conversion with SAP down | SAP Service Layer unreachable at conversion time | Project and all items created in DB. SAP sync fires, all items get `sap_synced = false`. Conversion response returns immediately. Summary message shows manual retry guidance. |

---

## G. Explicit Non-Scope

The following are explicitly excluded from this baseline and must not be implemented under this document:

| Excluded item | Reason |
|---|---|
| Auto retry queue / cron-based retry | Deferred — manual retry preferred per architecture decision |
| Rollback of project creation on SAP failure | Prohibited — conversion must always succeed if DB transaction succeeds |
| Schema migration (new columns) | Not required — `source` field and existing columns are sufficient |
| Blocking the conversion HTTP response for SAP sync | Option A was evaluated and rejected in favour of Option B (non-blocking) |
| String-based custom item detection (`itemCode.includes(...)`) | Rejected — governance unsafe |
| BOM explosion for custom items | Not applicable — custom items have no `product_code`, BOM explosion is already skipped |
| Schema change for `isCustomItem` boolean | Not required given `source` field approach |

---

## H. Zero-Trust Validation Requirements

After implementation, the following must be verified before this baseline is closed:

| # | Validation | Method |
|---|---|---|
| ZT1 | No malformed EPC item codes exist in new conversions | Convert a test offer with custom items; verify `item_code` in `project_items` matches `{bpCode}-CUSTOM-{NNN}-P{FY}-{SEQ}` exactly |
| ZT2 | No duplicate custom EPC codes in same project | Convert offer with 3+ custom lines; verify all `item_code` values are distinct |
| ZT3 | SAP retry works for custom items | Force `sap_synced = false` on a custom item; click retry; verify SAP receives `CUSTOMx-SPA-PAR-0000` |
| ZT4 | Mixed offers work end-to-end | Convert offer with catalogue + custom lines; verify both types created correctly with correct `source` values |
| ZT5 | EPC CodeBars remain unique | Verify all `code_bars` values in `project_items` for a project are distinct — no two rows share the same CodeBars |
| ZT6 | SAP custom identity remains fixed | Inspect SAP sync payload for custom items; verify `ItemCode`, `ItemName`, `BarCode` match constants exactly |
| ZT7 | Existing catalogue behaviour unchanged | Convert offer with only catalogue items; verify no regression in item codes, CodeBars, or SAP sync behaviour |
| ZT8 | `source` field written correctly | Query `project_items` after conversion; verify catalogue rows have `source = 'sales_offer'`, custom rows have `source = 'sales_offer_custom'` |
| ZT9 | "Retry All Failed" scopes correctly | Verify endpoint only retries items with `sap_synced = false` for the given project; does not touch other projects |
| ZT10 | `sap_sync_error` displayed in UI | Force a sync failure; verify error message appears in the item detail dialog |

---

## Revision History

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-18 | Initial baseline — approved architecture, dual-identity model, SAP sync resilience |

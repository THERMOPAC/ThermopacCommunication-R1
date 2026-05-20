# BP Sync Governance Baseline v1.0

**Document ID:** BP-SYNC-GOV-v1.0
**Status:** ACTIVE — UPDATED (Phase 2A)
**Baseline Date:** 2026-05-19 (Phase 1)
**Last Updated:** 2026-05-19 (Phase 2A)
**Scope:** SAP B1 Business Partner Code generation and inbound/outbound sync rules for Customers and Vendor/Suppliers in THERMOPAC QMS

---

## 1. Governing Principle

**SAP B1 is the single and exclusive source of truth for Business Partner (BP) Code sequences.**

No local database record, hardcoded value, or application-level fallback may determine or override a BP Code. Every new BP Code must originate from a live SAP B1 query at the time of record creation.

---

## 2. BP Code Prefix Rules

### 2.1 Customer

| Rule | Value |
|---|---|
| Prefix | `C` |
| Format | `C` followed by digits only (`C\d+`) |
| Example | `C10412`, `C10413` |
| SAP CardType | `cCustomer` |
| Local `card_type` | `C` |

### 2.2 Vendor / Supplier

| Rule | Value |
|---|---|
| Prefix | `V` |
| Format | `V` followed by digits only (`V\d+`) |
| Example | `V10051`, `V10052` |
| SAP CardType | `cSupplier` |
| Local `card_type` | `V` |

### 2.3 Prefix Enforcement

- Prefixes are **case-sensitive** — `c10412` is rejected; `C10412` is accepted.
- No other prefix is valid for new record creation.
- Mixed or non-digit suffixes are rejected (e.g. `C10412x` → invalid).

---

## 3. BP Code Generation — SAP Only

### 3.1 Customer Next Code (`GET /api/customers/next-bp-code`)

**Method: Single OData call — `$orderby desc $top 1`**

SAP Service Layer query:
```
GET /b1s/v1/BusinessPartners
    ?$filter=startswith(CardCode,'C')
    &$select=CardCode
    &$orderby=CardCode desc
    &$top=1
```

Derivation rules:
1. Check SAP session health. If not alive → **HTTP 503, stop**.
2. Issue the query above. On non-200 response → **HTTP 503, stop**.
3. If `value[]` is empty (no C-prefix codes exist) → **HTTP 503, stop**.
4. If returned code does not match `/^C\d+$/` → **HTTP 503, stop**.
5. Extract numeric part from returned code. Preserve its digit width.
6. Return `C` + `(numericValue + 1)` zero-padded to the same width.

Example: SAP returns `C10365` → numeric part `10365`, width `5` → next = `C10366`.

**No full pagination. No local DB scan. No hardcoded floor. No fallback of any kind.**

### 3.2 Vendor Next Code (`GET /api/customers/next-vendor-bp-code`)

**Method: Single OData call — `$orderby desc $top 1`**

SAP Service Layer query:
```
GET /b1s/v1/BusinessPartners
    ?$filter=startswith(CardCode,'V')
    &$select=CardCode
    &$orderby=CardCode desc
    &$top=1
```

Derivation rules:
1. Check SAP session health. If not alive → **HTTP 503, stop**.
2. Issue the query above. On non-200 response → **HTTP 503, stop**.
3. If `value[]` is empty (no V-prefix codes exist) → **HTTP 503, stop**.
4. If returned code does not match `/^V\d+$/` → **HTTP 503, stop**.
5. Extract numeric part from returned code. Preserve its digit width.
6. Return `V` + `(numericValue + 1)` zero-padded to the same width.

Example: SAP returns `V11073` → numeric part `11073`, width `5` → next = `V11074`.

**No full pagination. No local DB scan. No hardcoded floor. No fallback of any kind.**

### 3.3 Known SAP Behaviour — `$orderby` on MS SQL Server

SAP B1 on MS SQL Server silently strips UDF columns when `$orderby` is present on bulk list queries. This query uses `$select=CardCode` only (no UDF fields) and `$top=1` (not a bulk scan), so UDF stripping does not affect correctness. The returned code is logged on every call (`[next-cbp-code] SAP highest = … → next = …`) for regression visibility.

`$orderby` sort is lexicographic (alphabetical) on `CardCode`. For the confirmed SAP code ranges (C10000–C10365, V10001–V11073), alphabetical descending equals numeric descending — all codes in the active range share the same digit width (5 digits after prefix). The 6-digit anomaly codes (`C000002`, `C000009`) sort below `C10365` lexicographically and cannot interfere with the result.

---

## 4. No Fallback Policy

The following patterns are **permanently prohibited**:

| Prohibited Pattern | Reason |
|---|---|
| Scanning local DB for max code as fallback | Allows stale or missing records to generate incorrect codes |
| Hardcoded floor values (e.g. `10363`, `10000`) | Can produce duplicate codes if SAP has higher codes |
| Returning a guessed code when SAP is down | Creates orphaned local records with invalid BP Codes |
| Silent fallback on SAP timeout | Hides SAP connectivity problems from the operator |

---

## 5. SAP Outage Behavior

### 5.1 During BP Code Fetch (Create form open)

| Layer | Behavior |
|---|---|
| Server | Returns `HTTP 503` with error message describing the SAP failure |
| Client — BP Code field | Displayed as empty (`""`) — never shows a guessed value |
| Client — Alert | Red "SAP B1 Unavailable" alert shown at top of form footer |
| Client — Save button | Disabled (`disabled={isPending \|\| !!bpCodeFetchError}`) |
| User action required | Close form, resolve SAP connectivity, retry |

### 5.2 During Record Submission (POST /api/customers)

Even if the client is bypassed, the server independently enforces all prefix rules (see Section 6). A record with a blank or invalid BP Code is rejected at the server level.

### 5.3 Resolution

Once SAP connectivity is restored, the user re-opens the Add Customer / Add Vendor form. The form automatically re-fetches the next BP Code from SAP. No manual intervention in the code sequence is needed.

---

## 6. Server-Side Enforcement Rules

All rules are enforced in `POST /api/customers` **before** any database write, SAP sync attempt, or email verification. This is a mandatory server-side guard that cannot be bypassed by client-side manipulation.

| Condition | HTTP Response | Error Message |
|---|---|---|
| `bpCode` is empty or missing | `400` | `BP Code is required. It must be fetched from SAP B1 before creating a record.` |
| `cardType = 'S'` (any bpCode) | `400` | `Legacy S-prefix supplier creation is not allowed. Use card type V (Vendor) with a Vxxxxx BP Code.` |
| `cardType = 'C'` and bpCode does not match `/^C\d+$/` | `400` | `Customer BP Code must start with C followed by digits only (e.g. C10412).` |
| `cardType = 'V'` and bpCode does not match `/^V\d+$/` | `400` | `Vendor BP Code must start with V followed by digits only (e.g. V10051).` |
| All rules pass | Proceeds to email verification, schema parse, and DB write | — |

---

## 7. Inbound SAP Sync Behavior

### 7.1 Customer Inbound Sync (`POST /api/customers/sap-sync`)

| SAP Field | Local DB Column | Notes |
|---|---|---|
| `CardCode` | `bp_code`, `sap_card_code`, `short_code` | `short_code` = strip `C` prefix, take 5 digits |
| `CardName` | `bp_name` | |
| `ContactPerson` | `contact_person` | |
| `Phone1` | `phone1` | |
| `Address` | `bill_to_address` | |
| `City` | `sap_mail_city` | |
| `Country` | `sap_mail_country` | |
| `EmailAddress` | `email` **and** `sap_email` | Written to both columns |
| (hardcoded) | `card_type = 'C'` | **Explicit — never relies on DB default** |
| (hardcoded) | `sap_sync_status = 'synced'` | |

**Policy:** INSERT-only. Existing `sap_card_code` rows are skipped (no overwrite).
**Filter:** SAP-side `CardType eq 'C'`, then client-side `CardCode > 'C10300'`.

**Single-card test-mode UPDATE:** If a record already exists and SAP has an `EmailAddress`, both `email` and `sap_email` are patched using `CASE WHEN ... IS NULL OR = ''` — non-destructive, existing values are preserved.

### 7.2 Vendor Inbound Sync (`POST /api/customers/vendor-sap-sync`)

| SAP Field | Local DB Column | Notes |
|---|---|---|
| `CardCode` | `bp_code`, `sap_card_code`, `short_code` | `short_code` = strip `V` prefix, take 5 digits |
| `CardName` | `bp_name` | |
| `ContactPerson` | `contact_person` | |
| `Phone1` | `phone1` | |
| `Address` | `bill_to_address` | |
| `City` | `sap_mail_city` | |
| `Country` | `sap_mail_country` | |
| `EmailAddress` | `email` **and** `sap_email` | Written to both columns |
| (hardcoded) | `card_type = 'V'` | **Explicit — never relies on DB default** |
| (hardcoded) | `sap_sync_status = 'synced'` | |

**Policy:** INSERT-only. Existing `sap_card_code` rows are skipped.
**Filter:** SAP-side `CardType eq 'cSupplier'`, then client-side `/^V\d+$/i` — excludes any legacy S-prefix SAP suppliers.
**Allowed roles:** Superuser, General Manager, Senior Manager.

### 7.3 Outbound Sync (Local → SAP)

On every `POST /api/customers` (create) and `PUT /api/customers/:id` (update), the `sapBPSyncService` pushes the record to SAP B1.

**CardType mapping (outbound):**

| Local `card_type` | SAP `CardType` |
|---|---|
| `C` | `cCustomer` |
| `V` | `cSupplier` |
| `S` | `cSupplier` (legacy read-only records only) |
| `L` | `cLid` |

**On UPDATE (PATCH):** `CardCode`, `CardType`, `ContactEmployees`, and `BPAddresses` are currently stripped from the PATCH payload. See Phase 2 scope below.

---

## 8. Legacy S-Prefix Handling

| Scenario | Behavior |
|---|---|
| Existing DB records with `card_type = 'S'` | Remain in DB as read-only imports. Not deleted. |
| Existing SAP BPs with S-prefix CardCodes | Not imported by vendor sync (V-prefix filter excludes them) |
| New record creation with `cardType = 'S'` | **Rejected at server** with `HTTP 400` |
| Vendor form UI | Card Type field locked to `V` — no S option available |
| SAP outbound sync for legacy S records | Maps to `cSupplier` if ever pushed |

**Decision date:** 2026-05-19. New S-prefix suppliers are permanently prohibited. All future Vendor/Supplier creation uses `V`-prefix codes exclusively.

---

## 9. Validation Evidence Summary (Phase 1 — 2026-05-19)

### Server Guard — 12/12 test cases passed

| Input | cardType | Result |
|---|---|---|
| (empty) | C | ✅ Rejected — BP Code required |
| (empty) | V | ✅ Rejected — BP Code required |
| `V10001` | C | ✅ Rejected — must start with C |
| `C10412` | V | ✅ Rejected — must start with V |
| `S10001` | S | ✅ Rejected — legacy S creation blocked |
| `ABC123` | C | ✅ Rejected — must start with C |
| `C10412` | C | ✅ Accepted |
| `V10051` | V | ✅ Accepted |
| `C10412x` | C | ✅ Rejected — non-digit suffix |
| `V10051x` | V | ✅ Rejected — non-digit suffix |
| `c10412` | C | ✅ Rejected — lowercase prefix |
| `v10051` | V | ✅ Rejected — lowercase prefix |

### Inbound Sync SQL — Confirmed

- Customer INSERT: `card_type = 'C'`, `email = $10`, `sap_email = $10` ✅
- Vendor INSERT: `card_type = 'V'`, `email = $10`, `sap_email = $10` ✅
- Customer test-mode UPDATE: `CASE WHEN email IS NULL OR email = '' THEN $1` ✅

### BP Code Endpoints — Confirmed

- Both endpoints: local DB scan removed, no hardcoded floor ✅
- Both endpoints: SAP session checked first, 503 on unavailable ✅
- Customer: queries `cCustomer` filter, extracts `C\d+` max ✅
- Vendor: queries `cSupplier` filter, extracts `V\d+` max ✅

---

## 10. Phase 2A Completion Summary (2026-05-19)

Phase 2A was implemented and validated on 2026-05-19. The following items were completed.

### 10.1 ContactEmployees PATCH — COMPLETED ✅

The `delete (bpData as any).ContactEmployees` line in `updateBusinessPartner()` (`sap-bp-sync.ts`) has been removed. `ContactEmployees` (up to 3 contacts: name, position, email, phone) now propagates to SAP on every `PUT /api/customers/:id`. The array is absent from the payload only when no contact person exists locally — SAP contacts are never accidentally cleared.

### 10.2 BPAddresses PATCH — COMPLETED ✅

The `delete (bpData as any).BPAddresses` line in `updateBusinessPartner()` has been removed. Bill To (`bo_BillTo`) and Ship To (`bo_ShipTo`) addresses now propagate to SAP on every edit. Absent when both local address fields are empty.

### 10.3 SAP Sync Failure — Persistent DB State ✅

`sap_sync_error text` column added to `customers` table. On every SAP PATCH failure (create or update):

- `sap_sync_status` → `'failed'` (persisted to DB, not just response body)
- `sap_sync_error` → SAP error text (persisted to DB)
- `sap_synced_at` → unchanged (not updated on failure)
- Server logs upgraded from `console.warn` to `console.error`

On success: `sap_sync_status='synced'`, `sap_sync_error=NULL`, `sap_synced_at=NOW()` written back.

### 10.4 SAP Sync Failed Badge ✅

Customer and Vendor list views show a destructive red **"SAP Sync Failed"** badge on any record where `sap_sync_status = 'failed'`. Badge clears automatically when a successful retry or edit invalidates the query cache.

### 10.5 Edit Dialog Behaviour on SAP Failure ✅

When an edit save succeeds locally but SAP PATCH fails:

- Dialog remains open (not closed).
- A destructive Alert renders in the dialog footer: `"SAP B1 Sync Failed — Record Saved Locally"` with the SAP error message and guidance to use Retry SAP Sync.
- Submit button is hidden; only "Close" is shown.
- Normal dialog close (Cancel / X) clears the alert state.

### 10.6 Retry SAP Sync — Failed Records Only ✅

New endpoint `POST /api/customers/:id/retry-sap-sync` (Superuser / GM / SM only):

- Guard: `sap_sync_status !== 'failed'` → `HTTP 400` — cannot retry a synced or pending record.
- On success: `sap_sync_status='synced'`, `sap_sync_error=NULL`, `sap_synced_at=NOW()` written to DB.
- On failure: `sap_sync_error` updated with new SAP error text; status remains `'failed'`.
- Amber `RefreshCw` retry button visible in list row **only** when `sap_sync_status = 'failed'`. Absent for all other records.

### 10.7 Audit Log — All Outcomes ✅

All create, update, and retry outcomes (success and failure) are written to `sap_customer_sync_logs`:

| Event | `status` | `imported` | `failed` | `error_summary` |
|---|---|---|---|---|
| Create/Update SAP failure | `failed` | `0` | `1` | SAP error text |
| Retry success | `synced` | `1` | `0` | `NULL` |
| Retry failure | `failed` | `0` | `1` | SAP error text |

---

## 11. Remaining Deferred Items (Post Phase 2A)

| Item | Description |
|---|---|
| **UDF inbound fields** | `Currency`, `GlblLocNum`, `U_StateSupply`, `U_BP_GST_Type` are sent outbound to SAP but not read back on inbound sync. Future phase will add these to the `$select` and INSERT. |
| **Vendor inbound — single-card test UPDATE** | Vendor inbound sync has no single-card test mode with email patching. Future phase will add parity with the customer sync test-mode path. |
| **S-prefix SAP supplier import review** | Existing SAP BPs with S-prefix CardCodes (legacy) are excluded from vendor inbound sync by the V-prefix client filter. Future phase will decide whether to import, skip, or migrate these. |

---

## 12. File and Code References

| Component | File | Notes | Phase |
|---|---|---|---|
| Customer next BP Code endpoint | `server/project-routes.ts` ~L2851 | SAP-only, no fallback | 1 |
| Vendor next BP Code endpoint | `server/project-routes.ts` ~L2897 | SAP-only, no fallback | 1 |
| Server-side BP Code guard | `server/project-routes.ts` ~L2988 | In `POST /api/customers`, before DB write | 1 |
| Customer inbound sync | `server/project-routes.ts` ~L3182 | `POST /api/customers/sap-sync` | 1 |
| Vendor inbound sync | `server/project-routes.ts` ~L3387 | `POST /api/customers/vendor-sap-sync` | 1 |
| SAP outbound mapper | `server/sap-b1-integration/sap-bp-sync.ts` | `mapCustomerToSapBP()`, `updateBusinessPartner()` | 1 + 2A |
| Customer form — client guard | `client/src/components/customer-management.tsx` | `bpCodeFetchError` state, disabled submit | 1 |
| Vendor form — client guard | `client/src/components/vendor-management.tsx` | `bpCodeFetchError` state, disabled submit, bulk sync button | 1 |
| SAP sync failure persistence | `server/project-routes.ts` ~L3032, L3112 | `sap_sync_status`, `sap_sync_error` written to DB on failure | 2A |
| Retry SAP Sync endpoint | `server/project-routes.ts` ~L3148 | `POST /api/customers/:id/retry-sap-sync` | 2A |
| SAP Sync Failed badge | `client/src/components/customer-management.tsx` ~L1285 | Destructive badge, conditional on `sapSyncStatus === 'failed'` | 2A |
| SAP Sync Failed badge | `client/src/components/vendor-management.tsx` ~L1112 | Same | 2A |
| Retry button + mutation | `client/src/components/customer-management.tsx` ~L1044, L1304 | `retrySapSyncMutation`, amber `RefreshCw`, failed-only | 2A |
| Retry button + mutation | `client/src/components/vendor-management.tsx` ~L883, L1122 | Same | 2A |
| Edit dialog failure alert | `client/src/components/customer-management.tsx` ~L859 | `sapSyncFailureAlert` prop, dialog stays open, Save hidden | 2A |
| Edit dialog failure alert | `client/src/components/vendor-management.tsx` ~L712 | Same | 2A |
| `sap_sync_error` column | `shared/schema.ts` ~L1854 | `text('sap_sync_error')` in `customers` table | 2A |

---

## 13. SAP Service Layer — BP PATCH Rules (Confirmed 2026-05-20)

These rules are confirmed by live diagnostic tests against `TPEL_LIVE` and govern all outbound BP update calls.

### 13.1 PATCH Method

- `PATCH /b1s/v1/BusinessPartners('{CardCode}')` is the correct method for BP updates.
- `CardCode` is **read-only** — it must never appear in the PATCH body. SAP ignores it or rejects the call if included.

### 13.2 BPAddresses — RowNum Required for Existing Rows

- When updating existing address rows, each entry in `BPAddresses` **must include `RowNum`** matching the value SAP returned on the prior GET.
- Without `RowNum`, SAP treats the address entry as a new INSERT. This causes duplicate rows in CRD1 and will eventually produce ODBC -2035 on the next PATCH.
- `RowNum` is obtained by fetching the BP via GET before the PATCH and capturing the `RowNum` value per `AddressType`. The lowest `RowNum` per `AddressType` is the canonical row.

### 13.3 ODBC -2035 — Deterministic Classification

| Scenario | Classification | Action |
|---|---|---|
| PATCH without `RowNum` → SAP inserts duplicate → next PATCH fails | **Client-side error** — missing `RowNum` | Fix payload to include `RowNum` |
| PATCH with correct `RowNum`, `AddressName`, `AddressType`, and all India-localisation fields echoed verbatim → still fails with -2035 | **SAP-side data conflict** for that CardCode | Do not retry. Set `sap_sync_status='failed'`. SAP B1 administrator must inspect `CRD1`, `OCRG`, and TAAS-related tables in SQL Server for the affected CardCode and resolve the duplicate entry there. |

### 13.4 India Localisation Fields

SAP B1 India localisation adds the following fields to `BPAddresses` that are **not present in non-India BPs**:

| Service Layer field | CRD1 column | Notes |
|---|---|---|
| `GSTIN` | `GSTRegnNo` | GSTIN per address row. May carry a unique constraint in a secondary India GST table. |
| `GstType` | `GstType` | GST registration type (e.g. `gstRegularTDSISD`). |
| `TaasEnabled` | `TaasEnabled` | Tax Account Assignment flag. Always `"tYES"` for active India BPs. |

**Diagnostic confirmed (2026-05-20):** Echoing all three fields back verbatim does NOT resolve ODBC -2035 when the conflict is SAP-side. These fields are therefore not a required fix for the payload — the conflict exists in a secondary SAP table, not in the Service Layer payload.

### 13.5 `sap_sync_status` Outcomes — Two States Only

| `sapResult.success` | `sap_sync_status` | `sap_sync_error` |
|---|---|---|
| `true` | `synced` | `NULL` |
| `false` | `failed` | SAP error text (human-readable) |

No partial sync state. No `synced` status when an error or warning exists. If BPAddresses PATCH causes ODBC -2035, the entire update is classified as `failed` and the error message directs the user to resolve the conflict in SAP B1 directly.

---

## 14. Temporary Governance Exception — BPAddresses PATCH Disabled (2026-05-20)

### Status: ACTIVE

### Trigger

Diagnostic confirmed ODBC -2035 on BPAddresses PATCH for multiple India-localised BPs (V11074, V11006). Verbatim full-field echo payload also rejected. Root cause (specific SAP-side table conflict) is unproven — SAP admin SQL evidence not yet available.

### Rules in effect from 2026-05-20

| Rule | Detail |
|---|---|
| BPAddresses in PATCH | **Excluded.** BPAddresses array is never sent in ERP → SAP PATCH calls. |
| BPAddresses in POST | **Unaffected.** New BP creation sends BPAddresses as before. |
| BPAddresses in GET | **Unaffected.** SAP → ERP inbound sync reads BPAddresses as before. |
| Address field changes via UI | Saved to local DB only. Not pushed to SAP. |
| `sap_sync_status` on PATCH success | `synced` — non-address fields ARE synced. |
| `sap_sync_error` on PATCH success | `"Address changes saved locally. SAP address PATCH is temporarily disabled."` |
| Retry sync for previously-failed BPs | Allowed. Retry will now succeed (BPAddresses excluded). Non-address fields will sync. `sap_sync_error` will carry the address warning. |

### What the user sees

After any BP save or retry sync:
- `sap_sync_status = synced`
- `sap_sync_error = "Address changes saved locally. SAP address PATCH is temporarily disabled."`

This message must be surfaced in the UI wherever `sap_sync_error` is displayed.

### Restore condition

Remove this exception and restore the BPAddresses PATCH block in `server/sap-b1-integration/sap-bp-sync.ts` only when:

1. SAP B1 administrator provides SQL evidence identifying the table and constraint causing ODBC -2035 for India-localised BPs.
2. The conflict is confirmed resolved in the SAP B1 MSSQL instance for `TPEL_LIVE`.
3. A live PATCH test against at least V11074 and V11006 returns HTTP 204 with BPAddresses in the payload.
4. The governance doc is updated to reflect confirmed root cause (Section 13).

---

*Document authored by THERMOPAC QMS engineering. Phase 1 baseline: 2026-05-19. Phase 2A update: 2026-05-19. Section 13 added: 2026-05-20. Section 14 (temporary exception) added: 2026-05-20.*

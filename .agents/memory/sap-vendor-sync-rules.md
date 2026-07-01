---
name: SAP Vendor Sync Rules
description: Hard rules for the vendor Full Sync in procurement-routes.ts — session, page size, field selection, and eligibility filter.
---

## Rules (non-negotiable)

**1. No `$select`, no `$orderby` on bulk BusinessPartners fetch**
Adding either strips UDF columns (U_ERP_Group) from the response silently.
Standard fields like `GroupName` also cause a 400 error when listed in `$select` on this SAP/SQL Server version.

**2. `forceLogin(4000)` before every Full Sync fetch**
The shared SAP session may be contaminated by prior `$select` usage (even from a failed sync).
A contaminated session silently strips U_ERP_Group. `forceLogin()` must be called in `POST /api/vendors/sync` before `fetchSapVendors()`.

**3. PAGE_SIZE = 20 (not 500, not 100)**
SAP B1 without `$select` hard-caps results at 20 records per request regardless of `$top` value.
Using `$top=500` returns exactly 20 records — loop thinks it's the last page and stops. Use 20.

**4. Eligibility filter: `VALID_VENDOR_TYPES` inclusion (not GroupCode exclusion)**
Only sync vendors where `U_ERP_Group IN ('R','P','M','I','V','E','B')`.
Vendors with null/unknown U_ERP_Group are excluded; the deactivation step marks them `is_active=false`.
`EXCLUDED_GROUP_CODES = {105, 106}` is still used by Test SAP and UDF distribution — do NOT remove it.

**5. `$filter=CardType eq 'cSupplier'` is the only allowed query parameter**
No `$select`, no `$orderby`. Only `$filter`, `$top`, `$skip`.

## Why U_ERP_Group may appear null even with a fresh session
If the contaminated session ran any `$select` query before `forceLogin()`, SAP may persist the stripped-UDF behaviour for that session cookie. `forceLogin()` → SAP logout → 4s wait → fresh login is required to reset this.

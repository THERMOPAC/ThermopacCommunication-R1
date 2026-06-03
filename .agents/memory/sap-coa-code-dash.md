---
name: SAP ChartOfAccounts Code dash format
description: SAP B1 Service Layer Code field uses hyphens before the segment suffix; FormatCode omits them. Both must be handled in search matching.
---

**Rule:** When searching ChartOfAccounts by user-supplied account identifier, normalize dashes out of both the SAP `Code` field and the search term before comparing.

**Why:** SAP B1 stores account codes as e.g. `50207350600-ARL` (Code) but users type and FormatCode stores `50207350600ARL` (no dash). A plain `includes()` check fails because `"50207350600-arl".includes("50207350600arl")` is false.

**How to apply:** In any SAP CoA search filter, compute `codeStripped = code.replace(/-/g, '')` and `searchStripped = search.replace(/-/g, '')`, then match on both the raw and stripped forms. Also check `a.Name` in addition to `a.AcctName` — SAP no-`$select` responses may use either field name for the account name.

**Location:** `server/admin-routes.ts` → `GET /payroll/sap-coa-search` (filter step).

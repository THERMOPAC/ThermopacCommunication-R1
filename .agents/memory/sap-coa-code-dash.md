---
name: SAP ChartOfAccounts Code dash format
description: SAP B1 Service Layer Code field uses hyphens before the segment suffix; FormatCode omits them. Both must be handled in search matching.
---

**Rule:** When searching ChartOfAccounts by user-supplied account identifier, normalize dashes out of both the SAP `Code` field and the search term before comparing.

**Why:** SAP B1 stores account codes as e.g. `50207350600-ARL` (Code) but users type and FormatCode stores `50207350600ARL` (no dash). A plain `includes()` check fails because `"50207350600-arl".includes("50207350600arl")` is false.

**How to apply:** In any SAP CoA search filter, compute `codeStripped = code.replace(/-/g, '')` and `searchStripped = search.replace(/-/g, '')`, then match on both the raw and stripped forms. Also check `a.Name` in addition to `a.AcctName` — SAP no-`$select` responses may use either field name for the account name.

**Location:** `server/admin-routes.ts` → `GET /payroll/sap-coa-search` (filter step).

## SAP odata.nextLink pagination bug (root cause of missing accounts)

**Rule:** Never pass a raw SAP `odata.nextLink` / `@odata.nextLink` value directly as the `path` argument to `sapSession.request()`. Always strip to a relative path first.

**Why:** `sap-https-client.ts` constructs the final URL as `https://${host}:${port}${options.path}`. When `options.path` is an absolute URL (e.g. `https://59.152.52.58:50000/b1s/v1/...`), the concatenation produces an invalid URL and throws `Error: Invalid URL`. SAP B1 returns `odata.nextLink` (OData v3 style, no `@`) as a full absolute URL — `options.url` is set to `''` (falsy) in the request options, so the fallback path concatenation always fires. The pagination loop stopped at page 1 (20 accounts), meaning accounts on pages 2+ were never searched.

**How to apply:** Use `toRelativePath(raw)`: check if raw starts with `/` (already relative); otherwise find `/b1s/v1/` and slice from there. Also check both `data['odata.nextLink']` and `data['@odata.nextLink']` — SAP uses either depending on the version.

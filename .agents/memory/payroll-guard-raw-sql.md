---
name: Payroll guard raw SQL pattern
description: Drizzle ORM isNull()+and() on payroll_records failed silently for blocking guard queries; raw SQL is required.
---

## Rule
For any **blocking guard** on `payroll_records` (e.g. "block if SAP JE already posted"), use `db.execute(sql\`...\`)` with explicit `Number()` casts on periodId/userId — never Drizzle ORM `eq()`/`isNull()` combinations.

## Why
Drizzle ORM's `isNull()` inside `and()` on this table silently produced a non-matching query (exact cause not pinpointed — possibly type coercion on the integer `reversal_sap_doc_entry` column). The direct SQL ran against the DB correctly identified the rows; the ORM version returned zero rows and let runs through. Switching to raw SQL fixed it immediately.

## How to apply
```ts
const guardResult = await db.execute(sql`
  SELECT id, sap_je_number, trial_run_no
  FROM payroll_records
  WHERE period_id = ${Number(periodId)}
    AND user_id   = ${Number(userId)}
    AND sap_posting_status = 'posted'
    AND reversal_sap_doc_entry IS NULL
  LIMIT 1
`);
if (guardResult.rows.length > 0) {
  return res.status(409).json({ error: '...', code: 'OFFICIAL_JE_UNREVERSED' });
}
```

## Key DB fact (as of 2026-06-04)
In THERMOPAC's payroll workflow ALL records — including SAP-posted ones — have `record_type = 'trial'` and `trial_status = 'generated'`. The ONLY reliable fields for "live SAP JE exists" are:
- `sap_posting_status = 'posted'`
- `reversal_sap_doc_entry IS NULL`

Never filter by `record_type` or `trial_status` in blocking guards on this table.

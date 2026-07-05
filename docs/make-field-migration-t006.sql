-- T006: JSONB migration: approved_makes/makes array → make scalar
-- in buy_list_items.technical_attributes
-- Run against the production DB after deploying the new UI.
-- Safe to run multiple times (idempotent — skips rows where make already set).

-- 1. Rows that already have a scalar `make` field: no-op (leave as-is).
-- 2. Rows with `approved_makes` array: take first element → `make`, remove old key.
-- 3. Rows with `makes` array (legacy valves): take first element → `make`, remove old key.
-- 4. Rows with `approved_makes` as a string (CSV or plain): use it directly as `make`.

BEGIN;

-- Step 1: approved_makes IS a JSON array → extract first element
UPDATE buy_list_items
SET technical_attributes = (technical_attributes
    - 'approved_makes'
    - 'makes'
    || jsonb_build_object(
        'make',
        COALESCE(
            (technical_attributes -> 'approved_makes') -> 0,
            (technical_attributes -> 'makes') -> 0,
            'null'::jsonb
        )
    )
)
WHERE technical_attributes IS NOT NULL
  AND (
       jsonb_typeof(technical_attributes -> 'approved_makes') = 'array'
    OR jsonb_typeof(technical_attributes -> 'makes') = 'array'
  )
  AND NOT (technical_attributes ? 'make' AND technical_attributes ->> 'make' <> '');

-- Step 2: approved_makes IS a plain string (some legacy rows) → move to make
UPDATE buy_list_items
SET technical_attributes = (technical_attributes
    - 'approved_makes'
    || jsonb_build_object('make', technical_attributes -> 'approved_makes')
)
WHERE technical_attributes IS NOT NULL
  AND jsonb_typeof(technical_attributes -> 'approved_makes') = 'string'
  AND NOT (technical_attributes ? 'make' AND technical_attributes ->> 'make' <> '');

-- Step 3: Remove orphaned approved_makes/makes keys where make is already set
UPDATE buy_list_items
SET technical_attributes = (technical_attributes - 'approved_makes' - 'makes')
WHERE technical_attributes IS NOT NULL
  AND (technical_attributes ? 'approved_makes' OR technical_attributes ? 'makes')
  AND technical_attributes ? 'make';

COMMIT;

-- Verification query (run after migration):
SELECT
  jsonb_typeof(technical_attributes -> 'approved_makes') AS old_am_type,
  jsonb_typeof(technical_attributes -> 'makes')          AS old_makes_type,
  jsonb_typeof(technical_attributes -> 'make')           AS new_make_type,
  COUNT(*)
FROM buy_list_items
WHERE technical_attributes IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1 NULLS FIRST, 2 NULLS FIRST, 3 NULLS FIRST;

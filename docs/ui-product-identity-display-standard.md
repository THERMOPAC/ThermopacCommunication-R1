# UI Product Identity Display Standard v1.0

## Purpose

Establish a consistent, readable two-line product identity pattern across all EPC expanded-row UI screens. The standard enforces visual separation between the full engineering description (project-specific) and the reusable product identity (catalogue-level), eliminating duplicate text and improving product recognition speed.

## Problem Statement

Prior to this standard, expanded-row Details cards on EPC screens showed the full engineering description on both Line 1 and Line 2 of the item header. This created:

- Visual duplication that added no information
- Difficulty distinguishing project-specific identity from reusable product identity
- Harder scanning across multiple rows on screens with dense record lists

## Display Standard

### Two-Line Item Header

| Line | Content | Source | Style |
|------|---------|--------|-------|
| Line 1 | Full engineering description | `drawing_title`, `item_description`, or equivalent project-specific field | `text-[10px] font-medium text-foreground/80` |
| Line 2 | Reusable product identity: `P2_label + " " + P3` | `products.item_property_2_label` + `products.item_property_3` | `text-[12px] text-blue-600 font-bold` |

### Rules

1. **Never duplicate** the full engineering description on Line 2.
2. **Never show** BP suffix, project suffix, or any project-specific qualifier on Line 2.
3. **Line 2 is hidden** entirely when both `item_property_2_label` and `item_property_3` are null or empty — do not render a blank line.
4. **Line 2 is read-only** in the UI — it derives from the linked product in the `products` table and is never editable inline.
5. **P2 label and P3 are joined with a single space** with empty parts filtered out (use `.filter(Boolean).join(' ')`).

### Data Source

```
epc_drawing_controls.project_item_id
  → project_items.product_code
    → products.item_property_2_label   (P2 label, e.g. "Column")
    → products.item_property_3         (P3 value, e.g. "400 NB 2000 MM")
```

The same join pattern applies to any EPC module that links through `project_items` → `products`.

### Frontend Implementation Pattern

```tsx
{(rec.product_p2_label || rec.product_p3) && (
  <div
    className="text-[12px] text-blue-600 font-bold mt-0.5 leading-snug truncate"
    title={[rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ')}
  >
    {[rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ')}
  </div>
)}
```

### Backend Query Pattern

Add these JOINs and SELECT fields to any list query that feeds an EPC expanded-row card:

```sql
LEFT JOIN project_items pi ON pi.id = dc.project_item_id
LEFT JOIN products p ON p.product_code = pi.product_code

-- In SELECT:
p.item_property_2_label AS product_p2_label,
p.item_property_3       AS product_p3
```

## Screens Implemented

| Screen | Route | Status |
|--------|-------|--------|
| Drawing Controls — Details card | `/epc/drawing-controls` | Implemented (2026-05-21) |
| Planning Control — Item Information card | `/epc/planning-control` | Implemented (2026-05-21) |

## Screens Pending Assessment

Any EPC module whose expanded-row Details card currently shows a product description should be assessed for this standard. Candidate modules include PPPC buy-list lines, Procurement List Control, and any other module with `project_item_id` → `product_code` linkage.

## Rationale

- **Reusable product identity** (P2 + P3) is catalogue-level and stable across projects — it anchors the engineer's mental model.
- **Full engineering description** is project-specific and may include customer/project qualifiers — it belongs on Line 1 as context, not identity.
- The blue+bold 12px treatment makes Line 2 immediately distinct and scannable without being louder than Line 1.

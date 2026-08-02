---
name: Comm Register one-click generate
description: Auto-generate Rev 00 on communication record creation; key quirks and design decisions.
---

## Rule
POST /offers/:id/communications now auto-generates Rev 00 when responseType is a generate type (create_word/create_excel/create_ppt/create_pdf). Record always saves; generation failure returns generationFailed:true with the comm record intact.

**Why:** User-approved one-click workflow — no manual expand + click Generate step.

**How to apply:**
- The `autoGenerateOnCreate()` helper in `offer-comm-routes.ts` runs the full generate pipeline inline after the INSERT.
- On success: returns `{ ...comm, document, downloadUrl, generationFailed: false }` — client triggers browser download via hidden `<a>` click.
- On failure: returns `{ ...comm, document: null, downloadUrl: null, generationFailed: true, generationError }` — client shows toast and auto-expands the row.
- PATCH (edit existing record) does NOT re-generate — only POST triggers auto-gen.
- The `GENERATE_RESPONSE_TYPES` map is defined at the top of `offer-comm-routes.ts` just after the auth helper.

## WORD built-in fallback
`generateWord()` in `offer-comm-generator-service.ts` now checks `templateBuffer.length === 0` and calls `buildBuiltinWordBuffer(vars)` which creates a proper OOXML `.docx` using PizZip directly (no docxtemplater, values substituted at build time). Template upload is no longer required for WORD generation.

**Why:** Previous code called `new PizZip(emptyBuffer)` which threw; WORD was the only format gated behind a mandatory template upload.

## pptxgenjs ESM/CJS guard
The import in `offer-comm-generator-service.ts` uses:
```typescript
import pptxgenLib from 'pptxgenjs';
const pptxgen = (typeof pptxgenLib === 'function' ? pptxgenLib : (pptxgenLib as any).default ?? pptxgenLib) as typeof pptxgenLib;
```
**Why:** pptxgenjs exports the constructor directly in CJS (`type: function, no .default`) but wraps it differently when tsx resolves the ESM build (`pptxgen.es.js → export { PptxGenJS as default }`). The guard handles both.

## Client changes
- `createMutation.onSuccess` — checks `data.downloadUrl` and triggers download; checks `data.generationFailed` for toast; auto-expands new record via `setExpandedIds`.
- Submit button label: "Save & Generate" (idle) / "Saving & Generating…" (pending) for generate types.
- Response Type hint updated to: "Your document will be generated and downloaded automatically when you save."
- DocumentPanel no-docs state for generate types: amber alert with "Generate Rev 00" button instead of plain "No documents yet."

## 422 gate removed
The `if (!tplRow && templateType !== 'PPT' && templateType !== 'EXCEL')` 422 gate in the `/documents/generate` route was removed — all four types now have built-in fallbacks.

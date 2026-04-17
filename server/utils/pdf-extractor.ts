import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer, options?: { max?: number }) => Promise<{ text: string; numpages: number }> = require('pdf-parse');
import type {
  ExtractionResult,
  DocumentProperties,
  CustomProperties,
  FileInfo,
  ValidationResults,
  ExtractionWarning,
} from './ole-extractor';

export const PDF_EXTRACTION_ENGINE         = 'pdf-text-layer-parser';
export const PDF_EXTRACTION_ENGINE_VERSION = '1.0.0';

// ─────────────────────────────────────────────────────────────────────────────
// Field extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

// Capture the value that follows a label in the text.
// Handles:  "DWG. NO.   4823002002001002"
//           "DRAWING NO: 4823002002001002"
//           "DWG NO\n4823002002001002"
function findField(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]?.trim()) {
      return m[1].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

// Normalise text: collapse excess whitespace but keep newlines meaningful
function normalise(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Title-block field patterns
// Each field has multiple patterns (most specific first) to maximise hit rate
// across different THERMOPAC / SolidWorks title block templates.
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS: Record<string, RegExp[]> = {
  drawingNumber: [
    /DWG\.?\s*NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRAWING\s+(?:NO\.?|NUMBER)\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRG\.?\s*NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRAWING\s*[:\-]\s*([A-Z0-9][\w.\-\/]{3,50})/i,
  ],
  revision: [
    /\bREV(?:ISION)?\.?\s*[:\-]?\s*([A-Z0-9]{1,5})\b/i,
    /\bREV\.\s*([A-Z0-9]{1,5})\b/i,
  ],
  title: [
    /TITLE\s*[:\-]\s*(.+?)(?:\n|DWG|DRAWN|SCALE|SHEET|SIZE|REV|$)/i,
    /DRAWING\s+TITLE\s*[:\-]\s*(.+?)(?:\n|$)/i,
  ],
  drawnBy: [
    /DRAWN\s+BY\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|CHK|CHECKED|$)/i,
    /DRWN\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
    /DRAWN\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
  ],
  checkedBy: [
    /CHECKED\s+BY\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|APPD|$)/i,
    /CHK(?:D)?\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
    /CHECKED\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
  ],
  scale: [
    /SCALE\s*[:\-]?\s*(1\s*[:\-\/]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[:\-\/]\s*1|NTS|NONE|FULL)/i,
    /SCALE\s*[:\-]?\s*([A-Z0-9:\-\/\s\.]{1,20})/i,
  ],
  sheetSize: [
    /\bSHEET\s+SIZE\s*[:\-]?\s*([A-E0-9])\b/i,
    /\bSIZE\s*[:\-]?\s*([A-E0-9])\b/i,
    /\bFORMAT\s*[:\-]?\s*(A[0-4]|B|C|D|E)\b/i,
  ],
  description: [
    /DESCRIPTION\s*[:\-]\s*(.+?)(?:\n|DWG|DRAWN|SCALE|SHEET|SIZE|REV|$)/i,
    /DESC(?:RIPTION)?\s*[:\-]\s*(.+?)(?:\n|$)/i,
  ],
  material: [
    /MATERIAL\s*[:\-]\s*(.+?)(?:\n|FINISH|HEAT|QTY|$)/i,
  ],
  company: [
    /(?:THERMOPAC|TPEL|COMPANY)\s*[:\-]?\s*([A-Za-z][A-Za-z\s&.,Pvt.Ltd]{3,60})(?:\n|$)/i,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main extractor
// ─────────────────────────────────────────────────────────────────────────────

export async function extractPdfProperties(
  fileBuffer: Buffer,
  registeredDrawingNumber: string,
  registeredRevision: string,
  fileInfo: FileInfo,
): Promise<ExtractionResult> {
  const warnings: ExtractionWarning[] = [];

  // ── Parse PDF text layer ──────────────────────────────────────────────────
  let rawText = '';
  let pageCount = 0;
  try {
    const parsed = await pdfParse(fileBuffer, { max: 0 });
    rawText = normalise(parsed.text ?? '');
    pageCount = parsed.numpages ?? 0;
  } catch (parseErr: any) {
    return {
      extractionStatus: 'failed',
      extractionEngine: PDF_EXTRACTION_ENGINE,
      extractionEngineVersion: PDF_EXTRACTION_ENGINE_VERSION,
      documentProperties: null,
      customProperties: null,
      sheetInfo: null,
      fileInfo,
      validationResults: {
        drawingNumberMatch: null,
        revisionMatch: null,
        checkedAt: new Date().toISOString(),
      },
      warnings: [{ type: 'parse_error', detail: parseErr?.message ?? 'PDF parse failed' }],
      rawError: parseErr?.message ?? 'PDF parse failed',
    };
  }

  if (!rawText.trim()) {
    return {
      extractionStatus: 'failed',
      extractionEngine: PDF_EXTRACTION_ENGINE,
      extractionEngineVersion: PDF_EXTRACTION_ENGINE_VERSION,
      documentProperties: null,
      customProperties: null,
      sheetInfo: null,
      fileInfo,
      validationResults: {
        drawingNumberMatch: null,
        revisionMatch: null,
        checkedAt: new Date().toISOString(),
      },
      warnings: [{ type: 'parse_error', detail: 'PDF has no text layer — it may be a scanned image. OCR is required.' }],
      rawError: 'No text layer found in PDF.',
    };
  }

  // ── Extract fields ────────────────────────────────────────────────────────
  const drawingNumber = findField(rawText, PATTERNS.drawingNumber);
  const revision      = findField(rawText, PATTERNS.revision);
  const title         = findField(rawText, PATTERNS.title);
  const drawnBy       = findField(rawText, PATTERNS.drawnBy);
  const checkedBy     = findField(rawText, PATTERNS.checkedBy);
  const scale         = findField(rawText, PATTERNS.scale);
  const sheetSize     = findField(rawText, PATTERNS.sheetSize);
  const description   = findField(rawText, PATTERNS.description);
  const material      = findField(rawText, PATTERNS.material);
  const company       = findField(rawText, PATTERNS.company);

  // ── Validation cross-checks ───────────────────────────────────────────────
  let drawingNumberMatch: boolean | null = null;
  let revisionMatch: boolean | null = null;

  if (drawingNumber !== null) {
    drawingNumberMatch = drawingNumber.toLowerCase().includes(registeredDrawingNumber.toLowerCase()) ||
                        registeredDrawingNumber.toLowerCase().includes(drawingNumber.toLowerCase());
    if (!drawingNumberMatch) {
      warnings.push({
        type: 'field_mismatch',
        field: 'drawingNumber',
        registered: registeredDrawingNumber,
        extracted: drawingNumber,
      });
    }
  } else {
    warnings.push({ type: 'field_absent', field: 'drawingNumber' });
  }

  if (revision !== null) {
    revisionMatch = revision.toLowerCase() === registeredRevision.toLowerCase();
    if (!revisionMatch) {
      warnings.push({
        type: 'field_mismatch',
        field: 'revision',
        registered: registeredRevision,
        extracted: revision,
      });
    }
  } else {
    warnings.push({ type: 'field_absent', field: 'revision' });
  }

  // ── Determine extraction status ───────────────────────────────────────────
  const coreFieldsFound = [drawingNumber, revision, title, drawnBy].filter(Boolean).length;
  let extractionStatus: 'success' | 'partial' | 'failed';

  if (coreFieldsFound >= 3) {
    extractionStatus = 'success';
  } else if (coreFieldsFound >= 1) {
    extractionStatus = 'partial';
  } else {
    extractionStatus = 'failed';
    warnings.push({
      type: 'parse_error',
      detail: 'No title block fields could be identified in the PDF text layer. The title block may use a non-standard layout or the text is embedded as vector graphics.',
    });
  }

  // ── Build document properties (standard format) ───────────────────────────
  const documentProperties: DocumentProperties = {
    title: title ?? null,
    subject: description ?? null,
    author: drawnBy ?? null,
    lastAuthor: checkedBy ?? null,
    revisionNumber: revision ?? null,
    applicationName: 'SolidWorks (PDF export)',
    createdAt: null,
    modifiedAt: null,
  };

  // ── Build custom properties map (mirrors SolidWorks custom properties) ────
  const customProperties: CustomProperties = {};
  if (drawingNumber)  customProperties['Drawing Number']  = drawingNumber;
  if (revision)       customProperties['Revision']        = revision;
  if (drawnBy)        customProperties['Drawn By']        = drawnBy;
  if (checkedBy)      customProperties['Checked By']      = checkedBy;
  if (scale)          customProperties['Scale']           = scale;
  if (sheetSize)      customProperties['Sheet Size']      = sheetSize;
  if (material)       customProperties['Material']        = material;
  if (company)        customProperties['Company']         = company;
  if (pageCount > 0)  customProperties['Page Count']      = String(pageCount);

  return {
    extractionStatus,
    extractionEngine: PDF_EXTRACTION_ENGINE,
    extractionEngineVersion: PDF_EXTRACTION_ENGINE_VERSION,
    documentProperties,
    customProperties: Object.keys(customProperties).length > 0 ? customProperties : null,
    sheetInfo: null,
    fileInfo,
    validationResults: {
      drawingNumberMatch,
      revisionMatch,
      checkedAt: new Date().toISOString(),
    },
    warnings,
    rawError: null,
  };
}

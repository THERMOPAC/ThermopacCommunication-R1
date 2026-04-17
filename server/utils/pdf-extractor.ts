import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer, options?: { max?: number }) => Promise<{ text: string; numpages: number; info?: Record<string, string> }> = require('pdf-parse');
import type {
  ExtractionResult,
  DocumentProperties,
  CustomProperties,
  FileInfo,
  ExtractionWarning,
} from './ole-extractor';

export const PDF_EXTRACTION_ENGINE         = 'pdf-text-layer-parser';
export const PDF_EXTRACTION_ENGINE_VERSION = '1.1.0';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalise(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

// Try every pattern; return first non-empty capture group.
function findField(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]?.trim()) return m[1].trim().replace(/\s+/g, ' ');
  }
  return null;
}

// Scan every line; return first line that contains `value` (case-insensitive).
function scanLine(text: string, value: string): string | null {
  if (!value) return null;
  const lines = text.split('\n');
  const needle = value.toLowerCase();
  for (const line of lines) {
    if (line.toLowerCase().includes(needle)) return line.trim();
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title-block patterns — designed for SolidWorks PDF exports where the text
// layer often renders as single tokens per line (column-layout problem).
// Strategy: label on one line, value on the next (\n after label); also
// try inline label:value for well-structured templates.
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS: Record<string, RegExp[]> = {
  drawingNumber: [
    // Inline:  "DWG. NO. 4823002002001002"
    /DWG\.?\s*NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRG\.?\s*NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRAWING\s+(?:NO\.?|NUMBER|#)\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DOCUMENT\s+NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    // Next-line: "DWG NO\n4823002002001002"
    /DWG\.?\s*NO\.?[:\-]?\s*\n\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRG\.?\s*NO\.?[:\-]?\s*\n\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRAWING\s*(?:NO\.?|NUMBER)?\s*\n\s*([A-Z0-9][\w.\-\/]{3,50})/i,
  ],
  revision: [
    // Inline
    /\bREV(?:ISION)?\.?\s*[:\-]?\s*([A-Z0-9]{1,5})(?:\s|$|\n)/i,
    // Next-line: "REV\nA"
    /\bREV(?:ISION)?\.?\s*\n\s*([A-Z0-9]{1,5})(?:\s|$|\n)/i,
  ],
  title: [
    /TITLE\s*[:\-]\s*(.+?)(?:\n|DWG|DRAWN|SCALE|SHEET|SIZE|REV|$)/i,
    /DRAWING\s+TITLE\s*[:\-]?\s*(.+?)(?:\n|$)/i,
    /TITLE\s*\n\s*(.+?)(?:\n|$)/i,
  ],
  drawnBy: [
    /DRAWN\s+BY\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|CHK|CHECKED|APPROVED|$)/i,
    /DRAWN\s+BY\s*\n\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|$)/i,
    /DRWN\.?\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
    /DRAWN\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
    /DRAWN\s*\n\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|$)/i,
  ],
  checkedBy: [
    /CHECKED\s+BY\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|APPD|APPROVED|$)/i,
    /CHECKED\s+BY\s*\n\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|$)/i,
    /CHK(?:D|ED)?\.?\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|DATE|$)/i,
    /CHECKED\s*\n\s*([A-Za-z][A-Za-z\s\.]{1,40})(?:\n|$)/i,
  ],
  scale: [
    /SCALE\s*[:\-]?\s*(1\s*[:\-\/]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[:\-\/]\s*1|NTS|NONE|FULL)/i,
    /SCALE\s*\n\s*(1\s*[:\-\/]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[:\-\/]\s*1|NTS|NONE|FULL)/i,
    /SCALE\s*[:\-]?\s*([A-Z0-9:\-\/\s\.]{1,20})/i,
  ],
  sheetSize: [
    /\bSHEET\s+SIZE\s*[:\-]?\s*([A-E0-9])\b/i,
    /\bSHEET\s+SIZE\s*\n\s*([A-E0-9])\b/i,
    /\bSIZE\s*[:\-]?\s*([A-E0-9])\b/i,
    /\bSIZE\s*\n\s*([A-E0-9])\b/i,
    /\bFORMAT\s*[:\-]?\s*(A[0-4]|B|C|D|E)\b/i,
  ],
  description: [
    /DESCRIPTION\s*[:\-]\s*(.+?)(?:\n|DWG|DRAWN|SCALE|SHEET|SIZE|REV|$)/i,
    /DESCRIPTION\s*\n\s*(.+?)(?:\n|$)/i,
    /DESC(?:RIPTION)?\s*[:\-]\s*(.+?)(?:\n|$)/i,
  ],
  material: [
    /MATERIAL\s*[:\-]\s*(.+?)(?:\n|FINISH|HEAT|QTY|$)/i,
    /MATERIAL\s*\n\s*(.+?)(?:\n|$)/i,
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

  // ── Parse PDF ──────────────────────────────────────────────────────────────
  let rawText = '';
  let pageCount = 0;
  let pdfInfo: Record<string, string> = {};
  try {
    const parsed = await pdfParse(fileBuffer, { max: 0 });
    rawText   = normalise(parsed.text ?? '');
    pageCount = parsed.numpages ?? 0;
    pdfInfo   = (parsed.info as Record<string, string>) ?? {};
  } catch (parseErr: any) {
    return {
      extractionStatus: 'failed',
      extractionEngine: PDF_EXTRACTION_ENGINE,
      extractionEngineVersion: PDF_EXTRACTION_ENGINE_VERSION,
      documentProperties: null,
      customProperties: null,
      sheetInfo: null,
      fileInfo,
      validationResults: { drawingNumberMatch: null, revisionMatch: null, checkedAt: new Date().toISOString() },
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
      validationResults: { drawingNumberMatch: null, revisionMatch: null, checkedAt: new Date().toISOString() },
      warnings: [{ type: 'parse_error', detail: 'PDF has no text layer — it may be a scanned/image-only file. OCR is not supported.' }],
      rawError: 'No text layer found in PDF.',
    };
  }

  // ── Extract fields via regex patterns ─────────────────────────────────────
  let drawingNumber = findField(rawText, PATTERNS.drawingNumber);
  let revision      = findField(rawText, PATTERNS.revision);
  const title       = findField(rawText, PATTERNS.title);
  const drawnBy     = findField(rawText, PATTERNS.drawnBy);
  const checkedBy   = findField(rawText, PATTERNS.checkedBy);
  const scale       = findField(rawText, PATTERNS.scale);
  const sheetSize   = findField(rawText, PATTERNS.sheetSize);
  const description = findField(rawText, PATTERNS.description);
  const material    = findField(rawText, PATTERNS.material);

  // ── PDF document-info metadata (from SolidWorks PDF properties) ───────────
  // SolidWorks sometimes embeds the drawing number / title in the PDF metadata.
  const pdfTitle    = pdfInfo['Title'] || pdfInfo['title'] || null;
  const pdfSubject  = pdfInfo['Subject'] || pdfInfo['subject'] || null;
  const pdfAuthor   = pdfInfo['Author'] || pdfInfo['author'] || null;
  const pdfCreator  = pdfInfo['Creator'] || pdfInfo['creator'] || null;

  // ── Known-value fallback ───────────────────────────────────────────────────
  // If regex didn't match the layout, check if the registered values simply
  // appear somewhere in the text (direct string search). This is resilient
  // against any title block column layout.
  if (!drawingNumber && registeredDrawingNumber) {
    const line = scanLine(rawText, registeredDrawingNumber);
    if (line) drawingNumber = registeredDrawingNumber;
  }
  // For revision: scan for common patterns like standalone "A", "B", "Rev A", etc.
  // Only use fallback if registered revision is short (1-3 chars).
  if (!revision && registeredRevision && registeredRevision.length <= 3) {
    // Try to find "Rev A" or "Revision A" anywhere in the text
    const revPattern = new RegExp(`\\brev(?:ision)?[.\\s:]*${registeredRevision}\\b`, 'i');
    if (revPattern.test(rawText)) {
      revision = registeredRevision;
    } else {
      // Try to find the revision as a standalone word on a line that contains "REV"
      const revLineMatch = rawText.match(/REV(?:ISION)?[.:\s]*\n?\s*([A-Z0-9]{1,3})/i);
      if (revLineMatch && revLineMatch[1]) revision = revLineMatch[1].trim();
    }
  }

  // ── Validation cross-checks ───────────────────────────────────────────────
  let drawingNumberMatch: boolean | null = null;
  let revisionMatch: boolean | null = null;

  if (drawingNumber !== null) {
    drawingNumberMatch =
      drawingNumber.toLowerCase().includes(registeredDrawingNumber.toLowerCase()) ||
      registeredDrawingNumber.toLowerCase().includes(drawingNumber.toLowerCase());
    if (!drawingNumberMatch) {
      warnings.push({ type: 'field_mismatch', field: 'drawingNumber', registered: registeredDrawingNumber, extracted: drawingNumber });
    }
  } else {
    warnings.push({ type: 'field_absent', field: 'drawingNumber' });
  }

  if (revision !== null) {
    revisionMatch = revision.toLowerCase() === registeredRevision.toLowerCase();
    if (!revisionMatch) {
      warnings.push({ type: 'field_mismatch', field: 'revision', registered: registeredRevision, extracted: revision });
    }
  } else {
    warnings.push({ type: 'field_absent', field: 'revision' });
  }

  // ── Extraction status ─────────────────────────────────────────────────────
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
      detail: 'No title block fields could be matched in the PDF text layer. '
        + 'The title block may use a non-standard layout or the text is embedded as vector graphics. '
        + 'Use the raw-text diagnostic endpoint to inspect what text was extracted.',
    });
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const documentProperties: DocumentProperties = {
    title: title ?? pdfTitle ?? null,
    subject: description ?? pdfSubject ?? null,
    author: drawnBy ?? pdfAuthor ?? null,
    lastAuthor: checkedBy ?? null,
    revisionNumber: revision ?? null,
    applicationName: pdfCreator ?? 'SolidWorks (PDF export)',
    createdAt: null,
    modifiedAt: null,
  };

  const customProperties: CustomProperties = {};
  if (drawingNumber)  customProperties['Drawing Number']  = drawingNumber;
  if (revision)       customProperties['Revision']        = revision;
  if (drawnBy)        customProperties['Drawn By']        = drawnBy;
  if (checkedBy)      customProperties['Checked By']      = checkedBy;
  if (scale)          customProperties['Scale']           = scale;
  if (sheetSize)      customProperties['Sheet Size']      = sheetSize;
  if (material)       customProperties['Material']        = material;
  if (pageCount > 0)  customProperties['Page Count']      = String(pageCount);

  return {
    extractionStatus,
    extractionEngine: PDF_EXTRACTION_ENGINE,
    extractionEngineVersion: PDF_EXTRACTION_ENGINE_VERSION,
    documentProperties,
    customProperties: Object.keys(customProperties).length > 0 ? customProperties : null,
    sheetInfo: null,
    fileInfo,
    validationResults: { drawingNumberMatch, revisionMatch, checkedAt: new Date().toISOString() },
    warnings,
    rawError: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic helper — returns raw text for debugging pattern issues
// ─────────────────────────────────────────────────────────────────────────────

export async function extractRawTextFromPdf(fileBuffer: Buffer): Promise<{ text: string; pageCount: number; info: Record<string, string> }> {
  const parsed = await pdfParse(fileBuffer, { max: 0 });
  return {
    text:      normalise(parsed.text ?? ''),
    pageCount: parsed.numpages ?? 0,
    info:      (parsed.info as Record<string, string>) ?? {},
  };
}

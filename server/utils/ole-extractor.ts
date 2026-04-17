import CFB from 'cfb';

export const EXTRACTION_ENGINE = 'ole-property-parser';
export const EXTRACTION_ENGINE_VERSION = '1.0.0';
export const EXTRACTION_TIMEOUT_MS = 30000;

// OLE PROPSET type codes (MS-OLEPS)
const VT_I2        = 0x0002;
const VT_I4        = 0x0003;
const VT_BOOL      = 0x000B;
const VT_LPSTR     = 0x001E;
const VT_LPWSTR    = 0x001F;
const VT_FILETIME  = 0x0040;
const VT_UI4       = 0x0013;

// SummaryInformation property IDs (PID)
const SI = {
  TITLE:      2,
  SUBJECT:    3,
  AUTHOR:     4,
  KEYWORDS:   5,
  COMMENTS:   6,
  LASTAUTHOR: 8,
  REVNUMBER:  9,
  CREATED:    12,
  LASTSAVED:  13,
  APPNAME:    18,
};

// DocumentSummaryInformation property IDs
const DSI = {
  CATEGORY:  2,
  COMPANY:   15,
};

export interface DocumentProperties {
  title: string | null;
  subject: string | null;
  author: string | null;
  lastAuthor: string | null;
  revisionNumber: string | null;
  applicationName: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface CustomProperties {
  [key: string]: string | null;
}

export interface SheetInfoEntry {
  name: string;
  size: string | null;
  scale: string | null;
}

export interface FileInfo {
  originalFilename: string;
  sizeBytes: number;
  checksum: string;
  gcsStagingPath: string;
}

export interface ValidationResults {
  drawingNumberMatch: boolean | null;
  revisionMatch: boolean | null;
  checkedAt: string;
}

export interface ExtractionWarning {
  type: 'field_mismatch' | 'field_absent' | 'parse_error' | 'stream_missing';
  field?: string;
  registered?: string;
  extracted?: string;
  detail?: string;
}

export interface ExtractionResult {
  extractionStatus: 'success' | 'partial' | 'failed';
  extractionEngine: string;
  extractionEngineVersion: string;
  documentProperties: DocumentProperties | null;
  customProperties: CustomProperties | null;
  sheetInfo: SheetInfoEntry[] | null;
  fileInfo: FileInfo;
  validationResults: ValidationResults;
  warnings: ExtractionWarning[];
  rawError: string | null;
}

// Parse a Windows FILETIME (100-ns intervals since 1601-01-01) to ISO string
function filetimeToIso(buf: Buffer, offset: number): string | null {
  try {
    const low  = buf.readUInt32LE(offset);
    const high = buf.readUInt32LE(offset + 4);
    if (low === 0 && high === 0) return null;
    const ns100 = high * 4294967296 + low;
    const ms = ns100 / 10000 - 11644473600000;
    if (ms < 0) return null;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

// Read one PROPVARIANT from buf at offset; returns { value, bytesConsumed }
// bytesConsumed includes the 4-byte type header and the value (padded to 4 bytes)
function readPropVariant(buf: Buffer, offset: number): { value: any; bytesConsumed: number } | null {
  if (offset + 4 > buf.length) return null;
  const typeCode = buf.readUInt32LE(offset);

  try {
    switch (typeCode) {
      case VT_LPSTR: {
        if (offset + 8 > buf.length) return null;
        const len = buf.readUInt32LE(offset + 4);
        if (len === 0) return { value: '', bytesConsumed: 4 + 4 };
        const end = offset + 8 + len;
        if (end > buf.length) return null;
        const raw = buf.slice(offset + 8, end - 1); // strip null terminator
        const str = raw.toString('latin1').replace(/\0/g, '').trim();
        const padded = Math.ceil(len / 4) * 4;
        return { value: str, bytesConsumed: 4 + 4 + padded };
      }
      case VT_LPWSTR: {
        if (offset + 8 > buf.length) return null;
        const len = buf.readUInt32LE(offset + 4); // length in WCHARs (including null)
        if (len === 0) return { value: '', bytesConsumed: 4 + 4 };
        const byteLen = len * 2;
        const end = offset + 8 + byteLen;
        if (end > buf.length) return null;
        const str = buf.slice(offset + 8, end).toString('utf16le').replace(/\0/g, '').trim();
        const padded = Math.ceil(byteLen / 4) * 4;
        return { value: str, bytesConsumed: 4 + 4 + padded };
      }
      case VT_I4: {
        if (offset + 8 > buf.length) return null;
        return { value: buf.readInt32LE(offset + 4), bytesConsumed: 4 + 4 };
      }
      case VT_UI4: {
        if (offset + 8 > buf.length) return null;
        return { value: buf.readUInt32LE(offset + 4), bytesConsumed: 4 + 4 };
      }
      case VT_I2: {
        if (offset + 8 > buf.length) return null;
        return { value: buf.readInt16LE(offset + 4), bytesConsumed: 4 + 4 };
      }
      case VT_BOOL: {
        if (offset + 8 > buf.length) return null;
        return { value: buf.readInt16LE(offset + 4) !== 0, bytesConsumed: 4 + 4 };
      }
      case VT_FILETIME: {
        if (offset + 12 > buf.length) return null;
        return { value: filetimeToIso(buf, offset + 4), bytesConsumed: 4 + 8 };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Parse an OLE PROPSET section; returns map of propId → value
function parsePropSection(buf: Buffer, sectionOffset: number): Record<number, any> {
  const props: Record<number, any> = {};
  try {
    if (sectionOffset + 8 > buf.length) return props;
    const numProperties = buf.readUInt32LE(sectionOffset + 4);
    if (numProperties === 0 || numProperties > 4096) return props;

    const idOffsetBase = sectionOffset + 8;
    for (let i = 0; i < numProperties; i++) {
      const entry = idOffsetBase + i * 8;
      if (entry + 8 > buf.length) break;
      const propId  = buf.readUInt32LE(entry);
      const propOff = buf.readUInt32LE(entry + 4);
      const valueAt = sectionOffset + propOff;
      const parsed  = readPropVariant(buf, valueAt);
      if (parsed !== null && parsed.value !== null && parsed.value !== '') {
        props[propId] = parsed.value;
      }
    }
  } catch {
    // best-effort
  }
  return props;
}

// Parse the PROPERTYSETHEADER and return all sections
function parsePropSetFile(data: Uint8Array): Record<number, any>[] {
  const buf = Buffer.from(data);
  const sections: Record<number, any>[] = [];

  try {
    if (buf.length < 28) return sections;
    const byteOrder = buf.readUInt16LE(0);
    if (byteOrder !== 0xFFFE) return sections; // not OLE property set

    const numSets = buf.readUInt32LE(24);
    if (numSets < 1 || numSets > 2) return sections;

    for (let i = 0; i < numSets; i++) {
      const fmtidStart = 28 + i * 20;
      if (fmtidStart + 20 > buf.length) break;
      const offset = buf.readUInt32LE(fmtidStart + 16);
      if (offset >= buf.length) break;
      sections.push(parsePropSection(buf, offset));
    }
  } catch {
    // best-effort
  }
  return sections;
}

// Read a named stream from the CFB compound file; returns null if not found
function readStream(cfb: CFB.CFB$Container, name: string): Uint8Array | null {
  try {
    const entry = CFB.find(cfb, name);
    if (!entry || !entry.content) return null;
    return entry.content as Uint8Array;
  } catch {
    return null;
  }
}

// Extract custom properties from the second property set of DocumentSummaryInformation
function extractCustomProperties(dsiData: Uint8Array | null): CustomProperties | null {
  if (!dsiData) return null;
  const buf = Buffer.from(dsiData);

  try {
    if (buf.length < 28) return null;
    const numSets = buf.readUInt32LE(24);
    if (numSets < 2) return null;

    // Second FMTID/Offset entry is at byte 28 + 20 = 48
    const offsetPos = 28 + 1 * 20 + 16;
    if (offsetPos + 4 > buf.length) return null;
    const sectionOffset = buf.readUInt32LE(offsetPos);
    if (sectionOffset >= buf.length) return null;
    if (sectionOffset + 8 > buf.length) return null;

    const numProperties = buf.readUInt32LE(sectionOffset + 4);
    if (numProperties === 0 || numProperties > 4096) return null;

    const idOffsetBase = sectionOffset + 8;

    // Find the dictionary (PropID = 0) which maps PropID → name
    const nameMap: Record<number, string> = {};
    for (let i = 0; i < numProperties; i++) {
      const entry = idOffsetBase + i * 8;
      if (entry + 8 > buf.length) break;
      const propId = buf.readUInt32LE(entry);
      const propOff = buf.readUInt32LE(entry + 4);
      if (propId === 0) {
        // Dictionary entry
        const dictAt = sectionOffset + propOff;
        if (dictAt + 4 > buf.length) break;
        const numEntries = buf.readUInt32LE(dictAt);
        let pos = dictAt + 4;
        for (let j = 0; j < numEntries && j < 1024; j++) {
          if (pos + 8 > buf.length) break;
          const pid = buf.readUInt32LE(pos);
          const nameLen = buf.readUInt32LE(pos + 4);
          pos += 8;
          if (nameLen === 0 || pos + nameLen > buf.length) break;
          const name = buf.slice(pos, pos + nameLen).toString('latin1').replace(/\0/g, '').trim();
          nameMap[pid] = name;
          pos += Math.ceil(nameLen / 4) * 4;
        }
        break;
      }
    }

    if (Object.keys(nameMap).length === 0) return null;

    const result: CustomProperties = {};
    for (let i = 0; i < numProperties; i++) {
      const entry = idOffsetBase + i * 8;
      if (entry + 8 > buf.length) break;
      const propId = buf.readUInt32LE(entry);
      if (propId === 0 || propId === 1) continue; // skip dictionary and codepage
      const name = nameMap[propId];
      if (!name) continue;
      const propOff = buf.readUInt32LE(entry + 4);
      const valueAt = sectionOffset + propOff;
      const parsed = readPropVariant(buf, valueAt);
      if (parsed !== null && parsed.value !== null) {
        result[name] = String(parsed.value).trim() || null;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// Main extraction function — pure, deterministic given same buffer + same engine version
export function extractDrawingProperties(
  fileBuffer: Buffer,
  registeredDrawingNumber: string,
  registeredRevision: string,
  fileInfo: FileInfo,
): ExtractionResult {
  const warnings: ExtractionWarning[] = [];
  let documentProperties: DocumentProperties | null = null;
  let customProperties: CustomProperties | null = null;
  let sheetInfo: SheetInfoEntry[] | null = null;
  let parseSucceeded = false;

  try {
    const cfb = CFB.read(fileBuffer, { type: 'buffer' });

    // --- SummaryInformation ---
    const siData = readStream(cfb, '/\u0005SummaryInformation');
    if (!siData) {
      warnings.push({ type: 'stream_missing', field: 'SummaryInformation', detail: 'Stream not found in OLE container' });
    } else {
      const sections = parsePropSetFile(siData);
      const si = sections[0] ?? {};
      documentProperties = {
        title:          si[SI.TITLE]      ?? null,
        subject:        si[SI.SUBJECT]    ?? null,
        author:         si[SI.AUTHOR]     ?? null,
        lastAuthor:     si[SI.LASTAUTHOR] ?? null,
        revisionNumber: si[SI.REVNUMBER]  ?? null,
        applicationName: si[SI.APPNAME]   ?? null,
        createdAt:      si[SI.CREATED]    ?? null,
        modifiedAt:     si[SI.LASTSAVED]  ?? null,
      };
      parseSucceeded = true;
    }

    // --- DocumentSummaryInformation + Custom Properties ---
    const dsiData = readStream(cfb, '/\u0005DocumentSummaryInformation');
    if (!dsiData) {
      warnings.push({ type: 'stream_missing', field: 'DocumentSummaryInformation', detail: 'Stream not found in OLE container' });
    } else {
      customProperties = extractCustomProperties(dsiData);
      if (!customProperties) {
        warnings.push({ type: 'stream_missing', field: 'CustomProperties', detail: 'No custom property dictionary found in DocumentSummaryInformation' });
      } else {
        parseSucceeded = true;
      }
    }

    // --- Sheet info: best-effort via custom properties only ---
    if (customProperties) {
      const sheetName  = customProperties['Sheet'] ?? customProperties['SheetName'] ?? null;
      const sheetSize  = customProperties['SheetSize'] ?? customProperties['Sheet Size'] ?? customProperties['Format'] ?? null;
      const sheetScale = customProperties['Scale'] ?? customProperties['Drawing Scale'] ?? null;
      if (sheetName || sheetSize || sheetScale) {
        sheetInfo = [{ name: sheetName ?? 'Sheet1', size: sheetSize, scale: sheetScale }];
      }
    }
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown OLE parse error';
    return {
      extractionStatus: 'failed',
      extractionEngine: EXTRACTION_ENGINE,
      extractionEngineVersion: EXTRACTION_ENGINE_VERSION,
      documentProperties: null,
      customProperties: null,
      sheetInfo: null,
      fileInfo,
      validationResults: buildValidationResults(null, null, registeredDrawingNumber, registeredRevision, warnings),
      warnings,
      rawError: msg,
    };
  }

  // --- Validation: extracted vs registered ---
  const validationResults = buildValidationResults(
    customProperties,
    documentProperties,
    registeredDrawingNumber,
    registeredRevision,
    warnings,
  );

  // Determine final status
  const hasMismatch = warnings.some(w => w.type === 'field_mismatch' || w.type === 'field_absent');
  const hasMissingStream = warnings.some(w => w.type === 'stream_missing');
  let extractionStatus: 'success' | 'partial' | 'failed';
  if (!parseSucceeded) {
    extractionStatus = 'failed';
  } else if (hasMismatch || hasMissingStream) {
    extractionStatus = 'partial';
  } else {
    extractionStatus = 'success';
  }

  return {
    extractionStatus,
    extractionEngine: EXTRACTION_ENGINE,
    extractionEngineVersion: EXTRACTION_ENGINE_VERSION,
    documentProperties,
    customProperties,
    sheetInfo,
    fileInfo,
    validationResults,
    warnings: warnings.length > 0 ? warnings : [],
    rawError: null,
  };
}

function buildValidationResults(
  customProperties: CustomProperties | null,
  documentProperties: DocumentProperties | null,
  registeredDrawingNumber: string,
  registeredRevision: string,
  warnings: ExtractionWarning[],
): ValidationResults {
  let drawingNumberMatch: boolean | null = null;
  let revisionMatch: boolean | null = null;

  // DrawingNumber check: prefer custom properties, fall back to document title
  const extractedDN = customProperties?.['DrawingNumber']
    ?? customProperties?.['Drawing Number']
    ?? customProperties?.['DWG No']
    ?? customProperties?.['Drawing No']
    ?? null;

  if (extractedDN === null) {
    warnings.push({ type: 'field_absent', field: 'DrawingNumber' });
    drawingNumberMatch = null;
  } else {
    drawingNumberMatch = extractedDN.trim().toUpperCase() === registeredDrawingNumber.trim().toUpperCase();
    if (!drawingNumberMatch) {
      warnings.push({
        type: 'field_mismatch',
        field: 'DrawingNumber',
        registered: registeredDrawingNumber,
        extracted: extractedDN,
      });
    }
  }

  // Revision check
  const extractedRev = customProperties?.['Revision']
    ?? customProperties?.['Rev']
    ?? customProperties?.['Rev No']
    ?? documentProperties?.revisionNumber
    ?? null;

  if (extractedRev === null) {
    warnings.push({ type: 'field_absent', field: 'Revision' });
    revisionMatch = null;
  } else {
    revisionMatch = extractedRev.trim().toUpperCase() === registeredRevision.trim().toUpperCase();
    if (!revisionMatch) {
      warnings.push({
        type: 'field_mismatch',
        field: 'Revision',
        registered: registeredRevision,
        extracted: extractedRev,
      });
    }
  }

  return {
    drawingNumberMatch,
    revisionMatch,
    checkedAt: new Date().toISOString(),
  };
}

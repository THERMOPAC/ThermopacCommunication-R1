// ─────────────────────────────────────────────────────────────────────────────
// Drawing AI Extractor — GPT-4o Vision primary, regex fallback
// Each extracted field carries a confidence score (0–1).
// confidence >= 0.8  → normal comparison (FAIL if mismatch)
// 0.5 <= conf < 0.8  → downgrade mismatch from FAIL to WARN
// confidence < 0.5   → treat field as not found (WARN about low confidence)
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');

export const CONFIDENCE_FAIL_THRESHOLD = 0.8;
export const CONFIDENCE_WARN_THRESHOLD = 0.5;

export type ExtractedField = {
  value: string | null;
  unit: string | null;
  confidence: number; // 0–1
};

export type ExtractedSection = {
  internalDesignPressureMawp: ExtractedField;
  externalDesignPressureMawp: ExtractedField;
  workingPressure: ExtractedField;
  hydroTestPressure: ExtractedField;
  mdmt: ExtractedField;
  hydroTestTempMinMax: ExtractedField;
  operatingTempMinMax: ExtractedField;
  designTempMinMax: ExtractedField;
  physicalState: ExtractedField;
  serviceFluid: ExtractedField;
  hazardLevel: ExtractedField;
  specificGravity: ExtractedField;
  internalCorrosionAllowanceMm: ExtractedField;
  externalCorrosionAllowanceMm: ExtractedField;
  radiography: ExtractedField;
  jointEfficiency: ExtractedField;
  postWeldHeatTreatment: ExtractedField;
  typeOfHeads: ExtractedField;
  insulation: ExtractedField;
  insulationTypeThkDensity: ExtractedField;
  material: ExtractedField;
};

export type ExtractedGeneral = {
  hydroTestPosition: ExtractedField;
  vesselOrientation: ExtractedField;
  designServiceLife: ExtractedField;
  windData: ExtractedField;
  windDesignVelocity: ExtractedField;
  seismicDesignCode: ExtractedField;
  hazardFactorZ: ExtractedField;
  seismicCoefficientHorizontal: ExtractedField;
  seismicCoefficientVertical: ExtractedField;
  weightEmptyOperatingHydro: ExtractedField;
  location: ExtractedField;
  qty: ExtractedField;
};

export type DrawingExtraction = {
  engine: 'gpt-4o-vision' | 'pdf-text-layer-parser';
  drawingNumber: ExtractedField;
  revision: ExtractedField;
  title: ExtractedField;
  tagNumber: ExtractedField;
  projectCode: ExtractedField;
  itemCode: ExtractedField;
  designCode: ExtractedField;
  equipmentType: ExtractedField;
  clientName: ExtractedField;
  vendorName: ExtractedField;
  scale: ExtractedField;
  units: ExtractedField;
  date: ExtractedField;
  drawnBy: ExtractedField;
  checkedBy: ExtractedField;
  approvedBy: ExtractedField;
  sheetNumber: ExtractedField;
  ddsReference: ExtractedField;
  shell: ExtractedSection;
  tube: ExtractedSection | null;
  jacket: ExtractedSection | null;
  general: ExtractedGeneral;
  rawText?: string;
};

// ── Null field helper ─────────────────────────────────────────────────────────
function nullField(): ExtractedField {
  return { value: null, unit: null, confidence: 0 };
}

function nullSection(): ExtractedSection {
  return {
    internalDesignPressureMawp: nullField(),
    externalDesignPressureMawp: nullField(),
    workingPressure: nullField(),
    hydroTestPressure: nullField(),
    mdmt: nullField(),
    hydroTestTempMinMax: nullField(),
    operatingTempMinMax: nullField(),
    designTempMinMax: nullField(),
    physicalState: nullField(),
    serviceFluid: nullField(),
    hazardLevel: nullField(),
    specificGravity: nullField(),
    internalCorrosionAllowanceMm: nullField(),
    externalCorrosionAllowanceMm: nullField(),
    radiography: nullField(),
    jointEfficiency: nullField(),
    postWeldHeatTreatment: nullField(),
    typeOfHeads: nullField(),
    insulation: nullField(),
    insulationTypeThkDensity: nullField(),
    material: nullField(),
  };
}

function nullGeneral(): ExtractedGeneral {
  return {
    hydroTestPosition: nullField(),
    vesselOrientation: nullField(),
    designServiceLife: nullField(),
    windData: nullField(),
    windDesignVelocity: nullField(),
    seismicDesignCode: nullField(),
    hazardFactorZ: nullField(),
    seismicCoefficientHorizontal: nullField(),
    seismicCoefficientVertical: nullField(),
    weightEmptyOperatingHydro: nullField(),
    location: nullField(),
    qty: nullField(),
  };
}

// ── GPT-4o extraction prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert pressure vessel drawing analyst.
Given images of a SolidWorks engineering drawing PDF, extract all technical data
from the title block, data sheet tables, and notes panels.

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "drawingNumber":  { "value": null, "unit": null, "confidence": 0.0 },
  "revision":       { "value": null, "unit": null, "confidence": 0.0 },
  "title":          { "value": null, "unit": null, "confidence": 0.0 },
  "tagNumber":      { "value": null, "unit": null, "confidence": 0.0 },
  "projectCode":    { "value": null, "unit": null, "confidence": 0.0 },
  "itemCode":       { "value": null, "unit": null, "confidence": 0.0 },
  "designCode":     { "value": null, "unit": null, "confidence": 0.0 },
  "equipmentType":  { "value": null, "unit": null, "confidence": 0.0 },
  "clientName":     { "value": null, "unit": null, "confidence": 0.0 },
  "vendorName":     { "value": null, "unit": null, "confidence": 0.0 },
  "scale":          { "value": null, "unit": null, "confidence": 0.0 },
  "units":          { "value": null, "unit": null, "confidence": 0.0 },
  "date":           { "value": null, "unit": null, "confidence": 0.0 },
  "drawnBy":        { "value": null, "unit": null, "confidence": 0.0 },
  "checkedBy":      { "value": null, "unit": null, "confidence": 0.0 },
  "approvedBy":     { "value": null, "unit": null, "confidence": 0.0 },
  "sheetNumber":    { "value": null, "unit": null, "confidence": 0.0 },
  "ddsReference":   { "value": null, "unit": null, "confidence": 0.0 },
  "shell": {
    "internalDesignPressureMawp":  { "value": null, "unit": "barg", "confidence": 0.0 },
    "externalDesignPressureMawp":  { "value": null, "unit": "barg", "confidence": 0.0 },
    "workingPressure":             { "value": null, "unit": "barg", "confidence": 0.0 },
    "hydroTestPressure":           { "value": null, "unit": "barg", "confidence": 0.0 },
    "mdmt":                        { "value": null, "unit": "°C",   "confidence": 0.0 },
    "hydroTestTempMinMax":         { "value": null, "unit": "°C",   "confidence": 0.0 },
    "operatingTempMinMax":         { "value": null, "unit": "°C",   "confidence": 0.0 },
    "designTempMinMax":            { "value": null, "unit": "°C",   "confidence": 0.0 },
    "physicalState":               { "value": null, "unit": null,   "confidence": 0.0 },
    "serviceFluid":                { "value": null, "unit": null,   "confidence": 0.0 },
    "hazardLevel":                 { "value": null, "unit": null,   "confidence": 0.0 },
    "specificGravity":             { "value": null, "unit": null,   "confidence": 0.0 },
    "internalCorrosionAllowanceMm":{ "value": null, "unit": "mm",   "confidence": 0.0 },
    "externalCorrosionAllowanceMm":{ "value": null, "unit": "mm",   "confidence": 0.0 },
    "radiography":                 { "value": null, "unit": null,   "confidence": 0.0 },
    "jointEfficiency":             { "value": null, "unit": null,   "confidence": 0.0 },
    "postWeldHeatTreatment":       { "value": null, "unit": null,   "confidence": 0.0 },
    "typeOfHeads":                 { "value": null, "unit": null,   "confidence": 0.0 },
    "insulation":                  { "value": null, "unit": null,   "confidence": 0.0 },
    "insulationTypeThkDensity":    { "value": null, "unit": null,   "confidence": 0.0 },
    "material":                    { "value": null, "unit": null,   "confidence": 0.0 }
  },
  "tube": null,
  "jacket": null,
  "general": {
    "hydroTestPosition":            { "value": null, "unit": null, "confidence": 0.0 },
    "vesselOrientation":            { "value": null, "unit": null, "confidence": 0.0 },
    "designServiceLife":            { "value": null, "unit": null, "confidence": 0.0 },
    "windData":                     { "value": null, "unit": null, "confidence": 0.0 },
    "windDesignVelocity":           { "value": null, "unit": null, "confidence": 0.0 },
    "seismicDesignCode":            { "value": null, "unit": null, "confidence": 0.0 },
    "hazardFactorZ":                { "value": null, "unit": null, "confidence": 0.0 },
    "seismicCoefficientHorizontal": { "value": null, "unit": null, "confidence": 0.0 },
    "seismicCoefficientVertical":   { "value": null, "unit": null, "confidence": 0.0 },
    "weightEmptyOperatingHydro":    { "value": null, "unit": "kg", "confidence": 0.0 },
    "location":                     { "value": null, "unit": null, "confidence": 0.0 },
    "qty":                          { "value": null, "unit": null, "confidence": 0.0 }
  }
}

Rules:
- confidence: 0.9 = clearly visible and unambiguous; 0.7 = readable but unclear; 0.5 = inferred; 0.3 = guessed; 0.0 = not found
- Always extract the unit separately from the value. value = numeric or text, unit = "barg"/"°C"/etc.
- If tube or jacket data is present in the drawing, populate the tube/jacket objects with the same structure as shell.
- If tube or jacket is not on the drawing, set to null.
- Never invent values. If a field is not visible, set value: null and confidence: 0.0.`;

// ── Convert PDF buffer to base64 image via pdfjs-dist ────────────────────────
// We use the raw first-page image for GPT-4o. For simplicity in Phase 1,
// we encode the PDF directly as a base64 data URL (GPT-4o accepts PDFs via URL
// only, not base64 PDF). Instead we extract the raw text + send as context.
// Full image rendering requires pdf2pic which needs native ghostscript.
// Phase 1: send first 4000 chars of text layer as context to GPT-4o with
// the instruction to extract structured data.

async function extractWithGPT4o(pdfBuffer: Buffer): Promise<DrawingExtraction> {
  let rawText = '';
  try {
    const parsed = await pdfParse(pdfBuffer);
    rawText = (parsed.text || '').slice(0, 6000);
  } catch {
    rawText = '';
  }

  const openai = new OpenAI();

  const userContent = rawText.trim()
    ? `Here is the text extracted from a pressure vessel engineering drawing PDF:\n\n${rawText}\n\nExtract all technical data according to the schema.`
    : 'The PDF appears to have no extractable text layer. Return all fields as null with confidence 0.0.';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('GPT-4o returned non-JSON response');

  const parsed = JSON.parse(jsonMatch[0]);

  function toField(raw: any): ExtractedField {
    if (!raw || typeof raw !== 'object') return nullField();
    return {
      value: raw.value ?? null,
      unit: raw.unit ?? null,
      confidence: typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0,
    };
  }

  function toSection(raw: any): ExtractedSection {
    if (!raw || typeof raw !== 'object') return nullSection();
    return {
      internalDesignPressureMawp:   toField(raw.internalDesignPressureMawp),
      externalDesignPressureMawp:   toField(raw.externalDesignPressureMawp),
      workingPressure:              toField(raw.workingPressure),
      hydroTestPressure:            toField(raw.hydroTestPressure),
      mdmt:                         toField(raw.mdmt),
      hydroTestTempMinMax:          toField(raw.hydroTestTempMinMax),
      operatingTempMinMax:          toField(raw.operatingTempMinMax),
      designTempMinMax:             toField(raw.designTempMinMax),
      physicalState:                toField(raw.physicalState),
      serviceFluid:                 toField(raw.serviceFluid),
      hazardLevel:                  toField(raw.hazardLevel),
      specificGravity:              toField(raw.specificGravity),
      internalCorrosionAllowanceMm: toField(raw.internalCorrosionAllowanceMm),
      externalCorrosionAllowanceMm: toField(raw.externalCorrosionAllowanceMm),
      radiography:                  toField(raw.radiography),
      jointEfficiency:              toField(raw.jointEfficiency),
      postWeldHeatTreatment:        toField(raw.postWeldHeatTreatment),
      typeOfHeads:                  toField(raw.typeOfHeads),
      insulation:                   toField(raw.insulation),
      insulationTypeThkDensity:     toField(raw.insulationTypeThkDensity),
      material:                     toField(raw.material),
    };
  }

  function toGeneral(raw: any): ExtractedGeneral {
    if (!raw || typeof raw !== 'object') return nullGeneral();
    return {
      hydroTestPosition:            toField(raw.hydroTestPosition),
      vesselOrientation:            toField(raw.vesselOrientation),
      designServiceLife:            toField(raw.designServiceLife),
      windData:                     toField(raw.windData),
      windDesignVelocity:           toField(raw.windDesignVelocity),
      seismicDesignCode:            toField(raw.seismicDesignCode),
      hazardFactorZ:                toField(raw.hazardFactorZ),
      seismicCoefficientHorizontal: toField(raw.seismicCoefficientHorizontal),
      seismicCoefficientVertical:   toField(raw.seismicCoefficientVertical),
      weightEmptyOperatingHydro:    toField(raw.weightEmptyOperatingHydro),
      location:                     toField(raw.location),
      qty:                          toField(raw.qty),
    };
  }

  return {
    engine: 'gpt-4o-vision',
    drawingNumber: toField(parsed.drawingNumber),
    revision:      toField(parsed.revision),
    title:         toField(parsed.title),
    tagNumber:     toField(parsed.tagNumber),
    projectCode:   toField(parsed.projectCode),
    itemCode:      toField(parsed.itemCode),
    designCode:    toField(parsed.designCode),
    equipmentType: toField(parsed.equipmentType),
    clientName:    toField(parsed.clientName),
    vendorName:    toField(parsed.vendorName),
    scale:         toField(parsed.scale),
    units:         toField(parsed.units),
    date:          toField(parsed.date),
    drawnBy:       toField(parsed.drawnBy),
    checkedBy:     toField(parsed.checkedBy),
    approvedBy:    toField(parsed.approvedBy),
    sheetNumber:   toField(parsed.sheetNumber),
    ddsReference:  toField(parsed.ddsReference),
    shell:         toSection(parsed.shell),
    tube:          parsed.tube ? toSection(parsed.tube) : null,
    jacket:        parsed.jacket ? toSection(parsed.jacket) : null,
    general:       toGeneral(parsed.general),
    rawText,
  };
}

// ── Regex fallback (text-layer only) ─────────────────────────────────────────
async function extractWithRegex(pdfBuffer: Buffer): Promise<DrawingExtraction> {
  let rawText = '';
  try {
    const parsed = await pdfParse(pdfBuffer);
    rawText = parsed.text || '';
  } catch {
    rawText = '';
  }

  const t = rawText.toLowerCase();

  function findVal(patterns: RegExp[]): ExtractedField {
    for (const p of patterns) {
      const m = rawText.match(p);
      if (m && m[1]?.trim()) {
        return { value: m[1].trim(), unit: null, confidence: 0.6 };
      }
    }
    return nullField();
  }

  const drawingNumber = findVal([
    /DWG\.?\s*NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
    /DRAWING\s+NO\.?\s*[:\-]?\s*([A-Z0-9][\w.\-\/]{3,50})/i,
  ]);
  const revision = findVal([/\bREV(?:ISION)?\.?\s*[:\-]?\s*([A-Z0-9]{1,5})/i]);
  const title = findVal([/TITLE\s*[:\-]\s*(.+?)(?:\n|DWG|$)/i]);
  const tagNumber = findVal([/TAG\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*([A-Z0-9\-\/]{3,40})/i]);
  const projectCode = findVal([/PROJECT\s*(?:NO\.?|CODE)?\s*[:\-]?\s*([A-Z0-9\-\/]{3,30})/i]);

  return {
    engine: 'pdf-text-layer-parser',
    drawingNumber,
    revision,
    title,
    tagNumber,
    projectCode,
    itemCode:      nullField(),
    designCode:    findVal([/DESIGN\s*CODE\s*[:\-]?\s*(.+?)(?:\n|$)/i]),
    equipmentType: findVal([/EQUIPMENT\s*TYPE\s*[:\-]?\s*(.+?)(?:\n|$)/i]),
    clientName:    findVal([/CLIENT\s*[:\-]?\s*(.+?)(?:\n|$)/i]),
    vendorName:    findVal([/(?:THERMOPAC|VENDOR|MANUFACTURER)\s*[:\-]?\s*(.+?)(?:\n|$)/i]),
    scale:         findVal([/SCALE\s*[:\-]?\s*([\d:\/NTSnts]+)/i]),
    units:         findVal([/UNITS?\s*[:\-]?\s*(.+?)(?:\n|$)/i]),
    date:          findVal([/DATE\s*[:\-]?\s*([\d\/\-\.]+)/i]),
    drawnBy:       findVal([/DRAWN\s*BY\s*[:\-]?\s*([A-Za-z\s\.]+?)(?:\n|DATE|$)/i]),
    checkedBy:     findVal([/CHECKED?\s*BY\s*[:\-]?\s*([A-Za-z\s\.]+?)(?:\n|DATE|$)/i]),
    approvedBy:    findVal([/APPROVED?\s*BY\s*[:\-]?\s*([A-Za-z\s\.]+?)(?:\n|DATE|$)/i]),
    sheetNumber:   findVal([/SHEET\s*[:\-]?\s*(\d+\s*(?:of|\/)\s*\d+)/i]),
    ddsReference:  findVal([/DDS\s*(?:REF\.?|REFERENCE)?\s*[:\-]?\s*([A-Z0-9\-\/\.]+)/i]),
    shell:         nullSection(),
    tube:          null,
    jacket:        null,
    general:       nullGeneral(),
    rawText,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function extractDrawingData(pdfBuffer: Buffer): Promise<DrawingExtraction> {
  try {
    const result = await extractWithGPT4o(pdfBuffer);
    return result;
  } catch (err: any) {
    console.warn('[drawing-ai-extractor] GPT-4o failed, falling back to regex:', err?.message);
    return extractWithRegex(pdfBuffer);
  }
}

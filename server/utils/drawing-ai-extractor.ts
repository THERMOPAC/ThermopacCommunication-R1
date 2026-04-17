// ─────────────────────────────────────────────────────────────────────────────
// Drawing AI Extractor
//
// PRIMARY  : GPT-4o Vision — PDF pages rendered to PNG via pdftoppm, then sent
//            as base64 images to the Vision API.  source = 'vision'
// FALLBACK : pdf-parse text layer → GPT-4o text completion.  source = 'text'
//
// Confidence thresholds:
//   confidence >= 0.7  → normal comparison (FAIL if mismatch)
//   0.5 <= conf < 0.7  → mismatch downgraded from FAIL to WARN
//   confidence < 0.5   → treat as missing (WARN — manual review required)
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');

// ── Confidence thresholds ─────────────────────────────────────────────────────
export const CONFIDENCE_FAIL_THRESHOLD = 0.7;   // below → WARN not FAIL
export const CONFIDENCE_WARN_THRESHOLD = 0.5;   // below → treat as missing

// ── Types ─────────────────────────────────────────────────────────────────────
export type ExtractedField = {
  value: string | null;
  unit: string | null;
  confidence: number;        // 0–1
  source: 'vision' | 'text' | 'none';
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
  engine: 'vision-based' | 'text-based fallback';
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

// ── Null helpers ───────────────────────────────────────────────────────────────
export function nullField(): ExtractedField {
  return { value: null, unit: null, confidence: 0, source: 'none' };
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

// ── GPT-4o JSON schema prompt (shared by vision + text) ───────────────────────
const SYSTEM_PROMPT = `You are an expert pressure vessel drawing analyst.
Extract all technical data from the pressure vessel engineering drawing.
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
- confidence: 0.95 = clearly legible in the drawing; 0.75 = readable; 0.55 = inferred/partially visible; 0.30 = guessed; 0.0 = not found
- Always separate the numeric value from its unit.
- If tube or jacket data is present in the drawing, populate those objects with the same structure as shell.
- If tube or jacket data is absent, set to null.
- Never invent values. If a field is not visible, set value: null and confidence: 0.0.`;

// ── PDF → PNG images via pdftoppm ─────────────────────────────────────────────
async function renderPdfToImages(pdfBuffer: Buffer): Promise<string[]> {
  const uid = randomUUID();
  const tmpPdf = join(tmpdir(), `dwg-${uid}.pdf`);
  const tmpPrefix = join(tmpdir(), `dwg-${uid}`);

  try {
    await writeFile(tmpPdf, pdfBuffer);

    // Convert first 3 pages to PNG, scaled to 2000px wide (good for title blocks)
    await execFileAsync('pdftoppm', [
      '-png',
      '-r', '200',
      '-scale-to-x', '2000',
      '-scale-to-y', '-1',
      '-f', '1',
      '-l', '3',
      tmpPdf,
      tmpPrefix,
    ]);

    // Collect generated PNGs
    const dir = tmpdir();
    const files = await readdir(dir);
    const pngFiles = files
      .filter(f => f.startsWith(`dwg-${uid}`) && f.endsWith('.png'))
      .sort()
      .slice(0, 3);

    const base64Images: string[] = [];
    for (const f of pngFiles) {
      const filePath = join(dir, f);
      const buf = await readFile(filePath);
      base64Images.push(`data:image/png;base64,${buf.toString('base64')}`);
      await unlink(filePath).catch(() => {});
    }

    return base64Images;
  } finally {
    await unlink(tmpPdf).catch(() => {});
  }
}

// ── Parse GPT-4o JSON response → DrawingExtraction ───────────────────────────
function parseGptResponse(
  content: string,
  source: 'vision' | 'text',
): Omit<DrawingExtraction, 'engine' | 'rawText'> {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('GPT-4o returned non-JSON response');
  const parsed = JSON.parse(jsonMatch[0]);

  function toField(raw: any): ExtractedField {
    if (!raw || typeof raw !== 'object') return { ...nullField(), source };
    return {
      value: raw.value ?? null,
      unit: raw.unit ?? null,
      confidence: typeof raw.confidence === 'number'
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0,
      source,
    };
  }

  function toSection(raw: any): ExtractedSection {
    if (!raw || typeof raw !== 'object') return { ...nullSection() };
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
  };
}

// ── PRIMARY: GPT-4o Vision (rendered images) ──────────────────────────────────
async function extractWithVision(pdfBuffer: Buffer): Promise<DrawingExtraction> {
  const images = await renderPdfToImages(pdfBuffer);

  if (!images.length) {
    throw new Error('pdftoppm produced no images — cannot run vision extraction');
  }

  const openai = new OpenAI();

  const imageContent = images.map(dataUrl => ({
    type: 'image_url' as const,
    image_url: { url: dataUrl, detail: 'high' as const },
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `The following ${images.length} image(s) are rendered pages of a pressure vessel engineering drawing PDF. Extract all technical data visible in the title block, data table, and notes sections.`,
          },
          ...imageContent,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '{}';
  const fields = parseGptResponse(content, 'vision');

  return { engine: 'vision-based', ...fields };
}

// ── FALLBACK: pdf-parse text → GPT-4o text completion ────────────────────────
async function extractWithTextFallback(pdfBuffer: Buffer): Promise<DrawingExtraction> {
  let rawText = '';
  try {
    const parsed = await pdfParse(pdfBuffer);
    rawText = (parsed.text || '').slice(0, 8000);
  } catch {
    rawText = '';
  }

  const openai = new OpenAI();

  const userContent = rawText.trim()
    ? `Here is the text layer extracted from a pressure vessel engineering drawing PDF:\n\n${rawText}\n\nExtract all technical data according to the schema. Note: this is text-layer extraction only — some fields may not be available.`
    : 'The PDF has no extractable text layer. Return all fields as null with confidence 0.0.';

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
  const fields = parseGptResponse(content, 'text');

  return { engine: 'text-based fallback', rawText, ...fields };
}

// ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────────
export async function extractDrawingData(pdfBuffer: Buffer): Promise<DrawingExtraction> {
  // Phase 1: try vision-based (pdftoppm → GPT-4o Vision)
  try {
    console.log('[drawing-ai-extractor] Attempting vision-based extraction (pdftoppm + GPT-4o Vision)...');
    const result = await extractWithVision(pdfBuffer);
    console.log('[drawing-ai-extractor] Vision extraction successful.');
    return result;
  } catch (visionErr: any) {
    console.warn('[drawing-ai-extractor] Vision extraction failed, falling back to text-based:', visionErr?.message);
  }

  // Fallback: text layer → GPT-4o text
  try {
    console.log('[drawing-ai-extractor] Attempting text-based fallback extraction...');
    const result = await extractWithTextFallback(pdfBuffer);
    console.log('[drawing-ai-extractor] Text-based fallback extraction successful.');
    return result;
  } catch (textErr: any) {
    console.error('[drawing-ai-extractor] Both extraction methods failed:', textErr?.message);
    // Return a fully null extraction — rule engine will WARN on all fields
    return {
      engine: 'text-based fallback',
      rawText: '',
      drawingNumber: nullField(),
      revision:      nullField(),
      title:         nullField(),
      tagNumber:     nullField(),
      projectCode:   nullField(),
      itemCode:      nullField(),
      designCode:    nullField(),
      equipmentType: nullField(),
      clientName:    nullField(),
      vendorName:    nullField(),
      scale:         nullField(),
      units:         nullField(),
      date:          nullField(),
      drawnBy:       nullField(),
      checkedBy:     nullField(),
      approvedBy:    nullField(),
      sheetNumber:   nullField(),
      ddsReference:  nullField(),
      shell:         nullSection(),
      tube:          null,
      jacket:        null,
      general:       nullGeneral(),
    };
  }
}

import ExcelJS from 'exceljs';
import type { MechanicalColumn, MechanicalData, GeneralData, ColumnHazardData } from '@shared/schema';

const MECH_PARAM_ROWS: { key: keyof MechanicalColumn; label: string; group: string }[] = [
  { key: 'internalDesignPressureMawp', label: 'INTERNAL DESIGN PRESSURE / MAWP (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'externalDesignPressureMawp', label: 'EXTERNAL DESIGN PRESSURE / MAWP (Bara)', group: 'PRESSURE (Barg)' },
  { key: 'workingPressure',            label: 'WORKING PRESSURE (Barg)',                 group: 'PRESSURE (Barg)' },
  { key: 'hydroTestPressure',          label: 'HYDRO TEST PRESSURE (Barg)',              group: 'PRESSURE (Barg)' },
  { key: 'mdmt',                       label: 'MDMT (DEG. C)',                           group: 'TEMPERATURE (DEG. C)' },
  { key: 'hydroTestTempMinMax',        label: 'HYDRO TEST (MIN / MAX) (DEG. C)',         group: 'TEMPERATURE (DEG. C)' },
  { key: 'operatingTempMinMax',        label: 'OPERATING (MIN / MAX) (DEG. C)',          group: 'TEMPERATURE (DEG. C)' },
  { key: 'designTempMinMax',           label: 'DESIGN (MIN / MAX) (DEG. C)',             group: 'TEMPERATURE (DEG. C)' },
  { key: 'physicalState',              label: 'PHYSICAL STATE',                          group: '' },
  { key: 'grossVolumeLiters',          label: 'GROSS VOLUME (LITERS)',                   group: '' },
  { key: 'serviceFluid',               label: 'SERVICE FLUID',                           group: '' },
  { key: 'hazardLevel',                label: 'HAZARD LEVEL',                            group: '' },
  { key: 'specificGravity',            label: 'SPECIFIC GRAVITY (LIQUID / GAS)',         group: '' },
  { key: 'internalCorrosionAllowanceMm', label: 'INTERNAL CORROSION ALLOWANCE (MM)',    group: '' },
  { key: 'externalCorrosionAllowanceMm', label: 'EXTERNAL CORROSION ALLOWANCE (MM)',    group: '' },
  { key: 'radiography',                label: 'RADIOGRAPHY',                             group: '' },
  { key: 'jointEfficiency',            label: 'JOINT EFFICIENCY',                        group: '' },
  { key: 'testingGroup',               label: 'TESTING GROUP',                           group: '' },
  { key: 'fabricationToleranceClass',  label: 'FABRICATION TOLERANCE QUALITY CLASS',    group: '' },
  { key: 'postWeldHeatTreatment',      label: 'POST WELD HEAT TREATMENT',               group: '' },
  { key: 'typeOfHeads',                label: 'TYPE OF HEADS',                           group: '' },
  { key: 'insulation',                 label: 'INSULATION',                              group: '' },
  { key: 'insulationTypeThkDensity',   label: 'INSULATION (TYPE / THK / DENSITY)',       group: '' },
];

const GENERAL_PARAM_ROWS: { key: keyof GeneralData; label: string }[] = [
  { key: 'hydroTestPosition',              label: 'HYDRO TEST POSITION' },
  { key: 'vesselOrientation',              label: 'VESSEL ORIENTATION (HOR / VER)' },
  { key: 'designServiceLife',              label: 'DESIGN SERVICE LIFE' },
  { key: 'windData',                       label: 'WIND DATA' },
  { key: 'windDesignVelocity',             label: 'WIND DESIGN VELOCITY' },
  { key: 'seismicDesignCode',              label: 'SEISMIC DESIGN CODE' },
  { key: 'hazardFactorZ',                  label: 'HAZARD FACTOR Z' },
  { key: 'seismicCoefficientHorizontal',   label: 'SEISMIC COEFFICIENT HORIZONTAL WSD' },
  { key: 'seismicCoefficientVertical',     label: 'SEISMIC COEFFICIENT VERTICAL WSD' },
  { key: 'weightEmptyOperatingHydro',      label: 'WEIGHT (EMPTY / OPERATING / HYDRO TEST) KGS' },
  { key: 'location',                       label: 'LOCATION' },
  { key: 'qty',                            label: 'QTY' },
];

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FF1F3864' },
};
const GROUP_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid',
  fgColor: { argb: 'FFD6E4F0' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const BOLD_FONT: Partial<ExcelJS.Font>  = { bold: true, size: 9 };
const NORMAL_FONT: Partial<ExcelJS.Font> = { size: 9 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin' },
  left:   { style: 'thin' },
  bottom: { style: 'thin' },
  right:  { style: 'thin' },
};

function cell(ws: ExcelJS.Worksheet, r: number, c: number): ExcelJS.Cell {
  return ws.getRow(r).getCell(c);
}

function headerCell(ws: ExcelJS.Worksheet, r: number, c: number, value: string) {
  const cl = cell(ws, r, c);
  cl.value = value;
  cl.font = HEADER_FONT;
  cl.fill = HEADER_FILL;
  cl.border = THIN_BORDER;
  cl.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}

function groupCell(ws: ExcelJS.Worksheet, r: number, c: number, value: string) {
  const cl = cell(ws, r, c);
  cl.value = value;
  cl.font = BOLD_FONT;
  cl.fill = GROUP_FILL;
  cl.border = THIN_BORDER;
  cl.alignment = { horizontal: 'left', vertical: 'middle' };
}

function dataCell(ws: ExcelJS.Worksheet, r: number, c: number, value: string | null, bold = false) {
  const cl = cell(ws, r, c);
  cl.value = value || '—';
  cl.font = bold ? BOLD_FONT : NORMAL_FONT;
  cl.border = THIN_BORDER;
  cl.alignment = { vertical: 'middle', wrapText: true };
}

function labelCell(ws: ExcelJS.Worksheet, r: number, c: number, value: string) {
  const cl = cell(ws, r, c);
  cl.value = value;
  cl.font = BOLD_FONT;
  cl.fill = GROUP_FILL;
  cl.border = THIN_BORDER;
  cl.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
}

export interface DdsExcelInput {
  sheet: {
    id: number;
    design_code: string;
    material_code?: string | null;
    equipment_type?: string | null;
    equipment_config: string;
    tag_no?: string | null;
    equipment_description?: string | null;
    manufacture_serial_no?: string | null;
    inspection_by?: string | null;
    mechanical_data: MechanicalData;
    general_data: GeneralData;
    hazard_data?: ColumnHazardData | null;
    revision?: string | null;
    status?: string;
    updated_at?: string | null;
  };
  drawingNumber: string;
  revision: string;
  generatedBy: string;
  projectCode?: string | null;
}

export async function generateDdsExcel(input: DdsExcelInput): Promise<Buffer> {
  const { sheet, drawingNumber, revision, generatedBy } = input;
  const mech = sheet.mechanical_data;
  const gen  = sheet.general_data;
  const cfg  = sheet.equipment_config;

  const hasTube   = cfg === 'Heat Exchanger' || cfg === 'Jacketed Vessel and Heat Exchanger';
  const hasJacket = cfg === 'Jacketed Vessel' || cfg === 'Jacketed Vessel and Heat Exchanger';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'THERMOPAC ERP';
  wb.created = new Date();

  // ── Sheet 1: Mechanical Design Data ─────────────────────────────────────────
  const ws1 = wb.addWorksheet('Mechanical Design Data');

  const colCount = 2 + 1 + (hasTube ? 1 : 0) + (hasJacket ? 1 : 0);
  const COL_GROUP = 1;
  const COL_PARAM = 2;
  const COL_SHELL = 3;
  const COL_TUBE  = hasTube   ? 4 : -1;
  const COL_JACKET= hasJacket ? (hasTube ? 5 : 4) : -1;

  ws1.getColumn(COL_GROUP).width  = 20;
  ws1.getColumn(COL_PARAM).width  = 42;
  ws1.getColumn(COL_SHELL).width  = 22;
  if (COL_TUBE   > 0) ws1.getColumn(COL_TUBE).width   = 22;
  if (COL_JACKET > 0) ws1.getColumn(COL_JACKET).width = 22;

  // Title row
  let r = 1;
  const titleCell = ws1.getRow(r).getCell(1);
  titleCell.value = `DESIGN DATA SHEET — ${sheet.equipment_type || cfg.toUpperCase()}`;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FF1F3864' } };
  ws1.mergeCells(r, 1, r, colCount);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(r).height = 22;

  // Drawing / Tag info row
  r++;
  ws1.getRow(r).getCell(1).value = `Drawing No: ${drawingNumber}   Rev: ${revision}   Tag No: ${sheet.tag_no || '—'}   Inspection By: ${sheet.inspection_by || '—'}`;
  ws1.getRow(r).getCell(1).font = { italic: true, size: 9, color: { argb: 'FF444444' } };
  ws1.mergeCells(r, 1, r, colCount);

  // Column headers
  r++;
  headerCell(ws1, r, COL_GROUP, 'GROUP');
  headerCell(ws1, r, COL_PARAM, 'PARAMETER');
  headerCell(ws1, r, COL_SHELL, 'SHELL');
  if (COL_TUBE   > 0) headerCell(ws1, r, COL_TUBE,   'TUBE');
  if (COL_JACKET > 0) headerCell(ws1, r, COL_JACKET, 'JACKET');
  ws1.getRow(r).height = 18;

  // Data rows
  let lastGroup = '';
  for (const p of MECH_PARAM_ROWS) {
    r++;
    const g = p.group || '';
    if (g && g !== lastGroup) {
      lastGroup = g;
      groupCell(ws1, r, COL_GROUP, g);
      ws1.mergeCells(r, COL_PARAM, r, colCount);
      groupCell(ws1, r, COL_PARAM, '');
      ws1.getRow(r).height = 14;
      r++;
    }

    const shellVal = (mech.shell as any)?.[p.key] ?? null;
    const tubeVal  = hasTube   ? ((mech.tube   as any)?.[p.key]  ?? null) : null;
    const jacketVal= hasJacket ? ((mech.jacket as any)?.[p.key]  ?? null) : null;

    cell(ws1, r, COL_GROUP).border = THIN_BORDER;
    labelCell(ws1, r, COL_PARAM, p.label);
    dataCell(ws1, r, COL_SHELL, shellVal);
    if (COL_TUBE   > 0) dataCell(ws1, r, COL_TUBE,   p.key === 'insulation' || p.key === 'insulationTypeThkDensity' ? 'N.A.' : tubeVal);
    if (COL_JACKET > 0) dataCell(ws1, r, COL_JACKET, jacketVal);
    ws1.getRow(r).height = 16;
  }

  // ── Sheet 2: General Data ────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('General Data');
  ws2.getColumn(1).width = 42;
  ws2.getColumn(2).width = 40;

  let r2 = 1;
  const titleCell2 = ws2.getRow(r2).getCell(1);
  titleCell2.value = 'GENERAL DATA';
  titleCell2.font = { bold: true, size: 12, color: { argb: 'FF1F3864' } };
  ws2.mergeCells(r2, 1, r2, 2);
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(r2).height = 22;

  r2++;
  headerCell(ws2, r2, 1, 'FIELD');
  headerCell(ws2, r2, 2, 'VALUE');
  ws2.getRow(r2).height = 18;

  for (const p of GENERAL_PARAM_ROWS) {
    r2++;
    labelCell(ws2, r2, 1, p.label);
    dataCell(ws2, r2, 2, (gen as any)[p.key] ?? null);
    ws2.getRow(r2).height = 16;
  }

  // ── Sheet 3: Metadata ────────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Metadata');
  ws3.getColumn(1).width = 30;
  ws3.getColumn(2).width = 50;

  const metaRows: [string, string][] = [
    ['Drawing Number',   drawingNumber],
    ['Revision',         revision],
    ['Tag No',           sheet.tag_no || '—'],
    ['Equipment Type',   sheet.equipment_type || cfg],
    ['Equipment Config', cfg],
    ['Design Code',      sheet.design_code],
    ['Material Code',    sheet.material_code || '—'],
    ['Inspection By',    sheet.inspection_by || '—'],
    ['Status',           sheet.status || '—'],
    ['Generated Date',   new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
    ['Generated By',     generatedBy],
  ];

  let r3 = 1;
  const titleCell3 = ws3.getRow(r3).getCell(1);
  titleCell3.value = 'METADATA';
  titleCell3.font = { bold: true, size: 12, color: { argb: 'FF1F3864' } };
  ws3.mergeCells(r3, 1, r3, 2);
  titleCell3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws3.getRow(r3).height = 22;

  r3++;
  headerCell(ws3, r3, 1, 'FIELD');
  headerCell(ws3, r3, 2, 'VALUE');
  ws3.getRow(r3).height = 18;

  for (const [label, value] of metaRows) {
    r3++;
    labelCell(ws3, r3, 1, label);
    dataCell(ws3, r3, 2, value);
    ws3.getRow(r3).height = 16;
  }

  // ── Sheet 4: Nameplate Data ─────────────────────────────────────────────────
  const ws4 = wb.addWorksheet('Nameplate Data');
  ws4.getColumn(1).width = 38;
  ws4.getColumn(2).width = 22;
  ws4.getColumn(3).width = 22;
  ws4.getColumn(4).width = 10;

  const currentYear = new Date().getFullYear().toString();

  // Parse "330 / 460 / 1200" → empty, operating
  const weightParts = (gen.weightEmptyOperatingHydro || '').split('/').map((s: string) => s.trim());
  const weightEmpty     = weightParts[0] || null;
  const weightOperating = weightParts[1] || null;

  // Merged-value row: label in A, value spans B–D
  function npMergedRow(r: number, label: string, value: string | null) {
    labelCell(ws4, r, 1, label);
    const vc = ws4.getRow(r).getCell(2);
    vc.value = value ?? '';
    vc.font  = NORMAL_FONT;
    vc.border = THIN_BORDER;
    vc.alignment = { vertical: 'middle', wrapText: true };
    ws4.mergeCells(r, 2, r, 4);
    ws4.getRow(r).height = 18;
  }

  // Table data row: label in A, shell in B, tube in C (blank if no tube), unit in D
  function npDataRow(r: number, label: string, shellVal: string | null, tubeVal: string | null, unit: string) {
    labelCell(ws4, r, 1, label);
    dataCell(ws4, r, 2, shellVal);
    const tc = ws4.getRow(r).getCell(3);
    if (hasTube) {
      tc.value  = tubeVal ?? '—';
      tc.font   = NORMAL_FONT;
      tc.border = THIN_BORDER;
      tc.alignment = { vertical: 'middle', wrapText: true };
    } else {
      tc.value  = '';
      tc.border = THIN_BORDER;
    }
    const uc = ws4.getRow(r).getCell(4);
    uc.value = unit;
    uc.font  = BOLD_FONT;
    uc.border = THIN_BORDER;
    uc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws4.getRow(r).height = 18;
  }

  let r4 = 1;

  // Row 1 — sheet title
  {
    const tc = ws4.getRow(r4).getCell(1);
    tc.value = 'NAMEPLATE DATA';
    tc.font  = { bold: true, size: 13, color: { argb: 'FF1F3864' } };
    ws4.mergeCells(r4, 1, r4, 4);
    tc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws4.getRow(r4).height = 24;
  }

  // Row 2 — MANUFACTURER name
  r4++;
  npMergedRow(r4, 'MANUFACTURER', 'THERMOPAC PROCESS ENGINEERING LLP.');

  // Row 3 — address (blank label)
  r4++;
  npMergedRow(r4, '', '405, L4 THE SUMMIT BUSINESS BAY, WESTERN EXPRESS HIGHWAY, VILE PARLE (E), MUMBAI 400057, INDIA');

  // Row 4 — EQUIPMENT NAME
  r4++;
  npMergedRow(r4, 'EQUIPMENT NAME', sheet.equipment_description ?? null);

  // Row 5 — DESIGN CODE
  r4++;
  npMergedRow(r4, 'DESIGN CODE', sheet.design_code ?? null);

  // Row 6 — INSPECTED BY
  r4++;
  npMergedRow(r4, 'INSPECTED BY', sheet.inspection_by ?? null);

  // Row 7 — column sub-headers for the pressure/temp table
  r4++;
  labelCell(ws4, r4, 1, '');
  headerCell(ws4, r4, 2, 'SHELL');
  headerCell(ws4, r4, 3, hasTube ? 'TUBE' : '');
  headerCell(ws4, r4, 4, 'UNIT');
  ws4.getRow(r4).height = 18;

  // Rows 8–13 — main data table
  r4++; npDataRow(r4, 'INTERNAL DESIGN PRESS./MAWP (Ps)', (mech.shell as any)?.internalDesignPressureMawp ?? null, (mech.tube as any)?.internalDesignPressureMawp ?? null, 'bar g');
  r4++; npDataRow(r4, 'EXTERNAL DESIGN PRESS./MAWP (Ps)', (mech.shell as any)?.externalDesignPressureMawp ?? null, (mech.tube as any)?.externalDesignPressureMawp ?? null, 'bar g');
  r4++; npDataRow(r4, 'DESIGN TEMPERATURE (MIN/MAX) (Ts)', (mech.shell as any)?.designTempMinMax ?? null, (mech.tube as any)?.designTempMinMax ?? null, '°C');
  r4++; npDataRow(r4, 'HYDROTEST PRESSURE (Pt)', (mech.shell as any)?.hydroTestPressure ?? null, (mech.tube as any)?.hydroTestPressure ?? null, 'bar g');
  r4++; npDataRow(r4, 'CAPACITY (VOLUME)', (mech.shell as any)?.grossVolumeLiters ?? null, (mech.tube as any)?.grossVolumeLiters ?? null, 'LTRS');
  r4++; npDataRow(r4, 'CONTENTS', (mech.shell as any)?.serviceFluid ?? null, (mech.tube as any)?.serviceFluid ?? null, '—');

  // Row 14 — YEAR OF MANUFACTURE
  r4++;
  npMergedRow(r4, 'YEAR OF MANUFACTURE', currentYear);

  // Row 15 — TAG NUMBER
  r4++;
  npMergedRow(r4, 'TAG NUMBER', sheet.tag_no ?? null);

  // Row 16 — HYDROTEST DATE (blank — filled after physical test)
  r4++;
  npMergedRow(r4, 'HYDROTEST DATE', null);

  // Row 17 — weight sub-headers
  r4++;
  labelCell(ws4, r4, 1, '');
  headerCell(ws4, r4, 2, 'EMPTY');
  headerCell(ws4, r4, 3, 'OPERATING');
  headerCell(ws4, r4, 4, 'kgs.');
  ws4.getRow(r4).height = 18;

  // Row 18 — WEIGHT values
  r4++;
  labelCell(ws4, r4, 1, 'WEIGHT');
  dataCell(ws4, r4, 2, weightEmpty);
  dataCell(ws4, r4, 3, weightOperating);
  {
    const uc = ws4.getRow(r4).getCell(4);
    uc.value = 'kgs.';
    uc.font  = BOLD_FONT;
    uc.border = THIN_BORDER;
    uc.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  ws4.getRow(r4).height = 18;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

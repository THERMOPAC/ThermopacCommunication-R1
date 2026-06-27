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
  logoBuffer?: Buffer | null;
  companyName?: string | null;
  companyAddress?: string | null;
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

  // Build list of applicable process sides from the equipment config
  const activeSides: Array<{ label: string; key: string }> = [
    { label: 'SHELL', key: 'shell' },
    ...(hasTube   ? [{ label: 'TUBE',   key: 'tube'   }] : []),
    ...(hasJacket ? [{ label: 'JACKET', key: 'jacket' }] : []),
  ];
  const npSideCols = activeSides.length;           // 1, 2, or 3
  // NP_COLS: label(1) + side columns + unit(1), minimum 4 (so weight EMPTY/OPERATING fit in B,C)
  const NP_COLS = Math.max(4, 1 + npSideCols + 1);
  const NP_UNIT = NP_COLS; // unit is always the last column

  // Column widths: label A=35, side cols scaled, unit col=12
  const sideW = npSideCols === 3 ? 20 : 25;
  ws4.getColumn(1).width = 35;
  ws4.getColumn(2).width = sideW;
  ws4.getColumn(3).width = sideW;
  ws4.getColumn(4).width = NP_COLS === 5 ? sideW : 12; // jacket or unit
  if (NP_COLS === 5) ws4.getColumn(5).width = 12;

  const currentYear = new Date().getFullYear().toString();

  // Parse "330 / 460 / 1200" → [0]=empty, [1]=operating; discard hydro [2]
  const weightRaw   = gen.weightEmptyOperatingHydro || '';
  const weightParts = weightRaw.split('/').map((s: string) => s.trim());
  const weightEmpty     = weightParts[0] || null;
  const weightOperating = weightParts[1] || null;

  // ── Sheet-4 helpers ──────────────────────────────────────────────────────────

  // Full-width merged row: label LEFT in A, value CENTER merged B..NP_COLS
  function npMergedRow(r: number, lbl: string, val: string | null, rowH = 20) {
    labelCell(ws4, r, 1, lbl);
    const vc = ws4.getRow(r).getCell(2);
    vc.value = val ?? '';
    vc.font  = NORMAL_FONT;
    vc.border = THIN_BORDER;
    vc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws4.mergeCells(r, 2, r, NP_COLS);
    ws4.getRow(r).height = rowH;
  }

  // Data table row: label LEFT in A, per-side values CENTER, unit RIGHT in NP_UNIT
  // Shell-only: shell value merged across B..(NP_UNIT-1) so EMPTY/OPERATING still fit in weight rows
  function npDataRow(r: number, lbl: string, vals: Record<string, string | null>, unit: string) {
    labelCell(ws4, r, 1, lbl);
    if (npSideCols === 1) {
      dataCell(ws4, r, 2, vals['shell']);
      ws4.mergeCells(r, 2, r, NP_UNIT - 1);
    } else {
      for (let i = 0; i < activeSides.length; i++) {
        dataCell(ws4, r, 2 + i, vals[activeSides[i].key] ?? null);
      }
    }
    const uc = ws4.getRow(r).getCell(NP_UNIT);
    uc.value = unit; uc.font = BOLD_FONT; uc.border = THIN_BORDER;
    uc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws4.getRow(r).height = 18;
  }

  let r4 = 1;

  // ── Logo + company header area ───────────────────────────────────────────────
  if (input.logoBuffer) {
    const ext = (input.logoBuffer[0] === 0x89 && input.logoBuffer[1] === 0x50) ? 'png' : 'jpeg';
    const imgId = wb.addImage({ buffer: input.logoBuffer, extension: ext });
    // Logo in col A (0-indexed col 0), anchored rows 1-3
    ws4.addImage(imgId, { tl: { col: 0, row: 0 }, br: { col: 1, row: 3 }, editAs: 'oneCell' });

    // Row 1: "NAMEPLATE DATA" title in cols B..NP_COLS (logo covers col A)
    ws4.getRow(r4).height = 48;
    { const c = ws4.getRow(r4).getCell(1); c.value = ''; c.border = THIN_BORDER; }
    { const c = ws4.getRow(r4).getCell(2); c.value = 'NAMEPLATE DATA';
      c.font = { bold: true, size: 14, color: { argb: 'FF1F3864' } };
      c.border = THIN_BORDER; c.alignment = { horizontal: 'center', vertical: 'middle' };
      ws4.mergeCells(r4, 2, r4, NP_COLS); }

    // Row 2: company legal name
    r4++;
    ws4.getRow(r4).height = 28;
    { const c = ws4.getRow(r4).getCell(1); c.value = ''; c.border = THIN_BORDER; }
    { const c = ws4.getRow(r4).getCell(2);
      c.value = input.companyName || 'THERMOPAC PROCESS ENGINEERING LLP.';
      c.font  = { bold: true, size: 10, color: { argb: 'FF1F3864' } };
      c.border = THIN_BORDER;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      ws4.mergeCells(r4, 2, r4, NP_COLS); }

    // Row 3: registered office address
    r4++;
    ws4.getRow(r4).height = 32;
    { const c = ws4.getRow(r4).getCell(1); c.value = ''; c.border = THIN_BORDER; }
    { const c = ws4.getRow(r4).getCell(2);
      c.value = input.companyAddress || '405, L4 THE SUMMIT BUSINESS BAY, WESTERN EXPRESS HIGHWAY, VILE PARLE (E), MUMBAI 400057, INDIA';
      c.font  = NORMAL_FONT; c.border = THIN_BORDER;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      ws4.mergeCells(r4, 2, r4, NP_COLS); }
    r4++;
  } else {
    // No logo: full-width title, then manufacturer + address rows
    ws4.getRow(r4).height = 26;
    { const c = ws4.getRow(r4).getCell(1); c.value = 'NAMEPLATE DATA';
      c.font = { bold: true, size: 13, color: { argb: 'FF1F3864' } };
      ws4.mergeCells(r4, 1, r4, NP_COLS);
      c.alignment = { horizontal: 'center', vertical: 'middle' }; }
    r4++;
    npMergedRow(r4, 'MANUFACTURER', input.companyName || 'THERMOPAC PROCESS ENGINEERING LLP.', 22); r4++;
    npMergedRow(r4, '', input.companyAddress || '405, L4 THE SUMMIT BUSINESS BAY, WESTERN EXPRESS HIGHWAY, VILE PARLE (E), MUMBAI 400057, INDIA', 32); r4++;
  }

  // ── Equipment identification rows ────────────────────────────────────────────
  npMergedRow(r4, 'EQUIPMENT NAME', sheet.equipment_description ?? null, 32); r4++;
  npMergedRow(r4, 'DESIGN CODE',    sheet.design_code ?? null, 20);            r4++;
  npMergedRow(r4, 'INSPECTED BY',   sheet.inspection_by ?? null, 20);          r4++;

  // ── Column sub-headers — only applicable sides shown ─────────────────────────
  labelCell(ws4, r4, 1, '');
  if (npSideCols === 1) {
    // Shell-only: merge SHELL header across B..(unit-1)
    headerCell(ws4, r4, 2, 'SHELL');
    ws4.mergeCells(r4, 2, r4, NP_UNIT - 1);
  } else {
    for (let i = 0; i < activeSides.length; i++) {
      headerCell(ws4, r4, 2 + i, activeSides[i].label);
    }
  }
  headerCell(ws4, r4, NP_UNIT, 'UNIT');
  ws4.getRow(r4).height = 18;
  r4++;

  // ── Pressure / temperature / volume / contents table ────────────────────────
  const npRow = (lbl: string, key: string, unit: string) => {
    const vals: Record<string, string | null> = {};
    for (const s of activeSides) vals[s.key] = (mech as any)[s.key]?.[key] ?? null;
    npDataRow(r4, lbl, vals, unit);
    r4++;
  };
  npRow('INTERNAL DESIGN PRESS./MAWP (Ps)', 'internalDesignPressureMawp', 'bar g');
  npRow('EXTERNAL DESIGN PRESS./MAWP (Ps)', 'externalDesignPressureMawp', 'bar g');
  npRow('DESIGN TEMPERATURE (MIN/MAX) (Ts)', 'designTempMinMax',           '°C');
  npRow('HYDROTEST PRESSURE (Pt)',           'hydroTestPressure',           'bar g');
  npRow('CAPACITY (VOLUME)',                 'grossVolumeLiters',           'LTRS');
  npRow('CONTENTS',                         'serviceFluid',                '—');

  // ── Single-value rows below the table ───────────────────────────────────────
  npMergedRow(r4, 'YEAR OF MANUFACTURE', currentYear); r4++;
  npMergedRow(r4, 'TAG NUMBER',          sheet.tag_no ?? null); r4++;
  npMergedRow(r4, 'HYDROTEST DATE',      null); r4++;

  // ── Weight section: EMPTY and OPERATING always in B/C; unit spans to NP_COLS ─
  labelCell(ws4, r4, 1, '');
  headerCell(ws4, r4, 2, 'EMPTY');
  headerCell(ws4, r4, 3, 'OPERATING');
  headerCell(ws4, r4, 4, 'kgs.');
  if (NP_COLS > 4) ws4.mergeCells(r4, 4, r4, NP_COLS);
  ws4.getRow(r4).height = 18;
  r4++;

  labelCell(ws4, r4, 1, 'WEIGHT');
  dataCell(ws4, r4, 2, weightEmpty);
  dataCell(ws4, r4, 3, weightOperating);
  { const u = ws4.getRow(r4).getCell(4);
    u.value = 'kgs.'; u.font = BOLD_FONT; u.border = THIN_BORDER;
    u.alignment = { horizontal: 'center', vertical: 'middle' };
    if (NP_COLS > 4) ws4.mergeCells(r4, 4, r4, NP_COLS); }
  ws4.getRow(r4).height = 18;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

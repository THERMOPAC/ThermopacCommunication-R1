import type { MechanicalColumn, MechanicalData, GeneralData, ColumnHazardData } from '@shared/schema';

type SheetRow = {
  design_code: string;
  material_code: string | null;
  equipment_description: string | null;
  tag_no: string | null;
  equipment_type: string | null;
  manufacture_serial_no: string | null;
  inspection_by: string;
  equipment_config: string;
  mechanical_data: MechanicalData;
  general_data: GeneralData;
  hazard_data: ColumnHazardData | null;
  drawing_number?: string;
  revision?: string;
};

const MECH_PARAM_LABELS: { key: keyof MechanicalColumn; label: string; group: string }[] = [
  { key: 'internalDesignPressureMawp', label: 'INTERNAL DESIGN PRESSURE / MAWP (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'externalDesignPressureMawp', label: 'EXTERNAL DESIGN PRESSURE / MAWP (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'workingPressure', label: 'WORKING PRESSURE (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'hydroTestPressure', label: 'HYDRO TEST PRESSURE (Barg)', group: 'PRESSURE (Barg)' },
  { key: 'mdmt', label: 'MDMT (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'hydroTestTempMinMax', label: 'HYDRO TEST (MIN / MAX) (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'operatingTempMinMax', label: 'OPERATING (MIN / MAX) (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'designTempMinMax', label: 'DESIGN (MIN / MAX) (DEG. C)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'physicalState', label: 'PHYSICAL STATE', group: '' },
  { key: 'grossVolumeLiters', label: 'GROSS VOLUME (LITERS)', group: '' },
  { key: 'serviceFluid', label: 'SERVICE FLUID', group: '' },
  { key: 'hazardLevel', label: 'HAZARD LEVEL', group: '' },
  { key: 'specificGravity', label: 'SPECIFIC GRAVITY (LIQUID / GAS)', group: '' },
  { key: 'internalCorrosionAllowanceMm', label: 'INTERNAL CORROSION ALLOWANCE (SHELL / DISH / NOZZLE) MM', group: '' },
  { key: 'externalCorrosionAllowanceMm', label: 'EXTERNAL CORROSION ALLOWANCE (SHELL / DISH) MM', group: '' },
  { key: 'radiography', label: 'RADIOGRAPHY (FULL / SPOT)', group: '' },
  { key: 'jointEfficiency', label: 'JOINT EFFICIENCY (HEAD / SHELL L SEAM / HEAD TO SHELL)', group: '' },
  { key: 'testingGroup', label: 'TESTING GROUP', group: '' },
  { key: 'fabricationToleranceClass', label: 'FABRICATION TOLERANCE QUALITY CLASS', group: '' },
  { key: 'postWeldHeatTreatment', label: 'POST WELD HEAT TREATMENT', group: '' },
  { key: 'typeOfHeads', label: 'TYPE OF HEADS', group: '' },
  { key: 'insulation', label: 'INSULATION', group: '' },
  { key: 'insulationTypeThkDensity', label: 'INSULATION (TYPE / THK / DENSITY (KG/M3))', group: '' },
];

const GENERAL_PARAM_LABELS: { key: keyof GeneralData; label: string }[] = [
  { key: 'hydroTestPosition', label: 'HYDRO TEST POSITION' },
  { key: 'vesselOrientation', label: 'VESSEL ORIENTATION (HOR / VER)' },
  { key: 'designServiceLife', label: 'DESIGN SERVICE LIFE' },
  { key: 'windData', label: 'WIND DATA' },
  { key: 'windDesignVelocity', label: 'WIND DESIGN VELOCITY' },
  { key: 'seismicDesignCode', label: 'SEISMIC DESIGN CODE' },
  { key: 'hazardFactorZ', label: 'HAZARD FACTOR Z' },
  { key: 'seismicCoefficientHorizontal', label: 'SEISMIC COEFFICIENT HORIZONTAL WSD' },
  { key: 'seismicCoefficientVertical', label: 'SEISMIC COEFFICIENT VERTICAL WSD' },
  { key: 'weightEmptyOperatingHydro', label: 'WEIGHT (EMPTY / OPERATING / HYDRO TEST) KGS' },
  { key: 'location', label: 'LOCATION' },
  { key: 'qty', label: 'QTY' },
];

function getColumnConfig(config: string): { hasShell: boolean; hasTube: boolean; hasJacket: boolean } {
  return {
    hasShell: true,
    hasTube: config === 'Heat Exchanger' || config === 'Jacketed Vessel and Heat Exchanger',
    hasJacket: config === 'Jacketed Vessel' || config === 'Jacketed Vessel and Heat Exchanger',
  };
}

function getColumnHeaders(config: string): string[] {
  const { hasTube, hasJacket } = getColumnConfig(config);
  const headers = ['SHELL'];
  if (hasTube) headers.push('TUBE');
  if (hasJacket) headers.push('JACKET');
  return headers;
}

const EQUIPMENT_CONFIG_TO_TYPE: Record<string, string> = {
  'Vessel': 'PRESSURE VESSEL',
  'Jacketed Vessel': 'JACKETED PRESSURE VESSEL',
  'Heat Exchanger': 'SHELL & TUBE HEAT EXCHANGER',
  'Jacketed Vessel and Heat Exchanger': 'JACKETED SHELL & TUBE HEAT EXCHANGER',
};

function esc(str: string | null | undefined): string {
  if (str == null) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateDdsHtml(sheet: SheetRow, meta?: { drawingNumber?: string; revisionCode?: string; generatedAt?: string }): string {
  const { hasShell, hasTube, hasJacket } = getColumnConfig(sheet.equipment_config);
  const colHeaders = getColumnHeaders(sheet.equipment_config);
  const mechData = sheet.mechanical_data as MechanicalData;
  const genData = sheet.general_data as GeneralData;

  const colData: (MechanicalColumn | null)[] = [
    hasShell ? mechData.shell : null,
    hasTube ? (mechData.tube ?? null) : null,
    hasJacket ? (mechData.jacket ?? null) : null,
  ].filter(Boolean) as MechanicalColumn[];

  const totalCols = colHeaders.length;

  let lastGroup = '';

  const mechRows = MECH_PARAM_LABELS.map((p) => {
    const isGroupRow = p.group && p.group !== lastGroup;
    const groupCell = isGroupRow ? `<td class="group" rowspan="1">${esc(p.group)}</td>` : `<td class="group"></td>`;
    if (isGroupRow) lastGroup = p.group;

    const valueCells = colData.map((col) => {
      const val = col ? (col[p.key] ?? 'N.A.') : 'N.A.';
      return `<td class="value">${esc(String(val))}</td>`;
    }).join('');

    return `<tr>
      ${groupCell}
      <td class="param">${esc(p.label)}</td>
      ${valueCells}
    </tr>`;
  }).join('\n');

  const genRows = GENERAL_PARAM_LABELS.map((p) => {
    const val = genData[p.key];
    return `<tr>
      <td class="gen-label">${esc(p.label)}</td>
      <td class="gen-value" colspan="${totalCols}">${esc(val != null ? String(val) : null)}</td>
    </tr>`;
  }).join('\n');

  const colHeaderCells = colHeaders.map((h) => `<th class="col-header">${esc(h)}</th>`).join('');

  const generatedAt = meta?.generatedAt ?? new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    color: #111;
    padding: 12px;
    background: #fff;
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #9ca3af;
  }
  .company { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; }
  .doc-meta { font-size: 9px; color: #6b7280; text-align: right; line-height: 1.6; }
  .container { border: 1px solid #9ca3af; }
  .section-title {
    text-align: center;
    font-weight: 700;
    font-size: 12px;
    padding: 6px 4px;
    border-bottom: 1px solid #9ca3af;
    background: #f3f4f6;
    letter-spacing: 0.05em;
  }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  td, th { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  .header-label {
    border-right: 1px solid #d1d5db;
    background: #f9fafb;
    font-weight: 600;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    width: 11rem;
    white-space: nowrap;
  }
  .header-value { font-size: 10px; }
  .mech-section { border-top: 2px solid #9ca3af; }
  .group {
    border-right: 1px solid #d1d5db;
    background: #f9fafb;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    width: 6.5rem;
    vertical-align: top;
    padding-top: 4px;
    white-space: nowrap;
  }
  .param {
    border-right: 1px solid #d1d5db;
    font-size: 8.5px;
    text-transform: uppercase;
    white-space: normal;
    word-break: break-word;
    max-width: 220px;
  }
  .value { text-align: center; font-size: 10px; border-right: 1px solid #d1d5db; }
  .col-header {
    background: #f3f4f6;
    font-size: 8.5px;
    font-weight: 700;
    text-align: center;
    border-right: 1px solid #d1d5db;
    border-bottom: 1px solid #9ca3af;
    padding: 4px 6px;
  }
  .mech-head-group {
    background: #f3f4f6;
    font-size: 8.5px;
    font-weight: 700;
    border-right: 1px solid #d1d5db;
    border-bottom: 1px solid #9ca3af;
    padding: 4px 6px;
  }
  .mech-head-param {
    background: #f3f4f6;
    font-size: 8.5px;
    font-weight: 700;
    border-right: 1px solid #d1d5db;
    border-bottom: 1px solid #9ca3af;
    padding: 4px 6px;
  }
  .gen-section { border-top: 2px solid #9ca3af; }
  .gen-label {
    border-right: 1px solid #d1d5db;
    background: #f9fafb;
    font-weight: 600;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    width: 16rem;
  }
  .gen-value { font-size: 10px; }
  .footer {
    margin-top: 8px;
    font-size: 8px;
    color: #9ca3af;
    text-align: right;
  }
</style>
</head>
<body>

<div class="page-header">
  <div>
    <div class="company">THERMOPAC ENGINEERING</div>
  </div>
  <div class="doc-meta">
    ${meta?.drawingNumber ? `Drawing No: <strong>${esc(meta.drawingNumber)}</strong><br>` : ''}
    ${meta?.revisionCode ? `Rev: <strong>${esc(meta.revisionCode)}</strong><br>` : ''}
    Generated: ${esc(generatedAt)}
  </div>
</div>

<div class="container">
  <div class="section-title">4.1 DESIGN DATA</div>

  <table>
    <tbody>
      <tr>
        <td class="header-label">DESIGN CODE</td>
        <td class="header-value">${esc(sheet.design_code)}</td>
      </tr>
      <tr>
        <td class="header-label">MATERIAL CODE</td>
        <td class="header-value">${esc(sheet.material_code)}</td>
      </tr>
      <tr>
        <td class="header-label">EQUIPMENT</td>
        <td class="header-value">${esc(sheet.equipment_description)}</td>
      </tr>
      <tr>
        <td class="header-label">TAG NO</td>
        <td class="header-value">${esc(sheet.tag_no)}</td>
      </tr>
      <tr>
        <td class="header-label">TYPE</td>
        <td class="header-value">${esc(EQUIPMENT_CONFIG_TO_TYPE[sheet.equipment_config] ?? sheet.equipment_type)}</td>
      </tr>
      <tr>
        <td class="header-label">MANUFACTURE SERIAL NO</td>
        <td class="header-value">${esc(sheet.manufacture_serial_no)}</td>
      </tr>
      <tr>
        <td class="header-label">INSPECTION BY</td>
        <td class="header-value">${esc(sheet.inspection_by)}</td>
      </tr>
    </tbody>
  </table>

  <div class="mech-section">
    <table>
      <thead>
        <tr>
          <th class="mech-head-group">GROUP</th>
          <th class="mech-head-param">PARAMETER</th>
          ${colHeaderCells}
        </tr>
      </thead>
      <tbody>
        ${mechRows}
      </tbody>
    </table>
  </div>

  <div class="gen-section">
    <table>
      <tbody>
        ${genRows}
      </tbody>
    </table>
  </div>
</div>

<div class="footer">THERMOPAC ERP — Design Data Sheet — Auto-generated — Not for manual editing</div>

</body>
</html>`;
}

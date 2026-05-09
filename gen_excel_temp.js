const ExcelJS = require('exceljs');
const fs = require('fs');

const rows = JSON.parse(fs.readFileSync('/tmp/uor_plc_data.json', 'utf8'));

// Group by parent
const parents = new Map();
rows.forEach(r => {
  if (!parents.has(r.parent_code)) {
    parents.set(r.parent_code, {
      parent_code: r.parent_code,
      parent_desc: r.parent_desc,
      parent_price: parseFloat(r.parent_price),
      currency: r.currency,
      children: []
    });
  }
  parents.get(r.parent_code).children.push({
    child_code: r.child_code,
    child_desc: r.child_desc,
    quantity: parseFloat(r.quantity) || 1,
    child_price: parseFloat(r.child_price)
  });
});

const wb = new ExcelJS.Workbook();
wb.creator = 'THERMOPAC QMS';
wb.created = new Date();

const DARK_BLUE  = '1F3864';
const MID_BLUE   = '2E75B6';
const LIGHT_BLUE = 'D6E4F0';
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Calibri' };
const BODY_FONT   = { size: 10, name: 'Calibri' };
const MATCH_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
const MISS_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const LIGHT_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
const DARK_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + DARK_BLUE } };
const usdFmt      = '"USD "#,##0.00';

const border = {
  top:    { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left:   { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right:  { style: 'thin', color: { argb: 'FFBFBFBF' } }
};

function applyBorder(cell) { cell.border = border; }

// ══════════════════════════════════════════════════════════
// SHEET 1 — PACKAGE DETAIL
// ══════════════════════════════════════════════════════════
const detail = wb.addWorksheet('Package Detail', { views: [{ state: 'frozen', ySplit: 3 }] });
detail.columns = [
  { key: 'a', width: 26 }, // Parent Code
  { key: 'b', width: 50 }, // Parent Desc
  { key: 'c', width: 20 }, // Parent Price
  { key: 'd', width: 26 }, // Child Code
  { key: 'e', width: 50 }, // Child Desc
  { key: 'f', width:  9 }, // Child Qty
  { key: 'g', width: 20 }, // Child Unit Price
  { key: 'h', width: 22 }, // Child Extended Total
  { key: 'i', width: 22 }, // Total Child Sum
  { key: 'j', width: 20 }, // Difference
  { key: 'k', width: 14 }, // Status
];

// Title row
detail.mergeCells('A1:K1');
Object.assign(detail.getCell('A1'), {
  value: 'THERMOPAC — UOR-PLC Package Price Review',
  font:  { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF' + DARK_BLUE } },
  alignment: { horizontal: 'center', vertical: 'middle' }
});
detail.getRow(1).height = 28;

detail.mergeCells('A2:K2');
Object.assign(detail.getCell('A2'), {
  value: 'Generated: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST   |   All prices in USD',
  font:  { italic: true, size: 9, name: 'Calibri', color: { argb: 'FF595959' } },
  alignment: { horizontal: 'center' }
});
detail.getRow(2).height = 16;

// Header row
const HDRS = [
  'Parent Product Code','Parent Description','Parent Unit Price (USD)',
  'Child Product Code','Child Description','Child Qty',
  'Child Unit Price (USD)','Child Extended Total (USD)',
  'Total Child Sum (USD)','Difference (USD)','Status'
];
const hdr = detail.getRow(3);
HDRS.forEach((h, i) => {
  const c = hdr.getCell(i + 1);
  c.value = h;
  c.font  = HEADER_FONT;
  c.fill  = DARK_FILL;
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  applyBorder(c);
});
hdr.height = 30;

let dr = 4;
const summaryData = [];

parents.forEach(pkg => {
  const startRow = dr;
  const nc = pkg.children.length;

  pkg.children.forEach((ch, idx) => {
    const row   = detail.getRow(dr);
    const first = idx === 0;
    const last  = idx === nc - 1;

    // A: Parent Code
    const a = row.getCell(1);
    if (first) { a.value = pkg.parent_code; a.font = { ...BODY_FONT, bold: true }; }
    a.fill = LIGHT_FILL; applyBorder(a); a.alignment = { vertical: 'top', wrapText: true };

    // B: Parent Desc
    const b = row.getCell(2);
    if (first) { b.value = pkg.parent_desc; }
    b.font = BODY_FONT; b.fill = LIGHT_FILL; applyBorder(b); b.alignment = { vertical: 'top', wrapText: true };

    // C: Parent Price
    const c = row.getCell(3);
    if (first) { c.value = pkg.parent_price; c.numFmt = usdFmt; c.font = { ...BODY_FONT, bold: true }; }
    c.fill = LIGHT_FILL; applyBorder(c); c.alignment = { horizontal: 'right', vertical: 'top' };

    // D: Child Code
    row.getCell(4).value = ch.child_code;
    row.getCell(4).font  = BODY_FONT;
    applyBorder(row.getCell(4));
    row.getCell(4).alignment = { vertical: 'top' };

    // E: Child Desc
    row.getCell(5).value = ch.child_desc;
    row.getCell(5).font  = BODY_FONT;
    applyBorder(row.getCell(5));
    row.getCell(5).alignment = { vertical: 'top', wrapText: true };

    // F: Qty
    row.getCell(6).value = ch.quantity;
    row.getCell(6).font  = BODY_FONT;
    applyBorder(row.getCell(6));
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'top' };

    // G: Child Unit Price
    row.getCell(7).value  = ch.child_price;
    row.getCell(7).numFmt = usdFmt;
    row.getCell(7).font   = BODY_FONT;
    applyBorder(row.getCell(7));
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'top' };

    // H: Extended Total = F * G
    row.getCell(8).value  = { formula: `F${dr}*G${dr}` };
    row.getCell(8).numFmt = usdFmt;
    row.getCell(8).font   = BODY_FONT;
    applyBorder(row.getCell(8));
    row.getCell(8).alignment = { horizontal: 'right', vertical: 'top' };

    if (last) {
      const diff = pkg.parent_price - pkg.children.reduce((s, c2) => s + c2.child_price * c2.quantity, 0);
      const statusFill = Math.abs(diff) < 0.01 ? MATCH_FILL : MISS_FILL;

      // I: Total Child Sum
      row.getCell(9).value  = { formula: `SUM(H${startRow}:H${dr})` };
      row.getCell(9).numFmt = usdFmt;
      row.getCell(9).font   = { ...BODY_FONT, bold: true };
      row.getCell(9).fill   = statusFill;
      applyBorder(row.getCell(9));
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'top' };

      // J: Difference
      row.getCell(10).value  = { formula: `C${startRow}-I${dr}` };
      row.getCell(10).numFmt = usdFmt;
      row.getCell(10).font   = { ...BODY_FONT, bold: true };
      row.getCell(10).fill   = statusFill;
      applyBorder(row.getCell(10));
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'top' };

      // K: Status
      row.getCell(11).value = { formula: `IF(ABS(J${dr})<0.01,"MATCH","MISMATCH")` };
      row.getCell(11).font  = { ...BODY_FONT, bold: true };
      row.getCell(11).fill  = statusFill;
      applyBorder(row.getCell(11));
      row.getCell(11).alignment = { horizontal: 'center', vertical: 'top' };

      summaryData.push({ pkg, diff, startRow, lastRow: dr, nc });
    } else {
      [9, 10, 11].forEach(col => { applyBorder(row.getCell(col)); });
    }

    row.height = 18;
    dr++;
  });

  // Merge parent columns
  if (nc > 1) {
    detail.mergeCells(`A${startRow}:A${dr - 1}`);
    detail.mergeCells(`B${startRow}:B${dr - 1}`);
    detail.mergeCells(`C${startRow}:C${dr - 1}`);
  }

  // Spacer row between packages
  const sep = detail.getRow(dr);
  for (let col = 1; col <= 11; col++) {
    sep.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    applyBorder(sep.getCell(col));
  }
  sep.height = 5;
  dr++;
});

detail.autoFilter = { from: 'A3', to: 'K3' };
detail.views[0].showGridLines = false;

// ══════════════════════════════════════════════════════════
// SHEET 2 — SUMMARY
// ══════════════════════════════════════════════════════════
const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] });
sum.columns = [
  { key: 'a', width: 28 },
  { key: 'b', width: 12 },
  { key: 'c', width: 24 },
  { key: 'd', width: 24 },
  { key: 'e', width: 22 },
  { key: 'f', width: 14 },
];

sum.mergeCells('A1:F1');
Object.assign(sum.getCell('A1'), {
  value: 'THERMOPAC — UOR-PLC Package Price Review — Summary',
  font:  { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF' + DARK_BLUE } },
  alignment: { horizontal: 'center', vertical: 'middle' }
});
sum.getRow(1).height = 28;

sum.mergeCells('A2:F2');
Object.assign(sum.getCell('A2'), {
  value: 'Generated: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST   |   All prices in USD',
  font:  { italic: true, size: 9, name: 'Calibri', color: { argb: 'FF595959' } },
  alignment: { horizontal: 'center' }
});
sum.getRow(2).height = 16;

const SHDRS = ['Parent Product Code','Child Items','Parent Unit Price (USD)','Total Child Sum (USD)','Difference (USD)','Status'];
const sHdr = sum.getRow(3);
SHDRS.forEach((h, i) => {
  const c = sHdr.getCell(i + 1);
  c.value = h; c.font = HEADER_FONT; c.fill = DARK_FILL;
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  applyBorder(c);
});
sHdr.height = 30;

let sr = 4, matchCount = 0, missCount = 0;
summaryData.forEach(({ pkg, diff, nc }) => {
  const row = sum.getRow(sr);
  const isMatch = Math.abs(diff) < 0.01;
  if (isMatch) matchCount++; else missCount++;
  const fill = isMatch ? MATCH_FILL : MISS_FILL;
  const childSum = pkg.children.reduce((s, c2) => s + c2.child_price * c2.quantity, 0);

  const vals = [
    pkg.parent_code,
    pkg.children.length,
    pkg.parent_price,
    parseFloat(childSum.toFixed(2)),
    parseFloat(diff.toFixed(2)),
    isMatch ? 'MATCH' : 'MISMATCH'
  ];
  const fmts = [null, null, usdFmt, usdFmt, usdFmt, null];
  const aligns = ['left','center','right','right','right','center'];

  vals.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    c.fill  = fill;
    c.font  = i === 0 ? { ...BODY_FONT, bold: true } : { ...BODY_FONT, bold: i === 5 };
    if (fmts[i]) c.numFmt = fmts[i];
    c.alignment = { horizontal: aligns[i], vertical: 'middle' };
    applyBorder(c);
  });
  row.height = 18;
  sr++;
});

// Totals
const tot = sum.getRow(sr + 1);
const totVals = [
  `TOTAL — ${summaryData.length} packages`,
  summaryData.reduce((s, r) => s + r.pkg.children.length, 0),
  { formula: `SUM(C4:C${sr - 1})` },
  { formula: `SUM(D4:D${sr - 1})` },
  { formula: `SUM(E4:E${sr - 1})` },
  `${matchCount} match / ${missCount} mismatch`
];
totVals.forEach((v, i) => {
  const c = tot.getCell(i + 1);
  c.value = v; c.fill = DARK_FILL;
  c.font  = { ...HEADER_FONT };
  if ([2,3,4].includes(i)) c.numFmt = usdFmt;
  c.alignment = { horizontal: i === 0 ? 'left' : i === 1 ? 'center' : i === 5 ? 'center' : 'right', vertical: 'middle' };
  applyBorder(c);
});
tot.height = 22;

sum.autoFilter = { from: 'A3', to: 'F3' };
sum.views[0].showGridLines = false;

// Write file
const outPath = './UOR-PLC-Price-Review.xlsx';
wb.xlsx.writeFile(outPath).then(() => {
  const { size } = require('fs').statSync(outPath);
  console.log('OK — ' + outPath + ' — ' + (size / 1024).toFixed(1) + ' KB');
}).catch(e => { console.error('ERROR:', e.message); process.exit(1); });

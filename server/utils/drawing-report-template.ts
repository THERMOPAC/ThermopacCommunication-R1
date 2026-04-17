// ─────────────────────────────────────────────────────────────────────────────
// Drawing Verification Report — HTML template
// Matches reference PDF format: Header + 20-section checklist table
// Columns: No | Task | Result | Severity | Expected | Actual | Evidence
// ─────────────────────────────────────────────────────────────────────────────

import type { RuleResult, RuleStatus, RuleSeverity } from './drawing-rule-engine';
import type { DrawingExtraction } from './drawing-ai-extractor';
import type { EpcDrawingVerification } from '@shared/schema';

function statusBadge(status: RuleStatus): string {
  const map: Record<RuleStatus, { bg: string; text: string; label: string }> = {
    pass:    { bg: '#e8f5e9', text: '#2e7d32', label: 'PASS' },
    fail:    { bg: '#ffebee', text: '#c62828', label: 'FAIL' },
    warn:    { bg: '#fff8e1', text: '#f57f17', label: 'WARN' },
    skipped: { bg: '#f5f5f5', text: '#757575', label: 'SKIPPED' },
  };
  const s = map[status] ?? map.warn;
  return `<span style="background:${s.bg};color:${s.text};padding:2px 7px;border-radius:3px;font-weight:700;font-size:10px;letter-spacing:.5px;white-space:nowrap">${s.label}</span>`;
}

function severityBadge(severity: RuleSeverity, status: RuleStatus): string {
  if (status === 'pass' || status === 'skipped') return '<span style="color:#bdbdbd">—</span>';
  if (!severity) return '<span style="color:#bdbdbd">—</span>';
  const map: Record<string, { bg: string; text: string }> = {
    critical: { bg: '#c62828', text: '#fff' },
    high:     { bg: '#e65100', text: '#fff' },
    medium:   { bg: '#f9a825', text: '#333' },
    low:      { bg: '#1565c0', text: '#fff' },
  };
  const s = map[severity] ?? { bg: '#9e9e9e', text: '#fff' };
  return `<span style="background:${s.bg};color:${s.text};padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">${severity.toUpperCase()}</span>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return '<span style="color:#bdbdbd">—</span>';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sectionBanner(n: number, label: string, layer: 1 | 2): string {
  const bg = layer === 1 ? '#1a237e' : '#37474f';
  const prefix = layer === 1 ? 'LAYER 1' : 'LAYER 2';
  return `
  <tr>
    <td colspan="7" style="background:${bg};color:#fff;padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:.5px">
      ${prefix} — SECTION ${n}: ${label}
    </td>
  </tr>`;
}

function groupBySection(results: RuleResult[]): Map<number, RuleResult[]> {
  const map = new Map<number, RuleResult[]>();
  for (const r of results) {
    const list = map.get(r.checklistSection) ?? [];
    list.push(r);
    map.set(r.checklistSection, list);
  }
  return map;
}

const SECTION_LABELS: Record<number, string> = {
  1:  'Document Control & Identity',
  2:  'Title Block Completeness',
  3:  'Dimension & Geometry Checks',
  4:  'Pressure System Checks',
  5:  'Temperature Checks',
  6:  'Material & Code Compliance',
  7:  'Hazard & Safety Classification',
  8:  'Mechanical Design Checks',
  9:  'Welding & NDT Checks',
  10: 'Nozzle & Connection Checks',
  11: 'Insulation & Thermal Checks',
  12: 'Process Data Checks',
  13: 'Structural & Load Checks',
  14: 'Environmental & Site Data',
  15: 'BOM Checks',
  16: 'Drawing Quality & Format',
  17: 'Revision Control',
  18: 'Inter-Document Consistency',
  19: 'Code-Specific Checks',
  20: 'Advanced Checks',
};

function counterCell(count: number, color: string): string {
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:12px;font-weight:700;font-size:13px">${count}</span>`;
}

export function generateVerificationReport(
  verification: EpcDrawingVerification,
  extraction: DrawingExtraction,
  layer1: RuleResult[],
  layer2: RuleResult[],
): string {
  const all = [...layer1, ...layer2];
  const pass    = all.filter(r => r.status === 'pass').length;
  const fail    = all.filter(r => r.status === 'fail').length;
  const warn    = all.filter(r => r.status === 'warn').length;
  const skipped = all.filter(r => r.status === 'skipped').length;
  const total   = all.length;

  const overallPass = fail === 0;

  const statusBanner = overallPass
    ? `<div style="background:#e8f5e9;border:2px solid #2e7d32;border-radius:6px;padding:16px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px">
         <span style="font-size:28px">✅</span>
         <div>
           <div style="font-size:18px;font-weight:800;color:#1b5e20">VERIFICATION PASSED</div>
           <div style="font-size:12px;color:#2e7d32;margin-top:2px">No critical failures. Drawing may proceed to upload.</div>
         </div>
       </div>`
    : `<div style="background:#ffebee;border:2px solid #c62828;border-radius:6px;padding:16px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px">
         <span style="font-size:28px">🚫</span>
         <div>
           <div style="font-size:18px;font-weight:800;color:#b71c1c">VERIFICATION FAILED — UPLOAD BLOCKED</div>
           <div style="font-size:12px;color:#c62828;margin-top:2px">Drawing upload is blocked until all failures are resolved.</div>
         </div>
       </div>`;

  // Build rows for layer 1
  const l1Sections = groupBySection(layer1);
  const l2Sections = groupBySection(layer2);

  let l1Rows = '';
  for (const [secNum, items] of Array.from(l1Sections.entries()).sort((a, b) => a[0] - b[0])) {
    l1Rows += sectionBanner(secNum, SECTION_LABELS[secNum] ?? `Section ${secNum}`, 1);
    for (const r of items) {
      const rowBg = r.status === 'fail' ? '#fff8f8' : r.status === 'warn' ? '#fffde7' : '';
      l1Rows += `
      <tr style="background:${rowBg}">
        <td style="padding:6px 10px;font-size:10px;color:#78909c;white-space:nowrap">${esc(r.checklistItem)}</td>
        <td style="padding:6px 10px;font-size:11px">${esc(r.task)}</td>
        <td style="padding:6px 10px;text-align:center">${statusBadge(r.status)}</td>
        <td style="padding:6px 10px;text-align:center">${severityBadge(r.severity, r.status)}</td>
        <td style="padding:6px 10px;font-size:11px;color:#455a64">${esc(r.expected)}</td>
        <td style="padding:6px 10px;font-size:11px;color:#37474f">${esc(r.actual)}</td>
        <td style="padding:6px 10px;font-size:10px;color:#607d8b">${esc(r.evidence)}</td>
      </tr>`;
    }
  }

  let l2Rows = '';
  for (const [secNum, items] of Array.from(l2Sections.entries()).sort((a, b) => a[0] - b[0])) {
    l2Rows += sectionBanner(secNum, SECTION_LABELS[secNum] ?? `Section ${secNum}`, 2);
    for (const r of items) {
      const rowBg = r.status === 'fail' ? '#fff8f8' : r.status === 'warn' ? '#fffde7' : '';
      l2Rows += `
      <tr style="background:${rowBg}">
        <td style="padding:6px 10px;font-size:10px;color:#78909c;white-space:nowrap">${esc(r.checklistItem)}</td>
        <td style="padding:6px 10px;font-size:11px">${esc(r.task)}</td>
        <td style="padding:6px 10px;text-align:center">${statusBadge(r.status)}</td>
        <td style="padding:6px 10px;text-align:center">${severityBadge(r.severity, r.status)}</td>
        <td style="padding:6px 10px;font-size:11px;color:#455a64">${esc(r.expected)}</td>
        <td style="padding:6px 10px;font-size:11px;color:#37474f">${esc(r.actual)}</td>
        <td style="padding:6px 10px;font-size:10px;color:#607d8b">${esc(r.evidence)}</td>
      </tr>`;
    }
  }

  const reportDate = new Date(verification.attemptedAt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Drawing Verification Report — ${esc(verification.pdfFilename)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; color: #263238; }
  .container { max-width: 1100px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.12); overflow: hidden; }
  .header { background: linear-gradient(135deg, #1a237e 0%, #283593 100%); color: #fff; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .3px; }
  .header .sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 16px 24px; background: #f8f9fb; border-bottom: 1px solid #e0e0e0; }
  .meta-item { }
  .meta-item .key { font-size: 10px; color: #78909c; text-transform: uppercase; letter-spacing: .5px; }
  .meta-item .val { font-size: 13px; font-weight: 600; color: #37474f; margin-top: 2px; }
  .counters { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; border-bottom: 1px solid #e0e0e0; }
  .counter-cell { padding: 14px; text-align: center; border-right: 1px solid #e0e0e0; }
  .counter-cell:last-child { border-right: none; }
  .counter-cell .num { font-size: 28px; font-weight: 800; }
  .counter-cell .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #78909c; margin-top: 2px; }
  .body { padding: 20px 24px; }
  table.checklist { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.checklist th { background: #eceff1; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #546e7a; border-bottom: 2px solid #cfd8dc; }
  table.checklist td { border-bottom: 1px solid #eceff1; vertical-align: top; }
  table.checklist tr:hover td { background: #f5f7fa !important; }
  .extraction-box { background: #f8f9fb; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px 20px; margin-bottom: 20px; }
  .extraction-box h3 { margin: 0 0 12px; font-size: 13px; color: #37474f; }
  .extraction-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .extraction-field { font-size: 11px; }
  .extraction-field .k { color: #78909c; }
  .extraction-field .v { font-weight: 600; color: #263238; }
  .conf-pill { display: inline-block; padding: 1px 5px; border-radius: 8px; font-size: 9px; font-weight: 700; margin-left: 4px; }
  .conf-h { background: #e8f5e9; color: #2e7d32; }
  .conf-m { background: #fff8e1; color: #f57f17; }
  .conf-l { background: #ffebee; color: #c62828; }
  .footer { background: #eceff1; padding: 12px 24px; font-size: 10px; color: #90a4ae; border-top: 1px solid #cfd8dc; }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
    <div>
      <h1>THERMOPAC — Drawing Verification Report</h1>
      <div class="sub">Automated Drawing Verification System (DVS) — Inline Gate</div>
    </div>
    <a href="/api/epc-drawing-verifications/${verification.id}/report.pdf"
       style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.35);border-radius:5px;padding:7px 14px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;margin-top:2px"
       download="drawing-verification-report-${verification.id}.pdf">
      ⬇ Download PDF
    </a>
  </div>

  <!-- Metadata -->
  <div class="meta-grid">
    <div class="meta-item"><div class="key">File</div><div class="val">${esc(verification.pdfFilename)}</div></div>
    <div class="meta-item"><div class="key">Equipment Config</div><div class="val">${esc(verification.equipmentConfig ?? '—')}</div></div>
    <div class="meta-item"><div class="key">Extraction Engine</div><div class="val">${esc(verification.extractionEngine)}</div></div>
    <div class="meta-item"><div class="key">Report Generated</div><div class="val">${reportDate}</div></div>
    <div class="meta-item"><div class="key">Attempted By</div><div class="val">${esc(verification.attemptedBy)}</div></div>
    <div class="meta-item"><div class="key">Drawing No (extracted)</div><div class="val">${esc(extraction.drawingNumber.value ?? '—')}</div></div>
    <div class="meta-item"><div class="key">Tag (extracted)</div><div class="val">${esc(extraction.tagNumber.value ?? '—')}</div></div>
    <div class="meta-item"><div class="key">Verification ID</div><div class="val">#${verification.id}</div></div>
  </div>

  <!-- Counters -->
  <div class="counters">
    <div class="counter-cell">
      <div class="num" style="color:${overallPass ? '#2e7d32' : '#c62828'}">${overallPass ? '✅ PASS' : '🚫 FAIL'}</div>
      <div class="lbl">Overall</div>
    </div>
    <div class="counter-cell">
      <div class="num" style="color:#2e7d32">${pass}</div>
      <div class="lbl">Passed</div>
    </div>
    <div class="counter-cell">
      <div class="num" style="color:#c62828">${fail}</div>
      <div class="lbl">Failed</div>
    </div>
    <div class="counter-cell">
      <div class="num" style="color:#f57f17">${warn}</div>
      <div class="lbl">Warnings</div>
    </div>
    <div class="counter-cell">
      <div class="num" style="color:#757575">${skipped}</div>
      <div class="lbl">Skipped</div>
    </div>
  </div>

  <div class="body">

    ${statusBanner}

    <!-- Extracted Data Summary -->
    <div class="extraction-box">
      <h3>Extracted Drawing Data Summary</h3>
      <div class="extraction-grid">
        ${[
          ['Drawing No', extraction.drawingNumber],
          ['Revision', extraction.revision],
          ['Title', extraction.title],
          ['Tag Number', extraction.tagNumber],
          ['Project Code', extraction.projectCode],
          ['Design Code', extraction.designCode],
          ['Client', extraction.clientName],
          ['Date', extraction.date],
          ['Sheet', extraction.sheetNumber],
        ].map(([label, field]: [string, any]) => {
          const val = field?.value ?? '—';
          const conf = typeof field?.confidence === 'number' ? field.confidence : 0;
          const confClass = conf >= 0.8 ? 'conf-h' : conf >= 0.5 ? 'conf-m' : 'conf-l';
          const confLabel = conf >= 0.8 ? 'HIGH' : conf >= 0.5 ? 'MED' : 'LOW';
          return `<div class="extraction-field"><span class="k">${label}:</span> <span class="v">${esc(val)}</span><span class="conf-pill ${confClass}">${confLabel}</span></div>`;
        }).join('')}
      </div>
    </div>

    <!-- Layer 1 — DDS vs Drawing -->
    <h2 style="font-size:14px;color:#1a237e;border-bottom:2px solid #1a237e;padding-bottom:6px;margin-bottom:12px">
      LAYER 1 — DDS vs Drawing Validation (PRIMARY)
    </h2>
    <table class="checklist">
      <thead>
        <tr>
          <th style="width:70px">No</th>
          <th>Task</th>
          <th style="width:90px;text-align:center">Result</th>
          <th style="width:90px;text-align:center">Severity</th>
          <th style="width:160px">Expected (DDS)</th>
          <th style="width:160px">Actual (Drawing)</th>
          <th>Evidence</th>
        </tr>
      </thead>
      <tbody>
        ${l1Rows}
      </tbody>
    </table>

    <div style="height:24px"></div>

    <!-- Layer 2 — 20-Checklist -->
    <h2 style="font-size:14px;color:#37474f;border-bottom:2px solid #37474f;padding-bottom:6px;margin-bottom:12px">
      LAYER 2 — 20-Section Drawing Checklist
    </h2>
    <table class="checklist">
      <thead>
        <tr>
          <th style="width:70px">No</th>
          <th>Task</th>
          <th style="width:90px;text-align:center">Result</th>
          <th style="width:90px;text-align:center">Severity</th>
          <th style="width:160px">Expected</th>
          <th style="width:160px">Actual</th>
          <th>Evidence</th>
        </tr>
      </thead>
      <tbody>
        ${l2Rows}
      </tbody>
    </table>

  </div>

  <!-- Footer -->
  <div class="footer">
    THERMOPAC ERP — Drawing Verification System v1.0 &nbsp;|&nbsp;
    Report ID: DVR-${verification.id} &nbsp;|&nbsp;
    Generated: ${new Date().toISOString()} &nbsp;|&nbsp;
    This report is an automated pre-upload gate result. It does not replace engineering review.
  </div>

</div>
</body>
</html>`;
}

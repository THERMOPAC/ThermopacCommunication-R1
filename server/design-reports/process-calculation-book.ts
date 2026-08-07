/**
 * Process Calculation Book (PCB) — payload builder.
 *
 * The complete calculation workings for the revision, compiled by COMPOSING
 * the frozen payloads of the individual calculation reports (DBR, PDR, HDR,
 * ECPR, ECRR) plus the mechanical design workings — each part reproduces the
 * corresponding builder's sections verbatim, so the book can never diverge
 * from the standalone reports. Parts whose prerequisite calculations have not
 * been run are recorded as blocking missing-data items, never silently
 * skipped. Never re-runs engines, never invents values.
 */
import { pool } from '../db';
import type { ReportPayload, ReportSection } from './report-framework';
import { buildDesignBasisPayload } from './design-basis-report';
import { buildProcessDesignPayload } from './process-design-report';
import { buildHydraulicDesignPayload } from './hydraulic-design-report';
import { buildEcpCalculationPayload, buildEcrCalculationPayload } from './ecp-ecr-calculation-reports';
import { buildMechanicalDatasheetPayload } from './mechanical-datasheet-report';

const PARTS: Array<{ part: string; title: string; builder: (revisionId: number, generatedByName: string) => Promise<{ payload: ReportPayload; blocking: number }>; required: boolean }> = [
  { part: 'Part 1', title: 'Design Basis (DBR content)', builder: buildDesignBasisPayload, required: true },
  { part: 'Part 2', title: 'Process Design — C2 Material & Solvent Balance (PDR content)', builder: buildProcessDesignPayload, required: true },
  { part: 'Part 3', title: 'Generic Hydraulic Screening — C3 (HDR content)', builder: buildHydraulicDesignPayload, required: true },
  { part: 'Part 4', title: 'Packed Column Calculation — C4 ECP (ECPR content)', builder: buildEcpCalculationPayload, required: false },
  { part: 'Part 5', title: 'Agitated Column Calculation — C5 ECR (ECRR content)', builder: buildEcrCalculationPayload, required: false },
  { part: 'Part 6', title: 'Mechanical Design Workings (MDS content)', builder: buildMechanicalDatasheetPayload, required: true },
];

export async function buildProcessCalculationBookPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  const diQ = await pool.query(`SELECT data FROM design_software_inputs WHERE revision_id = $1 AND section = 'design_identity'`, [revisionId]);
  const di: Record<string, string> = diQ.rows.reduce((a: any, r: any) => ({ ...a, ...r.data }), {});

  // The technology selected by the active DS-SEL record makes that part REQUIRED —
  // the calculation book cannot leave draft without the governing sizing calculation.
  const dselQ = await pool.query(
    `SELECT record FROM design_selection_records
      WHERE revision_id = $1 AND is_superseded = FALSE
      ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const selectedTech = String(dselQ.rows[0]?.record?.selectedTechnology ?? dselQ.rows[0]?.record?.selected_technology ?? '').toLowerCase();
  const requiredOverride: Record<string, boolean> = {};
  if (selectedTech.includes('ecp') || selectedTech.includes('packed')) requiredOverride['Part 4'] = true;
  if (selectedTech.includes('ecr') || selectedTech.includes('agitated') || selectedTech.includes('rdc')) requiredOverride['Part 5'] = true;

  const sections: ReportSection[] = [];
  const assumptions: NonNullable<ReportPayload['assumptions']> = [];
  const missing: NonNullable<ReportPayload['missingData']> = [];
  const references = new Set<string>();
  const runs: NonNullable<ReportPayload['traceability']>['runs'] = [];
  const contents: string[][] = [['Part', 'Content', 'Status']];
  const seenAssumptions = new Set<string>();

  for (const p of PARTS) {
    try {
      const { payload } = await p.builder(revisionId, generatedByName);
      contents.push([p.part, p.title, `Included (${payload.docNumber} content, ${payload.sections.length} section(s))`]);
      sections.push({ title: `${p.part} — ${p.title}`, paragraphs: [`Compiled verbatim from the ${payload.docTypeTitle} payload builder (${payload.docNumber}). Traceability: ${payload.traceability?.note ?? '—'}`] });
      for (const sec of payload.sections) sections.push({ ...sec, title: `${p.part} · ${sec.title}` });
      for (const a of payload.assumptions ?? []) {
        const key = `${a.item}|${a.sourceRef}`;
        if (!seenAssumptions.has(key)) { seenAssumptions.add(key); assumptions.push(a); }
      }
      for (const m of payload.missingData ?? []) missing.push({ ...m, item: `${p.part}: ${m.item}` });
      for (const r of payload.references ?? []) references.add(r);
      for (const r of payload.traceability?.runs ?? []) runs.push(r);
    } catch (e: any) {
      const reason = e?.message ?? String(e);
      contents.push([p.part, p.title, `NOT AVAILABLE — ${reason}`]);
      missing.push({
        item: `${p.part}: ${p.title}`,
        reason: `This part could not be compiled: ${reason}`,
        severity: (requiredOverride[p.part] ?? p.required) ? 'error' : 'warning',
      });
    }
  }

  sections.unshift({
    title: 'Table of Contents',
    intro: 'The calculation book compiles the frozen payloads of the individual calculation reports verbatim — it can never diverge from the standalone documents. Parts not available are declared, never silently skipped.',
    table: contents,
  });

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'PCB',
    docTypeTitle: 'Process Calculation Book',
    docNumber: `${rev.design_number}-PCB`,
    reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number,
    designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction',
    revisionLabel: `Rev ${rev.revision_number}`,
    revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    generatedByName,
    traceability: {
      revisionId,
      runs,
      note: 'Compiled from the frozen result snapshots via the individual report payload builders — never re-runs engines.',
    },
    sections,
    assumptions,
    missingData: missing,
    references: Array.from(references),
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY — NOT FOR CONSTRUCTION',
  };
  return { payload, blocking: missing.filter(m => m.severity === 'error').length };
}

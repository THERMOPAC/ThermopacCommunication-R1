import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import type { Stage5Geometry } from '../../shared/ecr-stage5-geometry';

const views = ['ga', 'section', 'compartment', 'rotor', 'stator'] as const;
/** Consume only the verified immutable revision; never rebuild geometry on export. */
export async function createStage5Pdf(record: {
  id: string; revision: number; createdAt: string | Date; sourceHash: string;
  currentness: string; status: string; notes: string; geometry: Stage5Geometry;
  drawings: Record<string, string>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 30, autoFirstPage: false,
      info: { Title: `Stage 5 preliminary drawing package — revision ${record.revision}`, Subject: record.sourceHash } });
    const chunks: Buffer[] = [];
    doc.registerFont('Stage5Drawing', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
    doc.font('Stage5Drawing');
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.on('pageAdded', () => {
      doc.fontSize(7).text(`STAGE 5 | Revision ${record.revision} | ${record.currentness} | ${record.status}`, 30, 15);
      doc.text(`${record.geometry.watermark} | Source ${record.sourceHash}`, 30, 27);
      doc.fontSize(9);
      doc.y = 48;
    });
    const text = (value: unknown) => {
      if (doc.y > doc.page.height - 65) { doc.addPage(); doc.fontSize(9); }
      doc.text(String(value), { width: doc.page.width - 60 }).moveDown(0.35);
    };
    const section = (title: string) => { doc.addPage(); doc.fontSize(16); text(title); doc.fontSize(9); };
    try {
      for (const view of views) {
        if (!record.drawings[view]) throw new Error('STAGE5_FROZEN_DRAWING_MISSING');
        doc.addPage();
        doc.fontSize(9).text(`Revision ${record.revision} | ${record.currentness} | ${record.status} | ${new Date(record.createdAt).toISOString()}`);
        // Preserve the complete SVG viewport and title block. Never crop a
        // dimensioned sheet or replace its viewBox during PDF conversion.
        // svg-to-pdfkit does not implement CSS paint-order. A white text
        // halo would paint over the dimension glyphs; remove only that halo
        // in PDF presentation, retaining all text, geometry and coordinates.
        const pdfSvg = record.drawings[view].replace(/\.dimension-label\s*\{[^}]*\}/g,
          '.dimension-label{stroke:none;fill:#172a3b}');
        SVGtoPDF(doc, pdfSvg, 30, 65, {
          width: doc.page.width - 60, height: doc.page.height - 105,
          preserveAspectRatio: 'xMidYMid meet',
          fontCallback: () => 'Stage5Drawing',
        });
        doc.fontSize(7).text(`Source SHA-256: ${record.sourceHash}`, 30, doc.page.height - 25, { lineBreak: false });
      }
      section('Geometry summary — frozen revision dimensions');
      text(record.geometry.watermark);
      text(record.geometry.engineeringBoundary);
      for (const p of record.geometry.parameters) text(`${p.label}: ${p.value ?? 'TBD'} ${p.unit} | ${p.classification} | ${p.note}`);
      section('Compartment and internals schedules');
      for (const c of record.geometry.compartments)
        text(`Compartment ${c.index}: bottom ${c.bottomM ?? 'TBD'} m; top ${c.topM ?? 'TBD'} m; rotor ${c.rotorM ?? 'TBD'} m; stator ${c.statorM ?? 'TBD'} m`);
      for (const i of record.geometry.internals)
        text(`${i.id} | ${i.type} | count ${i.count ?? 'TBD'} | diameter ${i.diameterM ?? 'TBD'} m | thickness ${i.thicknessM ?? 'TBD'} m | elevations ${i.elevationsM.map(v => v ?? 'TBD').join(', ')} m`);
      section('Preliminary nozzle / connection schedule');
      if (!record.geometry.nozzles.length) text('No process connections defined — TBD.');
      for (const n of record.geometry.nozzles)
        text(`${n.id} | ${n.service} | ${n.region} | elevation ${n.elevationM ?? 'TBD'} m | bore ${n.boreM ?? 'TBD'} m | azimuth ${n.azimuthDeg ?? (n.axis === 'down' ? 'N/A axial' : 'TBD')} deg | ${n.classification} | ${n.note}${n.axis ? ` | axis ${n.axis}; OD ${n.outsideDiameterM} m; projection ${n.projectionM} m; radial offset ${n.radialOffsetM} m` : ''}`);
      section('Validation, assumptions and unresolved items');
      for (const check of record.geometry.checks) text(`${check.status.toUpperCase()}: ${check.message}`);
      for (const assumption of record.geometry.assumptions) text(`ASSUMPTION: ${assumption}`);
      for (const tbd of record.geometry.tbd) text(`TBD: ${tbd}`);
      for (const excluded of record.geometry.engineeringExclusions ?? []) text(`OUTSIDE ENGINEERING SCOPE: ${excluded}`);
      text(`Engineering notes: ${record.geometry.inputs.notes || 'None entered'}`);
      text(`Revision notes: ${record.notes || 'None entered'}`);
      text(`Stage 3 result: ${record.geometry.basis.stage3ResultId}; Stage 4 result: ${record.geometry.basis.stage4ResultId}`);
      text(`Source SHA-256: ${record.sourceHash}`);
      text('PRELIMINARY — NOT FOR FABRICATION. Mechanical verification, pressure-vessel design, shaft strength/deflection/critical speed, bearing/seal selection, drive adequacy and structural supports are outside this package.');
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
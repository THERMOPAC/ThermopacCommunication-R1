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
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, autoFirstPage: false,
      info: { Title: `Stage 5 preliminary drawing package — revision ${record.revision}`, Subject: record.sourceHash } });
    const chunks: Buffer[] = [];
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
        // The shared SVG includes a long register below y=610. Crop only its
        // viewport, not its geometry; the same frozen register is paginated below.
        const drawingSheet = record.drawings[view].replace(/<svg\b[^>]*>/,
          '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="590" viewBox="0 0 1100 590" overflow="hidden">');
        const drawingHeight = 790 * 590 / 1100;
        doc.save().rect(25, 60, 790, drawingHeight).clip();
        SVGtoPDF(doc, drawingSheet, 25, 60, { width: 790, height: drawingHeight, preserveAspectRatio: 'xMidYMid meet' });
        doc.restore();
        doc.fontSize(7).text(`Source SHA-256: ${record.sourceHash}`, 30, 548, { lineBreak: false });
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
import PDFDocument from 'pdfkit';
import type { Stage5Geometry, Stage5Parameter } from '../../shared/ecr-stage5-geometry';

type SavedRecord = {
  id: string; revision: number; createdAt: string | Date; sourceHash: string;
  currentness: string; geometry: Stage5Geometry; geometryHash?: string;
  ruleset?: string; rulesManifestHash?: string; rulesManifest?: unknown;
  sourceStage3?: unknown; sourceStage4?: unknown; notes?: string;
};
const absent = 'Not specified in saved revision — outside this document’s authority';
const number = (n: number) => Number.isFinite(n) ? Number(n.toFixed(6)).toString() : absent;
const mm = (n: number | null | undefined) => typeof n === 'number' ? number(n * 1000) : absent;
const xyz = (v: number[]) => v.map(mm).join(', ');
const label = (key: string) => key.replace(/M2$/, ' area').replace(/M$/, '').replace(/Deg$/, ' angle')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const printable = (v: unknown): string => v == null ? absent : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** Presentation only: every numerical value comes from the verified saved dataset. */
export async function createStage5DesignDataPdf(record: SavedRecord, designId: number | string): Promise<Buffer> {
  const g = record.geometry;
    if (!g.r1Model || !g.ruleset) throw new Error('STAGE5_DESIGN_DATA_REQUIRES_SAVED_R1_GEOMETRY');
  const model = g.r1Model;
    const approved = model.approvedComponent;
    const preliminary = g.ruleset?.includes('R5_CURRENT_BASIS') === true;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, autoFirstPage: false,
      info: { Title: `Engineering Calculation & Audit Archive — Design ${designId}, revision ${record.revision}`,
        Subject: `Saved R1 geometry ${record.geometryHash ?? record.sourceHash}` } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('Data', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
    doc.font('Data');
    const width = 515, left = 40, bottom = 770;
    let y = 65;
    const page = () => {
      doc.addPage(); y = 65;
      doc.fontSize(8).fillColor('#334155').text(`CALCULATION & AUDIT ARCHIVE | Design ${designId} | Revision ${record.revision}`, left, 25, { width });
      doc.fontSize(7).text('HISTORICAL SAVED DATA — NOT CURRENT END DESIGN AUTHORITY — NOT FOR FABRICATION', left, 40, { width });
    };
    const paragraph = (text: string, size = 9): void => {
      doc.fontSize(size);
      const h = doc.heightOfString(text, { width });
      if (h > bottom - 65) {
        // Long saved revision notes must not trigger PDFKit's implicit pages
        // (which would omit this report's running header).
        let rest = text;
        while (rest.length) {
          let cut = Math.min(900, rest.length);
          if (cut < rest.length) {
            const space = rest.lastIndexOf(' ', cut);
            if (space > 0) cut = space;
          }
          paragraph(rest.slice(0, cut), size);
          rest = rest.slice(cut).trimStart();
        }
        return;
      }
      if (y + h > bottom) page();
      doc.fillColor('#172a3b').text(text, left, y, { width });
      y += h + 9;
    };
    const section = (title: string, intro?: string) => {
      page(); doc.outline.addItem(title); paragraph(title, 15); if (intro) paragraph(intro);
    };
    const table = (headers: string[], rows: unknown[][], fractions?: number[]) => {
      const widths = (fractions ?? headers.map(() => 1 / headers.length)).map(f => f * width);
      const row = (values: unknown[], header = false) => {
        const strings = values.map(printable);
        doc.fontSize(header ? 8 : 8);
        const h = Math.max(18, ...strings.map((s, i) => doc.heightOfString(s, { width: widths[i] - 10 }) + 10));
        if (y + h > bottom) { page(); row(headers, true); }
        let x = left;
        for (let i = 0; i < strings.length; i++) {
          doc.rect(x, y, widths[i], h).fillAndStroke(header ? '#e2e8f0' : '#ffffff', '#cbd5e1');
          doc.fillColor('#172a3b').text(strings[i], x + 5, y + 5, { width: widths[i] - 10 });
          x += widths[i];
        }
        y += h;
      };
      row(headers, true); rows.forEach(r => row(r)); y += 12;
    };
    const parameterRow = (p: Stage5Parameter) => [
      label(p.key), typeof p.value === 'number' && p.unit === 'm' ? mm(p.value)
        : typeof p.value === 'number' && p.unit === 'm²' ? number(p.value * 1e6) : typeof p.value === 'number' ? number(p.value) : printable(p.value),
      p.unit === 'm' ? 'mm' : p.unit === 'm²' ? 'mm²' : p.unit || '—',
      `${p.evidenceClass ? `Class ${p.evidenceClass}; ` : ''}${p.classification}\n${p.note.replace(`${g.ruleset}; `, '')}`,
    ];
    const selected = new Set<string>();
    const group = (title: string, regex: RegExp, intro?: string) => {
      section(title, intro);
      const values = g.parameters.filter(p => regex.test(p.key) && (!selected.has(p.key) || title === 'Critical clearances'));
      values.forEach(p => selected.add(p.key));
      table(['Design feature', 'Saved value', 'Unit', 'Provenance / governing rule'], values.map(parameterRow), [.25, .18, .08, .49]);
    };
    try {
      section('Design Data for CAD model and drawing preparation',
        `Human-readable handoff of the saved ${preliminary ? 'preliminary current-basis adapted component' : approved ? 'approved-component' : 'R1'} geometry. Use the dimensions and coordinate schedules, not scaled illustrations. This report does not regenerate, resize or qualify the equipment.`);
      table(['Document authority', 'Saved record'], [
        ['Design / revision / record', `${designId} / ${record.revision} / ${record.id}`],
        ['Saved on', new Date(record.createdAt).toISOString()],
        ['Currentness', record.currentness],
        ['Geometry status', g.complete ? g.completionStatement ?? 'Geometrically complete' : 'INCOMPLETE — unresolved checks must be reviewed'],
        ['Geometry ruleset', g.ruleset], ['Source Stage 3 ID', g.basis.stage3ResultId],
        ['Source Stage 4 ID', g.basis.stage4ResultId], ['Combined source SHA-256', record.sourceHash],
        ['Geometry SHA-256', record.geometryHash ?? absent], ['Rules manifest SHA-256', record.rulesManifestHash ?? absent],
      ], [.32, .68]);
      paragraph('A = frozen upstream authority; B = documented reference feature; C = approved R1 engineering envelope. A calculated Class-C value remains Class C. Geometry completeness does not establish hydraulic, structural or fabrication adequacy.');
      paragraph(record.notes || 'No additional revision notes recorded.');
      section('Coordinate and datum convention',
        'Right-handed Cartesian coordinates. Origin (0,0,0) is the bottom vessel pole on the shaft/column axis. +Z is vertically upward; X/Y are the horizontal plane. Azimuth 0° is +X, 90° is +Y, increasing counter-clockwise when viewed from above (+Z toward origin).');
      paragraph('All length tables and XYZ coordinates below are millimetres; angular values are degrees. The immutable source stores SI metres. Negative Z values belong to the skirt below the bottom vessel pole. Radial shell connections point outward; “up” and “down” connections have vertical axes. Connection centre denotes saved vessel-surface intersection, and end denotes saved external stub termination, not a flange face.');
      paragraph('Numeric presentation is rounded to at most six decimal places, without modifying source values or adding manufacturing tolerances. Symbols in the provenance rules refer to SI source quantities: D = column ID, DR = rotor swept diameter, hc = compartment pitch, ds = shaft diameter, do = opening diameter, ts = stator thickness, HR = rotor axial envelope, dh = hub diameter, tb = blade thickness, Lb = blade radial length, HA = installed active height. Do not mix mm table values with SI rule quantities.');
      paragraph('Rotor vertex XYZ values are local to the rotor centre plane (Z=0) on the shared shaft axis. Translate local Z by the rotor elevation in the complete schedule; do not apply additional clocking. Support footprints are global XY; combine them with the saved arm bottom/top Z values. Head profiles are internal envelopes, not material outer surfaces.');
      group('Design basis and source provenance', /^(column|rotorDiameter|compartment|installed|require|required|designNt|hets|selectedRpm|rpm|phase|stage[34]|sources)/);
      group('Vessel, head and active/end-zone geometry', /^(vessel|overall|head|topHead|bottomHead|active|topTangent|bottomDisengagement|topDisengagement)/);
      table(['Head', 'Tangent Z mm', 'Pole Z mm', 'Radial semiaxis mm', 'Axial semiaxis mm'],
        model.heads.map(h => [h.end, mm(h.tangentM), mm(h.poleM), mm(h.radialSemiaxisM), mm(h.axialSemiaxisM)]));
      paragraph('Each head is the saved half-ellipsoid of revolution: r²/a² + (z − tangent Z)²/b² = 1, with semiaxes a/b listed above. Select the half between tangent and pole. This describes the internal geometric envelope only.');
      paragraph('The vessel straight internal cylinder uses the frozen column ID and extends between the bottom and top head tangent elevations. No shell outside diameter or material wall thickness is inferred. Model reserved envelopes separately from material-bearing components.');
      group(approved ? `Rotor geometry — ${preliminary ? 'preliminary adapted' : 'approved'} double-entry shrouded six-blade assembly` : 'Rotor geometry — six-blade stepped assembly', /^(blade|hub|shroud|rotorOffset|rotorAxial|rotorConstruction|rotorThickness)/,
        approved ? `${g.rotorType}. The saved solids below are the ${preliminary ? 'current-basis adaptation, not the approved D600 package' : 'exact approved preliminary component definition'}; this is not fabrication qualification.`
          : `${g.rotorType}. Actual saved stepped profiles follow; they are R1 engineering approximations, not a claim of exact vendor construction.`);
      table(['Blade number', 'Saved azimuth °'], model.bladeAzimuthsDeg.map((a, i) => [i + 1, number(a)]));
      table(['Profile vertex', 'Radial X mm', 'Local Z mm'], model.rotor.profileM.map((v, i) => [i + 1, mm(v[0]), mm(v[1])]));
      paragraph('Close the ordered polygon back to vertex 1. The following already-clocked saved 3D vertices define each blade envelope; first and second polygon loops are the opposing thickness faces. Connect corresponding loop vertices. No new blade dimensions are inferred.');
      table(['Blade / azimuth', 'Vertex', 'Local X, Y, Z mm'], model.rotor.blades.flatMap((b, i) =>
        b.verticesM.map((v, j) => [ `${i + 1} / ${number(b.azimuthDeg)}°`, j + 1, xyz(v)])), [.23, .12, .65]);
      if (approved) {
        table(['Shroud', 'Inner / outer radius mm', 'Bottom / top local Z mm'],
          approved.rotor.shrouds.map(s => [s.name, `${mm(s.innerRadiusM)} / ${mm(s.outerRadiusM)}`,
            `${mm(s.bottomM)} / ${mm(s.topM)}`]));
        paragraph(`Approved eye diameter ${mm(approved.rotor.eyeDiameterM)} mm; inner web height ${mm(approved.rotor.webHeightM)} mm; outer paddle height ${mm(approved.rotor.paddleHeightM)} mm. The upper and lower shrouds are separate annular solids.`);
      }
      group('Stator geometry and area convention', /^(stator|empirical|gross|shaftBlocked|calculatedFree|freeArea)/,
        approved ? `Physical convention: gross opening fraction = (DSO² + N dh²)/D² = ${g.basis.statorFreeAreaRatio}. The shaft-corrected value is diagnostic only and is not fed upstream.`
          : 'Approved physical convention: do = D × sqrt(phi_s). Gross opening fraction = (do/D)² = phi_s. Shaft-blocked net fraction = (do² − ds²)/D². Preserve the original empirical Stage-3 phi_s; neither physical fraction is fed back upstream.');
      if (approved) {
        table(['Row', 'PCD mm', 'Count', 'First angle °', 'Step °'],
          approved.stator.rows.map((r, i) => [i + 1, mm(r.pcdM), r.count, number(r.firstAngleDeg), number(r.stepDeg)]));
        table(['Row / hole', 'Exact X mm', 'Exact Y mm', 'Angle °'],
          approved.stator.holes.map(h => [`${h.row} / ${h.index}`, mm(h.xM), mm(h.yM), number(h.angleDeg)]),
          [.2, .27, .27, .26]);
        paragraph(`Hole diameter ${mm(approved.stator.holeDiameterM)} mm; centre opening ${mm(approved.stator.centreOpeningDiameterM)} mm; six retained ${mm(approved.stator.laneWidthM)} mm no-hole lanes. ${preliminary ? 'Component ancestry (not adapted-coordinate approval)' : 'Coordinate source'} canonical SHA-256: ${approved.manifestCanonicalSha256}.`);
      }
      group('Shaft and shaft-support geometry', /^(shaft|lowerShaft|upperShaft|supportArm|supportHousing|supportAzimuth)/);
      table(['Support', 'Centre Z mm', 'Housing OD mm', 'Housing height mm'],
        model.supports.map((s, i) => [i + 1, mm(s.elevationM), mm(s.housingDiameterM), mm(s.housingHeightM)]));
      table(['Support / arm / azimuth', 'Bottom / top Z mm', 'Ordered XY footprint mm'],
        model.supports.flatMap((s, i) => s.arms.map((a, j) =>
          [`${i + 1} / ${j + 1} / ${a.azimuthDeg}°`, `${mm(a.bottomM)} / ${mm(a.topM)}`, a.footprintM.map(xyz).join('; ')])), [.25, .2, .55]);
      group('Skirt, access opening and seal/drive reserved envelopes', /^(skirt|supportHeight|drive|seal|pedestal)/);
      table(['Saved component envelope', 'Diameter mm', 'Bottom Z mm', 'Top Z mm'],
        model.envelopes.map(e => [label(e.id), mm(e.diameterM), mm(e.bottomM), mm(e.topM)]));
      table(['Skirt access width mm', 'Height mm', 'Centre Z mm', 'Azimuth °'],
        [[mm(model.skirtAccess.widthM), mm(model.skirtAccess.heightM), mm(model.skirtAccess.elevationM), model.skirtAccess.azimuthDeg]]);
      section('Complete connection / nozzle schedule',
        'All connections are preliminary geometric allowances, not standard DN selections or hydraulically qualified piping. Stub OD/projection are saved envelopes. No flange, reinforcement, weld or pipe schedule is implied.');
      table(['Tag / service', 'Region / axis', 'Bore / OD mm', 'Projection mm', 'EL / radial offset mm', 'Azimuth °'],
        g.nozzles.map(n => [`${n.id}\n${n.service}`, `${n.region}\n${n.axis ?? absent}`,
          `${mm(n.boreM)} / ${mm(n.outsideDiameterM)}`, mm(n.projectionM),
          `${mm(n.elevationM)} / ${mm(n.radialOffsetM)}`, n.azimuthDeg == null ? 'N/A — axial' : number(n.azimuthDeg)]),
        [.25, .15, .15, .12, .21, .12]);
      table(['Tag / axis', 'Surface centre XYZ mm', 'External end XYZ mm', 'Head intersection Z min / max mm'],
        model.connections.map(c => [c.id + ' / ' + c.axis, xyz(c.centreM), xyz(c.endM),
          (() => { const n = g.nozzles.find(n => n.id === c.id); return n?.surfaceEdgeElevationMinM == null ? 'N/A — straight shell' : `${mm(n.surfaceEdgeElevationMinM)} / ${mm(n.surfaceEdgeElevationMaxM)}`; })()]),
        [.15, .29, .29, .27]);
      table(['Tag', 'Saved connection rationale'], g.nozzles.map(n => [n.id, n.note]), [.12, .88]);
      paragraph('Head penetration boundaries: every saved sample point follows in its stored order. Close each boundary loop; these samples describe the saved neck/head intersection, not a new machining allowance.', 10);
      table(['Connection', 'Boundary point', 'Global X, Y, Z mm'],
        model.connections.flatMap(c => c.surfaceBoundaryM.map((v, i) => [c.id, i + 1, xyz(v)])), [.15, .18, .67]);
      section('Component quantities and complete elevation schedules',
        'Every saved rotor, stator and compartment is listed. Stator plate thickness is centred on each boundary plane. These are not representative or truncated schedules.');
      table(['Component', 'Quantity', 'Diameter mm', 'Thickness / axial size mm'],
        g.internals.map(i => [i.type, i.count, mm(i.diameterM), i.id === 'SH' ? 'N/A — solid shaft envelope' : mm(i.thicknessM)]), [.5, .1, .2, .2]);
      table(['Other modelled components', 'Quantity / definition'], [
        ['Head envelopes', model.heads.length], ['Shaft-support assemblies', model.supports.length],
        ['Support arms', model.supports.reduce((n, s) => n + s.arms.length, 0)],
        ['Connections', model.connections.length], ['Blades per rotor', model.rotor.blades.length],
        ['Reserved component envelopes', model.envelopes.map(e => label(e.id)).join(', ')],
        ['Skirt access opening', '1'],
      ], [.5, .5]);
      table(['Compartment', 'Bottom Z mm', 'Top Z mm', 'Rotor centre Z mm', 'Saved stator Z mm'],
        g.compartments.map(c => [c.index, mm(c.bottomM), mm(c.topM), mm(c.rotorM), mm(c.statorM)]));
      for (const item of g.internals.filter(i => i.elevationsM.length)) {
        paragraph(`${item.type} — every saved elevation`, 11);
        table(['Component ID', 'Ordinal', 'Centre / boundary Z mm'],
          item.elevationsM.map((z, i) => [item.id, i + 1, mm(z)]), [.4, .15, .45]);
      }
      group('Critical clearances', /(Clearance|RadialWidth)/,
        'The saved clearances are geometric checks only; manufacturing tolerances, thermal movement and mechanical allowances are not introduced by this report.');
      section('Validation results — complete saved check register',
        `${g.checks.filter(c => c.status === 'pass').length} passed of ${g.checks.length}. Status is from this saved revision, not a rerun against current upstream results.`);
      table(['Check', 'Result', 'Validation requirement'], g.checks.map(c => [label(c.id), c.status.toUpperCase(), c.message]), [.28, .1, .62]);
      section(`${preliminary ? 'Preliminary adapted-component' : approved ? 'Approved-component' : 'R1'} rules, source hashes and retained lineage`,
        'These identifiers belong to the saved revision. Missing legacy metadata is explicitly reported, never substituted with current sources.');
      const flatten = (value: unknown, prefix = ''): unknown[][] => value && typeof value === 'object'
        ? Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix} / ${label(k)}` : label(k)))
        : [[prefix, printable(value)]];
      const lineage = (value: unknown) => {
        const rows = flatten(value).filter(r => /\b(id|hash|sha|version)\b/i.test(String(r[0])));
        return rows.length ? rows : [['Saved lineage', absent]];
      };
      table(['Stage 3 saved reference', 'Value'], lineage(record.sourceStage3), [.32, .68]);
      table(['Stage 4 saved reference', 'Value'], lineage(record.sourceStage4), [.32, .68]);
      table(['Frozen rules manifest', 'Value'], flatten(record.rulesManifest), [.32, .68]);
      section('Additional saved design selections and evidence',
        'Supplementary saved parameters not repeated in the component sections. All dimensions retain their saved meaning.');
      table(['Design feature', 'Saved value', 'Unit', 'Provenance / governing rule'],
        g.parameters.filter(p => !selected.has(p.key)).map(parameterRow), [.25, .18, .08, .49]);
      section('Limitations and CAD handoff acceptance');
      paragraph(g.engineeringBoundary);
      [...g.assumptions, ...g.engineeringExclusions].forEach(item => paragraph('• ' + item));
      paragraph(`Not specified by ${approved ? 'the approved component basis' : 'R1'} — outside scope: pressure-rated wall/head material thicknesses; materials and corrosion allowance; welding, tolerances, fits and fasteners; bearing/seal product selection; shaft strength, deflection and critical speed; drive torque/power adequacy; structural loads; nozzle flanges/reinforcement and piping qualification. Do not invent these details or issue fabrication drawings from this report.`);
      paragraph(g.tbd.length ? `UNRESOLVED SAVED ITEMS: ${g.tbd.join('; ')}` : 'No unresolved geometry items recorded in this saved revision. Explicit scope exclusions above are not fabrication-ready details.');
      paragraph('PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION', 12);
      const count = doc.bufferedPageRange().count;
      for (let i = 0; i < count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor('#475569').text(`Design ${designId} · Revision ${record.revision} · CAD Design Data · Page ${i + 1} of ${count}`, 40, 790,
          { width, lineBreak: false });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
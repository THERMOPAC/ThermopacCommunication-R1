import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import type { Stage5Geometry } from '../../shared/ecr-stage5-geometry';
import { AUTOMATIC_END_RULESET, endEngineeringRows, type Stage5EndProjection } from '../../shared/ecr-stage5-end-sections';
import { renderEndSchematic } from '../../shared/ecr-stage5-end-schematic';
import { renderStage5Svg } from '../../shared/ecr-stage5-drawings';
import { renderStage5R1Svg } from '../../shared/ecr-stage5-r1-drawings';
import { Stage5Error } from './stage5-geometry-service';

type RecordSource = {
  id: string; revision: number; createdAt: string | Date; sourceHash: string;
  currentness: string; geometry: Stage5Geometry; geometryHash?: string;
};
const n = (v: unknown, digits = 2) => typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(digits)).toString() : 'TBD';
const mm = (v: unknown) => typeof v === 'number' ? n(v * 1000, 2) : 'TBD';
const label = (key: string) => key.replace(/M2$/, ' area').replace(/M$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** Explicit allowlist: no historical end, nozzle, support or vessel elevations. */
export const ACTIVE_REPORT_KEYS = [
  'columnDiameterM', 'installedActiveHeightM', 'compartmentHeightM', 'rotorDiameterM',
  'shaftDiameterM', 'statorThicknessM', 'statorOpeningDiameterM', 'statorRadialWidthM',
  'bladeCount', 'bladeHeightM', 'bladeThicknessM', 'bladeRadialLengthM',
  'bladeInnerSegmentLengthM', 'bladeOuterSegmentLengthM', 'bladeInnerSegmentHeightM',
  'bladeOuterSegmentHeightM', 'hubDiameterM', 'hubHeightM', 'rotorOffsetM',
  'shroudInnerDiameterM', 'shroudOuterDiameterM', 'shroudThicknessM',
  'statorHoleDiameterM', 'statorLaneWidthM',
  'columnAreaM2', 'shaftAreaM2', 'statorGrossOpenAreaM2', 'statorNetOpenAreaM2',
];

export function stage5EngineeringReportContent(record: RecordSource, ends: Stage5EndProjection, designId: number | string) {
  const g = record.geometry, d = g.dimensions;
  if (record.currentness !== 'CURRENT' || !g.r1Model || String(record.id) !== String(ends.active.revisionId)
    || record.sourceHash !== ends.active.sourceHash || ends.ruleset !== AUTOMATIC_END_RULESET
    || ends.selectionAuthority !== 'SERVER_BUILTIN_PER_END_MODELS'
    || d.columnDiameterM !== ends.active.diameterM || d.installedActiveHeightM !== ends.active.installedActiveHeightM
    || g.compartments.length !== ends.active.compartmentCount)
    throw new Stage5Error('STAGE5_ENGINEERING_REPORT_CURRENT_AUTHORITY_REQUIRED', 409);
  const context = { designId, revision: record.revision, date: new Date(record.createdAt).toISOString().slice(0, 10) };
  const drawings = [
    { title: 'General arrangement — current symbolic ends', svg: renderEndSchematic(ends, 'ga') },
    { title: 'Longitudinal section — frozen active only', svg: renderStage5R1Svg(g, 'section', context, true) },
    ...(['compartment', 'rotor', 'stator'] as const).map(view => ({
      title: { compartment: 'Typical compartment — frozen detail', rotor: 'Rotor — frozen detail', stator: 'Stator — frozen detail' }[view],
      svg: renderStage5Svg(g, view, context),
    })),
  ];
  const relative = (v: number | null) => v === null || d.activeStartM == null ? 'TBD' : mm(v - d.activeStartM);
  return { drawings, activeRows: ACTIVE_REPORT_KEYS.filter(key => d[key] != null).map(key =>
    [label(key), key.endsWith('M') ? mm(d[key]) : n(d[key], 4), key.endsWith('M') ? 'mm' : key.endsWith('M2') ? 'm²' : 'count']),
  compartments: g.compartments.map(c => [String(c.index), relative(c.bottomM), relative(c.rotorM), relative(c.statorM), relative(c.topM)]) };
}

/** Compact engineering presentation. Full records remain in the separate archive.
 * No raw-source JSON, historical end dimensions or legacy connections enter this
 * report. SI source values remain unchanged; display rounding is not a tolerance. */
export async function createStage5EngineeringReportPdf(record: RecordSource, ends: Stage5EndProjection, designId: number | string): Promise<Buffer> {
  const content = stage5EngineeringReportContent(record, ends, designId);
  const g = record.geometry, b = g.basis, d = g.dimensions;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, autoFirstPage: false,
      info: { Title: `Stage 5 Engineering Report — Design ${designId}, revision ${record.revision}`,
        Subject: `Current end source ${ends.sourceHash}; frozen active source ${record.sourceHash}` } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.registerFont('Engineering', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
    let y = 70, heading = '', pageNumber = 0;
    const page = (landscape = false) => {
      doc.addPage({ size: landscape ? 'A3' : 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 40 });
      pageNumber++;
      doc.font('Engineering').fontSize(8).fillColor('#334155')
        .text(`STAGE 5 ENGINEERING REPORT | Design ${designId} | Revision ${record.revision}`, 40, 24);
      doc.fontSize(7).text('PRELIMINARY — NOT FOR FABRICATION | Active geometry frozen; independent end calculation status', 40, 40);
      doc.text(`${pageNumber}`, doc.page.width - 65, doc.page.height - 28, { lineBreak: false });
      y = 70;
    };
    const text = (s: string, size = 10) => {
      doc.fontSize(size);
      const h = doc.heightOfString(s, { width: 515 });
      if (y + h > 770) { page(); doc.fontSize(11).text(`${heading} (continued)`, 40, y); y += 28; doc.fontSize(size); }
      doc.fillColor('#172a3b').text(s, 40, y, { width: 515 }); y += h + 13;
    };
    const section = (title: string, intro?: string) => {
      heading = title; page(); doc.outline.addItem(title); text(title, 18); if (intro) text(intro);
    };
    const table = (headers: string[], rows: unknown[][], fractions?: number[]) => {
      const widths = (fractions ?? headers.map(() => 1 / headers.length)).map(f => f * 515);
      const row = (values: unknown[], header = false) => {
        doc.fontSize(9);
        const strings = values.map(v => v == null ? 'TBD' : String(v));
        const h = Math.max(25, ...strings.map((s, i) => doc.heightOfString(s, { width: widths[i] - 12 }) + 12));
        if (y + h > 760) { page(); text(`${heading} (continued)`, 12); row(headers, true); }
        let x = 40;
        strings.forEach((s, i) => {
          doc.rect(x, y, widths[i], h).fillAndStroke(header ? '#e2e8f0' : '#ffffff', '#cbd5e1');
          doc.fillColor('#172a3b').text(s, x + 6, y + 6, { width: widths[i] - 12 });
          x += widths[i];
        });
        y += h;
      };
      row(headers, true); rows.forEach(r => row(r)); y += 15;
    };
    try {
      section('Engineering review and document authority',
        'This report combines verified frozen active-section geometry with independent system-owned top/bottom end calculations. The user supplies no droplet size, terminal velocity, margin, diameter or height. Missing built-in models, process sources and property sources are separate engineering holds. This is not a fabrication release.');
      table(['Scope', 'Disposition'], [
        ['Frozen active section', `Ø${mm(ends.active.diameterM)} mm; ${ends.active.compartmentCount} compartments; active height ${mm(ends.active.installedActiveHeightM)} mm. Unchanged.`],
        ['Current ends', `TOP: ${ends.assemblies.top.overallEngineeringStatus}. BOTTOM: ${ends.assemblies.bottom.overallEngineeringStatus}. Overall mechanical elevations remain unqualified.`],
        ['Five engineering drawings', 'Current GA, active-only longitudinal section, typical compartment, rotor and stator.'],
        ['Historical end/nozzle reservations', 'Not current authority. Excluded from the current schedules and longitudinal section.'],
        ['Calculation & Audit Archive', 'Separate complete saved report: detailed source records, coordinates, validation, provenance and historical reservations.'],
      ], [.32, .68]);
      text('Tables use engineering display rounding (normally 0.01 mm); no manufacturing tolerance is implied. Drawings retain their existing saved-component precision. Page count follows meaningful content, not a target length.');

      section('Frozen active design basis');
      table(['Quantity', 'Frozen value'], [
        ['Column internal diameter', `${mm(b.columnDiameterM)} mm`], ['Compartment pitch', `${mm(b.compartmentHeightM)} mm`],
        ['Physical compartment count', n(b.compartmentCount, 0)], ['Installed active height', `${mm(b.installedActiveHeightM)} mm`],
        ['Required active height', `${mm(b.requiredActiveHeightM)} mm`], ['Rotor diameter', `${mm(b.rotorDiameterM)} mm`],
        ['Rotor / column ratio', n(b.rotorDiameterRatio, 4)], ['Stator free-area input', n(b.statorFreeAreaRatio, 4)],
        ['Selected speed', `${n(b.selectedRpm)} rpm`], ['Inherited speed bounds', `${n(b.rpmMin)} to ${n(b.rpmMax)} rpm`],
        ['Phase configuration', b.phaseConfiguration], ['Sizing method', b.sizingMethod],
        ['Design theoretical stages', n(b.designNt, 4)],
        ['Compartment efficiency (if adopted)', n(b.designCompartmentEfficiency, 4)],
      ], [.56, .44]);
      text('An equal lower/upper speed is a selected point, not an established operating window. No upstream hydraulic or stage-efficiency policy is changed by this report.');

      section('Process-flow directions and authority separation');
      table(['Basis', 'Meaning'], [
        ['Saved flow arrangement', g.inputs.flowArrangement ?? 'Not qualified in saved geometry'],
        ['Flow classification', g.inputs.flowClassification ?? 'Not specified'],
        ['Normal solvent/oil mass ratio', n(ends.feed.solventOilMassRatio, 4)],
        ['Nozzle-only solvent/oil mass ratio', '1.5 MASS; never a product redistribution or residence basis'],
        ['Normal product duty', ends.materialContract.status],
      ], [.42, .58]);
      text(g.inputs.flowArrangement === 'nmp-down-rrbo-up'
        ? 'Saved arrangement: RRBO/oil enters at the lower end and travels upward toward raffinate withdrawal; wet solvent enters at the upper end and travels downward toward extract withdrawal.'
        : g.inputs.flowArrangement === 'nmp-up-rrbo-down'
          ? 'Saved arrangement: wet solvent travels upward and RRBO/oil travels downward. Connection locations require current engineering closure.'
          : 'Process directions require confirmation; no direction is inferred from unqualified nozzle coordinates.');
      text('Direction does not qualify interface levels, connection elevations or outlet allocation. Historical connection coordinates are not substituted for current pending locations.');

      section('Active internals — dimensional schedule',
        'Explicit active-component values only. The shaft diameter is retained; full shaft length, supports, seal and drive elevations depend on unresolved current end arrangements and are not republished as current.');
      table(['Frozen parameter', 'Value', 'Unit'], content.activeRows, [.62, .23, .15]);

      section('Rotor and stator construction');
      table(['Component', 'Frozen construction'], [
        ['Rotor', g.rotorType], ['Stator', g.statorType], ['Free-area convention', g.freeAreaDefinition],
        ['Rotor hub diameter / height', `${mm(g.r1Model!.rotor.hub.diameterM)} / ${mm(g.r1Model!.rotor.hub.heightM)} mm`],
        ['Rotor swept diameter', `${mm(g.r1Model!.rotor.sweptDiameterM)} mm`],
        ['Blade azimuths', `${g.r1Model!.bladeAzimuthsDeg.map(v => n(v)).join(', ')} degrees`],
        ['Shaft diameter', `${mm(g.r1Model!.rotor.shaftDiameterM)} mm`],
      ], [.38, .62]);
      table(['Frozen active component', 'Quantity', 'Saved diameter [mm]'],
        g.internals.filter(i => i.id === 'R' || i.id === 'S').map(i =>
          [i.id === 'R' ? 'Rotor assemblies' : 'Stator plates (including active boundaries)', n(i.count, 0), mm(i.diameterM)]),
        [.56, .18, .26]);
      if (g.r1Model!.approvedComponent) {
        const a = g.r1Model!.approvedComponent;
        table(['Stator perforation ring', 'PCD [mm]', 'Hole count'], a.stator.rows.map((r, i) => [i + 1, mm(r.pcdM), r.count]));
        text(`Saved perforated stator: ${a.stator.holes.length} holes, diameter ${mm(a.stator.holeDiameterM)} mm. Exact saved hole centres remain in the detail drawing and archive; no coordinate dump is repeated here.`);
      }
      text('Component profiles and perforations are rendered through the existing frozen-detail renderer, not recreated from schematic approximations. Saved adapted/preliminary component qualifications are unchanged.');

      section('Key geometric clearances and calculation summary');
      const diff = (a: number | null | undefined, c: number | null | undefined, factor = 1) =>
        typeof a === 'number' && typeof c === 'number' ? mm((a - c) / factor) : 'TBD';
      const rotorZ = [...g.r1Model!.rotor.profileM.map(p => p[1]),
        ...g.r1Model!.rotor.oppositeProfileM.map(p => p[1]),
        -g.r1Model!.rotor.hub.heightM / 2, g.r1Model!.rotor.hub.heightM / 2,
        ...(g.r1Model!.approvedComponent?.rotor.shrouds.flatMap(s => [s.bottomM, s.topM]) ?? [])];
      const rotorEnvelope = Math.max(...rotorZ) - Math.min(...rotorZ);
      table(['Geometric diagnostic', 'Calculation', 'Result [mm]'], [
        ['Rotor tip to column wall (radial)', '(D − rotor swept diameter) / 2', diff(d.columnDiameterM, g.r1Model!.rotor.sweptDiameterM, 2)],
        ['Shaft to stator central opening (radial)', '(opening diameter − shaft diameter) / 2', diff(d.statorOpeningDiameterM, d.shaftDiameterM, 2)],
        ['Pitch less stator thickness', 'pitch − stator plate thickness', diff(d.compartmentHeightM, d.statorThicknessM)],
        ['Nominal axial half-clearance', '(pitch − stator thickness − rotor axial envelope) / 2',
          typeof d.compartmentHeightM === 'number' && typeof d.statorThicknessM === 'number' && Number.isFinite(rotorEnvelope)
            ? mm((d.compartmentHeightM - d.statorThicknessM - rotorEnvelope) / 2) : 'TBD'],
      ], [.4, .4, .2]);
      text(`These are presentation diagnostics, not allowable tolerances or dynamic shaft-clearance checks. The axial diagnostic uses the complete saved rotor axial envelope (${mm(rotorEnvelope)} mm), including hub and shrouds when present, centred in the compartment. Deflection and assembly tolerances still require mechanical assessment. Detailed component profiles govern.`);
      text(`Stack check: ${n(b.compartmentCount, 0)} × ${mm(b.compartmentHeightM)} mm = ${typeof b.compartmentCount === 'number' && typeof b.compartmentHeightM === 'number' ? mm(b.compartmentCount * b.compartmentHeightM) : 'TBD'} mm; inherited installed active height ${mm(b.installedActiveHeightM)} mm.`);

      section('Compartment elevations — relative active datum',
        'All elevations are relative to the frozen active bottom = 0 mm. A datum translation only: original internals and pitch are unchanged. No vessel-bottom, head or overall equipment datum is implied.');
      table(['Compartment', 'Bottom [mm]', 'Rotor [mm]', 'Stator [mm]', 'Top [mm]'], content.compartments);

      section('Normal process material basis');
      table(['Quantity', 'Normal basis'], [
        ['Oil volumetric feed', `${n(ends.feed.oilM3H, 4)} m³/h`], ['Oil density', `${n(ends.feed.rrboDensityKgM3)} kg/m³`],
        ['Oil mass rate', `${n(ends.feed.oilKgH)} kg/h`], ['Saved normal S/O mass ratio', n(ends.feed.solventOilMassRatio, 4)],
        ['Normal wet-solvent mass rate', `${n(ends.feed.wetSolventKgH)} kg/h`],
        ['Wet-solvent feed density', `${n(ends.feed.nmpDensityKgM3)} kg/m³`],
        ['Normal wet-solvent volume rate', `${n(ends.feed.wetSolventM3H, 4)} m³/h`],
        ['Combined normal feed', `${n(ends.materialContract.totalFeedKgH)} kg/h`],
      ], [.6, .4]);
      table(['Component', 'Normal feed [kg/h]'], ends.materialContract.componentNames.map((name, i) => [name, n(ends.materialContract.componentFeedKgH[i])]));
      text('Normal solvent mass = saved S/O × oil mass. Feed phase densities are not qualified product densities; no product allocation is inferred from these totals.');

      section('Current end-section design basis',
        ends.normalProductAuthority?.detail ?? ends.materialContract.requiredEvidence);
      text(`Additional feed-distribution necks inherit Ø${mm(ends.active.diameterM)} mm, outside frozen active height. Their lengths remain mechanically unqualified. Top and bottom models are independent; NMP active-compartment d32 is never substituted for a bottom RRBO outlet droplet basis.`);
      text('System chain: authoritative normal flow + operating product properties + governing outlet droplet model → terminal settling/rising velocity vt → defined system margin → Udesign → Dcalc → built-in upward fabrication rounding → Dshell → H10 → nozzle-dependent straight shell.');
      text('Dcalc = √[4 × (Qnormal / 3600) / (π × Udesign)], with Qnormal in m³/h and Udesign in m/s. For terminal-model branches the governed margin convention specifies Udesign = f × vt OR vt / f; neither convention nor f is assumed. Diameter is never clamped to the active ID.');
      text('If Dshell ≤ inherited active ID, HOLD / TRANSITION_RULE_REQUIRED: no expander is invented. A 30° half-angle sharp-cone reference (Dshell − Dactive)/(2 tan 30°) is explicitly nominal only; the angle convention and formed/knuckled junction require engineering qualification. Transition volume receives zero residence credit.');
      for (const end of ['top', 'bottom'] as const) {
        const assembly = ends.assemblies[end];
        section(`${end.toUpperCase()} — system calculation, status and source trace`,
          'Calculated values are system outputs from eligible built-in models and source-qualified data, not required user inputs. DESIGN_CRITERION_REQUIRED identifies a software model gap, never a missing user approval.');
        table(['Required engineering output', 'Current result / authority'], endEngineeringRows(assembly), [.37, .63]);
        if (assembly.modelAudit.length) {
          section(`${end.toUpperCase()} — built-in model applicability audit`);
          table(['Model / source', 'Eligibility and reason'], assembly.modelAudit.map(a => [
            `${a.modelId}\n${a.citation}`, `${a.eligibility}: ${a.reason}`,
          ]), [.36, .64]);
        }
      }

      section('Residence calculation and closure holds');
      text('Ten-minute hold-up: V10 = Qnormal / 6, with Qnormal in m³/h. Usable straight volume = 0.90 × (πD²/4) × H10. Therefore H10 = Qnormal / [6 × 0.90 × (πD²/4)].');
      text('Residence alone does not select diameter. The independent built-in separation model selects the minimum area; the governed fabrication rule rounds upward. No economic optimum, aspect ratio, maximum height or arbitrary candidate diameter is introduced.');
      table(['Duty', 'Qualified volume [m³/h]', 'H10 [m]'], [
        ['Top normal product', n(ends.assemblies.top.normalProductM3H, 4), n(ends.assemblies.top.residenceHeightM, 4)],
        ['Bottom normal product', n(ends.assemblies.bottom.normalProductM3H, 4), n(ends.assemblies.bottom.residenceHeightM, 4)],
      ]);
      for (const requirement of ends.pendingRequirements) text(`• ${requirement}`);
      text('Residence extends from the interface to the near product-opening edge. The post-opening extension starts at the far edge. Heads receive no residence-volume credit. Nozzle-only S/O must not enter this calculation.');
      text('Hstraight = 0.150 + H10 + eNear + eFar + Hpost; Hpost = max(0.200 m, 0.40 Dshell). Centre distance from transition = 0.150 + H10 + eNear. Near/far extents come only from a qualified actual nozzle envelope. Missing envelope does not block D or H10 but prevents exact centre and total straight-shell height. Top distances run upward; bottom distances run downward. Torispherical dish follows the post-opening extension, with zero residence credit.');

      section('Current preliminary nozzle schedule');
      const nozzleRow = (name: string, flow: ReturnType<typeof import('../../shared/ecr-stage5-end-sections').endNozzle>) => {
        const c = flow.candidates.find(c => c.dn === flow.provisionalDn);
        return [name, n(flow.nozzleBasisM3H, 4), n(flow.hydraulic120M3H, 4), c ? `DN${c.dn}` : 'No candidate passes',
          c ? n(c.boreMm, 2) : 'TBD', c ? n(c.velocity120MS, 3) : 'TBD'];
      };
      table(['Service', 'Basis m³/h', '120% m³/h', 'Screen DN', 'Bore mm', 'v120 m/s'], [
        nozzleRow('Oil feed', ends.nozzles.oilFeed), nozzleRow('Wet-solvent feed', ends.nozzles.wetSolventFeed),
        ['Raffinate outlet', 'TBD', 'TBD', 'TBD', 'TBD', 'TBD'], ['Extract outlet', 'TBD', 'TBD', 'TBD', 'TBD', 'TBD'],
      ]);
      text('Hydraulic screen assumption: maximum velocity 0.5 m/s at 120% basis flow. Exact bore = outside diameter − 2 × wall. Provisional DN is the first passing candidate in the service-returned pipe table, not a nominal-bore substitution.');
      text(`NOZZLES ONLY: solvent mass = 1.5 × ${n(ends.feed.oilKgH)} = ${n(ends.nozzleSizingBasis.wetSolventKgH)} kg/h. Solvent volume = that mass / saved wet-solvent density = ${n(ends.nozzleSizingBasis.wetSolventM3H, 4)} m³/h.`);
      text('No blanket example DN is imposed. Outlet envelopes, branch loads, pressure rating, materials, reinforcement, projection and all current nozzle positions remain pending; historical nozzle bores and positions are excluded.');

      for (const [name, flow] of [['Oil feed', ends.nozzles.oilFeed], ['Wet-solvent feed — nozzle-only S/O', ends.nozzles.wetSolventFeed]] as const) {
        section(`${name}: hydraulic pipe screen`);
        text(`Qbasis = ${n(flow.nozzleBasisM3H, 4)} m³/h. Qcheck = 1.20 Qbasis = ${n(flow.hydraulic120M3H, 4)} m³/h. Required bore = √[4 Qcheck / (3600 π × 0.5)] = ${n(flow.requiredBoreMm)} mm.`);
        table(['DN', 'OD mm', 'Wall mm', 'Bore mm', 'v120 m/s', '≤0.5'], flow.candidates.map(c =>
          [c.dn, n(c.odMm), n(c.wallMm), n(c.boreMm), n(c.velocity120MS, 3), c.passes ? 'PASS' : 'FAIL']));
        text(`Service-returned preliminary selection: ${flow.provisionalDn === null ? 'none — larger candidates require review' : `DN${flow.provisionalDn}`}.`);
        text('Velocity = (1.20 × Qbasis / 3600) / [π × (bore/1000)² / 4]. Pipe OD and wall values are screen candidates, not approved material/rating selections. This screen does not qualify any product duty or vessel opening envelope.');
      }

      section('Design validation summary and outstanding work');
      const counts = ['pass', 'fail', 'tbd'].map(status => [status.toUpperCase(), g.checks.filter(c => c.status === status).length]);
      table(['Saved validation register', 'Count'], counts);
      text('Counts describe the complete historical frozen construction register, including historical end reservations; they do not validate the current pending ends. Individual machine check rows and source calculations are retained in the Audit Archive.');
      table(['Engineering area', 'Release condition'], [
        ['Normal end-product duty', 'Designated simultaneous source-qualified raffinate/extract flow and operating-temperature density'],
        ['End geometry', 'Eligible end-specific built-in droplet/terminal/margin/fabrication models; source-qualified properties; opening envelope and mechanical transition/head closure'],
        ['Rotating assembly', 'Strength, deflection, critical speed, tolerances, bearings, seals and drive assessment'],
        ['Pressure equipment', 'Design pressure/temperature, materials, wall/head thickness and reinforcement'],
        ['Interfaces and installation', 'Loads, supports, nozzle positions, maintainability and overall elevations'],
      ], [.35, .65]);
      text('Frozen geometric completeness is not fabrication readiness, mechanical adequacy, product duty qualification or completed end sizing. No approval is inferred from a historical PASS.');

      for (const drawing of content.drawings) {
        heading = drawing.title; page(true); doc.outline.addItem(drawing.title);
        doc.fontSize(15).text(drawing.title, 40, 64);
        SVGtoPDF(doc, drawing.svg.replace(/\.dimension-label\s*\{[^}]*\}/g, '.dimension-label{stroke:none;fill:#172a3b}'),
          40, 95, { width: doc.page.width - 80, height: doc.page.height - 140,
            preserveAspectRatio: 'xMidYMid meet', fontCallback: () => 'Engineering' });
      }

      section('Compact traceability and audit handoff');
      table(['Identity', 'Verified reference'], [
        ['Design / revision', `${designId} / ${record.revision} (record ${record.id})`],
        ['Saved revision date', new Date(record.createdAt).toISOString()],
        ['Frozen active source SHA-256', record.sourceHash], ['Current end source SHA-256', ends.sourceHash],
        ['Stage 1 immutable hash', ends.stage1Hash], ['Geometry hash', record.geometryHash ?? 'Verified via saved revision integrity'],
        ['Frozen geometry ruleset', g.ruleset], ['Current end ruleset', ends.ruleset],
        ['Source status at read', record.currentness],
      ], [.35, .65]);
      text('The current report source is read in one consistent read-only transaction, with a single frozen revision hydration. A changed, stale, missing or invalid source fails closed; no historical end fallback is used.');
      text('Engineering Calculation & Audit Archive: complete saved Design Data report, including raw coordinates, full validation register, expanded Stage 3/4 reference evidence, provenance and historical end/nozzle reservations. It is independently readable from the verified frozen snapshot; it is not labelled current engineering authority.');
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
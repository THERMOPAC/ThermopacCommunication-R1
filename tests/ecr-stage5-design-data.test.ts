import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildStage5R1Geometry, R1_RULES_MANIFEST } from '../shared/ecr-stage5-r1';
import { createStage5DesignDataPdf } from '../server/ecr-pre-pilot/stage5-design-data-report';

function freeze(value: any): any {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
describe('CAD Design Data PDF from frozen R1 geometry', () => {
  it('exports all geometry, full schedules, actual vertices, validation and source lineage without mutation', async () => {
    const geometry = buildStage5R1Geometry({
      stage3ResultId: '3', stage4ResultId: '4', sourcesCurrent: true, sourcesCompatible: true,
      columnDiameterM: .6, rotorDiameterM: .3, rotorDiameterRatio: .5, compartmentHeightM: .18,
      compartmentCount: 39, requiredActiveHeightM: 7, installedActiveHeightM: 7.02,
      designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
      phaseConfiguration: 'NMP continuous / RRBO dispersed',
    });
    const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
    const record = freeze({
      id: 'fixture', revision: 3, createdAt: '2026-09-19T12:00:00Z', sourceHash: 'a'.repeat(64),
      currentness: 'VERIFICATION FIXTURE — NOT A LIVE DESIGN', geometry,
      geometryHash: hash(geometry), rulesManifestHash: hash(R1_RULES_MANIFEST), rulesManifest: R1_RULES_MANIFEST,
      sourceStage3: { id: '3', immutableHash: 'b'.repeat(64), result: { calculationHash: 'd'.repeat(64) } },
      sourceStage4: { id: '4', lineageHash: 'c'.repeat(64) },
      notes: 'VERIFICATION FIXTURE — NOT A LIVE DESIGN',
    });
    const before = JSON.stringify(record);
    const buffer = await createStage5DesignDataPdf(record, 'FIXTURE-47');
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(JSON.stringify(record)).toBe(before);
    const folder = 'deliverables/r1-design-data';
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/fixture-design-data.pdf`, buffer);
    const text = execFileSync('python3', ['-c',
      'import fitz,sys; d=fitz.open(sys.argv[1]); print("\\n".join(p.get_text() for p in d))', `${folder}/fixture-design-data.pdf`], { maxBuffer: 5e6 }).toString();
    for (const section of ['Coordinate and datum', 'Vessel, head', 'Rotor geometry', 'Stator geometry',
      'Shaft and shaft-support', 'Skirt, access', 'Complete connection', 'Component quantities', 'Critical clearances',
      'Validation results', 'R1 rules', 'Limitations and CAD']) expect(text).toContain(section);
    for (const n of geometry.nozzles) expect(text).toContain(n.id);
    for (const i of geometry.internals) for (const z of i.elevationsM)
      expect(text).toContain(Number((z! * 1000).toFixed(6)).toString());
    expect(text).toContain('379.473319');
    expect(text).toContain('NOT FOR FABRICATION');
    expect(text).toContain('Not specified by R1');
    for (const c of ['a', 'b', 'c', 'd']) expect(text.replace(/\s/g, '')).toContain(c.repeat(64));
    expect(geometry.compartments).toHaveLength(39);
    expect(geometry.internals.find(i => i.id === 'S')!.elevationsM).toHaveLength(40);
    execFileSync('python3', ['.agents/scripts/inspect-r1-design-data-pdf.py', `${folder}/fixture-design-data.pdf`], { stdio: 'pipe' });
  }, 60000);
  it('rejects legacy geometry rather than inventing a structured R1 model', async () => {
    await expect(createStage5DesignDataPdf({ geometry: {} } as any, 47)).rejects.toThrow('REQUIRES_SAVED_R1');
  });
});
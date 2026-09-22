import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStage5R1Geometry } from '../shared/ecr-stage5-r1';
import { calculateAutomaticEndSections } from '../shared/ecr-stage5-end-sections';
import { createStage5EngineeringReportPdf, stage5EngineeringReportContent } from '../server/ecr-pre-pilot/stage5-engineering-report';

const geometry = buildStage5R1Geometry({
  stage3ResultId: '3', stage4ResultId: '4', sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .7, rotorDiameterM: .35, rotorDiameterRatio: .5, compartmentHeightM: .21,
  compartmentCount: 20, requiredActiveHeightM: 4.2, installedActiveHeightM: 4.2,
  designNt: 7, hetsM: .6, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
  phaseConfiguration: 'NMP continuous / RRBO dispersed',
});
const record = { id: '8', revision: 8, createdAt: '2026-01-01', sourceHash: 'active-hash', currentness: 'CURRENT', geometry };
const ends = { ...calculateAutomaticEndSections({
  designFeedRateLph: 2500, rrboDensityKgM3: 880, nmpDensityKgM3: 1020, solventOilRatio: .6,
  oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2,
}), sourceHash: 'end-hash', stage1Hash: 'feed-hash',
active: { revisionId: '8', sourceHash: 'active-hash', diameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 } };

describe('compact current Stage 5 engineering report', () => {
  it('has five real drawings and never carries historical ends into its active-only section', () => {
    const before = JSON.stringify(geometry);
    const c = stage5EngineeringReportContent(record, ends, 269);
    expect(c.drawings).toHaveLength(5);
    expect(c.drawings[0].svg).toContain('data-system-design="pending"');
    expect(c.drawings[1].svg).toContain('data-active-only="true"');
    expect(c.drawings[1].svg).not.toMatch(/data-nozzle=|bottom-head|top-head|OVERALL 7000|VESSEL HEIGHT 5950|ellipsoid/i);
    expect(c.drawings[1].svg.match(/data-component="stator-section-left"/g)).toHaveLength(21);
    expect(c.drawings[2].svg).toContain('data-view="compartment"');
    expect(c.drawings[3].svg).toContain('data-view="rotor"');
    expect(c.drawings[4].svg).toContain('data-view="stator"');
    expect(c.compartments[0][1]).toBe('0');
    expect(c.compartments.at(-1)?.[4]).toBe('4200');
    expect(c.activeRows.some(row => /head|disengagement|overall|nozzle/i.test(row[0]))).toBe(false);
    expect(JSON.stringify(geometry)).toBe(before);
  });
  it('fails closed for stale or mismatched sources', () => {
    expect(() => stage5EngineeringReportContent({ ...record, currentness: 'OUTDATED' }, ends, 269)).toThrow('CURRENT_AUTHORITY');
    expect(() => stage5EngineeringReportContent(record, { ...ends, active: { ...ends.active, sourceHash: 'other' } }, 269)).toThrow('CURRENT_AUTHORITY');
  });
  it('renders Unicode, five vector drawings, hydraulic candidate tables and rounded current engineering data without overflow', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'stage5-engineering-')), 'report.pdf');
    writeFileSync(path, await createStage5EngineeringReportPdf(record, ends, 'VERIFICATION-FIXTURE'));
    const data = JSON.parse(execFileSync('python3', ['-c', `
import fitz,json,sys
d=fitz.open(sys.argv[1])
bad=[]
for i,p in enumerate(d):
 for block in p.get_text("dict")["blocks"]:
  for line in block.get("lines",[]):
   for s in line["spans"]:
    x0,y0,x1,y1=s["bbox"]
    if x0 < -1 or y0 < -1 or x1 > p.rect.width+1 or y1 > p.rect.height+1: bad.append([i+1,s["text"]])
print(json.dumps({"pages":len(d),"text":"\\n".join(p.get_text() for p in d),"bad":bad,"landscape":sum(p.rect.width>p.rect.height for p in d)}))
`, path], { maxBuffer: 5e6 }).toString());
    expect(data.pages).toBeLessThanOrEqual(35);
    expect(data.landscape).toBe(5);
    expect(data.bad).toEqual([]);
    for (const heading of ['Normal process material basis', 'Current preliminary nozzle schedule', 'Residence calculation', 'Compact traceability'])
      expect(data.text).toContain(heading);
    expect(data.text).toContain('DN' + ends.nozzles.wetSolventFeed.provisionalDn);
    expect(data.text).toContain('DN' + ends.nozzles.oilFeed.provisionalDn);
    expect(data.text).toContain('0.5 m/s');
    expect(data.text).toContain('NOZZLES ONLY');
    expect(data.text).not.toMatch(/5950|7000|ellipsoid|70\\.000000/);
  }, 60000);
});
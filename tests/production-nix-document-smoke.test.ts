import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Explicit opt-in: only run in the credential-free, network-isolated harness.
vi.mock('../server/db', () => ({
  db: { execute: vi.fn(async () => ({ rows: [{
    id: 1, design_code: 'ASME VIII', equipment_config: 'shell',
    inspection_by: 'TEST', tag_no: 'ISOLATED-TEST',
    mechanical_data: { shell: {} }, general_data: {}, hazard_data: null,
  }] })) },
}));

describe.runIf(process.env.ISOLATED_NIX_SMOKE === '1')('production Nix document tools', () => {
  it('renders through the real DDS service, then rasterizes with the drawing extractor command', async () => {
    const { generateDdsPdfBuffer } = await import('../server/dds-pdf-service');
    const directory = await mkdtemp(join(tmpdir(), 'nix-document-smoke-'));
    try {
      const pdf = await generateDdsPdfBuffer(1, { drawingNumber: 'ISOLATED-TEST', revision: '0' });
      if (!Buffer.isBuffer(pdf)) throw new Error(pdf.error);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const source = join(directory, 'drawing.pdf');
      const prefix = join(directory, 'page');
      await writeFile(source, pdf);
      execFileSync('pdftoppm', ['-png', '-r', '200', '-scale-to-x', '2000',
        '-scale-to-y', '-1', '-f', '1', '-l', '3', source, prefix], { timeout: 60000 });
      const { readdir } = await import('node:fs/promises');
      const pages = (await readdir(directory)).filter(name => name.endsWith('.png'));
      expect(pages.length).toBeGreaterThan(0);
      const png = await readFile(join(directory, pages[0]));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 90000);
});
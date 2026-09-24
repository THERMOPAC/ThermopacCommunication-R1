import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative));

describe('Windows agent workflow download (offline)', () => {
  it('ships the historical workflow backup, not an invented or obsolete copy', () => {
    const backup = read('workflow-backup/build-windows-agent.yml');
    expect(createHash('sha256').update(backup).digest('hex')).toBe(
      'e0584598cab0e37d6cb32ae29b27c69555aaae979d1c077a5758e9c3d2403f45',
    );
    expect(backup.toString('utf8')).toContain('name: Build ThermopacAgent Windows Installer');
  });

  it('routes the download and its public link to the included backup', () => {
    const server = read('server/index.ts').toString('utf8');
    const page = read('client/public/downloads.html').toString('utf8');
    expect(server).toMatch(/app\.get\('\/api\/agent-dl\/build-windows-agent\.yml'[\s\S]*?res\.download\(path\.join\(process\.cwd\(\), 'workflow-backup\/build-windows-agent\.yml'\)/);
    expect(page).toContain('href="/api/agent-dl/build-windows-agent.yml"');
  });
});
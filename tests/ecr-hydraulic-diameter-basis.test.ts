import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  resolve(process.cwd(), 'client/src/pages/design-software/design-software-workspace-page.tsx'),
  'utf8',
);

describe('ECR hydraulic diameter display basis', () => {
  it('uses the latest accepted preliminary ECR snapshot, including warning-status runs', () => {
    const ecrRenderer = workspaceSource.slice(
      workspaceSource.indexOf('function renderECRDesign()'),
      workspaceSource.indexOf('function renderMechanicalDesign()'),
    );

    expect(ecrRenderer).toContain('["success", "warning"].includes(r.calculation_status)');
    expect(ecrRenderer).toContain('const flows = ecrRun?.result_snapshot?.maximumCase?.flows;');
  });
});
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  resolve(process.cwd(), 'client/src/pages/design-software/design-software-workspace-page.tsx'),
  'utf8',
);

describe('ECR-2 process simulation workflow boundary', () => {
  it('places ECR-2 Process Simulation at Stage 8 and preserves the 14-stage workflow', () => {
    const stageBlock = workspaceSource.slice(
      workspaceSource.indexOf('const STEPS ='),
      workspaceSource.indexOf('] as const;', workspaceSource.indexOf('const STEPS =')),
    );

    expect(stageBlock).toContain('{ id: 8,  key: "ecr2_simulation",       label: "ECR-2 Process Simulation"');
    expect(stageBlock).toContain('{ id: 14, key: "revision_control"');
    expect(stageBlock).toContain('{ id: 9,  key: "mechanical_design"');
  });

  it('renders the simulator only from the dedicated Stage 8 host', () => {
    const equipmentRenderer = workspaceSource.slice(
      workspaceSource.indexOf('function renderEquipmentDesign()'),
      workspaceSource.indexOf('function renderEcr2ProcessSimulation()'),
    );

    expect(equipmentRenderer).not.toContain('renderEcr2Simulator()');
    expect(workspaceSource).toContain('case "ecr2_simulation":       return renderEcr2ProcessSimulation();');
    expect(workspaceSource).toContain('data-testid="ecr2-process-simulation-stage"');
  });

  it('persists simulator-only JSON before evaluating the ECR-2 calculation', () => {
    expect(workspaceSource).toContain('const runEcr2Simulation = async () => {');
    expect(workspaceSource).toContain('section: "ecr_simulator"');
    expect(workspaceSource).toContain('await calculateMutation.mutateAsync("ecr_simulator")');
    expect(workspaceSource).toContain('data-testid="ecr2-c2-refresh-required"');
  });

  it('validates Stage 8 against the live resolver register and summarizes unresolved dependencies', () => {
    expect(workspaceSource).toContain('const ecr2Stage8ResolverRecords = stage8ResolutionQ.data?.records;');
    expect(workspaceSource).toContain('resolverRecords: ecr2Stage8ResolverRecords,');
    expect(workspaceSource).toContain('ecr2LiveDependencies.filter(dependency => !dependency.ready)');
    expect(workspaceSource).toContain('required dependenc');
  });
});
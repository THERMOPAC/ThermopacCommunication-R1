import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const app = source('client/src/App.tsx');
const layout = source('client/src/components/layout.tsx');
const loaders = source('client/src/loaders/design-software.ts');

describe('LLX interactive route retirement', () => {
  it('removes legacy list/detail access and retains the existing NotFound fallback', () => {
    for (const text of [app, layout, loaders]) {
      expect(text).not.toContain('/design-software/liquid-liquid-extraction');
      expect(text).not.toContain('DesignSoftwareListPage');
      expect(text).not.toContain('DesignSoftwareWorkspacePage');
    }
    expect(loaders).not.toContain('design-software-list-page');
    expect(loaders).not.toContain('design-software-workspace-page');
    expect(app).toContain('<Route component={NotFound} />');
  });

  it('preserves ECR Pre-Pilot routes and loaders for all five stages', () => {
    for (const [suffix, component] of [
      ['', 'EcrPrePilotDesignPage'],
      ['/stage-2', 'EcrPrePilotDesignStage2Page'],
      ['/stage-3', 'EcrPrePilotDesignStage3Page'],
      ['/stage-4', 'EcrPrePilotDesignStage4Page'],
      ['/stage-5', 'EcrPrePilotDesignStage5Page'],
    ]) {
      expect(app).toContain(`path="/design-software/ecr-pre-pilot-design${suffix}"`);
      expect(app).toContain(`DesignSoftware.${component}`);
      expect(loaders).toContain(`export const ${component} = lazyWithRetry`);
    }
    expect(layout).toContain('href: "/design-software/ecr-pre-pilot-design"');
  });

  it('preserves CPS routes, loaders and navigation', () => {
    for (const [suffix, component] of [
      ['', 'CpsSizingCasesPage'],
      ['/new', 'CpsSizingNewCasePage'],
      ['/case/:id', 'CpsSizingCasePage'],
      ['/knowledge-engine', 'CpsKnowledgeEnginePage'],
    ]) {
      expect(app).toContain(`path="/design-software/cps-sizing${suffix}"`);
      expect(app).toContain(`DesignSoftware.${component}`);
      expect(loaders).toContain(`export const ${component} = lazyWithRetry`);
    }
    expect(layout).toContain('href: "/design-software/cps-sizing"');
    expect(layout).toContain('href: "/design-software/cps-sizing/knowledge-engine"');
  });
});
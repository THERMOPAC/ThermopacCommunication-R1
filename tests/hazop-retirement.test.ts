import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

const retiredRuntimeFiles = [
  'client/src/loaders/hazop.ts',
  'server/hazop-routes.ts',
  'server/scripts/seed-hazop-library.ts',
  'server/utils/hazop-hmac.ts',
];

const archivedHazopTables = [
  'hazop_studies',
  'hazop_concept_equipment',
  'hazop_concept_instruments',
  'hazop_design_assumptions',
  'hazop_process_loops',
  'hazop_process_steps',
  'hazop_nodes',
  'hazop_deviations',
  'hazop_causes',
  'hazop_consequences',
  'hazop_safeguards',
  'hazop_actions',
  'hazop_safety_functions',
  'hazop_ce_matrix',
  'hazop_ce_causes',
  'hazop_ce_effects',
  'hazop_ce_cells',
  'hazop_fat_sat_items',
  'hazop_revisions',
  'hazop_deviation_library',
  'hazop_event_groups',
  'hazop_event_group_members',
  'hazop_response_groups',
  'hazop_response_group_actions',
  'hazop_ce_matrices',
  'hazop_ce_rows',
  'hazop_ce_columns',
  'hazop_interlocks',
  'hazop_interlock_actions',
  'hazop_alarm_trips',
  'hazop_safety_critical_elements',
  'hazop_scenarios',
  'hazop_scenario_ipl_stack',
  'hazop_lopa_records',
  'hazop_srs_records',
  'hazop_moc_records',
  'hazop_baseline_approvals',
] as const;

describe('HAZOP operational retirement boundary', () => {
  it('removes the dedicated client and server implementation', () => {
    for (const file of retiredRuntimeFiles) {
      expect(existsSync(file), file).toBe(false);
    }
    expect(
      existsSync('client/src/pages/hazop')
        ? readdirSync('client/src/pages/hazop', { recursive: true }).filter(entry =>
          /\.(?:ts|tsx|js|jsx)$/.test(String(entry)))
        : [],
    ).toEqual([]);

    const app = read('client/src/App.tsx');
    const routes = read('server/routes.ts');
    expect(app).not.toMatch(/loaders\/hazop|path=["']\/hazop(?:\/|["'])/i);
    expect(routes).not.toMatch(/hazop-routes|seed-hazop-library|\/api\/hazop/i);
  });

  it('removes navigation and operational permission choices', () => {
    const layout = read('client/src/components/layout.tsx');
    const permissions = read('client/src/components/module-permissions-management.tsx');

    expect(layout).not.toMatch(/\/hazop(?:\/|['"`])/i);
    expect(layout).not.toContain('hasViewPermission("HAZOP")');
    expect(permissions).toContain("RETIRED_OPERATIONAL_MODULES = new Set(['HAZOP'])");
    expect(permissions).toContain('!RETIRED_OPERATIONAL_MODULES.has(moduleName)');
    expect(read('server/module-permission-routes.ts'))
      .toContain("modules.filter(moduleName => moduleName !== 'HAZOP')");
  });

  it('preserves the complete archive schema and historical permission value', () => {
    const schema = read('shared/schema.ts');
    expect(schema).toMatch(/export const modules = \[[\s\S]*["']HAZOP["']/);

    for (const table of archivedHazopTables) {
      expect(schema, table).toContain(`pgTable('${table}'`);
    }

    const migrationSql = readdirSync('migrations')
      .filter(file => file.endsWith('.sql'))
      .map(file => read(path.join('migrations', file)))
      .join('\n');
    expect(migrationSql).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?hazop_/i);
  });

  it('preserves engineering-folder and document classification references', () => {
    expect(read('server/seed-folder-templates.ts')).toContain("'2_Design/5_Hazop'");
    expect(read('scripts/migrate-offer-comm-categories.ts')).toContain("'DESIGN_HAZOP'");
    expect(read('client/src/components/offer-comm-register.tsx')).toContain('DESIGN_HAZOP:');
    expect(read('create_directory_templates.sql')).toContain("'4_Hazop'");
  });
});
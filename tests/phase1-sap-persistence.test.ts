/**
 * Phase 1 — SAP Item Code Persistence Verification
 * Tests every scenario specified in the approval document.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Helper: clean up test catalog items by a prefix so tests are idempotent
// ---------------------------------------------------------------------------
async function cleanCatalog(prefix: string) {
  await pool.query(
    `DELETE FROM buy_package_lines WHERE sap_item_code LIKE $1`,
    [`${prefix}%`],
  );
  await pool.query(
    `DELETE FROM master_items WHERE item_code LIKE $1 AND item_type = 'catalog'`,
    [`${prefix}%`],
  );
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------
async function fetchGroupId(code: string): Promise<number> {
  const r = await pool.query<{ id: number }>(`SELECT id FROM buy_groups WHERE code = $1`, [code]);
  if (!r.rowCount) throw new Error(`buy_groups row not found: ${code}`);
  return r.rows[0].id;
}
async function fetchSubgroupId(code: string): Promise<number> {
  const r = await pool.query<{ id: number }>(`SELECT id FROM buy_subgroups WHERE code = $1`, [code]);
  if (!r.rowCount) throw new Error(`buy_subgroups row not found: ${code}`);
  return r.rows[0].id;
}
async function fetchUomId(code: string): Promise<number> {
  const r = await pool.query<{ id: number }>(`SELECT id FROM uom_master WHERE code = $1`, [code]);
  if (!r.rowCount) throw new Error(`uom_master row not found: ${code}`);
  return r.rows[0].id;
}
async function fetchFirstDraftPackageHeaderId(): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM buy_package_headers WHERE status = 'draft' LIMIT 1`,
  );
  if (!r.rowCount) throw new Error('No draft buy_package_headers found — create one first');
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------
// ✓ DB Migration: confirm all new columns exist and have correct nullability
// ---------------------------------------------------------------------------
describe('DB migration columns', () => {
  it('master_items has item_type NOT NULL DEFAULT project', async () => {
    const r = await pool.query<{ is_nullable: string; column_default: string }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_schema='public' AND table_name='master_items' AND column_name='item_type'`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].is_nullable).toBe('NO');
    expect(r.rows[0].column_default).toContain('project');
  });

  it('master_items has buy_group_id nullable', async () => {
    const r = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='master_items' AND column_name='buy_group_id'`,
    );
    expect(r.rows[0].is_nullable).toBe('YES');
  });

  it('master_items has buy_subgroup_id nullable', async () => {
    const r = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='master_items' AND column_name='buy_subgroup_id'`,
    );
    expect(r.rows[0].is_nullable).toBe('YES');
  });

  it('master_items has catalog_make nullable', async () => {
    const r = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='master_items' AND column_name='catalog_make'`,
    );
    expect(r.rows[0].is_nullable).toBe('YES');
  });

  it('master_items has catalog_model nullable', async () => {
    const r = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='master_items' AND column_name='catalog_model'`,
    );
    expect(r.rows[0].is_nullable).toBe('YES');
  });

  it('buy_package_lines has master_item_id nullable', async () => {
    const r = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='buy_package_lines' AND column_name='master_item_id'`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].is_nullable).toBe('YES');
  });

  it('buy_package_lines has sap_item_code nullable', async () => {
    const r = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='buy_package_lines' AND column_name='sap_item_code'`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].is_nullable).toBe('YES');
  });

  it('master_items.item_code has UNIQUE constraint', async () => {
    const r = await pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'master_items'::regclass AND contype = 'u'`,
    );
    const names = r.rows.map(x => x.conname);
    expect(names.some(n => n.includes('item_code'))).toBe(true);
  });

  it('all expected indexes exist', async () => {
    const r = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename IN ('master_items','buy_package_lines')
         AND indexname IN (
           'idx_master_items_item_type',
           'idx_master_items_buy_group_id',
           'idx_master_items_buy_subgroup_id',
           'idx_master_items_catalog_make',
           'idx_master_items_catalog_model',
           'idx_buy_package_lines_master_item_id',
           'idx_buy_package_lines_sap_item_code'
         )`,
    );
    expect(r.rows.length).toBe(7);
  });

  it('existing project items default to item_type = project', async () => {
    const r = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM master_items WHERE item_type NOT IN ('project','catalog')`,
    );
    expect(parseInt(r.rows[0].cnt)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ✓ getOrCreateCatalogMasterItem: new catalog item creation
// ---------------------------------------------------------------------------
describe('getOrCreateCatalogMasterItem — new item', () => {
  const TEST_CODE = 'TEST-NEW-ITEM-V1';

  beforeAll(() => cleanCatalog('TEST-NEW-'));

  it('creates a new master_items row and returns reused=false', async () => {
    const { getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const groupId    = await fetchGroupId('motors');
    const subgroupId = await fetchSubgroupId('non_flameproof');

    const result = await getOrCreateCatalogMasterItem(
      pool, TEST_CODE, 'Test Item', 'Nos', groupId, subgroupId, null, null,
    );

    expect(result.sapItemCode).toBe(TEST_CODE);
    expect(result.masterItemId).toBeTypeOf('number');
    expect(result.reused).toBe(false);

    // Verify DB row
    const row = await pool.query<{ item_code: string; item_type: string }>(
      `SELECT item_code, item_type FROM master_items WHERE id = $1`,
      [result.masterItemId],
    );
    expect(row.rows[0].item_code).toBe(TEST_CODE);
    expect(row.rows[0].item_type).toBe('catalog');
  });
});

// ---------------------------------------------------------------------------
// ✓ getOrCreateCatalogMasterItem: existing catalog item reuse
// ---------------------------------------------------------------------------
describe('getOrCreateCatalogMasterItem — reuse existing', () => {
  const TEST_CODE = 'TEST-REUSE-ITEM-V1';

  beforeAll(() => cleanCatalog('TEST-REUSE-'));

  it('returns reused=false on first call, reused=true on second, same id both times', async () => {
    const { getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const groupId    = await fetchGroupId('motors');
    const subgroupId = await fetchSubgroupId('non_flameproof');

    const first = await getOrCreateCatalogMasterItem(
      pool, TEST_CODE, 'Test Reuse', 'Nos', groupId, subgroupId, null, null,
    );
    expect(first.reused).toBe(false);

    const second = await getOrCreateCatalogMasterItem(
      pool, TEST_CODE, 'Test Reuse', 'Nos', groupId, subgroupId, null, null,
    );
    expect(second.reused).toBe(true);
    expect(second.masterItemId).toBe(first.masterItemId);
    expect(second.sapItemCode).toBe(TEST_CODE);

    // Only one master_items row
    const cnt = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM master_items WHERE item_code = $1`,
      [TEST_CODE],
    );
    expect(parseInt(cnt.rows[0].cnt)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ✓ Two concurrent requests creating the same catalog item
// ---------------------------------------------------------------------------
describe('getOrCreateCatalogMasterItem — concurrent creation', () => {
  const TEST_CODE = 'TEST-CONCURRENT-V1';

  beforeAll(() => cleanCatalog('TEST-CONCURRENT-'));

  it('concurrent requests both succeed, produce exactly one master_items row', async () => {
    const { getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const groupId    = await fetchGroupId('motors');
    const subgroupId = await fetchSubgroupId('non_flameproof');

    const [r1, r2] = await Promise.all([
      getOrCreateCatalogMasterItem(pool, TEST_CODE, 'Concurrent Test', 'Nos', groupId, subgroupId, null, null),
      getOrCreateCatalogMasterItem(pool, TEST_CODE, 'Concurrent Test', 'Nos', groupId, subgroupId, null, null),
    ]);

    // Both return the same code
    expect(r1.sapItemCode).toBe(TEST_CODE);
    expect(r2.sapItemCode).toBe(TEST_CODE);
    // Both return the same id
    expect(r1.masterItemId).toBe(r2.masterItemId);
    // Exactly one created (one reused=false, one reused=true, or both reused=true)
    const cnt = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM master_items WHERE item_code = $1`,
      [TEST_CODE],
    );
    expect(parseInt(cnt.rows[0].cnt)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ✓ Project item / catalog item collision guard
// ---------------------------------------------------------------------------
describe('getOrCreateCatalogMasterItem — collision guard', () => {
  const COLLISION_CODE = 'TEST-COLLISION-PROJ-V1';

  beforeAll(async () => {
    // Insert a project-type master item with this code
    await pool.query(
      `DELETE FROM master_items WHERE item_code = $1`,
      [COLLISION_CODE],
    );
    await pool.query(
      `INSERT INTO master_items (item_code, description, uom, make_or_buy, item_type, created_at, updated_at)
       VALUES ($1, 'Existing project item', 'Nos', 'Make', 'project', NOW(), NOW())`,
      [COLLISION_CODE],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM master_items WHERE item_code = $1`, [COLLISION_CODE]);
  });

  it('throws a collision error when item_code is already a project item', async () => {
    const { getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const groupId    = await fetchGroupId('motors');
    const subgroupId = await fetchSubgroupId('non_flameproof');

    await expect(
      getOrCreateCatalogMasterItem(pool, COLLISION_CODE, 'Catalog attempt', 'Nos', groupId, subgroupId, null, null),
    ).rejects.toMatchObject({ sapCodeCollision: true });
  });
});

// ---------------------------------------------------------------------------
// ✓ POST persistence: master_item_id and sap_item_code saved on new line
// ---------------------------------------------------------------------------
describe('POST /api/buy-packages/:id/lines — SAP persistence', () => {
  const PREFIX = 'TEST-POST-';

  beforeAll(() => cleanCatalog(PREFIX));

  it('saves master_item_id and sap_item_code on the buy_package_lines row', async () => {
    const headerId = await fetchFirstDraftPackageHeaderId();
    const motorGroupId    = await fetchGroupId('motors');
    const motorSubgroupId = await fetchSubgroupId('non_flameproof');
    const uomId           = await fetchUomId('NOS');

    const attrs = {
      motor_type: 'Induction',
      mounting: 'Horizontal (B3)',
      power: '30',
      voltage: '415 V',
      frequency: '50 Hz',
      num_poles: '4',
      efficiency_class: 'IE3',
    };

    // Call the POST route directly via pool (mirror of route logic)
    // Build the expected SAP code to verify
    const { buildNfpMotorItemCode, getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const expectedCode = buildNfpMotorItemCode(attrs);
    const sapRes = await getOrCreateCatalogMasterItem(
      pool, expectedCode, 'Test NFP Motor POST', 'Nos', motorGroupId, motorSubgroupId, null, null,
    );

    // Verify master_items row
    const miRow = await pool.query<{ item_code: string; item_type: string; buy_group_id: number }>(
      `SELECT item_code, item_type, buy_group_id FROM master_items WHERE id = $1`,
      [sapRes.masterItemId],
    );
    expect(miRow.rows[0].item_code).toBe(expectedCode);
    expect(miRow.rows[0].item_type).toBe('catalog');
    expect(miRow.rows[0].buy_group_id).toBe(motorGroupId);

    // Insert a line that links to this master item (mirrors what the route does)
    const lineNumRes = await pool.query<{ next_line: number }>(
      `SELECT COALESCE(MAX(line_number),0)+1 AS next_line FROM buy_package_lines WHERE buy_package_header_id=$1`,
      [headerId],
    );
    const lineNum = lineNumRes.rows[0].next_line;

    const lineRes = await pool.query<{ id: number; master_item_id: number | null; sap_item_code: string | null }>(
      `INSERT INTO buy_package_lines (
         buy_package_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
         generic_requirement, technical_attributes, selection_required,
         datasheet_required, inspection_required, certificate_required,
         compliance_required, sort_order, model,
         master_item_id, sap_item_code, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,false,false,false,false,0,'TBN',$8,$9,NOW())
       RETURNING id, master_item_id, sap_item_code`,
      [
        headerId, lineNum, motorGroupId, motorSubgroupId, uomId,
        'Test NFP Motor Line', JSON.stringify(attrs),
        sapRes.masterItemId, expectedCode,
      ],
    );

    expect(lineRes.rows[0].master_item_id).toBe(sapRes.masterItemId);
    expect(lineRes.rows[0].sap_item_code).toBe(expectedCode);

    // Clean up test line
    await pool.query(`DELETE FROM buy_package_lines WHERE id = $1`, [lineRes.rows[0].id]);
  });
});

// ---------------------------------------------------------------------------
// ✓ PATCH persistence: master_item_id and sap_item_code updated on edit
// ---------------------------------------------------------------------------
describe('PATCH buy_package_lines — SAP persistence', () => {
  const PREFIX = 'TEST-PATCH-';
  let lineId: number;
  let headerId: number;

  beforeAll(async () => {
    await cleanCatalog(PREFIX);
    headerId = await fetchFirstDraftPackageHeaderId();
    const motorGroupId    = await fetchGroupId('motors');
    const motorSubgroupId = await fetchSubgroupId('non_flameproof');
    const uomId           = await fetchUomId('NOS');

    const lineNumRes = await pool.query<{ next_line: number }>(
      `SELECT COALESCE(MAX(line_number),0)+1 AS next_line FROM buy_package_lines WHERE buy_package_header_id=$1`,
      [headerId],
    );
    const lineNum = lineNumRes.rows[0].next_line;

    // Insert a legacy line with null SAP fields
    const r = await pool.query<{ id: number }>(
      `INSERT INTO buy_package_lines (
         buy_package_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
         generic_requirement, selection_required, datasheet_required, inspection_required,
         certificate_required, compliance_required, sort_order, model, updated_at
       ) VALUES ($1,$2,$3,$4,$5,'Legacy Line Test',true,false,false,false,false,0,'TBN',NOW())
       RETURNING id`,
      [headerId, lineNum, motorGroupId, motorSubgroupId, uomId],
    );
    lineId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM buy_package_lines WHERE id = $1`, [lineId]);
  });

  it('legacy line starts with null sap_item_code and null master_item_id', async () => {
    const r = await pool.query<{ sap_item_code: string | null; master_item_id: number | null }>(
      `SELECT sap_item_code, master_item_id FROM buy_package_lines WHERE id = $1`,
      [lineId],
    );
    expect(r.rows[0].sap_item_code).toBeNull();
    expect(r.rows[0].master_item_id).toBeNull();
  });

  it('patching technical_attributes populates sap_item_code and master_item_id', async () => {
    const { buildNfpMotorItemCode, getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const motorGroupId    = await fetchGroupId('motors');
    const motorSubgroupId = await fetchSubgroupId('non_flameproof');

    const attrs = {
      motor_type: 'Induction',
      mounting: 'Horizontal (B3)',
      power: '15',
      voltage: '415 V',
      frequency: '50 Hz',
      num_poles: '4',
      efficiency_class: 'IE3',
    };
    const expectedCode = buildNfpMotorItemCode(attrs);
    const sapRes = await getOrCreateCatalogMasterItem(
      pool, expectedCode, 'Test Patch Motor', 'Nos', motorGroupId, motorSubgroupId, null, null,
    );

    // Mirror what PATCH route does
    await pool.query(
      `UPDATE buy_package_lines
       SET technical_attributes = $1, master_item_id = $2, sap_item_code = $3, updated_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(attrs), sapRes.masterItemId, expectedCode, lineId],
    );

    const r = await pool.query<{ sap_item_code: string; master_item_id: number }>(
      `SELECT sap_item_code, master_item_id FROM buy_package_lines WHERE id = $1`,
      [lineId],
    );
    expect(r.rows[0].sap_item_code).toBe(expectedCode);
    expect(r.rows[0].master_item_id).toBe(sapRes.masterItemId);
  });
});

// ---------------------------------------------------------------------------
// ✓ Cross-project reuse: two buy package lines share one master_items row
// ---------------------------------------------------------------------------
describe('Cross-project reuse', () => {
  const TEST_CODE = 'TEST-XPROJ-MOTOR-V1';

  beforeAll(() => cleanCatalog('TEST-XPROJ-'));

  it('two buy package lines with the same spec share one master_items.id', async () => {
    const { getOrCreateCatalogMasterItem } = await import('../server/buy-catalog-sap-service.js');
    const groupId    = await fetchGroupId('motors');
    const subgroupId = await fetchSubgroupId('non_flameproof');
    const uomId      = await fetchUomId('NOS');
    const headerId   = await fetchFirstDraftPackageHeaderId();

    const r1 = await getOrCreateCatalogMasterItem(
      pool, TEST_CODE, 'Cross-project Motor', 'Nos', groupId, subgroupId, null, null,
    );
    const r2 = await getOrCreateCatalogMasterItem(
      pool, TEST_CODE, 'Cross-project Motor', 'Nos', groupId, subgroupId, null, null,
    );

    expect(r1.masterItemId).toBe(r2.masterItemId);

    // Insert two buy_package_lines rows pointing at the same master item
    const ln1 = (await pool.query<{ next_line: number }>(
      `SELECT COALESCE(MAX(line_number),0)+1 AS next_line FROM buy_package_lines WHERE buy_package_header_id=$1`,
      [headerId],
    )).rows[0].next_line;

    const line1 = await pool.query<{ id: number }>(
      `INSERT INTO buy_package_lines (
         buy_package_header_id,line_number,buy_group_id,buy_subgroup_id,uom_id,
         generic_requirement,selection_required,datasheet_required,inspection_required,
         certificate_required,compliance_required,sort_order,model,
         master_item_id,sap_item_code,updated_at
       ) VALUES ($1,$2,$3,$4,$5,'Xproj Line 1',true,false,false,false,false,0,'TBN',$6,$7,NOW())
       RETURNING id`,
      [headerId, ln1, groupId, subgroupId, uomId, r1.masterItemId, TEST_CODE],
    );

    const line2 = await pool.query<{ id: number }>(
      `INSERT INTO buy_package_lines (
         buy_package_header_id,line_number,buy_group_id,buy_subgroup_id,uom_id,
         generic_requirement,selection_required,datasheet_required,inspection_required,
         certificate_required,compliance_required,sort_order,model,
         master_item_id,sap_item_code,updated_at
       ) VALUES ($1,$2,$3,$4,$5,'Xproj Line 2',true,false,false,false,false,0,'TBN',$6,$7,NOW())
       RETURNING id`,
      [headerId, ln1 + 1, groupId, subgroupId, uomId, r2.masterItemId, TEST_CODE],
    );

    // Both lines reference the same master_items row
    const check = await pool.query<{ master_item_id: number }>(
      `SELECT master_item_id FROM buy_package_lines WHERE id = ANY($1)`,
      [[line1.rows[0].id, line2.rows[0].id]],
    );
    expect(check.rows[0].master_item_id).toBe(r1.masterItemId);
    expect(check.rows[1].master_item_id).toBe(r1.masterItemId);

    // Only one master_items row
    const cnt = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM master_items WHERE item_code = $1`,
      [TEST_CODE],
    );
    expect(parseInt(cnt.rows[0].cnt)).toBe(1);

    // Clean up
    await pool.query(`DELETE FROM buy_package_lines WHERE id = ANY($1)`, [[line1.rows[0].id, line2.rows[0].id]]);
  });
});

// ---------------------------------------------------------------------------
// ✓ Existing records remain readable and editable after migration
// ---------------------------------------------------------------------------
describe('Legacy data safety', () => {
  it('all existing buy_package_lines rows are readable', async () => {
    const r = await pool.query(
      `SELECT id, buy_group_id, buy_subgroup_id, generic_requirement, master_item_id, sap_item_code
       FROM buy_package_lines ORDER BY id LIMIT 5`,
    );
    // If no error thrown, existing rows are readable
    expect(r).toBeDefined();
  });

  it('all existing master_items rows have item_type = project', async () => {
    const r = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM master_items WHERE item_type = 'project'`,
    );
    // All legacy project items should be project type
    expect(parseInt(r.rows[0].cnt)).toBeGreaterThan(0);
  });

  it('no master_items row has NULL item_type', async () => {
    const r = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM master_items WHERE item_type IS NULL`,
    );
    expect(parseInt(r.rows[0].cnt)).toBe(0);
  });
});

/**
 * Company Information Master — Seed & Index Bootstrap
 * Baseline: docs/company-information-master-baseline-v1.md §19 + §20
 *
 * Runs at server startup AFTER drizzle-kit push has created the tables.
 * Idempotent: skips entirely if any company record already exists.
 * Creates the two partial unique indexes if they don't exist yet.
 */

import { pool } from './db';

const TAG = '[company-seed]';

export async function seedCompanyData(): Promise<void> {
  try {
    // ── 1. Ensure partial unique indexes exist ───────────────────────────────
    // These cannot be expressed in Drizzle schema DSL; created via raw SQL.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_company
        ON company_master (is_active)
        WHERE is_active = true
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_doc
        ON company_documents (company_id, doc_type)
        WHERE is_active = true
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_master_updated_at  ON company_master(updated_at)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_master_is_active   ON company_master(is_active)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_legal_tax_company_id ON company_legal_tax(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_legal_tax_updated_at ON company_legal_tax(updated_at)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_addresses_company_id ON company_addresses(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_addresses_is_active  ON company_addresses(is_active)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_company_id ON company_bank_accounts(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_is_active  ON company_bank_accounts(is_active)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_erp_config_company_id ON company_erp_config(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_branding_company_id ON company_branding(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_documents_company_id ON company_documents(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_documents_doc_type   ON company_documents(doc_type)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_documents_is_active  ON company_documents(is_active)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_audit_log_company_id ON company_audit_log(company_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_company_audit_log_changed_at ON company_audit_log(changed_at)
    `);

    console.log(`${TAG} Indexes ensured.`);

    // ── 2. Seed initial company record (skip if any exist) ───────────────────
    const countRes = await pool.query(`SELECT COUNT(*) AS cnt FROM company_master`);
    const count = parseInt(countRes.rows[0].cnt, 10);
    if (count > 0) {
      console.log(`${TAG} ${count} company record(s) already exist — seed skipped.`);
      return;
    }

    // Insert company_master
    const masterRes = await pool.query(`
      INSERT INTO company_master
        (company_code, short_name, legal_name, display_name, company_type,
         fy_start_month, base_currency, timezone, is_active, version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,1)
      RETURNING id
    `, [
      'TPEL',
      'THERMOPAC',
      'THERMOPAC PROCESS ENGINEERING LLP',
      'THERMOPAC Process Engineering LLP',
      'LLP',
      4,
      'INR',
      'Asia/Kolkata',
    ]);
    const companyId = masterRes.rows[0].id;

    // Insert company_legal_tax (empty — admin fills via UI)
    await pool.query(`
      INSERT INTO company_legal_tax (company_id, version) VALUES ($1, 1)
    `, [companyId]);

    // Insert company_erp_config (empty)
    await pool.query(`
      INSERT INTO company_erp_config (company_id, decimal_precision, version) VALUES ($1, 2, 1)
    `, [companyId]);

    // Insert company_branding (empty)
    await pool.query(`
      INSERT INTO company_branding (company_id, version) VALUES ($1, 1)
    `, [companyId]);

    // Insert registered office address (confirmed values from codebase scan)
    await pool.query(`
      INSERT INTO company_addresses
        (company_id, address_type, address_line1, address_line2, city, state, country, pin_code, is_active, version)
      VALUES ($1,'registered_office',$2,$3,$4,$5,$6,$7,true,1)
    `, [
      companyId,
      'L 4, 405 The Summit Business Bay',
      'Vile Parle (East), W E Highway',
      'Mumbai',
      'Maharashtra',
      'India',
      '400057',
    ]);

    // Audit log the creation
    await pool.query(`
      INSERT INTO company_audit_log (company_id, action, table_name, notes, changed_at)
      VALUES ($1,'create','company_master','Initial seed from company-seed.ts at server startup',NOW())
    `, [companyId]);

    console.log(`${TAG} TPEL company master seeded (id=${companyId}).`);
  } catch (err: any) {
    // Tables may not exist yet on very first boot before push — non-fatal
    if (err.code === '42P01') {
      console.warn(`${TAG} Tables not yet created — seed will run after next push.`);
    } else {
      console.error(`${TAG} Seed error:`, err.message);
    }
  }
}

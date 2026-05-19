/**
 * Controlled sync test for V10274 — run with:
 *   npx tsx server/scripts/test-v10274-sync.ts
 *
 * Steps:
 *  1. Login to SAP B1
 *  2. GET BusinessPartners('V10274')
 *  3. Print raw GlblLocNum + U_PAN_Number
 *  4. Query local DB (pre + post sync)
 *
 * Does NOT run the sync itself (trigger via UI "Sync Specific Vendor").
 */

import https from 'https';
import { Pool } from 'pg';

const SAP_HOST = '59.152.52.58';
const SAP_PORT = 50000;
const SAP_USER = process.env.SAP_B1_USERNAME || '';
const SAP_PASS = process.env.SAP_B1_PASSWORD || '';
const SAP_DB   = process.env.SAP_COMPANY_DB  || '';

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function sapRequest(opts: { method: string; path: string; body?: any; cookie?: string }): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'B1S-WCFCompatible': 'true',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    if (opts.cookie) headers['Cookie'] = opts.cookie;

    const req = https.request(
      { hostname: SAP_HOST, port: SAP_PORT, path: opts.path, method: opts.method, agent, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: any;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode ?? 0, body: parsed, headers: res.headers as Record<string, string> });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  if (!SAP_USER || !SAP_PASS || !SAP_DB) {
    console.error('ERROR: SAP_B1_USERNAME / SAP_B1_PASSWORD / SAP_COMPANY_DB env vars not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // ─── Step 1: Login ──────────────────────────────────────────────────────────
  console.log('\n=== STEP 1: SAP Login ===');
  const loginResp = await sapRequest({
    method: 'POST',
    path: '/b1s/v1/Login',
    body: { CompanyDB: SAP_DB, UserName: SAP_USER, Password: SAP_PASS },
  });
  if (loginResp.status !== 200) {
    console.error('Login failed:', loginResp.status, loginResp.body);
    await pool.end();
    process.exit(1);
  }
  const setCookie = loginResp.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
  console.log('Login OK — session cookie obtained');

  // ─── Step 2: Fetch V10274 ───────────────────────────────────────────────────
  console.log('\n=== STEP 2: GET BusinessPartners(\'V10274\') ===');
  const bpResp = await sapRequest({
    method: 'GET',
    path: "/b1s/v1/BusinessPartners('V10274')",
    cookie,
  });
  if (bpResp.status !== 200) {
    console.error('Fetch failed:', bpResp.status, bpResp.body);
    await pool.end();
    process.exit(1);
  }
  const bp = bpResp.body;

  // ─── Step 3: Print raw SAP values ───────────────────────────────────────────
  console.log('\n=== STEP 3: Raw SAP field values ===');
  console.log('CardCode     :', bp.CardCode);
  console.log('CardName     :', bp.CardName);
  console.log('GlblLocNum   :', bp.GlblLocNum  ?? '(null)');
  console.log('U_PAN_Number :', bp.U_PAN_Number ?? '(null/field missing)');
  console.log('FederalTaxID :', bp.FederalTaxID ?? '(null)');

  // ─── Step 4: Query local DB (pre-sync) ─────────────────────────────────────
  console.log('\n=== STEP 4: Local DB (current state) ===');
  const dbRes = await pool.query(
    `SELECT sap_card_code, bp_name, glbl_loc_num, pan_number, sap_synced_at
     FROM customers WHERE sap_card_code = $1`,
    ['V10274']
  );
  if (dbRes.rows.length === 0) {
    console.log('V10274 NOT FOUND in local DB');
  } else {
    const r = dbRes.rows[0];
    console.log('sap_card_code :', r.sap_card_code);
    console.log('bp_name       :', r.bp_name);
    console.log('glbl_loc_num  :', r.glbl_loc_num ?? '(null)');
    console.log('pan_number    :', r.pan_number   ?? '(empty)');
    console.log('sap_synced_at :', r.sap_synced_at);
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Now trigger "Sync Specific Vendor" for V10274 in the UI.');
  console.log('Then run this script again to see post-sync DB state.');
  console.log('─────────────────────────────────────────────────────────\n');

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

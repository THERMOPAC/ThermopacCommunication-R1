/**
 * Deep field inspection for V10274
 *   npx tsx server/scripts/test-v10274-sync.ts
 */

import https from 'https';

const SAP_HOST = '59.152.52.58';
const SAP_PORT = 50000;
const SAP_USER = process.env.SAP_B1_USERNAME || '';
const SAP_PASS = process.env.SAP_B1_PASSWORD || '';
const SAP_DB   = process.env.SAP_COMPANY_DB  || '';

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function sapRequest(opts: { method: string; path: string; body?: any; cookie?: string }): Promise<{ status: number; body: any; rawBody: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'B1S-WCFCompatible': 'true' };
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
          resolve({ status: res.statusCode ?? 0, body: parsed, rawBody: raw, headers: res.headers as Record<string, string> });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function login(): Promise<string> {
  const r = await sapRequest({ method: 'POST', path: '/b1s/v1/Login', body: { CompanyDB: SAP_DB, UserName: SAP_USER, Password: SAP_PASS } });
  if (r.status !== 200) throw new Error(`Login failed: ${r.status} ${JSON.stringify(r.body)}`);
  const sc = r.headers['set-cookie'];
  return Array.isArray(sc) ? sc.join('; ') : (sc ?? '');
}

async function main() {
  if (!SAP_USER || !SAP_PASS || !SAP_DB) { console.error('SAP env vars missing'); process.exit(1); }

  console.log('\n=== LOGIN ===');
  const cookie = await login();
  console.log('OK');

  // ─── Plain BP fetch — V10274 ─────────────────────────────────────────────
  console.log("\n=== GET BusinessPartners('V10274') [no $expand] ===");
  const r = await sapRequest({ method: 'GET', path: "/b1s/v1/BusinessPartners('V10274')", cookie });
  console.log('HTTP status:', r.status);

  if (r.status !== 200) { console.log('Error:', r.rawBody.slice(0, 400)); process.exit(1); }

  const bp = r.body;

  // ─── 1. Known GST/PAN standard fields ───────────────────────────────────
  console.log('\n--- Standard GST/PAN fields ---');
  console.log('GlblLocNum              :', bp.GlblLocNum               ?? '(null)');
  console.log('GlobalLocationNumber    :', bp.GlobalLocationNumber     ?? '(null)');
  console.log('VATRegistrationNumber   :', bp.VATRegistrationNumber    ?? '(null)');
  console.log('VatIDNum                :', bp.VatIDNum                  ?? '(null)');
  console.log('FederalTaxID            :', bp.FederalTaxID              ?? '(null)');
  console.log('UnifiedFederalTaxID     :', bp.UnifiedFederalTaxID       ?? '(null)');
  console.log('AdditionalID            :', bp.AdditionalID              ?? '(null)');
  console.log('CompanyRegistrationNumber:', bp.CompanyRegistrationNumber ?? '(null)');
  console.log('VerificationNumber      :', bp.VerificationNumber        ?? '(null)');

  // ─── 2. All U_* UDFs ────────────────────────────────────────────────────
  console.log('\n--- All U_* UDF fields ---');
  const udfs = Object.entries(bp).filter(([k]) => k.startsWith('U_'));
  for (const [k, v] of udfs) console.log(`  ${k.padEnd(30)} = ${JSON.stringify(v)}`);

  // ─── 3. BPFiscalTaxIDCollection (inline in response) ───────────────────
  console.log('\n--- BPFiscalTaxIDCollection (inline) ---');
  const ftColl = bp.BPFiscalTaxIDCollection;
  if (ftColl === undefined) {
    console.log('Key not present in response');
  } else if (ftColl === null || (Array.isArray(ftColl) && ftColl.length === 0)) {
    console.log('Present but empty:', JSON.stringify(ftColl));
  } else {
    console.log(JSON.stringify(ftColl, null, 2));
  }

  // ─── 4. Any other collection keys that might hold GST/PAN ───────────────
  console.log('\n--- All collection/array fields (non-Properties*, non-U_) ---');
  const collKeys = Object.keys(bp).filter(k =>
    !k.startsWith('U_') && !k.startsWith('Properties') && !k.startsWith('odata') &&
    Array.isArray(bp[k])
  );
  for (const k of collKeys) {
    const val = bp[k];
    console.log(`  ${k.padEnd(35)}: ${Array.isArray(val) ? `[${val.length} items] ${JSON.stringify(val).slice(0, 150)}` : JSON.stringify(val).slice(0, 150)}`);
  }

  // ─── 5. Also try V10382 (which had PAN synced successfully) ─────────────
  console.log("\n=== COMPARISON: BusinessPartners('V10382') U_PAN_Number + BPFiscalTaxIDCollection ===");
  const r2 = await sapRequest({ method: 'GET', path: "/b1s/v1/BusinessPartners('V10382')", cookie });
  console.log('HTTP status:', r2.status);
  if (r2.status === 200) {
    const bp2 = r2.body;
    console.log('V10382 U_PAN_Number         :', bp2.U_PAN_Number ?? '(null)');
    console.log('V10382 GlblLocNum           :', bp2.GlblLocNum   ?? '(null)');
    console.log('V10382 BPFiscalTaxIDCollection:', JSON.stringify(bp2.BPFiscalTaxIDCollection)?.slice(0, 300));
  }

  console.log('\n=== DONE ===\n');
}

main().catch((e) => { console.error(e); process.exit(1); });

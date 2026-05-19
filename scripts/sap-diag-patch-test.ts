/**
 * GET → PATCH → GET verification for SAP BPAddresses.
 *
 * Purpose:
 *   - Confirms whether a PATCH with explicit AddressName/AddressType updates
 *     existing CRD1 rows (RowNum unchanged) or inserts new rows (RowNum increases).
 *   - Identifies the correct PATCH strategy before touching production code.
 *
 * Safety:
 *   - PATCH payload is identical to what SAP already has (no field value changes).
 *     Any difference in RowNum count after PATCH = SAP inserted a duplicate.
 *   - If the test creates duplicates they are logged clearly with their RowNums.
 *
 * Run: npx tsx scripts/sap-diag-patch-test.ts V00531
 */
import https from 'https';

const CARD_CODE = process.argv[2] || 'V00531';
const HOST      = '59.152.52.58';
const PORT      = 50000;
const USER      = process.env.SAP_B1_USERNAME  || '';
const PASS      = process.env.SAP_B1_PASSWORD  || '';
const DB        = process.env.SAP_COMPANY_DB   || '';

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

function sapRequest(
  path: string,
  method: string,
  body?: any,
  cookie?: string,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: HOST, port: PORT, path, method, agent,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body: data, headers: res.headers as any }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function printAddresses(label: string, addresses: any[]) {
  console.log(`\n=== ${label} (${addresses.length} rows) ===`);
  for (const a of addresses) {
    console.log(
      `  RowNum=${a.RowNum}  AddressType=${a.AddressType}  AddressName="${a.AddressName}"` +
      `  City="${a.City}"  ZipCode="${a.ZipCode}"  State="${a.State}"` +
      `  AddressName2="${a.AddressName2}"  AddressName3="${a.AddressName3}"` +
      `  Street="${a.Street}"  GSTIN="${a.GSTIN}"`,
    );
  }
}

function compareAddresses(before: any[], after: any[]): void {
  console.log('\n=== DIFF: before vs after ===');

  // Rows in before
  const beforeKeys = new Set(before.map(a => `${a.AddressType}::${a.AddressName}::${a.RowNum}`));
  const afterKeys  = new Set(after.map(a => `${a.AddressType}::${a.AddressName}::${a.RowNum}`));

  // New rows
  const newRows = after.filter(a => !beforeKeys.has(`${a.AddressType}::${a.AddressName}::${a.RowNum}`));
  if (newRows.length > 0) {
    console.log(`\n⚠️  PATCH INSERTED ${newRows.length} NEW ROW(S) — duplicates created:`);
    for (const r of newRows) {
      console.log(`   RowNum=${r.RowNum}  AddressType=${r.AddressType}  AddressName="${r.AddressName}"`);
    }
  } else {
    console.log('\n✅ No new rows created — PATCH updated existing rows only.');
  }

  // Missing rows (deleted by PATCH)
  const deletedRows = before.filter(a => !afterKeys.has(`${a.AddressType}::${a.AddressName}::${a.RowNum}`));
  if (deletedRows.length > 0) {
    console.log(`\n⚠️  PATCH DELETED ${deletedRows.length} ROW(S):`);
    for (const r of deletedRows) {
      console.log(`   RowNum=${r.RowNum}  AddressType=${r.AddressType}  AddressName="${r.AddressName}"`);
    }
  }

  if (newRows.length === 0 && deletedRows.length === 0) {
    console.log('Row count and identity unchanged. PATCH behaviour: UPDATE in-place.');
  }
}

async function fetchBP(cookie: string): Promise<any> {
  const resp = await sapRequest(
    `/b1s/v1/BusinessPartners('${encodeURIComponent(CARD_CODE)}')`,
    'GET', undefined, cookie,
  );
  if (resp.status !== 200) {
    throw new Error(`BP GET failed: HTTP ${resp.status} — ${resp.body}`);
  }
  return JSON.parse(resp.body);
}

async function main() {
  if (!USER || !PASS || !DB) {
    console.error('SAP_B1_USERNAME / SAP_B1_PASSWORD / SAP_COMPANY_DB not set');
    process.exit(1);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  console.log(`\n[1/5] Login to SAP SL at ${HOST}:${PORT} as ${USER} / db=${DB} …`);
  const loginResp = await sapRequest('/b1s/v1/Login', 'POST', { UserName: USER, Password: PASS, CompanyDB: DB });
  if (loginResp.status !== 200) {
    console.error('Login failed:', loginResp.status, loginResp.body);
    process.exit(1);
  }
  const setCookie = loginResp.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
  console.log('Login OK.\n');

  // ── GET 1: Current state ───────────────────────────────────────────────────
  console.log(`[2/5] GET (before) — BusinessPartners('${CARD_CODE}') …`);
  const bpBefore = await fetchBP(cookie);
  const addrBefore: any[] = Array.isArray(bpBefore.BPAddresses) ? bpBefore.BPAddresses : [];
  printAddresses('BEFORE PATCH', addrBefore);

  // ── Build PATCH payload ────────────────────────────────────────────────────
  // Strategy being tested: use exact AddressName + AddressType from first GET.
  // Payload mirrors the actual data already in SAP (no field value change).
  // If SAP inserts new rows instead of updating → PATCH-by-name is unreliable.
  //
  // We pick only the FIRST entry per AddressType (lowest RowNum) as the canonical row.
  const canonicalByType: Record<string, any> = {};
  for (const a of addrBefore) {
    const t = String(a.AddressType);
    if (!canonicalByType[t]) canonicalByType[t] = a; // first = lowest RowNum
  }

  const patchAddresses: any[] = [];
  for (const [addrType, a] of Object.entries(canonicalByType)) {
    patchAddresses.push({
      AddressName:      a.AddressName,       // exact key from SAP
      AddressType:      a.AddressType,
      // Mirror all existing fields back unchanged
      AddressName2:     a.AddressName2 ?? null,
      AddressName3:     a.AddressName3 ?? null,
      Street:           a.Street      ?? null,
      StreetNo:         a.StreetNo    ?? null,
      Block:            a.Block       ?? null,
      BuildingFloorRoom: a.BuildingFloorRoom ?? null,
      City:             a.City        ?? null,
      ZipCode:          a.ZipCode     ?? null,
      State:            a.State       ?? null,
      Country:          a.Country     ?? null,
    });
  }

  const patchPayload = { BPAddresses: patchAddresses };

  console.log(`\n[3/5] PATCH payload (${patchAddresses.length} address entries):`);
  for (const a of patchAddresses) {
    console.log(`  AddressType=${a.AddressType}  AddressName="${a.AddressName}"  City="${a.City}"`);
  }
  console.log('\nFull payload:', JSON.stringify(patchPayload, null, 2));

  // ── PATCH ─────────────────────────────────────────────────────────────────
  console.log(`\n[4/5] Sending PATCH to SAP …`);
  const patchResp = await sapRequest(
    `/b1s/v1/BusinessPartners('${encodeURIComponent(CARD_CODE)}')`,
    'PATCH', patchPayload, cookie,
  );
  console.log(`PATCH response: HTTP ${patchResp.status}`);
  if (patchResp.body && patchResp.body.trim()) {
    console.log('PATCH response body:', patchResp.body);
  }
  const patchOk = patchResp.status === 204 || patchResp.status === 200;
  if (!patchOk) {
    console.error('❌ PATCH failed — stopping before second GET to preserve SAP state.');
    await sapRequest('/b1s/v1/Logout', 'POST', undefined, cookie).catch(() => {});
    process.exit(1);
  }
  console.log('PATCH accepted.');

  // ── GET 2: After state ────────────────────────────────────────────────────
  console.log(`\n[5/5] GET (after) — BusinessPartners('${CARD_CODE}') …`);
  const bpAfter = await fetchBP(cookie);
  const addrAfter: any[] = Array.isArray(bpAfter.BPAddresses) ? bpAfter.BPAddresses : [];
  printAddresses('AFTER PATCH', addrAfter);

  // ── Compare ───────────────────────────────────────────────────────────────
  compareAddresses(addrBefore, addrAfter);

  console.log('\n=== SUMMARY ===');
  console.log(`  Row count before: ${addrBefore.length}`);
  console.log(`  Row count after : ${addrAfter.length}`);
  console.log(`  Delta           : ${addrAfter.length - addrBefore.length > 0 ? '+' : ''}${addrAfter.length - addrBefore.length}`);

  // Logout
  await sapRequest('/b1s/v1/Logout', 'POST', undefined, cookie).catch(() => {});
  console.log('\nLogout done.');
}

main().catch(e => { console.error(e); process.exit(1); });

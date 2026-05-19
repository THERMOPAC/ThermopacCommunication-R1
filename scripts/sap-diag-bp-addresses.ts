/**
 * One-shot diagnostic: fetch raw BPAddresses for a CardCode from SAP Service Layer.
 * Run: npx tsx scripts/sap-diag-bp-addresses.ts V00531
 */
import https from 'https';

const CARD_CODE = process.argv[2] || 'V00531';
const HOST      = '59.152.52.58';
const PORT      = 50000;
const USER      = process.env.SAP_B1_USERNAME  || '';
const PASS      = process.env.SAP_B1_PASSWORD  || '';
const DB        = process.env.SAP_COMPANY_DB   || '';

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

function sapRequest(path: string, method: string, body?: any, cookie?: string): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: HOST, port: PORT, path, method, agent,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data, headers: res.headers as any }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (!USER || !PASS || !DB) {
    console.error('SAP_B1_USERNAME / SAP_B1_PASSWORD / SAP_COMPANY_DB not set');
    process.exit(1);
  }

  // 1. Login
  console.log(`\nLogging in to SAP SL at ${HOST}:${PORT} as ${USER} / db=${DB} …`);
  const loginResp = await sapRequest('/b1s/v1/Login', 'POST', { UserName: USER, Password: PASS, CompanyDB: DB });
  if (loginResp.status !== 200) {
    console.error('Login failed:', loginResp.status, loginResp.body);
    process.exit(1);
  }
  const setCookie = loginResp.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
  console.log('Login OK.\n');

  // 2. Fetch BP (no $select — UDFs stripped if $select is added)
  console.log(`Fetching BusinessPartners('${CARD_CODE}') …`);
  const bpResp = await sapRequest(
    `/b1s/v1/BusinessPartners('${encodeURIComponent(CARD_CODE)}')`,
    'GET', undefined, cookie,
  );
  if (bpResp.status !== 200) {
    console.error('BP fetch failed:', bpResp.status, bpResp.body);
    process.exit(1);
  }

  const bp = JSON.parse(bpResp.body);

  // 3. Print summary
  console.log('=== BP SUMMARY ===');
  console.log(`CardCode : ${bp.CardCode}`);
  console.log(`CardName : ${bp.CardName}`);
  console.log(`CardType : ${bp.CardType}`);
  console.log('');

  // 4. Print raw BPAddresses
  const addresses: any[] = Array.isArray(bp.BPAddresses) ? bp.BPAddresses : [];
  console.log(`=== BPAddresses (${addresses.length} entries) — RAW ===`);
  console.log(JSON.stringify(addresses, null, 2));

  // 5. Print per-entry field summary
  console.log('\n=== BPAddresses — FIELD SUMMARY (one block per entry) ===');
  for (const a of addresses) {
    console.log('---');
    const FIELDS = [
      'RowNum','AddressName','AddressType',
      'AddressName2','AddressName3',
      'Street','StreetNo',
      'Block','BuildingFloorRoom',
      'City','ZipCode','State','Country',
      'GSTRegnNo','GSTType','StateCode',
    ];
    for (const f of FIELDS) {
      if (f in a) console.log(`  ${f.padEnd(22)}: ${JSON.stringify(a[f])}`);
    }
    // Print any extra fields not in our known list
    const extra = Object.keys(a).filter(k => !FIELDS.includes(k));
    if (extra.length) {
      console.log('  [extra fields]:');
      for (const k of extra) console.log(`    ${k.padEnd(20)}: ${JSON.stringify(a[k])}`);
    }
  }

  // 6. Logout
  await sapRequest('/b1s/v1/Logout', 'POST', undefined, cookie).catch(() => {});
  console.log('\nLogout done.');
}

main().catch(e => { console.error(e); process.exit(1); });

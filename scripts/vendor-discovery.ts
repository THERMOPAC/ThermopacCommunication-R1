/**
 * Vendor Discovery Script — runs standalone, reads SAP creds from env.
 * Usage: npx tsx scripts/vendor-discovery.ts
 */
import { sapHttpsClient } from '../server/sap-b1-integration/sap-https-client';

const SAP_USER = process.env.SAP_USERNAME   || '';
const SAP_PASS = process.env.SAP_PASSWORD   || '';
const SAP_DB   = process.env.SAP_COMPANY_DB || '';

if (!SAP_USER || !SAP_PASS || !SAP_DB) {
  console.error('❌  SAP_USERNAME / SAP_PASSWORD / SAP_COMPANY_DB not set');
  process.exit(1);
}

async function run() {
  console.log('[discovery] Logging in to SAP B1…');
  const { sessionId } = await sapHttpsClient.login(SAP_USER, SAP_PASS, SAP_DB);
  console.log('[discovery] Login OK');

  // ── 1. Fetch BusinessPartnerGroups (code → name) ──────────────────────────
  const grpResp = await sapHttpsClient.authenticatedRequest(sessionId, {
    method: 'GET',
    path: `/b1s/v1/BusinessPartnerGroups?$select=Code,Name&$top=200`,
  });
  const groupMap: Record<number, string> = {};
  if (grpResp.ok) {
    const gData = JSON.parse(grpResp.body);
    for (const g of (gData.value || [])) groupMap[g.Code] = g.Name;
    console.log(`[discovery] Fetched ${Object.keys(groupMap).length} vendor groups`);
  } else {
    console.warn('[discovery] Could not fetch BusinessPartnerGroups — will use GroupCode only');
  }

  // ── 2. Paginate all cSuppliers with GroupCode ─────────────────────────────
  const PAGE_SIZE = 20;
  const allSuppliers: Array<{ CardCode: string; CardName: string; GroupCode: number }> = [];
  let skip = 0;

  while (true) {
    const qs = new URLSearchParams({
      '$filter': "CardType eq 'cSupplier'",
      '$select': 'CardCode,CardName,GroupCode',
      '$top':    String(PAGE_SIZE),
      '$skip':   String(skip),
    }).toString();

    const resp = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'GET',
      path:   `/b1s/v1/BusinessPartners?${qs}`,
    });
    if (!resp.ok) {
      console.error(`[discovery] SAP error at skip=${skip}: ${resp.statusCode} — ${resp.body.substring(0, 200)}`);
      break;
    }
    const page = JSON.parse(resp.body).value || [];
    allSuppliers.push(...page);
    console.log(`[discovery] Fetched page skip=${skip} → ${page.length} rows (total so far: ${allSuppliers.length})`);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    if (allSuppliers.length >= 2000) { console.warn('[discovery] 2000-row cap reached'); break; }
  }

  // ── 3. Logout ─────────────────────────────────────────────────────────────
  await sapHttpsClient.authenticatedRequest(sessionId, {
    method: 'POST', path: '/b1s/v1/Logout',
  }).catch(() => {});

  // ── 4. Aggregate groups ───────────────────────────────────────────────────
  const groups: Record<string, { groupCode: number; groupName: string; count: number; samples: string[] }> = {};
  for (const s of allSuppliers) {
    const code = s.GroupCode ?? -1;
    const name = groupMap[code] ?? `(GroupCode ${code})`;
    const key  = String(code);
    if (!groups[key]) groups[key] = { groupCode: code, groupName: name, count: 0, samples: [] };
    groups[key].count++;
    if (groups[key].samples.length < 4) groups[key].samples.push(`${s.CardCode} — ${s.CardName}`);
  }

  const sorted = Object.values(groups).sort((a, b) => b.count - a.count);

  // ── 5. Report ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`SAP VENDOR GROUP DISCOVERY REPORT`);
  console.log(`Total suppliers fetched: ${allSuppliers.length}`);
  console.log(`Total groups found:      ${sorted.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const g of sorted) {
    console.log(`GroupCode=${String(g.groupCode).padEnd(5)} │ Count=${String(g.count).padEnd(4)} │ GroupName="${g.groupName}"`);
    for (const s of g.samples) console.log(`   ↳ ${s}`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('JSON output (for mapping):');
  console.log(JSON.stringify(sorted.map(g => ({
    groupCode: g.groupCode,
    groupName: g.groupName,
    supplierCount: g.count,
  })), null, 2));
}

run().catch((err) => {
  console.error('❌  Discovery failed:', err?.message || err);
  process.exit(1);
});

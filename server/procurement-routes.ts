import { Response, Router, Request } from 'express';
import { db, pool } from './db';
import { 
  projects, projectItems, masterItems, vendors,
  purchaseOrders, purchaseOrderItems, purchaseOrderHistory
} from '@shared/schema';
import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// ─── SAP B1 vendor sync helpers ───────────────────────────────────────────

// SAP GroupCodes to exclude from vendor sync (Employees, Employee Loans)
const EXCLUDED_GROUP_CODES = new Set([105, 106]);

// Vendor type mapping from SAP UDF U_ERP_Group
const VALID_VENDOR_TYPES = new Set(['R', 'P', 'M', 'I', 'V', 'E', 'B']);

interface SapVendorRecord {
  CardCode: string;
  CardName: string;
  GroupCode: number;
  U_ERP_Group: string | null;
}

// ── Concurrency guard — only one sync may run at a time ──────────────────────
let syncInProgress = false;

// ── Enrich a list of CardCodes with U_ERP_Group via individual SAP record fetches ──
// SAP B1 Service Layer caps full-record OData results at 500 rows server-side.
// Individual fetches (/b1s/v1/BusinessPartners('CODE')) bypass this limit.
// We run them in parallel batches of 20 for speed (~7-15 s for 1,458 vendors).
async function enrichWithUdfGroups(
  cardCodes: string[],
  sessionCookie: string,
): Promise<Map<string, string | null>> {
  const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');
  const result = new Map<string, string | null>();
  const BATCH = 20;

  for (let i = 0; i < cardCodes.length; i += BATCH) {
    const batch = cardCodes.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (code) => {
        const resp = await sapHttpsClient.authenticatedRequest(sessionCookie, {
          method: 'GET', url: '', path: `/b1s/v1/BusinessPartners('${encodeURIComponent(code)}')`,
        });
        if (!resp.ok) return { code, udfRaw: null as string | null };
        const bp = JSON.parse(resp.body);
        const raw = bp['U_ERP_Group'] ?? null;
        return { code, udfRaw: raw ? String(raw).trim() || null : null };
      }),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') result.set(r.value.code, r.value.udfRaw);
    }
  }
  console.log(`[vendors/enrich] enriched ${result.size} of ${cardCodes.length} — found ${[...result.values()].filter(Boolean).length} with U_ERP_Group`);
  return result;
}

// Parse -1102 session conflict from a SAP error message or body string
function isSapSessionConflict(raw: string): boolean {
  return raw.includes('-1102') || raw.toLowerCase().includes('switch company');
}

// ── Shared SAP session cache ─────────────────────────────────────────────────
// SAP B1 sessions don't release immediately after /Logout (server-side expiry
// takes 1-2 min). Sharing one session across Test / UDF Check / Full Sync
// eliminates the login-collision that causes -1102 between operations.
// Cache stores the FULL cookie string (B1SESSION + CompanyDB + UserName + …) so
// every authenticated request carries the complete session context SAP requires.
// Sending only B1SESSION causes -1102 "Switch company" errors on subsequent calls.
interface SapSessionCache { cookie: string; createdAt: number; }
let _sapSession: SapSessionCache | null = null;
const SAP_SESSION_TTL_MS = 25 * 60 * 1000; // 25 min (SAP default is 30 min idle)

async function getSharedSapSession(): Promise<string> {
  const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');
  const user = process.env.SAP_USERNAME  || '';
  const pass = process.env.SAP_PASSWORD  || '';
  const db_  = process.env.SAP_COMPANY_DB || '';
  if (!user || !pass || !db_) throw new Error('SAP credentials not configured');

  if (_sapSession && (Date.now() - _sapSession.createdAt) < SAP_SESSION_TTL_MS) {
    console.log('[sap-session] Reusing existing session');
    return _sapSession.cookie;
  }

  _sapSession = null; // clear stale entry before attempting login
  try {
    const r = await sapHttpsClient.login(user, pass, db_);
    _sapSession = { cookie: r.sessionCookie, createdAt: Date.now() };
    console.log(`[sap-session] New session created — cookies: ${r.sessionCookie.replace(/=[^;]+/g, '=***')}`);
    return _sapSession.cookie;
  } catch (err) {
    _sapSession = null;
    throw err; // propagates including -1102
  }
}

function invalidateSharedSapSession() {
  _sapSession = null;
  console.log('[sap-session] Session invalidated');
}

async function fetchSapVendors(): Promise<SapVendorRecord[]> {
  const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');

  // Use shared session — avoids -1102 login collision between operations
  let sessionId: string;
  try {
    sessionId = await getSharedSapSession();
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    if (isSapSessionConflict(msg)) {
      throw new Error(
        'SAP_SESSION_CONFLICT: A previous sync session is still active in SAP B1. ' +
        'Wait 1–2 minutes for it to expire, then try again.',
      );
    }
    throw err;
  }

  // Phase 1: $select pagination — gets ALL vendors (proven to return all 1,458).
  // SAP B1 Service Layer caps full-record (no $select) OData fetches at 500 rows
  // server-side. With $select the limit does not apply so we get everything.
  {
    const PAGE_SIZE = 20;
    const allSuppliers: Array<{ CardCode: string; CardName: string; GroupCode: number }> = [];
    let skip = 0;

    while (true) {
      const qs = new URLSearchParams({
        '$select': 'CardCode,CardName,GroupCode',
        '$filter': "CardType eq 'cSupplier'",
        '$top':    String(PAGE_SIZE),
        '$skip':   String(skip),
      }).toString();

      const resp = await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'GET', url: '', path: `/b1s/v1/BusinessPartners?${qs}`,
      });

      if (!resp.ok) {
        const body = resp.body?.substring(0, 400) ?? '';
        if (isSapSessionConflict(body)) {
          invalidateSharedSapSession();
          throw new Error(
            'SAP_SESSION_CONFLICT: A previous sync session is still active in SAP B1. ' +
            'Wait 1–2 minutes for it to expire, then try again.',
          );
        }
        throw new Error(`SAP returned ${resp.statusCode}: ${body}`);
      }

      const page = JSON.parse(resp.body).value || [];
      for (const bp of page) {
        allSuppliers.push({
          CardCode:  String(bp.CardCode  ?? ''),
          CardName:  String(bp.CardName  ?? ''),
          GroupCode: Number(bp.GroupCode ?? 0),
        });
      }
      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
      if (allSuppliers.length >= 5000) { console.warn('[vendors/sync] SAP supplier count capped at 5000'); break; }
    }

    const eligible = allSuppliers.filter((s) => !EXCLUDED_GROUP_CODES.has(s.GroupCode));
    console.log(`[vendors/sync] Phase 1: ${allSuppliers.length} total SAP suppliers → ${eligible.length} eligible`);

    // Phase 2: Enrich every eligible vendor with U_ERP_Group via individual record
    // fetches in parallel batches. This bypasses the 500-row server-side cap.
    const cardCodes = eligible.map((s) => s.CardCode);
    const udfMap = await enrichWithUdfGroups(cardCodes, sessionId);

    const result: SapVendorRecord[] = eligible.map((s) => ({
      CardCode:    s.CardCode,
      CardName:    s.CardName,
      GroupCode:   s.GroupCode,
      U_ERP_Group: udfMap.get(s.CardCode) ?? null,
    }));

    const classified = result.filter((s) => VALID_VENDOR_TYPES.has((s.U_ERP_Group ?? '').trim()));
    console.log(`[vendors/sync] Phase 2: enriched ${result.length} vendors — ${classified.length} with valid U_ERP_Group`);

    return result;
  }
}


// ─── SAP test-run: fetch a small sample, verify UDF, upsert, report ────────
interface VendorTestResult {
  login:          boolean;
  sessionConflict: boolean;
  fetched:        number;           // raw BP records from SAP
  excluded:       number;           // filtered by GroupCode 105/106
  eligible:       number;           // after exclusion
  udfAvailable:   boolean;          // was U_ERP_Group present in the response?
  udfFieldName:   string;           // confirmed SAP field name (or "not found")
  upserted:       number;
  sample: Array<{
    cardCode:    string;
    cardName:    string;
    groupCode:   number;
    udfRaw:      string | null;     // raw value from SAP
    vendorType:  string | null;     // after mapping (R/P/M/I/V/E/B or null)
    excluded:    boolean;
    upsertedToDb: boolean;
  }>;
}

async function runVendorSapTest(_limit: number): Promise<VendorTestResult> {
  // ── 1. Shared session ─────────────────────────────────────────────────────
  let sessionId: string;
  try {
    sessionId = await getSharedSapSession();
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    if (isSapSessionConflict(msg)) {
      return {
        login: false, sessionConflict: true,
        fetched: 0, excluded: 0, eligible: 0,
        udfAvailable: false, udfFieldName: 'not_checked',
        upserted: 0, sample: [],
      };
    }
    throw err;
  }

  // ── 2. Get all CardCodes from our DB (avoids SAP's 500-row server-side cap) ──
  // SAP B1 Service Layer caps full-record OData results at 500 rows. The 14
  // classified vendors are V-codes (alphabetically late), so they fall beyond
  // that cut-off. Instead we enumerate our local vendor list and fetch each
  // record individually from SAP — parallel batches of 20 keep this fast.
  {
    const dbRows = await pool.query<{ sap_card_code: string; name: string }>(
      `SELECT sap_card_code, name FROM vendors
       WHERE sap_card_code IS NOT NULL AND sap_card_code != ''
       ORDER BY sap_card_code`,
    );
    const dbVendors = dbRows.rows;

    // ── 3. Verify U_ERP_Group availability with a single probe record ───────
    let udfAvailable = false;
    let udfFieldName = 'not found';
    if (dbVendors.length > 0) {
      const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');
      const probeResp = await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'GET', url: '', path: `/b1s/v1/BusinessPartners('${encodeURIComponent(dbVendors[0].sap_card_code)}')`,
      });
      if (probeResp.ok) {
        const bp = JSON.parse(probeResp.body);
        udfAvailable = 'U_ERP_Group' in bp;
        udfFieldName = udfAvailable ? 'U_ERP_Group' : 'not found';
      }
    }

    if (!udfAvailable) {
      console.log(`[vendors/test] U_ERP_Group not present in SAP response — stopping`);
      return {
        login: true, sessionConflict: false,
        fetched: dbVendors.length, excluded: 0, eligible: 0,
        udfAvailable: false, udfFieldName,
        upserted: 0, sample: [],
      };
    }

    // ── 4. Enrich all DB vendors with U_ERP_Group in parallel batches ───────
    const cardCodes = dbVendors.map((r) => r.sap_card_code);
    const udfMap = await enrichWithUdfGroups(cardCodes, sessionId);

    // ── 5. Filter: only those with U_ERP_Group set (mirrors SAP SQL WHERE IS NOT NULL)
    const classified: VendorTestResult['sample'] = [];
    for (const v of dbVendors) {
      const udfRaw = udfMap.get(v.sap_card_code) ?? null;
      if (!udfRaw) continue;
      const vendorType = VALID_VENDOR_TYPES.has(udfRaw) ? udfRaw : null;
      classified.push({
        cardCode:     v.sap_card_code,
        cardName:     v.name,
        groupCode:    0,
        udfRaw,
        vendorType,
        excluded:     false,
        upsertedToDb: false,
      });
    }

    // ── 6. Upsert classified vendors to DB ───────────────────────────────────
    let upserted = 0;
    if (classified.length > 0) {
      const codes  = classified.map((r) => r.cardCode);
      const names  = classified.map((r) => r.cardName);
      const vtypes = classified.map((r) => r.vendorType);

      const res = await pool.query(
        `UPDATE vendors SET vendor_type = t.vt, updated_at = NOW()
         FROM unnest($1::varchar[], $2::varchar[]) AS t(sap_code, vt)
         WHERE vendors.sap_card_code = t.sap_code`,
        [codes, vtypes],
      );
      upserted = res.rowCount ?? 0;
      const upsertedSet = new Set(codes);
      for (const r of classified) { if (upsertedSet.has(r.cardCode)) r.upsertedToDb = true; }
    }

    console.log(`[vendors/test] dbVendors=${dbVendors.length}, classifiedFound=${classified.length}, udfAvailable=${udfAvailable}, upserted=${upserted}`);

    return {
      login:           true,
      sessionConflict: false,
      fetched:         dbVendors.length,  // total vendors checked
      excluded:        0,
      eligible:        classified.length, // vendors with U_ERP_Group IS NOT NULL
      udfAvailable,
      udfFieldName,
      upserted,
      sample:          classified,
    };
  }
}

// ─── SAP U_ERP_Group distribution query ────────────────────────────────────
const UDF_CODE_LABELS: Record<string, string> = {
  R: 'Raw Materials', P: 'Pumps Blowers', M: 'Motors',
  I: 'Instruments',  V: 'Valves',        E: 'Electrical Control', B: 'Packages',
};

interface UdfGroupResult {
  code:        string;       // e.g. 'R'
  label:       string;       // e.g. 'Raw Materials'
  count:       number;       // vendors with this code (capped at 200 per group)
  capped:      boolean;      // true if SAP returned exactly 200 (may be more)
  samples:     Array<{ cardCode: string; cardName: string; udfRaw: string }>;
}
interface UdfDistributionResult {
  login:          boolean;
  sessionConflict: boolean;
  totalClassified: number;
  nullOrEmpty:    number;    // vendors with blank / null U_ERP_Group
  groups:         UdfGroupResult[];
  queryError:     string | null;  // set if UDF $filter is unsupported in this SAP version
}

async function runUdfDistributionQuery(): Promise<UdfDistributionResult> {
  const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');

  // Use shared session — avoids -1102 login collision between operations
  let sessionId: string;
  try {
    sessionId = await getSharedSapSession();
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (isSapSessionConflict(msg)) {
      return { login: false, sessionConflict: true, totalClassified: 0, nullOrEmpty: 0, groups: [], queryError: null };
    }
    throw err;
  }

  // SAP B1 Service Layer does NOT support UDF fields in OData $filter — attempts
  // to filter by U_ERP_Group cause an internal "Switch company error -1102".
  // Strategy: fetch vendors in small pages WITHOUT $select (so UDFs are present
  // in the response), then group by U_ERP_Group in memory.
  const PAGE_SIZE   = 20;
  const MAX_RECORDS = 300;  // 15 pages — fast enough, wide enough sample

  {
    const allRows: Array<{
      cardCode: string; cardName: string;
      groupCode: number; udfRaw: string | null;
    }> = [];
    let skip = 0;

    while (allRows.length < MAX_RECORDS) {
      const qs = new URLSearchParams({
        '$filter': "CardType eq 'cSupplier'",
        '$top':    String(PAGE_SIZE),
        '$skip':   String(skip),
      }).toString();

      const resp = await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'GET', url: '', path: `/b1s/v1/BusinessPartners?${qs}`,
      });

      if (!resp.ok) {
        const body = resp.body?.substring(0, 400) ?? '';
        if (isSapSessionConflict(body)) {
          invalidateSharedSapSession();
          return { login: true, sessionConflict: true, totalClassified: 0, nullOrEmpty: 0, groups: [], queryError: null };
        }
        throw new Error(`SAP ${resp.statusCode}: ${body}`);
      }

      const page: any[] = JSON.parse(resp.body).value ?? [];
      for (const bp of page) {
        allRows.push({
          cardCode:  String(bp.CardCode  ?? ''),
          cardName:  String(bp.CardName  ?? ''),
          groupCode: Number(bp.GroupCode ?? 0),
          udfRaw:    typeof bp['U_ERP_Group'] !== 'undefined' ? (bp['U_ERP_Group'] ?? null) : undefined as any,
        });
      }
      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    // UDF availability: check if U_ERP_Group key was present in ANY record
    const udfPresent = allRows.some((r) => r.udfRaw !== (undefined as any));

    // Exclude employees (GroupCode 105/106)
    const eligible = allRows.filter((r) => !EXCLUDED_GROUP_CODES.has(r.groupCode));

    // Group by U_ERP_Group code in memory
    const byCode = new Map<string, typeof eligible>();
    for (const r of eligible) {
      const raw = (r.udfRaw ?? '').trim();
      const key = VALID_VENDOR_TYPES.has(raw) ? raw : '__null__';
      if (!byCode.has(key)) byCode.set(key, []);
      byCode.get(key)!.push(r);
    }

    const CODES = ['R', 'P', 'M', 'I', 'V', 'E', 'B'] as const;
    const groups: UdfGroupResult[] = CODES.map((code) => {
      const members = byCode.get(code) ?? [];
      return {
        code,
        label:   UDF_CODE_LABELS[code],
        count:   members.length,
        capped:  false,   // counts are from this sample window, not all-time
        samples: members.slice(0, 3).map((r) => ({
          cardCode: r.cardCode,
          cardName: r.cardName,
          udfRaw:   r.udfRaw ?? '',
        })),
      };
    });

    const totalClassified = groups.reduce((s, g) => s + g.count, 0);
    const nullOrEmpty     = (byCode.get('__null__') ?? []).length;

    console.log(`[vendors/udf-dist] sampled=${allRows.length} total (excl=${allRows.length - eligible.length}), classified=${totalClassified}, null/empty=${nullOrEmpty}, udfPresent=${udfPresent}`);

    return {
      login:           true,
      sessionConflict: false,
      totalClassified,
      nullOrEmpty,
      groups,
      queryError:      udfPresent ? null : 'U_ERP_Group field not present in SAP response for this sample — UDF may not be configured',
      sampledTotal:    allRows.length,
    } as any;
  }
}

// ─── Vendor list endpoint ──────────────────────────────────────────────────
export function setupProcurementRoutes(app: Router) {
  // ==================== VENDORS MANAGEMENT ====================

  /**
   * POST /api/vendors/sap/udf-distribution
   * Runs 7 SAP filter queries (one per valid U_ERP_Group code) + 1 null/empty query.
   * Returns count, capped flag, and 3 sample vendors per code.
   * Does NOT upsert to DB. Does NOT run full sync.
   */
  app.post('/api/vendors/sap/udf-distribution', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await runUdfDistributionQuery();
      if (result.sessionConflict) {
        return res.status(503).json({
          error: 'A previous SAP session is still active. Wait 1–2 minutes and try again.',
          result,
        });
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[vendors/udf-dist] Error:', err?.message);
      res.status(502).json({ error: `UDF distribution query failed: ${err?.message ?? 'unknown error'}` });
    }
  });

  /**
   * POST /api/vendors/sync/test
   * Lightweight SAP test run — fetches a small sample (default 20), verifies
   * session, U_ERP_Group UDF availability, exclusion logic, and upserts the sample.
   * Returns detailed per-row results. Does NOT run the full sync.
   */
  app.post('/api/vendors/sync/test', ensureAuthenticated, async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 20);
    try {
      const result = await runVendorSapTest(limit);
      if (result.sessionConflict) {
        return res.status(503).json({
          error: 'A previous sync session is still active in SAP B1. Wait 1–2 minutes for it to expire, then try again.',
          testResult: result,
        });
      }
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[vendors/test] Error:', err?.message);
      res.status(502).json({ error: `Test run failed: ${err?.message ?? 'unknown error'}` });
    }
  });

  /**
   * GET /api/vendors — reads local DB only. No SAP call.
   * Use POST /api/vendors/sync to pull fresh data from SAP.
   */
  app.get('/api/vendors', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, name, display_name, email, phone, sap_card_code, vendor_type
         FROM vendors
         WHERE is_active = true
         ORDER BY name ASC`,
      );
      const list = result.rows.map((r: any) => ({
        id:            r.id,
        name:          r.name,
        display_name:  r.display_name ?? r.name,
        email:         r.email,
        phone:         r.phone,
        sap_card_code: r.sap_card_code,
        vendor_type:   r.vendor_type,
      }));
      res.status(200).json(list);
    } catch (error) {
      console.error('[vendors] Error fetching vendors:', error);
      res.status(500).json({ error: 'Failed to fetch vendors' });
    }
  });

  /**
   * POST /api/vendors/sync
   * Pulls all eligible suppliers from SAP B1 (excludes GroupCodes 105, 106),
   * reads U_ERP_Group UDF for vendor_type, upserts by sap_card_code.
   * Marks vendors no longer in SAP as inactive.
   */
  app.post('/api/vendors/sync', ensureAuthenticated, async (req: Request, res: Response) => {
    if (syncInProgress) {
      return res.status(409).json({ error: 'A sync is already in progress. Please wait for it to finish.' });
    }
    syncInProgress = true;
    const client = await pool.connect();
    try {
      const suppliers = await fetchSapVendors();
      if (suppliers.length === 0) {
        return res.status(200).json({ synced: 0, deactivated: 0, message: 'SAP returned no eligible suppliers' });
      }

      // Build arrays for batch upsert
      const valid = suppliers
        .map((s) => ({
          code:        s.CardCode?.trim(),
          name:        (s.CardName?.trim() || s.CardCode?.trim()),
          vendorType:  VALID_VENDOR_TYPES.has(s.U_ERP_Group?.trim() ?? '') ? (s.U_ERP_Group!.trim()) : null,
        }))
        .filter((s) => !!s.code);

      if (valid.length > 0) {
        const codes       = valid.map((s) => s.code);
        const names       = valid.map((s) => s.name);
        const vendorTypes = valid.map((s) => s.vendorType);

        // Batch upsert via unnest — upserts name, display_name, vendor_type, is_active
        await client.query(
          `INSERT INTO vendors (name, display_name, is_active, sap_card_code, vendor_type, created_at, updated_at)
           SELECT DISTINCT ON (sap_code) n, n, true, sap_code, vt, NOW(), NOW()
           FROM unnest($1::text[], $2::varchar[], $3::varchar[]) AS t(n, sap_code, vt)
           ON CONFLICT (sap_card_code)
           DO UPDATE SET
             name         = EXCLUDED.name,
             display_name = EXCLUDED.name,
             vendor_type  = EXCLUDED.vendor_type,
             is_active    = true,
             updated_at   = NOW()`,
          [names, codes, vendorTypes],
        );
      }

      // Deactivate vendors no longer in SAP
      const sapCodes = suppliers.map((s) => s.CardCode?.trim()).filter(Boolean);
      const deactResult = await client.query(
        `UPDATE vendors SET is_active = false, updated_at = NOW()
         WHERE sap_card_code IS NOT NULL
           AND sap_card_code <> ALL($1::varchar[])
         RETURNING id`,
        [sapCodes],
      );

      console.log(`✅ [vendors/sync] upserted=${valid.length}, deactivated=${deactResult.rowCount}`);
      res.status(200).json({
        synced:      valid.length,
        deactivated: deactResult.rowCount ?? 0,
        message:     `Synced ${valid.length} vendors from SAP`,
      });
    } catch (err: any) {
      const msg: string = err?.message || 'unknown error';
      console.error('[vendors/sync] SAP sync error:', msg);
      const isConflict = msg.includes('SAP_SESSION_CONFLICT');
      const userMsg = isConflict
        ? msg.replace('SAP_SESSION_CONFLICT: ', '')
        : `SAP sync failed: ${msg}`;
      res.status(isConflict ? 503 : 502).json({ error: userMsg });
    } finally {
      syncInProgress = false;
      client.release();
    }
  });
  
  // ─── Vendor Discovery: fetch all SAP supplier groups (no DB changes) ──────
  /**
   * GET /api/vendors/discover-sap-groups
   * Fetches every cSupplier from SAP B1 with GroupCode, joins with
   * BusinessPartnerGroups for GroupName, returns unique groups + counts.
   * No local DB changes. Manager-only.
   */
  app.get('/api/vendors/discover-sap-groups', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!['Superuser', 'GM', 'SM', 'General Manager', 'Senior Manager'].includes(user?.role)) {
        return res.status(403).json({ error: 'Manager access required' });
      }

      const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');
      const sapUser = process.env.SAP_USERNAME || '';
      const sapPass = process.env.SAP_PASSWORD || '';
      const sapDb   = process.env.SAP_COMPANY_DB || '';
      if (!sapUser || !sapPass || !sapDb) {
        return res.status(503).json({ error: 'SAP credentials not configured' });
      }

      const { sessionId } = await sapHttpsClient.login(sapUser, sapPass, sapDb);

      // ── 1. Fetch all BusinessPartnerGroups (code→name map) ───────────────
      const grpResp = await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'GET',
        path: `/b1s/v1/BusinessPartnerGroups?$select=Code,Name&$top=200`,
      });
      const grpData  = grpResp.ok ? JSON.parse(grpResp.body) : { value: [] };
      const groupMap: Record<number, string> = {};
      for (const g of (grpData.value || [])) {
        groupMap[g.Code] = g.Name;
      }

      // ── 2. Paginate all cSupplier BusinessPartners with GroupCode ─────────
      const PAGE_SIZE = 20;
      const allSuppliers: Array<{ CardCode: string; CardName: string; GroupCode: number }> = [];
      let skip = 0;
      while (true) {
        const qs = new URLSearchParams({
          '$filter': "CardType eq 'cSupplier'",
          '$select': 'CardCode,CardName,GroupCode',
          '$top':  String(PAGE_SIZE),
          '$skip': String(skip),
        }).toString();
        const resp = await sapHttpsClient.authenticatedRequest(sessionId, {
          method: 'GET',
          path: `/b1s/v1/BusinessPartners?${qs}`,
        });
        if (!resp.ok) break;
        const page = JSON.parse(resp.body).value || [];
        allSuppliers.push(...page);
        if (page.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
        if (allSuppliers.length >= 2000) break;
      }

      // ── 3. Logout ─────────────────────────────────────────────────────────
      await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'POST', path: '/b1s/v1/Logout',
      }).catch(() => {});

      // ── 4. Aggregate groups ───────────────────────────────────────────────
      const groupCounts: Record<string, { groupCode: number; groupName: string; count: number; sampleVendors: string[] }> = {};
      for (const s of allSuppliers) {
        const code = s.GroupCode ?? -1;
        const name = groupMap[code] ?? `GroupCode_${code}`;
        const key  = String(code);
        if (!groupCounts[key]) {
          groupCounts[key] = { groupCode: code, groupName: name, count: 0, sampleVendors: [] };
        }
        groupCounts[key].count++;
        if (groupCounts[key].sampleVendors.length < 3) {
          groupCounts[key].sampleVendors.push(`${s.CardCode} — ${s.CardName}`);
        }
      }

      const groups = Object.values(groupCounts).sort((a, b) => b.count - a.count);

      console.log(`[vendor-discovery] SAP returned ${allSuppliers.length} suppliers across ${groups.length} groups:`);
      for (const g of groups) {
        console.log(`  GroupCode=${g.groupCode}  GroupName="${g.groupName}"  count=${g.count}`);
      }

      res.json({
        totalSapSuppliers: allSuppliers.length,
        totalGroups: groups.length,
        groups,
      });
    } catch (err: any) {
      console.error('[vendor-discovery] Error:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Discovery failed' });
    }
  });

  // ==================== PURCHASE ORDERS ====================
  
  /**
   * Get all purchase orders
   */
  app.get('/api/procurement/purchase-orders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const client = await pool.connect();
      try {
        // Get purchase orders with project and vendor information
        const result = await client.query(`
          SELECT 
            po.id, 
            po.purchase_order_number, 
            po.title,
            po.project_id,
            po.project_code,
            po.vendor_id,
            po.status,
            po.total_amount,
            po.required_by_date,
            po.currency,
            v.name as vendor_name,
            p.name as project_name
          FROM 
            purchase_orders po
          LEFT JOIN
            projects p ON po.project_id = p.id
          LEFT JOIN
            vendors v ON po.vendor_id = v.id
          ORDER BY 
            po.created_at DESC
        `);
        
        const purchaseOrders = result.rows;
        
        // Get counts of items and first item description for each purchase order
        if (purchaseOrders.length > 0) {
          const poIds = purchaseOrders.map(po => po.id);
          
          // Get item counts
          const itemCountsResult = await client.query(`
            SELECT 
              purchase_order_id, 
              COUNT(*) as item_count
            FROM 
              purchase_order_items
            WHERE 
              purchase_order_id = ANY($1)
            GROUP BY 
              purchase_order_id
          `, [poIds]);
          
          // Create a map of PO ID to item count
          const itemCountMap = new Map();
          itemCountsResult.rows.forEach(row => {
            itemCountMap.set(row.purchase_order_id, parseInt(row.item_count));
          });
          
          // Get items for each purchase order
          const itemsResult = await client.query(`
            SELECT 
              poi.purchase_order_id, 
              poi.item_code, 
              poi.description, 
              poi.quantity, 
              poi.unit,
              poi.status,
              ROW_NUMBER() OVER (PARTITION BY poi.purchase_order_id ORDER BY poi.id) as row_num
            FROM 
              purchase_order_items poi
            WHERE 
              poi.purchase_order_id = ANY($1)
          `, [poIds]);
          
          // Group items by purchase order ID
          const poItemsMap = new Map();
          itemsResult.rows.forEach(item => {
            if (!poItemsMap.has(item.purchase_order_id)) {
              poItemsMap.set(item.purchase_order_id, []);
            }
            poItemsMap.get(item.purchase_order_id).push(item);
          });
          
          // Add item count and items to each purchase order
          purchaseOrders.forEach(po => {
            po.itemCount = itemCountMap.get(po.id) || 0;
            po.items = poItemsMap.get(po.id) || [];
          });
        }
        
        return res.status(200).json(purchaseOrders);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
  });
  
  /**
   * Get a specific purchase order by ID with its items
   */
  app.get('/api/procurement/purchase-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const purchaseOrderId = parseInt(req.params.id);
      
      if (isNaN(purchaseOrderId)) {
        return res.status(400).json({ error: 'Invalid purchase order ID' });
      }
      
      const client = await pool.connect();
      try {
        // Get the purchase order details
        const poResult = await client.query(`
          SELECT 
            po.*,
            v.name as vendor_name,
            p.name as project_name
          FROM 
            purchase_orders po
          LEFT JOIN
            projects p ON po.project_id = p.id
          LEFT JOIN
            vendors v ON po.vendor_id = v.id
          WHERE 
            po.id = $1
        `, [purchaseOrderId]);
        
        if (poResult.rows.length === 0) {
          return res.status(404).json({ error: 'Purchase order not found' });
        }
        
        const purchaseOrder = poResult.rows[0];
        
        // Get the purchase order items
        const itemsResult = await client.query(`
          SELECT 
            poi.id, 
            poi.purchase_order_id, 
            poi.item_code, 
            poi.description, 
            poi.quantity, 
            poi.unit as uom, 
            poi.status,
            poi.created_at, 
            poi.updated_at,
            mi.drawing_no
          FROM 
            purchase_order_items poi
          LEFT JOIN
            master_items mi ON poi.item_code = mi.item_code
          WHERE 
            poi.purchase_order_id = $1
          ORDER BY 
            poi.id
        `, [purchaseOrderId]);
        
        // Add items to the purchase order
        purchaseOrder.items = itemsResult.rows;
        
        return res.status(200).json(purchaseOrder);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      res.status(500).json({ error: 'Failed to fetch purchase order' });
    }
  });
  
  /**
   * Preview purchase orders for a project
   * This endpoint identifies all "Buy" items in a project and prepares them for purchase order generation
   */
  app.get('/api/procurement/purchase-orders/preview/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('Processing purchase order preview request for project ID:', req.params.projectId);
      
      // Validate projectId parameter
      const projectId = parseInt(req.params.projectId);
      
      // Check if project ID is valid
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Step 1: Get project details
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Step 2: Run a direct SQL query to get all buy items for this project
      const client = await pool.connect();
      try {
        // Get all buy items for this project
        const buyItemsResult = await client.query(`
          SELECT 
            pi.id as project_item_id, 
            pi.quantity, 
            mi.id as master_item_id,
            mi.item_code, 
            mi.description, 
            mi.unit, 
            mi.uom,
            mi.make_or_buy,
            mi.preferred_vendor_id, 
            mi.estimated_cost
          FROM 
            project_items pi
          JOIN 
            master_items mi ON pi.item_id = mi.id
          WHERE 
            pi.project_id = $1
            AND mi.make_or_buy = 'Buy'
        `, [projectId]);
        
        const buyItems = buyItemsResult.rows;
        console.log(`Found ${buyItems.length} buy items for project ${project.code}`);
        
        if (buyItems.length === 0) {
          return res.status(200).json({ 
            message: 'No "Buy" items found for this project',
            project: {
              id: project.id,
              code: project.code,
              name: project.name
            },
            itemCount: 0,
            items: []
          });
        }
        
        // Step 3: Get existing purchase orders for this project
        const existingPOsResult = await client.query(`
          SELECT id, purchase_order_number, vendor_id 
          FROM purchase_orders 
          WHERE project_id = $1
        `, [projectId]);
        
        const existingPOs = existingPOsResult.rows;
        
        // Get existing PO items
        let existingPOItems = [];
        if (existingPOs.length > 0) {
          const existingPOIds = existingPOs.map(po => po.id);
          const existingPOItemsResult = await client.query(`
            SELECT id, purchase_order_id, project_item_id 
            FROM purchase_order_items 
            WHERE purchase_order_id = ANY($1)
          `, [existingPOIds]);
          
          existingPOItems = existingPOItemsResult.rows;
        }
        
        // Extract project item IDs that already have purchase orders
        const existingItemIds = new Set();
        for (const item of existingPOItems) {
          if (item.project_item_id) {
            existingItemIds.add(item.project_item_id);
          }
        }
        
        // Filter out items that already have purchase orders
        const availableBuyItems = buyItems.filter(item => 
          !existingItemIds.has(item.project_item_id)
        );
        
        if (availableBuyItems.length === 0) {
          return res.status(200).json({ 
            message: 'All "Buy" items already have purchase orders',
            project: {
              id: project.id,
              code: project.code,
              name: project.name
            },
            itemCount: 0,
            existingPurchaseOrderCount: existingPOs.length,
            items: []
          });
        }
        
        // Step 4: Get vendor information
        const vendorIds = availableBuyItems
          .map(item => item.preferred_vendor_id)
          .filter(id => id != null && id > 0);
        
        let vendorsList = [];
        if (vendorIds.length > 0) {
          const vendorsResult = await client.query(`
            SELECT id, name, contact_person, email, phone
            FROM vendors
            WHERE id = ANY($1)
          `, [vendorIds]);
          
          vendorsList = vendorsResult.rows;
        }
        
        // Create vendor map for quick lookup
        const vendorsMap = new Map();
        vendorsList.forEach(vendor => {
          vendorsMap.set(vendor.id, vendor);
        });
        
        // Format items for the frontend
        const previewItems = availableBuyItems.map(item => {
          const vendorId = item.preferred_vendor_id;
          const vendor = vendorId ? vendorsMap.get(vendorId) : null;
          
          return {
            id: item.project_item_id,
            itemCode: item.item_code || 'Unknown',
            description: item.description || 'Unknown Item',
            quantity: Number(item.quantity || 0),
            uom: item.uom || item.unit || 'EA',
            vendorId: vendorId,
            vendorName: vendor ? vendor.name : 'Unassigned',
            estimatedCost: item.estimated_cost ? Number(item.estimated_cost) : 0
          };
        });
        
        // Return preview data
        return res.status(200).json({
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: previewItems.length,
          items: previewItems,
          existingPurchaseOrderCount: existingPOs.length
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error previewing purchase orders:', error);
      res.status(500).json({ error: 'Failed to preview purchase orders' });
    }
  });
  
  /**
   * Generate purchase orders for a project
   * Creates purchase orders based on "Buy" items in the project
   */
  app.post('/api/procurement/purchase-orders/generate-for-project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { confirm, vendorAssignments } = req.body;
      const user = req.user!;
      
      // Check if project ID is valid
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Check for confirmation flag
      if (!confirm) {
        return res.status(400).json({ 
          requiresConfirmation: true,
          message: 'Please confirm to generate purchase orders'
        });
      }
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Step 1: Get project to ensure it exists
        const projectResult = await client.query(`
          SELECT id, code, name FROM projects WHERE id = $1
        `, [projectId]);
        
        if (projectResult.rows.length === 0) {
          return res.status(404).json({ error: 'Project not found' });
        }
        
        const project = projectResult.rows[0];
        
        // Step 2: Get all buy items for this project
        const buyItemsResult = await client.query(`
          SELECT 
            pi.id as project_item_id, 
            pi.quantity, 
            mi.id as master_item_id,
            mi.item_code, 
            mi.description, 
            mi.unit, 
            mi.uom,
            mi.make_or_buy,
            mi.preferred_vendor_id, 
            mi.estimated_cost
          FROM 
            project_items pi
          JOIN 
            master_items mi ON pi.item_id = mi.id
          WHERE 
            pi.project_id = $1
            AND mi.make_or_buy = 'Buy'
        `, [projectId]);
        
        const buyItems = buyItemsResult.rows;
        
        if (buyItems.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'No "Buy" items found for this project' });
        }
        
        // Step 3: Get existing purchase orders for this project
        const existingPOsResult = await client.query(`
          SELECT id, purchase_order_number, vendor_id 
          FROM purchase_orders 
          WHERE project_id = $1
        `, [projectId]);
        
        const existingPOs = existingPOsResult.rows;
        
        // Get existing PO items
        let existingPOItems = [];
        if (existingPOs.length > 0) {
          const existingPOIds = existingPOs.map(po => po.id);
          const existingPOItemsResult = await client.query(`
            SELECT id, purchase_order_id, project_item_id 
            FROM purchase_order_items 
            WHERE purchase_order_id = ANY($1)
          `, [existingPOIds]);
          
          existingPOItems = existingPOItemsResult.rows;
        }
        
        // Extract project item IDs that already have purchase orders
        const existingItemIds = new Set();
        for (const item of existingPOItems) {
          if (item.project_item_id) {
            existingItemIds.add(item.project_item_id);
          }
        }
        
        // Filter out items that already have purchase orders
        const availableBuyItems = buyItems.filter(item => 
          !existingItemIds.has(item.project_item_id)
        );
        
        if (availableBuyItems.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'All "Buy" items already have purchase orders' });
        }
        
        // Get next PO sequence number
        let nextPOSequence = 1;
        
        if (existingPOs.length > 0) {
          // Find the highest sequence number from existing purchase orders
          const poSequences = existingPOs.map(po => {
            const parts = po.purchase_order_number.split('-');
            return parseInt(parts[parts.length - 1]);
          });
          
          nextPOSequence = Math.max(...poSequences) + 1;
        }
        
        // Create one purchase order per item instead of grouping by vendor
        const itemsByIndividual: Record<number, any[]> = {};
        
        // Assign each item to its own "group" with a unique ID
        availableBuyItems.forEach((item, index) => {
          // Use negative numbers as keys to avoid collisions with real vendor IDs
          const uniqueKey = -(index + 1);
          
          // Each item gets its own "group"
          itemsByIndividual[uniqueKey] = [item];
          
          // Store the vendor ID information for later use
          if (vendorAssignments && vendorAssignments[item.project_item_id]) {
            // If vendor assignment is provided, use it
            item.vendorId = parseInt(vendorAssignments[item.project_item_id] as string);
          } else {
            // Otherwise use preferred vendor
            item.vendorId = item.preferred_vendor_id || 0;
          }
        });
        
        // Replace the itemsByVendor with our individual item groups
        const itemsByVendor = itemsByIndividual;
        
        // Get vendors information
        const vendorIds = Object.keys(itemsByVendor)
          .map(key => parseInt(key))
          .filter(id => id > 0);
        
        let vendorsList = [];
        if (vendorIds.length > 0) {
          const vendorsResult = await client.query(`
            SELECT id, name, contact_person, email, phone
            FROM vendors
            WHERE id = ANY($1)
          `, [vendorIds]);
          
          vendorsList = vendorsResult.rows;
        }
        
        // Create vendor map for quick lookup
        const vendorsMap = new Map();
        vendorsList.forEach(vendor => {
          vendorsMap.set(vendor.id, vendor);
        });
        
        // Create purchase orders for each vendor group
        const createdPOs = [];
        
        // Get current financial year
        const currentDate = new Date();
        const financialYearStart = new Date(currentDate.getFullYear(), 3, 1); // April 1
        let financialYear: string;
        
        if (currentDate < financialYearStart) {
          // Current date is between Jan-Mar, so FY is previous year to current year
          financialYear = `${currentDate.getFullYear() - 1}-${currentDate.getFullYear().toString().slice(-2)}`;
        } else {
          // Current date is between Apr-Dec, so FY is current year to next year
          financialYear = `${currentDate.getFullYear()}-${(currentDate.getFullYear() + 1).toString().slice(-2)}`;
        }
        
        for (const [vendorIdStr, items] of Object.entries(itemsByVendor)) {
          const groupId = parseInt(vendorIdStr);
          
          if (items.length === 0) continue;
          
          // Get the first (and only) item in this group
          const item = items[0];
          
          // Use the stored vendorId from the item
          const vendorId = item.vendorId || 0;
          
          const { assertProjectCode } = await import('./epc-guardrails');
          assertProjectCode(project.code, 'procurement-routes.generate-purchase-orders');
          const poNumber = `PO-${project.code}-${nextPOSequence}`;
          
          // Create purchase order
          const today = new Date();
          const requiredDate = new Date();
          requiredDate.setDate(today.getDate() + 30); // Default delivery in 30 days
          
          // Create purchase order
          const poResult = await client.query(`
            INSERT INTO purchase_orders (
              project_id, vendor_id, purchase_order_number, title, notes, 
              status, priority, requested_date, required_by_date, created_by, 
              created_at, updated_at, project_code, currency, total_amount
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12, $13
            ) RETURNING id, purchase_order_number, vendor_id
          `, [
            projectId,
            vendorId > 0 ? vendorId : null,
            poNumber,
            `Materials for ${project.name}`,
            `Purchase order for ${project.code} project materials`,
            'draft',
            'Medium',
            today,
            requiredDate,
            user.id,
            project.code,
            'INR',
            '0.00'
          ]);
          
          const purchaseOrder = poResult.rows[0];
          
          // Create purchase order items
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const unitPrice = item.estimated_cost || 0;
            const quantity = Number(item.quantity || 0);
            const totalPrice = Number(unitPrice) * quantity;
            
            await client.query(`
              INSERT INTO purchase_order_items (
                purchase_order_id, project_item_id, item_id, description, 
                quantity, unit, unit_price, total_price, delivery_status, 
                line_number, created_at, updated_at, item_code
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11
              )
            `, [
              purchaseOrder.id,
              item.project_item_id,
              item.master_item_id,
              item.description || 'Unknown Item',
              quantity.toString(),
              item.uom || item.unit || 'EA', /* Use uom first, fall back to unit */
              unitPrice.toString(),
              totalPrice.toString(),
              'pending',
              i + 1,
              item.item_code || 'UNKNOWN-ITEM'
            ]);
          }
          
          // Create purchase order history entry
          await client.query(`
            INSERT INTO purchase_order_history (
              purchase_order_id, status, comments, changed_by, changed_at
            ) VALUES (
              $1, $2, $3, $4, NOW()
            )
          `, [
            purchaseOrder.id,
            'draft',
            'Purchase order generated from project items',
            user.id
          ]);
          
          createdPOs.push({
            id: purchaseOrder.id,
            purchaseOrderNumber: purchaseOrder.purchase_order_number,
            vendorId: purchaseOrder.vendor_id,
            vendorName: vendorId > 0 ? vendorsMap.get(vendorId)?.name || 'Unknown Vendor' : 'Unassigned',
            itemCount: items.length,
            itemDescription: item.description || 'Unknown Item'
          });
          
          nextPOSequence++;
        }
        
        await client.query('COMMIT');
        
        // Set explicit content-type and ensure we're sending valid JSON
        res.setHeader('Content-Type', 'application/json');
        res.status(201).send(JSON.stringify({
          success: true,
          message: `Successfully created ${createdPOs.length} purchase orders (one per item)`,
          purchaseOrders: createdPOs
        }));
      } catch (error) {
        console.error('Transaction error:', error);
        await client.query('ROLLBACK');
        // Handle the error here instead of re-throwing
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).send(JSON.stringify({ 
          error: 'Failed to generate purchase orders', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error generating purchase orders:', error);
      // Only reaches here if an error occurs before the transaction begins
      res.setHeader('Content-Type', 'application/json');
      res.status(500).send(JSON.stringify({ 
        error: 'Failed to generate purchase orders',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  });
  
  // Delete a purchase order
  app.delete('/api/procurement/purchase-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const purchaseOrderId = parseInt(req.params.id);
      
      if (isNaN(purchaseOrderId)) {
        return res.status(400).json({ error: 'Invalid purchase order ID' });
      }
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // First check if purchase order exists
        const poResult = await client.query(`
          SELECT id, status FROM purchase_orders WHERE id = $1
        `, [purchaseOrderId]);
        
        if (poResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Purchase order not found' });
        }
        
        // Delete the purchase order items first (due to foreign key constraint)
        await client.query(`
          DELETE FROM purchase_order_items WHERE purchase_order_id = $1
        `, [purchaseOrderId]);
        
        // Delete the purchase order history 
        await client.query(`
          DELETE FROM purchase_order_history WHERE purchase_order_id = $1
        `, [purchaseOrderId]);
        
        // Delete the purchase order
        await client.query(`
          DELETE FROM purchase_orders WHERE id = $1
        `, [purchaseOrderId]);
        
        await client.query('COMMIT');
        
        // Return a standard JSON response
        return res.status(200).json({ 
          success: true, 
          message: 'Purchase order deleted successfully' 
        });
      } catch (error) {
        console.error('Error deleting purchase order:', error);
        await client.query('ROLLBACK');
        return res.status(500).json({ 
          error: 'Failed to delete purchase order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in delete purchase order route:', error);
      return res.status(500).json({ 
        error: 'An unexpected error occurred',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Update a purchase order
  app.put('/api/procurement/purchase-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const purchaseOrderId = parseInt(req.params.id);
      const { 
        title, 
        notes, 
        vendor_id, 
        status, 
        priority, 
        required_by_date,
        tracking_number,
        actual_delivery_date,
        progress,
        items 
      } = req.body;
      
      if (isNaN(purchaseOrderId)) {
        return res.status(400).json({ error: 'Invalid purchase order ID' });
      }
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Check if purchase order exists
        const poResult = await client.query(`
          SELECT id FROM purchase_orders WHERE id = $1
        `, [purchaseOrderId]);
        
        if (poResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Purchase order not found' });
        }
        
        // Update the purchase order
        await client.query(`
          UPDATE purchase_orders
          SET 
            title = COALESCE($1, title),
            notes = COALESCE($2, notes),
            vendor_id = COALESCE($3, vendor_id),
            status = COALESCE($4, status),
            priority = COALESCE($5, priority),
            required_by_date = COALESCE($6, required_by_date),
            tracking_number = COALESCE($7, tracking_number),
            actual_delivery_date = COALESCE($8, actual_delivery_date),
            progress = COALESCE($9, progress),
            updated_at = NOW()
          WHERE id = $10
        `, [
          title, 
          notes,
          vendor_id, 
          status, 
          priority,
          required_by_date ? new Date(required_by_date) : null,
          tracking_number,
          actual_delivery_date ? new Date(actual_delivery_date) : null,
          progress,
          purchaseOrderId
        ]);
        
        // Handle purchase order items if provided
        if (Array.isArray(items)) {
          // First fetch existing items to compare
          const existingItemsResult = await client.query(`
            SELECT id, purchase_order_id, item_code, description, quantity, unit as uom, status
            FROM purchase_order_items
            WHERE purchase_order_id = $1
          `, [purchaseOrderId]);
          
          const existingItems = existingItemsResult.rows;
          const existingItemIds = existingItems.map(item => item.id);
          
          // Process each item in the request
          for (const item of items) {
            // Skip items with no item_code/description
            if ((!item.item_code && !item.code) || (!item.description && !item.name)) {
              console.log('Skipping empty item:', item);
              continue;
            }
            
            if (item.id && existingItemIds.includes(item.id)) {
              // Update existing item
              await client.query(`
                UPDATE purchase_order_items
                SET 
                  item_code = $1,
                  description = $2,
                  quantity = $3,
                  unit = $4, /* stored as unit in DB, but used as uom in client */
                  status = $5,
                  updated_at = NOW()
                WHERE id = $6 AND purchase_order_id = $7
              `, [
                item.item_code || item.code || '',
                item.description || item.name || '',
                item.quantity || 1,
                item.uom || item.unit || 'EA', /* Client sends as uom, DB stores as unit */
                item.status || 'pending',
                item.id,
                purchaseOrderId
              ]);
            } else if (!item.id || (typeof item.id === 'string' && item.id.startsWith('temp_'))) {
              // Insert new item
              await client.query(`
                INSERT INTO purchase_order_items (
                  purchase_order_id, item_code, description, quantity, unit /* stored as unit in DB, but used as uom in client */, status, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, NOW(), NOW()
                )
              `, [
                purchaseOrderId,
                item.item_code || item.code || '',
                item.description || item.name || '',
                item.quantity || 1,
                item.uom || item.unit || 'EA', /* Client sends as uom, DB stores as unit */
                item.status || 'pending'
              ]);
            }
          }
          
          // Get IDs from request
          const itemIdsToKeep = items
            .filter(item => item.id && !String(item.id).startsWith('temp_') && typeof item.id === 'number')
            .map(item => item.id);
          
          // Delete items that are no longer in the request
          if (itemIdsToKeep.length > 0) {
            await client.query(`
              DELETE FROM purchase_order_items 
              WHERE purchase_order_id = $1 AND id NOT IN (${itemIdsToKeep.join(',')})
            `, [purchaseOrderId]);
          } else if (items.length === 0) {
            // If empty array was sent, delete all items
            await client.query(`
              DELETE FROM purchase_order_items 
              WHERE purchase_order_id = $1
            `, [purchaseOrderId]);
          } else if (items.every(item => !item.id || (typeof item.id === 'string' && item.id.startsWith('temp_')))) {
            // If all items are new (have temp IDs), delete existing items
            await client.query(`
              DELETE FROM purchase_order_items 
              WHERE purchase_order_id = $1
            `, [purchaseOrderId]);
          }
        }
        
        // Add a history entry for the update
        await client.query(`
          INSERT INTO purchase_order_history (
            purchase_order_id, status, comments, changed_by, changed_at
          ) VALUES (
            $1, $2, $3, $4, NOW()
          )
        `, [
          purchaseOrderId,
          status || 'updated',
          'Purchase order updated',
          req.user!.id
        ]);
        
        await client.query('COMMIT');
        
        // Fetch the updated purchase order with items
        const updatedPoResult = await client.query(`
          SELECT po.*, v.name as vendor_name
          FROM purchase_orders po
          LEFT JOIN vendors v ON po.vendor_id = v.id
          WHERE po.id = $1
        `, [purchaseOrderId]);
        
        // Get purchase order items
        const itemsResult = await client.query(`
          SELECT id, purchase_order_id, item_code, description, quantity, unit as uom, status, 
                 created_at, updated_at
          FROM purchase_order_items
          WHERE purchase_order_id = $1
          ORDER BY id
        `, [purchaseOrderId]);
        
        const updatedPO = updatedPoResult.rows[0];
        updatedPO.items = itemsResult.rows;
        
        // Return a standard JSON response
        return res.status(200).json({
          success: true,
          message: 'Purchase order updated successfully',
          purchaseOrder: updatedPO
        });
      } catch (error) {
        console.error('Error updating purchase order:', error);
        await client.query('ROLLBACK');
        return res.status(500).json({ 
          error: 'Failed to update purchase order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in update purchase order route:', error);
      return res.status(500).json({ 
        error: 'An unexpected error occurred',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
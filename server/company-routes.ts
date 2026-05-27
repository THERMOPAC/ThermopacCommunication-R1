/**
 * Company Information Master — API Routes
 * Baseline: docs/company-information-master-baseline-v1.md
 * 23 routes under /api/company
 */

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { uploadFileToGCS, initializeGCS } from './utils/gcs-operations';
import {
  COMPANY_DOC_TYPES,
  COMPANY_ADDRESS_TYPES,
  ISO4217_ALLOWLIST,
} from '@shared/schema';

const router = Router();
router.use(ensureAuthenticated);

const BUCKET = process.env.GCS_BUCKET_NAME || 'thermopac_storage';
const TAG = '[company-routes]';

// ── Rate limiters ─────────────────────────────────────────────────────────────

const uploadLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
const brandingUploadLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const viewLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const activateLimiter = rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false });

// ── Multer ────────────────────────────────────────────────────────────────────

const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const brandingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

function zeroPad(n: number, w: number) { return String(n).padStart(w, '0'); }
function slugify(s: string) { return s.toLowerCase().replace(/_/g, '-'); }

function sanitizeFileName(raw: string): string {
  let s = raw.replace(/[/\\]/g, '').replace(/\.\./g, '');
  s = s.replace(/[^A-Za-z0-9._-]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const parts = s.split('.');
  if (parts.length > 1) {
    const ext = parts.pop()!.toLowerCase();
    s = parts.join('.') + '.' + ext;
  }
  return s.slice(0, 120) || 'file';
}

function mimeFromExt(ext: string): string {
  const m: Record<string, string> = { pdf: 'pdf', jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
  return m[ext.toLowerCase()] ?? ext.toLowerCase();
}

// MIME + magic-byte validation
const DOC_ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const IMG_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function checkMagicBytes(buf: Buffer, mime: string): boolean {
  const b = buf;
  if (mime === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (mime === 'image/jpeg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === 'image/webp') return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return false;
}

function validateIANATimezone(tz: string): boolean {
  try { return (Intl as any).supportedValuesOf('timeZone').includes(tz); } catch { return !!tz; }
}

function validateIso4217(code: string): boolean {
  return (ISO4217_ALLOWLIST as readonly string[]).includes(code);
}

// Role helpers
function isSuperuser(req: any) { return req.user?.role === 'Superuser'; }
function isAccountsHead(req: any) { return req.user?.role === 'Accounts Head'; }
function isAdminManager(req: any) { return req.user?.role === 'Manager' && req.user?.department === 'Administration'; }
function isSuperuserOrAccountsHead(req: any) { return isSuperuser(req) || isAccountsHead(req); }
function canUploadCompanyDocs(req: any) { return isSuperuser(req) || isAdminManager(req); }

function forbiddenErr(res: any, required: string[]) {
  return res.status(403).json({
    error: 'ROLE_FORBIDDEN',
    message: `This action requires ${required.join(' or ')} role.`,
    required,
    actual: res.req?.user?.role ?? 'unknown',
  });
}

// Audit log helper — runs inside caller's client/transaction
async function auditLog(client: any, companyId: number, action: string, tableName: string,
  fieldName: string | null, oldVal: any, newVal: any, changedBy: number | null, req: any) {
  await client.query(
    `INSERT INTO company_audit_log
       (company_id, action, table_name, field_name, old_value, new_value, changed_by, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [companyId, action, tableName, fieldName,
      oldVal != null ? String(oldVal) : null,
      newVal != null ? String(newVal) : null,
      changedBy,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    ],
  );
}

// Build full company payload
async function buildCompanyPayload(client: any, id: number) {
  const [master, legalTax, addresses, banks, erpCfg, branding, docs] = await Promise.all([
    client.query(`SELECT * FROM company_master WHERE id=$1`, [id]),
    client.query(`SELECT * FROM company_legal_tax WHERE company_id=$1`, [id]),
    client.query(`SELECT * FROM company_addresses WHERE company_id=$1 ORDER BY address_type`, [id]),
    client.query(`SELECT * FROM company_bank_accounts WHERE company_id=$1 ORDER BY is_primary DESC, id`, [id]),
    client.query(`SELECT * FROM company_erp_config WHERE company_id=$1`, [id]),
    client.query(`SELECT * FROM company_branding WHERE company_id=$1`, [id]),
    client.query(`SELECT * FROM company_documents WHERE company_id=$1 AND is_active=true ORDER BY doc_type`, [id]),
  ]);
  if (!master.rows.length) return null;
  return {
    ...master.rows[0],
    legalTax: legalTax.rows[0] ?? null,
    addresses: addresses.rows,
    bankAccounts: banks.rows,
    erpConfig: erpCfg.rows[0] ?? null,
    branding: branding.rows[0] ?? null,
    documents: docs.rows,
  };
}

// ── GET /api/company — list ───────────────────────────────────────────────────
router.get('/', async (req: any, res: any) => {
  try {
    const r = await pool.query(`SELECT id, company_code, short_name, is_active FROM company_master ORDER BY id`);
    res.json({ companies: r.rows });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── GET /api/company/active ───────────────────────────────────────────────────
router.get('/active', async (req: any, res: any) => {
  try {
    const r = await pool.query(`SELECT id FROM company_master WHERE is_active=true LIMIT 2`);
    if (r.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'No active company found.' });
    if (r.rows.length > 1) return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Multiple active companies detected.' });
    const payload = await buildCompanyPayload(pool, r.rows[0].id);
    res.json({ company: payload });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── GET /api/company/:id ──────────────────────────────────────────────────────
router.get('/:id(\\d+)', async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  try {
    const payload = await buildCompanyPayload(pool, id);
    if (!payload) return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' });
    res.json({ company: payload });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── POST /api/company — create (Superuser only) ───────────────────────────────
router.post('/', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const { companyCode, shortName, legalName, displayName, companyType, industry,
    fyStartMonth, baseCurrency, timezone } = req.body;
  const fields: Record<string, string> = {};
  if (!companyCode) fields.companyCode = 'Required.';
  if (!shortName) fields.shortName = 'Required.';
  if (!legalName) fields.legalName = 'Required.';
  if (!displayName) fields.displayName = 'Required.';
  if (timezone && !validateIANATimezone(timezone)) fields.timezone = 'Must be a valid IANA timezone identifier.';
  if (baseCurrency && !validateIso4217(baseCurrency)) fields.baseCurrency = 'Must be a valid ISO-4217 currency code.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Validation failed.', fields });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO company_master
         (company_code,short_name,legal_name,display_name,company_type,industry,
          fy_start_month,base_currency,timezone,is_active,version,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,1,$10) RETURNING *`,
      [companyCode, shortName, legalName, displayName, companyType ?? null, industry ?? null,
        fyStartMonth ?? 4, baseCurrency ?? 'INR', timezone ?? 'Asia/Kolkata', req.user?.id ?? null],
    );
    const co = r.rows[0];
    await client.query(`INSERT INTO company_legal_tax (company_id,version) VALUES ($1,1)`, [co.id]);
    await client.query(`INSERT INTO company_erp_config (company_id,decimal_precision,version) VALUES ($1,2,1)`, [co.id]);
    await client.query(`INSERT INTO company_branding (company_id,version) VALUES ($1,1)`, [co.id]);
    await auditLog(client, co.id, 'create', 'company_master', null, null, companyCode, req.user?.id ?? null, req);
    await client.query('COMMIT');
    res.status(201).json({ company: co });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'CONFLICT', message: 'Company code already exists.' });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  } finally { client.release(); }
});

// ── PATCH /api/company/:id/general (Superuser) ────────────────────────────────
router.patch('/:id(\\d+)/general', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const { shortName, legalName, displayName, companyType, industry, fyStartMonth,
    baseCurrency, timezone, version } = req.body;
  const fields: Record<string, string> = {};
  if (timezone && !validateIANATimezone(timezone)) fields.timezone = 'Must be a valid IANA timezone identifier.';
  if (baseCurrency && !validateIso4217(baseCurrency)) fields.baseCurrency = 'Must be a valid ISO-4217 currency code.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Validation failed.', fields });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM company_master WHERE id=$1`, [id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' }); }
    const now = cur.rows[0];
    if (version !== undefined && now.version !== version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' });
    }
    const r = await client.query(
      `UPDATE company_master SET
         short_name=COALESCE($1,short_name), legal_name=COALESCE($2,legal_name),
         display_name=COALESCE($3,display_name), company_type=COALESCE($4,company_type),
         industry=COALESCE($5,industry), fy_start_month=COALESCE($6,fy_start_month),
         base_currency=COALESCE($7,base_currency), timezone=COALESCE($8,timezone),
         version=version+1, updated_at=NOW()
       WHERE id=$9 AND version=$10 RETURNING *`,
      [shortName??null, legalName??null, displayName??null, companyType??null, industry??null,
        fyStartMonth??null, baseCurrency??null, timezone??null, id, now.version],
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' }); }
    // Audit changed fields
    const changedFields = ['shortName','legalName','displayName','companyType','industry','fyStartMonth','baseCurrency','timezone'];
    const dbCols: Record<string,string> = { shortName:'short_name',legalName:'legal_name',displayName:'display_name',companyType:'company_type',industry:'industry',fyStartMonth:'fy_start_month',baseCurrency:'base_currency',timezone:'timezone' };
    for (const f of changedFields) {
      const col = dbCols[f];
      if (req.body[f] !== undefined && String(now[col]) !== String(req.body[f])) {
        await auditLog(client, id, 'field_change', 'company_master', col, now[col], req.body[f], req.user?.id??null, req);
      }
    }
    await client.query('COMMIT');
    res.json({ company: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── PATCH /api/company/:id/legal-tax ─────────────────────────────────────────
router.patch('/:id(\\d+)/legal-tax', async (req: any, res: any) => {
  if (!isSuperuserOrAccountsHead(req)) return forbiddenErr(res, ['Superuser', 'Accounts Head']);
  const id = parseInt(req.params.id, 10);
  const body = req.body;
  const fields: Record<string, string> = {};

  // Validation
  if (body.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(body.pan)) fields.pan = 'PAN format invalid (e.g. ABCDE1234F).';
  if (body.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(body.gstin)) fields.gstin = 'GSTIN format invalid.';
  if (body.iec_code && !/^[0-9]{10}$/.test(body.iec_code)) fields.iec_code = 'IEC must be 10 digits.';
  if (body.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(body.ifsc)) fields.ifsc = 'IFSC format invalid.';
  if (body.cin && !/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(body.cin)) fields.cin = 'CIN format invalid.';
  if (body.tan && !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(body.tan)) fields.tan = 'TAN format invalid.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Validation failed.', fields });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM company_legal_tax WHERE company_id=$1`, [id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'Legal tax record not found.' }); }
    const now = cur.rows[0];
    if (body.version !== undefined && now.version !== body.version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' });
    }
    const cols = ['cin','pan','gstin','iec_code','iec_branch','lut_number','lut_validity_date','lut_financial_year',
      'msme_udyam','tan','pf_number','esi_number','gst_registration_type','gst_state_code','export_without_gst',
      'ad_code','authorized_dealer_bank'];
    const setClauses: string[] = ['version=version+1','updated_by=$1','updated_at=NOW()'];
    const params: any[] = [req.user?.id ?? null];
    let idx = 2;
    for (const col of cols) {
      const camel = col.replace(/_([a-z])/g, (_,c) => c.toUpperCase());
      if (body[camel] !== undefined || body[col] !== undefined) {
        const val = body[camel] ?? body[col];
        setClauses.push(`${col}=$${idx++}`);
        params.push(val === '' ? null : val);
      }
    }
    params.push(id);
    const r = await client.query(
      `UPDATE company_legal_tax SET ${setClauses.join(',')} WHERE company_id=$${idx} RETURNING *`,
      params,
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' }); }
    // Audit each changed field as 'legal_change'
    for (const col of cols) {
      const camel = col.replace(/_([a-z])/g, (_,c) => c.toUpperCase());
      const newVal = body[camel] ?? body[col];
      if (newVal !== undefined && String(now[col] ?? '') !== String(newVal ?? '')) {
        await auditLog(client, id, 'legal_change', 'company_legal_tax', col, now[col], newVal, req.user?.id??null, req);
      }
    }
    await client.query('COMMIT');
    res.json({ legalTax: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── PATCH /api/company/:id/address/:type ─────────────────────────────────────
router.patch('/:id(\\d+)/address/:type', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const { type } = req.params;
  if (!(COMPANY_ADDRESS_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid address type.', fields: { type: `Must be one of: ${COMPANY_ADDRESS_TYPES.join(', ')}` } });
  }
  const { addressLine1, addressLine2, city, district, state, country, pinCode, isActive, version } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM company_addresses WHERE company_id=$1 AND address_type=$2`, [id, type]);
    if (cur.rows.length && version !== undefined && cur.rows[0].version !== version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' });
    }
    let r: any;
    if (cur.rows.length === 0) {
      r = await client.query(
        `INSERT INTO company_addresses
           (company_id,address_type,address_line1,address_line2,city,district,state,country,pin_code,is_active,version,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11) RETURNING *`,
        [id, type, addressLine1??null, addressLine2??null, city??null, district??null,
          state??null, country??'India', pinCode??null, isActive??true, req.user?.id??null],
      );
    } else {
      r = await client.query(
        `UPDATE company_addresses SET
           address_line1=COALESCE($1,address_line1), address_line2=COALESCE($2,address_line2),
           city=COALESCE($3,city), district=COALESCE($4,district), state=COALESCE($5,state),
           country=COALESCE($6,country), pin_code=COALESCE($7,pin_code),
           is_active=COALESCE($8,is_active), version=version+1, updated_by=$9, updated_at=NOW()
         WHERE company_id=$10 AND address_type=$11 RETURNING *`,
        [addressLine1??null, addressLine2??null, city??null, district??null, state??null,
          country??null, pinCode??null, isActive??null, req.user?.id??null, id, type],
      );
    }
    await auditLog(client, id, 'field_change', 'company_addresses', `address_type:${type}`, null, null, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ address: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── POST /api/company/:id/bank-accounts ──────────────────────────────────────
router.post('/:id(\\d+)/bank-accounts', async (req: any, res: any) => {
  if (!isSuperuserOrAccountsHead(req)) return forbiddenErr(res, ['Superuser', 'Accounts Head']);
  const id = parseInt(req.params.id, 10);
  const { bankName, beneficiaryName, accountNumber, branch, ifsc, swift, iban, currency, isPrimary } = req.body;
  const fields: Record<string, string> = {};
  if (!bankName) fields.bankName = 'Required.';
  if (!beneficiaryName) fields.beneficiaryName = 'Required.';
  if (!accountNumber) fields.accountNumber = 'Required.';
  if (currency && !validateIso4217(currency)) fields.currency = 'Must be a valid ISO-4217 currency code.';
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) fields.ifsc = 'IFSC format invalid.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Validation failed.', fields });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO company_bank_accounts
         (company_id,bank_name,branch,beneficiary_name,account_number,ifsc,swift,iban,currency,is_primary,is_active,version,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,1,$11) RETURNING *`,
      [id, bankName, branch??null, beneficiaryName, accountNumber, ifsc??null, swift??null, iban??null,
        currency??'INR', isPrimary??false, req.user?.id??null],
    );
    await auditLog(client, id, 'field_change', 'company_bank_accounts', 'account_number', null, accountNumber, req.user?.id??null, req);
    await client.query('COMMIT');
    res.status(201).json({ bankAccount: r.rows[0] });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'CONFLICT', message: 'This account number already exists for this company.' });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  } finally { client.release(); }
});

// ── PATCH /api/company/:id/bank-accounts/:bankId ──────────────────────────────
router.patch('/:id(\\d+)/bank-accounts/:bankId(\\d+)', async (req: any, res: any) => {
  if (!isSuperuserOrAccountsHead(req)) return forbiddenErr(res, ['Superuser', 'Accounts Head']);
  const id = parseInt(req.params.id, 10);
  const bankId = parseInt(req.params.bankId, 10);
  const { bankName, branch, beneficiaryName, ifsc, swift, iban, currency, isPrimary, version } = req.body;
  const fields: Record<string, string> = {};
  if (currency && !validateIso4217(currency)) fields.currency = 'Must be a valid ISO-4217 currency code.';
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) fields.ifsc = 'IFSC format invalid.';
  if (Object.keys(fields).length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Validation failed.', fields });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM company_bank_accounts WHERE id=$1 AND company_id=$2`, [bankId, id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'Bank account not found.' }); }
    if (version !== undefined && cur.rows[0].version !== version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' });
    }
    const r = await client.query(
      `UPDATE company_bank_accounts SET
         bank_name=COALESCE($1,bank_name), branch=COALESCE($2,branch),
         beneficiary_name=COALESCE($3,beneficiary_name), ifsc=COALESCE($4,ifsc),
         swift=COALESCE($5,swift), iban=COALESCE($6,iban),
         currency=COALESCE($7,currency), is_primary=COALESCE($8,is_primary),
         version=version+1, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [bankName??null, branch??null, beneficiaryName??null, ifsc??null, swift??null, iban??null,
        currency??null, isPrimary??null, bankId],
    );
    await auditLog(client, id, 'field_change', 'company_bank_accounts', `bank_id:${bankId}`, null, null, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ bankAccount: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── DELETE /api/company/:id/bank-accounts/:bankId (soft) ─────────────────────
router.delete('/:id(\\d+)/bank-accounts/:bankId(\\d+)', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const bankId = parseInt(req.params.bankId, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE company_bank_accounts SET is_active=false, version=version+1, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [bankId, id],
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'Bank account not found.' }); }
    await auditLog(client, id, 'status_change', 'company_bank_accounts', 'is_active', true, false, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── PATCH /api/company/:id/erp-config ────────────────────────────────────────
router.patch('/:id(\\d+)/erp-config', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const { sapCompanyDb, sapBranchCode, defaultWarehouse, defaultCostCenter,
    defaultPaymentTerms, defaultDeliveryTerms, baseUom, decimalPrecision, version } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT version FROM company_erp_config WHERE company_id=$1`, [id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'ERP config not found.' }); }
    if (version !== undefined && cur.rows[0].version !== version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' });
    }
    const r = await client.query(
      `UPDATE company_erp_config SET
         sap_company_db=COALESCE($1,sap_company_db), sap_branch_code=COALESCE($2,sap_branch_code),
         default_warehouse=COALESCE($3,default_warehouse), default_cost_center=COALESCE($4,default_cost_center),
         default_payment_terms=COALESCE($5,default_payment_terms), default_delivery_terms=COALESCE($6,default_delivery_terms),
         base_uom=COALESCE($7,base_uom), decimal_precision=COALESCE($8,decimal_precision),
         version=version+1, updated_by=$9, updated_at=NOW()
       WHERE company_id=$10 RETURNING *`,
      [sapCompanyDb??null, sapBranchCode??null, defaultWarehouse??null, defaultCostCenter??null,
        defaultPaymentTerms??null, defaultDeliveryTerms??null, baseUom??null, decimalPrecision??null,
        req.user?.id??null, id],
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Concurrent update.' }); }
    await auditLog(client, id, 'field_change', 'company_erp_config', null, null, null, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ erpConfig: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── PATCH /api/company/:id/branding (text fields) ────────────────────────────
router.patch('/:id(\\d+)/branding', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const { defaultLetterhead, footerText, termsConditions, rfqFooter, offerFooter, purchaseFooter, reportWatermark, version } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT version FROM company_branding WHERE company_id=$1`, [id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'Branding record not found.' }); }
    if (version !== undefined && cur.rows[0].version !== version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Record was modified by another user. Please refresh and retry.' });
    }
    const r = await client.query(
      `UPDATE company_branding SET
         default_letterhead=COALESCE($1,default_letterhead), footer_text=COALESCE($2,footer_text),
         terms_conditions=COALESCE($3,terms_conditions), rfq_footer=COALESCE($4,rfq_footer),
         offer_footer=COALESCE($5,offer_footer), purchase_footer=COALESCE($6,purchase_footer),
         report_watermark=COALESCE($7,report_watermark),
         version=version+1, updated_by=$8, updated_at=NOW()
       WHERE company_id=$9 RETURNING *`,
      [defaultLetterhead??null, footerText??null, termsConditions??null, rfqFooter??null,
        offerFooter??null, purchaseFooter??null, reportWatermark??null, req.user?.id??null, id],
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'CONCURRENT_UPDATE', message: 'Concurrent update.' }); }
    await auditLog(client, id, 'field_change', 'company_branding', null, null, null, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ branding: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── Branding asset upload helper ──────────────────────────────────────────────
async function handleBrandingAsset(req: any, res: any, assetType: 'logo' | 'signature' | 'seal') {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  if (!req.file) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No file uploaded.' });
  const id = parseInt(req.params.id, 10);

  // MIME check
  if (!IMG_ALLOWED_MIME.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'MIME_REJECTED', message: 'Only JPEG, PNG, and WEBP images are allowed for branding assets.' });
  }
  // Magic-byte check
  if (!checkMagicBytes(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ error: 'MAGIC_BYTE_REJECTED', message: 'File content does not match declared type.' });
  }

  const ext = req.file.mimetype === 'image/jpeg' ? 'jpg' : req.file.mimetype === 'image/png' ? 'png' : 'webp';
  const master = await pool.query(`SELECT company_code FROM company_master WHERE id=$1`, [id]);
  if (!master.rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' });
  const code = master.rows[0].company_code;

  const col = assetType === 'logo' ? 'logo_gcs_path' : assetType === 'signature' ? 'signature_gcs_path' : 'seal_gcs_path';
  const folder = assetType.toUpperCase();
  const sanitized = sanitizeFileName(req.file.originalname);
  const gcsPath = `TPEL/COMPANY/${code}/BRANDING/${folder}/${sanitized}.${ext}`;

  const uploadResult = await uploadFileToGCS(gcsPath, req.file.buffer, req.file.mimetype);
  if (!uploadResult.success) return res.status(500).json({ error: 'INTERNAL_ERROR', message: `GCS upload failed: ${uploadResult.message}` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query(`SELECT ${col}, version FROM company_master WHERE id=$1`, [id]);
    const oldPath = old.rows[0]?.[col] ?? null;
    await client.query(`UPDATE company_master SET ${col}=$1, version=version+1, updated_at=NOW() WHERE id=$2`, [gcsPath, id]);
    await auditLog(client, id, 'branding_upload', 'company_master', col, oldPath, gcsPath, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ success: true, gcsPath });
    console.log(`${TAG} Branding ${assetType} uploaded for company ${id}: ${gcsPath}`);
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
}

router.post('/:id(\\d+)/branding/logo',      brandingUploadLimiter, brandingUpload.single('file'), (req: any, res: any) => handleBrandingAsset(req, res, 'logo'));
router.post('/:id(\\d+)/branding/signature', brandingUploadLimiter, brandingUpload.single('file'), (req: any, res: any) => handleBrandingAsset(req, res, 'signature'));
router.post('/:id(\\d+)/branding/seal',      brandingUploadLimiter, brandingUpload.single('file'), (req: any, res: any) => handleBrandingAsset(req, res, 'seal'));

// ── POST /api/company/:id/documents/:docType ──────────────────────────────────
router.post('/:id(\\d+)/documents/:docType', uploadLimiter, docUpload.single('file'), async (req: any, res: any) => {
  if (!canUploadCompanyDocs(req)) return forbiddenErr(res, ['Superuser', 'Administration Manager']);
  const id = parseInt(req.params.id, 10);
  const { docType } = req.params;
  if (!(COMPANY_DOC_TYPES as readonly string[]).includes(docType)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid docType.', fields: { docType: `Must be one of: ${COMPANY_DOC_TYPES.join(', ')}` } });
  }
  if (!req.file) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No file uploaded.' });

  // MIME check
  if (!DOC_ALLOWED_MIME.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'MIME_REJECTED', message: 'Allowed types: PDF, JPEG, PNG, WEBP.' });
  }
  // Magic-byte check
  if (!checkMagicBytes(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ error: 'MAGIC_BYTE_REJECTED', message: 'File content does not match declared type.' });
  }

  const master = await pool.query(`SELECT company_code FROM company_master WHERE id=$1`, [id]);
  if (!master.rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' });
  const code = master.rows[0].company_code;

  // Next revision number
  const revRes = await pool.query(
    `SELECT COALESCE(MAX(revision_number), 0) AS max_rev FROM company_documents WHERE company_id=$1 AND doc_type=$2`,
    [id, docType],
  );
  const nextRev = (revRes.rows[0].max_rev as number) + 1;
  const revLabel = zeroPad(nextRev, 2);
  const ext = req.file.mimetype === 'image/jpeg' ? 'jpg' : req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'pdf';
  const label = slugify(docType);
  const gcsPath = `TPEL/COMPANY/${code}/${docType}/rev-${revLabel}/001-${label}.${ext}`;
  const sanitizedName = sanitizeFileName(req.file.originalname);

  const uploadResult = await uploadFileToGCS(gcsPath, req.file.buffer, req.file.mimetype);
  if (!uploadResult.success) return res.status(500).json({ error: 'INTERNAL_ERROR', message: `GCS upload failed: ${uploadResult.message}` });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Deactivate prior revisions
    await client.query(
      `UPDATE company_documents SET is_active=false WHERE company_id=$1 AND doc_type=$2 AND is_active=true`,
      [id, docType],
    );
    // Insert new revision
    const r = await client.query(
      `INSERT INTO company_documents
         (company_id,doc_type,revision_number,file_name,gcs_path,content_type,size_bytes,status,is_active,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'uploaded',true,$8) RETURNING *`,
      [id, docType, nextRev, sanitizedName, gcsPath, req.file.mimetype, req.file.size, req.user?.id ?? null],
    );
    const isReplace = nextRev > 1;
    await auditLog(client, id, isReplace ? 'doc_replace' : 'doc_upload', 'company_documents', docType, null, gcsPath, req.user?.id??null, req);
    await client.query('COMMIT');
    console.log(`${TAG} Document ${docType} rev-${revLabel} uploaded for company ${id}: ${gcsPath}`);
    res.status(201).json({ success: true, doc: r.rows[0] });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'CONFLICT', message: 'Unique index violation — only one active revision allowed per document type.' });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  } finally { client.release(); }
});

// ── GET /api/company/:id/documents ────────────────────────────────────────────
router.get('/:id(\\d+)/documents', async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  try {
    const r = await pool.query(
      `SELECT * FROM company_documents WHERE company_id=$1 AND is_active=true ORDER BY doc_type`,
      [id],
    );
    res.json({ documents: r.rows });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── GET /api/company/:id/documents/:docType/history ───────────────────────────
router.get('/:id(\\d+)/documents/:docType/history', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const { docType } = req.params;
  try {
    const r = await pool.query(
      `SELECT * FROM company_documents WHERE company_id=$1 AND doc_type=$2 ORDER BY revision_number DESC`,
      [id, docType],
    );
    res.json({ history: r.rows });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── GET /api/company/doc/:docId/download ─────────────────────────────────────
router.get('/doc/:docId(\\d+)/download', downloadLimiter, async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const docId = parseInt(req.params.docId, 10);
  try {
    const r = await pool.query(`SELECT * FROM company_documents WHERE id=$1`, [docId]);
    if (!r.rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found.' });
    const doc = r.rows[0];
    const { storage } = await initializeGCS();
    if (!storage) return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'GCS unavailable.' });
    const [url] = await storage.bucket(BUCKET).file(doc.gcs_path).getSignedUrl({
      version: 'v4', action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      responseDisposition: `attachment; filename="${doc.file_name}"`,
    });
    res.json({ url, fileName: doc.file_name });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── GET /api/company/doc/:docId/view ─────────────────────────────────────────
router.get('/doc/:docId(\\d+)/view', viewLimiter, async (req: any, res: any) => {
  const docId = parseInt(req.params.docId, 10);
  try {
    const r = await pool.query(`SELECT * FROM company_documents WHERE id=$1`, [docId]);
    if (!r.rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found.' });
    const doc = r.rows[0];
    const { storage } = await initializeGCS();
    if (!storage) return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'GCS unavailable.' });
    const [url] = await storage.bucket(BUCKET).file(doc.gcs_path).getSignedUrl({
      version: 'v4', action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 60 minutes
      responseDisposition: `inline; filename="${doc.file_name}"`,
    });
    res.json({ url, fileName: doc.file_name });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── PATCH /api/company/doc/:docId/status ─────────────────────────────────────
router.patch('/doc/:docId(\\d+)/status', async (req: any, res: any) => {
  if (!isSuperuserOrAccountsHead(req)) return forbiddenErr(res, ['Superuser', 'Accounts Head']);
  const docId = parseInt(req.params.docId, 10);
  const { status, expiryDate, notes } = req.body;
  const allowed = ['uploaded', 'verified', 'expired'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid status.', fields: { status: `Must be one of: ${allowed.join(', ')}` } });
  }
  try {
    const sets: string[] = ['updated_at=NOW()'];
    const params: any[] = [];
    let idx = 1;
    if (status) { sets.push(`status=$${idx++}`); params.push(status); }
    if (expiryDate !== undefined) { sets.push(`expiry_date=$${idx++}`); params.push(expiryDate || null); }
    if (notes !== undefined) { sets.push(`notes=$${idx++}`); params.push(notes || null); }
    params.push(docId);
    const r = await pool.query(`UPDATE company_documents SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, params);
    if (!r.rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found.' });
    res.json({ success: true, doc: r.rows[0] });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── PATCH /api/company/:id/activate ──────────────────────────────────────────
router.patch('/:id(\\d+)/activate', activateLimiter, async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Guard: if already the only active company being deactivated
    const target = await client.query(`SELECT is_active FROM company_master WHERE id=$1`, [id]);
    if (!target.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' }); }
    if (target.rows[0].is_active) {
      // Trying to activate an already-active company — idempotent OK
      await client.query('ROLLBACK');
      return res.json({ message: 'Company is already active.' });
    }
    // Deactivate all
    await client.query(`UPDATE company_master SET is_active=false, version=version+1, updated_at=NOW() WHERE is_active=true`);
    // Activate target
    const r = await client.query(`UPDATE company_master SET is_active=true, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id]);
    await auditLog(client, id, 'activation_change', 'company_master', 'is_active', false, true, req.user?.id??null, req);
    await client.query('COMMIT');
    res.json({ company: r.rows[0] });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
  finally { client.release(); }
});

// ── GET /api/company/:id/audit-log ────────────────────────────────────────────
router.get('/:id(\\d+)/audit-log', async (req: any, res: any) => {
  if (!isSuperuser(req)) return forbiddenErr(res, ['Superuser']);
  const id = parseInt(req.params.id, 10);
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  try {
    const [rows, cnt] = await Promise.all([
      pool.query(
        `SELECT a.*, u.full_name AS changed_by_name FROM company_audit_log a
         LEFT JOIN users u ON u.id = a.changed_by
         WHERE a.company_id=$1 ORDER BY a.changed_at DESC LIMIT $2 OFFSET $3`,
        [id, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) AS cnt FROM company_audit_log WHERE company_id=$1`, [id]),
    ]);
    res.json({ log: rows.rows, total: parseInt(cnt.rows[0].cnt, 10), page, limit });
  } catch (e: any) { res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message }); }
});

export default router;

/**
 * document-path-resolver.ts
 * Phase 3 — Path Resolver Service (baseline v1.0)
 *
 * ERP stores only relative paths. No UNC, no drive letters, no local filesystem writes.
 * The Local Windows Document Agent (future phase) will prepend the physical root.
 */

// ─── Allowed token set ────────────────────────────────────────────────────
export const ALLOWED_TOKENS = new Set([
  'COMPANY', 'CC', 'CO', 'Cust', 'FY', 'NNN',
  'PROJECT_CODE', 'DocNum', 'rev', 'ItemCode',
  'CodeBars', 'Assembly', 'DocumentType', 'YYMMDD', 'ext',
  // Sales — Offer Template tokens
  'TemplateSlug', 'Seq',
]);

// ─── Security: patterns that must never appear in a resolved path ──────────
const BLOCKED_PATTERNS = [
  /^\\\\/, // UNC path \\Server
  /^[A-Za-z]:\\/, // drive path C:\
  /\.\./, // path traversal ..
  /\/\//, // double slash
];

const INVALID_WIN_CHARS = /[<>:"|?*]/;

// ─── Token context type ───────────────────────────────────────────────────
export interface TokenContext {
  COMPANY?: string;
  CC?: string;
  CO?: string;
  Cust?: string;
  FY?: string;
  NNN?: string;
  PROJECT_CODE?: string;
  DocNum?: string;
  rev?: string;
  ItemCode?: string;
  CodeBars?: string;
  Assembly?: string;
  DocumentType?: string;
  YYMMDD?: string;
  ext?: string;
  TemplateSlug?: string;
  Seq?: string;
  [key: string]: string | undefined;
}

export interface ResolveResult {
  ok: boolean;
  path?: string;
  error?: string;
}

// ─── validateTemplateTokens ───────────────────────────────────────────────
/**
 * Checks that every {TOKEN} in the template is in the ALLOWED_TOKENS set.
 * Returns list of unknown tokens, or empty array if all valid.
 */
export function validateTemplateTokens(template: string): string[] {
  const unknown: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(template)) !== null) {
    if (!ALLOWED_TOKENS.has(m[1])) {
      unknown.push(m[1]);
    }
  }
  return unknown;
}

// ─── normalizeRelativePath ────────────────────────────────────────────────
/**
 * Converts backslashes to forward slashes, trims leading/trailing slashes.
 */
export function normalizeRelativePath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

// ─── rejectUnsafePath ────────────────────────────────────────────────────
/**
 * Returns an error string if the path is unsafe, or null if safe.
 */
export function rejectUnsafePath(path: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(path)) {
      return `Unsafe path pattern detected: "${path}"`;
    }
  }
  const segments = path.split('/');
  for (const seg of segments) {
    if (seg === '') return `Blank path segment in: "${path}"`;
    if (INVALID_WIN_CHARS.test(seg)) {
      return `Invalid Windows filename character in segment "${seg}" of path "${path}"`;
    }
  }
  if (/^\//.test(path)) return `Absolute path not allowed: "${path}"`;
  return null;
}

// ─── resolveRelativePath ─────────────────────────────────────────────────
/**
 * Resolves a relative path template by substituting tokens from context.
 * Validates tokens, substitutes, normalizes, then runs safety checks.
 */
export function resolveRelativePath(template: string, ctx: TokenContext): ResolveResult {
  // 1. Validate tokens
  const unknown = validateTemplateTokens(template);
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown token(s): {${unknown.join('}, {')}}` };
  }

  // 2. Substitute tokens
  let resolved = template.replace(/\{([^}]+)\}/g, (_, key) => {
    const val = ctx[key];
    return val !== undefined ? val : `{${key}}`;
  });

  // 3. Check for unresolved tokens
  const unresolved = /\{[^}]+\}/.exec(resolved);
  if (unresolved) {
    return { ok: false, error: `Unresolved token in path: ${unresolved[0]}` };
  }

  // 4. Normalize
  resolved = normalizeRelativePath(resolved);

  // 5. Safety check
  const unsafe = rejectUnsafePath(resolved);
  if (unsafe) return { ok: false, error: unsafe };

  return { ok: true, path: resolved };
}

// ─── resolveFileName ─────────────────────────────────────────────────────
/**
 * Resolves a file name template (same rules as path, but single segment).
 */
export function resolveFileName(template: string, ctx: TokenContext): ResolveResult {
  const unknown = validateTemplateTokens(template);
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown token(s): {${unknown.join('}, {')}}` };
  }

  let resolved = template.replace(/\{([^}]+)\}/g, (_, key) => {
    const val = ctx[key];
    return val !== undefined ? val : `{${key}}`;
  });

  const unresolved = /\{[^}]+\}/.exec(resolved);
  if (unresolved) {
    return { ok: false, error: `Unresolved token in filename: ${unresolved[0]}` };
  }

  if (INVALID_WIN_CHARS.test(resolved)) {
    return { ok: false, error: `Invalid character in filename: "${resolved}"` };
  }

  return { ok: true, path: resolved };
}

// ─── resolveDocumentIdentity ─────────────────────────────────────────────
/**
 * Resolves both the relative folder path and the file name, then concatenates.
 * Returns the full relative file path: folder/filename
 */
export function resolveDocumentIdentity(
  pathTemplate: string,
  fileNameTemplate: string,
  ctx: TokenContext
): ResolveResult {
  const folderResult = resolveRelativePath(pathTemplate, ctx);
  if (!folderResult.ok) return folderResult;

  const fileResult = resolveFileName(fileNameTemplate, ctx);
  if (!fileResult.ok) return fileResult;

  const fullPath = `${folderResult.path}/${fileResult.path}`;
  return { ok: true, path: fullPath };
}

// ─── Sample path preview ─────────────────────────────────────────────────
/**
 * Generates a sample resolved path using placeholder values for unset tokens.
 * Useful for UI preview without requiring a real project.
 */
export function previewResolvedPath(template: string, partialCtx: Partial<TokenContext> = {}): string {
  const defaults: TokenContext = {
    COMPANY: 'TPEL',
    CC: 'EPC',
    CO: 'C10357',
    Cust: 'ApolloRefinery',
    FY: '2627',
    NNN: '017',
    PROJECT_CODE: 'TPEL-EPC-C10357-2627-017',
    DocNum: 'DDS-001',
    rev: '00',
    ItemCode: 'V-001',
    CodeBars: 'C1EPC7-UOR-005-FEV-3000',
    Assembly: 'Assembly_1',
    DocumentType: 'OFFER',
    YYMMDD: '260515',
    ext: 'pdf',
    TemplateSlug: 'uor-standard-offer',
    Seq: '001',
    ...partialCtx,
  };
  const result = resolveRelativePath(template, defaults);
  return result.ok ? (result.path ?? '') : `[ERROR: ${result.error}]`;
}

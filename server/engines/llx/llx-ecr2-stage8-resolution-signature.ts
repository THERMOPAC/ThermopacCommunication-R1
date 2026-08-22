import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Binds a server-computed Stage 8 resolver record to this application process.
 * The browser can retain the public fingerprint for audit, but cannot create
 * the accompanying signature required for an accepted automatic basis.
 */
function signatureSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return typeof secret === 'string' && secret.length >= 16 ? secret : null;
}

export function signEcr2Stage8ResolverRecord(fingerprint: string): string | null {
  const secret = signatureSecret();
  if (!secret || !fingerprint) return null;
  return createHmac('sha256', secret).update(fingerprint).digest('base64url');
}

export function verifyEcr2Stage8ResolverRecord(fingerprint: string, signature: string): boolean {
  const expected = signEcr2Stage8ResolverRecord(fingerprint);
  if (!expected || !signature) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(signature);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
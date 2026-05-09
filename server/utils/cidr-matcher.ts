/**
 * cidr-matcher.ts
 * Pure TypeScript IPv4 and CIDR matching utility.
 * No external dependencies.
 *
 * Replaces the broken string .includes() check that was in attendance-routes.ts.
 */

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(o => {
    const n = parseInt(o, 10);
    return String(n) === o && n >= 0 && n <= 255;
  });
}

/**
 * Returns true if clientIp matches allowedEntry.
 * allowedEntry may be:
 *   - Bare IPv4:  "203.0.113.5"
 *   - CIDR block: "192.168.1.0/24"
 */
export function ipMatchesCidr(clientIp: string, allowedEntry: string): boolean {
  const normalised = clientIp.replace(/^::ffff:/, '');
  if (!isValidIpv4(normalised)) return false;

  if (allowedEntry.includes('/')) {
    const [networkAddr, prefixStr] = allowedEntry.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32 || !isValidIpv4(networkAddr)) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipToInt(normalised) & mask) === (ipToInt(networkAddr) & mask);
  }

  return isValidIpv4(allowedEntry) && ipToInt(normalised) === ipToInt(allowedEntry);
}

/**
 * Returns true if clientIp matches ANY entry in allowedList.
 * If allowedList is empty, null, or undefined → returns true (no restriction configured).
 */
export function isIpAllowed(
  clientIp: string | null | undefined,
  allowedList: string[] | null | undefined
): boolean {
  if (!allowedList || allowedList.length === 0) return true;
  if (!clientIp) return false;
  return allowedList.some(entry => ipMatchesCidr(clientIp, entry));
}

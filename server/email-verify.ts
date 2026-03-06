import { promises as dns } from 'dns';

export async function verifyEmailDomain(email: string): Promise<{ valid: boolean; reason?: string }> {
  if (!email || !email.includes('@')) {
    return { valid: false, reason: 'Invalid email format' };
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { valid: false, reason: 'No domain found in email' };
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      return { valid: true };
    }
    return { valid: false, reason: `No mail server found for domain "${domain}"` };
  } catch (err: any) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      return { valid: false, reason: `Domain "${domain}" does not exist or cannot receive emails` };
    }
    return { valid: true };
  }
}

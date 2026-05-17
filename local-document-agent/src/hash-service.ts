import * as crypto from 'crypto';
import * as fs from 'fs';

export function sha256OfBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256OfFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return sha256OfBuffer(buffer);
}

export function verifyHash(filePath: string, expectedHash: string): boolean {
  const actual = sha256OfFile(filePath);
  return actual.toLowerCase() === expectedHash.toLowerCase();
}

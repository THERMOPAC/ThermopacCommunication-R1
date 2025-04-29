import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Generate the next Welder ID with format W-XXX
 * where XXX is a sequence number padded to 3 digits
 */
export async function generateNextWelderId() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("welderId" FROM 3) AS INTEGER)) as max_id
    FROM welders
  `);
  
  const maxIdStr = result.rows[0]?.max_id as string | undefined;
  const maxId = maxIdStr ? parseInt(maxIdStr) : 0;
  const nextId = maxId + 1;
  return `W-${nextId.toString().padStart(3, '0')}`;
}

/**
 * Generate the next Certificate ID with format CERT-XXX
 * where XXX is a sequence number padded to 3 digits
 */
export async function generateNextCertificateId() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("certificateNo" FROM 6) AS INTEGER)) as max_id
    FROM welder_certificates
  `);
  
  const maxIdStr = result.rows[0]?.max_id as string | undefined;
  const maxId = maxIdStr ? parseInt(maxIdStr) : 0;
  const nextId = maxId + 1;
  return `CERT-${nextId.toString().padStart(3, '0')}`;
}
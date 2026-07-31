/**
 * seed-offer-subjects.ts
 *
 * Idempotent seed for the offer_subjects master table.
 * Runs on server startup — safe to call multiple times; uses ON CONFLICT DO NOTHING.
 *
 * To add a new subject: append to OFFER_SUBJECTS below (alphabetical order preserved
 * by the API's .sort() call; insertion order here is for readability only).
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

const OFFER_SUBJECTS = [
  'Automatic Lubricant Blending Plant',
  'Continuous Polishing System',
  'Spares for Refinery Equipment',
  'Used Engine Oil Refinery',
  'Used Engine Oil Refinery with Solvent Extraction',
];

export async function seedOfferSubjects(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const subject of OFFER_SUBJECTS) {
    const result = await db.execute(
      sql`INSERT INTO offer_subjects (subject) VALUES (${subject}) ON CONFLICT (subject) DO NOTHING`
    );
    const count = (result as any).rowCount ?? 0;
    if (count > 0) inserted++;
    else skipped++;
  }

  console.log(`[OfferSubjectSeed] ${inserted} inserted, ${skipped} already existed (${OFFER_SUBJECTS.length} total)`);
}

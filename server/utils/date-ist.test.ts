/**
 * IST boundary tests for date-ist.ts utilities.
 * Run with: npx tsx server/utils/date-ist.test.ts
 *
 * Tests critical IST midnight boundary scenarios to confirm no UTC/IST date confusion.
 */

import { getISTDateString, getISTYesterdayString, buildISTDateTime, getISTDayOfWeek } from './date-ist';

let passed = 0;
let failed = 0;

function assert(label: string, actual: string | number, expected: string | number): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${expected}`);
    console.error(`      actual:   ${actual}`);
    failed++;
  }
}

console.log('\n=== getISTDateString ===');

// 1. UTC 18:20 on Apr 28 = IST 23:50 on Apr 28 → still Apr 28 IST
assert(
  'UTC 2026-04-28T18:20:00Z → IST 2026-04-28',
  getISTDateString(new Date('2026-04-28T18:20:00Z')),
  '2026-04-28'
);

// 2. UTC 18:35 on Apr 28 = IST 00:05 on Apr 29 → should be Apr 29 IST (the midnight boundary)
assert(
  'UTC 2026-04-28T18:35:00Z → IST 2026-04-29 (crossed midnight)',
  getISTDateString(new Date('2026-04-28T18:35:00Z')),
  '2026-04-29'
);

// 3. UTC midnight = IST 05:30 — both same calendar day
assert(
  'UTC 2026-04-29T00:00:00Z → IST 2026-04-29 (05:30 IST)',
  getISTDateString(new Date('2026-04-29T00:00:00Z')),
  '2026-04-29'
);

// 4. IST midnight itself (UTC 18:30 day before)
assert(
  'UTC 2026-04-28T18:30:00Z → IST 2026-04-29T00:00 (exact midnight)',
  getISTDateString(new Date('2026-04-28T18:30:00Z')),
  '2026-04-29'
);

console.log('\n=== getISTYesterdayString ===');

// 5. At IST 00:05 on Apr 29 (= UTC Apr 28 18:35), yesterday IST = Apr 28
assert(
  'At IST 00:05 Apr 29, yesterday = Apr 28',
  // Simulate: current time is UTC Apr 28 18:35
  getISTDateString(new Date(new Date('2026-04-28T18:35:00Z').getTime() - 24 * 60 * 60 * 1_000)),
  '2026-04-28'
);

console.log('\n=== buildISTDateTime ===');

// 6. Duty end 18:00 IST on Apr 28 = UTC Apr 28 12:30
assert(
  "buildISTDateTime('2026-04-28', '18:00') = UTC 2026-04-28T12:30:00.000Z",
  buildISTDateTime('2026-04-28', '18:00').toISOString(),
  '2026-04-28T12:30:00.000Z'
);

// 7. Duty start 09:00 IST on Apr 28 = UTC Apr 28 03:30
assert(
  "buildISTDateTime('2026-04-28', '09:00') = UTC 2026-04-28T03:30:00.000Z",
  buildISTDateTime('2026-04-28', '09:00').toISOString(),
  '2026-04-28T03:30:00.000Z'
);

// 8. buildISTDateTime must NOT equal naive UTC midnight + setHours (the old bug)
const oldBugResult = (() => {
  const d = new Date('2026-04-28T00:00:00');
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
})();
const newResult = buildISTDateTime('2026-04-28', '18:00').toISOString();
assert(
  'buildISTDateTime differs from old UTC-setHours bug',
  oldBugResult !== newResult ? 'different' : 'same',
  'different'
);

console.log('\n=== getISTDayOfWeek ===');

// 9. 2026-04-28 is a Tuesday (day 2)
assert(
  "getISTDayOfWeek('2026-04-28') = 2 (Tuesday)",
  getISTDayOfWeek('2026-04-28'),
  2
);

// 10. 2026-04-26 is a Sunday (day 0)
assert(
  "getISTDayOfWeek('2026-04-26') = 0 (Sunday)",
  getISTDayOfWeek('2026-04-26'),
  0
);

// 11. Day-of-week for IST midnight must equal UTC day at that IST date
// UTC 2026-04-28T18:30:00Z is IST 2026-04-29T00:00 (Wednesday = 3)
assert(
  'IST Apr 29 00:00 weekday = 3 (Wednesday) via getISTDateString + getISTDayOfWeek',
  getISTDayOfWeek(getISTDateString(new Date('2026-04-28T18:30:00Z'))),
  3
);

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

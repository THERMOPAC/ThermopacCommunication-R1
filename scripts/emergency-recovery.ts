/**
 * Emergency Recovery Script — Phase 4 Trusted Device Management
 * Baseline: docs/security-baseline-v1.0.md
 * Pre-approval: docs/security-phase4-preapproval.md (Rev 3)
 *
 * Usage:
 *   npx ts-node scripts/emergency-recovery.ts disable-trust <BREAK_GLASS_PASSPHRASE>
 *   npx ts-node scripts/emergency-recovery.ts enable-trust  <BREAK_GLASS_PASSPHRASE>
 *
 * ONLY use when both Superusers are locked out and no other recovery is possible.
 * Every invocation is logged to trusted_device_audit_log at severity=emergency/warning.
 * Maximum bypass window: 4 hours.
 */

import { db } from '../server/db';
import { epcMigrationFeatureFlags, trustedDeviceAuditLog, users, trustedDevices } from '../shared/schema';
import { eq, and, sql, gt } from 'drizzle-orm';

const BREAK_GLASS_FLAG   = 'SECURITY_DEVICE_TRUST_ENABLED';
const MAX_BYPASS_HOURS   = 4;
const HIGH_SECURITY_ROLES = ['Superuser', 'General Manager', 'Senior Manager'];

async function getFirstSuperuserId(): Promise<number | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'Superuser'))
    .limit(1);
  return u?.id ?? null;
}

async function writeBreakGlassAudit(
  userId: number,
  action: string,
  severity: string,
  notes: string,
): Promise<void> {
  await db.insert(trustedDeviceAuditLog).values({
    userId,
    deviceId: null,
    action,
    performedBy: null,
    ipAddress: 'server-console',
    severity,
    notes,
  });
}

async function getFlagEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ enabled: epcMigrationFeatureFlags.enabled })
    .from(epcMigrationFeatureFlags)
    .where(eq(epcMigrationFeatureFlags.flagName, BREAK_GLASS_FLAG));
  return row?.enabled ?? false;
}

async function setFlagEnabled(enabled: boolean): Promise<void> {
  await db
    .update(epcMigrationFeatureFlags)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(epcMigrationFeatureFlags.flagName, BREAK_GLASS_FLAG));
}

async function checkActiveBreakGlass(): Promise<boolean> {
  const cutoff = new Date(Date.now() - MAX_BYPASS_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({ id: trustedDeviceAuditLog.id })
    .from(trustedDeviceAuditLog)
    .where(
      and(
        eq(trustedDeviceAuditLog.action, 'break_glass_activated'),
        gt(trustedDeviceAuditLog.createdAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function checkAllHighSecurityHaveDevices(): Promise<string[]> {
  const unregistered: string[] = [];
  for (const role of HIGH_SECURITY_ROLES) {
    const rows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.role, role));

    for (const u of rows) {
      const [active] = await db
        .select({ id: trustedDevices.id })
        .from(trustedDevices)
        .where(
          and(
            eq(trustedDevices.userId, u.id),
            eq(trustedDevices.isActive, true),
            sql`${trustedDevices.deviceFingerprint} != ''`,
          ),
        )
        .limit(1);
      if (!active) unregistered.push(`${u.username} (${role})`);
    }
  }
  return unregistered;
}

async function disableTrust(passphrase: string): Promise<void> {
  const expected = process.env.BREAK_GLASS_PASSPHRASE;
  if (!expected) {
    console.error('❌  BREAK_GLASS_PASSPHRASE is not set in environment. Aborting.');
    process.exit(1);
  }
  if (passphrase !== expected) {
    console.error('❌  Invalid passphrase. Aborting. No changes made.');
    process.exit(1);
  }

  const currentlyEnabled = await getFlagEnabled();
  if (!currentlyEnabled) {
    console.error(`❌  ${BREAK_GLASS_FLAG} is already false. Nothing to do.`);
    process.exit(1);
  }

  const alreadyActive = await checkActiveBreakGlass();
  if (alreadyActive) {
    console.error(`❌  Break-glass is already active (within ${MAX_BYPASS_HOURS}h window). Do not double-invoke.`);
    process.exit(1);
  }

  const systemUserId = await getFirstSuperuserId();
  if (!systemUserId) {
    console.error('❌  No Superuser found in DB. Cannot write audit row. Aborting.');
    process.exit(1);
  }

  await setFlagEnabled(false);

  const ts = new Date().toISOString();
  await writeBreakGlassAudit(
    systemUserId,
    'break_glass_activated',
    'emergency',
    `Emergency recovery — initiated from server console at ${ts}. Max window: ${MAX_BYPASS_HOURS}h.`,
  );

  console.log(`\n⚠️  BREAK-GLASS ACTIVATED`);
  console.log(`   ${BREAK_GLASS_FLAG} is now OFF.`);
  console.log(`   High-security users can log in without device trust until you run enable-trust.`);
  console.log(`   Window: ${MAX_BYPASS_HOURS} hours from ${ts}`);
  console.log(`   Action logged to trusted_device_audit_log at severity=emergency.`);
  console.log(`\n   Next steps:`);
  console.log(`   1. Both Superusers log in and register new devices via the admin panel.`);
  console.log(`   2. Both Superusers activate their devices (GET /api/security/activate-device?token=...).`);
  console.log(`   3. Run: npx ts-node scripts/emergency-recovery.ts enable-trust <passphrase>`);
}

async function enableTrust(passphrase: string): Promise<void> {
  const expected = process.env.BREAK_GLASS_PASSPHRASE;
  if (!expected) {
    console.error('❌  BREAK_GLASS_PASSPHRASE is not set in environment. Aborting.');
    process.exit(1);
  }
  if (passphrase !== expected) {
    console.error('❌  Invalid passphrase. Aborting. No changes made.');
    process.exit(1);
  }

  const currentlyEnabled = await getFlagEnabled();
  if (currentlyEnabled) {
    console.error(`❌  ${BREAK_GLASS_FLAG} is already true. Nothing to do.`);
    process.exit(1);
  }

  // Pre-enable check: all high_security users must have ≥1 activated device
  const unregistered = await checkAllHighSecurityHaveDevices();
  if (unregistered.length > 0) {
    console.error(`❌  Cannot re-enable: the following users have no activated devices:`);
    unregistered.forEach(u => console.error(`     - ${u}`));
    console.error(`\n   Register and activate devices for all users above, then retry.`);
    process.exit(1);
  }

  const systemUserId = await getFirstSuperuserId();
  if (!systemUserId) {
    console.error('❌  No Superuser found in DB. Cannot write audit row. Aborting.');
    process.exit(1);
  }

  await setFlagEnabled(true);

  const ts = new Date().toISOString();
  await writeBreakGlassAudit(
    systemUserId,
    'break_glass_deactivated',
    'warning',
    `Break-glass resolved. Device trust enforcement re-enabled at ${ts}. Pre-enable check passed.`,
  );

  console.log(`\n✅  BREAK-GLASS CLOSED`);
  console.log(`   ${BREAK_GLASS_FLAG} is now ON.`);
  console.log(`   Device trust enforcement is active for all high_security roles.`);
  console.log(`   Action logged to trusted_device_audit_log at severity=warning.`);
}

async function main(): Promise<void> {
  const [, , command, passphrase] = process.argv;

  if (!command || !passphrase) {
    console.error('Usage: npx ts-node scripts/emergency-recovery.ts <disable-trust|enable-trust> <passphrase>');
    process.exit(1);
  }

  try {
    if (command === 'disable-trust') {
      await disableTrust(passphrase);
    } else if (command === 'enable-trust') {
      await enableTrust(passphrase);
    } else {
      console.error(`Unknown command: ${command}. Use disable-trust or enable-trust.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌  Unexpected error:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();

/**
 * admin-2fa-routes.ts
 * Phase 6 — 2FA Administration UI & Governance
 *
 * Routes:
 *   GET  /api/admin/2fa-policy               Superuser only
 *   PUT  /api/admin/2fa-policy               Superuser + TOTP (always)
 *   GET  /api/admin/2fa-policy/status        Superuser / HR
 *   POST /api/admin/2fa-policy/remind        Superuser / HR + any reauth
 *   GET  /api/admin/2fa-policy/audit         Superuser only
 *   GET  /api/admin/users/:userId/2fa-audit  Superuser / HR
 *   POST /api/admin/users/:userId/2fa/reset  Superuser + TOTP (always)
 *
 * Rate limiting — in-memory sliding window, no new npm packages:
 *   reset      3 attempts per admin per target per 60 min
 *   policy PUT 5 attempts per admin per 60 min
 *   remind     3 broadcasts per admin per 24h (+ DB-backed per-user 24h throttle)
 *
 * Audit severity stored in:
 *   two_factor_audit_log.metadata.severity  (JSONB)
 *   two_fa_policy_audit_log.notes           (JSON string {severity, message})
 *
 * Plane isolation: zero references to GPS, attendance_location_audit_log,
 * attendance_security_policies, or any Plane B table.
 *
 * payroll-salary-core.ts — ZERO changes. This file does not reference it.
 */

import { Express, Request, Response } from 'express';
import { db } from './db';
import {
  users,
  twoFactorAuditLog,
  twoFaGlobalPolicy,
  twoFaPolicyAuditLog,
} from '@shared/schema';
import { eq, desc, and, lt, gt, sql } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { requireReauth } from './middleware/require-reauth';
import { sendError, sendPermissionError, sendNotFound } from './utils/error-response';
import { storage } from './storage';

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

function isSuperuser(role: string): boolean {
  return role === 'Superuser';
}

function isSuperuserOrHR(role: string): boolean {
  return role === 'Superuser' || role === 'HR';
}

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter
// ---------------------------------------------------------------------------

const rateLimiter = new Map<string, number[]>();

function checkRateLimit(
  key: string,
  windowMs: number,
  maxAttempts: number,
): { allowed: boolean; attemptsInWindow: number } {
  const now = Date.now();
  const prev = (rateLimiter.get(key) ?? []).filter(t => now - t < windowMs);
  prev.push(now);
  rateLimiter.set(key, prev);
  return { allowed: prev.length <= maxAttempts, attemptsInWindow: prev.length };
}

// ---------------------------------------------------------------------------
// Audit log writer for two_factor_audit_log
// ---------------------------------------------------------------------------

function getClientInfo(req: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress:
      ((req.headers['x-forwarded-for'] as string) ?? '')
        .split(',')[0]
        .trim() || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
  };
}

async function write2faAuditEvent(
  userId: number,
  action: string,
  severity: 'info' | 'warning' | 'critical',
  req: Request,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const { ipAddress, userAgent } = getClientInfo(req);
  const [row] = await db
    .insert(twoFactorAuditLog)
    .values({ userId, action, ipAddress, userAgent, metadata: { severity, ...extra } })
    .returning({ id: twoFactorAuditLog.id });
  if (!row) throw new Error('Audit write returned no row (C-10)');
  return row.id;
}

// ---------------------------------------------------------------------------
// Policy severity calculator
// ---------------------------------------------------------------------------

function computePolicySeverity(
  prevMode: string,
  newMode: string,
  removedRoles: string[],
): 'info' | 'warning' | 'critical' {
  if (newMode === 'enforced') return 'critical';
  if (prevMode === 'enforced' && newMode !== 'enforced') return 'critical';
  if (newMode === 'required_from_date') return 'warning';
  if (prevMode === 'required_from_date' && newMode === 'optional') return 'warning';
  if (removedRoles.length > 0) return 'warning';
  return 'info';
}

function buildPolicyChangeMessage(
  prevMode: string,
  newMode: string,
  addedRoles: string[],
  removedRoles: string[],
  enforcementFromDate: string | null,
): string {
  const parts: string[] = [];
  if (prevMode !== newMode) {
    const suffix =
      newMode === 'required_from_date' && enforcementFromDate
        ? ` (effective: ${enforcementFromDate})`
        : prevMode === 'enforced' && newMode !== 'enforced'
        ? ' (enforcement disabled)'
        : '';
    parts.push(
      prevMode === 'enforced' && newMode !== 'enforced'
        ? `enforcementMode downgraded: ${prevMode} → ${newMode}${suffix}`
        : `enforcementMode changed: ${prevMode} → ${newMode}${suffix}`,
    );
  }
  if (addedRoles.length > 0) parts.push(`applyToRoles expanded: added [${addedRoles.join(', ')}]`);
  if (removedRoles.length > 0) parts.push(`applyToRoles narrowed: removed [${removedRoles.join(', ')}]`);
  return parts.length > 0 ? parts.join('; ') : 'policy configuration updated';
}

// ---------------------------------------------------------------------------
// Email helper for remind endpoint
// ---------------------------------------------------------------------------

async function sendReminderEmail(
  toEmail: string,
  toName: string,
): Promise<boolean> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return false;
  }
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    await transporter.sendMail({
      to: toEmail,
      from: process.env.GMAIL_USER,
      subject: 'Action Required: Enable Two-Factor Authentication — THERMOPAC ERP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1e40af;color:white;padding:20px;text-align:center;">
            <h1 style="margin:0;">THERMOPAC</h1>
            <p style="margin:5px 0 0 0;">Enterprise Resource Planning System</p>
          </div>
          <div style="padding:30px 20px;">
            <h2 style="color:#1e40af;">Enable Two-Factor Authentication</h2>
            <p>Dear ${toName},</p>
            <p>Your account does not yet have two-factor authentication (2FA) enabled.
               Your organisation is in the process of rolling out mandatory 2FA to protect
               all ERP accounts.</p>
            <p><strong>Please log in and enable 2FA at your earliest convenience.</strong></p>
            <p>If you need help setting up 2FA, contact your system administrator.</p>
          </div>
          <div style="background:#f3f4f6;padding:15px;text-align:center;font-size:12px;color:#6b7280;">
            THERMOPAC ERP — Security Notification. Do not reply to this email.
          </div>
        </div>`,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAdmin2faRoutes(app: Express): void {

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/2fa-policy
  // Read the singleton global 2FA policy row. Superuser only.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/2fa-policy', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!isSuperuser(user.role)) {
        return sendPermissionError(res, 'Superuser role required');
      }

      const [policy] = await db
        .select()
        .from(twoFaGlobalPolicy)
        .where(eq(twoFaGlobalPolicy.id, 1));

      if (!policy) {
        return res.status(404).json({ error: 'Global 2FA policy row not found' });
      }

      return res.json(policy);
    } catch (err) {
      return sendError(res, err, 'Failed to read 2FA policy');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/2fa-policy
  // Update singleton. Superuser + TOTP (always). Atomic UPDATE + audit INSERT.
  // Rate limit: 5 per admin per 60 min.
  // ─────────────────────────────────────────────────────────────────────────
  app.put(
    '/api/admin/2fa-policy',
    ensureAuthenticated,
    requireReauth('security.update_2fa_policy'),
    async (req: Request, res: Response) => {
      try {
        const admin = req.user as any;
        if (!isSuperuser(admin.role)) {
          return sendPermissionError(res, 'Superuser role required');
        }

        const rl = checkRateLimit(`policy_update:${admin.id}`, 60 * 60_000, 5);
        if (!rl.allowed) {
          try {
            await write2faAuditEvent(admin.id, 'policy_update_rate_limited', 'warning', req, {
              attemptsInWindow: rl.attemptsInWindow,
            });
          } catch (auditErr) {
            console.error('Rate limit audit write failed (C-10):', auditErr);
            return res.status(500).json({ error: 'Security service error' });
          }
          return res.status(429).json({ error: 'Rate limit exceeded. Max 5 policy updates per hour.' });
        }

        const {
          enforcementMode,
          applyToRoles,
          enforcementFromDate,
          gracePeriodEnabled,
          gracePeriodDays,
          notes: userNotes,
        } = req.body;

        const validModes = ['optional', 'required_from_date', 'enforced'];
        if (!validModes.includes(enforcementMode)) {
          return res.status(400).json({
            error: `enforcementMode must be one of: ${validModes.join(', ')}`,
          });
        }
        if (enforcementMode === 'required_from_date' && !enforcementFromDate) {
          return res.status(400).json({ error: 'enforcementFromDate is required when mode is required_from_date' });
        }

        const result = await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(twoFaGlobalPolicy)
            .where(eq(twoFaGlobalPolicy.id, 1));

          if (!current) throw new Error('Global 2FA policy singleton missing');

          const prevMode = current.enforcementMode;
          const prevRoles: string[] = (current.applyToRoles as string[]) ?? [];
          const newRoles: string[] = Array.isArray(applyToRoles) ? applyToRoles : prevRoles;

          const addedRoles = newRoles.filter(r => !prevRoles.includes(r));
          const removedRoles = prevRoles.filter(r => !newRoles.includes(r));

          const severity = computePolicySeverity(prevMode, enforcementMode, removedRoles);
          const message = buildPolicyChangeMessage(prevMode, enforcementMode, addedRoles, removedRoles, enforcementFromDate ?? null);
          const notesJson = JSON.stringify({ severity, message, adminNote: userNotes ?? null });

          const [updated] = await tx
            .update(twoFaGlobalPolicy)
            .set({
              enforcementMode,
              applyToRoles: newRoles,
              enforcementFromDate: enforcementFromDate ?? null,
              gracePeriodEnabled: gracePeriodEnabled ?? current.gracePeriodEnabled,
              gracePeriodDays: gracePeriodDays ?? current.gracePeriodDays,
              updatedBy: admin.id,
              updatedAt: new Date(),
            })
            .where(eq(twoFaGlobalPolicy.id, 1))
            .returning();

          const [auditRow] = await tx
            .insert(twoFaPolicyAuditLog)
            .values({
              changedBy: admin.id,
              previousMode: prevMode,
              newMode: enforcementMode,
              previousRoles: prevRoles,
              newRoles,
              notes: notesJson,
            })
            .returning({ id: twoFaPolicyAuditLog.id });

          if (!auditRow) throw new Error('Policy audit INSERT returned no row (C-10)');

          return { policy: updated, auditId: auditRow.id, severity };
        });

        return res.json({ success: true, policy: result.policy, auditId: result.auditId, severity: result.severity });
      } catch (err) {
        return sendError(res, err, 'Failed to update 2FA policy');
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/2fa-policy/status
  // Per-user 2FA enrollment report. Superuser / HR.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/2fa-policy/status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!isSuperuserOrHR(user.role)) {
        return sendPermissionError(res, 'Superuser or HR role required');
      }

      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          role: users.role,
          email: users.email,
          twoFactorEnabled: users.twoFactorEnabled,
          twoFactorLockedUntil: users.twoFactorLockedUntil,
          twoFactorBackupCodes: users.twoFactorBackupCodes,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(users.fullName);

      const mapped = allUsers.map(u => {
        const codes = (u.twoFactorBackupCodes as any[]) ?? [];
        const remainingBackupCodes = codes.filter((c: any) => !c.used).length;
        const isLocked =
          u.twoFactorLockedUntil != null && new Date(u.twoFactorLockedUntil) > new Date();
        return {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          email: u.email,
          twoFactorEnabled: u.twoFactorEnabled ?? false,
          isLocked,
          remainingBackupCodes,
        };
      });

      const enrolled = mapped.filter(u => u.twoFactorEnabled).length;
      const locked = mapped.filter(u => u.isLocked).length;

      return res.json({
        users: mapped,
        summary: {
          total: mapped.length,
          enrolled,
          notEnrolled: mapped.length - enrolled,
          locked,
        },
      });
    } catch (err) {
      return sendError(res, err, 'Failed to fetch 2FA enrollment status');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/2fa-policy/remind
  // Send reminder emails to non-enrolled users. Superuser / HR + any reauth.
  // Rate limit: 3 per admin per 24h; per-user: 1 email per 24h (DB-backed).
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    '/api/admin/2fa-policy/remind',
    ensureAuthenticated,
    requireReauth('security.update_2fa_policy'),
    async (req: Request, res: Response) => {
      try {
        const admin = req.user as any;
        if (!isSuperuserOrHR(admin.role)) {
          return sendPermissionError(res, 'Superuser or HR role required');
        }

        const rl = checkRateLimit(`remind:${admin.id}`, 24 * 60 * 60_000, 3);
        if (!rl.allowed) {
          try {
            await write2faAuditEvent(admin.id, 'admin_reminder_rate_limited', 'warning', req, {
              attemptsInWindow: rl.attemptsInWindow,
            });
          } catch (auditErr) {
            console.error('Rate limit audit write failed (C-10):', auditErr);
            return res.status(500).json({ error: 'Security service error' });
          }
          return res.status(429).json({ error: 'Rate limit exceeded. Max 3 reminder broadcasts per 24 hours.' });
        }

        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentReminders = await db
          .select({ userId: twoFactorAuditLog.userId })
          .from(twoFactorAuditLog)
          .where(
            and(
              eq(twoFactorAuditLog.action, 'admin_reminder_sent'),
              gt(twoFactorAuditLog.createdAt, cutoff),
            ),
          );
        const recentlyRemindedIds = new Set(recentReminders.map(r => r.userId));

        const unenrolled = await db
          .select({ id: users.id, username: users.username, fullName: users.fullName, email: users.email })
          .from(users)
          .where(and(eq(users.isActive, true), eq(users.twoFactorEnabled, false)));

        let remindedCount = 0;
        let skippedCount = 0;

        for (const target of unenrolled) {
          if (recentlyRemindedIds.has(target.id)) {
            skippedCount++;
            continue;
          }
          if (!target.email) {
            skippedCount++;
            continue;
          }

          try {
            await write2faAuditEvent(target.id, 'admin_reminder_sent', 'info', req, {
              sentBy: admin.id,
              targetUserId: target.id,
            });
          } catch (auditErr) {
            console.error('Reminder audit write failed (C-10):', auditErr);
            return res.status(500).json({ error: 'Security service error' });
          }

          await sendReminderEmail(target.email, target.fullName ?? target.username);
          remindedCount++;
        }

        return res.json({
          success: true,
          remindedCount,
          skippedCount,
          skippedReason: 'per_user_24h_throttle',
        });
      } catch (err) {
        return sendError(res, err, 'Failed to send 2FA reminders');
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/2fa-policy/audit
  // Paginated two_fa_policy_audit_log. Superuser only.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/2fa-policy/audit', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!isSuperuser(user.role)) {
        return sendPermissionError(res, 'Superuser role required');
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const rows = await db
        .select({
          id: twoFaPolicyAuditLog.id,
          changedBy: twoFaPolicyAuditLog.changedBy,
          previousMode: twoFaPolicyAuditLog.previousMode,
          newMode: twoFaPolicyAuditLog.newMode,
          previousRoles: twoFaPolicyAuditLog.previousRoles,
          newRoles: twoFaPolicyAuditLog.newRoles,
          notes: twoFaPolicyAuditLog.notes,
          createdAt: twoFaPolicyAuditLog.createdAt,
          changedByUsername: users.username,
          changedByFullName: users.fullName,
        })
        .from(twoFaPolicyAuditLog)
        .leftJoin(users, eq(twoFaPolicyAuditLog.changedBy, users.id))
        .orderBy(desc(twoFaPolicyAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(twoFaPolicyAuditLog);

      return res.json({ rows, total: count, page, limit });
    } catch (err) {
      return sendError(res, err, 'Failed to fetch 2FA policy audit log');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/users/:userId/2fa-audit
  // Per-user two_factor_audit_log. Superuser / HR. Paginated.
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/users/:userId/2fa-audit', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const actor = req.user as any;
      if (!isSuperuserOrHR(actor.role)) {
        return sendPermissionError(res, 'Superuser or HR role required');
      }

      const targetId = parseInt(req.params.userId);
      if (!Number.isFinite(targetId)) {
        return res.status(400).json({ error: 'Invalid userId' });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const rows = await db
        .select({
          id: twoFactorAuditLog.id,
          action: twoFactorAuditLog.action,
          ipAddress: twoFactorAuditLog.ipAddress,
          userAgent: twoFactorAuditLog.userAgent,
          metadata: twoFactorAuditLog.metadata,
          createdAt: twoFactorAuditLog.createdAt,
        })
        .from(twoFactorAuditLog)
        .where(eq(twoFactorAuditLog.userId, targetId))
        .orderBy(desc(twoFactorAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(twoFactorAuditLog)
        .where(eq(twoFactorAuditLog.userId, targetId));

      return res.json({ rows, total: count, page, limit });
    } catch (err) {
      return sendError(res, err, 'Failed to fetch user 2FA audit log');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/users/:userId/2fa/reset
  // Superuser force-clears another user's 2FA. TOTP (always).
  // Rate limit: 3 per admin per target per 60 min + escalation on 3 breaches/24h.
  // Cross-Superuser reset blocked (only self-reset allowed for Superusers).
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    '/api/admin/users/:userId/2fa/reset',
    ensureAuthenticated,
    requireReauth('user.disable_2fa'),
    async (req: Request, res: Response) => {
      try {
        const admin = req.user as any;
        if (!isSuperuser(admin.role)) {
          return sendPermissionError(res, 'Superuser role required');
        }

        const targetId = parseInt(req.params.userId);
        if (!Number.isFinite(targetId)) {
          return res.status(400).json({ error: 'Invalid userId' });
        }

        const rl = checkRateLimit(`reset:${admin.id}:${targetId}`, 60 * 60_000, 3);
        if (!rl.allowed) {
          try {
            await write2faAuditEvent(admin.id, 'admin_reset_rate_limited', 'critical', req, {
              adminUserId: admin.id,
              targetUserId: targetId,
              attemptsInWindow: rl.attemptsInWindow,
            });
          } catch (auditErr) {
            console.error('Rate limit audit write failed (C-10):', auditErr);
            return res.status(500).json({ error: 'Security service error' });
          }

          const breachRl = checkRateLimit(`reset_breach:${admin.id}`, 24 * 60 * 60_000, 3);
          if (!breachRl.allowed) {
            try {
              await write2faAuditEvent(admin.id, 'admin_reset_suspicious', 'critical', req, {
                adminUserId: admin.id,
                breachCount: breachRl.attemptsInWindow,
                windowHours: 24,
              });
            } catch (auditErr) {
              console.error('Escalation audit write failed (C-10):', auditErr);
            }
          }

          return res.status(429).json({ error: 'Rate limit exceeded. Max 3 reset attempts per target per hour.' });
        }

        const { reason } = req.body;
        if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
          return res.status(400).json({ error: 'reason must be at least 10 characters' });
        }

        const [target] = await db
          .select({ id: users.id, role: users.role, twoFactorEnabled: users.twoFactorEnabled })
          .from(users)
          .where(eq(users.id, targetId));

        if (!target) {
          return res.status(404).json({ error: 'User not found' });
        }

        if (target.role === 'Superuser' && targetId !== admin.id) {
          return res.status(403).json({
            error: 'Cannot reset another Superuser\'s 2FA. Use the break-glass recovery script.',
          });
        }

        await db
          .update(users)
          .set({
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorBackupCodes: [],
            twoFactorFailedAttempts: 0,
            twoFactorLockedUntil: null,
            twoFactorChallengeNonce: null,
          })
          .where(eq(users.id, targetId));

        let auditId: number;
        try {
          auditId = await write2faAuditEvent(targetId, 'admin_reset', 'critical', req, {
            resetBy: admin.id,
            reason: reason.trim(),
          });
        } catch (auditErr) {
          console.error('Admin reset audit write failed (C-10):', auditErr);
          return res.status(500).json({ error: 'Security service error — reset applied but audit failed' });
        }

        await storage.invalidateUserSessions(targetId, null);

        return res.json({ success: true, auditId });
      } catch (err) {
        return sendError(res, err, 'Failed to reset user 2FA');
      }
    },
  );
}

import { db } from '../../db';
import { internalMessages } from '@shared/schema';
import { auditLogger } from './audit-logger';
import { policyEngine } from './policy-engine';
import nodemailer from 'nodemailer';

interface NotificationTarget {
  userId: number;
  userName: string;
  email?: string;
}

interface NotificationPayload {
  agentKey: string;
  findingId?: number;
  subject: string;
  content: string;
  severity: string;
  channel: 'in_app' | 'email' | 'both';
  targets: NotificationTarget[];
  relatedEntityType?: string;
  relatedEntityId?: string;
}

const AGENT_SENDER_ID = 1;
const AGENT_SENDER_NAME = 'AI Agent System';

class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initEmailTransporter();
  }

  private initEmailTransporter(): void {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (user && pass) {
      this.emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    }
  }

  async sendNotification(payload: NotificationPayload): Promise<{ sent: number; failed: number }> {
    const policyResult = await policyEngine.checkPolicy(
      payload.agentKey,
      'notification',
      'send_alert'
    );

    if (!policyResult.allowed) {
      console.log(`[NotificationService] Blocked by policy: ${policyResult.reason}`);
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const target of payload.targets) {
      try {
        if (payload.channel === 'in_app' || payload.channel === 'both') {
          await this.sendInApp(target, payload);
        }

        if ((payload.channel === 'email' || payload.channel === 'both') && target.email && this.emailTransporter) {
          await this.sendEmail(target, payload);
        }

        sent++;

        await auditLogger.log({
          agentKey: payload.agentKey,
          eventType: 'notification.sent',
          actorType: 'agent',
          actorId: payload.agentKey,
          entityType: 'notification',
          entityId: `finding:${payload.findingId || 'none'}`,
          details: {
            targetUserId: target.userId,
            targetUserName: target.userName,
            channel: payload.channel,
            subject: payload.subject,
            severity: payload.severity,
          },
        });
      } catch (error: any) {
        failed++;
        console.error(`[NotificationService] Failed to notify ${target.userName}:`, error.message);
        await auditLogger.log({
          agentKey: payload.agentKey,
          eventType: 'notification.failed',
          actorType: 'agent',
          actorId: payload.agentKey,
          details: {
            targetUserId: target.userId,
            error: error.message,
          },
        });
      }
    }

    return { sent, failed };
  }

  private async sendInApp(target: NotificationTarget, payload: NotificationPayload): Promise<void> {
    const severityPrefix = payload.severity === 'critical' ? '🔴 ' :
                           payload.severity === 'high' ? '🟠 ' :
                           payload.severity === 'medium' ? '🟡 ' : '';

    await db.insert(internalMessages).values({
      senderId: AGENT_SENDER_ID,
      senderName: AGENT_SENDER_NAME,
      recipientId: target.userId,
      recipientName: target.userName,
      subject: `${severityPrefix}[Agent] ${payload.subject}`,
      content: payload.content,
      isRead: false,
    });
  }

  private async sendEmail(target: NotificationTarget, payload: NotificationPayload): Promise<void> {
    if (!this.emailTransporter || !target.email) return;

    const severityLabel = payload.severity.toUpperCase();
    await this.emailTransporter.sendMail({
      from: process.env.GMAIL_USER,
      to: target.email,
      subject: `[THERMOPAC Agent - ${severityLabel}] ${payload.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <div style="background: ${payload.severity === 'critical' ? '#dc2626' : payload.severity === 'high' ? '#ea580c' : '#2563eb'}; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0;">
            <h3 style="margin: 0;">${severityLabel} - Agent Alert</h3>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <h4 style="margin-top: 0;">${payload.subject}</h4>
            <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;">${payload.content}</pre>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from the THERMOPAC Agent Intelligence System.</p>
          </div>
        </div>
      `,
    });
  }

  async sendBulkNotifications(notifications: NotificationPayload[]): Promise<{ totalSent: number; totalFailed: number }> {
    let totalSent = 0;
    let totalFailed = 0;

    for (const n of notifications) {
      const result = await this.sendNotification(n);
      totalSent += result.sent;
      totalFailed += result.failed;
    }

    return { totalSent, totalFailed };
  }
}

export const notificationService = new NotificationService();

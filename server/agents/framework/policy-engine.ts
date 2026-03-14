import { db } from '../../db';
import { agentPolicies, agentActions } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import type { ActionCategory, ApprovalMode } from './types';

export interface PolicyCheckResult {
  allowed: boolean;
  approvalMode: ApprovalMode;
  reason?: string;
}

class PolicyEngine {
  async checkPolicy(
    agentKey: string,
    actionCategory: string,
    actionType: string,
    companyScope: string = 'ALL'
  ): Promise<PolicyCheckResult> {
    const policies = await db.select()
      .from(agentPolicies)
      .where(
        and(
          eq(agentPolicies.agentKey, agentKey),
          eq(agentPolicies.actionCategory, actionCategory),
          eq(agentPolicies.actionType, actionType),
          eq(agentPolicies.isEnabled, true)
        )
      );

    const policy = policies.find(p => p.companyScope === companyScope) || policies.find(p => p.companyScope === 'ALL');

    if (!policy) {
      return { allowed: false, approvalMode: 'disabled', reason: 'No policy defined for this action' };
    }

    if (policy.approvalMode === 'disabled') {
      return { allowed: false, approvalMode: 'disabled', reason: 'Action is disabled by policy' };
    }

    const rateLimitOk = await this.checkRateLimit(agentKey, actionType, policy.maxActionsPerDay || 50);
    if (!rateLimitOk) {
      return { allowed: false, approvalMode: policy.approvalMode as ApprovalMode, reason: 'Daily rate limit exceeded' };
    }

    const cooldownOk = await this.checkCooldown(agentKey, actionType, policy.cooldownMinutes || 30);
    if (!cooldownOk) {
      return { allowed: false, approvalMode: policy.approvalMode as ApprovalMode, reason: 'Cooldown period not elapsed' };
    }

    return { allowed: true, approvalMode: policy.approvalMode as ApprovalMode };
  }

  private async checkRateLimit(agentKey: string, actionType: string, maxPerDay: number): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const actions = await db.select()
      .from(agentActions)
      .where(
        and(
          eq(agentActions.agentKey, agentKey),
          eq(agentActions.actionType, actionType),
          gte(agentActions.createdAt, today)
        )
      );

    return actions.length < maxPerDay;
  }

  private async checkCooldown(agentKey: string, actionType: string, cooldownMinutes: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);

    const recent = await db.select()
      .from(agentActions)
      .where(
        and(
          eq(agentActions.agentKey, agentKey),
          eq(agentActions.actionType, actionType),
          gte(agentActions.createdAt, cutoff)
        )
      );

    return recent.length === 0;
  }
}

export const policyEngine = new PolicyEngine();

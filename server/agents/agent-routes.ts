import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  agentRegistry, agentRuns, agentFindings, agentInsights,
  agentRecommendations, agentActions, agentPolicies,
  agentSubscriptions, agentEntityOverrides, agentAuditLog,
} from '@shared/schema';
import { eq, desc, and, sql, isNull, or, gt } from 'drizzle-orm';
import { orchestrator } from './framework/orchestrator';
import { FindingManager } from './framework/finding-manager';
import { RecommendationManager } from './framework/recommendation-manager';
import { actionExecutor } from './framework/action-executor';
import { auditLogger } from './framework/audit-logger';

const router = Router();

function requireSuperuser(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || user.role !== 'Superuser') {
    return res.status(403).json({ error: 'Only Superuser role can access agent management' });
  }
  next();
}

router.use(requireSuperuser);

router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await db.select().from(agentRegistry).orderBy(agentRegistry.agentKey);

    const runStats = await db.execute(sql`
      SELECT agent_key,
             MAX(started_at) as last_run_at,
             COUNT(*)::int as run_count
      FROM agent_runs
      GROUP BY agent_key
    `);

    const statsMap = new Map(
      (runStats.rows as any[]).map((s: any) => [s.agent_key, s])
    );

    const enriched = agents.map(agent => {
      const stats = statsMap.get(agent.agentKey);
      return {
        ...agent,
        version: (agent.config as any)?.version || '1.0',
        lastRunAt: stats?.last_run_at || null,
        runCount: stats?.run_count || 0,
        consecutiveFailures: 0,
      };
    });

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:agentKey/trigger', async (req: Request, res: Response) => {
  try {
    const { agentKey } = req.params;
    const { companyScope, locationScope } = req.body;
    const userId = (req as any).user?.id || 0;
    const result = await orchestrator.triggerAgent(
      agentKey, 'manual', `manual:user:${userId}`,
      companyScope || 'ALL', locationScope || 'ALL'
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:agentKey/suspend', async (req: Request, res: Response) => {
  try {
    const { agentKey } = req.params;
    const userId = (req as any).user?.id || 0;
    const { reason } = req.body;
    await orchestrator.suspendAgent(agentKey, userId, reason || 'Suspended by user');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:agentKey/resume', async (req: Request, res: Response) => {
  try {
    const { agentKey } = req.params;
    const userId = (req as any).user?.id || 0;
    await orchestrator.resumeAgent(agentKey, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:agentKey/enable', async (req: Request, res: Response) => {
  try {
    const { agentKey } = req.params;
    const userId = (req as any).user?.id || 0;
    await orchestrator.enableAgent(agentKey, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents/:agentKey/disable', async (req: Request, res: Response) => {
  try {
    const { agentKey } = req.params;
    const userId = (req as any).user?.id || 0;
    await orchestrator.disableAgent(agentKey, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const agentKey = req.query.agentKey as string;
    const conditions = agentKey ? eq(agentRuns.agentKey, agentKey) : undefined;
    const runs = await db.select()
      .from(agentRuns)
      .where(conditions)
      .orderBy(desc(agentRuns.startedAt))
      .limit(limit);
    res.json(runs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/findings', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const status = req.query.status as string;
    const severity = req.query.severity as string;
    const agentKey = req.query.agentKey as string;

    let query = db.select().from(agentFindings).orderBy(desc(agentFindings.createdAt)).limit(limit);

    const conditions: any[] = [];
    if (status) conditions.push(eq(agentFindings.status, status));
    if (severity) conditions.push(eq(agentFindings.severity, severity));
    if (agentKey) conditions.push(eq(agentFindings.agentKey, agentKey));

    if (conditions.length > 0) {
      query = db.select().from(agentFindings)
        .where(and(...conditions))
        .orderBy(desc(agentFindings.createdAt))
        .limit(limit);
    }

    const findings = await query;
    res.json(findings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/findings/:id/status', async (req: Request, res: Response) => {
  try {
    const findingId = parseInt(req.params.id);
    const { status, reason } = req.body;
    const userId = (req as any).user?.id || 0;
    await FindingManager.updateStatus(findingId, status, userId, reason);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/findings/:id/assign', async (req: Request, res: Response) => {
  try {
    const findingId = parseInt(req.params.id);
    const { assignedTo } = req.body;
    const userId = (req as any).user?.id || 0;
    await FindingManager.assignFinding(findingId, assignedTo, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/insights', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const agentKey = req.query.agentKey as string;
    const conditions = agentKey ? eq(agentInsights.agentKey, agentKey) : undefined;
    const insights = await db.select()
      .from(agentInsights)
      .where(conditions)
      .orderBy(desc(agentInsights.createdAt))
      .limit(limit);
    res.json(insights);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const conditions = status ? eq(agentRecommendations.status, status) : undefined;
    const recommendations = await db.select()
      .from(agentRecommendations)
      .where(conditions)
      .orderBy(desc(agentRecommendations.createdAt))
      .limit(limit);
    res.json(recommendations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/recommendations/:id/approve', async (req: Request, res: Response) => {
  try {
    const recId = parseInt(req.params.id);
    const userId = (req as any).user?.id || 0;
    await RecommendationManager.approveRecommendation(recId, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/recommendations/:id/reject', async (req: Request, res: Response) => {
  try {
    const recId = parseInt(req.params.id);
    const userId = (req as any).user?.id || 0;
    const { reason } = req.body;
    await RecommendationManager.rejectRecommendation(recId, userId, reason || 'Rejected');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/actions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const actions = await db.select()
      .from(agentActions)
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);
    res.json(actions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/policies', async (req: Request, res: Response) => {
  try {
    const policies = await db.select().from(agentPolicies).orderBy(agentPolicies.agentKey);
    res.json(policies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/policies/:id', async (req: Request, res: Response) => {
  try {
    const policyId = parseInt(req.params.id);
    const { approvalMode, maxActionsPerDay, cooldownMinutes, isEnabled } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (approvalMode !== undefined) updates.approvalMode = approvalMode;
    if (maxActionsPerDay !== undefined) updates.maxActionsPerDay = maxActionsPerDay;
    if (cooldownMinutes !== undefined) updates.cooldownMinutes = cooldownMinutes;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;

    await db.update(agentPolicies).set(updates).where(eq(agentPolicies.id, policyId));

    const userId = (req as any).user?.id || 0;
    await auditLogger.log({
      eventType: 'policy.updated',
      actorType: 'user',
      actorId: String(userId),
      entityType: 'policy',
      entityId: String(policyId),
      details: updates,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/overrides', async (req: Request, res: Response) => {
  try {
    const overrides = await db.select()
      .from(agentEntityOverrides)
      .where(eq(agentEntityOverrides.isActive, true))
      .orderBy(desc(agentEntityOverrides.createdAt));
    res.json(overrides);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/overrides', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, overrideType, reason, expiresAt } = req.body;
    const userId = (req as any).user?.id || 0;
    const [override] = await db.insert(agentEntityOverrides).values({
      entityType,
      entityId,
      overrideType,
      reason,
      createdBy: userId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    }).returning();

    await auditLogger.log({
      eventType: 'override.created',
      actorType: 'user',
      actorId: String(userId),
      entityType: 'override',
      entityId: String(override.id),
      details: { entityType, entityId, overrideType, reason },
    });

    res.json(override);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/overrides/:id', async (req: Request, res: Response) => {
  try {
    const overrideId = parseInt(req.params.id);
    const userId = (req as any).user?.id || 0;
    await db.update(agentEntityOverrides).set({ isActive: false }).where(eq(agentEntityOverrides.id, overrideId));

    await auditLogger.log({
      eventType: 'override.removed',
      actorType: 'user',
      actorId: String(userId),
      entityType: 'override',
      entityId: String(overrideId),
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const agentKey = req.query.agentKey as string;
    const conditions = agentKey ? eq(agentAuditLog.agentKey, agentKey) : undefined;
    const logs = await db.select()
      .from(agentAuditLog)
      .where(conditions)
      .orderBy(desc(agentAuditLog.createdAt))
      .limit(limit);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard/summary', async (req: Request, res: Response) => {
  try {
    const agentsList = await db.select().from(agentRegistry);

    const runStats = await db.execute(sql`
      SELECT agent_key,
             MAX(started_at) as last_run_at,
             COUNT(*)::int as run_count
      FROM agent_runs
      GROUP BY agent_key
    `);
    const statsMap = new Map(
      (runStats.rows as any[]).map((s: any) => [s.agent_key, s])
    );
    const enrichedAgents = agentsList.map(agent => {
      const stats = statsMap.get(agent.agentKey);
      return {
        ...agent,
        version: (agent.config as any)?.version || '1.0',
        lastRunAt: stats?.last_run_at || null,
        runCount: stats?.run_count || 0,
        consecutiveFailures: 0,
      };
    });

    const openFindings = await db.select({ count: sql<number>`count(*)` })
      .from(agentFindings)
      .where(eq(agentFindings.status, 'open'));

    const pendingRecommendations = await db.select({ count: sql<number>`count(*)` })
      .from(agentRecommendations)
      .where(eq(agentRecommendations.status, 'pending_review'));

    const recentRuns = await db.select()
      .from(agentRuns)
      .orderBy(desc(agentRuns.startedAt))
      .limit(10);

    const recentFindings = await db.select()
      .from(agentFindings)
      .orderBy(desc(agentFindings.createdAt))
      .limit(20);

    const recentInsights = await db.select()
      .from(agentInsights)
      .orderBy(desc(agentInsights.createdAt))
      .limit(10);

    res.json({
      agents: enrichedAgents,
      stats: {
        totalAgents: agentsList.length,
        enabledAgents: agentsList.filter(a => a.isEnabled).length,
        suspendedAgents: agentsList.filter(a => a.isSuspended).length,
        openFindings: Number(openFindings[0]?.count || 0),
        pendingRecommendations: Number(pendingRecommendations[0]?.count || 0),
      },
      recentRuns,
      recentFindings,
      recentInsights,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

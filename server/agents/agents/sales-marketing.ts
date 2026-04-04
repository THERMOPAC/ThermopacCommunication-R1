import type { IAgent, AgentRunContext, AgentRunResult } from '../framework/types';
import { FindingManager } from '../framework/finding-manager';
import { InsightManager } from '../framework/insight-manager';
import { RecommendationManager } from '../framework/recommendation-manager';
import { actionExecutor } from '../framework/action-executor';
import { agentDataRepo } from '../data-access/agent-data-repo';
import { resolveEscalation } from '../framework/escalation';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const SOURCE_AGENT = 'sales_marketer';
const AGENT_KEY = 'sales_marketing';

const DEFAULT_SETTINGS = {
  sales_l1_user_id: 2,
  sales_l2_user_id: 3,
  stale_lead_days: 7,
  stale_lead_escalation_days: 15,
  lead_stuck_days: 30,
  high_value_lead_min_probability: 50,
  offer_expiry_warning_days: 7,
  offer_draft_stuck_days: 7,
  offer_sent_no_response_days: 10,
  offer_high_rejection_threshold: 3,
  dormant_customer_days: 90,
  followup_overdue_days: 3,
  high_value_neglect_days: 60,
  gads_low_quality_score: 5,
  gads_waste_spend_threshold: 100,
  campaign_overbudget_pct: 110,
};

type SalesSettings = typeof DEFAULT_SETTINGS;

async function getSettings(): Promise<SalesSettings> {
  try {
    const result = await db.execute(sql`
      SELECT config FROM agent_registry WHERE agent_key = ${AGENT_KEY} LIMIT 1
    `);
    const config = (result.rows as any[])[0]?.config || {};
    return { ...DEFAULT_SETTINGS, ...config };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function isFirstRun(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM agent_runs 
    WHERE agent_key = ${AGENT_KEY} AND status = 'completed'
  `);
  return Number((result.rows as any[])[0]?.cnt || 0) === 0;
}

function makeFingerprint(findingType: string, entityKey: string): string {
  return `[fp:sm_${findingType}:${entityKey}]`;
}

async function hasOpenAgentTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status NOT IN ('completed', 'canceled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasCompletedAgentTask(fingerprint: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND status = 'completed'
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasRecentAgentTask(fingerprint: string, cooldownDays: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${'%' + fingerprint + '%'}
      AND created_at::timestamp > NOW() - INTERVAL '1 day' * ${cooldownDays}
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasAnyOpenLeadTask(leadId: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM tasks 
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND category LIKE ${`%lead:${leadId}%`}
      AND status NOT IN ('completed', 'canceled')
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function autoCloseResolvedTasks(): Promise<number> {
  let closedCount = 0;
  const openAgentTasks = await db.execute(sql`
    SELECT id, category, title FROM tasks
    WHERE source_type = 'agent_task'
      AND source_agent = ${SOURCE_AGENT}
      AND status NOT IN ('completed', 'canceled')
  `);

  for (const task of (openAgentTasks.rows || []) as any[]) {
    const cat = task.category || '';
    let shouldClose = false;

    if (cat.includes('fp:sm_stale_lead') || cat.includes('fp:sm_lead_stuck') || cat.includes('fp:sm_high_value_lead')) {
      const match = cat.match(/lead:(\d+)/);
      if (match) {
        const leadId = Number(match[1]);
        const lead = await db.execute(sql`SELECT status_id, last_contacted_at, is_converted FROM leads WHERE id = ${leadId}`);
        const row = (lead.rows as any[])[0];
        if (row) {
          if (row.is_converted) shouldClose = true;
          if (row.status_id === 6 || row.status_id === 7) shouldClose = true;
          if (cat.includes('fp:sm_stale_lead') && row.last_contacted_at) {
            const daysSince = Math.floor((Date.now() - new Date(row.last_contacted_at).getTime()) / 86400000);
            if (daysSince < 7) shouldClose = true;
          }
        }
      }
    }
    if (cat.includes('fp:sm_won_not_converted')) {
      const match = cat.match(/lead:(\d+)/);
      if (match) {
        const leadId = Number(match[1]);
        const lead = await db.execute(sql`SELECT is_converted FROM leads WHERE id = ${leadId}`);
        if ((lead.rows as any[])[0]?.is_converted) shouldClose = true;
      }
    }
    if (cat.includes('fp:sm_offer_approved')) {
      const match = cat.match(/offer:(\d+)/);
      if (match) {
        const offerId = Number(match[1]);
        const offer = await db.execute(sql`SELECT status FROM offers WHERE id = ${offerId}`);
        const st = (offer.rows as any[])[0]?.status;
        if (st === 'Converted' || st === 'Cancelled') shouldClose = true;
      }
    }
    if (cat.includes('fp:sm_offer_expir') || cat.includes('fp:sm_offer_draft') || cat.includes('fp:sm_offer_no_response')) {
      const match = cat.match(/offer:(\d+)/);
      if (match) {
        const offerId = Number(match[1]);
        const offer = await db.execute(sql`SELECT status FROM offers WHERE id = ${offerId}`);
        const st = (offer.rows as any[])[0]?.status;
        if (st === 'Approved' || st === 'Converted' || st === 'Cancelled') shouldClose = true;
      }
    }
    if (cat.includes('fp:sm_followup_overdue')) {
      const match = cat.match(/followup:(\d+)/);
      if (match) {
        const fId = Number(match[1]);
        const fu = await db.execute(sql`SELECT status FROM customer_followups WHERE id = ${fId}`);
        if ((fu.rows as any[])[0]?.status === 'completed') shouldClose = true;
      }
    }
    if (cat.includes('fp:sm_unassigned_lead')) {
      const match = cat.match(/lead:(\d+)/);
      if (match) {
        const leadId = Number(match[1]);
        const lead = await db.execute(sql`SELECT assigned_to FROM leads WHERE id = ${leadId}`);
        if ((lead.rows as any[])[0]?.assigned_to) shouldClose = true;
      }
    }

    if (shouldClose) {
      await db.execute(sql`
        UPDATE tasks SET status = 'completed', completed_at = NOW()::text
        WHERE id = ${task.id}
      `);
      closedCount++;
    }
  }
  return closedCount;
}

export class SalesMarketingAgent implements IAgent {
  key = AGENT_KEY;
  displayName = 'Sales & Marketing Agent';
  category = 'sales';

  getSubscribedEvents(): string[] {
    return ['sales.lead.stale', 'sales.offer.expiring', 'sales.customer.dormant'];
  }

  async execute(context: AgentRunContext): Promise<AgentRunResult> {
    const startTime = Date.now();
    let findingsCount = 0;
    let insightsCount = 0;
    let recommendationsCount = 0;
    let queriesRun = 0;
    let autoExecutedCount = 0;
    let autoClosedCount = 0;
    const autoExecuteQueue: number[] = [];

    const findingManager = new FindingManager(context.runId, this.key);
    const insightManager = new InsightManager(context.runId, this.key);
    const recommendationManager = new RecommendationManager(context.runId, this.key);

    const settings = await getSettings();
    const salesL1userId = settings.sales_l1_user_id;
    const L1 = salesL1userId;
    const L2 = await resolveEscalation('L2', salesL1userId);
    const L3 = await resolveEscalation('L3', salesL1userId);

    const firstRun = await isFirstRun();

    try {
      autoClosedCount = await autoCloseResolvedTasks();
      if (autoClosedCount > 0) console.log(`[SalesMarketing] Auto-closed ${autoClosedCount} resolved tasks`);
    } catch (err: any) {
      console.error(`[SalesMarketing] Auto-close error:`, err.message);
    }

    const skipTaskCreation = false;
    if (firstRun) {
      console.log(`[SalesMarketing] FIRST RUN — baseline only, no tasks created`);
    }

    // ══════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ══════════════════════════════════════════════════════════════════

    const allLeads = await db.execute(sql`
      SELECT l.id, l.company_name, l.status_id, l.assigned_to, l.probability,
        l.expected_close_date, l.last_contacted_at, l.is_converted, l.customer_id,
        l.potential_value, l.currency, l.contact_name, l.contact_email,
        l.created_at, l.updated_at,
        ls.name as status_name,
        (CURRENT_DATE - COALESCE(l.last_contacted_at, l.created_at)::date) as days_since_contact,
        (CURRENT_DATE - l.updated_at::date) as days_since_update
      FROM leads l
      LEFT JOIN lead_statuses ls ON l.status_id = ls.id
      WHERE l.is_converted = false
      ORDER BY l.id
    `);
    queriesRun++;
    const leadRows = (allLeads.rows || []) as any[];

    const allOffers = await db.execute(sql`
      SELECT o.id, o.offer_number, o.customer_id, o.customer_name, o.total_amount,
        o.currency, o.status, o.valid_until, o.revision, o.created_by,
        o.created_at, o.updated_at,
        CASE WHEN o.valid_until IS NOT NULL
          THEN (o.valid_until::date - CURRENT_DATE)
          ELSE NULL END as days_until_expiry,
        (CURRENT_DATE - o.created_at::date) as days_since_created,
        (CURRENT_DATE - o.updated_at::date) as days_since_updated
      FROM offers o
      ORDER BY o.id
    `);
    queriesRun++;
    const offerRows = (allOffers.rows || []) as any[];

    const allCustomers = await db.execute(sql`
      SELECT c.id, c.bp_name, c.bp_code, c.contact_person, c.email, c.phone1,
        c.currency, c.created_at,
        (SELECT MAX(o2.created_at) FROM offers o2 WHERE o2.customer_id = c.id) as last_offer_date,
        (SELECT COUNT(*) FROM offers o3 WHERE o3.customer_id = c.id) as total_offers,
        (SELECT SUM(o4.total_amount) FROM offers o4 WHERE o4.customer_id = c.id AND o4.status IN ('Approved', 'Converted')) as total_business
      FROM customers c
      ORDER BY c.id
    `);
    queriesRun++;
    const customerRows = (allCustomers.rows || []) as any[];

    const overdueFollowups = await db.execute(sql`
      SELECT cf.id, cf.customer_id, cf.subject, cf.scheduled_date, cf.status,
        cf.assigned_to, c.bp_name as customer_name,
        (CURRENT_DATE - cf.scheduled_date::date) as days_overdue
      FROM customer_followups cf
      LEFT JOIN customers c ON cf.customer_id = c.id
      WHERE cf.status NOT IN ('completed', 'canceled')
        AND cf.scheduled_date::date < CURRENT_DATE
      ORDER BY cf.scheduled_date
    `);
    queriesRun++;
    const followupRows = (overdueFollowups.rows || []) as any[];

    // Google Ads data (may be empty)
    let gadsKeywordRows: any[] = [];
    let gadsSearchTermRows: any[] = [];
    let gadsCampaignRows: any[] = [];
    try {
      const gadsKeywords = await db.execute(sql`
        SELECT k.id, k.text, k.match_type, k.quality_score, k.status,
          ag.name as ad_group_name, gc.name as campaign_name
        FROM gads_keywords k
        LEFT JOIN gads_ad_groups ag ON k.ad_group_id = ag.id
        LEFT JOIN gads_campaigns gc ON k.campaign_id = gc.id
        WHERE k.status = 'ENABLED'
        ORDER BY k.quality_score ASC NULLS LAST
      `);
      gadsKeywordRows = (gadsKeywords.rows || []) as any[];
      queriesRun++;

      const gadsSearchTerms = await db.execute(sql`
        SELECT st.search_term, st.campaign_id, st.clicks, st.impressions,
          st.cost_micros, st.conversions,
          gc.name as campaign_name
        FROM gads_search_terms st
        LEFT JOIN gads_campaigns gc ON st.campaign_id = gc.id
        WHERE st.cost_micros > 0 AND st.conversions = 0
        ORDER BY st.cost_micros DESC
        LIMIT 50
      `);
      gadsSearchTermRows = (gadsSearchTerms.rows || []) as any[];
      queriesRun++;

      const gadsCampaigns = await db.execute(sql`
        SELECT gc.id, gc.name, gc.status, gc.budget_amount_micros,
          SUM(m.impressions) as total_impressions,
          SUM(m.clicks) as total_clicks,
          SUM(m.cost_micros) as total_cost_micros,
          SUM(m.conversions) as total_conversions
        FROM gads_campaigns gc
        LEFT JOIN gads_daily_metrics m ON m.entity_type = 'campaign' AND m.entity_id = gc.id
        WHERE gc.status = 'ENABLED'
        GROUP BY gc.id, gc.name, gc.status, gc.budget_amount_micros
      `);
      gadsCampaignRows = (gadsCampaigns.rows || []) as any[];
      queriesRun++;
    } catch (err: any) {
      console.log(`[SalesMarketing] Google Ads queries skipped:`, err.message);
    }

    // Marketing campaigns
    let marketingCampaignRows: any[] = [];
    try {
      const mktCampaigns = await db.execute(sql`
        SELECT mc.id, mc.name, mc.status, mc.budget, mc.actual_cost,
          mc.start_date, mc.end_date, mc.expected_lead_count, mc.actual_lead_count,
          mc.ctr, mc.cpc, mc.conversions, mc.conversion_rate, mc.roas
        FROM marketing_campaigns mc
        WHERE mc.status IN ('Active', 'active', 'Planned', 'planned')
        ORDER BY mc.id
      `);
      marketingCampaignRows = (mktCampaigns.rows || []) as any[];
      queriesRun++;
    } catch (err: any) {
      console.log(`[SalesMarketing] Marketing campaign queries skipped:`, err.message);
    }

    // ══════════════════════════════════════════════════════════════════
    // S1: STALE LEADS — NO CONTACT IN 7+ DAYS
    // ══════════════════════════════════════════════════════════════════

    const staleLeads = leadRows.filter(l =>
      l.status_id !== 6 && l.status_id !== 7 &&
      Number(l.days_since_contact) >= settings.stale_lead_days &&
      Number(l.days_since_contact) < settings.stale_lead_escalation_days
    );

    if (staleLeads.length > 0) {
      const topList = staleLeads.slice(0, 5).map(l =>
        `  • ${l.company_name} — ${l.status_name || 'Unknown'} — ${l.days_since_contact}d since contact`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'stale_lead',
        severity: 'medium',
        title: `S1: ${staleLeads.length} leads with no contact in ${settings.stale_lead_days}+ days`,
        description: `These leads haven't been contacted recently and need attention.\n\n${topList}${staleLeads.length > 5 ? `\n  ... and ${staleLeads.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: staleLeads.length },
        businessImpact: `${staleLeads.length} leads may go cold without timely follow-up.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_STALE_TASKS = 5;
        let staleTaskCount = 0;
        for (const lead of staleLeads) {
          if (staleTaskCount >= MAX_STALE_TASKS) break;
          if (await hasAnyOpenLeadTask(lead.id)) continue;
          const fp = makeFingerprint('stale_lead_s1', `lead:${lead.id}`);
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Contact lead: ${lead.company_name}`,
            priority: 'medium',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Follow up with lead: ${lead.company_name}`,
              description: `Lead ${lead.company_name} hasn't been contacted in ${lead.days_since_contact} days.\nStatus: ${lead.status_name}\nProbability: ${lead.probability || 'N/A'}%\n\nPlease reach out and update the lead status.\n\nSource: Sales & Marketing Agent — S1`,
              assignedTo: L1,
              priority: 'Medium',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; staleTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S2: STALE LEAD ESCALATION — NO CONTACT 15+ DAYS
    // ══════════════════════════════════════════════════════════════════

    const escalatedLeads = leadRows.filter(l =>
      l.status_id !== 6 && l.status_id !== 7 &&
      Number(l.days_since_contact) >= settings.stale_lead_escalation_days &&
      Number(l.days_since_contact) <= 180
    );

    if (escalatedLeads.length > 0) {
      const topList = escalatedLeads.slice(0, 5).map(l =>
        `  • ${l.company_name} — ${l.status_name || 'Unknown'} — ${l.days_since_contact}d since contact`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'stale_lead_escalation',
        severity: 'high',
        title: `S2: ${escalatedLeads.length} leads — no contact in ${settings.stale_lead_escalation_days}+ days (ESCALATION)`,
        description: `These leads have gone cold and need immediate attention.\n\n${topList}${escalatedLeads.length > 5 ? `\n  ... and ${escalatedLeads.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: escalatedLeads.length },
        businessImpact: `${escalatedLeads.length} leads at risk of being lost due to prolonged inactivity.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_ESCALATION_TASKS = 5;
        let escalationTaskCount = 0;
        for (const lead of escalatedLeads) {
          if (escalationTaskCount >= MAX_ESCALATION_TASKS) break;
          if (await hasAnyOpenLeadTask(lead.id)) continue;
          const fpS1 = makeFingerprint('stale_lead_s1', `lead:${lead.id}`);
          const fpL2 = makeFingerprint('stale_lead_s2_L2', `lead:${lead.id}`);
          if (!await hasCompletedAgentTask(fpS1)) continue;
          if (await hasOpenAgentTask(fpL2)) continue;
          if (await hasRecentAgentTask(fpL2, 14)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `ESCALATION: Lead ${lead.company_name} — ${lead.days_since_contact}d inactive`,
            priority: 'high',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] ESCALATION: Lead inactive ${lead.days_since_contact}d — ${lead.company_name}`,
              description: `Lead ${lead.company_name} has had no contact for ${lead.days_since_contact} days.\nStatus: ${lead.status_name}\nProbability: ${lead.probability || 'N/A'}%\nExpected Close: ${lead.expected_close_date || 'Not set'}\n\nEscalated because L1 follow-up task was completed but lead remains inactive.\n\nSource: Sales & Marketing Agent — S2 L2 Escalation`,
              assignedTo: L2,
              priority: 'High',
              category: `Sales ${fpL2}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L2,
          });
          if (rec.id > 0) { recommendationsCount++; escalationTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S3: LEAD STUCK — SAME STATUS 30+ DAYS
    // ══════════════════════════════════════════════════════════════════

    const stuckLeads = leadRows.filter(l =>
      l.status_id !== 6 && l.status_id !== 7 &&
      Number(l.days_since_update) >= settings.lead_stuck_days &&
      Number(l.days_since_update) <= 180
    );

    if (stuckLeads.length > 0) {
      const topList = stuckLeads.slice(0, 5).map(l =>
        `  • ${l.company_name} — stuck in "${l.status_name}" for ${l.days_since_update}d`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'lead_stuck',
        severity: 'medium',
        title: `S3: ${stuckLeads.length} leads stuck in same status for ${settings.lead_stuck_days}+ days`,
        description: `These leads haven't progressed through the pipeline.\n\n${topList}${stuckLeads.length > 5 ? `\n  ... and ${stuckLeads.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: stuckLeads.length },
        businessImpact: `Pipeline is stagnating — ${stuckLeads.length} leads need pipeline review.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_STUCK_TASKS = 5;
        let stuckTaskCount = 0;
        for (const lead of stuckLeads) {
          if (stuckTaskCount >= MAX_STUCK_TASKS) break;
          if (await hasAnyOpenLeadTask(lead.id)) continue;
          const fp = makeFingerprint('lead_stuck_s3', `lead:${lead.id}`);
          if (await hasRecentAgentTask(fp, 30)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Review stuck lead: ${lead.company_name}`,
            priority: 'medium',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Pipeline review: ${lead.company_name} — stuck ${lead.days_since_update}d in "${lead.status_name}"`,
              description: `Lead ${lead.company_name} has been in "${lead.status_name}" status for ${lead.days_since_update} days without progress.\n\nPlease review and either advance, update, or mark as Lost.\n\nSource: Sales & Marketing Agent — S3`,
              assignedTo: L1,
              priority: 'Medium',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; stuckTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S4: HIGH-VALUE LEADS NEGLECTED
    // ══════════════════════════════════════════════════════════════════

    const highValueNeglected = leadRows.filter(l =>
      l.status_id !== 6 && l.status_id !== 7 &&
      Number(l.probability) >= settings.high_value_lead_min_probability &&
      Number(l.days_since_contact) >= settings.stale_lead_days
    );

    if (highValueNeglected.length > 0) {
      const topList = highValueNeglected.slice(0, 5).map(l =>
        `  • ${l.company_name} — ${l.probability}% prob — ${l.days_since_contact}d since contact`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'high_value_lead_neglect',
        severity: 'high',
        title: `S4: ${highValueNeglected.length} high-value leads (${settings.high_value_lead_min_probability}%+ probability) neglected`,
        description: `High-probability leads without recent contact need priority attention.\n\n${topList}${highValueNeglected.length > 5 ? `\n  ... and ${highValueNeglected.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: highValueNeglected.length },
        businessImpact: `High-value pipeline at risk — these leads have the best conversion chance.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_HV_TASKS = 5;
        let hvTaskCount = 0;
        for (const lead of highValueNeglected) {
          if (hvTaskCount >= MAX_HV_TASKS) break;
          if (await hasAnyOpenLeadTask(lead.id)) continue;
          const fpL1 = makeFingerprint('high_value_lead_L1', `lead:${lead.id}`);
          const fpL2 = makeFingerprint('high_value_lead_L2', `lead:${lead.id}`);
          if (!await hasOpenAgentTask(fpL1) && !await hasCompletedAgentTask(fpL1)) {
            if (await hasRecentAgentTask(fpL1, 7)) continue;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `Priority: High-value lead ${lead.company_name} (${lead.probability}%)`,
              priority: 'medium',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] PRIORITY: Contact high-value lead ${lead.company_name} (${lead.probability}% prob)`,
                description: `High-probability lead ${lead.company_name} hasn't been contacted in ${lead.days_since_contact} days.\nProbability: ${lead.probability}%\nValue: ${lead.currency || ''} ${Number(lead.potential_value || 0).toLocaleString()}\nStatus: ${lead.status_name}\n\nThis is a high-conversion opportunity — prioritize follow-up.\n\nSource: Sales & Marketing Agent — S4 L1 Assignee Review`,
                assignedTo: L1,
                priority: 'Medium',
                category: `Sales ${fpL1}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L1,
            });
            if (rec.id > 0) { recommendationsCount++; hvTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `ESCALATION: High-value lead ${lead.company_name} (${lead.probability}%)`,
              priority: 'high',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] ESCALATION: High-value lead ${lead.company_name} (${lead.probability}% prob)`,
                description: `High-probability lead ${lead.company_name} still hasn't been contacted after L1 review was completed.\nProbability: ${lead.probability}%\nValue: ${lead.currency || ''} ${Number(lead.potential_value || 0).toLocaleString()}\nStatus: ${lead.status_name}\n\nEscalated because issue persists after assignee review.\n\nSource: Sales & Marketing Agent — S4 L2 Manager Escalation`,
                assignedTo: L2,
                priority: 'High',
                category: `Sales ${fpL2}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L2,
            });
            if (rec.id > 0) { recommendationsCount++; hvTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S5: PAST EXPECTED CLOSE DATE
    // ══════════════════════════════════════════════════════════════════

    const pastCloseDate = leadRows.filter(l =>
      l.status_id !== 6 && l.status_id !== 7 &&
      l.expected_close_date && new Date(l.expected_close_date) < new Date()
    );

    if (pastCloseDate.length > 0) {
      const topList = pastCloseDate.slice(0, 5).map(l =>
        `  • ${l.company_name} — expected close: ${l.expected_close_date} — status: ${l.status_name}`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'lead_past_close_date',
        severity: 'medium',
        title: `S5: ${pastCloseDate.length} leads past their expected close date`,
        description: `These leads have exceeded their expected close dates and need review.\n\n${topList}${pastCloseDate.length > 5 ? `\n  ... and ${pastCloseDate.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: pastCloseDate.length },
        businessImpact: `${pastCloseDate.length} deals overdue — pipeline forecasting is inaccurate.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const MAX_CLOSE_TASKS = 5;
        let closeTaskCount = 0;
        for (const lead of pastCloseDate) {
          if (closeTaskCount >= MAX_CLOSE_TASKS) break;
          if (await hasAnyOpenLeadTask(lead.id)) continue;
          const fp = makeFingerprint('past_close', `lead:${lead.id}`);
          if (await hasRecentAgentTask(fp, 14)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Update close date: ${lead.company_name}`,
            priority: 'medium',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Overdue close date: ${lead.company_name} — expected ${lead.expected_close_date}`,
              description: `Lead ${lead.company_name} had expected close date of ${lead.expected_close_date} which has passed.\nCurrent status: ${lead.status_name}\nProbability: ${lead.probability || 'N/A'}%\n\nPlease update the expected close date or reassess the opportunity.\n\nSource: Sales & Marketing Agent — S5`,
              assignedTo: L1,
              priority: 'Medium',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; closeTaskCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S6: UNASSIGNED LEADS
    // ══════════════════════════════════════════════════════════════════

    const unassignedLeads = leadRows.filter(l =>
      l.status_id !== 6 && l.status_id !== 7 && !l.assigned_to
    );

    if (unassignedLeads.length > 0) {
      const topList = unassignedLeads.slice(0, 5).map(l =>
        `  • ${l.company_name} — ${l.status_name} — created ${l.days_since_contact}d ago`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'unassigned_lead',
        severity: 'medium',
        title: `S6: ${unassignedLeads.length} leads without an assigned owner`,
        description: `These leads have no assigned sales person.\n\n${topList}${unassignedLeads.length > 5 ? `\n  ... and ${unassignedLeads.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: unassignedLeads.length },
        businessImpact: `Unassigned leads have no accountability and are likely being neglected.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('unassigned_leads', `batch:${unassignedLeads.length}`);
        if (!(await hasOpenAgentTask(fp)) && !(await hasRecentAgentTask(fp, 7))) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Assign ${unassignedLeads.length} unassigned leads`,
            priority: 'medium',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Assign ${unassignedLeads.length} unassigned leads`,
              description: `The following leads have no assigned owner:\n\n${unassignedLeads.map(l => `  • ${l.company_name} (${l.status_name})`).join('\n')}\n\nPlease assign appropriate sales owners.\n\nSource: Sales & Marketing Agent — S6`,
              assignedTo: L1,
              priority: 'Medium',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S7: WON LEADS NOT CONVERTED TO CUSTOMER
    // ══════════════════════════════════════════════════════════════════

    const wonNotConverted = leadRows.filter(l => l.status_id === 6 && !l.is_converted);

    if (wonNotConverted.length > 0) {
      const topList = wonNotConverted.map(l =>
        `  • ${l.company_name} — won but not converted to customer`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'won_not_converted',
        severity: 'high',
        title: `S7: ${wonNotConverted.length} won leads not converted to customer records`,
        description: `These leads have been marked as Won but haven't been converted to customer records.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'leads', count: wonNotConverted.length },
        businessImpact: `Won deals without customer records can't proceed to invoicing and delivery.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const lead of wonNotConverted) {
          const fp = makeFingerprint('won_not_converted', `lead:${lead.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 14)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Convert won lead: ${lead.company_name}`,
            priority: 'high',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Convert won lead to customer: ${lead.company_name}`,
              description: `Lead ${lead.company_name} has been marked Won but hasn't been converted to a customer record.\n\nPlease convert this lead to create the customer record for invoicing and project setup.\n\nSource: Sales & Marketing Agent — S7`,
              assignedTo: L1,
              priority: 'High',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S8: EXPIRING OFFERS — VALID_UNTIL WITHIN 7 DAYS
    // ══════════════════════════════════════════════════════════════════

    const expiringOffers = offerRows.filter(o =>
      o.status === 'Sent' &&
      o.days_until_expiry !== null &&
      Number(o.days_until_expiry) >= 0 &&
      Number(o.days_until_expiry) <= settings.offer_expiry_warning_days
    );

    if (expiringOffers.length > 0) {
      const topList = expiringOffers.map(o =>
        `  • ${o.offer_number} — ${o.customer_name} — ${o.currency} ${Number(o.total_amount).toLocaleString()} — expires in ${o.days_until_expiry}d`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'offer_expiring',
        severity: 'high',
        title: `S8: ${expiringOffers.length} offers expiring within ${settings.offer_expiry_warning_days} days`,
        description: `These sent offers are about to expire without a response.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'offers', count: expiringOffers.length },
        businessImpact: `${expiringOffers.length} offers worth ${expiringOffers.map(o => `${o.currency} ${Number(o.total_amount).toLocaleString()}`).join(', ')} may expire without action.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const offer of expiringOffers) {
          const fp = makeFingerprint('offer_expiring', `offer:${offer.id}`);
          if (await hasOpenAgentTask(fp)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Follow up: ${offer.offer_number} expiring in ${offer.days_until_expiry}d`,
            priority: 'high',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Offer expiring: ${offer.offer_number} — ${offer.customer_name} — ${offer.days_until_expiry}d left`,
              description: `Offer ${offer.offer_number} to ${offer.customer_name} expires in ${offer.days_until_expiry} days.\nAmount: ${offer.currency} ${Number(offer.total_amount).toLocaleString()}\nValid Until: ${offer.valid_until}\n\nPlease follow up with the customer for a decision or extend validity.\n\nSource: Sales & Marketing Agent — S8`,
              assignedTo: L1,
              priority: 'High',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S9: EXPIRED OFFERS STILL "SENT"
    // ══════════════════════════════════════════════════════════════════

    const expiredOffers = offerRows.filter(o =>
      o.status === 'Sent' &&
      o.days_until_expiry !== null &&
      Number(o.days_until_expiry) < 0
    );

    if (expiredOffers.length > 0) {
      const topList = expiredOffers.map(o =>
        `  • ${o.offer_number} — ${o.customer_name} — expired ${Math.abs(o.days_until_expiry)}d ago`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'offer_expired',
        severity: 'high',
        title: `S9: ${expiredOffers.length} offers expired but still in "Sent" status`,
        description: `These offers have passed their validity date without being resolved.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'offers', count: expiredOffers.length },
        businessImpact: `Expired offers need status update — either re-issue, mark as Expired, or follow up.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const offer of expiredOffers) {
          const fp = makeFingerprint('offer_expired', `offer:${offer.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 14)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Resolve expired offer: ${offer.offer_number}`,
            priority: 'high',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Expired offer: ${offer.offer_number} — ${offer.customer_name}`,
              description: `Offer ${offer.offer_number} to ${offer.customer_name} expired ${Math.abs(offer.days_until_expiry)} days ago.\nAmount: ${offer.currency} ${Number(offer.total_amount).toLocaleString()}\n\nPlease update the status (mark Expired, re-issue, or follow up).\n\nSource: Sales & Marketing Agent — S9`,
              assignedTo: L1,
              priority: 'High',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S10: DRAFT OFFERS STUCK — NOT SENT WITHIN 7 DAYS
    // ══════════════════════════════════════════════════════════════════

    const stuckDrafts = offerRows.filter(o =>
      o.status === 'Draft' &&
      Number(o.days_since_created) >= settings.offer_draft_stuck_days
    );

    if (stuckDrafts.length > 0) {
      const topList = stuckDrafts.map(o =>
        `  • ${o.offer_number} — ${o.customer_name} — draft for ${o.days_since_created}d`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'offer_draft_stuck',
        severity: 'medium',
        title: `S10: ${stuckDrafts.length} offers stuck in Draft for ${settings.offer_draft_stuck_days}+ days`,
        description: `These offers were created but never sent.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'offers', count: stuckDrafts.length },
        businessImpact: `Draft offers not sent delay the sales process.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const offer of stuckDrafts) {
          const fp = makeFingerprint('offer_draft', `offer:${offer.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Send or discard draft: ${offer.offer_number}`,
            priority: 'medium',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Draft stuck: ${offer.offer_number} — ${offer.customer_name} — ${offer.days_since_created}d`,
              description: `Offer ${offer.offer_number} for ${offer.customer_name} has been in Draft for ${offer.days_since_created} days.\nAmount: ${offer.currency} ${Number(offer.total_amount).toLocaleString()}\n\nPlease finalize and send, or discard if no longer needed.\n\nSource: Sales & Marketing Agent — S10`,
              assignedTo: L1,
              priority: 'Medium',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S11: APPROVED OFFERS NOT CONVERTED
    // ══════════════════════════════════════════════════════════════════

    const approvedNotConverted = offerRows.filter(o =>
      o.status === 'Approved' &&
      Number(o.days_since_updated) >= 7
    );

    if (approvedNotConverted.length > 0) {
      const topList = approvedNotConverted.map(o =>
        `  • ${o.offer_number} — ${o.customer_name} — approved ${o.days_since_updated}d ago`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'offer_approved_not_converted',
        severity: 'high',
        title: `S11: ${approvedNotConverted.length} approved offers not yet converted to orders`,
        description: `These offers are approved but haven't progressed to the next stage.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'offers', count: approvedNotConverted.length },
        businessImpact: `Approved offers need to move to project/order stage for revenue recognition.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const offer of approvedNotConverted) {
          const fpL1 = makeFingerprint('offer_approved_L1', `offer:${offer.id}`);
          const fpL2 = makeFingerprint('offer_approved_L2', `offer:${offer.id}`);
          if (!await hasOpenAgentTask(fpL1) && !await hasCompletedAgentTask(fpL1)) {
            if (await hasRecentAgentTask(fpL1, 14)) continue;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `Convert approved offer: ${offer.offer_number}`,
              priority: 'medium',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] Convert approved offer: ${offer.offer_number} — ${offer.customer_name}`,
                description: `Offer ${offer.offer_number} was approved ${offer.days_since_updated} days ago but hasn't been converted.\nAmount: ${offer.currency} ${Number(offer.total_amount).toLocaleString()}\n\nPlease proceed with order conversion and project setup.\n\nSource: Sales & Marketing Agent — S11 L1 Assignee Review`,
                assignedTo: L1,
                priority: 'Medium',
                category: `Sales ${fpL1}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L1,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `ESCALATION: Convert approved offer: ${offer.offer_number}`,
              priority: 'high',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] ESCALATION: Approved offer not converted: ${offer.offer_number} — ${offer.customer_name}`,
                description: `Offer ${offer.offer_number} was approved ${offer.days_since_updated} days ago and remains unconverted after L1 review was completed.\nAmount: ${offer.currency} ${Number(offer.total_amount).toLocaleString()}\n\nEscalated because issue persists after assignee review.\n\nSource: Sales & Marketing Agent — S11 L2 Manager Escalation`,
                assignedTo: L2,
                priority: 'High',
                category: `Sales ${fpL2}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L2,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // S12: HIGH REJECTION RATE PER CUSTOMER
    // ══════════════════════════════════════════════════════════════════

    const customerOfferStats = new Map<string, { total: number; rejected: number; name: string }>();
    for (const o of offerRows) {
      const key = o.customer_name || 'Unknown';
      if (!customerOfferStats.has(key)) customerOfferStats.set(key, { total: 0, rejected: 0, name: key });
      const stats = customerOfferStats.get(key)!;
      stats.total++;
      if (o.status === 'Rejected') stats.rejected++;
    }
    const highRejection = Array.from(customerOfferStats.values()).filter(s =>
      s.rejected >= settings.offer_high_rejection_threshold
    );

    if (highRejection.length > 0) {
      const topList = highRejection.map(s =>
        `  • ${s.name} — ${s.rejected}/${s.total} offers rejected`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'high_rejection_rate',
        severity: 'medium',
        title: `S12: ${highRejection.length} customers with ${settings.offer_high_rejection_threshold}+ rejected offers`,
        description: `These customers have a high offer rejection rate, suggesting pricing or spec issues.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'customers', count: highRejection.length },
        businessImpact: `Repeated rejections waste sales effort — review pricing strategy or customer fit.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const cust of highRejection) {
          const custKey = cust.name.substring(0, 20);
          const fpL1 = makeFingerprint('high_rejection_L1', `cust:${custKey}`);
          const fpL2 = makeFingerprint('high_rejection_L2', `cust:${custKey}`);
          if (!await hasOpenAgentTask(fpL1) && !await hasCompletedAgentTask(fpL1)) {
            if (await hasRecentAgentTask(fpL1, 30)) continue;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `Review rejection pattern: ${cust.name}`,
              priority: 'medium',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] High rejection rate: ${cust.name} — ${cust.rejected}/${cust.total} offers rejected`,
                description: `Customer ${cust.name} has ${cust.rejected} out of ${cust.total} offers rejected.\n\nPlease review pricing, specifications, and customer requirements to improve conversion.\n\nSource: Sales & Marketing Agent — S12 L1 Assignee Review`,
                assignedTo: L1,
                priority: 'Medium',
                category: `Sales ${fpL1}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L1,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `ESCALATION: Rejection pattern: ${cust.name}`,
              priority: 'high',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] ESCALATION: High rejection rate: ${cust.name} — ${cust.rejected}/${cust.total} rejected`,
                description: `Customer ${cust.name} still has ${cust.rejected} out of ${cust.total} offers rejected after L1 review was completed.\n\nEscalated because issue persists after assignee review.\n\nSource: Sales & Marketing Agent — S12 L2 Manager Escalation`,
                assignedTo: L2,
                priority: 'High',
                category: `Sales ${fpL2}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L2,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // C1: DORMANT CUSTOMERS — NO OFFERS IN 90+ DAYS
    // ══════════════════════════════════════════════════════════════════

    const dormantCustomers = customerRows.filter(c => {
      if (!c.last_offer_date) return Number(c.total_offers) > 0;
      const daysSince = Math.floor((Date.now() - new Date(c.last_offer_date).getTime()) / 86400000);
      return daysSince >= settings.dormant_customer_days && Number(c.total_offers) > 0;
    });

    if (dormantCustomers.length > 0) {
      const topList = dormantCustomers.slice(0, 5).map(c => {
        const daysSince = c.last_offer_date ? Math.floor((Date.now() - new Date(c.last_offer_date).getTime()) / 86400000) : 'N/A';
        return `  • ${c.bp_name} — last offer: ${daysSince}d ago — total offers: ${c.total_offers}`;
      }).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'dormant_customer',
        severity: 'low',
        title: `C1: ${dormantCustomers.length} customers with no offers in ${settings.dormant_customer_days}+ days`,
        description: `Existing customers with prior business but no recent activity.\n\n${topList}${dormantCustomers.length > 5 ? `\n  ... and ${dormantCustomers.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'customers', count: dormantCustomers.length },
        businessImpact: `Dormant customers represent missed cross-sell/upsell opportunities.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('dormant_customers', `batch:${dormantCustomers.length}`);
        if (!(await hasOpenAgentTask(fp)) && !(await hasRecentAgentTask(fp, 30))) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Re-engage ${dormantCustomers.length} dormant customers`,
            priority: 'low',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Re-engage ${dormantCustomers.length} dormant customers`,
              description: `The following customers haven't received offers in ${settings.dormant_customer_days}+ days:\n\n${dormantCustomers.slice(0, 10).map(c => `  • ${c.bp_name}`).join('\n')}\n\nConsider reaching out with new offerings or check-in calls.\n\nSource: Sales & Marketing Agent — C1`,
              assignedTo: L1,
              priority: 'Low',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // C2: CUSTOMER FOLLOW-UP OVERDUE
    // ══════════════════════════════════════════════════════════════════

    if (followupRows.length > 0) {
      const topList = followupRows.slice(0, 5).map(f =>
        `  • ${f.customer_name} — "${f.subject}" — ${f.days_overdue}d overdue`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'followup_overdue',
        severity: 'medium',
        title: `C2: ${followupRows.length} customer follow-ups overdue`,
        description: `Scheduled follow-ups that have passed their date.\n\n${topList}${followupRows.length > 5 ? `\n  ... and ${followupRows.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'followups', count: followupRows.length },
        businessImpact: `Missed follow-ups reduce customer trust and may lose deals.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const fu of followupRows) {
          const fp = makeFingerprint('followup_overdue', `followup:${fu.id}`);
          if (await hasOpenAgentTask(fp)) continue;
          if (await hasRecentAgentTask(fp, 7)) continue;

          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Complete follow-up: ${fu.customer_name} — ${fu.subject}`,
            priority: 'medium',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Overdue follow-up: ${fu.customer_name} — ${fu.subject}`,
              description: `Scheduled follow-up "${fu.subject}" for ${fu.customer_name} is ${fu.days_overdue} days overdue.\nScheduled Date: ${fu.scheduled_date}\n\nPlease complete or reschedule.\n\nSource: Sales & Marketing Agent — C2`,
              assignedTo: fu.assigned_to || L1,
              priority: 'Medium',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: fu.assigned_to || L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // C3: CUSTOMERS MISSING CONTACT DETAILS
    // ══════════════════════════════════════════════════════════════════

    const missingContact = customerRows.filter(c =>
      (!c.email || c.email.trim() === '') && (!c.phone1 || c.phone1.trim() === '') && (!c.contact_person || c.contact_person.trim() === '')
    );

    if (missingContact.length > 0) {
      const topList = missingContact.slice(0, 10).map(c =>
        `  • ${c.bp_name} (${c.bp_code || 'no code'})`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'missing_contact',
        severity: 'low',
        title: `C3: ${missingContact.length} customers missing contact details`,
        description: `These customers have no email, phone, or contact person on file.\n\n${topList}`,
        category: 'Sales',
        affectedEntity: { type: 'customers', count: missingContact.length },
        businessImpact: `Incomplete contact data hampers communication and follow-ups.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('missing_contact', `batch:${missingContact.length}`);
        if (!(await hasOpenAgentTask(fp)) && !(await hasRecentAgentTask(fp, 30))) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Update contact details for ${missingContact.length} customers`,
            priority: 'low',
            actionType: 'create_task',
            actionPayload: {
              title: `[Sales] Update ${missingContact.length} customer records — missing contact details`,
              description: `The following customers have no email, phone, or contact person:\n\n${missingContact.slice(0, 15).map(c => `  • ${c.bp_name}`).join('\n')}\n\nPlease update their contact information.\n\nSource: Sales & Marketing Agent — C3`,
              assignedTo: L1,
              priority: 'Low',
              category: `Sales ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // C4: HIGH-POTENTIAL CUSTOMER NEGLECT
    // ══════════════════════════════════════════════════════════════════

    const highPotentialNeglected = customerRows.filter(c => {
      const totalBiz = Number(c.total_business || 0);
      if (totalBiz <= 0) return false;
      if (!c.last_offer_date) return true;
      const daysSince = Math.floor((Date.now() - new Date(c.last_offer_date).getTime()) / 86400000);
      return daysSince >= settings.high_value_neglect_days;
    });

    if (highPotentialNeglected.length > 0) {
      const topList = highPotentialNeglected.slice(0, 5).map(c => {
        const daysSince = c.last_offer_date ? Math.floor((Date.now() - new Date(c.last_offer_date).getTime()) / 86400000) : 'N/A';
        return `  • ${c.bp_name} — past business: ${c.currency || ''} ${Number(c.total_business).toLocaleString()} — last offer: ${daysSince}d ago`;
      }).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'high_potential_neglect',
        severity: 'high',
        title: `C4: ${highPotentialNeglected.length} high-potential customers being neglected`,
        description: `Customers with significant past business but no recent engagement.\n\n${topList}${highPotentialNeglected.length > 5 ? `\n  ... and ${highPotentialNeglected.length - 5} more` : ''}`,
        category: 'Sales',
        affectedEntity: { type: 'customers', count: highPotentialNeglected.length },
        businessImpact: `High-value customers are at risk of churning to competitors.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const cust of highPotentialNeglected) {
          const fpL1 = makeFingerprint('high_potential_L1', `cust:${cust.id}`);
          const fpL2 = makeFingerprint('high_potential_L2', `cust:${cust.id}`);
          if (!await hasOpenAgentTask(fpL1) && !await hasCompletedAgentTask(fpL1)) {
            if (await hasRecentAgentTask(fpL1, 30)) continue;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `Re-engage: ${cust.bp_name}`,
              priority: 'medium',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] Re-engage high-value customer: ${cust.bp_name}`,
                description: `Customer ${cust.bp_name} has prior business worth ${cust.currency || ''} ${Number(cust.total_business).toLocaleString()} but hasn't received a new offer recently.\n\nPlease reach out to explore new opportunities.\n\nSource: Sales & Marketing Agent — C4 L1 Assignee Review`,
                assignedTo: L1,
                priority: 'Medium',
                category: `Sales ${fpL1}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L1,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `ESCALATION: Re-engage: ${cust.bp_name}`,
              priority: 'high',
              actionType: 'create_task',
              actionPayload: {
                title: `[Sales] ESCALATION: High-value customer neglected: ${cust.bp_name}`,
                description: `Customer ${cust.bp_name} with prior business worth ${cust.currency || ''} ${Number(cust.total_business).toLocaleString()} still hasn't been re-engaged after L1 review was completed.\n\nEscalated because issue persists after assignee review.\n\nSource: Sales & Marketing Agent — C4 L2 Manager Escalation`,
                assignedTo: L2,
                priority: 'High',
                category: `Sales ${fpL2}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L2,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // D1: GOOGLE ADS — HIGH SPEND LOW CONVERSION CAMPAIGNS
    // ══════════════════════════════════════════════════════════════════

    const highSpendLowConv = gadsCampaignRows.filter(c =>
      Number(c.total_cost_micros) > 0 && Number(c.total_conversions || 0) === 0
    );

    if (highSpendLowConv.length > 0) {
      const topList = highSpendLowConv.map(c =>
        `  • ${c.name} — spend: $${(Number(c.total_cost_micros) / 1000000).toFixed(2)} — 0 conversions`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'gads_high_spend_low_conv',
        severity: 'high',
        title: `D1: ${highSpendLowConv.length} Google Ads campaigns with spend but zero conversions`,
        description: `These campaigns are spending budget without generating conversions.\n\n${topList}`,
        category: 'Digital Marketing',
        affectedEntity: { type: 'campaigns', count: highSpendLowConv.length },
        businessImpact: `Ad budget being wasted on non-converting campaigns.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        const fp = makeFingerprint('gads_no_conv', `batch:${highSpendLowConv.length}`);
        if (!(await hasOpenAgentTask(fp)) && !(await hasRecentAgentTask(fp, 7))) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Review ${highSpendLowConv.length} non-converting campaigns`,
            priority: 'high',
            actionType: 'create_task',
            actionPayload: {
              title: `[Marketing] Review ${highSpendLowConv.length} Google Ads campaigns — zero conversions`,
              description: `The following campaigns have spend but no conversions:\n\n${highSpendLowConv.map(c => `  • ${c.name} — $${(Number(c.total_cost_micros) / 1000000).toFixed(2)}`).join('\n')}\n\nReview targeting, ad copy, and landing pages.\n\nSource: Sales & Marketing Agent — D1`,
              assignedTo: L1,
              priority: 'High',
              category: `Digital Marketing ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // D2: GOOGLE ADS — LOW QUALITY SCORE KEYWORDS
    // ══════════════════════════════════════════════════════════════════

    const lowQualityKw = gadsKeywordRows.filter(k =>
      k.quality_score !== null && Number(k.quality_score) <= settings.gads_low_quality_score
    );

    if (lowQualityKw.length > 0) {
      const topList = lowQualityKw.slice(0, 10).map(k =>
        `  • "${k.text}" — QS: ${k.quality_score} — ${k.campaign_name}`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'gads_low_quality',
        severity: 'medium',
        title: `D2: ${lowQualityKw.length} keywords with quality score ≤${settings.gads_low_quality_score}`,
        description: `Low quality score keywords increase CPC and reduce ad effectiveness.\n\n${topList}${lowQualityKw.length > 10 ? `\n  ... and ${lowQualityKw.length - 10} more` : ''}`,
        category: 'Digital Marketing',
        affectedEntity: { type: 'keywords', count: lowQualityKw.length },
        businessImpact: `Low quality scores drive up cost per click and reduce ad rank.`,
      });
      if (finding) findingsCount++;
    }

    // ══════════════════════════════════════════════════════════════════
    // D3: GOOGLE ADS — WASTED SPEND ON IRRELEVANT SEARCH TERMS
    // ══════════════════════════════════════════════════════════════════

    const wasteSpendTerms = gadsSearchTermRows.filter(st =>
      Number(st.cost_micros) >= settings.gads_waste_spend_threshold * 1000000
    );

    if (wasteSpendTerms.length > 0) {
      const topList = wasteSpendTerms.slice(0, 10).map(st =>
        `  • "${st.search_term}" — $${(Number(st.cost_micros) / 1000000).toFixed(2)} — 0 conversions — ${st.campaign_name}`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'gads_waste_spend',
        severity: 'high',
        title: `D3: ${wasteSpendTerms.length} search terms with wasted spend (≥$${settings.gads_waste_spend_threshold})`,
        description: `These search terms consumed budget without any conversions.\n\n${topList}${wasteSpendTerms.length > 10 ? `\n  ... and ${wasteSpendTerms.length - 10} more` : ''}`,
        category: 'Digital Marketing',
        affectedEntity: { type: 'search_terms', count: wasteSpendTerms.length },
        businessImpact: `Consider adding these as negative keywords to prevent future waste.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation && wasteSpendTerms.length > 0) {
        const fp = makeFingerprint('gads_waste', `batch:${wasteSpendTerms.length}`);
        if (!(await hasOpenAgentTask(fp)) && !(await hasRecentAgentTask(fp, 7))) {
          const rec = await recommendationManager.createRecommendation({
            findingId: finding!.id,
            title: `Add negative keywords for ${wasteSpendTerms.length} wasted search terms`,
            priority: 'high',
            actionType: 'create_task',
            actionPayload: {
              title: `[Marketing] Add negative keywords — ${wasteSpendTerms.length} wasted search terms`,
              description: `These search terms spent budget with zero conversions:\n\n${wasteSpendTerms.slice(0, 10).map(st => `  • "${st.search_term}" — $${(Number(st.cost_micros) / 1000000).toFixed(2)}`).join('\n')}\n\nAdd as negative keywords to reduce waste.\n\nSource: Sales & Marketing Agent — D3`,
              assignedTo: L1,
              priority: 'High',
              category: `Digital Marketing ${fp}`,
            },
            actionCategory: "task_creation",
            logicType: "rule_based",
            confidence: 0.95,
            description: "Auto-generated task from Sales & Marketing Agent",
            assignTo: L1,
          });
          if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // D4: MARKETING CAMPAIGNS OVERBUDGET OR UNDERPERFORMING
    // ══════════════════════════════════════════════════════════════════

    const overbudgetCampaigns = marketingCampaignRows.filter(mc =>
      Number(mc.budget) > 0 && Number(mc.actual_cost) > Number(mc.budget) * settings.campaign_overbudget_pct / 100
    );

    if (overbudgetCampaigns.length > 0) {
      const topList = overbudgetCampaigns.map(mc =>
        `  • ${mc.name} — budget: ${Number(mc.budget).toLocaleString()} — actual: ${Number(mc.actual_cost).toLocaleString()} (${Math.round(Number(mc.actual_cost) / Number(mc.budget) * 100)}%)`
      ).join('\n');
      const finding = await findingManager.createFinding({
        findingType: 'campaign_overbudget',
        severity: 'high',
        title: `D4: ${overbudgetCampaigns.length} marketing campaigns over budget`,
        description: `These campaigns have exceeded their allocated budget.\n\n${topList}`,
        category: 'Digital Marketing',
        affectedEntity: { type: 'campaigns', count: overbudgetCampaigns.length },
        businessImpact: `Budget overruns need immediate review to control marketing spend.`,
      });
      if (finding) findingsCount++;

      if (!skipTaskCreation) {
        for (const mc of overbudgetCampaigns) {
          const fpL1 = makeFingerprint('campaign_overbudget_L1', `campaign:${mc.id}`);
          const fpL2 = makeFingerprint('campaign_overbudget_L2', `campaign:${mc.id}`);
          if (!await hasOpenAgentTask(fpL1) && !await hasCompletedAgentTask(fpL1)) {
            if (await hasRecentAgentTask(fpL1, 14)) continue;
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `Review overbudget campaign: ${mc.name}`,
              priority: 'medium',
              actionType: 'create_task',
              actionPayload: {
                title: `[Marketing] Campaign overbudget: ${mc.name}`,
                description: `Campaign "${mc.name}" has spent ${Number(mc.actual_cost).toLocaleString()} against a budget of ${Number(mc.budget).toLocaleString()} (${Math.round(Number(mc.actual_cost) / Number(mc.budget) * 100)}%).\n\nPlease review and adjust spending or budget.\n\nSource: Sales & Marketing Agent — D4 L1 Assignee Review`,
                assignedTo: L1,
                priority: 'Medium',
                category: `Digital Marketing ${fpL1}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L1,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          } else if (await hasCompletedAgentTask(fpL1) && !await hasOpenAgentTask(fpL2)) {
            const rec = await recommendationManager.createRecommendation({
              findingId: finding!.id,
              title: `ESCALATION: Overbudget campaign: ${mc.name}`,
              priority: 'high',
              actionType: 'create_task',
              actionPayload: {
                title: `[Marketing] ESCALATION: Campaign overbudget: ${mc.name}`,
                description: `Campaign "${mc.name}" is still overbudget after L1 review was completed.\nSpent: ${Number(mc.actual_cost).toLocaleString()} vs budget: ${Number(mc.budget).toLocaleString()} (${Math.round(Number(mc.actual_cost) / Number(mc.budget) * 100)}%).\n\nEscalated because issue persists after assignee review.\n\nSource: Sales & Marketing Agent — D4 L2 Manager Escalation`,
                assignedTo: L2,
                priority: 'High',
                category: `Digital Marketing ${fpL2}`,
              },
              actionCategory: "task_creation",
              logicType: "rule_based",
              confidence: 0.95,
              description: "Auto-generated task from Sales & Marketing Agent",
              assignTo: L2,
            });
            if (rec.id > 0) { recommendationsCount++; if (rec.autoApproved) autoExecuteQueue.push(rec.id); }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // OBSERVATIONS M1-M4
    // ══════════════════════════════════════════════════════════════════

    // M1: Pipeline Summary
    const pipelineSummary = new Map<string, number>();
    for (const l of leadRows) {
      const status = l.status_name || 'Unknown';
      pipelineSummary.set(status, (pipelineSummary.get(status) || 0) + 1);
    }
    const pipelineText = Array.from(pipelineSummary.entries()).map(([s, c]) => `${s}: ${c}`).join(', ');
    const m1 = await findingManager.createFinding({
      findingType: 'observation',
      severity: 'low',
      title: `M1: Lead Pipeline — ${leadRows.length} active leads — ${pipelineText}`,
      description: `Current lead pipeline distribution:\n${Array.from(pipelineSummary.entries()).map(([s, c]) => `  • ${s}: ${c} leads`).join('\n')}`,
      category: 'Sales',
      affectedEntity: { type: 'pipeline', count: leadRows.length },
    });
    if (m1) findingsCount++;

    // M2: Offer Conversion Rate
    const totalOffers = offerRows.length;
    const approvedOffers = offerRows.filter(o => o.status === 'Approved' || o.status === 'Converted').length;
    const rejectedOffers = offerRows.filter(o => o.status === 'Rejected').length;
    const convRate = totalOffers > 0 ? ((approvedOffers / totalOffers) * 100).toFixed(1) : '0';
    const m2 = await findingManager.createFinding({
      findingType: 'observation',
      severity: 'low',
      title: `M2: Offer Conversion — ${convRate}% (${approvedOffers}/${totalOffers} approved, ${rejectedOffers} rejected)`,
      description: `Offer performance: ${totalOffers} total, ${approvedOffers} approved/converted, ${rejectedOffers} rejected, ${totalOffers - approvedOffers - rejectedOffers} other statuses.`,
      category: 'Sales',
      affectedEntity: { type: 'offers', count: totalOffers },
    });
    if (m2) findingsCount++;

    // M3: Pipeline Value
    const totalPipelineValue = leadRows.reduce((sum, l) => sum + Number(l.potential_value || 0), 0);
    const weightedValue = leadRows.reduce((sum, l) => sum + Number(l.potential_value || 0) * (Number(l.probability || 0) / 100), 0);
    const m3 = await findingManager.createFinding({
      findingType: 'observation',
      severity: 'low',
      title: `M3: Pipeline Value — Total: ${totalPipelineValue.toLocaleString()} — Weighted: ${weightedValue.toLocaleString()}`,
      description: `Total pipeline value: ${totalPipelineValue.toLocaleString()}\nWeighted (by probability): ${weightedValue.toLocaleString()}\nActive leads: ${leadRows.length}`,
      category: 'Sales',
      affectedEntity: { type: 'pipeline_value', count: leadRows.length },
    });
    if (m3) findingsCount++;

    // M4: Google Ads Summary
    if (gadsCampaignRows.length > 0) {
      const totalSpend = gadsCampaignRows.reduce((s, c) => s + Number(c.total_cost_micros || 0), 0);
      const totalClicks = gadsCampaignRows.reduce((s, c) => s + Number(c.total_clicks || 0), 0);
      const totalConv = gadsCampaignRows.reduce((s, c) => s + Number(c.total_conversions || 0), 0);
      const m4 = await findingManager.createFinding({
        findingType: 'observation',
        severity: 'low',
        title: `M4: Google Ads — $${(totalSpend / 1000000).toFixed(2)} spend, ${totalClicks} clicks, ${totalConv} conversions`,
        description: `Google Ads summary:\n  • Active campaigns: ${gadsCampaignRows.length}\n  • Total spend: $${(totalSpend / 1000000).toFixed(2)}\n  • Clicks: ${totalClicks}\n  • Conversions: ${totalConv}`,
        category: 'Digital Marketing',
        affectedEntity: { type: 'gads', count: gadsCampaignRows.length },
      });
      if (m4) findingsCount++;
    }

    // ══════════════════════════════════════════════════════════════════
    // INTELLIGENCE REPORTS I1-I2
    // ══════════════════════════════════════════════════════════════════

    const today = new Date();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
    const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // I1: Daily Summary
    const dailySummary = [
      `📊 Sales & Marketing Daily Summary — ${dayName}, ${dateStr}`,
      ``,
      `LEADS:`,
      `  • Active leads: ${leadRows.length}`,
      `  • Pipeline: ${pipelineText}`,
      `  • Stale (7d+): ${staleLeads.length}`,
      `  • Escalated (15d+): ${escalatedLeads.length}`,
      `  • Past close date: ${pastCloseDate.length}`,
      `  • Unassigned: ${unassignedLeads.length}`,
      ``,
      `OFFERS:`,
      `  • Total: ${totalOffers}`,
      `  • Conversion rate: ${convRate}%`,
      `  • Expiring soon: ${expiringOffers.length}`,
      `  • Expired (still Sent): ${expiredOffers.length}`,
      `  • Draft stuck: ${stuckDrafts.length}`,
      ``,
      `CUSTOMERS:`,
      `  • Total: ${customerRows.length}`,
      `  • Dormant: ${dormantCustomers.length}`,
      `  • Missing contacts: ${missingContact.length}`,
    ].join('\n');

    const i1 = await insightManager.createInsight({
      title: `Daily Sales Summary — ${dayName}, ${dateStr}`,
      insightType: 'summary',
      content: dailySummary,
      confidence: 1.0,
      supportingFindings: [],
    });
    if (i1) insightsCount++;

    // I2: Weekly Pipeline Report (Mondays)
    if (today.getDay() === 1) {
      const weeklyReport = [
        `📈 Weekly Pipeline Health Report — ${dateStr}`,
        ``,
        `PIPELINE HEALTH:`,
        `  • Total active leads: ${leadRows.length}`,
        `  • Pipeline distribution: ${pipelineText}`,
        `  • Total pipeline value: ${totalPipelineValue.toLocaleString()}`,
        `  • Weighted pipeline value: ${weightedValue.toLocaleString()}`,
        ``,
        `LEAD QUALITY:`,
        `  • Leads stuck 30d+: ${stuckLeads.length}`,
        `  • High-value neglected: ${highValueNeglected.length}`,
        `  • Past close date: ${pastCloseDate.length}`,
        ``,
        `OFFER PERFORMANCE:`,
        `  • Total offers: ${totalOffers}`,
        `  • Approved: ${approvedOffers}`,
        `  • Rejected: ${rejectedOffers}`,
        `  • Conversion rate: ${convRate}%`,
        ``,
        `CUSTOMER HEALTH:`,
        `  • Total customers: ${customerRows.length}`,
        `  • Dormant (${settings.dormant_customer_days}d+): ${dormantCustomers.length}`,
        `  • High-value neglected: ${highPotentialNeglected.length}`,
        gadsCampaignRows.length > 0 ? `\nDIGITAL MARKETING:\n  • Active campaigns: ${gadsCampaignRows.length}` : '',
      ].join('\n');

      const i2 = await insightManager.createInsight({
        title: `Weekly Pipeline Health Report — ${dateStr}`,
        insightType: 'report',
        content: weeklyReport,
        confidence: 1.0,
        supportingFindings: [],
      });
      if (i2) insightsCount++;
    }

    // ══════════════════════════════════════════════════════════════════
    // AUTO-EXECUTE QUEUE
    // ══════════════════════════════════════════════════════════════════

    if (autoExecuteQueue.length > 0 && !skipTaskCreation) {
      try {
        for (const autoRecId of autoExecuteQueue) {
          const rec = await db.execute(sql`
            SELECT id, action_type, action_payload FROM agent_recommendations WHERE id = ${autoRecId}
          `);
          const recRow = (rec.rows as any[])[0];
          if (!recRow) continue;

          const payload = typeof recRow.action_payload === 'string' ? JSON.parse(recRow.action_payload) : recRow.action_payload;

          if ((recRow.action_type === 'create_task' || recRow.action_type === 'task_creation') && payload) {
            const todayStr = today.toISOString().split('T')[0];
            const taskResult = await db.execute(sql`
              INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, category, source_type, source_agent, start_date, finish_date, created_at)
              VALUES (
                ${payload.title}, ${payload.description}, ${payload.assignedTo}, 1,
                ${payload.priority || 'Medium'}, 'pending', ${payload.category || 'Sales'},
                'agent_task', ${SOURCE_AGENT}, ${todayStr}, ${todayStr}, NOW()
              )
              RETURNING id
            `);
            const taskId = (taskResult.rows as any[])[0]?.id;

            await db.execute(sql`
              UPDATE agent_recommendations SET status = 'approved', approved_by = 1 WHERE id = ${autoRecId}
            `);
            await db.execute(sql`
              INSERT INTO agent_actions (recommendation_id, agent_key, action_category, action_type, action_payload, idempotency_key, execution_status, result_data, executed_at)
              VALUES (${autoRecId}, ${this.key}, 'task_creation', 'create_task', ${JSON.stringify(payload)}::jsonb, ${'auto_' + autoRecId + '_' + Date.now()}, 'completed', ${JSON.stringify({ taskId })}::jsonb, NOW())
            `);
            autoExecutedCount++;
          }
        }
      } catch (err: any) {
        console.error(`[SalesMarketing] Auto-execute error:`, err.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[SalesMarketing] Run complete — findings: ${findingsCount}, insights: ${insightsCount}, recommendations: ${recommendationsCount}, tasks created: ${autoExecutedCount}, auto-closed: ${autoClosedCount}`);

    return {
      findingsCount,
      insightsCount,
      recommendationsCount,
      queriesRun,
      executionTimeMs: duration,
      summary: `Sales & Marketing Agent: ${findingsCount} findings, ${insightsCount} insights, ${autoExecutedCount} tasks created, ${autoClosedCount} auto-closed.`,
    };
  }
}

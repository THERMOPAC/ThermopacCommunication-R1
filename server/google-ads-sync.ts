import { db } from './db';
import { sql } from 'drizzle-orm';
import { executeGaql, microsToMoney } from './google-ads-client';

const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || '';

async function acquireLock(jobType: string): Promise<boolean> {
  const lockKey = `sync_${jobType}`;
  try {
    const existing = await db.execute(sql`
      SELECT id, status, started_at FROM gads_sync_jobs 
      WHERE lock_key = ${lockKey} AND status = 'running'
      AND started_at > NOW() - INTERVAL '30 minutes'
    `);
    if (existing.rows && existing.rows.length > 0) {
      console.log(`[Sync] Job ${jobType} already running, skipping`);
      return false;
    }

    await db.execute(sql`
      DELETE FROM gads_sync_jobs WHERE lock_key = ${lockKey}
    `);
    await db.execute(sql`
      INSERT INTO gads_sync_jobs (job_type, status, started_at, lock_key)
      VALUES (${jobType}, 'running', NOW(), ${lockKey})
    `);
    return true;
  } catch (error) {
    console.error(`[Sync] Failed to acquire lock for ${jobType}:`, error);
    return false;
  }
}

async function releaseLock(jobType: string, recordsSynced: number, error?: string): Promise<void> {
  const lockKey = `sync_${jobType}`;
  const status = error ? 'failed' : 'completed';
  await db.execute(sql`
    UPDATE gads_sync_jobs 
    SET status = ${status}, completed_at = NOW(), last_run_at = NOW(),
        records_synced = ${recordsSynced}, error = ${error || null}
    WHERE lock_key = ${lockKey}
  `);
}

export async function syncCampaigns(userId: number): Promise<number> {
  const customerId = CUSTOMER_ID.replace(/-/g, '');
  if (!customerId) throw new Error('GOOGLE_ADS_CUSTOMER_ID not configured');

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      campaign_budget.type,
      campaign.start_date,
      campaign.end_date
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `;

  const results = await executeGaql(userId, customerId, query);

  for (const row of results) {
    const c = row.campaign;
    const b = row.campaignBudget;
    await db.execute(sql`
      INSERT INTO gads_campaigns (google_campaign_id, name, status, advertising_channel_type, budget_amount_micros, budget_type, start_date, end_date, synced_at)
      VALUES (${String(c.id)}, ${c.name}, ${c.status}, ${c.advertisingChannelType || null}, ${b?.amountMicros || null}, ${b?.type || null}, ${c.startDate || null}, ${c.endDate || null}, NOW())
      ON CONFLICT (google_campaign_id) DO UPDATE SET
        name = EXCLUDED.name, status = EXCLUDED.status, advertising_channel_type = EXCLUDED.advertising_channel_type,
        budget_amount_micros = EXCLUDED.budget_amount_micros, budget_type = EXCLUDED.budget_type,
        start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, synced_at = NOW()
    `);
  }

  console.log(`[Sync] Synced ${results.length} campaigns`);
  return results.length;
}

export async function syncAdGroups(userId: number): Promise<number> {
  const customerId = CUSTOMER_ID.replace(/-/g, '');
  if (!customerId) throw new Error('GOOGLE_ADS_CUSTOMER_ID not configured');

  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      ad_group.cpc_bid_micros,
      campaign.id
    FROM ad_group
    WHERE ad_group.status != 'REMOVED'
  `;

  const results = await executeGaql(userId, customerId, query);

  for (const row of results) {
    const ag = row.adGroup;
    const campaignId = row.campaign?.id;
    await db.execute(sql`
      INSERT INTO gads_ad_groups (google_ad_group_id, campaign_id, name, status, type, cpc_bid_micros, synced_at)
      VALUES (${String(ag.id)}, ${String(campaignId)}, ${ag.name}, ${ag.status}, ${ag.type || null}, ${ag.cpcBidMicros || null}, NOW())
      ON CONFLICT (google_ad_group_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id, name = EXCLUDED.name, status = EXCLUDED.status,
        type = EXCLUDED.type, cpc_bid_micros = EXCLUDED.cpc_bid_micros, synced_at = NOW()
    `);
  }

  console.log(`[Sync] Synced ${results.length} ad groups`);
  return results.length;
}

export async function syncKeywords(userId: number): Promise<number> {
  const customerId = CUSTOMER_ID.replace(/-/g, '');
  if (!customerId) throw new Error('GOOGLE_ADS_CUSTOMER_ID not configured');

  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      ad_group.id,
      campaign.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.status != 'REMOVED'
  `;

  const results = await executeGaql(userId, customerId, query);

  for (const row of results) {
    const kw = row.adGroupCriterion;
    await db.execute(sql`
      INSERT INTO gads_keywords (google_criterion_id, ad_group_id, campaign_id, text, match_type, status, quality_score, synced_at)
      VALUES (${String(kw.criterionId)}, ${String(row.adGroup?.id)}, ${String(row.campaign?.id)}, ${kw.keyword?.text || ''}, ${kw.keyword?.matchType || 'UNSPECIFIED'}, ${kw.status}, ${kw.qualityInfo?.qualityScore || null}, NOW())
      ON CONFLICT (google_criterion_id) DO UPDATE SET
        ad_group_id = EXCLUDED.ad_group_id, campaign_id = EXCLUDED.campaign_id,
        text = EXCLUDED.text, match_type = EXCLUDED.match_type, status = EXCLUDED.status,
        quality_score = EXCLUDED.quality_score, synced_at = NOW()
    `);
  }

  console.log(`[Sync] Synced ${results.length} keywords`);
  return results.length;
}

export async function syncDailyMetrics(userId: number, startDate: string, endDate: string): Promise<number> {
  const customerId = CUSTOMER_ID.replace(/-/g, '');
  if (!customerId) throw new Error('GOOGLE_ADS_CUSTOMER_ID not configured');

  const query = `
    SELECT
      campaign.id,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    AND campaign.status != 'REMOVED'
  `;

  const results = await executeGaql(userId, customerId, query);

  for (const row of results) {
    const m = row.metrics;
    const campaignId = String(row.campaign?.id);
    const date = row.segments?.date;
    await db.execute(sql`
      INSERT INTO gads_daily_metrics (entity_type, entity_id, date, impressions, clicks, cost_micros, conversions, conversion_value, all_conversions, synced_at)
      VALUES ('campaign', ${campaignId}, ${date}, ${m.impressions || 0}, ${m.clicks || 0}, ${m.costMicros || '0'}, ${m.conversions || '0'}, ${m.conversionsValue || '0'}, ${m.allConversions || '0'}, NOW())
      ON CONFLICT ON CONSTRAINT gads_daily_metrics_unique DO UPDATE SET
        impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, cost_micros = EXCLUDED.cost_micros,
        conversions = EXCLUDED.conversions, conversion_value = EXCLUDED.conversion_value,
        all_conversions = EXCLUDED.all_conversions, synced_at = NOW()
    `);
  }

  console.log(`[Sync] Synced ${results.length} daily metric rows`);
  return results.length;
}

export async function syncSearchTerms(userId: number, startDate: string, endDate: string): Promise<number> {
  const customerId = CUSTOMER_ID.replace(/-/g, '');
  if (!customerId) throw new Error('GOOGLE_ADS_CUSTOMER_ID not configured');

  const query = `
    SELECT
      campaign.id,
      ad_group.id,
      search_term_view.search_term,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;

  const results = await executeGaql(userId, customerId, query);

  await db.execute(sql`
    DELETE FROM gads_search_terms WHERE date BETWEEN ${startDate} AND ${endDate}
  `);

  for (const row of results) {
    const m = row.metrics;
    await db.execute(sql`
      INSERT INTO gads_search_terms (campaign_id, ad_group_id, search_term, impressions, clicks, cost_micros, conversions, date, synced_at)
      VALUES (${String(row.campaign?.id)}, ${String(row.adGroup?.id)}, ${row.searchTermView?.searchTerm || ''}, ${m.impressions || 0}, ${m.clicks || 0}, ${m.costMicros || '0'}, ${m.conversions || '0'}, ${row.segments?.date}, NOW())
    `);
  }

  console.log(`[Sync] Synced ${results.length} search terms`);
  return results.length;
}

function getDateRange(period: string): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const endDate = fmt(today);

  switch (period) {
    case 'today':
      return { startDate: endDate, endDate };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: fmt(yesterday), endDate: fmt(yesterday) };
    }
    case 'last_7_days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { startDate: fmt(d), endDate };
    }
    case 'last_30_days': {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { startDate: fmt(d), endDate };
    }
    case 'this_month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: fmt(d), endDate };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: fmt(start), endDate: fmt(end) };
    }
    default:
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { startDate: fmt(d), endDate };
  }
}

export async function runFullSync(userId: number, period = 'last_30_days'): Promise<{ campaigns: number; adGroups: number; keywords: number; metrics: number; searchTerms: number }> {
  if (!await acquireLock('full')) {
    throw new Error('A sync job is already running. Please wait for it to complete.');
  }

  let totalRecords = 0;
  const results = { campaigns: 0, adGroups: 0, keywords: 0, metrics: 0, searchTerms: 0 };

  try {
    results.campaigns = await syncCampaigns(userId);
    totalRecords += results.campaigns;

    results.adGroups = await syncAdGroups(userId);
    totalRecords += results.adGroups;

    results.keywords = await syncKeywords(userId);
    totalRecords += results.keywords;

    const { startDate, endDate } = getDateRange(period);

    try {
      results.metrics = await syncDailyMetrics(userId, startDate, endDate);
      totalRecords += results.metrics;
    } catch (err: any) {
      console.error('[Sync] Metrics sync error (non-fatal):', err.message);
    }

    try {
      results.searchTerms = await syncSearchTerms(userId, startDate, endDate);
      totalRecords += results.searchTerms;
    } catch (err: any) {
      console.error('[Sync] Search terms sync error (non-fatal):', err.message);
    }

    await releaseLock('full', totalRecords);
    console.log(`[Sync] Full sync completed: ${totalRecords} total records`);
    return results;
  } catch (error: any) {
    await releaseLock('full', totalRecords, error.message);
    throw error;
  }
}

export async function runMetricsSync(userId: number, period = 'last_7_days'): Promise<number> {
  if (!await acquireLock('metrics')) {
    throw new Error('A metrics sync job is already running.');
  }

  try {
    const { startDate, endDate } = getDateRange(period);
    const count = await syncDailyMetrics(userId, startDate, endDate);
    await releaseLock('metrics', count);
    return count;
  } catch (error: any) {
    await releaseLock('metrics', 0, error.message);
    throw error;
  }
}

export async function getSyncStatus(): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT job_type, status, started_at, completed_at, records_synced, error, last_run_at
    FROM gads_sync_jobs ORDER BY started_at DESC
  `);
  return result.rows;
}

let structureTimer: NodeJS.Timeout | null = null;
let metricsTimer: NodeJS.Timeout | null = null;
let defaultUserId: number | null = null;

export function startSyncTimers(userId: number): void {
  defaultUserId = userId;
  stopSyncTimers();

  structureTimer = setInterval(async () => {
    if (!defaultUserId) return;
    try {
      console.log('[Sync] Running scheduled structure sync...');
      await syncCampaigns(defaultUserId);
      await syncAdGroups(defaultUserId);
      await syncKeywords(defaultUserId);
    } catch (err: any) {
      console.error('[Sync] Scheduled structure sync error:', err.message);
    }
  }, 6 * 60 * 60 * 1000);

  metricsTimer = setInterval(async () => {
    if (!defaultUserId) return;
    try {
      console.log('[Sync] Running scheduled metrics sync...');
      await runMetricsSync(defaultUserId, 'last_7_days');
    } catch (err: any) {
      console.error('[Sync] Scheduled metrics sync error:', err.message);
    }
  }, 60 * 60 * 1000);

  console.log('[Sync] Sync timers started (structure: 6h, metrics: 1h)');
}

export function stopSyncTimers(): void {
  if (structureTimer) { clearInterval(structureTimer); structureTimer = null; }
  if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
}

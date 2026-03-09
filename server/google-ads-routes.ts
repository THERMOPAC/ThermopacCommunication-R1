import { Router, Request, Response } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { getGoogleAdsAuthUrl, exchangeGoogleAdsCode, saveGoogleAdsTokens, getGoogleAdsTokens, deleteGoogleAdsTokens } from './google-ads-auth';
import { listAccessibleCustomers, getCustomerInfo, executeGaql, microsToMoney } from './google-ads-client';
import { runFullSync, runMetricsSync, getSyncStatus, startSyncTimers, stopSyncTimers } from './google-ads-sync';

const router = Router();

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Authentication required' });
}

router.get('/connection-status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const tokens = await getGoogleAdsTokens(req.user!.id);
    const developerToken = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || '';

    res.json({
      connected: !!tokens,
      hasTokens: !!tokens,
      hasDeveloperToken: developerToken,
      hasCustomerId: !!customerId,
      customerId: customerId ? customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : '',
      tokenExpiry: tokens?.tokenExpiry || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth-url', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const url = getGoogleAdsAuthUrl(req.user!.id);
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disconnect', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    await deleteGoogleAdsTokens(req.user!.id);
    stopSyncTimers();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/accessible-customers', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const customerIds = await listAccessibleCustomers(req.user!.id);
    const customers = [];

    for (const cid of customerIds) {
      try {
        const info = await getCustomerInfo(req.user!.id, cid);
        customers.push({
          customerId: cid,
          descriptiveName: info?.descriptiveName || `Account ${cid}`,
          currencyCode: info?.currencyCode || 'USD',
          timeZone: info?.timeZone || 'UTC',
          isManager: info?.manager || false,
        });
      } catch {
        customers.push({
          customerId: cid,
          descriptiveName: `Account ${cid}`,
          currencyCode: 'USD',
          timeZone: 'UTC',
          isManager: false,
        });
      }
    }

    res.json(customers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard/metrics', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(clicks), 0) as total_clicks,
        COALESCE(SUM(CAST(cost_micros AS NUMERIC)), 0) as total_cost_micros,
        COALESCE(SUM(CAST(conversions AS NUMERIC)), 0) as total_conversions,
        COALESCE(SUM(CAST(conversion_value AS NUMERIC)), 0) as total_conversion_value
      FROM gads_daily_metrics
      WHERE entity_type = 'campaign'
      AND date >= ${startDate as string}
      AND date <= ${endDate as string}
    `);

    const row = result.rows[0] as any;
    const totalImpressions = Number(row?.total_impressions || 0);
    const totalClicks = Number(row?.total_clicks || 0);
    const totalCostMicros = Number(row?.total_cost_micros || 0);
    const totalConversions = Number(row?.total_conversions || 0);
    const totalConversionValue = Number(row?.total_conversion_value || 0);
    const totalSpend = totalCostMicros / 1_000_000;

    res.json({
      totalSpend,
      totalImpressions,
      totalClicks,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0,
      avgCpc: totalClicks > 0 ? (totalSpend / totalClicks) : 0,
      totalConversions,
      costPerConversion: totalConversions > 0 ? (totalSpend / totalConversions) : 0,
      roas: totalSpend > 0 ? (totalConversionValue / totalSpend) : 0,
      totalConversionValue,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard/daily-spend', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const result = await db.execute(sql`
      SELECT
        date,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(CAST(cost_micros AS NUMERIC)) as cost_micros,
        SUM(CAST(conversions AS NUMERIC)) as conversions
      FROM gads_daily_metrics
      WHERE entity_type = 'campaign'
      AND date >= ${startDate as string}
      AND date <= ${endDate as string}
      GROUP BY date
      ORDER BY date ASC
    `);

    const data = (result.rows as any[]).map(row => ({
      date: row.date,
      spend: Number(row.cost_micros || 0) / 1_000_000,
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      conversions: Number(row.conversions || 0),
    }));

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/campaigns', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let metricsJoin = '';
    let metricsSelect = '';
    if (startDate && endDate) {
      metricsSelect = `,
        COALESCE(m.impressions, 0) as impressions,
        COALESCE(m.clicks, 0) as clicks,
        COALESCE(m.cost_micros, 0) as cost_micros,
        COALESCE(m.conversions, 0) as conversions,
        COALESCE(m.conversion_value, 0) as conversion_value`;
    }

    const result = await db.execute(sql`
      SELECT c.*,
        COALESCE(ms.impressions, 0) as impressions,
        COALESCE(ms.clicks, 0) as clicks,
        COALESCE(ms.cost_micros, 0) as cost_micros,
        COALESCE(ms.conversions, 0) as conversions,
        COALESCE(ms.conversion_value, 0) as conversion_value
      FROM gads_campaigns c
      LEFT JOIN LATERAL (
        SELECT
          SUM(dm.impressions) as impressions,
          SUM(dm.clicks) as clicks,
          SUM(CAST(dm.cost_micros AS NUMERIC)) as cost_micros,
          SUM(CAST(dm.conversions AS NUMERIC)) as conversions,
          SUM(CAST(dm.conversion_value AS NUMERIC)) as conversion_value
        FROM gads_daily_metrics dm
        WHERE dm.entity_type = 'campaign'
        AND dm.entity_id = c.google_campaign_id
        AND (${startDate as string || '1900-01-01'} = '1900-01-01' OR dm.date >= ${startDate as string || '1900-01-01'})
        AND (${endDate as string || '2100-01-01'} = '2100-01-01' OR dm.date <= ${endDate as string || '2100-01-01'})
      ) ms ON TRUE
      ORDER BY CAST(COALESCE(ms.cost_micros, 0) AS NUMERIC) DESC
    `);

    const campaigns = (result.rows as any[]).map(row => ({
      id: row.id,
      googleCampaignId: row.google_campaign_id,
      name: row.name,
      status: row.status,
      advertisingChannelType: row.advertising_channel_type,
      budgetAmount: row.budget_amount_micros ? Number(row.budget_amount_micros) / 1_000_000 : 0,
      budgetType: row.budget_type,
      startDate: row.start_date,
      endDate: row.end_date,
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      spend: Number(row.cost_micros || 0) / 1_000_000,
      conversions: Number(row.conversions || 0),
      conversionValue: Number(row.conversion_value || 0),
      ctr: Number(row.impressions || 0) > 0 ? ((Number(row.clicks || 0) / Number(row.impressions || 0)) * 100) : 0,
      avgCpc: Number(row.clicks || 0) > 0 ? ((Number(row.cost_micros || 0) / 1_000_000) / Number(row.clicks || 0)) : 0,
      roas: (Number(row.cost_micros || 0) / 1_000_000) > 0 ? (Number(row.conversion_value || 0) / (Number(row.cost_micros || 0) / 1_000_000)) : 0,
    }));

    res.json(campaigns);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/campaigns/:id/details', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;

    const campaignResult = await db.execute(sql`
      SELECT * FROM gads_campaigns WHERE google_campaign_id = ${campaignId}
    `);

    const adGroupsResult = await db.execute(sql`
      SELECT * FROM gads_ad_groups WHERE campaign_id = ${campaignId}
    `);

    const keywordsResult = await db.execute(sql`
      SELECT * FROM gads_keywords WHERE campaign_id = ${campaignId}
    `);

    res.json({
      campaign: campaignResult.rows[0] || null,
      adGroups: adGroupsResult.rows,
      keywords: keywordsResult.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/keywords', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT k.*, c.name as campaign_name, ag.name as ad_group_name
      FROM gads_keywords k
      LEFT JOIN gads_campaigns c ON k.campaign_id = c.google_campaign_id
      LEFT JOIN gads_ad_groups ag ON k.ad_group_id = ag.google_ad_group_id
      ORDER BY k.quality_score DESC NULLS LAST
    `);

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search-terms', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const result = await db.execute(sql`
      SELECT st.*, c.name as campaign_name
      FROM gads_search_terms st
      LEFT JOIN gads_campaigns c ON st.campaign_id = c.google_campaign_id
      WHERE (${startDate as string || '1900-01-01'} = '1900-01-01' OR st.date >= ${startDate as string || '1900-01-01'})
      AND (${endDate as string || '2100-01-01'} = '2100-01-01' OR st.date <= ${endDate as string || '2100-01-01'})
      ORDER BY CAST(st.cost_micros AS NUMERIC) DESC
    `);

    const terms = (result.rows as any[]).map(row => ({
      ...row,
      spend: Number(row.cost_micros || 0) / 1_000_000,
      ctr: Number(row.impressions || 0) > 0 ? ((Number(row.clicks || 0) / Number(row.impressions || 0)) * 100) : 0,
    }));

    res.json(terms);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync/full', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const period = (req.body.period as string) || 'last_30_days';
    const result = await runFullSync(req.user!.id, period);
    startSyncTimers(req.user!.id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync/metrics', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const period = (req.body.period as string) || 'last_7_days';
    const count = await runMetricsSync(req.user!.id, period);
    res.json({ success: true, recordsSynced: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/diagnostic', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || '';
    const cleanCustomerId = customerId.replace(/-/g, '');
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
    const diagnostics: any = { customerId: cleanCustomerId, devTokenLength: devToken.length, tests: [] };

    const { getValidAccessToken } = await import('./google-ads-auth');
    const accessToken = await getValidAccessToken(userId);
    diagnostics.hasToken = !!accessToken;
    diagnostics.tokenPreview = accessToken ? accessToken.substring(0, 20) + '...' : 'none';

    for (const version of ['v19', 'v18', 'v17']) {
      for (const endpoint of ['search', 'searchStream']) {
        try {
          const testUrl = `https://googleads.googleapis.com/${version}/customers/${cleanCustomerId}/googleAds:${endpoint}`;
          const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': devToken,
            'Content-Type': 'application/json',
          };
          const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
          if (loginCustomerId) {
            headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
          }
          const resp = await fetch(testUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1' }),
          });
          const body = await resp.text();
          diagnostics.tests.push({
            version,
            endpoint,
            status: resp.status,
            ok: resp.ok,
            body: body.substring(0, 800),
          });
          if (resp.ok) break;
        } catch (err: any) {
          diagnostics.tests.push({ version, endpoint, error: err.message });
        }
      }
    }

    for (const version of ['v19', 'v18', 'v17']) {
      try {
        const listUrl = `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`;
        const resp = await fetch(listUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': devToken,
          },
        });
        const body = await resp.text();
        diagnostics[`listAccessible_${version}`] = { status: resp.status, body: body.substring(0, 500) };
        if (resp.ok) break;
      } catch (err: any) {
        diagnostics[`listAccessible_${version}`] = { error: err.message };
      }
    }

    res.json(diagnostics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/design-doc', ensureAuthenticated, async (req: Request, res: Response) => {
  const path = await import('path');
  const filePath = path.resolve('Google_Ads_API_Design_Document.doc');
  res.download(filePath, 'Google_Ads_API_Design_Document.doc');
});

export default router;

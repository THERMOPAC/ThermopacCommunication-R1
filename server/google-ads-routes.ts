import { Router, Request, Response } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { getGoogleAdsAuthUrl, exchangeGoogleAdsCode, saveGoogleAdsTokens, getGoogleAdsTokens, deleteGoogleAdsTokens } from './google-ads-auth';
import { listAccessibleCustomers, getCustomerInfo, executeGaql, microsToMoney, moneyToMicros, createCampaignBudget, createCampaign, updateCampaignStatus, updateCampaignBudget, createAdGroup, updateAdGroupStatus, addKeywords, addNegativeKeywords, removeKeyword, createResponsiveSearchAd } from './google-ads-client';
import { runFullSync, runMetricsSync, getSyncStatus, startSyncTimers, stopSyncTimers } from './google-ads-sync';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

router.post('/campaigns/create', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { name, dailyBudget, advertisingChannelType, advertisingChannelSubType, status, startDate, endDate, targetCpa, targetRoas, targetCpv, videoBiddingStrategy, biddingStrategyType } = req.body;

    if (!name || !dailyBudget || !advertisingChannelType) {
      return res.status(400).json({ error: 'Name, daily budget, and campaign type are required' });
    }

    const budgetMicros = moneyToMicros(Number(dailyBudget));
    const budgetResourceName = await createCampaignBudget(userId, customerId, name, budgetMicros);

    const networkSettings: any = {
      targetGoogleSearch: advertisingChannelType === 'SEARCH',
      targetSearchNetwork: advertisingChannelType === 'SEARCH',
      targetContentNetwork: advertisingChannelType === 'DISPLAY',
    };
    if (advertisingChannelType === 'VIDEO') {
      networkSettings.targetGoogleSearch = false;
      networkSettings.targetSearchNetwork = false;
      networkSettings.targetContentNetwork = false;
      networkSettings.targetPartnerSearchNetwork = false;
    }

    const effectiveVideoBidding = videoBiddingStrategy || (advertisingChannelType === 'VIDEO' ? biddingStrategyType : undefined);

    const campaignResourceName = await createCampaign(userId, customerId, {
      name,
      budgetResourceName,
      advertisingChannelType,
      advertisingChannelSubType: advertisingChannelSubType || undefined,
      status: status || 'PAUSED',
      startDate,
      endDate,
      targetCpa: targetCpa ? Number(targetCpa) : undefined,
      targetRoas: targetRoas ? Number(targetRoas) : undefined,
      targetCpv: targetCpv ? Number(targetCpv) : undefined,
      videoBiddingStrategy: effectiveVideoBidding,
      biddingStrategyType: biddingStrategyType || undefined,
      networkSettings,
    });

    res.json({ success: true, resourceName: campaignResourceName });
  } catch (error: any) {
    console.error('[GoogleAds] Create campaign error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/campaigns/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const campaignId = req.params.id;
    const { status } = req.body;

    if (!['ENABLED', 'PAUSED', 'REMOVED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ENABLED, PAUSED, or REMOVED' });
    }

    const resourceName = `customers/${customerId}/campaigns/${campaignId}`;
    await updateCampaignStatus(userId, customerId, resourceName, status);

    await db.execute(sql`
      UPDATE gads_campaigns SET status = ${status} WHERE google_campaign_id = ${campaignId}
    `);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[GoogleAds] Update campaign status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/campaigns/:id/budget', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const campaignId = req.params.id;
    const { dailyBudget } = req.body;

    if (!dailyBudget) {
      return res.status(400).json({ error: 'Daily budget is required' });
    }

    const campaignResult = await db.execute(sql`
      SELECT budget_resource_name FROM gads_campaigns WHERE google_campaign_id = ${campaignId}
    `);

    const campaign = campaignResult.rows[0] as any;
    if (!campaign?.budget_resource_name) {
      return res.status(404).json({ error: 'Campaign budget not found. Try syncing first.' });
    }

    const budgetMicros = moneyToMicros(Number(dailyBudget));
    await updateCampaignBudget(userId, customerId, campaign.budget_resource_name, budgetMicros);

    await db.execute(sql`
      UPDATE gads_campaigns SET budget_amount_micros = ${String(budgetMicros)} WHERE google_campaign_id = ${campaignId}
    `);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[GoogleAds] Update budget error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/ad-groups/create', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { name, campaignId, cpcBid, type } = req.body;

    if (!name || !campaignId) {
      return res.status(400).json({ error: 'Name and campaign ID are required' });
    }

    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    const adGroupResourceName = await createAdGroup(userId, customerId, {
      name,
      campaignResourceName,
      type: type || 'SEARCH_STANDARD',
      cpcBidMicros: cpcBid ? moneyToMicros(Number(cpcBid)) : undefined,
      status: 'ENABLED',
    });

    res.json({ success: true, resourceName: adGroupResourceName });
  } catch (error: any) {
    console.error('[GoogleAds] Create ad group error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/ad-groups/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const adGroupId = req.params.id;
    const { status } = req.body;

    const resourceName = `customers/${customerId}/adGroups/${adGroupId}`;
    await updateAdGroupStatus(userId, customerId, resourceName, status);

    await db.execute(sql`
      UPDATE gads_ad_groups SET status = ${status} WHERE google_ad_group_id = ${adGroupId}
    `);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[GoogleAds] Update ad group status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/keywords/add', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { adGroupId, keywords } = req.body;

    if (!adGroupId || !keywords?.length) {
      return res.status(400).json({ error: 'Ad group ID and keywords are required' });
    }

    const adGroupResourceName = `customers/${customerId}/adGroups/${adGroupId}`;
    const result = await addKeywords(userId, customerId, adGroupResourceName, keywords);

    res.json({ success: true, added: result.results?.length || 0 });
  } catch (error: any) {
    console.error('[GoogleAds] Add keywords error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/keywords/:criterionId/remove', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { adGroupId } = req.body;
    const criterionId = req.params.criterionId;

    const resourceName = `customers/${customerId}/adGroupCriteria/${adGroupId}~${criterionId}`;
    await removeKeyword(userId, customerId, resourceName);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[GoogleAds] Remove keyword error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/negative-keywords/add', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { campaignId, keywords } = req.body;

    if (!campaignId || !keywords?.length) {
      return res.status(400).json({ error: 'Campaign ID and keywords are required' });
    }

    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    const result = await addNegativeKeywords(userId, customerId, campaignResourceName, keywords);

    res.json({ success: true, added: result.results?.length || 0 });
  } catch (error: any) {
    console.error('[GoogleAds] Add negative keywords error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/ads/create', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { adGroupId, headlines, descriptions, finalUrl, path1, path2 } = req.body;

    if (!adGroupId || !headlines?.length || !descriptions?.length || !finalUrl) {
      return res.status(400).json({ error: 'Ad group ID, headlines, descriptions, and final URL are required' });
    }

    if (headlines.length < 3) return res.status(400).json({ error: 'At least 3 headlines are required' });
    if (descriptions.length < 2) return res.status(400).json({ error: 'At least 2 descriptions are required' });

    const adGroupResourceName = `customers/${customerId}/adGroups/${adGroupId}`;
    const result = await createResponsiveSearchAd(userId, customerId, adGroupResourceName, {
      headlines, descriptions, finalUrl, path1, path2,
    });

    res.json({ success: true, resourceName: result });
  } catch (error: any) {
    console.error('[GoogleAds] Create ad error:', error.message);
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

router.post('/ai/campaign-suggestions', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { objective, product, targetAudience, geography, monthlyBudget, campaignType } = req.body;

    const existingCampaigns = await db.execute(sql`
      SELECT name, status, advertising_channel_type, budget_amount_micros FROM gads_campaigns LIMIT 20
    `);
    const existingKeywords = await db.execute(sql`
      SELECT text, match_type, quality_score FROM gads_keywords WHERE status = 'ENABLED' LIMIT 50
    `);

    const prompt = `You are a Google Ads expert for THERMOPAC, an industrial manufacturing company specializing in:
- Heat exchangers (shell & tube, plate type)
- Thermic fluid heaters
- Hot water generators
- Steam boilers
- Hot air generators  
- Waste heat recovery systems
- Re-refining and distillation plants/skids
- Dehydration skids

The user wants to create a new ${campaignType || 'SEARCH'} campaign.

Campaign objective: ${objective || 'Generate qualified leads'}
Product/service focus: ${product || 'All products'}
Target audience: ${targetAudience || 'Industrial buyers, plant managers, procurement teams'}
Target geography: ${geography || 'India, Middle East, Africa'}
Monthly budget: INR ${monthlyBudget || '15000'}

Existing campaigns: ${JSON.stringify(existingCampaigns.rows?.slice(0, 10) || [])}
Existing keywords (performing): ${JSON.stringify(existingKeywords.rows?.slice(0, 20) || [])}

Provide intelligent recommendations in JSON format:
{
  "campaignName": "suggested campaign name",
  "biddingStrategy": {
    "recommended": "MAXIMIZE_CONVERSIONS | TARGET_CPA | MANUAL_CPC | TARGET_ROAS | TARGET_CPV | TARGET_CPM",
    "reason": "why this strategy is best for their situation",
    "targetValue": null or number (CPA in INR or ROAS multiplier)
  },
  "dailyBudget": {
    "recommended": number in INR,
    "reason": "budget justification"
  },
  "adGroups": [
    {
      "name": "ad group name",
      "theme": "what this group targets",
      "keywords": [
        {"text": "keyword", "matchType": "BROAD|PHRASE|EXACT", "reason": "why this keyword"}
      ],
      "negativeKeywords": ["negative keyword 1"],
      "headlines": ["headline 1 (max 30 chars)", "headline 2", "headline 3"],
      "descriptions": ["description 1 (max 90 chars)", "description 2"]
    }
  ],
  "audienceSignals": ["audience type 1", "audience type 2"],
  "geoTargets": ["location 1", "location 2"],
  "scheduleRecommendation": "when to run ads (e.g. weekdays 9am-6pm IST)",
  "optimizationTips": ["tip 1", "tip 2", "tip 3"],
  "avoidKeywords": ["keywords to add as negatives across account"]
}

Important:
- For a new account with no conversion data, recommend MANUAL_CPC or MAXIMIZE_CLICKS to gather data first, then switch to smart bidding after 30+ conversions
- If they have conversion history, recommend TARGET_CPA or MAXIMIZE_CONVERSIONS
- Consider the industrial B2B nature - longer sales cycles, higher CPA is acceptable
- Suggest 3-5 tightly themed ad groups
- Each ad group should have 10-15 keywords mixing match types
- Headlines must be under 30 characters, descriptions under 90 characters
- Include industry-specific negative keywords (jobs, salary, PDF, free, etc.)`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const suggestions = JSON.parse(completion.choices[0].message.content || '{}');
    res.json(suggestions);
  } catch (error: any) {
    console.error('[GoogleAds] AI suggestion error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/ad-copy', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { product, keywords, tone, language } = req.body;

    const prompt = `Generate Google Ads responsive search ad copy for THERMOPAC (industrial equipment manufacturer).

Product/service: ${product || 'Industrial heating equipment'}
Target keywords: ${(keywords || []).join(', ') || 'heat exchanger, boiler, thermic fluid heater'}
Tone: ${tone || 'Professional, technical, trustworthy'}
Language: ${language || 'English'}

Generate in JSON format:
{
  "headlines": ["exactly 15 headlines, each max 30 characters"],
  "descriptions": ["exactly 4 descriptions, each max 90 characters"],
  "displayPaths": ["path1 (max 15 chars)", "path2 (max 15 chars)"],
  "callToAction": "recommended CTA"
}

Rules:
- Include power words: Certified, ISO, Custom, Expert, Since 1987
- Include CTAs: Get Quote, Call Now, Request Demo
- Mix brand + product + benefit headlines
- Each headline MUST be 30 characters or less
- Each description MUST be 90 characters or less
- Make descriptions compelling with USPs`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const adCopy = JSON.parse(completion.choices[0].message.content || '{}');
    res.json(adCopy);
  } catch (error: any) {
    console.error('[GoogleAds] AI ad copy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;

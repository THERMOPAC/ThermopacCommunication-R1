import { Router, Request, Response } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { getGoogleAdsAuthUrl, exchangeGoogleAdsCode, saveGoogleAdsTokens, getGoogleAdsTokens, deleteGoogleAdsTokens } from './google-ads-auth';
import { listAccessibleCustomers, getCustomerInfo, executeGaql, microsToMoney, moneyToMicros, createCampaignBudget, createCampaign, updateCampaignStatus, updateCampaignBudget, createAdGroup, updateAdGroupStatus, addKeywords, addNegativeKeywords, removeKeyword, createResponsiveSearchAd, setCampaignLanguages, getCampaignLanguages, GOOGLE_ADS_LANGUAGES, setCampaignLocations, getCampaignLocations, GOOGLE_ADS_COUNTRIES } from './google-ads-client';
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

router.post('/campaigns/preview', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { name, dailyBudget, advertisingChannelType, advertisingChannelSubType, status, startDate, endDate, targetCpa, targetRoas, targetCpv, videoBiddingStrategy, biddingStrategyType, languages, locations, targetSearchNetwork } = req.body;

    const validationErrors: string[] = [];
    if (!name) validationErrors.push('Campaign name is required.');
    if (!dailyBudget) validationErrors.push('Daily budget is required.');
    if (!advertisingChannelType) validationErrors.push('Campaign type is required.');
    if (name && name.length > 128) validationErrors.push(`Campaign name too long (${name.length}/128 chars).`);
    if (startDate) {
      const today = new Date().toISOString().split('T')[0];
      if (startDate < today) validationErrors.push('Start date is in the past.');
    }
    if (startDate && endDate && endDate <= startDate) validationErrors.push('End date must be after start date.');

    const budgetMicros = moneyToMicros(Number(dailyBudget || 0));
    const monthlyEstimate = (Number(dailyBudget || 0) * 30.4).toFixed(2);

    const includeSearchPartners = targetSearchNetwork !== undefined ? targetSearchNetwork : false;
    const networkSettings: any = {
      targetGoogleSearch: advertisingChannelType === 'SEARCH',
      targetSearchNetwork: advertisingChannelType === 'SEARCH' ? includeSearchPartners : false,
      targetContentNetwork: advertisingChannelType === 'DISPLAY',
    };
    if (advertisingChannelType === 'VIDEO' || advertisingChannelType === 'DEMAND_GEN') {
      networkSettings.targetGoogleSearch = false;
      networkSettings.targetSearchNetwork = false;
      networkSettings.targetContentNetwork = false;
      networkSettings.targetPartnerSearchNetwork = false;
    }

    let biddingConfig: any = {};
    const strategy = biddingStrategyType || 'MANUAL_CPC';
    if (advertisingChannelType === 'SEARCH' || advertisingChannelType === 'DISPLAY') {
      if (strategy === 'TARGET_CPA' && targetCpa) {
        biddingConfig = { type: 'TARGET_CPA', targetCpaMicros: String(moneyToMicros(Number(targetCpa))), targetCpaDisplay: `INR ${targetCpa}` };
      } else if (strategy === 'TARGET_ROAS' && targetRoas) {
        biddingConfig = { type: 'TARGET_ROAS', targetRoas: Number(targetRoas), display: `${(Number(targetRoas) * 100).toFixed(0)}% return` };
      } else if (strategy === 'MAXIMIZE_CONVERSIONS') {
        biddingConfig = { type: 'MAXIMIZE_CONVERSIONS' };
      } else if (strategy === 'MAXIMIZE_CLICKS') {
        biddingConfig = { type: 'MAXIMIZE_CLICKS' };
      } else {
        biddingConfig = { type: 'MANUAL_CPC', enhancedCpcEnabled: true };
      }
    } else if (advertisingChannelType === 'DEMAND_GEN') {
      if (strategy === 'TARGET_CPA' && targetCpa) {
        biddingConfig = { type: 'TARGET_CPA', targetCpaMicros: String(moneyToMicros(Number(targetCpa))), targetCpaDisplay: `INR ${targetCpa}` };
      } else if (strategy === 'MAXIMIZE_CONVERSION_VALUE') {
        biddingConfig = { type: 'MAXIMIZE_CONVERSION_VALUE' };
      } else if (strategy === 'MAXIMIZE_CONVERSIONS') {
        biddingConfig = { type: 'MAXIMIZE_CONVERSIONS' };
      } else {
        biddingConfig = { type: 'MAXIMIZE_CLICKS' };
      }
    } else if (advertisingChannelType === 'PERFORMANCE_MAX') {
      if (strategy === 'TARGET_ROAS' && targetRoas) {
        biddingConfig = { type: 'TARGET_ROAS', targetRoas: Number(targetRoas) };
      } else {
        biddingConfig = { type: 'MAXIMIZE_CONVERSIONS' };
      }
    } else if (advertisingChannelType === 'VIDEO') {
      const videoStrategy = videoBiddingStrategy || strategy || 'TARGET_CPV';
      biddingConfig = { type: videoStrategy };
      if (videoStrategy === 'TARGET_CPV' && targetCpv) {
        biddingConfig.targetCpv = `INR ${targetCpv}`;
      } else if (videoStrategy === 'TARGET_CPM' && targetCpv) {
        biddingConfig.targetCpm = `INR ${targetCpv}`;
      }
    }

    const languageTargeting = (languages || []).map((code: string) => {
      const lang = GOOGLE_ADS_LANGUAGES[code];
      return lang ? { code, name: lang.name, constantId: lang.id, resourceName: `languageConstants/${lang.id}` } : { code, error: 'Unsupported language code' };
    });

    const locationTargeting = (locations || []).map((code: string) => {
      const country = GOOGLE_ADS_COUNTRIES[code];
      return country ? { code, name: country.name, constantId: country.id, resourceName: `geoTargetConstants/${country.id}` } : { code, error: 'Unsupported country code' };
    });

    const needsConversions = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'TARGET_ROAS'].includes(strategy);
    const warnings: string[] = [];
    if (needsConversions) warnings.push('This bidding strategy requires conversion tracking to be configured in Google Ads.');
    if (advertisingChannelType === 'PERFORMANCE_MAX') warnings.push('Performance Max campaigns require Asset Groups to serve ads. You must add asset groups in Google Ads after creation.');
    if (advertisingChannelType === 'DEMAND_GEN') warnings.push('Demand Gen campaigns need ad assets (images, headlines, descriptions, logos) added in Google Ads after creation. Ads will appear on Gmail, YouTube Home, and Google Discover.');
    if (!languages || languages.length === 0) warnings.push('No language targeting specified.');
    if (!locations || locations.length === 0) warnings.push('No location targeting specified.');

    const apiPayload = {
      campaign: {
        name,
        campaignBudget: `customers/${customerId}/campaignBudgets/[AUTO_GENERATED]`,
        advertisingChannelType,
        advertisingChannelSubType: advertisingChannelSubType || undefined,
        status: status || 'PAUSED',
        startDate: startDate ? startDate.replace(/-/g, '') : undefined,
        endDate: endDate ? endDate.replace(/-/g, '') : undefined,
        networkSettings,
        geoTargetTypeSetting: {
          positiveGeoTargetType: 'PRESENCE',
          negativeGeoTargetType: 'PRESENCE',
        },
        ...( biddingConfig.type === 'MANUAL_CPC' ? { manualCpc: { enhancedCpcEnabled: true } } :
             biddingConfig.type === 'MAXIMIZE_CLICKS' ? { maximizeClicks: {} } :
             biddingConfig.type === 'MAXIMIZE_CONVERSIONS' ? { maximizeConversions: {} } :
             biddingConfig.type === 'TARGET_CPA' ? { targetCpa: { targetCpaMicros: biddingConfig.targetCpaMicros } } :
             biddingConfig.type === 'TARGET_ROAS' ? { maximizeConversionValue: { targetRoas: biddingConfig.targetRoas } } :
             biddingConfig.type === 'TARGET_CPV' ? { manualCpv: {} } :
             biddingConfig.type === 'TARGET_CPM' ? { targetCpm: {} } :
             {}
        ),
      },
      budget: {
        name: `${name}_budget_[TIMESTAMP]`,
        amountMicros: String(budgetMicros),
        amountDisplay: `INR ${dailyBudget}`,
        monthlyEstimate: `INR ${monthlyEstimate}`,
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
      languageTargeting,
      locationTargeting,
      biddingStrategy: biddingConfig,
    };

    res.json({
      preview: true,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      customerId,
      apiVersion: 'v19',
      apiEndpoint: `https://googleads.googleapis.com/v19/customers/${customerId}/campaigns:mutate`,
      apiPayload,
      summary: {
        name,
        type: advertisingChannelType,
        dailyBudget: `INR ${dailyBudget}`,
        monthlyBudget: `INR ${monthlyEstimate}`,
        budgetMicros: String(budgetMicros),
        biddingStrategy: strategy,
        startDate: startDate || 'Not set',
        endDate: endDate || 'No end date',
        languages: languageTargeting.filter((l: any) => !l.error).map((l: any) => l.name),
        locations: locationTargeting.filter((l: any) => !l.error).map((l: any) => l.name),
        searchPartners: advertisingChannelType === 'SEARCH' ? includeSearchPartners : 'N/A',
        geoTargetingMode: 'PRESENCE only (people physically in targeted locations)',
        totalApiCalls: '3 sequential calls: 1. Create Budget → 2. Create Campaign → 3. Set Language+Location Criteria',
      },
    });
  } catch (error: any) {
    console.error('[GoogleAds] Preview error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/campaigns/create', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const { name, dailyBudget, advertisingChannelType, advertisingChannelSubType, status, startDate, endDate, targetCpa, targetRoas, targetCpv, videoBiddingStrategy, biddingStrategyType, languages, locations, targetSearchNetwork } = req.body;

    if (!name || !dailyBudget || !advertisingChannelType) {
      return res.status(400).json({ error: 'Name, daily budget, and campaign type are required' });
    }

    if (name.length > 128) {
      return res.status(400).json({ error: `Campaign name too long (${name.length} chars). Google Ads allows maximum 128 characters.` });
    }

    if (startDate) {
      const today = new Date().toISOString().split('T')[0];
      if (startDate < today) {
        return res.status(400).json({ error: 'Start date cannot be in the past.' });
      }
    }
    if (startDate && endDate && endDate <= startDate) {
      return res.status(400).json({ error: 'End date must be after start date.' });
    }

    const needsConversions = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'TARGET_ROAS'].includes(biddingStrategyType);

    const budgetMicros = moneyToMicros(Number(dailyBudget));
    let budgetResourceName: string;
    try {
      budgetResourceName = await createCampaignBudget(userId, customerId, name, budgetMicros);
    } catch (budgetError: any) {
      console.error('[GoogleAds] Budget creation error:', budgetError.message);
      return res.status(500).json({ error: `Failed to create budget: ${budgetError.message}` });
    }

    const includeSearchPartners = targetSearchNetwork !== undefined ? targetSearchNetwork : false;
    const networkSettings: any = {
      targetGoogleSearch: advertisingChannelType === 'SEARCH',
      targetSearchNetwork: advertisingChannelType === 'SEARCH' ? includeSearchPartners : false,
      targetContentNetwork: advertisingChannelType === 'DISPLAY',
    };
    if (advertisingChannelType === 'VIDEO' || advertisingChannelType === 'DEMAND_GEN') {
      networkSettings.targetGoogleSearch = false;
      networkSettings.targetSearchNetwork = false;
      networkSettings.targetContentNetwork = false;
      networkSettings.targetPartnerSearchNetwork = false;
    }

    const effectiveVideoBidding = videoBiddingStrategy || (advertisingChannelType === 'VIDEO' ? biddingStrategyType : undefined);

    let campaignResourceName: string;
    try {
      campaignResourceName = await createCampaign(userId, customerId, {
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
    } catch (campaignError: any) {
      console.error('[GoogleAds] Campaign creation failed after budget created. Orphan budget:', budgetResourceName);
      return res.status(500).json({ error: `Campaign creation failed: ${campaignError.message}. Note: A budget was created but the campaign was not — please check Google Ads for orphaned budgets.` });
    }

    const warnings: string[] = [];

    if (needsConversions) {
      warnings.push('This bidding strategy requires conversion tracking to be set up in your Google Ads account to optimize effectively.');
    }

    if (languages && Array.isArray(languages) && languages.length > 0) {
      try {
        await setCampaignLanguages(userId, customerId, campaignResourceName, languages);
      } catch (langError: any) {
        console.error('[GoogleAds] Language targeting error (campaign still created):', langError.message);
        warnings.push(`Language targeting failed: ${langError.message}. You must set languages manually before enabling.`);
      }
    } else {
      warnings.push('No language targeting set. Add languages before enabling this campaign.');
    }

    if (locations && Array.isArray(locations) && locations.length > 0) {
      try {
        await setCampaignLocations(userId, customerId, campaignResourceName, locations);
      } catch (locError: any) {
        console.error('[GoogleAds] Location targeting error (campaign still created):', locError.message);
        warnings.push(`Location targeting failed: ${locError.message}. You must set locations manually before enabling.`);
      }
    } else {
      warnings.push('No location targeting set. Add locations before enabling this campaign.');
    }

    res.json({
      success: true,
      resourceName: campaignResourceName,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
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

    if (status === 'ENABLED') {
      const langCriteria = await executeGaql(userId, customerId,
        `SELECT campaign_criterion.criterion_id FROM campaign_criterion WHERE campaign.resource_name = '${resourceName}' AND campaign_criterion.type = 'LANGUAGE' LIMIT 1`
      );
      const locCriteria = await executeGaql(userId, customerId,
        `SELECT campaign_criterion.criterion_id FROM campaign_criterion WHERE campaign.resource_name = '${resourceName}' AND campaign_criterion.type = 'LOCATION' LIMIT 1`
      );

      if (!langCriteria || langCriteria.length === 0) {
        return res.status(400).json({ error: 'Cannot enable campaign: no language targeting configured. Add at least one language before enabling.' });
      }
      if (!locCriteria || locCriteria.length === 0) {
        return res.status(400).json({ error: 'Cannot enable campaign: no location targeting configured. Add at least one country/region before enabling.' });
      }

      const channelResult = await executeGaql(userId, customerId,
        `SELECT campaign.advertising_channel_type FROM campaign WHERE campaign.resource_name = '${resourceName}'`
      );
      if (channelResult && channelResult.length > 0) {
        const channelType = channelResult[0]?.campaign?.advertisingChannelType;
        if (channelType === 'PERFORMANCE_MAX') {
          const assetGroups = await executeGaql(userId, customerId,
            `SELECT asset_group.id FROM asset_group WHERE campaign.resource_name = '${resourceName}' LIMIT 1`
          );
          if (!assetGroups || assetGroups.length === 0) {
            return res.status(400).json({ error: 'Cannot enable Performance Max campaign: at least one asset group is required. Please create asset groups in Google Ads before enabling.' });
          }
        }
      }
    }

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

router.get('/languages', ensureAuthenticated, async (_req: Request, res: Response) => {
  const languages = Object.entries(GOOGLE_ADS_LANGUAGES).map(([code, lang]) => ({
    code,
    id: lang.id,
    name: lang.name,
  }));
  res.json(languages);
});

router.get('/campaigns/:id/languages', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const campaignId = req.params.id;
    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    const languages = await getCampaignLanguages(userId, customerId, campaignResourceName);
    res.json({ languages });
  } catch (error: any) {
    console.error('[GoogleAds] Get campaign languages error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/campaigns/:id/languages', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const campaignId = req.params.id;
    const { languages } = req.body;

    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ error: 'At least one language is required' });
    }

    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    await setCampaignLanguages(userId, customerId, campaignResourceName, languages);

    res.json({ success: true, languages });
  } catch (error: any) {
    console.error('[GoogleAds] Set campaign languages error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/countries', ensureAuthenticated, async (_req: Request, res: Response) => {
  const countries = Object.entries(GOOGLE_ADS_COUNTRIES).map(([code, country]) => ({
    code,
    id: country.id,
    name: country.name,
  }));
  res.json(countries);
});

router.get('/campaigns/:id/locations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const campaignId = req.params.id;
    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    const locations = await getCampaignLocations(userId, customerId, campaignResourceName);
    res.json({ locations });
  } catch (error: any) {
    console.error('[GoogleAds] Get campaign locations error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/campaigns/:id/locations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    const campaignId = req.params.id;
    const { locations } = req.body;

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'At least one location is required' });
    }

    const campaignResourceName = `customers/${customerId}/campaigns/${campaignId}`;
    await setCampaignLocations(userId, customerId, campaignResourceName, locations);

    res.json({ success: true, locations });
  } catch (error: any) {
    console.error('[GoogleAds] Set campaign locations error:', error.message);
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
    const { objective, product, targetAudience, geography, languages, languageCodes, landingUrl, monthlyBudget, campaignType } = req.body;

    let pageContent = '';
    if (landingUrl) {
      try {
        let crawlUrl = landingUrl;
        if (!crawlUrl.startsWith('http://') && !crawlUrl.startsWith('https://')) {
          crawlUrl = 'https://' + crawlUrl;
        }
        console.log(`[GoogleAds AI] Crawling landing page: ${crawlUrl}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(crawlUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThermopacBot/1.0)' },
        });
        clearTimeout(timeout);
        const html = await response.text();
        const stripped = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 4000);
        pageContent = stripped;
        console.log(`[GoogleAds AI] Crawled ${stripped.length} chars from ${landingUrl}`);
      } catch (crawlErr: any) {
        console.error(`[GoogleAds AI] Failed to crawl ${landingUrl}:`, crawlErr.message);
        pageContent = 'Could not crawl landing page.';
      }
    }

    const existingCampaigns = await db.execute(sql`
      SELECT name, status, advertising_channel_type, budget_amount_micros FROM gads_campaigns LIMIT 20
    `);
    const existingKeywords = await db.execute(sql`
      SELECT text, match_type, quality_score FROM gads_keywords WHERE status = 'ENABLED' LIMIT 50
    `);

    const targetLangs = languages || 'English';
    const langCodes = languageCodes || ['en'];
    const isMultilingual = langCodes.length > 1;

    const prompt = `You are an expert Google Ads strategist specializing in HIGH-VALUE INDUSTRIAL EPC (Engineering, Procurement, Construction) equipment campaigns. You are NOT creating a generic campaign — you are building a campaign for capital equipment worth $500K - $5M+ per project.

COMPANY: THERMOPAC is a globally recognized EPC company with 31+ plants across 5 continents. They manufacture:
- Re-refining Plants: Skid-mounted, continuous, fully automated used oil recycling plants that convert waste oil into Group I/II/III base oil. 99.5% recovery rate. Turnkey EPC solutions. Modular, expandable designs. Capacities from 10 TPD to 300 TPD.
- Lube Oil Blending Plants: Automated blending systems for producing finished lubricants from base oils. Inline blending, batch blending, simultaneous operations.
- Regenerative Media Based Polishing Systems: Advanced clay-free polishing technology for base oil color improvement and purification.

CAMPAIGN PARAMETERS:
- Campaign type: ${campaignType || 'SEARCH'}
- Objective: ${objective || 'Generate qualified leads'}
- Product focus: ${product || 'All products'}
- Target geography: ${geography || 'India'}
- Target languages: ${targetLangs}
- Landing URL: ${landingUrl || 'https://thermopac.in'}
- Monthly budget: INR ${monthlyBudget || '15000'}

LANDING PAGE CONTENT (crawled from URL):
${pageContent || 'No page content available - use general product knowledge'}

EXISTING ACCOUNT DATA:
- Campaigns: ${JSON.stringify(existingCampaigns.rows?.slice(0, 10) || [])}
- Keywords: ${JSON.stringify(existingKeywords.rows?.slice(0, 20) || [])}

YOUR TASK: Generate an EXPERT-LEVEL, production-ready campaign for "${product}". This is a high-value industrial EPC product — NOT consumer goods.

CRITICAL CONTEXT FOR HIGH-VALUE EPC CAMPAIGNS:
1. BIDDING STRATEGY — CRITICAL: With ZERO conversion data, you MUST recommend MANUAL_CPC or MAXIMIZE_CLICKS. NEVER recommend MAXIMIZE_CONVERSIONS or TARGET_CPA for a new account — Google's algorithm needs 30-50 conversions first. Phase plan: Start MANUAL_CPC → after 30-50 conversions switch to TARGET_CPA.
2. BUDGET REALITY: For industrial B2B in international markets, CPC ranges from INR 130-550 (EUR 1.5-6). The user's budget of INR ${monthlyBudget || '15000'}/month may be too low. If so, recommend a higher budget (e.g., INR 45000-75000/month = INR 1500-2500/day) and explain WHY — more clicks = more leads for $1M+ projects where even 1 lead is valuable.
3. KEYWORD QUALITY: Do NOT use generic research keywords. Use BUYER-INTENT keywords that investors, plant owners, and procurement managers actually search. Examples of BAD keywords: "beneficios planta reciclaje", "eficiencia planta". Examples of GOOD keywords: "planta reciclaje aceite usado", "proveedor planta re-refinacion aceite", "used oil recycling plant manufacturer", "buy re-refining plant".
4. KEYWORD VOLUME — CRITICAL: The TOTAL campaign must have AT LEAST 20-30 keywords across all ad groups. Each ad group MUST have 7-12 keywords with mixed match types. 3-4 keywords per ad group is far too few — Google cannot explore enough search terms. For Spanish campaigns, include keywords like: "planta regeneracion aceite lubricante", "tecnologia regeneracion aceite usado", "planta destilacion aceite usado", "planta reciclaje aceite industrial", "proveedor planta regeneracion aceite", "maquina reciclaje aceite lubricante", "planta regeneracion aceite industrial". Also include a "Recycler Upgrade" ad group targeting existing waste oil collection companies who want to upgrade to re-refining: "empresas reciclaje aceite usado", "empresa gestion aceite usado", "recoleccion aceite usado empresa".
5. AD COPY: Must show TECHNICAL CREDIBILITY and ENGINEERING expertise. Include specific numbers (99.5% recovery, 31+ plants globally, 5 continents, TWFE technology). Avoid generic phrases like "tecnología avanzada" — use specifics like "Recuperación 99.5% Aceite Base" or "Planta EPC Llave en Mano" or "Tecnología TWFE Avanzada".
6. NEGATIVE KEYWORDS — IMPORTANT: Must be COMPREHENSIVE in both English AND target language. MUST block: jobs/empleo, salary/salario, courses/curso, training/entrenamiento, DIY/casero, PDF, students/estudiantes, how-to/como hacer, manual, que es. NEVER add "price"/"precio" as a negative keyword — many serious investors search "precio planta reciclaje aceite usado" and those are qualified buyers.
7. AD SCHEDULE: Do NOT restrict to business hours initially. Run 24/7 for first 30 days to gather data, then optimize based on actual conversion times. Many industrial searches happen in evenings and early mornings.
8. HEADLINES: Must communicate EPC credibility. Use numbers, technical specs, and authority signals. Example: "31+ Plantas Globales", "99.5% Recuperación Aceite", "EPC Llave en Mano", "Tecnología TWFE Avanzada". Include at least 10-15 headlines per ad group.
9. DESCRIPTIONS: Must be engineering-focused with specific technology names. Example: "Tecnología TWFE para regenerar aceite lubricante usado en aceite base de alta calidad" NOT "Convierte aceite usado en nuevo". "Plantas EPC completas para reciclaje industrial de aceite usado" NOT "Solución de reciclaje".
10. PERFORMANCE EXPECTATIONS: Be realistic for industrial EPC. CTR: 3-6%, CPC: INR 150-450, Leads: 3-8/month. Even 1 EPC project lead can justify the entire annual ad spend.
11. GEOGRAPHIC EXPANSION: If targeting Spanish-speaking markets, recommend expansion to Latin American countries (Mexico, Chile, Peru, Colombia, Argentina) — fastest-growing regions for used oil recycling plants.
12. DEVICE TARGETING: Note that desktop converts better (~70%) but do NOT force device bid adjustments initially. Let Google learn for 30 days, then optimize based on data.
13. FUTURE REMARKETING: Mention that after the search campaign gathers data, Display and YouTube remarketing should be added to retarget website visitors. Remarketing increases conversions 3-5x for EPC campaigns.

${isMultilingual ? `CRITICAL - MULTILINGUAL CAMPAIGN REQUIRED:
Target languages are: ${targetLangs}
KEYWORDS: Generate keywords in ALL target languages. Use BUYER-INTENT terms that investors/plant owners would actually search in their native language. Mix with English keywords since some B2B buyers search in English globally.
AD COPY: For EACH ad group, provide headlines and descriptions in ALL target languages using the "multilingualCopy" field. Use native-speaker quality with technical/engineering vocabulary, not generic translations.` : `LANGUAGE NOTE: Target language is ${targetLangs}. ${langCodes[0] !== 'en' ? `Generate ALL keywords in ${targetLangs} using terms that BUYERS/INVESTORS actually search (not researchers/students). Also include English keywords since B2B industrial buyers often search in English. Headlines and descriptions must be in ${targetLangs} with technical credibility.` : 'Generate keywords in English with buyer intent focus.'}`}

Respond in JSON:
{
  "campaignName": "use format [Continent]_[Country]_[Language]_[Product]_[Type]",
  "budgetAnalysis": {
    "userBudget": ${monthlyBudget || 15000},
    "isAdequate": true/false,
    "recommendedMonthlyBudget": number in INR,
    "recommendedDailyBudget": number in INR,
    "reason": "explain CPC reality in target geography and why budget needs adjustment",
    "expectedClicksPerDay": "range at recommended budget",
    "expectedClicksPerMonth": "range at recommended budget"
  },
  "biddingStrategy": {
    "recommended": "MANUAL_CPC (ALWAYS for new accounts with zero conversions)",
    "reason": "with no conversion data, MANUAL_CPC gives cost control while gathering data. NEVER use MAXIMIZE_CONVERSIONS on a new account.",
    "targetValue": null,
    "phaseStrategy": "Phase 1: MANUAL_CPC for first 30 days. Phase 2: After 30-50 conversions, switch to TARGET_CPA for automated optimization."
  },
  "dailyBudget": {
    "recommended": number in INR (realistic for industrial B2B),
    "reason": "CPC-based justification with click volume analysis"
  },
  "adGroups": [
    {
      "name": "tightly themed ad group name",
      "theme": "what buyer intent this targets",
      "buyerStage": "awareness | consideration | decision",
      "keywords": [
        {"text": "buyer-intent keyword", "matchType": "BROAD|PHRASE|EXACT", "language": "language code", "reason": "why an investor/buyer would search this", "estimatedCpc": "CPC range in INR"}
      ],
      "negativeKeywords": ["comprehensive list in both English AND target language"],
      "headlines": ["10-15 headlines max 30 chars - must show technical credibility"],
      "descriptions": ["4 descriptions max 90 chars - engineering-focused, specific numbers"],
      ${isMultilingual ? `"multilingualCopy": {
        "languageName": {
          "headlines": ["10-15 headlines in that language, max 30 chars, technical"],
          "descriptions": ["4 descriptions in that language, max 90 chars, engineering-focused"]
        }
      },` : ''}
      "landingPageSuggestion": "specific page or section to link to"
    }
  ],
  "productInsights": {
    "uniqueSellingPoints": ["technical USPs from landing page - specific numbers and capabilities"],
    "competitiveAdvantages": ["what makes THERMOPAC stand out vs competitors"],
    "targetBuyerPersonas": ["specific buyer types: investors, plant owners, procurement managers, EPC contractors"],
    "projectValue": "estimated deal size range for this product"
  },
  "audienceSignals": ["in-market audiences for industrial equipment", "custom intent audiences"],
  "deviceStrategy": {
    "desktop": "percentage and reason",
    "mobile": "percentage and reason",
    "recommendation": "which device to prioritize"
  },
  "geographicExpansion": ["additional countries/regions to consider beyond current targeting"],
  "scheduleRecommendation": "run 24/7 initially for 30 days, then optimize based on conversion data",
  "optimizationTips": ["expert-level optimization advice specific to high-value EPC campaigns"],
  "avoidKeywords": ["comprehensive account-level negatives in both English AND target language"],
  "expectedPerformance": {
    "estimatedCtr": "realistic CTR for industrial EPC (3-6%)",
    "estimatedCpc": "realistic CPC range in INR for target geography",
    "estimatedLeadsPerMonth": "realistic lead estimate for EPC",
    "estimatedCostPerLead": "expected cost per qualified lead",
    "estimatedDealValue": "typical project value if lead converts",
    "roiAnalysis": "brief ROI justification (ad spend vs potential deal value)",
    "timeToOptimize": "realistic timeline"
  }
}

STRICT RULES:
- Headlines MUST be 30 characters or less (COUNT EVERY CHARACTER including spaces)
- Descriptions MUST be 90 characters or less
- Each ad group MUST have 10-20 keywords with mixed match types (BROAD, PHRASE, EXACT)
- BIDDING: ALWAYS recommend MANUAL_CPC for accounts with zero conversions. NEVER suggest MAXIMIZE_CONVERSIONS or TARGET_CPA without conversion history
- Keywords must be BUYER-INTENT, not research/educational queries
- MINIMUM 20-30 keywords total across all ad groups. Each ad group must have 7-12 keywords
- NEVER add "price" or "precio" as negative keywords — investors search pricing queries
- Negative keywords must be in BOTH English AND the target language (jobs/empleo, salary/salario, curso, DIY/casero, PDF, estudiantes, como hacer, que es, manual)
- Ad copy must demonstrate ENGINEERING CREDIBILITY with specific numbers and technology names (TWFE, 99.5%, 31+ plants)
- Descriptions must use engineering language, not generic phrases. Reference specific technology (TWFE) and capabilities
- Budget recommendation must be REALISTIC for industrial B2B (not just divide monthly by 30)
- Create 4-5 ad groups: awareness (technology/industry), consideration (comparison/features), decision (buy/supplier/quote), recycler-upgrade (existing waste oil companies wanting to upgrade)
- For EPC campaigns: 1 qualified lead can be worth $500K-$5M — budget accordingly
- If user's budget is too low, say so clearly and recommend a higher amount with justification
- Device strategy: observe desktop vs mobile but do NOT force bid adjustments initially — let Google learn for 30 days
- Mention remarketing as a future phase recommendation (Display + YouTube remarketing after gathering initial search data)`;

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

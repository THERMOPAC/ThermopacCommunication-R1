import { getValidAccessToken } from './google-ads-auth';

const GOOGLE_ADS_API_VERSION = 'v19';
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

interface GaqlResponse {
  results?: any[];
  fieldMask?: string;
  requestId?: string;
}

function getHeaders(accessToken: string): Record<string, string> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not configured');
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };

  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
  }

  return headers;
}

export async function executeGaql(
  userId: number,
  customerId: string,
  query: string,
  retries = 2
): Promise<any[]> {
  const cleanCustomerId = customerId.replace(/-/g, '');
  const accessToken = await getValidAccessToken(userId);
  const headers = getHeaders(accessToken);

  const url = `${GOOGLE_ADS_BASE_URL}/customers/${cleanCustomerId}/googleAds:search`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[GoogleAds] GAQL error (attempt ${attempt + 1}):`, response.status, errorBody);

        if (response.status === 401) {
          if (attempt < retries) {
            const { refreshGoogleAdsToken } = await import('./google-ads-auth');
            const newToken = await refreshGoogleAdsToken(userId);
            headers['Authorization'] = `Bearer ${newToken}`;
            continue;
          }
          throw new Error('Google Ads authentication failed. Please reconnect your account.');
        }

        if (response.status === 429) {
          if (attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`[GoogleAds] Rate limited, waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error('Google Ads API quota exceeded. Please try again later.');
        }

        let errorMessage = `Google Ads API error (${response.status})`;
        try {
          const parsed = JSON.parse(errorBody);
          if (Array.isArray(parsed) && parsed[0]?.error?.message) {
            errorMessage = parsed[0].error.message;
          } else if (parsed?.error?.message) {
            errorMessage = parsed.error.message;
          } else if (parsed?.error?.status) {
            errorMessage = `${parsed.error.status}: ${parsed.error.message || errorBody.substring(0, 200)}`;
          }
        } catch {
          errorMessage = `Google Ads API error (${response.status}): ${errorBody.substring(0, 300)}`;
        }
        console.error(`[GoogleAds] Full error details:`, errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();

      const allResults: any[] = [];
      if (Array.isArray(data)) {
        for (const batch of data) {
          if (batch.results) {
            allResults.push(...batch.results);
          }
        }
      } else if (data.results) {
        allResults.push(...data.results);
      }

      return allResults;
    } catch (error: any) {
      if (attempt === retries) throw error;
      if (error.message?.includes('authentication') || error.message?.includes('quota')) throw error;

      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[GoogleAds] Transient error, retrying in ${delay}ms...`, error.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return [];
}

export async function listAccessibleCustomers(userId: number): Promise<string[]> {
  const accessToken = await getValidAccessToken(userId);
  const headers = getHeaders(accessToken);

  const url = `${GOOGLE_ADS_BASE_URL}/customers:listAccessibleCustomers`;

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[GoogleAds] listAccessibleCustomers error:', response.status, errorBody);
    throw new Error(`Failed to list accessible customers: ${response.status}`);
  }

  const data = await response.json();
  return (data.resourceNames || []).map((rn: string) => rn.replace('customers/', ''));
}

export async function getCustomerInfo(userId: number, customerId: string): Promise<any> {
  const query = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.manager
    FROM customer
    LIMIT 1
  `;

  const results = await executeGaql(userId, customerId, query);
  if (results.length > 0) {
    return results[0].customer;
  }
  return null;
}

export function microsToMoney(micros: string | number | null): number {
  if (micros === null || micros === undefined) return 0;
  return Number(micros) / 1_000_000;
}

export function moneyToMicros(amount: number): number {
  return Math.round(amount * 1_000_000);
}

export async function mutateGoogleAds(
  userId: number,
  customerId: string,
  resource: string,
  operations: any[],
  retries = 2
): Promise<any> {
  const cleanCustomerId = customerId.replace(/-/g, '');
  const accessToken = await getValidAccessToken(userId);
  const headers = getHeaders(accessToken);

  const url = `${GOOGLE_ADS_BASE_URL}/customers/${cleanCustomerId}/${resource}:mutate`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ operations }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[GoogleAds] Mutate error (attempt ${attempt + 1}):`, response.status, errorBody);

        if (response.status === 401 && attempt < retries) {
          const { refreshGoogleAdsToken } = await import('./google-ads-auth');
          const newToken = await refreshGoogleAdsToken(userId);
          headers['Authorization'] = `Bearer ${newToken}`;
          continue;
        }

        let errorMessage = `Google Ads API error (${response.status})`;
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed?.error?.message) {
            errorMessage = parsed.error.message;
          }
          if (parsed?.error?.details) {
            const details = parsed.error.details;
            for (const detail of details) {
              if (detail.errors) {
                errorMessage = detail.errors.map((e: any) => e.message).join('; ');
              }
            }
          }
        } catch {}
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error: any) {
      if (attempt === retries) throw error;
      if (error.message?.includes('authentication')) throw error;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export async function createCampaignBudget(
  userId: number,
  customerId: string,
  name: string,
  amountMicros: number
): Promise<string> {
  const result = await mutateGoogleAds(userId, customerId, 'campaignBudgets', [{
    create: {
      name: `${name}_budget_${Date.now()}`,
      amountMicros: String(amountMicros),
      deliveryMethod: 'STANDARD',
      explicitlyShared: false,
    }
  }]);
  return result.results[0].resourceName;
}

export async function createCampaign(
  userId: number,
  customerId: string,
  params: {
    name: string;
    budgetResourceName: string;
    advertisingChannelType: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    targetCpa?: number;
    targetRoas?: number;
    networkSettings?: {
      targetGoogleSearch?: boolean;
      targetSearchNetwork?: boolean;
      targetContentNetwork?: boolean;
    };
  }
): Promise<string> {
  const campaign: any = {
    name: params.name,
    campaignBudget: params.budgetResourceName,
    advertisingChannelType: params.advertisingChannelType,
    status: params.status || 'PAUSED',
  };

  if (params.startDate) campaign.startDate = params.startDate.replace(/-/g, '');
  if (params.endDate) campaign.endDate = params.endDate.replace(/-/g, '');

  if (params.networkSettings && params.advertisingChannelType === 'SEARCH') {
    campaign.networkSettings = {
      targetGoogleSearch: params.networkSettings.targetGoogleSearch ?? true,
      targetSearchNetwork: params.networkSettings.targetSearchNetwork ?? true,
      targetContentNetwork: params.networkSettings.targetContentNetwork ?? false,
    };
  }

  if (params.advertisingChannelType === 'SEARCH' || params.advertisingChannelType === 'DISPLAY') {
    if (params.targetCpa) {
      campaign.targetCpa = { targetCpaMicros: String(moneyToMicros(params.targetCpa)) };
    } else {
      campaign.manualCpc = { enhancedCpcEnabled: true };
    }
  }

  if (params.advertisingChannelType === 'PERFORMANCE_MAX') {
    if (params.targetRoas) {
      campaign.maximizeConversionValue = { targetRoas: params.targetRoas };
    } else {
      campaign.maximizeConversions = {};
    }
  }

  const result = await mutateGoogleAds(userId, customerId, 'campaigns', [{
    create: campaign
  }]);
  return result.results[0].resourceName;
}

export async function updateCampaignStatus(
  userId: number,
  customerId: string,
  campaignResourceName: string,
  status: string
): Promise<any> {
  return mutateGoogleAds(userId, customerId, 'campaigns', [{
    update: {
      resourceName: campaignResourceName,
      status,
    },
    updateMask: 'status',
  }]);
}

export async function updateCampaignBudget(
  userId: number,
  customerId: string,
  budgetResourceName: string,
  amountMicros: number
): Promise<any> {
  return mutateGoogleAds(userId, customerId, 'campaignBudgets', [{
    update: {
      resourceName: budgetResourceName,
      amountMicros: String(amountMicros),
    },
    updateMask: 'amount_micros',
  }]);
}

export async function createAdGroup(
  userId: number,
  customerId: string,
  params: {
    name: string;
    campaignResourceName: string;
    type?: string;
    cpcBidMicros?: number;
    status?: string;
  }
): Promise<string> {
  const adGroup: any = {
    name: params.name,
    campaign: params.campaignResourceName,
    type: params.type || 'SEARCH_STANDARD',
    status: params.status || 'ENABLED',
  };

  if (params.cpcBidMicros) {
    adGroup.cpcBidMicros = String(params.cpcBidMicros);
  }

  const result = await mutateGoogleAds(userId, customerId, 'adGroups', [{
    create: adGroup
  }]);
  return result.results[0].resourceName;
}

export async function updateAdGroupStatus(
  userId: number,
  customerId: string,
  adGroupResourceName: string,
  status: string
): Promise<any> {
  return mutateGoogleAds(userId, customerId, 'adGroups', [{
    update: {
      resourceName: adGroupResourceName,
      status,
    },
    updateMask: 'status',
  }]);
}

export async function addKeywords(
  userId: number,
  customerId: string,
  adGroupResourceName: string,
  keywords: Array<{ text: string; matchType: string }>
): Promise<any> {
  const operations = keywords.map(kw => ({
    create: {
      adGroup: adGroupResourceName,
      status: 'ENABLED',
      keyword: {
        text: kw.text,
        matchType: kw.matchType,
      },
    }
  }));

  return mutateGoogleAds(userId, customerId, 'adGroupCriteria', operations);
}

export async function addNegativeKeywords(
  userId: number,
  customerId: string,
  campaignResourceName: string,
  keywords: Array<{ text: string; matchType: string }>
): Promise<any> {
  const operations = keywords.map(kw => ({
    create: {
      campaign: campaignResourceName,
      negative: true,
      keyword: {
        text: kw.text,
        matchType: kw.matchType,
      },
    }
  }));

  return mutateGoogleAds(userId, customerId, 'campaignCriteria', operations);
}

export async function removeKeyword(
  userId: number,
  customerId: string,
  criterionResourceName: string
): Promise<any> {
  return mutateGoogleAds(userId, customerId, 'adGroupCriteria', [{
    remove: criterionResourceName,
  }]);
}

export async function createResponsiveSearchAd(
  userId: number,
  customerId: string,
  adGroupResourceName: string,
  params: {
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
    path1?: string;
    path2?: string;
  }
): Promise<string> {
  const ad: any = {
    adGroup: adGroupResourceName,
    status: 'ENABLED',
    ad: {
      responsiveSearchAd: {
        headlines: params.headlines.map(h => ({ text: h })),
        descriptions: params.descriptions.map(d => ({ text: d })),
        path1: params.path1 || '',
        path2: params.path2 || '',
      },
      finalUrls: [params.finalUrl],
    },
  };

  const result = await mutateGoogleAds(userId, customerId, 'adGroupAds', [{
    create: ad
  }]);
  return result.results[0].resourceName;
}

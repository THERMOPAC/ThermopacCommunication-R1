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
    advertisingChannelSubType?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    targetCpa?: number;
    targetRoas?: number;
    targetCpv?: number;
    videoBiddingStrategy?: string;
    biddingStrategyType?: string;
    networkSettings?: {
      targetGoogleSearch?: boolean;
      targetSearchNetwork?: boolean;
      targetContentNetwork?: boolean;
      targetPartnerSearchNetwork?: boolean;
    };
  }
): Promise<string> {
  const campaign: any = {
    name: params.name,
    campaignBudget: params.budgetResourceName,
    advertisingChannelType: params.advertisingChannelType,
    status: params.status || 'PAUSED',
  };

  if (params.advertisingChannelSubType) {
    campaign.advertisingChannelSubType = params.advertisingChannelSubType;
  }

  if (params.startDate) campaign.startDate = params.startDate.replace(/-/g, '');
  if (params.endDate) campaign.endDate = params.endDate.replace(/-/g, '');

  if (params.networkSettings) {
    campaign.networkSettings = {
      targetGoogleSearch: params.networkSettings.targetGoogleSearch ?? false,
      targetSearchNetwork: params.networkSettings.targetSearchNetwork ?? false,
      targetContentNetwork: params.networkSettings.targetContentNetwork ?? false,
    };
  }

  campaign.geoTargetTypeSetting = {
    positiveGeoTargetType: 'PRESENCE',
    negativeGeoTargetType: 'PRESENCE',
  };

  const strategy = params.biddingStrategyType || '';

  if (params.advertisingChannelType === 'SEARCH' || params.advertisingChannelType === 'DISPLAY') {
    if (strategy === 'TARGET_CPA' && params.targetCpa) {
      campaign.targetCpa = { targetCpaMicros: String(moneyToMicros(params.targetCpa)) };
    } else if (strategy === 'TARGET_ROAS' && params.targetRoas) {
      campaign.maximizeConversionValue = { targetRoas: params.targetRoas };
    } else if (strategy === 'MAXIMIZE_CONVERSIONS') {
      campaign.maximizeConversions = {};
    } else if (strategy === 'MAXIMIZE_CLICKS') {
      campaign.maximizeClicks = {};
    } else {
      campaign.manualCpc = { enhancedCpcEnabled: true };
    }
  }

  if (params.advertisingChannelType === 'PERFORMANCE_MAX') {
    if (strategy === 'TARGET_ROAS' && params.targetRoas) {
      campaign.maximizeConversionValue = { targetRoas: params.targetRoas };
    } else {
      campaign.maximizeConversions = {};
    }
  }

  if (params.advertisingChannelType === 'VIDEO') {
    const videoStrategy = params.videoBiddingStrategy || strategy || 'TARGET_CPV';
    if (videoStrategy === 'TARGET_CPV') {
      campaign.manualCpv = {};
    } else if (videoStrategy === 'TARGET_CPM') {
      campaign.targetCpm = {};
    } else if (videoStrategy === 'MAXIMIZE_CONVERSIONS') {
      campaign.maximizeConversions = {};
    } else if (videoStrategy === 'TARGET_CPA' && params.targetCpa) {
      campaign.targetCpa = { targetCpaMicros: String(moneyToMicros(params.targetCpa)) };
    } else {
      campaign.manualCpv = {};
    }
    campaign.videoBrandSafetySuitability = 'EXPANDED_INVENTORY';
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

export const GOOGLE_ADS_LANGUAGES: Record<string, { id: string; name: string }> = {
  en: { id: '1000', name: 'English' },
  de: { id: '1001', name: 'German' },
  fr: { id: '1002', name: 'French' },
  es: { id: '1003', name: 'Spanish' },
  it: { id: '1004', name: 'Italian' },
  ja: { id: '1005', name: 'Japanese' },
  da: { id: '1009', name: 'Danish' },
  nl: { id: '1010', name: 'Dutch' },
  fi: { id: '1011', name: 'Finnish' },
  ko: { id: '1012', name: 'Korean' },
  no: { id: '1013', name: 'Norwegian' },
  pt: { id: '1014', name: 'Portuguese' },
  zh: { id: '1017', name: 'Chinese (Simplified)' },
  'zh-TW': { id: '1018', name: 'Chinese (Traditional)' },
  ar: { id: '1019', name: 'Arabic' },
  he: { id: '1020', name: 'Hebrew' },
  cs: { id: '1021', name: 'Czech' },
  el: { id: '1022', name: 'Greek' },
  hi: { id: '1023', name: 'Hindi' },
  id: { id: '1025', name: 'Indonesian' },
  bg: { id: '1026', name: 'Bulgarian' },
  hr: { id: '1039', name: 'Croatian' },
  hu: { id: '1024', name: 'Hungarian' },
  lv: { id: '1028', name: 'Latvian' },
  lt: { id: '1029', name: 'Lithuanian' },
  pl: { id: '1030', name: 'Polish' },
  ru: { id: '1031', name: 'Russian' },
  ro: { id: '1032', name: 'Romanian' },
  sk: { id: '1033', name: 'Slovak' },
  sl: { id: '1034', name: 'Slovenian' },
  sr: { id: '1035', name: 'Serbian' },
  sv: { id: '1015', name: 'Swedish' },
  tr: { id: '1037', name: 'Turkish' },
  uk: { id: '1036', name: 'Ukrainian' },
  ca: { id: '1038', name: 'Catalan' },
  vi: { id: '1040', name: 'Vietnamese' },
  ur: { id: '1041', name: 'Urdu' },
  fil: { id: '1042', name: 'Filipino' },
  et: { id: '1043', name: 'Estonian' },
  th: { id: '1044', name: 'Thai' },
  af: { id: '1078', name: 'Afrikaans' },
  ms: { id: '1102', name: 'Malay' },
  sw: { id: '1055', name: 'Swahili' },
  ka: { id: '1062', name: 'Georgian' },
  am: { id: '1064', name: 'Amharic' },
  bn: { id: '1056', name: 'Bengali' },
  eu: { id: '1076', name: 'Basque' },
  gl: { id: '1092', name: 'Galician' },
  hy: { id: '1067', name: 'Armenian' },
  mk: { id: '1071', name: 'Macedonian' },
  sq: { id: '1079', name: 'Albanian' },
  lo: { id: '1059', name: 'Lao' },
  ta: { id: '1130', name: 'Tamil' },
  te: { id: '1131', name: 'Telugu' },
  mr: { id: '1128', name: 'Marathi' },
  gu: { id: '1072', name: 'Gujarati' },
  is: { id: '1027', name: 'Icelandic' },
  be: { id: '1073', name: 'Belarusian' },
  az: { id: '1068', name: 'Azerbaijani' },
};

export async function setCampaignLanguages(
  userId: number,
  customerId: string,
  campaignResourceName: string,
  languageCodes: string[]
): Promise<any> {
  const cleanCustomerId = customerId.replace(/-/g, '');

  const existingCriteria = await executeGaql(userId, customerId,
    `SELECT campaign_criterion.criterion_id, campaign_criterion.type FROM campaign_criterion WHERE campaign.resource_name = '${campaignResourceName}' AND campaign_criterion.type = 'LANGUAGE'`
  );

  const removeOps = existingCriteria.map((r: any) => ({
    remove: `${campaignResourceName}/campaignCriteria/${r.campaignCriterion.criterionId}`
  }));

  if (removeOps.length > 0) {
    await mutateGoogleAds(userId, cleanCustomerId, 'campaignCriteria', removeOps);
  }

  const addOps = languageCodes.map(code => {
    const lang = GOOGLE_ADS_LANGUAGES[code];
    if (!lang) throw new Error(`Unsupported language code: ${code}`);
    return {
      create: {
        campaign: campaignResourceName,
        language: { languageConstant: `languageConstants/${lang.id}` },
      }
    };
  });

  if (addOps.length > 0) {
    return mutateGoogleAds(userId, cleanCustomerId, 'campaignCriteria', addOps);
  }

  return { results: [] };
}

export async function getCampaignLanguages(
  userId: number,
  customerId: string,
  campaignResourceName: string
): Promise<string[]> {
  const results = await executeGaql(userId, customerId,
    `SELECT campaign_criterion.language.language_constant FROM campaign_criterion WHERE campaign.resource_name = '${campaignResourceName}' AND campaign_criterion.type = 'LANGUAGE'`
  );

  const langIdToCode: Record<string, string> = {};
  for (const [code, lang] of Object.entries(GOOGLE_ADS_LANGUAGES)) {
    langIdToCode[lang.id] = code;
  }

  return results.map((r: any) => {
    const constant = r.campaignCriterion?.language?.languageConstant || '';
    const id = constant.split('/').pop();
    return langIdToCode[id] || id;
  }).filter(Boolean);
}

export const GOOGLE_ADS_COUNTRIES: Record<string, { id: string; name: string }> = {
  IN: { id: '2356', name: 'India' },
  AE: { id: '2784', name: 'UAE' },
  SA: { id: '2682', name: 'Saudi Arabia' },
  US: { id: '2840', name: 'United States' },
  GB: { id: '2826', name: 'United Kingdom' },
  DE: { id: '2276', name: 'Germany' },
  FR: { id: '2250', name: 'France' },
  IT: { id: '2380', name: 'Italy' },
  ES: { id: '2724', name: 'Spain' },
  PT: { id: '2620', name: 'Portugal' },
  BR: { id: '2076', name: 'Brazil' },
  JP: { id: '2392', name: 'Japan' },
  RU: { id: '2643', name: 'Russia' },
  CN: { id: '2156', name: 'China' },
  KR: { id: '2410', name: 'South Korea' },
  AU: { id: '2036', name: 'Australia' },
  CA: { id: '2124', name: 'Canada' },
  ZA: { id: '2710', name: 'South Africa' },
  NG: { id: '2566', name: 'Nigeria' },
  EG: { id: '2818', name: 'Egypt' },
  KE: { id: '2404', name: 'Kenya' },
  ET: { id: '2231', name: 'Ethiopia' },
  GH: { id: '2288', name: 'Ghana' },
  TZ: { id: '2834', name: 'Tanzania' },
  TR: { id: '2792', name: 'Turkey' },
  KW: { id: '2414', name: 'Kuwait' },
  QA: { id: '2634', name: 'Qatar' },
  BH: { id: '2048', name: 'Bahrain' },
  OM: { id: '2512', name: 'Oman' },
  IQ: { id: '2368', name: 'Iraq' },
  PK: { id: '2586', name: 'Pakistan' },
  BD: { id: '2050', name: 'Bangladesh' },
  LK: { id: '2144', name: 'Sri Lanka' },
  MY: { id: '2458', name: 'Malaysia' },
  SG: { id: '2702', name: 'Singapore' },
  ID: { id: '2360', name: 'Indonesia' },
  TH: { id: '2764', name: 'Thailand' },
  VN: { id: '2704', name: 'Vietnam' },
  PH: { id: '2608', name: 'Philippines' },
  MX: { id: '2484', name: 'Mexico' },
  AR: { id: '2032', name: 'Argentina' },
  CO: { id: '2170', name: 'Colombia' },
  CL: { id: '2152', name: 'Chile' },
  PE: { id: '2604', name: 'Peru' },
  NL: { id: '2528', name: 'Netherlands' },
  BE: { id: '2056', name: 'Belgium' },
  SE: { id: '2752', name: 'Sweden' },
  NO: { id: '2578', name: 'Norway' },
  DK: { id: '2208', name: 'Denmark' },
  FI: { id: '2246', name: 'Finland' },
  PL: { id: '2616', name: 'Poland' },
  CZ: { id: '2203', name: 'Czech Republic' },
  AT: { id: '2040', name: 'Austria' },
  CH: { id: '2756', name: 'Switzerland' },
  IE: { id: '2372', name: 'Ireland' },
  NZ: { id: '2554', name: 'New Zealand' },
  UZ: { id: '2860', name: 'Uzbekistan' },
  KZ: { id: '2398', name: 'Kazakhstan' },
  AZ: { id: '2031', name: 'Azerbaijan' },
  GE: { id: '2268', name: 'Georgia' },
};

export async function setCampaignLocations(
  userId: number,
  customerId: string,
  campaignResourceName: string,
  countryCodes: string[]
): Promise<any> {
  const cleanCustomerId = customerId.replace(/-/g, '');

  const existingCriteria = await executeGaql(userId, customerId,
    `SELECT campaign_criterion.criterion_id, campaign_criterion.type FROM campaign_criterion WHERE campaign.resource_name = '${campaignResourceName}' AND campaign_criterion.type = 'LOCATION'`
  );

  const removeOps = existingCriteria.map((r: any) => ({
    remove: `${campaignResourceName}/campaignCriteria/${r.campaignCriterion.criterionId}`
  }));

  if (removeOps.length > 0) {
    await mutateGoogleAds(userId, cleanCustomerId, 'campaignCriteria', removeOps);
  }

  const addOps = countryCodes.map(code => {
    const country = GOOGLE_ADS_COUNTRIES[code];
    if (!country) throw new Error(`Unsupported country code: ${code}`);
    return {
      create: {
        campaign: campaignResourceName,
        location: { geoTargetConstant: `geoTargetConstants/${country.id}` },
      }
    };
  });

  if (addOps.length > 0) {
    return mutateGoogleAds(userId, cleanCustomerId, 'campaignCriteria', addOps);
  }

  return { results: [] };
}

export async function getCampaignLocations(
  userId: number,
  customerId: string,
  campaignResourceName: string
): Promise<string[]> {
  const results = await executeGaql(userId, customerId,
    `SELECT campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign.resource_name = '${campaignResourceName}' AND campaign_criterion.type = 'LOCATION'`
  );

  const geoIdToCode: Record<string, string> = {};
  for (const [code, country] of Object.entries(GOOGLE_ADS_COUNTRIES)) {
    geoIdToCode[country.id] = code;
  }

  return results.map((r: any) => {
    const constant = r.campaignCriterion?.location?.geoTargetConstant || '';
    const id = constant.split('/').pop();
    return geoIdToCode[id] || id;
  }).filter(Boolean);
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

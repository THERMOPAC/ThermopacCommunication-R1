import { getValidAccessToken } from './google-ads-auth';

const GOOGLE_ADS_API_VERSION = 'v17';
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

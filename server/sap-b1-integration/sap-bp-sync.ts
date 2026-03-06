import { sapHttpsClient } from './sap-https-client';

interface SapBPData {
  CardCode: string;
  CardName: string;
  CardType: string;
  Phone1?: string;
  EmailAddress?: string;
  ContactPerson?: string;
  BillToAddress?: string;
  ShipToAddress?: string;
  Country?: string;
  GlblLocNum?: string;
  U_StateSupply?: string;
  U_BP_GST_Type?: string;
}

class SapBPSyncService {
  private sessionId: string | null = null;
  private routeId: string | null = null;
  private sessionExpiresAt: Date | null = null;

  private async ensureSession(): Promise<string> {
    if (this.sessionId && this.sessionExpiresAt && this.sessionExpiresAt > new Date()) {
      return this.sessionId;
    }

    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    const companyDb = process.env.SAP_COMPANY_DB;

    if (!username || !password || !companyDb) {
      throw new Error('SAP credentials not configured (SAP_USERNAME, SAP_PASSWORD, SAP_COMPANY_DB)');
    }

    const { sessionId, response } = await sapHttpsClient.login(username, password, companyDb);
    this.sessionId = sessionId;

    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookie of cookieArray) {
        const match = cookie.match(/ROUTEID=([^;]+)/);
        if (match) {
          this.routeId = match[1];
          break;
        }
      }
    }

    this.sessionExpiresAt = new Date(Date.now() + 25 * 60 * 1000);
    console.log('🔐 SAP BP Sync: Auto-login successful');
    return sessionId;
  }

  private async makeRequest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: any) {
    const sessionId = await this.ensureSession();
    const headers: Record<string, string> = {};
    if (this.routeId) {
      headers['Cookie'] = `B1SESSION=${sessionId}; ROUTEID=${this.routeId}`;
    }

    const response = await sapHttpsClient.authenticatedRequest(sessionId, {
      method,
      path,
      body,
      headers
    });

    if (response.statusCode === 401) {
      this.sessionId = null;
      this.sessionExpiresAt = null;
      const retrySessionId = await this.ensureSession();
      const retryHeaders: Record<string, string> = {};
      if (this.routeId) {
        retryHeaders['Cookie'] = `B1SESSION=${retrySessionId}; ROUTEID=${this.routeId}`;
      }
      return await sapHttpsClient.authenticatedRequest(retrySessionId, {
        method,
        path,
        body,
        headers: retryHeaders
      });
    }

    return response;
  }

  private mapCustomerToSapBP(customer: any): SapBPData {
    const cardTypeMap: Record<string, string> = {
      'C': 'cCustomer',
      'S': 'cSupplier',
      'L': 'cLid'
    };

    return {
      CardCode: customer.bpCode,
      CardName: customer.bpName,
      CardType: cardTypeMap[customer.cardType] || 'cCustomer',
      Phone1: customer.phone1 || undefined,
      EmailAddress: customer.email || undefined,
      ContactPerson: customer.contactPerson || undefined,
      Country: customer.countryName || undefined,
      GlblLocNum: customer.glblLocNum || 'NA',
      U_StateSupply: customer.uStateSupply || 'MH',
      U_BP_GST_Type: customer.uBpGstType || 'G',
    };
  }

  async checkBPExists(cardCode: string): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')?$select=CardCode`);
      return response.ok;
    } catch (error) {
      console.error('SAP BP Sync: Error checking BP existence:', error);
      return false;
    }
  }

  async createBusinessPartner(customer: any): Promise<{ success: boolean; error?: string }> {
    try {
      const bpData = this.mapCustomerToSapBP(customer);
      console.log(`📤 SAP BP Sync: Creating BP ${bpData.CardCode} - ${bpData.CardName}`);

      const exists = await this.checkBPExists(bpData.CardCode);
      if (exists) {
        console.log(`⚠️ SAP BP Sync: BP ${bpData.CardCode} already exists, updating instead`);
        return await this.updateBusinessPartner(customer);
      }

      const response = await this.makeRequest('POST', '/b1s/v1/BusinessPartners', bpData);

      if (response.ok) {
        console.log(`✅ SAP BP Sync: BP ${bpData.CardCode} created successfully`);
        return { success: true };
      } else {
        let errorMsg = `Status ${response.statusCode}`;
        try {
          const errorBody = JSON.parse(response.body);
          errorMsg = errorBody?.error?.message?.value || errorMsg;
        } catch {}
        console.error(`❌ SAP BP Sync: Failed to create BP ${bpData.CardCode}: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error: any) {
      console.error('❌ SAP BP Sync: Create error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async updateBusinessPartner(customer: any): Promise<{ success: boolean; error?: string }> {
    try {
      const bpData = this.mapCustomerToSapBP(customer);
      const cardCode = bpData.CardCode;
      delete (bpData as any).CardCode;
      delete (bpData as any).CardType;

      console.log(`📤 SAP BP Sync: Updating BP ${cardCode}`);

      const response = await this.makeRequest('PATCH', `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')`, bpData);

      if (response.ok || response.statusCode === 204) {
        console.log(`✅ SAP BP Sync: BP ${cardCode} updated successfully`);
        return { success: true };
      } else {
        let errorMsg = `Status ${response.statusCode}`;
        try {
          const errorBody = JSON.parse(response.body);
          errorMsg = errorBody?.error?.message?.value || errorMsg;
        } catch {}
        console.error(`❌ SAP BP Sync: Failed to update BP ${cardCode}: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error: any) {
      console.error('❌ SAP BP Sync: Update error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export const sapBPSyncService = new SapBPSyncService();

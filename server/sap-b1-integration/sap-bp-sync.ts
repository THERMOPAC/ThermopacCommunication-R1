import { sapSession } from './sap-central-session';

interface SapBPAddress {
  AddressName: string;
  AddressType: string;
  Street?: string;
  Block?: string;
  City?: string;
  State?: string;
  Country?: string;
}

interface SapBPData {
  CardCode: string;
  CardName: string;
  CardType: string;
  Cellular?: string;
  EmailAddress?: string;
  ContactPerson?: string;
  ContactEmployees?: Array<{ Name: string; Position?: string; E_Mail?: string; Phone1?: string }>;
  BPAddresses?: SapBPAddress[];
  Country?: string;
  Currency?: string;
  GlobalLocationNumber?: string;
  U_PAN_Number?: string;
  U_StateSupply?: string;
  U_BP_GST_Type?: string;
}

class SapBPSyncService {
  private countryNameToCode(countryName: string): string | undefined {
    const map: Record<string, string> = {
      'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Angola': 'AO', 'Argentina': 'AR',
      'Armenia': 'AM', 'Australia': 'AU', 'Austria': 'AT', 'Azerbaijan': 'AZ', 'Bahrain': 'BH',
      'Bangladesh': 'BD', 'Belarus': 'BY', 'Belgium': 'BE', 'Benin': 'BJ', 'Bolivia': 'BO',
      'Bosnia and Herzegovina': 'BA', 'Botswana': 'BW', 'Brazil': 'BR', 'Brunei': 'BN',
      'Bulgaria': 'BG', 'Burkina Faso': 'BF', 'Cameroon': 'CM', 'Canada': 'CA', 'Chad': 'TD',
      'Chile': 'CL', 'China': 'CN', 'Colombia': 'CO', 'Congo': 'CG', 'Costa Rica': 'CR',
      'Croatia': 'HR', 'Cuba': 'CU', 'Cyprus': 'CY', 'Czech Republic': 'CZ', 'Czechia': 'CZ',
      'Denmark': 'DK', 'Ecuador': 'EC', 'Egypt': 'EG', 'El Salvador': 'SV', 'Estonia': 'EE',
      'Ethiopia': 'ET', 'Finland': 'FI', 'France': 'FR', 'Gabon': 'GA', 'Georgia': 'GE',
      'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR', 'Guatemala': 'GT', 'Guinea': 'GN',
      'Honduras': 'HN', 'Hong Kong': 'HK', 'Hungary': 'HU', 'Iceland': 'IS', 'India': 'IN',
      'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ', 'Ireland': 'IE', 'Israel': 'IL',
      'Italy': 'IT', 'Ivory Coast': 'CI', "Cote d'Ivoire": 'CI', 'Jamaica': 'JM', 'Japan': 'JP',
      'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Kuwait': 'KW', 'Kyrgyzstan': 'KG',
      'Latvia': 'LV', 'Lebanon': 'LB', 'Libya': 'LY', 'Lithuania': 'LT', 'Luxembourg': 'LU',
      'Madagascar': 'MG', 'Malawi': 'MW', 'Malaysia': 'MY', 'Mali': 'ML', 'Malta': 'MT',
      'Mauritania': 'MR', 'Mauritius': 'MU', 'Mexico': 'MX', 'Moldova': 'MD', 'Mongolia': 'MN',
      'Montenegro': 'ME', 'Morocco': 'MA', 'Mozambique': 'MZ', 'Myanmar': 'MM', 'Namibia': 'NA',
      'Nepal': 'NP', 'Netherlands': 'NL', 'New Zealand': 'NZ', 'Nicaragua': 'NI', 'Niger': 'NE',
      'Nigeria': 'NG', 'North Macedonia': 'MK', 'Norway': 'NO', 'Oman': 'OM', 'Pakistan': 'PK',
      'Palestine': 'PS', 'Panama': 'PA', 'Paraguay': 'PY', 'Peru': 'PE', 'Philippines': 'PH',
      'Poland': 'PL', 'Portugal': 'PT', 'Qatar': 'QA', 'Romania': 'RO', 'Russia': 'RU',
      'Rwanda': 'RW', 'Saudi Arabia': 'SA', 'Senegal': 'SN', 'Serbia': 'RS', 'Sierra Leone': 'SL',
      'Singapore': 'SG', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Somalia': 'SO', 'South Africa': 'ZA',
      'South Korea': 'KR', 'Spain': 'ES', 'Sri Lanka': 'LK', 'Sudan': 'SD', 'Sweden': 'SE',
      'Switzerland': 'CH', 'Syria': 'SY', 'Taiwan': 'TW', 'Tanzania': 'TZ', 'Thailand': 'TH',
      'Togo': 'TG', 'Trinidad and Tobago': 'TT', 'Tunisia': 'TN', 'Turkey': 'TR', 'Turkmenistan': 'TM',
      'UAE': 'AE', 'United Arab Emirates': 'AE', 'Uganda': 'UG', 'Ukraine': 'UA',
      'United Kingdom': 'GB', 'UK': 'GB', 'United States': 'US', 'USA': 'US',
      'Uruguay': 'UY', 'Uzbekistan': 'UZ', 'Venezuela': 'VE', 'Vietnam': 'VN',
      'Yemen': 'YE', 'Zambia': 'ZM', 'Zimbabwe': 'ZW',
    };
    if (!countryName) return undefined;
    if (countryName.length === 2) return countryName.toUpperCase();
    return map[countryName] || undefined;
  }

  private parseAddress(name: string, type: string, fullAddress: string, countryCode?: string, stateCode?: string): SapBPAddress {
    const lines = fullAddress.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const addr: SapBPAddress = {
      AddressName: name,
      AddressType: type,
      Country: countryCode,
      State: stateCode || undefined,
    };

    if (lines.length === 1) {
      addr.Street = lines[0].substring(0, 100);
    } else if (lines.length === 2) {
      addr.Street = lines[0].substring(0, 100);
      addr.City = lines[1].substring(0, 100);
    } else if (lines.length === 3) {
      addr.Street = lines[0].substring(0, 100);
      addr.Block = lines[1].substring(0, 100);
      addr.City = lines[2].substring(0, 100);
    } else {
      addr.Street = lines.slice(0, 2).join(', ').substring(0, 100);
      addr.Block = lines.slice(2, -1).join(', ').substring(0, 100);
      addr.City = lines[lines.length - 1].substring(0, 100);
    }

    return addr;
  }

  private mapCustomerToSapBP(customer: any): SapBPData {
    const cardTypeMap: Record<string, string> = {
      'C': 'cCustomer',
      'S': 'cSupplier',
      'V': 'cSupplier',
      'L': 'cLid',
      'Customer': 'cCustomer',
      'Supplier': 'cSupplier',
      'Vendor': 'cSupplier',
      'Lead': 'cLid',
    };

    const countryCode = this.countryNameToCode(customer.countryName);

    const result: SapBPData = {
      CardCode: customer.bpCode,
      CardName: customer.bpName,
      CardType: cardTypeMap[customer.cardType] || 'cCustomer',
      Cellular: customer.phone1 || undefined,
      EmailAddress: customer.email || undefined,
      Country: countryCode,
      Currency: customer.currency || (customer.countryName === 'India' ? 'INR' : 'USD'),
    };

    if (customer.contactPerson) {
      const contacts: Array<{ Name: string; Position?: string; E_Mail?: string; Phone1?: string }> = [];
      contacts.push({
        Name: customer.contactPerson,
        Position: customer.contactPosition || undefined,
        E_Mail: customer.email || undefined,
        Phone1: customer.phone1 || undefined,
      });
      if (customer.contact2Name) {
        contacts.push({
          Name: customer.contact2Name,
          Position: customer.contact2Position || undefined,
          E_Mail: customer.contact2Email || undefined,
          Phone1: customer.contact2Phone || undefined,
        });
      }
      if (customer.contact3Name) {
        contacts.push({
          Name: customer.contact3Name,
          Position: customer.contact3Position || undefined,
          E_Mail: customer.contact3Email || undefined,
          Phone1: customer.contact3Phone || undefined,
        });
      }
      result.ContactEmployees = contacts;
      result.ContactPerson = customer.contactPerson;
    }

    const stateCode = (countryCode === 'IN' && customer.uStateSupply) ? customer.uStateSupply : undefined;
    const bpAddresses: SapBPAddress[] = [];
    if (customer.billToAddress) {
      bpAddresses.push(this.parseAddress('Bill To', 'bo_BillTo', customer.billToAddress, countryCode, stateCode));
    }
    if (customer.shipToAddress) {
      bpAddresses.push(this.parseAddress('Ship To', 'bo_ShipTo', customer.shipToAddress, countryCode, stateCode));
    }
    if (bpAddresses.length > 0) {
      result.BPAddresses = bpAddresses;
    }

    const gln = customer.glblLocNum;
    if (gln && gln !== 'NA' && gln.trim() !== '') {
      result.GlobalLocationNumber = gln;
    }

    if (countryCode === 'IN') {
      const stateSupply = customer.uStateSupply;
      if (stateSupply && stateSupply.trim() !== '') {
        result.U_StateSupply = stateSupply;
      }

      const gstType = customer.uBpGstType;
      if (gstType && gstType.trim() !== '') {
        result.U_BP_GST_Type = gstType;
      }

      const pan = customer.panNumber;
      if (pan && pan.trim() !== '') {
        result.U_PAN_Number = pan.trim();
      }
    }

    return result;
  }

  async checkBPExists(cardCode: string): Promise<boolean> {
    try {
      const response = await sapSession.request({ method: 'GET', path: `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')?$select=CardCode` });
      return response.ok;
    } catch (error) {
      console.error('SAP BP Sync: Error checking BP existence:', error);
      return false;
    }
  }

  async createBusinessPartner(customer: any, _retryDepth = 0): Promise<{ success: boolean; error?: string }> {
    try {
      if (_retryDepth > 1) {
        const msg = `SAP BP Sync: Max retry depth reached for ${customer.bpCode}, aborting`;
        console.error(`❌ ${msg}`);
        return { success: false, error: msg };
      }

      const bpData = this.mapCustomerToSapBP(customer);
      console.log(`📤 SAP BP Sync: Creating BP ${bpData.CardCode} - ${bpData.CardName}`);

      const exists = await this.checkBPExists(bpData.CardCode);
      if (exists) {
        console.log(`⚠️ SAP BP Sync: BP ${bpData.CardCode} already exists, updating instead`);
        return await this.updateBusinessPartner(customer, _retryDepth + 1);
      }

      const response = await sapSession.request({ method: 'POST', path: '/b1s/v1/BusinessPartners', body: bpData });

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

  async updateBusinessPartner(customer: any, _retryDepth = 0): Promise<{ success: boolean; error?: string }> {
    try {
      if (_retryDepth > 1) {
        const msg = `SAP BP Sync: Max retry depth reached for ${customer.bpCode}, aborting`;
        console.error(`❌ ${msg}`);
        return { success: false, error: msg };
      }

      const bpData = this.mapCustomerToSapBP(customer);
      const cardCode = bpData.CardCode;
      delete (bpData as any).CardCode;
      delete (bpData as any).CardType;

      console.log(`📤 SAP BP Sync: Updating BP ${cardCode}`);
      console.log(`📦 SAP BP Sync: Update payload:`, JSON.stringify(bpData, null, 2));

      const response = await sapSession.request({ method: 'PATCH', path: `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')`, body: bpData });

      if (response.ok || response.statusCode === 204) {
        console.log(`✅ SAP BP Sync: BP ${cardCode} updated successfully`);
        return { success: true };
      } else {
        let errorMsg = `Status ${response.statusCode}`;
        try {
          const errorBody = JSON.parse(response.body);
          errorMsg = errorBody?.error?.message?.value || errorMsg;
        } catch {}

        console.log(`⚠️ SAP BP Sync: Update failed for ${cardCode}: ${errorMsg}`);

        if (errorMsg.includes('does not exist') && !errorMsg.includes('Linked value') && !errorMsg.includes('BPAddresses')) {
          console.log(`⚠️ SAP BP Sync: BP ${cardCode} not found in SAP, creating instead`);
          return await this.createBusinessPartner(customer, _retryDepth + 1);
        }

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

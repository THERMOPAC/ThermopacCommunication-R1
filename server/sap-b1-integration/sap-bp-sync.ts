import { sapSession } from './sap-central-session';

interface SapBPAddress {
  AddressName: string;
  AddressType: string;
  // Official SAP Service Layer / DI API field names (valid for POST/PATCH):
  AddressName2?: string;      // Address Line 1  (SAP doc: "Address2")
  AddressName3?: string;      // Address Line 2  (SAP doc: "Address3")
  Block?: string;             // Block / Sector
  BuildingFloorRoom?: string; // Building / Floor / Room  (SAP doc: "Building")
  City?: string;
  ZipCode?: string;
  State?: string;
  Country?: string;
  // Legacy Street field kept for the CREATE path (parseAddress) only
  Street?: string;
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

  // Used by CREATE path — parses a legacy freeform address string.
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

  // Used by UPDATE path — builds address from granular DB fields.
  // Official SAP Service Layer field names (POST/PATCH) per SAP documentation:
  //   Address Line 1 → AddressName2     (SAP doc label: "Address2")
  //   Address Line 2 → AddressName3     (SAP doc label: "Address3")
  //   Block          → Block
  //   Building       → BuildingFloorRoom (SAP doc label: "Building")
  //   City           → City
  private buildGranularAddress(
    name: string,
    type: string,
    line1: string | null | undefined,
    line2: string | null | undefined,
    block: string | null | undefined,
    building: string | null | undefined,
    city: string | null | undefined,
    countryCode?: string,
    stateCode?: string,
  ): SapBPAddress {
    const addr: SapBPAddress = {
      AddressName: name,
      AddressType: type,
      Country: countryCode,
      State: stateCode || undefined,
    };
    const s = (v: string | null | undefined) => (v && v.trim()) ? v.trim().substring(0, 100) : undefined;
    if (s(line1))     addr.AddressName2      = s(line1);
    if (s(line2))     addr.AddressName3      = s(line2);
    if (s(block))     addr.Block             = s(block);
    if (s(building))  addr.BuildingFloorRoom = s(building);
    if (s(city))      addr.City              = s(city);
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

    // Guard against dummy phone values that SAP rejects
    const rawPhone = (customer.phone1 || '').trim();
    const validPhone = rawPhone && rawPhone !== '-' && rawPhone !== '-111' && rawPhone !== 'NA'
      ? rawPhone : undefined;

    const result: SapBPData = {
      CardCode: customer.bpCode,
      CardName: customer.bpName,
      CardType: cardTypeMap[customer.cardType] || 'cCustomer',
      Cellular: validPhone,
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

    // Prefer granular address fields (sent by the vendor/customer form).
    // Fall back to legacy combined billToAddress string only if granular fields absent.
    const hasBillGranular = customer.billAddrLine1 || customer.billAddrLine2 || customer.billAddrCity;
    if (hasBillGranular) {
      bpAddresses.push(this.buildGranularAddress('Bill To', 'bo_BillTo',
        customer.billAddrLine1, customer.billAddrLine2,
        customer.billAddrBlock, customer.billAddrBuilding,
        customer.billAddrCity, countryCode, stateCode));
    } else if (customer.billToAddress) {
      bpAddresses.push(this.parseAddress('Bill To', 'bo_BillTo', customer.billToAddress, countryCode, stateCode));
    }

    const hasShipGranular = customer.shipAddrLine1 || customer.shipAddrLine2 || customer.shipAddrCity;
    if (hasShipGranular) {
      bpAddresses.push(this.buildGranularAddress('Ship To', 'bo_ShipTo',
        customer.shipAddrLine1, customer.shipAddrLine2,
        customer.shipAddrBlock, customer.shipAddrBuilding,
        customer.shipAddrCity, countryCode, stateCode));
    } else if (customer.shipToAddress) {
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

      const cardCode = customer.bpCode;
      const countryCode = this.countryNameToCode(customer.countryName);
      const stateCode = (countryCode === 'IN' && customer.uStateSupply) ? customer.uStateSupply : undefined;

      // Guard dummy phone values that SAP rejects
      const rawPhone = (customer.phone1 || '').trim();
      const validPhone = rawPhone && rawPhone !== '-' && rawPhone !== '-111' && rawPhone !== 'NA' && !/^-+\d*$/.test(rawPhone)
        ? rawPhone : undefined;

      // Full PATCH payload — all editable fields.
      // Immutable fields excluded: CardCode (URL parameter), CardType (SAP-managed).
      // If SAP rejects any field, its exact error message is logged and sap_sync_status='failed'.
      const bpData: Record<string, unknown> = {
        CardName: customer.bpName,
      };

      if (validPhone)         bpData.Cellular      = validPhone;
      if (customer.email)     bpData.EmailAddress  = customer.email;
      if (countryCode)        bpData.Country       = countryCode;
      if (customer.currency)  bpData.Currency      = customer.currency;

      // Pre-fetch the full BP record from SAP (no $select — adding $select strips UDFs and
      // can cause session contamination). We need:
      //   1. ContactEmployees.InternalCode — SAP treats entries WITHOUT InternalCode as INSERTs,
      //      causing ODBC -2035 "already exists". Including InternalCode tells SAP to UPDATE.
      const existingContactCode: Record<string, number> = {};
      try {
        const getResp = await sapSession.request({
          method: 'GET',
          path: `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')`,
        });
        if (getResp.ok) {
          const bpBody = JSON.parse(getResp.body);
          const existingContacts: any[] = Array.isArray(bpBody.ContactEmployees) ? bpBody.ContactEmployees : [];
          for (const c of existingContacts) {
            if (c.Name && c.InternalCode != null) {
              existingContactCode[String(c.Name)] = Number(c.InternalCode);
            }
          }
          console.log(`[SAP BP Sync] Fetched ${existingContacts.length} existing contact(s) for ${cardCode}:`, Object.keys(existingContactCode));
        }
      } catch (e: any) {
        console.warn(`[SAP BP Sync] Could not pre-fetch BP data for ${cardCode}: ${e.message}`);
      }

      // ContactEmployees (up to 3 contacts) — InternalCode included for existing contacts
      if (customer.contactPerson) {
        const buildContact = (name: string, pos?: string, email?: string, phone?: string) => {
          const entry: Record<string, unknown> = { Name: name };
          if (existingContactCode[name] != null) entry.InternalCode = existingContactCode[name];
          if (pos)   entry.Position = pos;
          if (email) entry.E_Mail  = email;
          if (phone) entry.Phone1  = phone;
          return entry;
        };
        const contacts = [
          buildContact(customer.contactPerson, customer.contactPosition || undefined, customer.email || undefined, customer.phone1 || undefined),
          ...(customer.contact2Name ? [buildContact(customer.contact2Name, customer.contact2Position || undefined, customer.contact2Email || undefined, customer.contact2Phone || undefined)] : []),
          ...(customer.contact3Name ? [buildContact(customer.contact3Name, customer.contact3Position || undefined, customer.contact3Email || undefined, customer.contact3Phone || undefined)] : []),
        ];
        bpData.ContactEmployees = contacts;
        bpData.ContactPerson = customer.contactPerson;
      }

      // BPAddresses — intentionally excluded from PATCH updates.
      // SAP uses AddressName as the unique key per CardCode. Many BPs store the same
      // AddressName for both bo_BillTo and bo_ShipTo (e.g. company name as key).
      // Sending two BPAddress entries with the same AddressName in one PATCH causes
      // SAP to treat the second as a duplicate INSERT → ODBC -2035.
      // Address data flows FROM SAP into our DB during Full Sync (read direction).
      // We do not push address changes back to SAP to avoid this class of errors.

      // GSTIN (GlobalLocationNumber)
      const gln = customer.glblLocNum;
      if (gln && gln !== 'NA' && gln.trim()) bpData.GlobalLocationNumber = gln.trim();

      // India-specific UDFs and GST fields
      if (countryCode === 'IN') {
        if (customer.uStateSupply?.trim())  bpData.U_StateSupply   = customer.uStateSupply.trim();
        if (customer.uBpGstType?.trim())    bpData.U_BP_GST_Type   = customer.uBpGstType.trim();
        if (customer.panNumber?.trim())     bpData.U_PAN_Number    = customer.panNumber.trim();
      }

      console.log(`📤 SAP BP Sync: Updating BP ${cardCode}`);
      console.log(`📦 SAP BP Sync: Update payload:`, JSON.stringify(bpData, null, 2));

      let response = await sapSession.request({
        method: 'PATCH',
        path: `/b1s/v1/BusinessPartners('${encodeURIComponent(cardCode)}')`,
        body: bpData,
      });

      // Auto-retry on "Error -1 / commit transaction" — stale session from bulk sync or
      // from the GET pre-fetch above contaminating the session.
      // Invalidate and retry the FULL flow (GET InternalCode + PATCH) with a fresh login.
      if (!response.ok && response.statusCode !== 204 && _retryDepth === 0) {
        let firstErrorMsg = `Status ${response.statusCode}`;
        try {
          const eb = JSON.parse(response.body);
          firstErrorMsg = eb?.error?.message?.value || firstErrorMsg;
        } catch {}
        if (firstErrorMsg.toLowerCase().includes('error -1') || firstErrorMsg.toLowerCase().includes('commit transaction')) {
          console.warn(`⚠️ SAP BP Sync: Error -1 for ${cardCode} — invalidating session and retrying full flow with fresh login`);
          await sapSession.invalidate();
          return await this.updateBusinessPartner(customer, 1);
        }
      }

      if (response.ok || response.statusCode === 204) {
        console.log(`✅ SAP BP Sync: BP ${cardCode} updated successfully`);
        return { success: true };
      } else {
        let errorMsg = `Status ${response.statusCode}`;
        try {
          const errorBody = JSON.parse(response.body);
          errorMsg = errorBody?.error?.message?.value || errorMsg;
        } catch {}

        console.error(`❌ SAP BP Sync: PATCH failed for ${cardCode} — SAP error: ${errorMsg}`);
        console.error(`❌ SAP BP Sync: Payload that was rejected:`, JSON.stringify(bpData, null, 2));

        if (errorMsg.includes('does not exist') && !errorMsg.includes('Linked value') && !errorMsg.includes('BPAddresses')) {
          console.log(`⚠️ SAP BP Sync: BP ${cardCode} not found in SAP, creating instead`);
          return await this.createBusinessPartner(customer, _retryDepth + 1);
        }

        return { success: false, error: errorMsg };
      }
    } catch (error: any) {
      console.error('❌ SAP BP Sync: Update error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export const sapBPSyncService = new SapBPSyncService();

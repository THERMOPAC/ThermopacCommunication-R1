/**
 * company-context.ts
 * Wave 1 — Hardcoded Callsite Migration
 *
 * Single server-side helper that reads the active company from company_master.
 * Called by all server-side callsites that previously had hardcoded THERMOPAC/TPEL strings.
 *
 * CONTRACT:
 *   - Returns ActiveCompanyContext or throws 'COMPANY_DATA_UNAVAILABLE'.
 *   - Never returns null. Never returns partial data.
 *   - Callers decide whether to use COMPANY_FALLBACK or abort on error.
 */

import { db } from '../db';
import { companyMaster, companyAddresses } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface ActiveCompanyContext {
  id: number;
  companyCode: string;
  shortName: string;
  legalName: string;
  displayName: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  description: string | null;
  logoGcsPath: string | null;
  registeredOffice: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    country: string;
    pinCode: string | null;
  } | null;
}

export async function getActiveCompany(): Promise<ActiveCompanyContext> {
  try {
    const [company] = await db
      .select()
      .from(companyMaster)
      .where(eq(companyMaster.isActive, true))
      .limit(1);

    if (!company) {
      console.error('[company-context] FATAL: no active company found in company_master');
      throw new Error('COMPANY_DATA_UNAVAILABLE');
    }

    const [addr] = await db
      .select()
      .from(companyAddresses)
      .where(
        and(
          eq(companyAddresses.companyId, company.id),
          eq(companyAddresses.addressType, 'registered_office'),
          eq(companyAddresses.isActive, true),
        ),
      )
      .limit(1);

    return {
      id:           company.id,
      companyCode:  company.companyCode,
      shortName:    company.shortName,
      legalName:    company.legalName,
      displayName:  company.displayName,
      phone:        company.phone ?? null,
      fax:          company.fax ?? null,
      email:        company.email ?? null,
      description:  company.description ?? null,
      logoGcsPath:  company.logoGcsPath ?? null,
      registeredOffice: addr
        ? {
            line1:   addr.addressLine1 ?? null,
            line2:   addr.addressLine2 ?? null,
            city:    addr.city ?? null,
            state:   addr.state ?? null,
            country: addr.country,
            pinCode: addr.pinCode ?? null,
          }
        : null,
    };
  } catch (err: any) {
    if (err?.message === 'COMPANY_DATA_UNAVAILABLE') throw err;
    console.error('[company-context] DB error reading active company:', err?.message ?? err);
    throw new Error('COMPANY_DATA_UNAVAILABLE');
  }
}

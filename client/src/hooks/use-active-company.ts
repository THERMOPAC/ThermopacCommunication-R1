/**
 * use-active-company.ts
 * Wave 1 — Hardcoded Callsite Migration
 *
 * React hook wrapping GET /api/company/active for client-side callsites.
 * Replaces hardcoded THERMOPAC/TPEL strings in client-rendered documents.
 */

import { useQuery } from '@tanstack/react-query';

export interface ActiveCompanyPayload {
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

export function useActiveCompany() {
  return useQuery<ActiveCompanyPayload>({
    queryKey: ['/api/company/active'],
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

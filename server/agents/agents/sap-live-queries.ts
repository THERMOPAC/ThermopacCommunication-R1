/**
 * SAP Live Queries — v2.0 (Phase 1.2 — SAP Session Unification)
 *
 * All SAP requests now route through sapSession.request() (SapCentralSession).
 * No independent logins. No direct SapHttpsClient usage. No independent sessions.
 *
 * Ref: SAP Session Unification Migration Plan v1.2, Phase 1.2
 */
import { sapSession } from '../../sap-b1-integration/sap-central-session';

const SAP_BASE_PATH = '/b1s/v1';
const MAX_PAGES = 500;

export interface SapOpenPO {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
  DocDate: string;
  DocDueDate: string;
  DocTotal: number;
  DocCurrency: string;
  DocumentStatus: string;
  Project: string | null;
  Comments: string | null;
  daysOverdue: number;
  daysSinceCreated: number;
}

export interface SapGRPO {
  DocEntry: number;
  DocNum: number;
  CardName: string;
  DocDate: string;
  DocumentLines: Array<{
    BaseEntry: number;
    BaseLine: number;
    ItemCode: string;
    Quantity: number;
  }>;
}

export interface SapLiveResult<T> {
  available: boolean;
  data: T;
  error?: string;
}

export async function fetchOpenPurchaseOrders(): Promise<SapLiveResult<SapOpenPO[]>> {
  const now = new Date();
  const filter = `DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'`;
  const select = 'DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocTotal,DocCurrency,DocumentStatus,Project,Comments';
  const allPOs: SapOpenPO[] = [];
  let skip = 0;
  const batchSize = 100;
  let pageCount = 0;

  console.log('[SapLiveQueries] fetchOpenPurchaseOrders — start');
  try {
    while (true) {
      if (++pageCount > MAX_PAGES) {
        console.warn('[SapLiveQueries] fetchOpenPurchaseOrders — capped at MAX_PAGES');
        break;
      }
      const resp = await sapSession.request({
        method: 'GET',
        path: `${SAP_BASE_PATH}/PurchaseOrders?$filter=${encodeURIComponent(filter)}&$select=${select}&$orderby=DocDueDate asc&$top=${batchSize}&$skip=${skip}`,
        timeout: 30000,
      });
      if (resp.statusCode !== 200) break;
      const data = JSON.parse(resp.body);
      const batch = (data.value || []) as any[];
      if (batch.length === 0) break;
      for (const po of batch) {
        const dueDate = po.DocDueDate ? new Date(po.DocDueDate) : null;
        const docDate = po.DocDate ? new Date(po.DocDate) : now;
        allPOs.push({
          DocEntry: po.DocEntry,
          DocNum: po.DocNum,
          CardCode: po.CardCode,
          CardName: po.CardName,
          DocDate: po.DocDate,
          DocDueDate: po.DocDueDate,
          DocTotal: parseFloat(po.DocTotal) || 0,
          DocCurrency: po.DocCurrency || 'INR',
          DocumentStatus: po.DocumentStatus,
          Project: po.Project || null,
          Comments: po.Comments || null,
          daysOverdue: dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000)) : 0,
          daysSinceCreated: Math.floor((now.getTime() - docDate.getTime()) / 86400000),
        });
      }
      if (skip % 100 === 0 && skip > 0) console.log(`[SapLiveQueries] fetchOpenPurchaseOrders — processed ${skip} records so far`);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }
    console.log(`[SapLiveQueries] fetchOpenPurchaseOrders — done (${allPOs.length} records)`);
    return { available: true, data: allPOs };
  } catch (err: any) {
    console.warn(`[SapLiveQueries] fetchOpenPurchaseOrders — unavailable: ${err.message}`);
    return { available: false, data: [], error: err.message };
  }
}

export async function fetchRecentGRPOs(daysBback: number = 14): Promise<SapLiveResult<SapGRPO[]>> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBback);
  const sinceDateStr = sinceDate.toISOString().split('T')[0];
  const filter = `DocDate ge '${sinceDateStr}' and Cancelled eq 'tNO'`;
  const allGRPOs: SapGRPO[] = [];
  let skip = 0;
  const batchSize = 50;
  let pageCount = 0;

  console.log(`[SapLiveQueries] fetchRecentGRPOs — start (last ${daysBback} days)`);
  try {
    while (true) {
      if (++pageCount > MAX_PAGES) {
        console.warn('[SapLiveQueries] fetchRecentGRPOs — capped at MAX_PAGES');
        break;
      }
      const resp = await sapSession.request({
        method: 'GET',
        path: `${SAP_BASE_PATH}/PurchaseDeliveryNotes?$filter=${encodeURIComponent(filter)}&$select=DocEntry,DocNum,CardName,DocDate,DocumentLines&$orderby=DocDate desc&$top=${batchSize}&$skip=${skip}`,
        timeout: 30000,
      });
      if (resp.statusCode !== 200) break;
      const data = JSON.parse(resp.body);
      const batch = (data.value || []) as any[];
      if (batch.length === 0) break;
      for (const gr of batch) {
        allGRPOs.push({
          DocEntry: gr.DocEntry,
          DocNum: gr.DocNum,
          CardName: gr.CardName,
          DocDate: gr.DocDate,
          DocumentLines: (gr.DocumentLines || []).map((l: any) => ({
            BaseEntry: l.BaseEntry,
            BaseLine: l.BaseLine,
            ItemCode: l.ItemCode,
            Quantity: l.Quantity,
          })),
        });
      }
      if (batch.length < batchSize) break;
      skip += batchSize;
    }
    console.log(`[SapLiveQueries] fetchRecentGRPOs — done (${allGRPOs.length} records)`);
    return { available: true, data: allGRPOs };
  } catch (err: any) {
    console.warn(`[SapLiveQueries] fetchRecentGRPOs — unavailable: ${err.message}`);
    return { available: false, data: [], error: err.message };
  }
}

export async function fetchGRPOCountByWeek(): Promise<SapLiveResult<{ prevWeek: number; currWeek: number }>> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];

  try {
    const [currResp, prevResp] = await Promise.all([
      sapSession.request({
        method: 'GET',
        path: `${SAP_BASE_PATH}/PurchaseDeliveryNotes/$count?$filter=${encodeURIComponent(`DocDate ge '${sevenDaysAgo}' and Cancelled eq 'tNO'`)}`,
        timeout: 15000,
      }),
      sapSession.request({
        method: 'GET',
        path: `${SAP_BASE_PATH}/PurchaseDeliveryNotes/$count?$filter=${encodeURIComponent(`DocDate ge '${fourteenDaysAgo}' and DocDate lt '${sevenDaysAgo}' and Cancelled eq 'tNO'`)}`,
        timeout: 15000,
      }),
    ]);
    const currWeek = currResp.statusCode === 200 ? parseInt(currResp.body) || 0 : 0;
    const prevWeek = prevResp.statusCode === 200 ? parseInt(prevResp.body) || 0 : 0;
    return { available: true, data: { prevWeek, currWeek } };
  } catch (err: any) {
    console.warn(`[SapLiveQueries] fetchGRPOCountByWeek — unavailable: ${err.message}`);
    return { available: false, data: { prevWeek: 0, currWeek: 0 }, error: err.message };
  }
}

export function buildGRPOLookupByBasePO(grpos: SapGRPO[]): Record<number, SapGRPO[]> {
  const lookup: Record<number, SapGRPO[]> = {};
  for (const gr of grpos) {
    for (const line of gr.DocumentLines) {
      if (line.BaseEntry) {
        if (!lookup[line.BaseEntry]) lookup[line.BaseEntry] = [];
        if (!lookup[line.BaseEntry].includes(gr)) lookup[line.BaseEntry].push(gr);
      }
    }
  }
  return lookup;
}

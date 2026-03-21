import { SapHttpsClient } from '../../sap-b1-integration/sap-https-client';

const SAP_SERVICE_URL = 'https://59.152.52.58:50000/b1s/v1';

interface SapSession {
  sessionId: string;
  routeId: string;
}

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

async function sapLogin(client: SapHttpsClient): Promise<SapSession | null> {
  try {
    const resp = await client.request({
      method: 'POST',
      url: `${SAP_SERVICE_URL}/Login`,
      body: {
        CompanyDB: process.env.SAP_COMPANY_DB,
        UserName: process.env.SAP_USERNAME,
        Password: process.env.SAP_PASSWORD,
      },
      timeout: 15000,
    });
    if (resp.statusCode === 200) {
      const data = JSON.parse(resp.body);
      return { sessionId: data.SessionId, routeId: resp.headers['set-cookie']?.match(/ROUTEID=([^;]+)/)?.[1] || '' };
    }
    return null;
  } catch {
    return null;
  }
}

function makeHeaders(session: SapSession): Record<string, string> {
  return {
    Cookie: `B1SESSION=${session.sessionId}; ROUTEID=${session.routeId}`,
  };
}

async function sapLogout(client: SapHttpsClient, headers: Record<string, string>): Promise<void> {
  try { await client.request({ method: 'POST', url: `${SAP_SERVICE_URL}/Logout`, headers, timeout: 5000 }); } catch {}
}

export async function fetchOpenPurchaseOrders(): Promise<SapLiveResult<SapOpenPO[]>> {
  const client = new SapHttpsClient();
  const session = await sapLogin(client);
  if (!session) {
    console.warn('[SAP-Agent] Cannot connect to SAP — purchase order data unavailable for agent run');
    return { available: false, data: [], error: 'SAP Service Layer unavailable' };
  }

  const headers = makeHeaders(session);
  const now = new Date();

  try {
    const filter = `DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'`;
    const select = 'DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocTotal,DocCurrency,DocumentStatus,Project,Comments';
    const allPOs: SapOpenPO[] = [];
    let skip = 0;
    const batchSize = 100;

    while (true) {
      const resp = await client.request({
        method: 'GET',
        url: `${SAP_SERVICE_URL}/PurchaseOrders?$filter=${encodeURIComponent(filter)}&$select=${select}&$orderby=DocDueDate asc&$top=${batchSize}&$skip=${skip}`,
        headers,
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

      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    console.log(`[SAP-Agent] Fetched ${allPOs.length} open POs from SAP live`);
    return { available: true, data: allPOs };
  } catch (err: any) {
    console.error(`[SAP-Agent] Error fetching open POs: ${err.message}`);
    return { available: false, data: [], error: err.message };
  } finally {
    await sapLogout(client, headers);
  }
}

export async function fetchRecentGRPOs(daysBback: number = 14): Promise<SapLiveResult<SapGRPO[]>> {
  const client = new SapHttpsClient();
  const session = await sapLogin(client);
  if (!session) {
    console.warn('[SAP-Agent] Cannot connect to SAP — GRPO data unavailable for agent run');
    return { available: false, data: [], error: 'SAP Service Layer unavailable' };
  }

  const headers = makeHeaders(session);
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBback);
  const sinceDateStr = sinceDate.toISOString().split('T')[0];

  try {
    const filter = `DocDate ge '${sinceDateStr}' and Cancelled eq 'tNO'`;
    const allGRPOs: SapGRPO[] = [];
    let skip = 0;
    const batchSize = 50;

    while (true) {
      const resp = await client.request({
        method: 'GET',
        url: `${SAP_SERVICE_URL}/PurchaseDeliveryNotes?$filter=${encodeURIComponent(filter)}&$select=DocEntry,DocNum,CardName,DocDate,DocumentLines&$orderby=DocDate desc&$top=${batchSize}&$skip=${skip}`,
        headers,
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

    console.log(`[SAP-Agent] Fetched ${allGRPOs.length} GRPOs from SAP live (last ${daysBback} days)`);
    return { available: true, data: allGRPOs };
  } catch (err: any) {
    console.error(`[SAP-Agent] Error fetching GRPOs: ${err.message}`);
    return { available: false, data: [], error: err.message };
  } finally {
    await sapLogout(client, headers);
  }
}

export async function fetchGRPOCountByWeek(): Promise<SapLiveResult<{ prevWeek: number; currWeek: number }>> {
  const client = new SapHttpsClient();
  const session = await sapLogin(client);
  if (!session) {
    return { available: false, data: { prevWeek: 0, currWeek: 0 }, error: 'SAP Service Layer unavailable' };
  }

  const headers = makeHeaders(session);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];

  try {
    const [currResp, prevResp] = await Promise.all([
      client.request({
        method: 'GET',
        url: `${SAP_SERVICE_URL}/PurchaseDeliveryNotes/$count?$filter=${encodeURIComponent(`DocDate ge '${sevenDaysAgo}' and Cancelled eq 'tNO'`)}`,
        headers, timeout: 15000,
      }),
      client.request({
        method: 'GET',
        url: `${SAP_SERVICE_URL}/PurchaseDeliveryNotes/$count?$filter=${encodeURIComponent(`DocDate ge '${fourteenDaysAgo}' and DocDate lt '${sevenDaysAgo}' and Cancelled eq 'tNO'`)}`,
        headers, timeout: 15000,
      }),
    ]);

    const currWeek = currResp.statusCode === 200 ? parseInt(currResp.body) || 0 : 0;
    const prevWeek = prevResp.statusCode === 200 ? parseInt(prevResp.body) || 0 : 0;

    return { available: true, data: { prevWeek, currWeek } };
  } catch (err: any) {
    return { available: false, data: { prevWeek: 0, currWeek: 0 }, error: err.message };
  } finally {
    await sapLogout(client, headers);
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

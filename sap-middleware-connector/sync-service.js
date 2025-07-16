const sql = require('mssql');

class SyncService {
  constructor(sapPool) {
    this.sapPool = sapPool;
    this.replitApiUrl = process.env.REPLIT_API_URL || 'https://thermopac-communication-thermopacllp.replit.app';
    this.apiKey = process.env.REPLIT_API_KEY || process.env.API_SECRET_KEY;
  }

  // Sync Purchase Orders from SAP to Replit
  async syncPurchaseOrders() {
    try {
      console.log('🔄 Starting Purchase Orders sync...');
      
      if (!this.sapPool) {
        throw new Error('SAP connection not available');
      }

      // Get Purchase Orders from SAP B1
      const sapQuery = `
        SELECT 
          po.DocEntry,
          po.DocNum,
          po.DocDate,
          po.DocDueDate,
          po.CardCode,
          po.CardName,
          po.DocTotal,
          po.DocStatus,
          po.Comments,
          po.Project,
          ISNULL(po.VatSum, 0) as TotalGSTAmount,
          po.CreateDate,
          po.UpdateDate
        FROM OPOR po
        WHERE po.UpdateDate >= DATEADD(day, -7, GETDATE())
        ORDER BY po.UpdateDate DESC
      `;

      const result = await this.sapPool.request().query(sapQuery);
      const purchaseOrders = result.recordset;

      console.log(`📦 Found ${purchaseOrders.length} Purchase Orders to sync`);

      // Send to Replit app
      for (const po of purchaseOrders) {
        await this.sendToReplit('/api/sap/sync/purchase-orders', {
          action: 'upsert',
          data: po
        });
      }

      console.log('✅ Purchase Orders sync completed successfully');
      return { success: true, count: purchaseOrders.length };

    } catch (error) {
      console.error('❌ Purchase Orders sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Sync Vendors from SAP to Replit
  async syncVendors() {
    try {
      console.log('🔄 Starting Vendors sync...');
      
      if (!this.sapPool) {
        throw new Error('SAP connection not available');
      }

      // Get Vendors from SAP B1
      const sapQuery = `
        SELECT 
          CardCode,
          CardName,
          Phone1,
          E_Mail,
          Balance,
          Currency,
          validFor as Active,
          CreateDate,
          UpdateDate
        FROM OCRD
        WHERE CardType = 'S' 
        AND UpdateDate >= DATEADD(day, -7, GETDATE())
        ORDER BY UpdateDate DESC
      `;

      const result = await this.sapPool.request().query(sapQuery);
      const vendors = result.recordset;

      console.log(`🏢 Found ${vendors.length} Vendors to sync`);

      // Send to Replit app
      for (const vendor of vendors) {
        await this.sendToReplit('/api/sap/sync/vendors', {
          action: 'upsert',
          data: vendor
        });
      }

      console.log('✅ Vendors sync completed successfully');
      return { success: true, count: vendors.length };

    } catch (error) {
      console.error('❌ Vendors sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Send data to Replit application
  async sendToReplit(endpoint, data) {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(`${this.replitApiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to send data to Replit ${endpoint}:`, error);
      throw error;
    }
  }

  // Auto-sync scheduler
  startAutoSync(intervalMinutes = 30) {
    console.log(`🕐 Starting auto-sync every ${intervalMinutes} minutes`);
    
    setInterval(async () => {
      console.log('🔄 Running scheduled sync...');
      
      try {
        await this.syncPurchaseOrders();
        await this.syncVendors();
        console.log('✅ Scheduled sync completed');
      } catch (error) {
        console.error('❌ Scheduled sync failed:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  // Manual sync trigger
  async performFullSync() {
    try {
      console.log('🔄 Starting full manual sync...');
      
      const poResult = await this.syncPurchaseOrders();
      const vendorResult = await this.syncVendors();
      
      return {
        success: true,
        results: {
          purchaseOrders: poResult,
          vendors: vendorResult
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = SyncService;
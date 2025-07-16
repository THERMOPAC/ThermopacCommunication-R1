const axios = require('axios');
const sapConnector = require('./sap-connector');

class ReplitSyncService {
  constructor() {
    this.replitBaseUrl = process.env.REPLIT_APP_URL;
    this.apiKey = process.env.REPLIT_API_KEY;
    this.lastSyncTimes = {};
  }

  async makeReplitRequest(endpoint, method = 'GET', data = null) {
    try {
      const config = {
        method,
        url: `${this.replitBaseUrl}/api/sap${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'User-Agent': 'SAP-B1-Middleware-Connector/1.0'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Replit API error: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`);
      } else if (error.request) {
        throw new Error(`Network error: Cannot reach Replit application at ${this.replitBaseUrl}`);
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  async syncPurchaseOrders() {
    try {
      console.log('📦 Starting Purchase Orders sync...');
      
      // Get all purchase orders from SAP B1
      const sapPurchaseOrders = await sapConnector.getPurchaseOrders({ limit: 1000 });
      
      if (!sapPurchaseOrders.data || sapPurchaseOrders.data.length === 0) {
        console.log('No purchase orders found in SAP B1');
        return { synced: 0, skipped: 0, errors: 0 };
      }

      // Sync to Replit in batches
      const batchSize = 50;
      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < sapPurchaseOrders.data.length; i += batchSize) {
        const batch = sapPurchaseOrders.data.slice(i, i + batchSize);
        
        try {
          const result = await this.makeReplitRequest('/purchase-orders/sync', 'POST', {
            purchaseOrders: batch,
            source: 'sap_b1_middleware',
            timestamp: new Date().toISOString()
          });

          synced += result.synced || 0;
          skipped += result.skipped || 0;
          
          console.log(`Batch ${Math.floor(i/batchSize) + 1}: ${result.synced || 0} synced, ${result.skipped || 0} skipped`);
          
        } catch (error) {
          console.error(`Batch ${Math.floor(i/batchSize) + 1} error:`, error.message);
          errors += batch.length;
        }
      }

      this.lastSyncTimes.purchaseOrders = new Date().toISOString();
      
      console.log(`✅ Purchase Orders sync completed: ${synced} synced, ${skipped} skipped, ${errors} errors`);
      return { synced, skipped, errors };
      
    } catch (error) {
      console.error('Purchase Orders sync failed:', error.message);
      throw error;
    }
  }

  async syncPurchaseOrderItems() {
    try {
      console.log('📋 Starting Purchase Order Items sync...');
      
      // Get recent purchase orders to sync their items
      const recentOrders = await sapConnector.getPurchaseOrders({ limit: 100 });
      
      let synced = 0;
      let errors = 0;

      for (const order of recentOrders.data) {
        try {
          const items = await sapConnector.getPurchaseOrderItems(order.purchaseOrderId);
          
          if (items && items.length > 0) {
            await this.makeReplitRequest('/purchase-order-items/sync', 'POST', {
              purchaseOrderId: order.purchaseOrderId,
              items: items,
              source: 'sap_b1_middleware',
              timestamp: new Date().toISOString()
            });
            
            synced += items.length;
          }
          
        } catch (error) {
          console.error(`Items sync error for PO ${order.purchaseOrderId}:`, error.message);
          errors++;
        }
      }

      this.lastSyncTimes.purchaseOrderItems = new Date().toISOString();
      
      console.log(`✅ Purchase Order Items sync completed: ${synced} items synced, ${errors} errors`);
      return { synced, errors };
      
    } catch (error) {
      console.error('Purchase Order Items sync failed:', error.message);
      throw error;
    }
  }

  async syncVendors() {
    try {
      console.log('🏢 Starting Vendors sync...');
      
      const sapVendors = await sapConnector.getVendors();
      
      if (!sapVendors || sapVendors.length === 0) {
        console.log('No vendors found in SAP B1');
        return { synced: 0, errors: 0 };
      }

      const result = await this.makeReplitRequest('/vendors/sync', 'POST', {
        vendors: sapVendors,
        source: 'sap_b1_middleware',
        timestamp: new Date().toISOString()
      });

      this.lastSyncTimes.vendors = new Date().toISOString();
      
      console.log(`✅ Vendors sync completed: ${result.synced || sapVendors.length} synced`);
      return { synced: result.synced || sapVendors.length, errors: 0 };
      
    } catch (error) {
      console.error('Vendors sync failed:', error.message);
      throw error;
    }
  }

  async syncDashboardStats() {
    try {
      console.log('📊 Starting Dashboard Stats sync...');
      
      const stats = await sapConnector.getDashboardStats();
      
      await this.makeReplitRequest('/dashboard/stats/sync', 'POST', {
        stats: stats,
        source: 'sap_b1_middleware',
        timestamp: new Date().toISOString()
      });

      this.lastSyncTimes.dashboardStats = new Date().toISOString();
      
      console.log('✅ Dashboard Stats sync completed');
      return { synced: 1, errors: 0 };
      
    } catch (error) {
      console.error('Dashboard Stats sync failed:', error.message);
      throw error;
    }
  }

  async syncAllData() {
    console.log('🔄 Starting complete SAP B1 to Replit sync...');
    const startTime = new Date();
    
    const results = {
      purchaseOrders: { synced: 0, skipped: 0, errors: 0 },
      purchaseOrderItems: { synced: 0, errors: 0 },
      vendors: { synced: 0, errors: 0 },
      dashboardStats: { synced: 0, errors: 0 }
    };

    try {
      // Sync in sequence to avoid overwhelming the systems
      results.purchaseOrders = await this.syncPurchaseOrders();
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      
      results.purchaseOrderItems = await this.syncPurchaseOrderItems();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      results.vendors = await this.syncVendors();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      
      results.dashboardStats = await this.syncDashboardStats();
      
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`🎉 Complete sync finished in ${duration}s`);
      console.log('📊 Sync Summary:');
      console.log(`  Purchase Orders: ${results.purchaseOrders.synced} synced, ${results.purchaseOrders.errors} errors`);
      console.log(`  PO Items: ${results.purchaseOrderItems.synced} synced, ${results.purchaseOrderItems.errors} errors`);
      console.log(`  Vendors: ${results.vendors.synced} synced, ${results.vendors.errors} errors`);
      console.log(`  Dashboard Stats: ${results.dashboardStats.synced} synced, ${results.dashboardStats.errors} errors`);
      
      return {
        success: true,
        duration: duration,
        results: results,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Complete sync failed:', error.message);
      return {
        success: false,
        error: error.message,
        results: results,
        timestamp: new Date().toISOString()
      };
    }
  }

  getLastSyncTimes() {
    return this.lastSyncTimes;
  }

  async testReplitConnection() {
    try {
      const response = await this.makeReplitRequest('/health');
      return {
        status: 'connected',
        response: response,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Replit connection test failed: ${error.message}`);
    }
  }
}

module.exports = new ReplitSyncService();
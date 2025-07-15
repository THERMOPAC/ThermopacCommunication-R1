import { sapB1Connector } from './sap-connector';
import { 
  mapSAPCustomerToThermopac, 
  mapSAPItemToThermopac, 
  mapSAPInvoiceToThermopac, 
  mapSAPPaymentToThermopac,
  DataValidator,
  SYNC_CONFIG,
  SAPCustomer,
  SAPItem,
  SAPInvoice,
  SAPPayment
} from './data-mapping';
import { db } from '../db';
import { customers, masterItems, invoices, payments } from '@shared/schema';
import { eq, and, or, desc, asc, isNull, isNotNull, sql } from 'drizzle-orm';

/**
 * SAP B1 Synchronization Service
 * Handles data synchronization between SAP B1 and Thermopac system
 */
export class SAPSyncService {
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime = new Date();

  /**
   * Initialize sync service
   */
  async initialize(): Promise<void> {
    console.log('🔄 Initializing SAP B1 sync service...');
    
    // Test SAP connection
    const isConnected = await sapB1Connector.testConnection();
    if (!isConnected) {
      throw new Error('Cannot connect to SAP B1 database');
    }

    // Create sync log table if not exists
    await this.createSyncLogTable();
    
    console.log('✅ SAP B1 sync service initialized successfully');
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(): void {
    if (this.isRunning) {
      console.log('⚠️ Sync service is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🔄 Starting auto-sync with interval: ${SYNC_CONFIG.syncInterval / 1000}s`);

    this.syncInterval = setInterval(async () => {
      try {
        await this.performFullSync();
      } catch (error) {
        console.error('❌ Auto-sync failed:', error);
      }
    }, SYNC_CONFIG.syncInterval);

    // Initial sync
    this.performFullSync();
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('⏹️ Auto-sync stopped');
  }

  /**
   * Perform full synchronization
   */
  async performFullSync(): Promise<void> {
    console.log('🔄 Starting full synchronization...');
    const startTime = Date.now();

    try {
      // Sync in order of dependency
      await this.syncCustomers();
      await this.syncItems();
      await this.syncInvoices();
      await this.syncPayments();

      this.lastSyncTime = new Date();
      const duration = Date.now() - startTime;
      console.log(`✅ Full sync completed in ${duration}ms`);
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync customers from SAP B1
   */
  async syncCustomers(): Promise<void> {
    console.log('🔄 Syncing customers from SAP B1...');
    let processedCount = 0;
    let errorCount = 0;

    try {
      const sapCustomers = await sapB1Connector.getCustomers();
      console.log(`📊 Found ${sapCustomers.length} customers in SAP B1`);

      for (const sapCustomer of sapCustomers) {
        try {
          // Validate data
          const validationErrors = DataValidator.validateSAPCustomer(sapCustomer);
          if (validationErrors.length > 0) {
            console.warn(`⚠️ Customer validation failed for ${sapCustomer.CardCode}:`, validationErrors);
            await this.logSyncError('customers', 'validation', sapCustomer.CardCode, validationErrors.join(', '));
            errorCount++;
            continue;
          }

          // Check if customer exists
          const existingCustomer = await db
            .select()
            .from(customers)
            .where(eq(customers.sapCustomerCode, sapCustomer.CardCode))
            .limit(1);

          const mappedCustomer = mapSAPCustomerToThermopac(sapCustomer);

          if (existingCustomer.length > 0) {
            // Update existing customer
            await db
              .update(customers)
              .set({
                ...mappedCustomer,
                updatedAt: new Date()
              })
              .where(eq(customers.sapCustomerCode, sapCustomer.CardCode));

            await this.logSyncSuccess('customers', 'update', sapCustomer.CardCode, existingCustomer[0].id);
          } else {
            // Create new customer
            const [newCustomer] = await db
              .insert(customers)
              .values({
                ...mappedCustomer,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              .returning();

            await this.logSyncSuccess('customers', 'create', sapCustomer.CardCode, newCustomer.id);
          }

          processedCount++;
        } catch (error) {
          console.error(`❌ Error syncing customer ${sapCustomer.CardCode}:`, error);
          await this.logSyncError('customers', 'sync', sapCustomer.CardCode, error instanceof Error ? error.message : 'Unknown error');
          errorCount++;
        }
      }

      console.log(`✅ Customer sync completed: ${processedCount} processed, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Customer sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync items from SAP B1
   */
  async syncItems(): Promise<void> {
    console.log('🔄 Syncing items from SAP B1...');
    let processedCount = 0;
    let errorCount = 0;

    try {
      const sapItems = await sapB1Connector.getItems();
      console.log(`📊 Found ${sapItems.length} items in SAP B1`);

      for (const sapItem of sapItems) {
        try {
          // Validate data
          const validationErrors = DataValidator.validateSAPItem(sapItem);
          if (validationErrors.length > 0) {
            console.warn(`⚠️ Item validation failed for ${sapItem.ItemCode}:`, validationErrors);
            await this.logSyncError('items', 'validation', sapItem.ItemCode, validationErrors.join(', '));
            errorCount++;
            continue;
          }

          // Check if item exists
          const existingItem = await db
            .select()
            .from(masterItems)
            .where(eq(masterItems.sapItemCode, sapItem.ItemCode))
            .limit(1);

          const mappedItem = mapSAPItemToThermopac(sapItem);

          if (existingItem.length > 0) {
            // Update existing item
            await db
              .update(masterItems)
              .set({
                ...mappedItem,
                updatedAt: new Date()
              })
              .where(eq(masterItems.sapItemCode, sapItem.ItemCode));

            await this.logSyncSuccess('items', 'update', sapItem.ItemCode, existingItem[0].id);
          } else {
            // Create new item
            const [newItem] = await db
              .insert(masterItems)
              .values({
                ...mappedItem,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              .returning();

            await this.logSyncSuccess('items', 'create', sapItem.ItemCode, newItem.id);
          }

          processedCount++;
        } catch (error) {
          console.error(`❌ Error syncing item ${sapItem.ItemCode}:`, error);
          await this.logSyncError('items', 'sync', sapItem.ItemCode, error instanceof Error ? error.message : 'Unknown error');
          errorCount++;
        }
      }

      console.log(`✅ Item sync completed: ${processedCount} processed, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Item sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync invoices from SAP B1
   */
  async syncInvoices(): Promise<void> {
    console.log('🔄 Syncing invoices from SAP B1...');
    let processedCount = 0;
    let errorCount = 0;

    try {
      // Get invoices from last sync or last 30 days
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      
      const sapInvoices = await sapB1Connector.getInvoices(fromDate);
      console.log(`📊 Found ${sapInvoices.length} invoices in SAP B1`);

      for (const sapInvoice of sapInvoices) {
        try {
          // Validate data
          const validationErrors = DataValidator.validateSAPInvoice(sapInvoice);
          if (validationErrors.length > 0) {
            console.warn(`⚠️ Invoice validation failed for ${sapInvoice.DocNum}:`, validationErrors);
            await this.logSyncError('invoices', 'validation', sapInvoice.DocNum, validationErrors.join(', '));
            errorCount++;
            continue;
          }

          // Find corresponding customer
          const customer = await db
            .select()
            .from(customers)
            .where(eq(customers.sapCustomerCode, sapInvoice.CardCode))
            .limit(1);

          if (customer.length === 0) {
            console.warn(`⚠️ Customer not found for invoice ${sapInvoice.DocNum}: ${sapInvoice.CardCode}`);
            await this.logSyncError('invoices', 'customer_not_found', sapInvoice.DocNum, `Customer ${sapInvoice.CardCode} not found`);
            errorCount++;
            continue;
          }

          // Check if invoice exists
          const existingInvoice = await db
            .select()
            .from(invoices)
            .where(eq(invoices.sapDocEntry, sapInvoice.DocEntry))
            .limit(1);

          const mappedInvoice = mapSAPInvoiceToThermopac(sapInvoice);
          mappedInvoice.customerId = customer[0].id;

          if (existingInvoice.length > 0) {
            // Update existing invoice
            await db
              .update(invoices)
              .set({
                ...mappedInvoice,
                updatedAt: new Date()
              })
              .where(eq(invoices.sapDocEntry, sapInvoice.DocEntry));

            await this.logSyncSuccess('invoices', 'update', sapInvoice.DocNum, existingInvoice[0].id);
          } else {
            // Create new invoice
            const [newInvoice] = await db
              .insert(invoices)
              .values({
                ...mappedInvoice,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              .returning();

            await this.logSyncSuccess('invoices', 'create', sapInvoice.DocNum, newInvoice.id);
          }

          processedCount++;
        } catch (error) {
          console.error(`❌ Error syncing invoice ${sapInvoice.DocNum}:`, error);
          await this.logSyncError('invoices', 'sync', sapInvoice.DocNum, error instanceof Error ? error.message : 'Unknown error');
          errorCount++;
        }
      }

      console.log(`✅ Invoice sync completed: ${processedCount} processed, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Invoice sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync payments from SAP B1
   */
  async syncPayments(): Promise<void> {
    console.log('🔄 Syncing payments from SAP B1...');
    let processedCount = 0;
    let errorCount = 0;

    try {
      // Get payments from last sync or last 30 days
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      
      const sapPayments = await sapB1Connector.getPayments(fromDate);
      console.log(`📊 Found ${sapPayments.length} payments in SAP B1`);

      for (const sapPayment of sapPayments) {
        try {
          // Validate data
          const validationErrors = DataValidator.validateSAPPayment(sapPayment);
          if (validationErrors.length > 0) {
            console.warn(`⚠️ Payment validation failed for ${sapPayment.DocNum}:`, validationErrors);
            await this.logSyncError('payments', 'validation', sapPayment.DocNum, validationErrors.join(', '));
            errorCount++;
            continue;
          }

          // Find corresponding customer
          const customer = await db
            .select()
            .from(customers)
            .where(eq(customers.sapCustomerCode, sapPayment.CardCode))
            .limit(1);

          if (customer.length === 0) {
            console.warn(`⚠️ Customer not found for payment ${sapPayment.DocNum}: ${sapPayment.CardCode}`);
            await this.logSyncError('payments', 'customer_not_found', sapPayment.DocNum, `Customer ${sapPayment.CardCode} not found`);
            errorCount++;
            continue;
          }

          // Check if payment exists
          const existingPayment = await db
            .select()
            .from(payments)
            .where(eq(payments.sapDocEntry, sapPayment.DocEntry))
            .limit(1);

          const mappedPayment = mapSAPPaymentToThermopac(sapPayment);
          mappedPayment.customerId = customer[0].id;

          if (existingPayment.length > 0) {
            // Update existing payment
            await db
              .update(payments)
              .set({
                ...mappedPayment,
                updatedAt: new Date()
              })
              .where(eq(payments.sapDocEntry, sapPayment.DocEntry));

            await this.logSyncSuccess('payments', 'update', sapPayment.DocNum, existingPayment[0].id);
          } else {
            // Create new payment
            const [newPayment] = await db
              .insert(payments)
              .values({
                ...mappedPayment,
                createdAt: new Date(),
                updatedAt: new Date()
              })
              .returning();

            await this.logSyncSuccess('payments', 'create', sapPayment.DocNum, newPayment.id);
          }

          processedCount++;
        } catch (error) {
          console.error(`❌ Error syncing payment ${sapPayment.DocNum}:`, error);
          await this.logSyncError('payments', 'sync', sapPayment.DocNum, error instanceof Error ? error.message : 'Unknown error');
          errorCount++;
        }
      }

      console.log(`✅ Payment sync completed: ${processedCount} processed, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Payment sync failed:', error);
      throw error;
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    isRunning: boolean;
    lastSyncTime: Date;
    stats: {
      customers: number;
      items: number;
      invoices: number;
      payments: number;
    };
    recentErrors: any[];
  }> {
    const stats = await this.getSyncStats();
    const recentErrors = await this.getRecentErrors();

    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      stats,
      recentErrors
    };
  }

  /**
   * Get sync statistics
   */
  private async getSyncStats(): Promise<{
    customers: number;
    items: number;
    invoices: number;
    payments: number;
  }> {
    const [customerCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.source, 'SAP B1'));

    const [itemCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(masterItems)
      .where(eq(masterItems.source, 'SAP B1'));

    const [invoiceCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(eq(invoices.source, 'SAP B1'));

    const [paymentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.source, 'SAP B1'));

    return {
      customers: customerCount.count,
      items: itemCount.count,
      invoices: invoiceCount.count,
      payments: paymentCount.count
    };
  }

  /**
   * Get recent errors
   */
  private async getRecentErrors(): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT 
        table_name,
        operation,
        sap_id,
        error_message,
        created_at
      FROM sap_sync_log 
      WHERE sync_status = 'error'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return result.rows;
  }

  /**
   * Create sync log table
   */
  private async createSyncLogTable(): Promise<void> {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sap_sync_log (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(50) NOT NULL,
        operation VARCHAR(20) NOT NULL,
        sap_id VARCHAR(50),
        thermopac_id INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Log sync success
   */
  private async logSyncSuccess(tableName: string, operation: string, sapId: string, thermopacId: number): Promise<void> {
    await db.execute(sql`
      INSERT INTO sap_sync_log (table_name, operation, sap_id, thermopac_id, sync_status, created_at)
      VALUES (${tableName}, ${operation}, ${sapId}, ${thermopacId}, 'success', NOW())
    `);
  }

  /**
   * Log sync error
   */
  private async logSyncError(tableName: string, operation: string, sapId: string, errorMessage: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO sap_sync_log (table_name, operation, sap_id, sync_status, error_message, created_at)
      VALUES (${tableName}, ${operation}, ${sapId}, 'error', ${errorMessage}, NOW())
    `);
  }
}

// Export singleton instance
export const sapSyncService = new SAPSyncService();
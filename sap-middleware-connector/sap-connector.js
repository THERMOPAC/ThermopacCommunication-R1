const sql = require('mssql');

class SapB1Connector {
  constructor() {
    this.pool = null;
    this.config = {
      server: process.env.SAP_SERVER,
      database: process.env.SAP_DATABASE,
      user: process.env.SAP_USERNAME,
      password: process.env.SAP_PASSWORD,
      port: parseInt(process.env.SAP_PORT) || 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        instanceName: ''
      },
      connectionTimeout: 30000,
      requestTimeout: 30000,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
  }

  async connect() {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    try {
      this.pool = await sql.connect(this.config);
      console.log('✅ Connected to SAP B1 database');
      return this.pool;
    } catch (error) {
      console.error('❌ SAP B1 connection failed:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      const pool = await this.connect();
      const result = await pool.request().query('SELECT @@VERSION as Version');
      
      return {
        status: 'connected',
        version: result.recordset[0]?.Version,
        server: this.config.server,
        database: this.config.database,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`SAP B1 connection test failed: ${error.message}`);
    }
  }

  isConnected() {
    return this.pool && this.pool.connected;
  }

  async closeConnection() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('🔌 SAP B1 connection closed');
    }
  }

  async getPurchaseOrders({ page = 1, limit = 50, project, status } = {}) {
    try {
      const pool = await this.connect();
      const offset = (page - 1) * limit;
      
      let whereClause = 'WHERE 1=1';
      const params = {};
      
      if (project) {
        whereClause += ' AND h.Project = @project';
        params.project = project;
      }
      
      if (status) {
        whereClause += ' AND h.DocStatus = @status';
        params.status = status;
      }

      const query = `
        SELECT 
          h.DocEntry as purchaseOrderId,
          h.DocNum as documentNumber,
          h.DocDate as orderDate,
          h.DocDueDate as dueDate,
          h.CardCode as vendorCode,
          h.CardName as vendorName,
          h.DocTotal as totalAmount,
          h.DocStatus as status,
          h.Project as project,
          h.Comments as comments,
          h.U_GST_TOTAMT as totalGSTAmount,
          h.DocCur as currency
        FROM OPOR h
        ${whereClause}
        ORDER BY h.DocDate DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM OPOR h
        ${whereClause}
      `;

      const request = pool.request();
      
      // Add parameters
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });
      request.input('offset', sql.Int, offset);
      request.input('limit', sql.Int, limit);

      const [dataResult, countResult] = await Promise.all([
        request.query(query),
        pool.request().input('project', params.project).input('status', params.status).query(countQuery)
      ]);

      const total = countResult.recordset[0]?.total || 0;
      
      return {
        data: dataResult.recordset,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Purchase Orders fetch error:', error.message);
      throw error;
    }
  }

  async getPurchaseOrderItems(purchaseOrderId) {
    try {
      const pool = await this.connect();
      
      const query = `
        SELECT 
          i.LineNum as lineNumber,
          i.ItemCode as itemCode,
          i.Dscription as description,
          i.Quantity as quantity,
          i.Price as unitPrice,
          i.LineTotal as lineTotal,
          i.Currency as currency,
          i.U_GST_TYPE as gstType,
          i.U_GST_RATE as gstRate,
          i.U_GST_AMT as gstAmount,
          i.U_CGST_RATE as cgstRate,
          i.U_CGST_AMT as cgstAmount,
          i.U_SGST_RATE as sgstRate,
          i.U_SGST_AMT as sgstAmount,
          i.U_IGST_RATE as igstRate,
          i.U_IGST_AMT as igstAmount,
          i.U_HSN_SAC as hsnSacCode,
          i.WhsCode as warehouseCode,
          i.Project as project
        FROM POR1 i
        WHERE i.DocEntry = @purchaseOrderId
        ORDER BY i.LineNum
      `;

      const request = pool.request();
      request.input('purchaseOrderId', sql.Int, purchaseOrderId);
      
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error('Purchase Order Items fetch error:', error.message);
      throw error;
    }
  }

  async getVendors() {
    try {
      const pool = await this.connect();
      
      const query = `
        SELECT 
          CardCode as vendorCode,
          CardName as vendorName,
          Phone1 as phone,
          Fax as fax,
          E_Mail as email,
          MailAddres as address,
          MailCity as city,
          MailCountr as country,
          MailZipCod as zipCode,
          Currency as currency,
          CreditLine as creditLimit,
          Balance as currentBalance,
          GroupCode as groupCode,
          LicTradNum as licenseNumber,
          VatIdUnCmp as vatNumber,
          validFor as isActive
        FROM OCRD
        WHERE CardType = 'S'
        ORDER BY CardName
      `;

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      console.error('Vendors fetch error:', error.message);
      throw error;
    }
  }

  async getPurchaseRequisitions() {
    try {
      const pool = await this.connect();
      
      const query = `
        SELECT 
          r.DocEntry as requisitionId,
          r.DocNum as documentNumber,
          r.DocDate as requestDate,
          r.DocDueDate as requiredDate,
          r.Requester as requester,
          r.Comments as comments,
          r.DocStatus as status,
          r.Project as project
        FROM OPRQ r
        ORDER BY r.DocDate DESC
      `;

      const result = await pool.request().query(query);
      return result.recordset;
    } catch (error) {
      console.error('Purchase Requisitions fetch error:', error.message);
      throw error;
    }
  }

  async getDashboardStats() {
    try {
      const pool = await this.connect();
      
      const queries = {
        totalPurchaseOrders: `
          SELECT COUNT(*) as count 
          FROM OPOR 
          WHERE YEAR(DocDate) = YEAR(GETDATE())
        `,
        totalVendors: `
          SELECT COUNT(*) as count 
          FROM OCRD 
          WHERE CardType = 'S' AND validFor = 'Y'
        `,
        pendingPurchaseOrders: `
          SELECT COUNT(*) as count 
          FROM OPOR 
          WHERE DocStatus = 'O'
        `,
        monthlyPurchaseValue: `
          SELECT ISNULL(SUM(DocTotal), 0) as total 
          FROM OPOR 
          WHERE YEAR(DocDate) = YEAR(GETDATE()) 
          AND MONTH(DocDate) = MONTH(GETDATE())
        `
      };

      const results = {};
      
      for (const [key, query] of Object.entries(queries)) {
        const result = await pool.request().query(query);
        results[key] = result.recordset[0];
      }

      return {
        totalPurchaseOrders: results.totalPurchaseOrders.count,
        totalVendors: results.totalVendors.count,
        pendingPurchaseOrders: results.pendingPurchaseOrders.count,
        monthlyPurchaseValue: results.monthlyPurchaseValue.total
      };
    } catch (error) {
      console.error('Dashboard stats fetch error:', error.message);
      throw error;
    }
  }
}

module.exports = new SapB1Connector();
import sql from 'mssql';
import { db } from '../db';
import { customers, masterItems, invoices, payments } from '@shared/schema';
import { eq, and, or, desc, asc, isNull, isNotNull } from 'drizzle-orm';

/**
 * SAP Business One Database Connector
 * Handles direct database integration with SAP B1 SQL Server
 */
export class SAPB1Connector {
  private pool: sql.ConnectionPool | null = null;
  private isConnected = false;

  constructor() {
    this.initializeConnection();
  }

  /**
   * Initialize connection to SAP B1 database
   */
  private async initializeConnection(): Promise<void> {
    try {
      const config: sql.config = {
        server: process.env.SAP_SERVER || 'localhost',
        database: process.env.SAP_DATABASE || 'SBODemoUS',
        user: process.env.SAP_USERNAME || 'sa',
        password: process.env.SAP_PASSWORD || '',
        options: {
          encrypt: true,
          trustServerCertificate: true,
          enableArithAbort: true,
          instanceName: process.env.SAP_INSTANCE || 'SQLEXPRESS'
        },
        pool: {
          max: 10,
          min: 0,
          idleTimeoutMillis: 30000
        }
      };

      this.pool = new sql.ConnectionPool(config);
      await this.pool.connect();
      this.isConnected = true;
      console.log('✅ Connected to SAP B1 database successfully');
    } catch (error) {
      console.error('❌ Failed to connect to SAP B1 database:', error);
      this.isConnected = false;
    }
  }

  /**
   * Ensure connection is active
   */
  private async ensureConnection(): Promise<void> {
    if (!this.isConnected || !this.pool) {
      await this.initializeConnection();
    }
  }

  /**
   * Get all customers from SAP B1
   */
  async getCustomers(): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      const result = await request.query(`
        SELECT 
          CardCode,
          CardName,
          CardType,
          Phone1,
          Phone2,
          Fax,
          E_Mail,
          MailAddres,
          MailCity,
          MailCountr,
          MailZipCod,
          ShipToDef,
          BillToDef,
          Currency,
          CreditLine,
          DebtLine,
          Balance,
          ChecksBal,
          DNotesBal,
          OrdersBal,
          GroupCode,
          LicTradNum,
          VATRegNum,
          validFor,
          validFrom,
          validTo,
          CreateDate,
          UpdateDate,
          UserSign,
          UserSign2
        FROM OCRD 
        WHERE CardType = 'C' AND validFor = 'Y'
        ORDER BY CardName
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching customers from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get customer by CardCode
   */
  async getCustomerByCode(cardCode: string): Promise<any> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      request.input('CardCode', sql.VarChar, cardCode);
      
      const result = await request.query(`
        SELECT 
          CardCode,
          CardName,
          CardType,
          Phone1,
          E_Mail,
          MailAddres,
          MailCity,
          Currency,
          Balance,
          CreateDate,
          UpdateDate
        FROM OCRD 
        WHERE CardCode = @CardCode AND CardType = 'C' AND validFor = 'Y'
      `);

      return result.recordset[0] || null;
    } catch (error) {
      console.error('Error fetching customer by code from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get all items from SAP B1
   */
  async getItems(): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      const result = await request.query(`
        SELECT 
          ItemCode,
          ItemName,
          FrgnName,
          ItmsGrpCod,
          CstGrpCode,
          VatGourpSa,
          VatGroupPu,
          SalUnitMsr,
          PurUnitMsr,
          SalPackMsr,
          PurPackMsr,
          SHeight1,
          SHght1Unit,
          SWidth1,
          SWdth1Unit,
          SLength1,
          SLen1Unit,
          SVolume,
          SVolUnit,
          SWeight1,
          SWght1Unit,
          BHeight1,
          BHght1Unit,
          BWidth1,
          BWdth1Unit,
          BLength1,
          BLen1Unit,
          BVolume,
          BVolUnit,
          BWeight1,
          BWght1Unit,
          CreateDate,
          UpdateDate,
          validFor,
          validFrom,
          validTo,
          UserSign
        FROM OITM 
        WHERE validFor = 'Y' AND SellItem = 'Y'
        ORDER BY ItemName
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching items from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get invoices from SAP B1
   */
  async getInvoices(fromDate?: Date, toDate?: Date): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      
      let whereClause = "WHERE INV.CANCELED = 'N'";
      if (fromDate) {
        request.input('FromDate', sql.DateTime, fromDate);
        whereClause += " AND INV.DocDate >= @FromDate";
      }
      if (toDate) {
        request.input('ToDate', sql.DateTime, toDate);
        whereClause += " AND INV.DocDate <= @ToDate";
      }

      const result = await request.query(`
        SELECT 
          INV.DocEntry,
          INV.DocNum,
          INV.DocDate,
          INV.DocDueDate,
          INV.CardCode,
          INV.CardName,
          INV.DocCur,
          INV.DocRate,
          INV.DocTotal,
          INV.DocTotalFC,
          INV.VatSum,
          INV.VatSumFC,
          INV.DiscSum,
          INV.DiscSumFC,
          INV.PaidToDate,
          INV.PaidFC,
          INV.GrosProfit,
          INV.JrnlMemo,
          INV.Comments,
          INV.CreateDate,
          INV.UpdateDate,
          INV.UserSign,
          -- Customer details
          CRD.Phone1,
          CRD.E_Mail,
          CRD.MailAddres,
          CRD.MailCity
        FROM OINV INV
        LEFT JOIN OCRD CRD ON INV.CardCode = CRD.CardCode
        ${whereClause}
        ORDER BY INV.DocDate DESC, INV.DocNum DESC
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching invoices from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get invoice line items
   */
  async getInvoiceItems(docEntry: number): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      request.input('DocEntry', sql.Int, docEntry);
      
      const result = await request.query(`
        SELECT 
          INV1.DocEntry,
          INV1.LineNum,
          INV1.ItemCode,
          INV1.Dscription,
          INV1.Quantity,
          INV1.Price,
          INV1.Currency,
          INV1.Rate,
          INV1.DiscPrcnt,
          INV1.LineTotal,
          INV1.TotalFrgn,
          INV1.OpenQty,
          INV1.VatPrcnt,
          INV1.VatSum,
          INV1.VatSumFrgn,
          INV1.unitMsr,
          INV1.NumPerMsr,
          INV1.WhsCode,
          INV1.SlpCode,
          INV1.Commission,
          INV1.TreeType,
          INV1.AcctCode,
          INV1.TaxCode,
          INV1.TaxType,
          INV1.TaxLiable,
          INV1.PickStatus,
          INV1.PickOty,
          INV1.PickIdNo,
          INV1.OrigItem,
          INV1.BackOrdr,
          INV1.FreeText,
          INV1.ShipDate,
          INV1.ItemDetails,
          INV1.LineStatus,
          INV1.PackQty,
          INV1.Text,
          INV1.LineVendor,
          INV1.GTotal,
          INV1.GTotalFC,
          INV1.DistribSum,
          INV1.DistribSumFC,
          INV1.DiscountPercent,
          INV1.DeductibleTax,
          INV1.DeductibleTaxFC,
          INV1.TotalSumSy,
          INV1.GTotalSy,
          INV1.DistribSumSy,
          INV1.DeductibleTaxSy,
          -- Item details
          ITM.ItemName,
          ITM.FrgnName,
          ITM.ItmsGrpCod,
          ITM.CstGrpCode
        FROM INV1 
        LEFT JOIN OITM ITM ON INV1.ItemCode = ITM.ItemCode
        WHERE INV1.DocEntry = @DocEntry
        ORDER BY INV1.LineNum
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching invoice items from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get payments from SAP B1
   */
  async getPayments(fromDate?: Date, toDate?: Date): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      
      let whereClause = "WHERE RCT.Canceled = 'N'";
      if (fromDate) {
        request.input('FromDate', sql.DateTime, fromDate);
        whereClause += " AND RCT.DocDate >= @FromDate";
      }
      if (toDate) {
        request.input('ToDate', sql.DateTime, toDate);
        whereClause += " AND RCT.DocDate <= @ToDate";
      }

      const result = await request.query(`
        SELECT 
          RCT.DocEntry,
          RCT.DocNum,
          RCT.DocDate,
          RCT.DocDueDate,
          RCT.CardCode,
          RCT.CardName,
          RCT.DocCur,
          RCT.DocRate,
          RCT.DocTotal,
          RCT.DocTotalFC,
          RCT.CashSum,
          RCT.CheckSum,
          RCT.TrsfrSum,
          RCT.TrsfrSumFC,
          RCT.CashSumFC,
          RCT.CheckSumFC,
          RCT.DocType,
          RCT.HandWritten,
          RCT.Printed,
          RCT.JrnlMemo,
          RCT.Comments,
          RCT.CreateDate,
          RCT.UpdateDate,
          RCT.UserSign,
          -- Customer details
          CRD.Phone1,
          CRD.E_Mail
        FROM ORCT RCT
        LEFT JOIN OCRD CRD ON RCT.CardCode = CRD.CardCode
        ${whereClause}
        ORDER BY RCT.DocDate DESC, RCT.DocNum DESC
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching payments from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get payment allocations
   */
  async getPaymentAllocations(docEntry: number): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      request.input('DocEntry', sql.Int, docEntry);
      
      const result = await request.query(`
        SELECT 
          RCT2.DocNum,
          RCT2.DocEntry,
          RCT2.InvType,
          RCT2.DocEntry as PaymentDocEntry,
          RCT2.InstlmntID,
          RCT2.SumApplied,
          RCT2.AppliedFC,
          RCT2.AppliedSys,
          RCT2.DocRate,
          RCT2.DocLine,
          RCT2.InvEntry,
          RCT2.LineNum,
          RCT2.ObjType,
          RCT2.CardCode,
          RCT2.CardName,
          RCT2.DocDate,
          RCT2.DocDueDate,
          RCT2.CashDiscFC,
          RCT2.CashDiscSC,
          RCT2.CashDisc,
          RCT2.WtAmnt,
          RCT2.WtAmntFC,
          RCT2.WtAmntSC,
          RCT2.BalDueDeb,
          RCT2.BalDueCredt,
          RCT2.BalDueFc,
          RCT2.BalDueSys,
          RCT2.TotalDisc,
          RCT2.TotalDiscFC,
          RCT2.TotalDiscSC
        FROM RCT2 
        WHERE RCT2.DocEntry = @DocEntry
        ORDER BY RCT2.LineNum
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching payment allocations from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Close connection
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.isConnected = false;
      console.log('✅ Disconnected from SAP B1 database');
    }
  }

  /**
   * Get Purchase Orders from SAP B1
   */
  async getPurchaseOrders(filters: {
    vendorCode?: string;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
    projectCode?: string;
    financialYear?: string; // Format: "FY2024-25" for Indian Financial Year
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      
      let whereClause = "WHERE PO.CANCELED = 'N'";
      
      if (filters.vendorCode) {
        request.input('VendorCode', sql.VarChar, filters.vendorCode);
        whereClause += " AND PO.CardCode = @VendorCode";
      }
      
      if (filters.status) {
        request.input('Status', sql.VarChar, filters.status);
        whereClause += " AND PO.DocStatus = @Status";
      }
      
      if (filters.fromDate) {
        request.input('FromDate', sql.DateTime, filters.fromDate);
        whereClause += " AND PO.DocDate >= @FromDate";
      }
      
      if (filters.toDate) {
        request.input('ToDate', sql.DateTime, filters.toDate);
        whereClause += " AND PO.DocDate <= @ToDate";
      }

      if (filters.projectCode) {
        request.input('ProjectCode', sql.VarChar, filters.projectCode);
        whereClause += " AND PO.Project = @ProjectCode";
      }

      // Indian Financial Year filtering (April to March)
      if (filters.financialYear) {
        const fyMatch = filters.financialYear.match(/^FY(\d{4})-(\d{2})$/);
        if (fyMatch) {
          const startYear = parseInt(fyMatch[1]);
          const endYear = parseInt(`20${fyMatch[2]}`);
          const fyStartDate = new Date(startYear, 3, 1); // April 1st of start year
          const fyEndDate = new Date(endYear, 2, 31); // March 31st of end year
          
          request.input('FYStartDate', sql.DateTime, fyStartDate);
          request.input('FYEndDate', sql.DateTime, fyEndDate);
          whereClause += " AND PO.DocDate >= @FYStartDate AND PO.DocDate <= @FYEndDate";
        }
      }

      const result = await request.query(`
        SELECT TOP ${filters.limit || 50}
          PO.DocEntry,
          PO.DocNum,
          PO.DocDate,
          PO.DocDueDate,
          PO.CardCode,
          PO.CardName,
          PO.DocCur,
          PO.DocRate,
          PO.DocTotal,
          PO.DocTotalFC,
          PO.VatSum,
          PO.VatSumFC,
          PO.DiscSum,
          PO.DiscSumFC,
          PO.DocStatus,
          PO.Comments,
          PO.JrnlMemo,
          PO.CreateDate,
          PO.UpdateDate,
          PO.UserSign,
          PO.Project as ProjectCode,
          PO.Confirmed,
          PO.Printed,
          PO.TotalExpns,
          PO.OwnerCode,
          PO.Rounding,
          -- Financial Year calculation for Indian FY (April to March)
          CASE 
            WHEN MONTH(PO.DocDate) >= 4 THEN 'FY' + CAST(YEAR(PO.DocDate) AS VARCHAR) + '-' + RIGHT('0' + CAST(YEAR(PO.DocDate) + 1 - 2000 AS VARCHAR), 2)
            ELSE 'FY' + CAST(YEAR(PO.DocDate) - 1 AS VARCHAR) + '-' + RIGHT('0' + CAST(YEAR(PO.DocDate) - 2000 AS VARCHAR), 2)
          END as FinancialYear,
          -- Vendor details
          VEN.Phone1 as VendorPhone,
          VEN.Fax as VendorFax,
          VEN.E_Mail as VendorEmail,
          VEN.MailAddres as VendorAddress,
          VEN.MailCity as VendorCity,
          VEN.MailCountr as VendorCountry,
          VEN.MailZipCod as VendorZipCode,
          VEN.GroupCode as VendorGroupCode,
          VEN.Currency as VendorCurrency,
          VEN.CreditLine as VendorCreditLine,
          VEN.Balance as VendorBalance,
          VEN.SlpCode as VendorSalesPersonCode,
          -- Project details
          PRJ.PrjName as ProjectName,
          PRJ.Active as ProjectActive,
          PRJ.ValidFrom as ProjectValidFrom,
          PRJ.ValidTo as ProjectValidTo,
          PRJ.PrjType as ProjectType,
          PRJ.Industry as ProjectIndustry,
          PRJ.Reason as ProjectReason,
          PRJ.StartDate as ProjectStartDate,
          PRJ.FinishedPrc as ProjectFinishedPercent,
          PRJ.DocNum as ProjectDocNum,
          -- Item/Service Classification
          (SELECT COUNT(*) FROM POR1 POI 
           INNER JOIN OITM ITM ON POI.ItemCode = ITM.ItemCode 
           WHERE POI.DocEntry = PO.DocEntry AND ITM.InvntItem = 'Y'
          ) as ItemCount,
          (SELECT COUNT(*) FROM POR1 POI 
           INNER JOIN OITM ITM ON POI.ItemCode = ITM.ItemCode 
           WHERE POI.DocEntry = PO.DocEntry AND ITM.InvntItem = 'N'
          ) as ServiceCount,
          (SELECT COUNT(*) FROM POR1 WHERE DocEntry = PO.DocEntry) as TotalLines,
          -- CapEx/OpEx Classification based on Account Codes and Item Groups
          (SELECT COUNT(*) FROM POR1 POI 
           WHERE POI.DocEntry = PO.DocEntry 
           AND (POI.AcctCode LIKE '1%' OR POI.AcctCode LIKE '2%' OR POI.AcctCode LIKE '16%' OR POI.AcctCode LIKE '17%')
          ) as CapExLineCount,
          (SELECT COUNT(*) FROM POR1 POI 
           WHERE POI.DocEntry = PO.DocEntry 
           AND (POI.AcctCode LIKE '4%' OR POI.AcctCode LIKE '5%' OR POI.AcctCode LIKE '6%' OR POI.AcctCode LIKE '7%')
          ) as OpExLineCount,
          (SELECT SUM(POI.LineTotal) FROM POR1 POI 
           WHERE POI.DocEntry = PO.DocEntry 
           AND (POI.AcctCode LIKE '1%' OR POI.AcctCode LIKE '2%' OR POI.AcctCode LIKE '16%' OR POI.AcctCode LIKE '17%')
          ) as CapExAmount,
          (SELECT SUM(POI.LineTotal) FROM POR1 POI 
           WHERE POI.DocEntry = PO.DocEntry 
           AND (POI.AcctCode LIKE '4%' OR POI.AcctCode LIKE '5%' OR POI.AcctCode LIKE '6%' OR POI.AcctCode LIKE '7%')
          ) as OpExAmount
        FROM OPOR PO
        LEFT JOIN OCRD VEN ON PO.CardCode = VEN.CardCode
        LEFT JOIN OPRJ PRJ ON PO.Project = PRJ.PrjCode
        ${whereClause}
        ORDER BY PO.DocDate DESC, PO.DocNum DESC
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching purchase orders from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get Purchase Order Items
   */
  async getPurchaseOrderItems(docEntry: number): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      request.input('DocEntry', sql.Int, docEntry);
      
      const result = await request.query(`
        SELECT 
          PO1.DocEntry,
          PO1.LineNum,
          PO1.ItemCode,
          PO1.Dscription as ItemDescription,
          PO1.Quantity,
          PO1.OpenQty,
          PO1.DelivrdQty as DeliveredQty,
          PO1.OrderedQty,
          PO1.Price,
          PO1.Currency,
          PO1.Rate as ExchangeRate,
          PO1.DiscPrcnt as DiscountPercent,
          PO1.LineTotal,
          PO1.TotalFrgn as LineTotalFC,
          PO1.VatPrcnt as VATPercent,
          PO1.VatSum,
          PO1.VatSumFrgn as VATSumFC,
          PO1.unitMsr as UnitOfMeasure,
          PO1.NumPerMsr as UnitsPerMeasure,
          PO1.WhsCode as WarehouseCode,
          PO1.ShipDate,
          PO1.LineStatus,
          PO1.Text as LineText,
          PO1.AcctCode as AccountCode,
          PO1.TaxCode,
          PO1.SlpCode as SalesPersonCode,
          PO1.Commission,
          PO1.TreeType,
          PO1.CogsOcrCod as CostCenterCode,
          PO1.Project as LineProjectCode,
          PO1.PickIdNo as PickListID,
          PO1.BaseCard as BaseCardCode,
          PO1.BaseType as BaseDocumentType,
          PO1.BaseEntry as BaseDocumentEntry,
          PO1.BaseLine as BaseDocumentLine,
          -- Item master data details
          ITM.ItemName,
          ITM.FrgnName as ItemForeignName,
          ITM.ItmsGrpCod as ItemGroupCode,
          ITM.ItemType,
          ITM.CodeBars as Barcode,
          ITM.VATGourpSa as VATGroupSales,
          ITM.VatGroupPu as VATGroupPurchase,
          ITM.InvntItem as InventoryItem,
          ITM.SellItem as SalesItem,
          ITM.PrchseItem as PurchaseItem,
          ITM.validFor as ItemValid,
          ITM.validFrom as ItemValidFrom,
          ITM.validTo as ItemValidTo,
          ITM.CardCode as PreferredVendor,
          ITM.SalUnitMsr as SalesUOM,
          ITM.PurUnitMsr as PurchaseUOM,
          ITM.UserText as ItemUserText,
          ITM.CreateDate as ItemCreateDate,
          ITM.UpdateDate as ItemUpdateDate,
          ITM.UserSign as ItemUserSign,
          -- Item group details
          OITG.ItmsGrpNam as ItemGroupName,
          -- Warehouse details
          OWHS.WhsName as WarehouseName,
          OWHS.Street as WarehouseStreet,
          OWHS.City as WarehouseCity,
          OWHS.Country as WarehouseCountry
        FROM POR1 PO1
        LEFT JOIN OITM ITM ON PO1.ItemCode = ITM.ItemCode
        LEFT JOIN OITG ON ITM.ItmsGrpCod = OITG.ItmsGrpCod
        LEFT JOIN OWHS ON PO1.WhsCode = OWHS.WhsCode
        WHERE PO1.DocEntry = @DocEntry
        ORDER BY PO1.LineNum
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching purchase order items from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get Vendors from SAP B1
   */
  async getVendors(): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      const result = await request.query(`
        SELECT 
          CardCode,
          CardName,
          CardType,
          Phone1,
          Phone2,
          Fax,
          E_Mail,
          MailAddres,
          MailCity,
          MailCountr,
          MailZipCod,
          Currency,
          CreditLine,
          Balance,
          GroupCode,
          LicTradNum,
          VATRegNum,
          validFor,
          CreateDate,
          UpdateDate,
          UserSign
        FROM OCRD 
        WHERE CardType = 'S' AND validFor = 'Y'
        ORDER BY CardName
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching vendors from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Get Purchase Requisitions from SAP B1
   */
  async getPurchaseRequisitions(filters: {
    status?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.pool) {
      throw new Error('SAP B1 connection not available');
    }

    try {
      const request = this.pool.request();
      
      let whereClause = "WHERE PR.CANCELED = 'N'";
      
      if (filters.status) {
        request.input('Status', sql.VarChar, filters.status);
        whereClause += " AND PR.DocStatus = @Status";
      }
      
      if (filters.fromDate) {
        request.input('FromDate', sql.DateTime, filters.fromDate);
        whereClause += " AND PR.DocDate >= @FromDate";
      }
      
      if (filters.toDate) {
        request.input('ToDate', sql.DateTime, filters.toDate);
        whereClause += " AND PR.DocDate <= @ToDate";
      }

      const result = await request.query(`
        SELECT TOP ${filters.limit || 50}
          PR.DocEntry,
          PR.DocNum,
          PR.DocDate,
          PR.DocDueDate,
          PR.Comments,
          PR.JrnlMemo,
          PR.DocTotal,
          PR.DocStatus,
          PR.CreateDate,
          PR.UpdateDate,
          PR.UserSign,
          USR.USER_CODE as CreatedBy
        FROM OPRQ PR
        LEFT JOIN OUSR USR ON PR.UserSign = USR.USERID
        ${whereClause}
        ORDER BY PR.DocDate DESC, PR.DocNum DESC
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error fetching purchase requisitions from SAP B1:', error);
      throw error;
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureConnection();
      
      if (!this.pool) {
        return false;
      }

      const request = this.pool.request();
      const result = await request.query('SELECT @@VERSION as Version');
      
      console.log('SAP B1 Database Version:', result.recordset[0]?.Version);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
/**
 * Utility function to get current Indian Financial Year
 * Returns format: "FY2024-25"
 */
export function getCurrentIndianFY(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
  
  if (currentMonth >= 4) {
    // April onwards - current FY
    return `FY${currentYear}-${String(currentYear + 1).slice(-2)}`;
  } else {
    // January to March - previous FY
    return `FY${currentYear - 1}-${String(currentYear).slice(-2)}`;
  }
}

/**
 * Utility function to get Financial Year from a date
 * Returns format: "FY2024-25"
 */
export function getIndianFYFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  if (month >= 4) {
    return `FY${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `FY${year - 1}-${String(year).slice(-2)}`;
  }
}

/**
 * Utility function to get Financial Year date range
 * Returns { startDate, endDate } for given FY
 */
export function getIndianFYDateRange(financialYear: string): { startDate: Date; endDate: Date } | null {
  const fyMatch = financialYear.match(/^FY(\d{4})-(\d{2})$/);
  if (!fyMatch) return null;
  
  const startYear = parseInt(fyMatch[1]);
  const endYear = parseInt(`20${fyMatch[2]}`);
  
  return {
    startDate: new Date(startYear, 3, 1), // April 1st
    endDate: new Date(endYear, 2, 31)     // March 31st
  };
}

export const sapB1Connector = new SAPB1Connector();
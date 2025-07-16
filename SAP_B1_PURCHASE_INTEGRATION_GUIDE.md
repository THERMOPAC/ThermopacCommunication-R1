# SAP B1 Purchase Module Integration Guide

## Overview
This guide explains how to integrate your SAP B1 Purchase Module with your actual SAP Business One SQL database. The system is designed to connect directly to SAP B1's SQL Server database to read and write purchase-related data.

## Current Integration Architecture

### 1. Database Connection Layer
Your system uses the `SAPB1Connector` class located in `server/sap-b1-integration/sap-connector.ts` which:
- Connects directly to SAP B1 SQL Server database
- Uses Microsoft SQL Server (`mssql`) package for database communication
- Provides connection pooling and automatic reconnection
- Handles authentication and connection management

### 2. Purchase Module Structure
The Purchase module consists of:
- **Frontend**: `client/src/pages/PurchaseModule.tsx` - User interface with tabs for different purchase functions
- **Backend Routes**: `server/sap-b1-integration/purchase-routes.ts` - API endpoints for purchase operations
- **Database Schema**: Local PostgreSQL tables that mirror SAP B1 purchase data
- **SAP Connector**: Direct connection to SAP B1 SQL database

## Required Environment Variables

Add these to your `.env` file:

```env
# SAP B1 Database Connection
SAP_SERVER=your-sap-server-ip-or-name
SAP_DATABASE=your-sap-database-name
SAP_USERNAME=your-sap-username
SAP_PASSWORD=your-sap-password

# Note: Using default SQL Server instance (MSSQLSERVER)
# No SAP_INSTANCE needed for default instances
```

## SAP B1 Database Tables Used

### Purchase Orders
- **OPOR** - Purchase Order Header
- **POR1** - Purchase Order Lines
- **OPOR** fields: DocEntry, DocNum, DocDate, CardCode, CardName, DocStatus, DocTotal, etc.

### Purchase Requisitions
- **OPRQ** - Purchase Requisition Header
- **PRQ1** - Purchase Requisition Lines

### Goods Receipt PO
- **OPDN** - Goods Receipt PO Header
- **PDN1** - Goods Receipt PO Lines

### Purchase Invoices
- **OPCH** - Purchase Invoice Header
- **PCH1** - Purchase Invoice Lines

### Vendors
- **OCRD** - Business Partners (where CardType = 'S' for Suppliers)

## Integration Steps

### Step 1: Extend SAP Connector for Purchase Data

Add these methods to `server/sap-b1-integration/sap-connector.ts`:

```typescript
/**
 * Get Purchase Orders from SAP B1
 */
async getPurchaseOrders(filters: {
  vendorCode?: string;
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

    const result = await request.query(`
      SELECT 
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
        -- Vendor details
        VEN.Phone1,
        VEN.E_Mail,
        VEN.MailAddres,
        VEN.MailCity
      FROM OPOR PO
      LEFT JOIN OCRD VEN ON PO.CardCode = VEN.CardCode
      ${whereClause}
      ORDER BY PO.DocDate DESC, PO.DocNum DESC
      OFFSET ${filters.offset || 0} ROWS
      FETCH NEXT ${filters.limit || 50} ROWS ONLY
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
        PO1.Dscription,
        PO1.Quantity,
        PO1.OpenQty,
        PO1.Price,
        PO1.Currency,
        PO1.Rate,
        PO1.DiscPrcnt,
        PO1.LineTotal,
        PO1.TotalFrgn,
        PO1.VatPrcnt,
        PO1.VatSum,
        PO1.VatSumFrgn,
        PO1.unitMsr,
        PO1.NumPerMsr,
        PO1.WhsCode,
        PO1.ShipDate,
        PO1.LineStatus,
        PO1.Text,
        -- Item details
        ITM.ItemName,
        ITM.FrgnName,
        ITM.ItmsGrpCod
      FROM POR1 PO1
      LEFT JOIN OITM ITM ON PO1.ItemCode = ITM.ItemCode
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
```

### Step 2: Update Purchase Routes for SAP Integration

Modify `server/sap-b1-integration/purchase-routes.ts` to use SAP data:

```typescript
import { sapB1Connector } from './sap-connector';

// Replace the existing purchase-orders endpoint with SAP integration
router.get('/purchase-orders', async (req, res) => {
  try {
    const filters = {
      vendorCode: req.query.vendorCode as string,
      status: req.query.status as string,
      fromDate: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      toDate: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0
    };

    const purchaseOrders = await sapB1Connector.getPurchaseOrders(filters);

    res.json({
      success: true,
      data: purchaseOrders,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        hasMore: purchaseOrders.length === filters.limit
      }
    });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch purchase orders from SAP B1',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add vendor endpoint
router.get('/vendors', async (req, res) => {
  try {
    const vendors = await sapB1Connector.getVendors();
    
    res.json({
      success: true,
      data: vendors,
      count: vendors.length
    });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch vendors from SAP B1',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

### Step 3: Synchronization Strategy

You have two options for data synchronization:

#### Option A: Real-time SAP Integration (Recommended)
- Direct queries to SAP B1 database
- Real-time data without synchronization delays
- Requires stable connection to SAP B1 server

#### Option B: Periodic Sync with Local Cache
- Scheduled synchronization jobs
- Local PostgreSQL cache for performance
- Offline capability during sync intervals

### Step 4: Network Configuration

Ensure your application server can connect to SAP B1:

1. **Firewall Rules**: Open port 1433 (default SQL Server port)
2. **Network Access**: Ensure your application server can reach SAP B1 server
3. **VPN/Security**: Configure secure connection if SAP B1 is on internal network
4. **SQL Server Configuration**: Enable TCP/IP protocol and mixed mode authentication

### Step 5: Testing the Integration

1. **Test Connection**:
   ```bash
   curl -X GET "http://localhost:5000/api/sap/test-connection" -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **Test Purchase Orders**:
   ```bash
   curl -X GET "http://localhost:5000/api/sap/purchase/purchase-orders" -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Test Vendors**:
   ```bash
   curl -X GET "http://localhost:5000/api/sap/purchase/vendors" -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Data Mapping

### SAP B1 to Application Mapping

| SAP B1 Field | Application Field | Description |
|-------------|-------------------|-------------|
| DocEntry | docEntry | Document Entry Number |
| DocNum | documentNumber | Document Number |
| DocDate | docDate | Document Date |
| CardCode | vendorCode | Vendor Code |
| CardName | vendorName | Vendor Name |
| DocTotal | totalAmount | Total Amount |
| DocStatus | docStatus | Document Status |
| Currency | currency | Currency Code |
| Comments | comments | Comments |

## Error Handling

The system includes comprehensive error handling:

1. **Connection Errors**: Automatic reconnection attempts
2. **Query Errors**: Detailed error logging and user feedback
3. **Data Validation**: Input validation before SAP queries
4. **Timeout Handling**: Connection and query timeouts

## Performance Optimization

1. **Connection Pooling**: Reuse database connections
2. **Query Optimization**: Use indexed fields in WHERE clauses
3. **Pagination**: Limit result sets for large datasets
4. **Caching**: Cache frequently accessed data

## Security Considerations

1. **Authentication**: Secure SAP B1 database credentials
2. **Authorization**: Role-based access control
3. **SQL Injection**: Parameterized queries only
4. **Encryption**: Use SSL/TLS for database connections

## Monitoring and Logging

The system provides:
- Connection status monitoring
- Query performance logging
- Error tracking and alerts
- Data synchronization logs

## Troubleshooting

### Common Issues:

1. **Connection Refused**: Check firewall and SQL Server configuration
2. **Authentication Failed**: Verify SAP credentials and permissions
3. **Query Timeout**: Optimize queries or increase timeout values
4. **Data Mismatch**: Verify SAP B1 table structure matches expectations

### Debug Steps:

1. Test basic SQL Server connection
2. Verify SAP B1 table access permissions
3. Check network connectivity
4. Review application logs for detailed error messages

## Next Steps

1. Configure environment variables for your SAP B1 server
2. Test the connection using the test endpoint
3. Implement gradual rollout starting with read-only operations
4. Add error monitoring and alerting
5. Plan for data backup and recovery procedures

## Support

For technical issues:
1. Check application logs in the console
2. Verify SAP B1 connectivity
3. Review database permissions
4. Test with SAP B1 administrator if needed

This integration provides a robust foundation for connecting your Purchase Module with SAP Business One while maintaining data integrity and performance.
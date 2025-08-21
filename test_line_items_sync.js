import { Pool } from 'pg';

// Test line items sync for one purchase order
async function testLineItemsSync() {
  try {
    console.log('Testing line items sync...');
    
    // Get database connection
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    // Get one purchase order to test
    const result = await pool.query(
      'SELECT doc_entry, doc_num FROM sap_purchase_orders LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('No purchase orders found in database');
      return;
    }
    
    const testOrder = result.rows[0];
    console.log(`Testing with PO ${testOrder.doc_entry} (${testOrder.doc_num})`);
    
    // Create SAP HTTPS client
    const https = await import('https');
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';
    
    // Login to SAP
    console.log('Logging into SAP...');
    const loginResponse = await fetch(`${sapServiceUrl}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CompanyDB: process.env.SAP_COMPANY_DB,
        UserName: process.env.SAP_USERNAME,
        Password: process.env.SAP_PASSWORD
      }),
      agent
    });
    
    if (!loginResponse.ok) {
      console.error('SAP login failed:', loginResponse.status);
      return;
    }
    
    const loginData = await loginResponse.json();
    const sessionCookie = loginResponse.headers.get('set-cookie');
    
    console.log('SAP login successful, fetching line items...');
    
    // Fetch line items for the test order
    const lineItemsResponse = await fetch(`${sapServiceUrl}/PurchaseOrders(${testOrder.doc_entry})/DocumentLines`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      agent
    });
    
    console.log(`Line items response status: ${lineItemsResponse.status}`);
    
    if (lineItemsResponse.ok) {
      const lineItemsData = await lineItemsResponse.json();
      const lineItems = lineItemsData.value || [];
      
      console.log(`Found ${lineItems.length} line items for PO ${testOrder.doc_entry}`);
      
      if (lineItems.length > 0) {
        console.log('Sample line item:', JSON.stringify(lineItems[0], null, 2));
        
        // Try to insert one line item
        const item = lineItems[0];
        const insertResult = await pool.query(
          `INSERT INTO sap_purchase_order_items (
            doc_entry, line_num, item_code, item_description, quantity, 
            unit_price, line_total, sap_synced_at, sap_sync_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8) 
          ON CONFLICT (doc_entry, line_num) DO NOTHING RETURNING *`,
          [
            testOrder.doc_entry, 
            item.LineNum || 0, 
            item.ItemCode || 'TEST', 
            item.ItemDescription || item.Description || 'Test Item', 
            item.Quantity || 0,
            item.UnitPrice || 0,
            item.LineTotal || 0,
            'synced'
          ]
        );
        
        console.log('Insert result:', insertResult.rows.length > 0 ? 'SUCCESS' : 'DUPLICATE');
      }
    } else {
      const errorText = await lineItemsResponse.text();
      console.error('Failed to fetch line items:', errorText);
    }
    
    await pool.end();
    console.log('Test completed');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testLineItemsSync();
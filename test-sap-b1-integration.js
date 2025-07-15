/**
 * SAP B1 Integration Test Suite
 * Tests the complete SAP B1 integration implementation
 */

import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
const API_PREFIX = '/api/sap';

// Load session cookie for authentication
let sessionCookie = '';
try {
  sessionCookie = fs.readFileSync('.session-cookie', 'utf8').trim();
} catch (error) {
  console.error('Error reading session cookie:', error.message);
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Cookie': sessionCookie
};

async function testSAPB1Integration() {
  console.log('🚀 Starting SAP B1 Integration Test Suite');
  console.log('=' .repeat(50));

  try {
    // Test 1: Connection Test
    console.log('\n📡 Testing SAP B1 Connection...');
    const connectionResponse = await fetch(`${BASE_URL}${API_PREFIX}/test-connection`, {
      method: 'GET',
      headers
    });

    if (connectionResponse.ok) {
      const connectionData = await connectionResponse.json();
      console.log('✅ Connection test response:', connectionData);
    } else {
      console.log('❌ Connection test failed:', connectionResponse.status, connectionResponse.statusText);
    }

    // Test 2: Get All Customers
    console.log('\n👥 Testing SAP B1 Customers Fetch...');
    const customersResponse = await fetch(`${BASE_URL}${API_PREFIX}/customers`, {
      method: 'GET',
      headers
    });

    if (customersResponse.ok) {
      const customersData = await customersResponse.json();
      console.log('✅ Customers fetch response:', {
        success: customersData.success,
        count: customersData.count,
        hasData: customersData.data ? customersData.data.length : 0
      });
    } else {
      console.log('❌ Customers fetch failed:', customersResponse.status, customersResponse.statusText);
    }

    // Test 3: Get SAP B1 Items
    console.log('\n📦 Testing SAP B1 Items Fetch...');
    const itemsResponse = await fetch(`${BASE_URL}${API_PREFIX}/items`, {
      method: 'GET',
      headers
    });

    if (itemsResponse.ok) {
      const itemsData = await itemsResponse.json();
      console.log('✅ Items fetch response:', {
        success: itemsData.success,
        count: itemsData.count,
        hasData: itemsData.data ? itemsData.data.length : 0
      });
    } else {
      console.log('❌ Items fetch failed:', itemsResponse.status, itemsResponse.statusText);
    }

    // Test 4: Get SAP B1 Invoices
    console.log('\n📄 Testing SAP B1 Invoices Fetch...');
    const invoicesResponse = await fetch(`${BASE_URL}${API_PREFIX}/invoices`, {
      method: 'GET',
      headers
    });

    if (invoicesResponse.ok) {
      const invoicesData = await invoicesResponse.json();
      console.log('✅ Invoices fetch response:', {
        success: invoicesData.success,
        count: invoicesData.count,
        hasData: invoicesData.data ? invoicesData.data.length : 0
      });
    } else {
      console.log('❌ Invoices fetch failed:', invoicesResponse.status, invoicesResponse.statusText);
    }

    // Test 5: Get SAP B1 Payments
    console.log('\n💰 Testing SAP B1 Payments Fetch...');
    const paymentsResponse = await fetch(`${BASE_URL}${API_PREFIX}/payments`, {
      method: 'GET',
      headers
    });

    if (paymentsResponse.ok) {
      const paymentsData = await paymentsResponse.json();
      console.log('✅ Payments fetch response:', {
        success: paymentsData.success,
        count: paymentsData.count,
        hasData: paymentsData.data ? paymentsData.data.length : 0
      });
    } else {
      console.log('❌ Payments fetch failed:', paymentsResponse.status, paymentsResponse.statusText);
    }

    // Test 6: Get Sync Status
    console.log('\n🔄 Testing SAP B1 Sync Status...');
    const syncStatusResponse = await fetch(`${BASE_URL}${API_PREFIX}/sync/status`, {
      method: 'GET',
      headers
    });

    if (syncStatusResponse.ok) {
      const syncStatusData = await syncStatusResponse.json();
      console.log('✅ Sync status response:', {
        success: syncStatusData.success,
        isRunning: syncStatusData.data?.isRunning,
        lastSyncTime: syncStatusData.data?.lastSyncTime
      });
    } else {
      console.log('❌ Sync status failed:', syncStatusResponse.status, syncStatusResponse.statusText);
    }

    // Test 7: Check Database Schema
    console.log('\n🗄️ Testing Database Schema...');
    const schemaResponse = await fetch(`${BASE_URL}/api/customers`, {
      method: 'GET',
      headers
    });

    if (schemaResponse.ok) {
      const schemaData = await schemaResponse.json();
      console.log('✅ Database schema test:', {
        customersCount: schemaData.length,
        hasData: schemaData.length > 0
      });
      
      // Check if any customer has SAP fields
      const customerWithSAPFields = schemaData.find(customer => 
        customer.sapCardCode || customer.sapSyncStatus
      );
      
      if (customerWithSAPFields) {
        console.log('✅ SAP B1 fields found in customer:', customerWithSAPFields.bpCode);
      } else {
        console.log('ℹ️  No SAP B1 fields populated yet (expected for new integration)');
      }
    } else {
      console.log('❌ Database schema test failed:', schemaResponse.status, schemaResponse.statusText);
    }

    console.log('\n' + '=' .repeat(50));
    console.log('🎉 SAP B1 Integration Test Suite Completed');
    console.log('=' .repeat(50));

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run the test suite
testSAPB1Integration();
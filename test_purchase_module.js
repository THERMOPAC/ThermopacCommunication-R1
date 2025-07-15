import axios from 'axios';

// Test script for Purchase Module API endpoints
async function testPurchaseModule() {
  console.log('🧪 Testing SAP B1 Purchase Module API Endpoints');
  console.log('=' .repeat(50));

  // Login first to get session
  try {
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      username: 'Prasad',
      password: 'Prasad@123#'
    });
    
    const sessionCookie = loginResponse.headers['set-cookie'][0];
    console.log('✅ Login successful');
    
    // Test all Purchase module endpoints
    const endpoints = [
      { url: '/api/sap/purchase/dashboard-stats', method: 'GET' },
      { url: '/api/sap/purchase/purchase-orders', method: 'GET' },
      { url: '/api/sap/purchase/purchase-orders/1001', method: 'GET' },
      { url: '/api/sap/purchase/purchase-orders/1001/items', method: 'GET' },
      { url: '/api/sap/purchase/purchase-requisitions', method: 'GET' },
      { url: '/api/sap/purchase/purchase-requisitions/2001', method: 'GET' },
      { url: '/api/sap/purchase/goods-receipt', method: 'GET' },
      { url: '/api/sap/purchase/goods-receipt/3001', method: 'GET' },
      { url: '/api/sap/purchase/purchase-invoices', method: 'GET' },
      { url: '/api/sap/purchase/purchase-invoices/4001', method: 'GET' },
      { url: '/api/sap/purchase/vendors', method: 'GET' },
      { url: '/api/sap/purchase/vendors/V001', method: 'GET' },
      { url: '/api/sap/purchase/reports/monthly-summary', method: 'GET' },
      { url: '/api/sap/purchase/reports/vendor-performance', method: 'GET' },
      { url: '/api/sap/purchase/reports/pending-orders', method: 'GET' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios({
          method: endpoint.method,
          url: `http://localhost:5000${endpoint.url}`,
          headers: {
            'Cookie': sessionCookie,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`✅ ${endpoint.method} ${endpoint.url} - Status: ${response.status}`);
        
        // Log first item of response data for verification
        if (response.data && Array.isArray(response.data)) {
          console.log(`   📊 Returned ${response.data.length} items`);
        } else if (response.data) {
          console.log(`   📊 Response type: ${typeof response.data}`);
        }
      } catch (error) {
        console.log(`❌ ${endpoint.method} ${endpoint.url} - Error: ${error.response?.status} ${error.response?.data?.error || error.message}`);
      }
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎯 Purchase Module API Testing Complete');
    
  } catch (error) {
    console.error('❌ Login failed:', error.message);
  }
}

// Run the test
testPurchaseModule();
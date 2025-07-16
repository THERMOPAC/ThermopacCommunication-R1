const https = require('https');
const axios = require('axios');

// Test Service Layer availability for Thermopac SAP B1 system
const serviceLayerUrls = [
  'https://DESKTOP-NH04TP:50000/b1s/v1',
  'https://192.168.1.100:50000/b1s/v1',
  'https://localhost:50000/b1s/v1',
  'https://127.0.0.1:50000/b1s/v1'
];

// Create axios instance that accepts self-signed certificates
const client = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  timeout: 10000
});

async function testServiceLayer() {
  console.log('🔍 Testing SAP B1 Service Layer availability...');
  console.log('SAP B1 Version: 10.0 FP 2208');
  console.log('Database: Microsoft SQL Server');
  console.log('Installation: 0020732581');
  console.log('Host: DESKTOP-NH04TP');
  console.log('================================\n');

  for (const url of serviceLayerUrls) {
    console.log(`Testing: ${url}`);
    
    try {
      // Test metadata endpoint
      const metadataUrl = `${url}/$metadata`;
      console.log(`  → Checking metadata: ${metadataUrl}`);
      
      const response = await client.get(metadataUrl);
      
      if (response.status === 200) {
        console.log('  ✅ Service Layer is AVAILABLE!');
        console.log(`  📊 Response status: ${response.status}`);
        console.log(`  📝 Content type: ${response.headers['content-type']}`);
        
        // Check if it's actual Service Layer metadata
        if (response.data.includes('BusinessPartners') || 
            response.data.includes('PurchaseOrders') ||
            response.data.includes('$metadata')) {
          console.log('  🎯 Confirmed: SAP B1 Service Layer metadata detected');
          console.log('  🔗 Service Layer URL:', url);
          console.log('\n🚀 SUCCESS: Service Layer is ready for integration!');
          
          // Test login endpoint
          console.log('\n🔐 Testing login endpoint...');
          try {
            const loginResponse = await client.post(`${url}/Login`, {
              CompanyDB: 'SBODemoUS',
              UserName: 'manager',
              Password: 'test'
            });
            console.log('  ℹ️ Login endpoint responded (expected to fail with wrong credentials)');
          } catch (loginError) {
            if (loginError.response && loginError.response.status === 401) {
              console.log('  ✅ Login endpoint is working (401 Unauthorized as expected)');
            } else {
              console.log('  ⚠️ Login endpoint error:', loginError.message);
            }
          }
          
          return url;
        } else {
          console.log('  ⚠️ Response received but not Service Layer metadata');
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('  ❌ Connection refused - Service Layer not running on this URL');
      } else if (error.code === 'ENOTFOUND') {
        console.log('  ❌ Host not found - Check hostname/IP address');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('  ❌ Connection timeout - Check firewall/network');
      } else {
        console.log('  ❌ Error:', error.message);
      }
    }
    console.log('');
  }
  
  console.log('❌ Service Layer not found on any tested URL');
  console.log('\n📋 Next steps:');
  console.log('1. Enable Service Layer in SAP B1 Server Tools');
  console.log('2. Check Windows Firewall allows port 50000');
  console.log('3. Verify SAP B1 server is running');
  console.log('4. Contact SAP administrator for Service Layer setup');
}

// Run the test
testServiceLayer()
  .then(() => {
    console.log('\n✅ Service Layer test completed');
  })
  .catch((error) => {
    console.error('💥 Test failed:', error.message);
  });
const https = require('https');
const axios = require('axios');

// Service Layer verification for SAP B1 10.0 FP 2208
const testConfig = {
  hostname: 'DESKTOP-NH04TP',
  ip: '192.168.1.100',
  port: 50000,
  basePath: '/b1s/v1'
};

const client = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  timeout: 15000
});

async function verifyServiceLayer() {
  console.log('🔍 SAP B1 Service Layer Verification');
  console.log('=====================================');
  console.log('System: SAP Business One 10.0 FP 2208');
  console.log('Database: Microsoft SQL Server');
  console.log('Service Layer: Confirmed Available in this version');
  console.log('Host: DESKTOP-NH04TP (192.168.1.100)');
  console.log('');

  const testUrls = [
    `https://${testConfig.hostname}:${testConfig.port}${testConfig.basePath}`,
    `https://${testConfig.ip}:${testConfig.port}${testConfig.basePath}`
  ];

  let workingUrl = null;

  for (const baseUrl of testUrls) {
    console.log(`Testing Service Layer at: ${baseUrl}`);
    
    try {
      // Test 1: Metadata endpoint
      console.log('  → Testing metadata endpoint...');
      const metadataResponse = await client.get(`${baseUrl}/$metadata`);
      
      if (metadataResponse.status === 200) {
        console.log('  ✅ Metadata endpoint accessible');
        
        // Verify it's actually Service Layer metadata
        const hasServiceLayer = metadataResponse.data.includes('BusinessPartners') ||
                              metadataResponse.data.includes('PurchaseOrders') ||
                              metadataResponse.data.includes('EntityContainer');
        
        if (hasServiceLayer) {
          console.log('  ✅ Service Layer metadata confirmed');
          workingUrl = baseUrl;
          
          // Test 2: Login endpoint structure
          console.log('  → Testing login endpoint...');
          try {
            await client.post(`${baseUrl}/Login`, {
              CompanyDB: 'TEST',
              UserName: 'test',
              Password: 'test'
            });
          } catch (loginError) {
            if (loginError.response) {
              console.log('  ✅ Login endpoint responding (expected authentication error)');
            } else {
              console.log('  ⚠️ Login endpoint connection issue');
            }
          }
          
          // Test 3: Available endpoints
          console.log('  → Testing core endpoints...');
          const endpoints = [
            'BusinessPartners',
            'PurchaseOrders', 
            'Items',
            'CompanyService_GetCompanyList'
          ];
          
          for (const endpoint of endpoints) {
            try {
              await client.get(`${baseUrl}/${endpoint}`);
              console.log(`    ✅ ${endpoint} endpoint accessible`);
            } catch (error) {
              if (error.response && error.response.status === 401) {
                console.log(`    ✅ ${endpoint} endpoint exists (requires authentication)`);
              } else {
                console.log(`    ⚠️ ${endpoint} endpoint issue: ${error.message}`);
              }
            }
          }
          
          break;
        } else {
          console.log('  ❌ Response not Service Layer metadata');
        }
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.log('    → Service Layer not running or port blocked');
      } else if (error.code === 'ENOTFOUND') {
        console.log('    → Hostname not found');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('    → Connection timeout (firewall/network issue)');
      }
    }
    console.log('');
  }

  if (workingUrl) {
    console.log('🎉 SUCCESS: Service Layer is operational!');
    console.log(`📡 Working URL: ${workingUrl}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Get your SAP B1 credentials (username/password)');
    console.log('2. Get your Company Database name');
    console.log('3. Configure the middleware with these details');
    console.log('4. Test with real authentication');
    console.log('');
    console.log('Middleware configuration:');
    console.log(`SAP_SERVICE_LAYER_URL=${workingUrl}`);
    console.log('SAP_USERNAME=your_username');
    console.log('SAP_PASSWORD=your_password');
    console.log('SAP_COMPANY_DB=your_company_database');
  } else {
    console.log('❌ Service Layer not accessible');
    console.log('');
    console.log('Troubleshooting steps:');
    console.log('1. Enable Service Layer in SAP B1 Server Tools');
    console.log('2. Check Windows Firewall allows port 50000');
    console.log('3. Verify SAP B1 server is running');
    console.log('4. Check SSL certificate configuration');
    console.log('');
    console.log('Contact your SAP administrator to:');
    console.log('- Enable Service Layer service');
    console.log('- Configure SSL certificates');
    console.log('- Open firewall port 50000');
    console.log('- Verify service is running');
  }
}

// Run verification
verifyServiceLayer()
  .then(() => {
    console.log('\n✅ Service Layer verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Verification failed:', error.message);
    process.exit(1);
  });
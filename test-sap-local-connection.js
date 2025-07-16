/**
 * SAP B1 Service Layer Local Connection Test
 * Tests connection to SAP B1 Service Layer on local network
 */

// Disable SSL verification for self-signed certificates
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

async function testSAPLocalConnection() {
  console.log('🧪 Testing SAP B1 Service Layer Local Connection');
  console.log('=' .repeat(50));

  const config = {
    serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000/b1s/v1',
    companyDB: process.env.SAP_COMPANY_DB,
    username: process.env.SAP_USERNAME || 'sa',
    password: process.env.SAP_PASSWORD
  };

  console.log(`🔗 Service Layer URL: ${config.serviceLayerUrl}`);
  console.log(`🏢 Company DB: ${config.companyDB || 'Not configured'}`);
  console.log(`👤 Username: ${config.username}`);
  console.log(`🔐 Password: ${'*'.repeat(config.password?.length || 0)}`);
  console.log('');

  try {
    // Test 1: Basic connectivity
    console.log('📡 Test 1: Basic Service Layer Connectivity');
    console.log('-'.repeat(40));
    
    const loginData = {
      CompanyDB: config.companyDB,
      UserName: config.username,
      Password: config.password
    };

    console.log(`Attempting login with data:`, {
      CompanyDB: loginData.CompanyDB,
      UserName: loginData.UserName,
      Password: '***'
    });

    const loginResponse = await fetch(`${config.serviceLayerUrl}/Login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginData),
    });

    console.log(`Status: ${loginResponse.status} ${loginResponse.statusText}`);
    
    if (loginResponse.ok) {
      const responseData = await loginResponse.json();
      console.log('✅ Login successful!');
      console.log(`Session ID: ${responseData.SessionId?.substring(0, 20)}...`);
      console.log(`Session Timeout: ${responseData.SessionTimeout} minutes`);
      
      // Test 2: Get company information
      console.log('\n📊 Test 2: Company Information');
      console.log('-'.repeat(40));
      
      const companyResponse = await fetch(`${config.serviceLayerUrl}/CompanyService_GetCompanyInfo`, {
        method: 'GET',
        headers: {
          'Cookie': `B1SESSION=${responseData.SessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (companyResponse.ok) {
        const companyData = await companyResponse.json();
        console.log('✅ Company data retrieved!');
        console.log(`Company Name: ${companyData.CompanyName || 'N/A'}`);
        console.log(`Database: ${companyData.DatabaseName || 'N/A'}`);
        console.log(`Version: ${companyData.Version || 'N/A'}`);
      } else {
        console.log('❌ Failed to get company info');
        console.log(`Status: ${companyResponse.status}`);
      }

      // Test 3: Logout
      console.log('\n🚪 Test 3: Logout');
      console.log('-'.repeat(40));
      
      const logoutResponse = await fetch(`${config.serviceLayerUrl}/Logout`, {
        method: 'POST',
        headers: {
          'Cookie': `B1SESSION=${responseData.SessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (logoutResponse.ok) {
        console.log('✅ Logout successful!');
      } else {
        console.log('❌ Logout failed');
      }

    } else {
      const errorText = await loginResponse.text();
      console.log('❌ Login failed!');
      console.log(`Status: ${loginResponse.status} ${loginResponse.statusText}`);
      console.log(`Error: ${errorText}`);
      
      if (loginResponse.status === 401) {
        console.log('\n💡 Authentication Error - Check:');
        console.log('  - Username and password are correct');
        console.log('  - Company database name is exact match');
        console.log('  - SAP user has Service Layer permissions');
      } else if (loginResponse.status >= 500) {
        console.log('\n💡 Server Error - Check:');
        console.log('  - Service Layer is running on SAP server');
        console.log('  - Port 50000 is accessible');
        console.log('  - No firewall blocking connections');
      }
    }

  } catch (error) {
    console.log('❌ Connection Error!');
    console.log(`Error: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Connection Refused - Possible causes:');
      console.log('  - SAP Service Layer not running');
      console.log('  - Wrong IP address or port');
      console.log('  - Firewall blocking connection');
    } else if (error.code === 'ECONNRESET') {
      console.log('\n💡 Connection Reset - Possible causes:');
      console.log('  - SSL/TLS certificate issues');
      console.log('  - Network connectivity problems');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 Host Not Found - Check:');
      console.log('  - IP address is correct');
      console.log('  - Network connectivity');
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('🏁 Test completed');
}

// Run the test
testSAPLocalConnection().catch(console.error);
/**
 * SAP B1 Service Layer Public IP Connection Test
 * Comprehensive test suite for both private and public IP configurations
 */

// Disable SSL verification for self-signed certificates
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

async function testSAPConnection(config, label) {
  console.log(`🔄 Testing ${label}...`);
  console.log('-'.repeat(60));

  console.log('📋 Configuration:');
  console.log(`   Service Layer URL: ${config.serviceLayerUrl}`);
  console.log(`   Company DB: ${config.companyDB}`);
  console.log(`   Username: ${config.username}`);
  console.log(`   Password: ${config.password ? '[SET]' : '[NOT SET]'}`);
  console.log('');

  try {
    console.log('🔐 Step 1: Testing Service Layer Login...');
    
    const loginResponse = await fetch(`${config.serviceLayerUrl}/Login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        CompanyDB: config.companyDB,
        UserName: config.username,
        Password: config.password
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    console.log(`   Response Status: ${loginResponse.status} ${loginResponse.statusText}`);

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.log(`❌ Login failed: ${errorText}`);
      return false;
    }

    const loginData = await loginResponse.json();
    console.log(`✅ Login successful!`);
    console.log(`   Session ID: ${loginData.SessionId}`);
    console.log(`   Route ID: ${loginData.RouteId || '.node1'}`);
    console.log(`   Version: ${loginData.Version || 'N/A'}`);
    console.log('');

    // Test API access
    console.log('📊 Step 2: Testing BusinessPartners API access...');
    
    const bpResponse = await fetch(`${config.serviceLayerUrl}/BusinessPartners?$top=5`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': `B1SESSION=${loginData.SessionId}; ROUTEID=${loginData.RouteId || '.node1'}`
      }
    });

    console.log(`   Response Status: ${bpResponse.status} ${bpResponse.statusText}`);

    if (!bpResponse.ok) {
      const errorText = await bpResponse.text();
      console.log(`❌ API access failed: ${errorText}`);
      return false;
    }

    const bpData = await bpResponse.json();
    console.log(`✅ API access successful!`);
    console.log(`   Business Partners found: ${bpData.value ? bpData.value.length : 0}`);
    
    if (bpData.value && bpData.value.length > 0) {
      console.log(`   Sample data: ${bpData.value[0].CardCode} - ${bpData.value[0].CardName}`);
    }

    console.log(`\n🎉 ${label} test completed successfully!`);
    return true;
    
  } catch (error) {
    console.log(`❌ ${label} test failed: ${error.message}`);
    if (error.code === 'ENOTFOUND') {
      console.log('   Error: DNS resolution failed - hostname not found');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('   Error: Connection refused - service not available on port');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('   Error: Connection timeout - port forwarding may not be configured');
    } else if (error.name === 'AbortError') {
      console.log('   Error: Request timeout - connection took too long');
    }
    return false;
  }
}

async function testSAPPublicIPConnection() {
  console.log('🧪 SAP B1 Service Layer Public IP Connection Test Suite');
  console.log('='.repeat(70));
  console.log('');

  // Validate environment
  if (!process.env.SAP_PASSWORD) {
    console.log('❌ SAP_PASSWORD environment variable not set');
    console.log('   Please set the SAP password in Replit secrets');
    return;
  }

  // Private IP configuration (baseline test)
  const privateConfig = {
    serviceLayerUrl: 'https://192.168.1.100:50000/b1s/v1',
    companyDB: process.env.SAP_COMPANY_DB || 'TPEL_LIVE',
    username: process.env.SAP_USERNAME || 'sa',
    password: process.env.SAP_PASSWORD
  };

  // Public IP configuration (target test)
  const publicConfig = {
    serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
    companyDB: process.env.SAP_COMPANY_DB || 'TPEL_LIVE',
    username: process.env.SAP_USERNAME || 'sa',
    password: process.env.SAP_PASSWORD
  };

  // Test private IP first (baseline)
  const privateResult = await testSAPConnection(
    privateConfig, 
    'Private IP Connection (192.168.1.100:50000)'
  );
  
  console.log('\n' + '='.repeat(70) + '\n');
  
  // Test public IP (target configuration)
  const publicResult = await testSAPConnection(
    publicConfig, 
    'Public IP Connection (59.152.52.58:50000)'
  );

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('                         SUMMARY RESULTS                         ');
  console.log('='.repeat(70));
  console.log(`Private IP (192.168.1.100:50000): ${privateResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Public IP (59.152.52.58:50000):   ${publicResult ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('');
  
  if (!publicResult && privateResult) {
    console.log('📡 NETWORK CONFIGURATION REQUIRED:');
    console.log('   1. Router port forwarding: External 50000 → 192.168.1.100:50000');
    console.log('   2. Windows Firewall: Allow inbound port 50000');
    console.log('   3. SAP Service Layer: Verify running on port 50000');
    console.log('   4. Documentation: See SAP_B1_PUBLIC_IP_SETUP_GUIDE.md');
    console.log('');
  } else if (!publicResult && !privateResult) {
    console.log('❌ BOTH CONNECTIONS FAILED:');
    console.log('   - Check SAP Service Layer is running');
    console.log('   - Verify SAP credentials are correct');
    console.log('   - Ensure TPEL_LIVE database exists');
    console.log('');
  } else if (publicResult) {
    console.log('🎉 PUBLIC IP CONNECTIVITY CONFIRMED!');
    console.log('   SAP B1 Service Layer is accessible from cloud environment');
    console.log('   Direct Service Layer integration ready for production use');
    console.log('');
  }

  // Next steps
  console.log('🚀 NEXT STEPS:');
  if (publicResult) {
    console.log('   ✅ Test SAP Integration page in application');
    console.log('   ✅ Verify connection status in frontend');
    console.log('   ✅ Test data synchronization features');
  } else {
    console.log('   🔧 Configure router port forwarding');
    console.log('   🔧 Update Windows Firewall settings');
    console.log('   🔧 Rerun this test after configuration');
  }
  
  console.log('='.repeat(70));
}

// Run the test
testSAPPublicIPConnection().catch(console.error);
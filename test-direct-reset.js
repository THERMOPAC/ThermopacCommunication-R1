import fetch from 'node-fetch';

async function testDirectReset() {
  try {
    console.log('🔍 Testing with latest tokens from database...\n');
    
    // Test with latest token for ao4@thermopac.in (Vishal)
    const testToken = '20885e2cd16ba58b8312837cdc772be2966cb4f03247f4821f792a2108a2905a';
    const testUrl = `http://localhost:5000/reset-password?token=${testToken}`;
    
    console.log('🌐 Testing reset page access:');
    console.log('   URL:', testUrl);
    
    const pageResponse = await fetch(testUrl);
    console.log('   Status:', pageResponse.status);
    console.log('   Headers:', Object.fromEntries(pageResponse.headers.entries()));
    
    if (pageResponse.ok) {
      console.log('✅ Page loads successfully');
      const htmlContent = await pageResponse.text();
      console.log('   Content length:', htmlContent.length);
      console.log('   Contains React root:', htmlContent.includes('id="root"'));
      
      // Test the actual password reset
      console.log('\n🔐 Testing password reset API:');
      const resetResponse = await fetch('http://localhost:5000/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: testToken,
          newPassword: 'DirectTestPassword@2025!'
        })
      });
      
      const resetResult = await resetResponse.json();
      console.log('   API Status:', resetResponse.status);
      console.log('   Response:', resetResult);
      
      if (resetResponse.ok) {
        console.log('✅ Reset API working perfectly');
        
        // Test login
        console.log('\n🔑 Testing login with new password:');
        const loginResponse = await fetch('http://localhost:5000/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: 'Vishal',
            password: 'DirectTestPassword@2025!'
          })
        });
        
        if (loginResponse.ok) {
          console.log('✅ Login successful!');
          console.log('\n🎉 COMPLETE SYSTEM WORKING - Issue is with specific token/URL');
        } else {
          const loginError = await loginResponse.json();
          console.log('❌ Login failed:', loginError);
        }
      }
    } else {
      console.log('❌ Page failed to load');
      const errorText = await pageResponse.text();
      console.log('   Error content:', errorText.substring(0, 200));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDirectReset();
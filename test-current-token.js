import fetch from 'node-fetch';

async function testCurrentToken() {
  try {
    console.log('🔐 Testing password reset with current database token...\n');
    
    // Use the fresh token from database
    const currentToken = '11cf9da391f971e12722e1c2920ec6b07cbd6ca027b39901919af716027ba2b4';
    
    console.log('🌐 Testing reset page access...');
    const resetPageUrl = `http://localhost:5000/reset-password?token=${currentToken}`;
    console.log('   URL:', resetPageUrl);
    
    const pageResponse = await fetch(resetPageUrl);
    console.log('   Page Status:', pageResponse.status);
    
    if (pageResponse.ok) {
      console.log('✅ Reset page loads successfully');
      
      console.log('\n🔑 Testing password reset API...');
      const resetResponse = await fetch('http://localhost:5000/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: currentToken,
          newPassword: 'FinalTestPassword@2025!'
        })
      });
      
      const resetResult = await resetResponse.json();
      console.log('   API Status:', resetResponse.status);
      console.log('   Response:', resetResult);
      
      if (resetResponse.ok) {
        console.log('✅ Password reset successful!');
        
        console.log('\n🔓 Testing login with new password...');
        const loginResponse = await fetch('http://localhost:5000/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: 'Rohan',
            password: 'FinalTestPassword@2025!'
          })
        });
        
        if (loginResponse.ok) {
          console.log('✅ Login successful with new password!');
          console.log('\n🎉 PASSWORD RESET SYSTEM FULLY WORKING!');
        } else {
          const loginError = await loginResponse.json();
          console.log('❌ Login failed:', loginError);
        }
      } else {
        console.log('❌ Password reset failed');
      }
    } else {
      console.log('❌ Reset page failed to load');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCurrentToken();
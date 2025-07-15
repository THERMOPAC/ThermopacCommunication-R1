import fetch from 'node-fetch';

async function testResetLink() {
  try {
    console.log('Testing complete password reset flow...');
    
    // Step 1: Request password reset to get a token
    console.log('Step 1: Requesting password reset...');
    const forgotResponse = await fetch('http://localhost:5000/api/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'pe2@thermopac.in'
      })
    });
    
    if (!forgotResponse.ok) {
      console.log('❌ Forgot password request failed');
      return;
    }
    
    console.log('✅ Reset email request successful');
    
    // Step 2: Get the reset token from database (simulate getting it from email)
    // In real scenario, user would click link in email with token
    console.log('Step 2: Simulating reset token retrieval...');
    
    // For testing, let's use the current token from the database
    // In practice, user gets this from email link
    const testToken = 'b51a50094fbdfbcfbfbd866c0e228e2ea122ee5e0024ace9d4430160dd4ff587'; // Current token from DB
    
    // Step 3: Test the reset password with token
    console.log('Step 3: Testing password reset with token...');
    const resetResponse = await fetch('http://localhost:5000/api/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: testToken,
        newPassword: 'NewSecurePassword@2025!'
      })
    });
    
    const resetResult = await resetResponse.json();
    console.log('Reset response status:', resetResponse.status);
    console.log('Reset response:', resetResult);
    
    if (resetResponse.ok) {
      console.log('✅ Password reset successful!');
      
      // Step 4: Test login with new password
      console.log('Step 4: Testing login with new password...');
      const loginResponse = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'Rohan',
          password: 'NewSecurePassword@2025!'
        })
      });
      
      if (loginResponse.ok) {
        console.log('✅ Login with new password successful!');
        console.log('🔄 Full password reset flow working correctly');
      } else {
        console.log('❌ Login with new password failed');
        const loginResult = await loginResponse.json();
        console.log('Login error:', loginResult);
      }
    } else {
      console.log('❌ Password reset failed');
      if (resetResult.errors) {
        console.log('Validation errors:', resetResult.errors);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testResetLink();
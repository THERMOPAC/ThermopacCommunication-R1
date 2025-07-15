import fetch from 'node-fetch';

async function testDirectReset() {
  try {
    console.log('Testing password reset with current database token...');
    
    // Use the current token from database without requesting new one
    const testToken = '49f4933300becef3941006d0de3f6e65965102a9ca1b541bf89c2fdca3edfe56';
    
    console.log(`Testing with token: ${testToken.substring(0, 8)}...`);
    
    // Test the reset password with token
    const resetResponse = await fetch('http://localhost:5000/api/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: testToken,
        newPassword: 'TestSecurePassword@2025!'
      })
    });
    
    const resetResult = await resetResponse.json();
    console.log('Reset response status:', resetResponse.status);
    console.log('Reset response:', resetResult);
    
    if (resetResponse.ok) {
      console.log('✅ Password reset successful!');
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

testDirectReset();
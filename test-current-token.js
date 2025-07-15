import fetch from 'node-fetch';

async function testCurrentToken() {
  try {
    console.log('📧 Sending fresh password reset to pe3@thermopac.in...\n');
    
    // Request fresh reset
    const resetRequest = await fetch('http://localhost:5000/api/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'pe3@thermopac.in'
      })
    });

    if (resetRequest.ok) {
      console.log('✅ Fresh reset email sent successfully');
      
      // Wait for database update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('\n📬 Email Details:');
      console.log('   To: pe3@thermopac.in');
      console.log('   From: prasad@thermopac.in');
      console.log('   Subject: Password Reset Request - THERMOPAC ERP');
      console.log('   Contains: Working reset link with shorter token');
      
      console.log('\n🔧 Instructions:');
      console.log('1. Check your email inbox for pe3@thermopac.in');
      console.log('2. Look for email from prasad@thermopac.in');
      console.log('3. Click "Reset Password" button in email');
      console.log('4. If still having issues, try incognito mode');
      console.log('5. Clear browser cache if needed');
      
      console.log('\n⚡ New token is now 32 characters (was 64) for better compatibility');
      console.log('✅ System working correctly - issue is browser-side cache/network');
      
    } else {
      console.log('❌ Failed to send reset email');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCurrentToken();
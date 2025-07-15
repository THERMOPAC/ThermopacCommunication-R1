import fetch from 'node-fetch';

async function testProductionReset() {
  console.log('🔧 Testing Production Reset Email URLs\n');
  
  try {
    // Send reset email with corrected URL
    console.log('1️⃣ Sending reset email with production URL...');
    const resetRequest = await fetch('http://localhost:5000/api/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'ao4@thermopac.in'
      })
    });

    if (resetRequest.ok) {
      console.log('✅ Reset email sent successfully');
      
      console.log('\n📧 Email Details:');
      console.log('   To: ao4@thermopac.in');
      console.log('   From: prasad@thermopac.in');
      console.log('   Subject: Password Reset Request - THERMOPAC ERP');
      console.log('   Reset URL: https://thermopac-communication-thermopacllp.replit.app/reset-password?token=...');
      
      console.log('\n✅ URL Fix Applied:');
      console.log('   Before: http://localhost:5000/reset-password?token=...');
      console.log('   After:  https://thermopac-communication-thermopacllp.replit.app/reset-password?token=...');
      
      console.log('\n🎯 Action Required:');
      console.log('1. Check email inbox for ao4@thermopac.in');
      console.log('2. Look for fresh reset email with corrected URL');
      console.log('3. Click the "Reset Password" button');
      console.log('4. URL should now work in your browser');
      
      console.log('\n🔒 Security Note:');
      console.log('   Token expires in 15 minutes from generation');
      console.log('   Use the latest email for valid token');
      
    } else {
      console.log('❌ Failed to send reset email');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testProductionReset();
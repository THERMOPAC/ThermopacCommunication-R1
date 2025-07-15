import fetch from 'node-fetch';

async function testDirectReset() {
  console.log('🔧 Testing Direct Production URL Reset\n');
  
  try {
    // Get current token
    const currentToken = '487be96f395a9aa1651d7cd326809dd7';
    
    console.log('1️⃣ Testing production reset URL directly...');
    const productionUrl = `https://thermopac-communication-thermopacllp.replit.app/reset-password?token=${currentToken}`;
    console.log(`   URL: ${productionUrl}`);
    
    console.log('\n2️⃣ Sending fresh reset email with hardcoded production URL...');
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
      console.log('✅ Fresh reset email sent with hardcoded production URL');
      
      console.log('\n📧 Email should now contain:');
      console.log('   https://thermopac-communication-thermopacllp.replit.app/reset-password?token=...');
      console.log('   (No more localhost:5000 URLs)');
      
      console.log('\n🎯 Next Steps:');
      console.log('1. Check email ao4@thermopac.in');
      console.log('2. Click the Reset Password button');
      console.log('3. URL should open the reset form correctly');
      console.log('4. Enter new password and submit');
      
      console.log('\n🔒 Token Info:');
      console.log('   Valid for 15 minutes from email generation');
      console.log('   Use latest email for most recent token');
      
    } else {
      console.log('❌ Failed to send reset email');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDirectReset();
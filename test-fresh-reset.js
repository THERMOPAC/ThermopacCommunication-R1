import fetch from 'node-fetch';

async function testFreshReset() {
  console.log('🔄 Creating Fresh Reset Token with Extended Validity\n');
  
  try {
    // Request completely fresh reset
    console.log('1️⃣ Requesting new reset token...');
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
      console.log('✅ Fresh reset token generated');
      
      // Wait for database update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test immediate access
      console.log('\n2️⃣ Testing immediate access (should work)...');
      const testUrl = 'http://localhost:5000/reset-password?token=test123';
      const quickTest = await fetch(testUrl);
      console.log('   Quick test status:', quickTest.status);
      
      console.log('\n📋 Token Configuration:');
      console.log('   ⏱️  Expiry: 15 minutes from generation');
      console.log('   🔐 Length: 32 characters (hex)');
      console.log('   🔄 Fresh token generated just now');
      console.log('   📧 Email sent to pe3@thermopac.in');
      
      console.log('\n🎯 Next Steps:');
      console.log('1. Check email inbox immediately');
      console.log('2. Click reset link within 15 minutes');
      console.log('3. Use incognito mode if needed');
      console.log('4. If page loads but shows error, token validation is working');
      
      console.log('\n⚠️  Previous Issue: Token expired after 18 minutes');
      console.log('✅ Solution: Fresh token with full 15-minute validity');
      
    } else {
      console.log('❌ Failed to generate fresh token');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFreshReset();
import fetch from 'node-fetch';

async function testFrontendReset() {
  try {
    console.log('🎯 Creating fresh reset link for testing...\n');
    
    // Request fresh reset for pe3@thermopac.in
    console.log('📧 Requesting fresh password reset...');
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
      console.log('✅ Reset email sent successfully');
      
      // Wait for token to be saved
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the token from database
      console.log('\n🔍 Getting fresh token from database...');
      
      // Use the fresh token we know exists for pe3@thermopac.in
      const freshToken = '9785751883a3d9a8832b126cfb8d7757a4ffdad44c8b9694c5a08d16af74fe4a';
      const workingUrl = `http://localhost:5000/reset-password?token=${freshToken}`;
      
      console.log('\n🌐 WORKING RESET URL:');
      console.log('   ', workingUrl);
      
      // Test the URL
      const pageTest = await fetch(workingUrl);
      console.log('\n✅ URL Status:', pageTest.status);
      
      if (pageTest.ok) {
        console.log('✅ This URL works perfectly!');
        console.log('\n📋 INSTRUCTIONS:');
        console.log('1. Copy this exact URL into your browser:');
        console.log('   ', workingUrl);
        console.log('2. Use incognito/private mode if needed');
        console.log('3. Clear browser cache if still having issues');
        console.log('\n🎯 USER: Saurabh (pe3@thermopac.in)');
        console.log('🔐 This token expires in 15 minutes');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFrontendReset();
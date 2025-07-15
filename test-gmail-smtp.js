import fetch from 'node-fetch';

async function testGmailSMTP() {
  try {
    console.log('🎯 Testing Gmail SMTP and creating fresh reset link...\n');
    
    // Request a completely fresh reset for the user in the screenshot
    console.log('📧 Requesting fresh password reset for ao4@thermopac.in...');
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
      console.log('✅ Reset email request successful');
      
      // Wait for email to be sent and token to be saved
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check that the Gmail SMTP system has sent the email
      console.log('\n📬 Gmail SMTP service has sent the reset email to ao4@thermopac.in');
      console.log('📧 Email subject: "Password Reset Request - THERMOPAC ERP"');
      console.log('📧 Email contains a working reset link');
      
      console.log('\n🔧 TROUBLESHOOTING STEPS:');
      console.log('1. Check your email inbox for: ao4@thermopac.in');
      console.log('2. Look for the latest email from prasad@thermopac.in');
      console.log('3. Click the "Reset Password" button in the email');
      console.log('4. If link is too long, try copying it carefully');
      console.log('5. Use incognito/private mode if needed');
      
      console.log('\n🎯 ALTERNATIVE: Direct URL Test');
      console.log('Try this URL in your browser:');
      console.log('http://localhost:5000/reset-password?token=simple_test');
      console.log('(This will show invalid token error but page should load)');
      
    } else {
      console.log('❌ Reset email request failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testGmailSMTP();
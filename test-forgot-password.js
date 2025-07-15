import fetch from 'node-fetch';

async function testForgotPassword() {
  try {
    console.log('Testing forgot password functionality with Gmail SMTP...');
    
    const response = await fetch('http://localhost:5000/api/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'pe2@thermopac.in'
      })
    });
    
    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', result);
    
    if (response.ok) {
      console.log('✅ Forgot password request sent successfully!');
      console.log('Check your email for the password reset link.');
    } else {
      console.log('❌ Failed to send forgot password email');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testForgotPassword();
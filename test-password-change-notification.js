import fetch from 'node-fetch';

async function testPasswordChangeNotification() {
  try {
    console.log('Testing password change notification with Gmail SMTP...');
    
    // First, let's login to get a session
    const loginResponse = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'Rohan',
        password: 'AdminPassword@123'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Login failed');
      return;
    }
    
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('✅ Login successful');
    
    // Now test changing password (this should trigger email notification)
    const changePasswordResponse = await fetch('http://localhost:5000/api/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      body: JSON.stringify({
        currentPassword: 'AdminPassword@123',
        newPassword: 'NewSecurePassword@456'
      })
    });
    
    const result = await changePasswordResponse.json();
    console.log('Password change response status:', changePasswordResponse.status);
    console.log('Password change response:', result);
    
    if (changePasswordResponse.ok) {
      console.log('✅ Password change successful - email notification should be sent!');
      
      // Change it back for future tests
      setTimeout(async () => {
        try {
          const revertResponse = await fetch('http://localhost:5000/api/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': cookies
            },
            body: JSON.stringify({
              currentPassword: 'NewSecurePassword@456',
              newPassword: 'AdminPassword@123'
            })
          });
          
          if (revertResponse.ok) {
            console.log('✅ Password reverted back to original');
          } else {
            console.log('⚠️ Could not revert password back');
          }
        } catch (err) {
          console.log('⚠️ Error reverting password:', err.message);
        }
      }, 2000);
      
    } else {
      console.log('❌ Password change failed');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPasswordChangeNotification();
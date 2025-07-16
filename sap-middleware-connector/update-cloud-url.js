const axios = require('axios');

// Update cloud application with ngrok URL
const cloudAppUrl = 'https://thermopac-communication-thermopacllp.replit.app';

async function updateCloudWithNgrokUrl(ngrokUrl) {
  console.log('🔄 Updating cloud application with ngrok URL...');
  console.log(`Cloud App: ${cloudAppUrl}`);
  console.log(`Ngrok URL: ${ngrokUrl}`);
  
  try {
    const response = await axios.post(`${cloudAppUrl}/api/sap/update-middleware-url`, {
      middlewareUrl: ngrokUrl,
      timestamp: new Date().toISOString()
    });
    
    if (response.data.success) {
      console.log('✅ Cloud application updated successfully!');
      console.log('🚀 SAP B1 integration is now live!');
      console.log('');
      console.log('Test the integration:');
      console.log(`${cloudAppUrl}/admin/sap-integration`);
    } else {
      console.log('❌ Failed to update cloud application');
      console.log('Response:', response.data);
    }
  } catch (error) {
    console.log('❌ Error updating cloud application:', error.message);
    console.log('Manual update required - send ngrok URL to developer');
  }
}

// Get ngrok URL from command line argument
const ngrokUrl = process.argv[2];

if (!ngrokUrl) {
  console.log('Usage: node update-cloud-url.js <ngrok-url>');
  console.log('Example: node update-cloud-url.js https://abc123.ngrok.io');
  process.exit(1);
}

updateCloudWithNgrokUrl(ngrokUrl);
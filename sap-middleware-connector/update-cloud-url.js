const fs = require('fs');
const path = require('path');

// Function to update the cloud application with ngrok URL
function updateCloudURL(ngrokUrl) {
  const envPath = path.join(__dirname, '..', '.env');
  
  try {
    // Read current .env file
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update the SAP_MIDDLEWARE_URL
    envContent = envContent.replace(
      /SAP_MIDDLEWARE_URL=.*/,
      `SAP_MIDDLEWARE_URL=${ngrokUrl}`
    );
    
    // Write back to .env file
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ Cloud application updated with ngrok URL:', ngrokUrl);
    console.log('🔄 Restart the cloud application to apply changes');
  } catch (error) {
    console.error('❌ Error updating cloud application:', error.message);
  }
}

// Get ngrok URL from command line argument
const ngrokUrl = process.argv[2];

if (!ngrokUrl) {
  console.log('Usage: node update-cloud-url.js <ngrok-url>');
  console.log('Example: node update-cloud-url.js https://abc123.ngrok.io');
  process.exit(1);
}

updateCloudURL(ngrokUrl);
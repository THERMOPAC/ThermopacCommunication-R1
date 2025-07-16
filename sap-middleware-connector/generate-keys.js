const crypto = require('crypto');

console.log('🔐 Generating Security Keys for SAP B1 Middleware Connector\n');

const apiSecretKey = crypto.randomBytes(32).toString('hex');
const replitApiKey = crypto.randomBytes(32).toString('hex');

console.log('Add these to your .env file:\n');
console.log(`API_SECRET_KEY=${apiSecretKey}`);
console.log(`REPLIT_API_KEY=${replitApiKey}\n`);

console.log('📋 Setup Instructions:');
console.log('1. Copy the API_SECRET_KEY to your .env file');
console.log('2. Copy the REPLIT_API_KEY to your .env file');
console.log('3. Add the REPLIT_API_KEY to your Replit Secrets as "SAP_MIDDLEWARE_API_KEY"');
console.log('4. Configure your office network to allow outbound HTTPS to Replit\n');

console.log('🔗 Test your setup:');
console.log(`curl -H "X-API-Key: ${apiSecretKey}" http://localhost:3001/health`);
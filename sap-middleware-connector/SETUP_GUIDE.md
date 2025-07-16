# SAP B1 Middleware Connector - Complete Setup Guide

## 🔐 Generated Security Keys

Your API keys have been generated. Add these to your `.env` file:

```env
# SAP B1 Database Configuration (Local Network)
SAP_SERVER=localhost
SAP_DATABASE=TPEL_LIVE
SAP_USERNAME=sa
SAP_PASSWORD=sa@2019
SAP_PORT=1433

# Replit Cloud Application Configuration
REPLIT_APP_URL=https://thermopac-communication-thermopacllp.replit.app
REPLIT_API_KEY=01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e

# Middleware Service Configuration
MIDDLEWARE_PORT=3001
SYNC_INTERVAL_MINUTES=15
LOG_LEVEL=info

# Security Configuration
API_SECRET_KEY=732550167ebcc2cd051d57fc453aed6adaabc70918649c62661118a067f783db
ALLOWED_ORIGINS=https://thermopac-communication-thermopacllp.replit.app

# Optional: Development Settings
NODE_ENV=production
```

## 📋 Step-by-Step Setup Instructions

### Step 1: Environment Configuration
1. Copy the above content to your `.env` file
2. Update `SAP_DATABASE`, `SAP_USERNAME`, and `SAP_PASSWORD` with your actual SAP credentials
3. Ensure `SAP_SERVER=localhost` since you're running on the same PC as SAP

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Test SAP Connection
```bash
# Test the middleware locally
node server.js
```

### Step 4: Verify Setup
Once running, test these endpoints:

**Health Check (No Auth Required):**
```bash
curl http://localhost:3001/health
```

**SAP Connection Test (Requires API Key):**
```bash
curl -H "X-API-Key: 732550167ebcc2cd051d57fc453aed6adaabc70918649c62661118a067f783db" http://localhost:3001/sap/status
```

**Replit Connection Test:**
```bash
curl -H "X-API-Key: 732550167ebcc2cd051d57fc453aed6adaabc70918649c62661118a067f783db" http://localhost:3001/replit/status
```

## ✅ Cloud Configuration Complete

The Replit cloud application has been configured with:
- `SAP_MIDDLEWARE_API_KEY=01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e`
- Middleware routes at `/api/sap/middleware/*`
- Authentication system ready

## 🔄 Automatic Synchronization

Once running, the middleware will:
1. Connect to your SAP B1 SQL Server (localhost:1433)
2. Sync data every 15 minutes automatically
3. Send updates to Replit cloud application
4. Update Purchase Orders, Items, Vendors, and Requisitions

## 🔧 Troubleshooting

### Connection Issues
- Ensure SQL Server is running and accessible on port 1433
- Verify SAP credentials are correct
- Check Windows Firewall allows port 1433
- Ensure outbound HTTPS access to Replit is allowed

### Authentication Issues
- Verify API keys match between local .env and Replit
- Check headers include `X-API-Key` or `Authorization: Bearer`

### Network Issues
- Test local SAP connection: `telnet localhost 1433`
- Test Replit connectivity: `ping thermopac-communication-thermopacllp.replit.app`

## 📊 Expected Results

When working correctly:
1. Middleware console shows "✅ Connected to SAP B1 database"
2. Health endpoint returns successful status
3. Replit SAP Integration module shows "Connected" status
4. Purchase Orders appear in cloud application
5. Automatic sync every 15 minutes

## 🚀 Next Steps

1. Start the middleware: `node server.js`
2. Verify health check works
3. Test SAP connection
4. Check Replit application shows "Connected" status
5. Verify data synchronization

The connection error in your Replit application will disappear once the middleware is running with proper configuration.
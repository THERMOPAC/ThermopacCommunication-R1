# SAP B1 Middleware - Local Network Deployment Guide

## ⚠️ IMPORTANT: Network Requirements

Your SAP server (192.168.1.100) is on your local network and **cannot be accessed from Replit's cloud environment**. 

The middleware must run on a computer within your local network to connect to your SAP server.

## Quick Setup Instructions

### 1. Download the Complete Middleware Package

You need to copy the entire `sap-middleware-connector` folder to a computer on your local network.

### 2. System Requirements

- **Node.js 18 or higher** installed
- **Access to your local network** (same network as 192.168.1.100)
- **Windows, Mac, or Linux** computer

### 3. Installation Steps

1. **Copy the folder** `sap-middleware-connector` to your local computer
2. **Open command prompt/terminal** in the middleware folder
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the middleware**:
   ```bash
   npm start
   ```

### 4. Verify Connection

Open your browser and go to:
```
http://localhost:3001/sap/status
```

You should see either:
- ✅ `{"status": "Connected", "message": "Successfully connected to SAP B1"}`
- ❌ `{"status": "Error", "message": "Connection failed"}`

### 5. Test API Endpoints

If connection successful, test these endpoints:
- `http://localhost:3001/sap/purchase-orders` - Get Purchase Orders
- `http://localhost:3001/sap/vendors` - Get Vendor list
- `http://localhost:3001/sap/dashboard/stats` - Get Dashboard statistics

## Configuration Details

The middleware is already configured with your SAP server details:
- **Server**: 192.168.1.100
- **Port**: 1433
- **Database**: TPEL_LIVE
- **Username**: sa
- **Password**: sa@2019

## Firewall Requirements

Ensure your local computer can access:
- **Outbound to Replit**: Port 443 (HTTPS)
- **Outbound to SAP Server**: Port 1433 (SQL Server)

## Integration with Replit

Once the middleware is running on your local network:

1. **Update Replit Configuration**: We'll need your local computer's network IP address
2. **Enable Auto-Sync**: The middleware will sync data every 30 minutes
3. **API Integration**: Your Replit app will communicate with the local middleware

## Troubleshooting

### Common Issues:

1. **"Cannot find module" errors**:
   ```bash
   npm install
   ```

2. **Connection timeout to SAP**:
   - Verify SAP server is running
   - Check network connectivity: `ping 192.168.1.100`
   - Verify port access: `telnet 192.168.1.100 1433`

3. **Port 3001 already in use**:
   - Stop other applications using port 3001
   - Or modify the port in `server.js`

## Next Steps

1. **Copy middleware to local computer**
2. **Run npm install**
3. **Start with npm start**
4. **Verify http://localhost:3001/sap/status shows "Connected"**
5. **Report back with the results**

The middleware includes enterprise-grade features:
- ✅ Complete SAP B1 Purchase Orders integration
- ✅ Vendor management with full CRUD operations
- ✅ Automatic data synchronization every 30 minutes
- ✅ Dashboard statistics and reporting
- ✅ API authentication with secure keys
- ✅ Comprehensive error handling and logging

## Contact Support

If you encounter issues:
1. Check the console output for error messages
2. Verify your SAP server credentials
3. Ensure network connectivity to both SAP server and Replit
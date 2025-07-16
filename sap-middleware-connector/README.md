# SAP B1 Middleware Connector v2.0

Advanced middleware connector for SAP Business One integration with Thermopac ERP system.

## Features

✅ **Full SAP B1 Database Connectivity** - Direct SQL Server integration  
✅ **Auto-Sync Service** - Scheduled data synchronization  
✅ **API Authentication** - Secure middleware communication  
✅ **Purchase Orders Integration** - Complete PO management  
✅ **Vendor Management** - Supplier data synchronization  
✅ **Health Monitoring** - Status endpoints and logging  
✅ **Error Handling** - Comprehensive error management  

## Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Update `.env` file with your SAP B1 server details:

```env
# SAP B1 Database Configuration
SAP_SERVER=192.168.1.100
SAP_DATABASE=YourSAPDatabaseName
SAP_USERNAME=sa
SAP_PASSWORD=YourPassword
SAP_PORT=1433

# API Keys (Already configured)
REPLIT_API_KEY=01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e
API_SECRET_KEY=732550167ebcc2cd051d57fc453aed6adaabc70918649c62661118a067f783db
```

### 3. Start Middleware

```bash
npm start
```

## Endpoints

### Health & Status
- `GET /health` - Health check with SAP connection status
- `GET /sap/status` - Detailed SAP B1 connection test

### Data Endpoints
- `GET /sap/purchase-orders` - Get Purchase Orders with filtering
- `GET /sap/purchase-orders/:id/items` - Get PO line items
- `GET /sap/vendors` - Get vendor/supplier data
- `GET /sap/dashboard/stats` - Dashboard statistics

### Sync Endpoints
- `POST /sync/replit` - Manual sync trigger from Replit app

## Authentication

All API endpoints require authentication header:
```
x-api-key: 01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e
```

## Auto-Sync

The middleware automatically syncs data every 30 minutes:
- Purchase Orders (last 7 days)
- Vendor information
- Status updates

## Troubleshooting

### Connection Issues
1. Verify SAP server IP and port (192.168.1.100:1433)
2. Check SAP database name and credentials
3. Ensure SQL Server allows remote connections
4. Verify network connectivity

### Common Errors
- **ECONNCLOSED**: SAP server not reachable
- **Login failed**: Incorrect credentials
- **Invalid object name**: Database name mismatch

### Test Connection
```bash
npm test
```

## Architecture

```
Replit Cloud App ←→ Middleware (localhost:3001) ←→ SAP B1 SQL Server
```

## Support

- Health endpoint: http://localhost:3001/health
- Logs: Console output with detailed status messages
- API testing: Use provided authentication headers
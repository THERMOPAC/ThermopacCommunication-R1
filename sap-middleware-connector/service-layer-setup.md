# SAP B1 Service Layer Integration Setup

## Prerequisites

### 1. SAP B1 Service Layer Must Be Enabled
Contact your SAP IT team to ensure:
- Service Layer is enabled in SAP B1 Server Tools
- Service Layer URL is accessible: `https://your-sap-server:50000/b1s/v1`
- SSL certificates are properly configured
- Network firewall allows access to port 50000

### 2. Test Service Layer Accessibility
Before setting up middleware, test if Service Layer is working:

```bash
# Test metadata endpoint (using your system)
curl -k https://DESKTOP-NH04TP:50000/b1s/v1/$metadata
# Or using IP: curl -k https://192.168.1.100:50000/b1s/v1/$metadata

# Test login endpoint (replace with your actual credentials)
curl -k -X POST https://DESKTOP-NH04TP:50000/b1s/v1/Login \
  -H "Content-Type: application/json" \
  -d '{
    "CompanyDB": "your_actual_company_db",
    "UserName": "manager",
    "Password": "your_actual_password"
  }'
```

**Your SAP B1 10.0 FP 2208 with Microsoft SQL Server is fully compatible!**

## Installation Steps

### 1. Install Dependencies
```bash
cd C:\sap-middleware-connector
npm install --save express cors axios dotenv
```

### 2. Configure Environment
1. Copy `.env-service-layer` to `.env`
2. Update with your SAP details:
   ```
   SAP_SERVICE_LAYER_URL=https://your-sap-server:50000/b1s/v1
   SAP_USERNAME=manager
   SAP_PASSWORD=your_actual_password
   SAP_COMPANY_DB=your_company_database
   ```

### 3. Start Service Layer Middleware
```bash
node service-layer-server.js
```

### 4. Test Middleware
```bash
# Test health
curl http://localhost:3001/health

# Test SAP connection
curl -H "x-api-key: 01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e" \
  http://localhost:3001/sap/status
```

## SAP B1 Service Layer Endpoints

### Available Endpoints:
- `GET /health` - Middleware health check
- `GET /sap/status` - SAP Service Layer connection status
- `POST /connection/test` - Test Service Layer connection
- `GET /sap/purchase-orders` - Fetch purchase orders
- `GET /sap/vendors` - Fetch business partners (vendors)
- `GET /sap/items` - Fetch items
- `GET /sap/purchase-order-lines/:docEntry` - Fetch PO lines
- `POST /sync/purchase-orders` - Sync data to cloud
- `POST /sap/logout` - Logout from SAP session

### Query Parameters:
- `$top` - Number of records to return
- `$skip` - Number of records to skip
- `$filter` - OData filter expression

### Example Queries:
```bash
# Get top 50 purchase orders
curl -H "x-api-key: YOUR_API_KEY" \
  "http://localhost:3001/sap/purchase-orders?$top=50"

# Get vendors with filter
curl -H "x-api-key: YOUR_API_KEY" \
  "http://localhost:3001/sap/vendors?$filter=CardName eq 'Vendor Name'"

# Get purchase order lines
curl -H "x-api-key: YOUR_API_KEY" \
  "http://localhost:3001/sap/purchase-order-lines/123"
```

## Service Layer Advantages

### vs Direct SQL Server Access:
✅ **Official SAP API** - Supported by SAP
✅ **Business Logic** - Respects SAP validation rules
✅ **Security** - Proper authentication and authorization
✅ **OData Standard** - Modern REST API with filtering
✅ **Real-time** - Always current data
✅ **Transactions** - Proper transaction handling
✅ **Metadata** - Self-documenting API

### Service Layer Features:
- RESTful OData API
- JSON responses
- Filtering, sorting, paging
- Batch operations
- Cross-references
- Attachments support
- User permissions respect

## Troubleshooting

### Common Issues:

1. **Service Layer Not Accessible**
   - Check if Service Layer is enabled in SAP B1 Server Tools
   - Verify network connectivity to port 50000
   - Check SSL certificates

2. **Authentication Errors**
   - Verify username/password
   - Check company database name
   - Ensure user has proper permissions

3. **SSL Certificate Issues**
   - Use self-signed certificate acceptance
   - Or configure proper SSL certificates

4. **Network Connectivity**
   - Check firewall rules
   - Verify SAP server is accessible
   - Test with curl commands

### Contact SAP IT Team:
Ask them to verify:
- Service Layer is enabled and running
- URL: `https://your-sap-server:50000/b1s/v1/$metadata` is accessible
- Your user account has API access permissions
- Network configuration allows external access

## Next Steps

1. **Setup Service Layer** with your SAP IT team
2. **Test connectivity** using curl commands
3. **Configure middleware** with your SAP details
4. **Start middleware** and test endpoints
5. **Setup ngrok tunnel** for cloud connectivity
6. **Complete integration** with cloud application

The Service Layer approach is much more robust and recommended for production use!
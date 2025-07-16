# Complete SAP B1 Service Layer Deployment Guide

## System Confirmation
✅ **SAP B1 Version**: 10.0 FP 2208 (Service Layer included)
✅ **Database**: Microsoft SQL Server
✅ **Host**: DESKTOP-NH04TP
✅ **Service Layer**: Confirmed available in this version

## Deployment Steps

### Step 1: Verify Service Layer is Running
```bash
cd C:\sap-middleware-connector
node service-layer-verification.js
```

### Step 2: Configure Service Layer Middleware
1. Copy environment template:
   ```bash
   copy .env-service-layer .env
   ```

2. Edit `.env` file with your details:
   ```
   SAP_SERVICE_LAYER_URL=https://DESKTOP-NH04TP:50000/b1s/v1
   SAP_USERNAME=your_sap_username
   SAP_PASSWORD=your_sap_password
   SAP_COMPANY_DB=your_company_database
   ```

### Step 3: Install Dependencies
```bash
npm install express cors axios dotenv
```

### Step 4: Start Service Layer Middleware
```bash
node service-layer-server.js
```

### Step 5: Test Local Middleware
```bash
# Test health
curl http://localhost:3001/health

# Test SAP connection
curl -H "x-api-key: 01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e" \
  http://localhost:3001/sap/status
```

### Step 6: Setup Cloud Connectivity
Choose one option:

#### Option A: ngrok (Recommended)
```bash
# Install ngrok
# Download from https://ngrok.com/download

# Create tunnel
ngrok http 3001

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Send URL to complete cloud integration
```

#### Option B: Cloudflare Tunnel
```bash
# Install cloudflared
# Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/

# Create tunnel
cloudflared tunnel --url http://localhost:3001
```

#### Option C: LocalTunnel
```bash
# No installation required
npx localtunnel --port 3001
```

### Step 7: Complete Integration
1. Send the tunnel URL to the developer
2. Cloud application will be updated with the tunnel URL
3. Test the complete integration

## Service Layer Endpoints Available

### Core Endpoints
- `GET /sap/purchase-orders` - Purchase orders with OData filtering
- `GET /sap/vendors` - Business partners (suppliers)
- `GET /sap/items` - Item master data
- `GET /sap/purchase-order-lines/:docEntry` - Purchase order line items
- `POST /sync/purchase-orders` - Sync data to cloud

### Query Parameters
- `$top=50` - Limit results
- `$skip=0` - Skip records (pagination)
- `$filter=CardName eq 'Vendor'` - Filter results
- `$orderby=DocDate desc` - Sort results

### Authentication
All endpoints require API key header:
```
x-api-key: 01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e
```

## Integration Benefits

### Real-time Data Access
- Live Purchase Order data from SAP B1
- Real-time vendor information
- Current item master data
- Up-to-date pricing and availability

### OData API Features
- Filtering and sorting capabilities
- Pagination for large datasets
- Standard REST API responses
- JSON format for easy integration

### Security & Compliance
- Official SAP API (fully supported)
- Proper authentication and session management
- Business logic validation
- Audit trail compliance

## Troubleshooting

### Service Layer Not Running
**Symptoms**: Connection refused on port 50000
**Solution**: Enable Service Layer in SAP B1 Server Tools

### Firewall Issues
**Symptoms**: Connection timeout
**Solution**: Open port 50000 in Windows Firewall

### SSL Certificate Problems
**Symptoms**: SSL handshake errors
**Solution**: Use self-signed certificates or configure proper SSL

### Authentication Errors
**Symptoms**: 401 Unauthorized
**Solution**: Check username/password and company database name

## Next Steps After Deployment

1. **Monitor Performance**: Check middleware logs for any issues
2. **Test Integration**: Verify data flows correctly to cloud application
3. **Schedule Sync**: Set up automated data synchronization
4. **User Training**: Train team on new SAP integration features
5. **Documentation**: Update internal documentation with new processes

## Support

For issues:
1. Check middleware logs
2. Test Service Layer directly with curl
3. Verify SAP B1 service status
4. Check network connectivity
5. Contact SAP administrator if needed

Your SAP B1 10.0 FP 2208 system with Service Layer provides enterprise-grade integration capabilities!
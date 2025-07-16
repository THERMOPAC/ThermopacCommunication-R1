# SAP B1 Service Layer Availability Checklist

## Your System Information
- **SAP B1 Version**: 10.0 FP 2208 (64-bit)
- **Database**: Microsoft SQL Server
- **Host**: DESKTOP-NH04TP
- **Installation**: 0020732581
- **Licensed to**: Thermopac Boilers Pvt. Ltd.

## Service Layer Availability Test

### Step 1: Run the Test Script
```bash
cd C:\sap-middleware-connector
node test-service-layer.js
```

Or double-click: `test-service-layer.bat`

### Step 2: Expected Service Layer URLs
- `https://DESKTOP-NH04TP:50000/b1s/v1`
- `https://192.168.1.100:50000/b1s/v1`

### Step 3: What the Test Checks
✅ **Connection** - Can reach port 50000
✅ **Metadata** - Service Layer metadata endpoint
✅ **Login** - Authentication endpoint responds
✅ **Content** - Actual SAP B1 Service Layer data

## If Service Layer is NOT Available

### Contact Your SAP Administrator
Ask them to:

1. **Enable Service Layer** in SAP B1 Server Tools
   - Open SAP Business One Server Tools
   - Go to Service Layer settings
   - Enable Service Layer service
   - Set port to 50000
   - Configure SSL (can use self-signed)

2. **Check Windows Firewall**
   - Allow incoming connections on port 50000
   - Add exception for Service Layer service

3. **Verify SAP B1 Server Status**
   - Ensure SAP B1 server is running
   - Check all SAP services are started
   - Verify database connectivity

4. **Network Configuration**
   - Ensure port 50000 is not blocked by corporate firewall
   - Test local connectivity first

### Manual Test Commands
```bash
# Test metadata (replace with your actual hostname/IP)
curl -k https://DESKTOP-NH04TP:50000/b1s/v1/$metadata

# Test from localhost (run on SAP server)
curl -k https://localhost:50000/b1s/v1/$metadata

# Test login endpoint
curl -k -X POST https://DESKTOP-NH04TP:50000/b1s/v1/Login \
  -H "Content-Type: application/json" \
  -d '{"CompanyDB":"YourCompanyDB","UserName":"manager","Password":"test"}'
```

## If Service Layer IS Available

### Next Steps
1. **Note the working URL** from the test results
2. **Update middleware configuration** with the correct URL
3. **Get your actual SAP credentials** (username/password/company DB)
4. **Configure the middleware** with your settings
5. **Test the integration** with real SAP data

### Integration Benefits
- ✅ Real-time Purchase Order data
- ✅ Live vendor information
- ✅ Item master data
- ✅ Official SAP API compliance
- ✅ Proper business logic validation
- ✅ Secure authentication

## Common Issues

### Service Layer Not Enabled
- **Symptom**: Connection refused on port 50000
- **Solution**: Enable in SAP B1 Server Tools

### Firewall Blocking
- **Symptom**: Connection timeout
- **Solution**: Open port 50000 in Windows Firewall

### Wrong URL/Hostname
- **Symptom**: Host not found
- **Solution**: Use correct hostname or IP address

### SSL Certificate Issues
- **Symptom**: SSL errors
- **Solution**: Use `-k` flag in curl or configure proper certificates

Run the test script and let me know the results!
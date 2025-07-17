# Local SAP B1 Integration Testing Guide

## Overview

This guide details testing SAP B1 Service Layer integration locally on the same LAN before cloud deployment.

**IMPORTANT**: The cloud environment (Replit) cannot directly access your local network (192.168.1.100). You need to run this application locally on your PC for LAN testing.

## Current Configuration

### Local LAN Setup
- **SAP B1 Server**: 192.168.1.100:50000
- **Service Layer URL**: https://192.168.1.100:50000/b1s/v1
- **Connection Mode**: Direct LAN access
- **VPN**: Disabled (not needed for local testing)

### Authentication
- **Company Database**: THERMOPAC
- **Username**: manager
- **Password**: 4165

## Testing Workflow

### Step 1: Local Development Environment
```bash
# Clone/download the application to your local PC
# Ensure you're on the same network as SAP B1 server (192.168.1.100)

# Install dependencies
npm install

# Start the application
npm run dev
```

### Step 2: Verify Service Layer Access
The application will attempt to connect to:
```
https://192.168.1.100:50000/b1s/v1/Login
```

### Step 3: Test Integration Features
1. **Connection Test**: Use "Test SAP B1 Connection" button
2. **Data Sync**: Test "Sync SAP B1 Data" functionality
3. **Purchase Module**: Access /admin/sap-purchase for Purchase Orders
4. **Real-time Data**: Verify live SAP B1 data integration

### Step 4: Validate Core Functionality
- [ ] Login to Service Layer successful
- [ ] Purchase Orders retrieval
- [ ] Customer data sync
- [ ] Vendor information access
- [ ] Real-time data updates

## Local Testing Benefits

### Advantages
✅ **Direct Network Access** - No VPN or port forwarding needed
✅ **Fast Development** - Immediate testing without network complexity
✅ **Full Feature Testing** - Complete SAP B1 integration validation
✅ **Network Troubleshooting** - Isolate application vs network issues

### Development Workflow
1. **Local Testing** (Current) - Validate all features on LAN
2. **Integration Verification** - Confirm SAP B1 connectivity
3. **Feature Development** - Build and test new SAP integrations
4. **Cloud Migration** - Deploy with VPN for production use

## Cloud Deployment Preparation

Once local testing is complete, cloud deployment requires:

### VPN Configuration
```bash
# Environment variables for cloud deployment
SAP_VPN_ENABLED=true
VPN_CONFIG=<base64_encoded_ovpn_file>
VPN_SERVER_IP=<your_vpn_server>
VPN_AUTO_RECONNECT=true
```

### Service Layer URL (Cloud)
```bash
# Via VPN tunnel to internal IP
SAP_SERVICE_LAYER_URL=https://192.168.1.100:50000/b1s/v1
```

## Troubleshooting

### Common Issues
- **SSL Certificate**: Use `-k` flag for self-signed certificates
- **Network Access**: Ensure SAP B1 server allows connections on port 50000
- **Service Layer**: Verify Service Layer is running on SAP B1 server

### Verification Commands
```bash
# Test Service Layer accessibility from your PC
curl -k https://192.168.1.100:50000/b1s/v1/$metadata

# Test login capability
curl -k -X POST "https://192.168.1.100:50000/b1s/v1/Login" \
  -H "Content-Type: application/json" \
  -d '{"CompanyDB": "THERMOPAC", "UserName": "manager", "Password": "4165"}'
```

## Next Steps

1. **Complete Local Testing** - Validate all SAP B1 integration features
2. **Document Issues** - Note any connectivity or functionality problems
3. **Performance Testing** - Verify response times and data accuracy
4. **VPN Setup** - Prepare VPN configuration for cloud deployment
5. **Production Deployment** - Deploy to cloud with VPN connectivity

---

*Last updated: July 17, 2025*
*Testing Mode: Local LAN (192.168.1.100:50000)*
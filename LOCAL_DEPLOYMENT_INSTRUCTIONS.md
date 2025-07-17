# Local Deployment Instructions for SAP B1 Testing

## Network Connectivity Issue

**Current Situation**: The Replit cloud environment cannot access your local SAP B1 server (192.168.1.100:50000) because it's on a private network.

**Solution**: Deploy the application locally on your PC to test SAP B1 integration.

## Option 1: Local Development Setup (Recommended)

### Prerequisites
- Node.js 20+ installed on your PC
- Git installed
- Same network as SAP B1 server (192.168.1.100)

### Steps

1. **Download/Clone Application**
   ```bash
   # Option A: Download from Replit
   # Use Replit's download feature to get the complete project
   
   # Option B: If you have git access
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create `.env` file:
   ```bash
   # Database (use your existing Neon database)
   DATABASE_URL=postgresql://neondb_owner:****@***.pooler.neon.tech/neondb?sslmode=require
   
   # Google Cloud Storage
   GOOGLE_CLOUD_BUCKET=thermopac_storage
   GOOGLE_CLOUD_CREDENTIALS={"type":"service_account"...}
   
   # SAP B1 Local Configuration
   SAP_VPN_ENABLED=false
   SAP_SERVICE_LAYER_URL=https://192.168.1.100:50000/b1s/v1
   SAP_SERVER_IP=192.168.1.100
   SAP_SERVICE_LAYER_PORT=50000
   SAP_USERNAME=manager
   SAP_PASSWORD=4165
   SAP_COMPANY_DB=THERMOPAC
   
   # Email Configuration
   GMAIL_USER=your-gmail@gmail.com
   GMAIL_APP_PASSWORD=your-app-password
   ```

4. **Start Application**
   ```bash
   npm run dev
   ```
   
   Application will be available at: `http://localhost:5000`

5. **Test SAP B1 Connection**
   - Navigate to SAP B1 Integration page
   - Click "Test SAP B1 Connection"
   - Should successfully connect to local server

## Option 2: VPN Solution for Cloud Testing

If you want to test from cloud (Replit) with VPN:

### Requirements
- OpenVPN server setup on your network
- VPN configuration file (.ovpn)
- Port forwarding or VPN access to 192.168.1.100:50000

### VPN Configuration
1. Set up OpenVPN server on your network
2. Generate client certificate (.ovpn file)
3. Configure environment variables:
   ```bash
   SAP_VPN_ENABLED=true
   VPN_CONFIG=<base64_encoded_ovpn_content>
   VPN_SERVER_IP=<your_public_vpn_ip>
   VPN_AUTO_RECONNECT=true
   ```

## Option 3: Public IP with Port Forwarding

### Router Configuration
1. Configure port forwarding: External Port 50000 → 192.168.1.100:50000
2. Update environment:
   ```bash
   SAP_SERVICE_LAYER_URL=https://YOUR_PUBLIC_IP:50000/b1s/v1
   ```

## Recommended Testing Workflow

### Phase 1: Local Testing
1. **Deploy locally** (Option 1)
2. **Test all SAP B1 features** on same network
3. **Validate Purchase Orders, Customers, etc.**
4. **Ensure all integration works perfectly**

### Phase 2: Cloud Deployment
1. **Choose connectivity method** (VPN recommended)
2. **Configure cloud environment**
3. **Deploy to production**
4. **Test from cloud with secure connectivity**

## Troubleshooting

### SAP Service Layer Issues
```bash
# Test from your PC (should work)
curl -k https://192.168.1.100:50000/b1s/v1/$metadata

# Test login
curl -k -X POST "https://192.168.1.100:50000/b1s/v1/Login" \
  -H "Content-Type: application/json" \
  -d '{"CompanyDB": "THERMOPAC", "UserName": "manager", "Password": "4165"}'
```

### Common Issues
- **Port 50000 blocked**: Check Windows Firewall on SAP server
- **Service Layer not running**: Start Service Layer on SAP B1 server
- **SSL certificate issues**: Use `-k` flag for self-signed certificates

## Next Steps

1. **Choose Option 1** for immediate local testing
2. **Download complete project** from Replit
3. **Set up local environment** on your PC
4. **Test SAP B1 connectivity** locally
5. **Plan cloud deployment** with VPN/port forwarding

---

*This approach ensures full SAP B1 integration testing before cloud deployment.*
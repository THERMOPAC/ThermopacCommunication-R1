# SAP B1 Service Layer Public IP Setup Guide

## Network Architecture Overview
This guide configures your SAP B1 Service Layer for public internet access using port forwarding, enabling direct cloud-to-on-premise connectivity.

## Prerequisites
- SAP Business One 10.0 FP 2208 with Service Layer enabled
- Router/Firewall with port forwarding capabilities
- Static public IP address (recommended) or dynamic DNS service
- Network administrator access

## Step 1: Configure Router Port Forwarding

### Router Configuration
1. **Access Router Admin Panel**
   - Open web browser and navigate to your router's IP (typically 192.168.1.1)
   - Login with administrator credentials

2. **Create Port Forwarding Rule**
   - Navigate to "Port Forwarding" or "Virtual Server" section
   - Add new rule with following settings:
     ```
     Service Name: SAP-B1-Service-Layer
     External Port: 50000
     Internal IP: 192.168.1.100
     Internal Port: 50000
     Protocol: TCP
     Status: Enabled
     ```

3. **Save and Apply Configuration**
   - Save the port forwarding rule
   - Restart router if required

## Step 2: Firewall Configuration

### Windows Firewall (on SAP server)
1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Create new "Inbound Rule":
   ```
   Rule Type: Port
   Protocol: TCP
   Port: 50000
   Action: Allow the connection
   Profile: All profiles
   Name: SAP B1 Service Layer
   ```

### Router Firewall
1. Navigate to firewall settings in router
2. Ensure port 50000 is allowed for inbound connections
3. Consider restricting access to specific IP ranges if needed

## Step 3: Obtain Public IP Address

### Option A: Static Public IP (Recommended)
- Contact your ISP to obtain a static public IP
- Note the assigned IP address for configuration

### Option B: Dynamic DNS Service
- Sign up for dynamic DNS service (DynDNS, No-IP, etc.)
- Configure router to update DNS automatically
- Use the provided hostname instead of IP

## Step 4: Update Service Layer URL

### Get Your Public IP
1. Visit whatismyipaddress.com from your network
2. Note the public IP address displayed

### Update Application Configuration
Replace the current Service Layer URL with your public IP:
```
Current: https://192.168.1.100:50000/b1s/v1/
New: https://[YOUR_PUBLIC_IP]:50000/b1s/v1/
```

## Step 5: Security Considerations

### SSL Certificate (Recommended)
1. Obtain SSL certificate for your domain/IP
2. Configure Service Layer to use HTTPS
3. Update URL to use https:// instead of http://

### Access Control
1. Configure router to restrict access by IP range if possible
2. Consider VPN access for additional security
3. Monitor access logs regularly

### Firewall Rules
1. Limit access to port 50000 only
2. Block unnecessary ports from public access
3. Enable logging for security monitoring

## Step 6: Test Connectivity

### Internal Test (from SAP server)
```bash
curl -X POST https://localhost:50000/b1s/v1/Login \
  -H "Content-Type: application/json" \
  -d '{"CompanyDB":"[DB_NAME]","UserName":"manager","Password":"4165"}'
```

### External Test (from internet)
```bash
curl -X POST https://[YOUR_PUBLIC_IP]:50000/b1s/v1/Login \
  -H "Content-Type: application/json" \
  -d '{"CompanyDB":"[DB_NAME]","UserName":"manager","Password":"4165"}'
```

## Step 7: Update Application Secrets

Once port forwarding is configured and tested:
1. Update SAP_SERVICE_LAYER_URL secret with your public IP
2. Test connection from the application
3. Verify data synchronization

## Troubleshooting

### Connection Timeout
- Verify port forwarding rule is active
- Check firewall settings on both router and server
- Confirm SAP Service Layer is running on port 50000

### SSL/TLS Errors
- Ensure certificate is properly configured
- Check if Service Layer supports HTTPS
- Try HTTP connection first for testing

### Authentication Errors
- Verify SAP credentials are correct
- Check Service Layer user permissions
- Confirm Company Database name

## Network Diagram

```
Internet ──→ Router:50000 ──→ SAP Server:192.168.1.100:50000
           (Port Forward)     (Service Layer)

Cloud App ──→ Public IP:50000 ──→ SAP B1 Service Layer
```

## Security Best Practices

1. **Change Default Ports**: Consider using non-standard external port
2. **IP Whitelisting**: Restrict access to known IP ranges
3. **Regular Updates**: Keep SAP B1 and Service Layer updated
4. **Monitor Access**: Review connection logs regularly
5. **Backup Configuration**: Document all network changes

## Support Information

- **Service Layer Documentation**: SAP Business One Service Layer Guide
- **Network Configuration**: Contact your network administrator
- **SAP Support**: Use SAP Support Portal for Service Layer issues

---

**Next Steps**: After completing router configuration, provide your public IP address to update the application's Service Layer URL.
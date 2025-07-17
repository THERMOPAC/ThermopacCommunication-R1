# VPN Server Routing Configuration for SAP B1 Access

## Network Architecture
- **VPN Server**: 59.152.52.58 (Public IP)
- **SAP B1 Server**: 192.168.1.100 (Private subnet)
- **Cloud Application**: Connects via VPN tunnel to access SAP B1

## Required Routing Configuration

### Option 1: Static Route (Recommended)
Add this route to your VPN server (59.152.52.58):
```bash
# Add route to forward traffic to 192.168.1.0/24 subnet
ip route add 192.168.1.0/24 via <GATEWAY_IP>
```

Replace `<GATEWAY_IP>` with:
- The IP address of your local router/gateway that can reach 192.168.1.100
- Usually something like 192.168.1.1 or 192.168.0.1

### Option 2: IP Forwarding + NAT
If your VPN server is on the same network as the SAP B1 server:
```bash
# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward

# Add NAT rule to forward traffic
iptables -t nat -A POSTROUTING -d 192.168.1.0/24 -j MASQUERADE
iptables -A FORWARD -d 192.168.1.0/24 -j ACCEPT
```

### Option 3: VPN Server Configuration (for PPTP/L2TP)
In your VPN server configuration file, add:
```
# For PPTP in /etc/ppp/options.pptpd
proxyarp
ms-dns 8.8.8.8
ms-dns 8.8.4.4

# Add route in /etc/ppp/ip-up.d/route-setup
#!/bin/bash
/sbin/route add -net 192.168.1.0 netmask 255.255.255.0 gw $4
```

## Verification Steps
After configuring the routing:

1. **Test connectivity from VPN server to SAP B1**:
   ```bash
   ping 192.168.1.100
   telnet 192.168.1.100 50000
   telnet 192.168.1.100 1433
   ```

2. **Check routing table**:
   ```bash
   ip route show
   # Should show: 192.168.1.0/24 via <gateway> dev <interface>
   ```

3. **Test from our cloud application**:
   - Simply click "Test SAP B1 Connection" button
   - System will automatically retry connection through VPN tunnel

## Expected Results
Once routing is configured:
- VPN tunnel: 59.152.52.58 ✅ (Already working)
- SAP B1 Service Layer: 192.168.1.100:50000 ✅ (Will work after routing)
- SAP B1 SQL Server: 192.168.1.100:1433 ✅ (Will work after routing)

## Troubleshooting
If connection still fails after routing configuration:
1. Check SAP B1 server firewall allows ports 50000 and 1433
2. Verify Service Layer is running on SAP B1 server
3. Test local connectivity from SAP B1 server itself
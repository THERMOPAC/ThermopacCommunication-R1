# SAP B1 Middleware Connector

This middleware connector bridges your on-premise SAP Business One SQL Server database with the Replit cloud application for secure, real-time data synchronization.

## 🏗️ Architecture Overview

```
[SAP B1 SQL Server] ←→ [Middleware Connector] ←→ [Replit Cloud App]
    (Local Network)        (Office PC/Server)      (Internet)
```

## 📋 Prerequisites

### System Requirements
- **Node.js 16+** installed on office PC/server
- **Network access** to SAP B1 SQL Server
- **Internet connectivity** for Replit synchronization
- **Windows/Linux** machine on same network as SAP B1

### SAP B1 Requirements
- **SQL Server Authentication** enabled
- **Database user access** to SAP B1 tables (OPOR, POR1, OCRD, etc.)
- **Network connectivity** between middleware and SQL Server

## 🚀 Quick Start

### 1. Download & Setup

```bash
# Download/extract middleware connector files to office PC
# Navigate to the connector directory
cd sap-middleware-connector

# Install dependencies
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your specific settings
nano .env  # or notepad .env on Windows
```

### 3. Environment Configuration

Edit `.env` file with your actual values:

```env
# SAP B1 Database Configuration
SAP_SERVER=192.168.1.100          # Your SAP B1 SQL Server IP
SAP_DATABASE=TPEL_LIVE             # Your SAP B1 database name
SAP_USERNAME=sa                    # SQL Server username
SAP_PASSWORD=sa@2019               # SQL Server password
SAP_PORT=1433                      # SQL Server port (usually 1433)

# Replit Cloud Application
REPLIT_APP_URL=https://thermopac-communication-thermopacllp.replit.app
REPLIT_API_KEY=your_generated_api_key_here

# Middleware Service
MIDDLEWARE_PORT=3001               # Local port for middleware
SYNC_INTERVAL_MINUTES=15           # Auto-sync frequency
LOG_LEVEL=info                     # Logging level (debug/info/warn/error)

# Security
API_SECRET_KEY=your_secure_secret_key_here
```

### 4. Generate API Keys

```bash
# Generate secure API keys for authentication
npm run generate-keys
```

This will create secure API keys and display them. **Copy these keys** to:
- Add `REPLIT_API_KEY` to your `.env` file
- Provide the middleware API key to your Replit application

### 5. Test Connections

```bash
# Test SAP B1 database connection
npm run test

# Test Replit cloud connection
npm run test-replit
```

### 6. Start Middleware Service

```bash
# Production mode
npm start

# Development mode (with auto-restart)
npm run dev
```

## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start middleware in production mode |
| `npm run dev` | Start with auto-restart (development) |
| `npm run test` | Test SAP B1 database connection |
| `npm run test-replit` | Test Replit cloud connection |
| `npm run generate-keys` | Generate secure API keys |
| `npm run sync-now` | Force immediate data synchronization |

## 📊 Monitoring & Logs

### Real-time Monitoring
- Middleware runs on `http://localhost:3001`
- Health check: `http://localhost:3001/health`
- Status dashboard: `http://localhost:3001/status`

### Log Files
- **Console logs**: Real-time operation status
- **Error logs**: Detailed error information
- **Sync logs**: Data synchronization reports

### Key Metrics
- **Connection status**: SAP B1 ↔ Middleware ↔ Replit
- **Sync frequency**: Every 15 minutes (configurable)
- **Data freshness**: Last successful sync timestamp
- **Error tracking**: Failed operations and recovery

## 🔒 Security Features

### Authentication
- **API Key Authentication**: Secure cloud-to-local communication
- **IP Whitelisting**: Restrict access to known sources
- **Request Validation**: Comprehensive input validation

### Data Protection
- **Encrypted transmission**: HTTPS for all cloud communication
- **Local network only**: SAP data never exposed to internet
- **Secure credentials**: Environment-based configuration

### Access Control
- **Read-only access**: Middleware only reads SAP data
- **Selective sync**: Only configured tables synchronized
- **Audit logging**: Complete operation tracking

## 📈 Data Synchronization

### Synchronized Tables
- **Purchase Orders** (OPOR table)
- **Purchase Order Items** (POR1 table)
- **Vendors/Suppliers** (OCRD table)
- **Purchase Requisitions** (OPRQ table)
- **Additional tables** as configured

### Sync Process
1. **Scheduled sync** every 15 minutes
2. **Delta detection** for changed records
3. **Batch processing** for efficiency
4. **Error recovery** with retry logic
5. **Status reporting** to cloud dashboard

### Data Mapping
- **SAP fields** → **Replit database fields**
- **Type conversion** (SAP → PostgreSQL)
- **Date/time normalization** (UTC conversion)
- **Currency handling** (multi-currency support)

## 🛠️ Troubleshooting

### Common Issues

#### 1. Cannot Connect to SAP B1
```bash
# Check network connectivity
ping [SAP_SERVER_IP]

# Verify SQL Server is accessible
telnet [SAP_SERVER_IP] 1433

# Test credentials
npm run test
```

#### 2. Replit Connection Failed
```bash
# Check internet connectivity
ping google.com

# Verify API key
npm run test-replit

# Check firewall settings
```

#### 3. Service Won't Start
```bash
# Check port availability
netstat -an | grep 3001

# Verify environment file
cat .env

# Check dependencies
npm install
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `SAP_CONN_FAILED` | SAP database unreachable | Check network/credentials |
| `REPLIT_AUTH_FAILED` | Invalid API key | Regenerate keys |
| `SYNC_ERROR` | Data synchronization failed | Check logs for details |
| `PORT_IN_USE` | Middleware port occupied | Change MIDDLEWARE_PORT |

## 🔄 Maintenance

### Regular Tasks
- **Monitor logs** for errors
- **Check sync status** daily
- **Update API keys** quarterly
- **Backup configuration** files

### Updates
```bash
# Update dependencies
npm update

# Check for security updates
npm audit

# Restart service after updates
npm start
```

### Performance Optimization
- **Adjust sync frequency** based on data volume
- **Monitor network usage** during peak hours
- **Optimize query performance** if needed
- **Scale horizontally** for high-volume scenarios

## 📞 Support

### Contact Information
- **Technical Issues**: IT Support Team
- **SAP Configuration**: SAP Administrator
- **Replit Issues**: Cloud Team

### Documentation
- **SAP B1 API**: SAP Business One SDK documentation
- **SQL Server**: Microsoft SQL Server documentation
- **Node.js**: Official Node.js documentation

## 🎯 Next Steps

After successful deployment:

1. **Verify data flow** in Replit dashboard
2. **Configure sync schedules** as needed
3. **Set up monitoring alerts** for critical errors
4. **Train users** on new SAP integration features
5. **Plan for production deployment** and scaling

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Current | Initial release with Purchase module integration |

---

**✅ Middleware Connector Ready for Deployment**

Your SAP B1 middleware connector is now complete and ready for deployment on your office network.
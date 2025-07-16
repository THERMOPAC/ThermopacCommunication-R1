# SAP B1 Integration - ngrok Setup Instructions

## Quick Setup with ngrok

### 1. Install ngrok
**Option A: Download from website**
1. Go to https://ngrok.com/download
2. Download Windows version
3. Extract to a folder (e.g., `C:\ngrok\`)
4. Add to PATH or run from the folder

**Option B: Using Chocolatey (if available)**
```bash
choco install ngrok
```

### 2. Start Your Middleware
Ensure your middleware is running:
```bash
cd C:\sap-middleware-connector
node server.js
```

You should see: "✅ SAP Middleware Connector is running on port 3001"

### 3. Start ngrok Tunnel
Open a new command prompt and run:
```bash
ngrok http 3001
```

You'll see output like:
```
ngrok                                                                                                                                           

Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok.io -> http://localhost:3001
```

### 4. Copy the HTTPS URL
Copy the https URL (e.g., `https://abc123.ngrok.io`)

### 5. Update Cloud Application
Send me the ngrok URL and I'll update the cloud application to use it.

## Testing the Connection

### 1. Test ngrok tunnel
Open browser and visit: `https://your-ngrok-url.ngrok.io/health`
You should see: `{"status":"OK","timestamp":"...","message":"SAP Middleware is running"}`

### 2. Test with API key
Test the protected endpoint:
```bash
curl -H "x-api-key: 01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e" https://your-ngrok-url.ngrok.io/sap/status
```

### 3. Test from Cloud App
Once I update the cloud app, go to:
- Navigate to "SAP B1 Integration" in the sidebar
- Click "Test Connection"
- Should show "Connected" status

## Alternative: LocalTunnel (No signup required)

### 1. Install and run
```bash
npx localtunnel --port 3001
```

### 2. Copy the URL
You'll get a URL like: `https://strange-words-12345.loca.lt`

### 3. Update cloud app
Send me this URL and I'll configure the cloud application.

## Security Notes
- ngrok URLs are public but protected by API keys
- For production, consider paid ngrok plan with custom domains
- Monitor ngrok web interface at http://127.0.0.1:4040
- Keep your API keys secure

## Troubleshooting
- **Port already in use**: Stop other services on port 3001
- **ngrok not found**: Check PATH or run from ngrok folder
- **Connection refused**: Ensure middleware is running first
- **API key error**: Verify middleware is using correct key

Once you have ngrok running, send me the URL and I'll complete the integration!
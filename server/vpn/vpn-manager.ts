import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface VPNStatus {
  connected: boolean;
  connectionTime?: Date;
  lastError?: string;
  serverIP?: string;
  assignedIP?: string;
}

export class VPNManager {
  private vpnProcess: ChildProcess | null = null;
  private isConnected = false;
  private connectionTime?: Date;
  private lastError?: string;
  private serverIP?: string;
  private assignedIP?: string;
  private configPath?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.setupSignalHandlers();
  }

  async initialize(): Promise<boolean> {
    try {
      const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
      if (!vpnEnabled) {
        console.log('ℹ️ VPN disabled - using direct SAP connection');
        return true;
      }

      console.log('🔐 Initializing VPN connection manager...');
      
      // Prepare VPN configuration
      await this.prepareVPNConfig();
      
      // Attempt initial connection
      const connected = await this.connect();
      if (connected) {
        console.log('✅ VPN connection manager initialized successfully');
        this.setupHealthCheck();
        return true;
      } else {
        console.error('❌ Failed to establish initial VPN connection');
        return false;
      }
    } catch (error) {
      console.error('❌ VPN manager initialization failed:', error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      return false;
    }
  }

  private async prepareVPNConfig(): Promise<void> {
    const vpnConfig = process.env.VPN_CONFIG;
    if (!vpnConfig) {
      throw new Error('VPN_CONFIG environment variable not set');
    }

    // Create temp directory for VPN config
    const tempDir = '/tmp/vpn';
    await fs.mkdir(tempDir, { recursive: true });
    
    this.configPath = join(tempDir, 'thermopac-vpn.ovpn');
    
    // Decode base64 config if needed
    let configContent: string;
    try {
      configContent = Buffer.from(vpnConfig, 'base64').toString('utf-8');
    } catch {
      // If not base64, use as-is
      configContent = vpnConfig;
    }
    
    await fs.writeFile(this.configPath, configContent, { mode: 0o600 });
    console.log('📋 VPN configuration prepared');
  }

  async connect(): Promise<boolean> {
    if (this.isConnected) {
      console.log('ℹ️ VPN already connected');
      return true;
    }

    if (!this.configPath) {
      throw new Error('VPN configuration not prepared');
    }

    try {
      console.log('🔄 Establishing VPN connection...');
      
      // Start OpenVPN process
      this.vpnProcess = spawn('openvpn', [
        '--config', this.configPath,
        '--script-security', '2',
        '--up', '/etc/openvpn/update-resolv-conf',
        '--down', '/etc/openvpn/update-resolv-conf',
        '--verb', '3'
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle process output
      this.vpnProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`VPN: ${output.trim()}`);
        this.parseVPNOutput(output);
      });

      this.vpnProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        console.error(`VPN Error: ${error.trim()}`);
        this.lastError = error.trim();
      });

      this.vpnProcess.on('exit', (code, signal) => {
        console.log(`VPN process exited with code ${code}, signal ${signal}`);
        this.handleDisconnection();
      });

      // Wait for connection establishment
      const connected = await this.waitForConnection();
      if (connected) {
        this.isConnected = true;
        this.connectionTime = new Date();
        this.reconnectAttempts = 0;
        console.log('✅ VPN connection established successfully');
        return true;
      } else {
        this.lastError = 'Connection timeout';
        await this.disconnect();
        return false;
      }
    } catch (error) {
      console.error('❌ VPN connection failed:', error);
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      await this.disconnect();
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.vpnProcess) {
      console.log('🔄 Disconnecting VPN...');
      this.vpnProcess.kill('SIGTERM');
      
      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (this.vpnProcess && !this.vpnProcess.killed) {
        this.vpnProcess.kill('SIGKILL');
      }
      
      this.vpnProcess = null;
    }
    
    this.isConnected = false;
    this.connectionTime = undefined;
    this.assignedIP = undefined;
    console.log('✅ VPN disconnected');
  }

  getStatus(): VPNStatus {
    return {
      connected: this.isConnected,
      connectionTime: this.connectionTime,
      lastError: this.lastError,
      serverIP: this.serverIP,
      assignedIP: this.assignedIP
    };
  }

  async testConnectivity(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const sapServerIP = process.env.SAP_SERVER_IP || '192.168.1.100';
      const sapPort = process.env.SAP_SERVICE_LAYER_PORT || '50000';
      
      // Test basic connectivity to SAP server
      const response = await fetch(`http://${sapServerIP}:${sapPort}`, {
        signal: AbortSignal.timeout(5000)
      });
      
      return response.ok || response.status < 500;
    } catch (error) {
      console.warn('VPN connectivity test failed:', error);
      return false;
    }
  }

  private async waitForConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('⚠️ VPN connection timeout');
        resolve(false);
      }, 60000); // 60 second timeout

      const checkConnection = setInterval(async () => {
        if (this.isConnected) {
          const canReachSAP = await this.testConnectivity();
          if (canReachSAP) {
            clearInterval(checkConnection);
            clearTimeout(timeout);
            resolve(true);
          }
        }
      }, 2000);
    });
  }

  private parseVPNOutput(output: string): void {
    // Parse VPN output for connection status
    if (output.includes('Initialization Sequence Completed')) {
      console.log('🔗 VPN tunnel established');
    }
    
    if (output.includes('ifconfig')) {
      const ipMatch = output.match(/ifconfig\s+\S+\s+(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        this.assignedIP = ipMatch[1];
        console.log(`📱 VPN assigned IP: ${this.assignedIP}`);
      }
    }
    
    if (output.includes('remote ')) {
      const serverMatch = output.match(/remote\s+(\d+\.\d+\.\d+\.\d+)/);
      if (serverMatch) {
        this.serverIP = serverMatch[1];
      }
    }
  }

  private handleDisconnection(): void {
    if (this.isConnected) {
      console.warn('⚠️ VPN connection lost unexpectedly');
      this.isConnected = false;
      this.connectionTime = undefined;
      this.assignedIP = undefined;
      
      // Attempt automatic reconnection
      if (process.env.VPN_AUTO_RECONNECT === 'true' && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`🔄 Attempting VPN reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => {
          this.connect().catch(error => {
            console.error('❌ VPN reconnection failed:', error);
          });
        }, 5000 * this.reconnectAttempts); // Exponential backoff
      }
    }
  }

  private setupHealthCheck(): void {
    // Periodic health check every 2 minutes
    setInterval(async () => {
      if (this.isConnected) {
        const healthy = await this.testConnectivity();
        if (!healthy) {
          console.warn('⚠️ VPN connection unhealthy, attempting reconnection...');
          await this.disconnect();
          setTimeout(() => this.connect(), 5000);
        }
      }
    }, 120000);
  }

  private setupSignalHandlers(): void {
    // Graceful shutdown on process termination
    process.on('SIGTERM', async () => {
      console.log('📡 Received SIGTERM, disconnecting VPN...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('📡 Received SIGINT, disconnecting VPN...');
      await this.disconnect();
      process.exit(0);
    });
  }

  async getConnectionLogs(): Promise<string[]> {
    // Return recent VPN connection logs
    try {
      const logFile = '/var/log/openvpn/openvpn.log';
      const logs = await fs.readFile(logFile, 'utf-8');
      return logs.split('\n').slice(-50); // Last 50 lines
    } catch (error) {
      return [`Log retrieval failed: ${error}`];
    }
  }
}

// Export singleton instance
export const vpnManager = new VPNManager();
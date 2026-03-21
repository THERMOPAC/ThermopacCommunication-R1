import https from 'https';

interface SapRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  path?: string;
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  rawBody?: Buffer;
}

interface SapResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ok: boolean;
}

/**
 * Custom HTTPS client for SAP B1 Service Layer with SSL bypass
 * This handles self-signed certificates common in on-premise SAP environments
 */
export class SapHttpsClient {
  private baseHost: string;
  private basePort: number;
  private agent: https.Agent;

  constructor(host: string = '59.152.52.58', port: number = 50000) {
    this.baseHost = host;
    this.basePort = port;
    
    // Create HTTPS agent with SSL certificate bypass
    this.agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      timeout: 300000, // Increased timeout to 5 minutes for slow SAP responses
      maxSockets: 10,
      maxFreeSockets: 10
    });
  }

  async request(options: SapRequestOptions): Promise<SapResponse> {
    return new Promise((resolve, reject) => {
      // Parse URL to get path
      const url = new URL(options.url || `https://${this.baseHost}:${this.basePort}${options.path}`);
      
      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || this.basePort,
        path: url.pathname + url.search,
        method: options.method,
        agent: this.agent,
        timeout: options.timeout || 300000, // Default 5 minutes timeout
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      if (options.rawBody) {
        requestOptions.headers!['Content-Length'] = options.rawBody.length;
      } else if (options.body && typeof options.body === 'object') {
        const bodyStr = JSON.stringify(options.body);
        requestOptions.headers!['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const response: SapResponse = {
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string>,
            body: data,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300
          };
          resolve(response);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.rawBody) {
        req.write(options.rawBody);
      } else if (options.body) {
        if (typeof options.body === 'string') {
          req.write(options.body);
        } else {
          req.write(JSON.stringify(options.body));
        }
      }

      req.end();
    });
  }

  async login(username: string, password: string, companyDb: string): Promise<{ sessionId: string; response: SapResponse }> {
    const loginData = {
      CompanyDB: companyDb,
      UserName: username,
      Password: password
    };

    const response = await this.request({
      method: 'POST',
      path: '/b1s/v1/Login',
      body: loginData
    });

    if (!response.ok) {
      throw new Error(`SAP login failed: ${response.statusCode} - ${response.body}`);
    }

    // Extract session ID from Set-Cookie header
    const setCookieHeader = response.headers['set-cookie'];
    let sessionId = '';
    
    if (setCookieHeader) {
      const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookie of cookieArray) {
        const match = cookie.match(/B1SESSION=([^;]+)/);
        if (match) {
          sessionId = match[1];
          break;
        }
      }
    }

    if (!sessionId) {
      throw new Error('No session ID received from SAP Service Layer');
    }

    return { sessionId, response };
  }

  async authenticatedRequest(sessionId: string, options: SapRequestOptions): Promise<SapResponse> {
    const headers = {
      'Cookie': `B1SESSION=${sessionId}`,
      ...options.headers
    };

    return this.request({
      ...options,
      headers
    });
  }

  destroy() {
    this.agent.destroy();
  }
}

// Create singleton instance
export const sapHttpsClient = new SapHttpsClient();
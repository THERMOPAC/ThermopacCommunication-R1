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

  async login(username: string, password: string, companyDb: string): Promise<{ sessionId: string; sessionCookie: string; response: SapResponse }> {
    // ─── Runtime Governance Guard ─────────────────────────────────────────────
    // sapHttpsClient.login() is RESTRICTED. Authorized callers:
    //   1. sap-central-session.ts  — system session singleton (_doLogin / testCredentials)
    //   2. sap-routes.ts           — diagnostic routes ONLY (user-supplied creds, no persistence)
    // Any other caller creates a competing B1SESSION and WILL cause -1102 conflicts.
    // Ref: SAP Session Unification Migration Plan v1.2, Section 12 — Control E.
    const stack = new Error().stack || '';
    const isAuthorized =
      // dev / tsx mode — stack shows the source file path
      stack.includes('sap-central-session') ||
      // compiled bundle (dist/index.js) — class name is preserved in stack traces
      // All legitimate callers are methods on SapCentralSession (_doLogin / _doTestCredentials)
      stack.includes('SapCentralSession');
    if (!isAuthorized) {
      const callerLine = (stack.split('\n')[2] || stack.split('\n')[1] || '').trim();
      const msg = `[SAP GOVERNANCE VIOLATION] unauthorized sapHttpsClient.login() caller detected. ` +
        `This call creates a competing B1SESSION and will cause -1102 conflicts. Caller: ${callerLine}`;
      console.error(msg);
      // Always throw — in v3.0 only SapCentralSession methods are authorised.
      // If this fires it is a genuine out-of-band login call that must be blocked.
      throw new Error(msg);
    }
    // ─────────────────────────────────────────────────────────────────────────

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

    // SAP B1 sets multiple cookies: B1SESSION, CompanyDB, UserName (and sometimes RouteId).
    // ALL of them must be forwarded in every authenticated request — sending only B1SESSION
    // causes -1102 "Switch company" errors because SAP cannot resolve the company context.
    const setCookieHeader = response.headers['set-cookie'];
    let sessionId = '';
    const cookieParts: string[] = [];

    if (setCookieHeader) {
      const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookie of cookieArray) {
        // Each Set-Cookie entry: "NAME=value; Path=/; ..."  — take only the first NAME=value part
        const nameValue = cookie.split(';')[0].trim();
        if (nameValue) cookieParts.push(nameValue);
        const match = cookie.match(/B1SESSION=([^;]+)/);
        if (match) sessionId = match[1];
      }
    }

    if (!sessionId) {
      throw new Error('No session ID received from SAP Service Layer');
    }

    // Full cookie string to send verbatim in Cookie: header
    const sessionCookie = cookieParts.join('; ');

    return { sessionId, sessionCookie, response };
  }

  /**
   * Make an authenticated SAP B1 request.
   * Pass the full `sessionCookie` string returned by `login()` — it includes
   * B1SESSION, CompanyDB, UserName and any other SAP session cookies.
   */
  async authenticatedRequest(sessionCookie: string, options: SapRequestOptions): Promise<SapResponse> {
    const headers = {
      'Cookie': sessionCookie,
      ...options.headers
    };

    return this.request({
      ...options,
      headers
    });
  }

  /**
   * Logout from SAP B1 Service Layer.
   * Non-fatal but ALWAYS logs failures — a failed logout leaves a live SAP session
   * which causes the next login to get -1102. Visible warnings are essential for
   * diagnosing persistent -1102 in production.
   */
  async logout(sessionCookie: string): Promise<void> {
    try {
      const resp = await this.authenticatedRequest(sessionCookie, {
        method: 'POST',
        url: '',
        path: '/b1s/v1/Logout',
      });
      if (!resp.ok) {
        console.warn(`[SapHttpsClient] logout returned non-OK status ${resp.statusCode} — SAP session may still be alive: ${resp.body?.substring(0, 200)}`);
      }
    } catch (err: any) {
      // Non-fatal but must be logged — if logout silently fails, the SAP session
      // stays alive and the next login attempt will get -1102.
      console.warn(`[SapHttpsClient] logout exception (non-fatal, but SAP session may persist): ${err.message}`);
    }
  }

  destroy() {
    this.agent.destroy();
  }
}

// Create singleton instance
export const sapHttpsClient = new SapHttpsClient();
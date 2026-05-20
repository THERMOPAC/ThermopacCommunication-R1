import { Router } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { sapSession } from './sap-central-session';

const router = Router();

// ─── Credential Test ─────────────────────────────────────────────────────────
// Tests user-supplied credentials without touching the system session.
// Login/logout is handled inside sapSession.testCredentials().
router.post('/connection/test', ensureAuthenticated, async (req, res) => {
  try {
    const { username, password, companyDb } = req.body;

    if (!username || !password || !companyDb) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and company database are required',
      });
    }

    console.log(`[SAP CredTest] Testing credentials → user=${username} db=${companyDb}`);
    const result = await sapSession.testCredentials(username, password, companyDb);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Connection test failed',
        details: { message: 'Login failed or API access denied', response: result.error },
      });
    }

    console.log('[SAP CredTest] ✅ Credentials valid');
    res.json({
      success: true,
      message: 'SAP connection test successful',
      status: 'connected',
      testedAt: new Date().toISOString(),
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb,
        username,
      },
    });
  } catch (error: any) {
    console.error('❌ SAP connection test error:', error);
    res.status(500).json({ success: false, error: 'Connection test failed', details: error.message });
  }
});

// ─── Save Credentials ─────────────────────────────────────────────────────────
router.post('/credentials', ensureAuthenticated, async (req, res) => {
  try {
    const { username, password, companyDb } = req.body;

    if (!username || !password || !companyDb) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and company database are required',
      });
    }

    process.env.SAP_B1_USERNAME   = username;
    process.env.SAP_B1_PASSWORD   = password;
    process.env.SAP_COMPANY_DB = companyDb;

    // Invalidate the system session so the next request re-logins with new creds
    await sapSession.invalidate();

    console.log(`[SAP Credentials] Updated → companyDb=${companyDb}`);
    res.json({ success: true, message: 'SAP credentials saved successfully', savedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('❌ Error saving SAP credentials:', error);
    res.status(500).json({ success: false, error: 'Failed to save credentials', details: error.message });
  }
});

// ─── Passive Connection Status ────────────────────────────────────────────────
// Called every 30 seconds by the SapIntegrationPage polling query.
// No login, no SAP session created. Reports system session health.
router.get('/connection/status', async (req, res) => {
  try {
    const sapUser = process.env.SAP_B1_USERNAME || '';
    const sapPass = process.env.SAP_B1_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.json({
        success: true,
        status: 'disconnected',
        isConnected: false,
        error: `SAP credentials not configured — SAP_USERNAME=${!!sapUser}, SAP_PASSWORD=${!!sapPass}, SAP_COMPANY_DB=${sapDb || '(empty)'}`,
        details: { companyDb: sapDb, username: sapUser },
      });
    }

    const health = sapSession.getHealth();

    res.json({
      success: true,
      status: health.alive ? 'connected' : 'configured',
      isConnected: health.alive,
      credentialsConfigured: true,
      activeSessions: health.alive ? 1 : 0,
      systemSession: {
        alive: health.alive,
        ttlSeconds: health.ttlSeconds,
        expiresAt: health.expiresAt,
        loginInProgress: health.loginInProgress,
      },
      lastTestTime: new Date().toISOString(),
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb: sapDb,
        username: sapUser,
      },
    });
  } catch (error: any) {
    console.error('❌ SAP status check error:', error);
    res.json({
      success: true,
      status: 'error',
      isConnected: false,
      error: error.message,
      lastTestTime: new Date().toISOString(),
    });
  }
});

// ─── Active Connection Ping ───────────────────────────────────────────────────
// Used by the "Test SAP B1 Connection" button.
// Reuses / creates the system session — no orphaned sessions.
router.post('/connection/ping', ensureAuthenticated, async (req, res) => {
  try {
    const sapUser = process.env.SAP_B1_USERNAME || '';
    const sapPass = process.env.SAP_B1_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.json({
        success: false,
        status: 'disconnected',
        isConnected: false,
        error: `SAP credentials not configured — SAP_USERNAME=${!!sapUser}, SAP_PASSWORD=${!!sapPass}, SAP_COMPANY_DB=${sapDb || '(empty)'}`,
      });
    }

    console.log(`[SAP Ping] Testing system session → user=${sapUser} db=${sapDb}`);
    let isConnected = false;
    let connectionError: string | undefined;

    try {
      const testResp = await sapSession.request({
        method: 'GET', path: '/b1s/v1/$metadata', timeout: 15000,
      });
      isConnected = testResp.statusCode < 500;
      console.log(`[SAP Ping] ✅ Connection OK — status=${testResp.statusCode}`);
    } catch (err: any) {
      connectionError = err.message;
      console.error(`[SAP Ping] ❌ Connection failed: ${err.message}`);
    }

    res.json({
      success: isConnected,
      status: isConnected ? 'connected' : 'disconnected',
      isConnected,
      lastTestTime: new Date().toISOString(),
      error: connectionError,
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb: sapDb,
        username: sapUser,
      },
    });
  } catch (error: any) {
    console.error('❌ SAP ping error:', error);
    res.json({
      success: false,
      status: 'error',
      isConnected: false,
      error: error.message,
      lastTestTime: new Date().toISOString(),
    });
  }
});

// ─── System Session Health ────────────────────────────────────────────────────
// GET /api/sap/session/health
// Returns live health of the ONE system SAP session.
router.get('/session/health', ensureAuthenticated, async (req, res) => {
  try {
    const health = sapSession.getHealth();
    const credentialsConfigured = !!(
      process.env.SAP_B1_USERNAME &&
      process.env.SAP_B1_PASSWORD &&
      process.env.SAP_COMPANY_DB
    );

    res.json({
      success: true,
      credentialsConfigured,
      systemSession: health,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Clear System Session ─────────────────────────────────────────────────────
// POST /api/sap/session/clear
// Invalidates the system SAP session (logs out from SAP, clears memory + disk).
// Use to manually recover from -1102 or a stuck session.
router.post('/session/clear', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const role: string = user?.role ?? '';
    const ALLOWED = ['Superuser', 'General Manager', 'Senior Manager'];
    if (!ALLOWED.includes(role)) {
      return res.status(403).json({ success: false, error: 'Insufficient role — Superuser/GM/SM required' });
    }

    console.log(`[SAP Session Clear] Triggered by user=${user?.username} role=${role}`);
    await sapSession.invalidate();

    res.json({
      success: true,
      message: 'SAP system session cleared. The next SAP operation will create a fresh login.',
      clearedAt: new Date().toISOString(),
      clearedBy: user?.username,
    });
  } catch (error: any) {
    console.error('❌ SAP session clear error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Config ───────────────────────────────────────────────────────────────────
router.get('/config', ensureAuthenticated, async (req, res) => {
  const companyDb = process.env.SAP_COMPANY_DB || '';
  console.log(`[SAP Config] Returning companyDb: ${companyDb}`);
  res.json({
    companyDb,
    serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000/b1s/v1',
  });
});

export default router;

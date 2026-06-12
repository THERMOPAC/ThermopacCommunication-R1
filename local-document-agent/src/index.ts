/**
 * THERMOPAC Local Windows Document Agent
 * Version: 1.0.2
 *
 * Cloud ERP → document_agent_jobs → Local Windows Document Agent → \\Server\d\THERMOPAC
 *
 * Run:           node dist/index.js
 * Install svc:   node dist/index.js --install-service
 * Uninstall svc: node dist/index.js --uninstall-service
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config';
import { setLogDir, info, warn, error } from './logger';
import { sendHeartbeat, claimJob } from './api-client';
import { runJob } from './job-runner';
import { ServiceHealth } from './service-health';

const AGENT_VERSION = '1.0.4';
const MACHINE_NAME  = os.hostname();

function logIdentity(allowedRoot: string): void {
  // Who is this process running as?
  info(`[IDENTITY] USERNAME   = ${process.env.USERNAME   ?? '(undefined)'}`);
  info(`[IDENTITY] USERDOMAIN = ${process.env.USERDOMAIN ?? '(undefined)'}`);
  try {
    const u = os.userInfo();
    info(`[IDENTITY] os.userInfo = ${u.username} (uid=${u.uid})`);
  } catch (e) {
    info(`[IDENTITY] os.userInfo = (error: ${e})`);
  }

  // Can this process read/write the allowed root?
  const rootExists = fs.existsSync(allowedRoot);
  info(`[IDENTITY] allowedRoot "${allowedRoot}"  exists=${rootExists}`);
  if (rootExists) {
    let readable = false;
    let writable = false;
    try { fs.accessSync(allowedRoot, fs.constants.R_OK); readable = true; } catch { /* no */ }
    try { fs.accessSync(allowedRoot, fs.constants.W_OK); writable = true; } catch { /* no */ }
    info(`[IDENTITY] allowedRoot readable=${readable}  writable=${writable}`);
  }
}

async function main() {
  const args   = process.argv.slice(2);
  const config = loadConfig();

  setLogDir(config.logDir);
  info(`THERMOPAC Local Document Agent v${AGENT_VERSION} starting on ${MACHINE_NAME}`);
  info(`Allowed root: ${config.allowedRootPath}`);
  info(`ERP base URL: ${config.erpBaseUrl}`);
  logIdentity(config.allowedRootPath);

  if (args.includes('--install-service')) {
    await installWindowsService();
    return;
  }
  if (args.includes('--uninstall-service')) {
    await uninstallWindowsService();
    return;
  }

  const health = new ServiceHealth();
  let running  = true;

  process.on('SIGTERM', () => { info('SIGTERM received — stopping'); health.transition('STOPPING'); running = false; });
  process.on('SIGINT',  () => { info('SIGINT received — stopping');  health.transition('STOPPING'); running = false; });

  health.transition('CONNECTING');

  while (running) {
    try {
      const hb = await sendHeartbeat(config, {
        environment:  config.environment,
        agentState:   health.state,
        agentVersion: AGENT_VERSION,
        machineName:  MACHINE_NAME,
        lastError:    health.lastError ?? undefined,
      });

      if (health.state === 'CONNECTING' || health.state === 'RETRY_WAIT') {
        health.transition('IDLE');
        info('Connected to ERP');
      }

      if (hb.pendingJobs > 0 && health.state !== 'PROCESSING') {
        health.transition('PROCESSING');
        const job = await claimJob(config);

        if (job) {
          info(`Claimed job #${job.id} (${job.jobType})`);
          await runJob(config, job, health);
          health.transition('IDLE');
        } else {
          health.transition('IDLE');
        }
      } else if (health.state !== 'PROCESSING') {
        health.transition('IDLE');
      }

    } catch (err_) {
      const msg = err_ instanceof Error ? err_.message : String(err_);
      error(`Poll cycle error: ${msg}`);
      health.transition('RETRY_WAIT', msg);

      await sendHeartbeat(config, {
        environment:  config.environment,
        agentState:   'RETRY_WAIT',
        agentVersion: AGENT_VERSION,
        machineName:  MACHINE_NAME,
        lastError:    msg,
      }).catch(() => {});
    }

    await sleep(config.pollIntervalSeconds * 1000);
  }

  info('Agent stopped gracefully');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function installWindowsService(): Promise<void> {
  info('Installing Windows service: ThermopacLocalDocumentAgent');
  try {
    const nodeWindows = require('node-windows');
    const Service     = nodeWindows.Service;
    const svc = new Service({
      name:        'ThermopacLocalDocumentAgent',
      description: 'THERMOPAC Local Document Agent — saves ERP files to local file server',
      script:      path.join(process.cwd(), 'dist', 'index.js'),
      nodeOptions: [],
    });

    svc.on('install', () => {
      info('Service installed. Starting...');
      svc.start();
    });
    svc.on('start', () => info('Service started'));
    svc.on('error', (err: Error) => error('Service error', err));
    svc.install();
  } catch (err_) {
    error('Failed to install service', err_);
    process.exit(1);
  }
}

async function uninstallWindowsService(): Promise<void> {
  info('Uninstalling Windows service: ThermopacLocalDocumentAgent');
  try {
    const nodeWindows = require('node-windows');
    const Service     = nodeWindows.Service;
    const svc = new Service({
      name:   'ThermopacLocalDocumentAgent',
      script: path.join(process.cwd(), 'dist', 'index.js'),
    });
    svc.on('uninstall', () => info('Service uninstalled'));
    svc.uninstall();
  } catch (err_) {
    error('Failed to uninstall service', err_);
    process.exit(1);
  }
}

main().catch(err_ => {
  console.error('Fatal error:', err_);
  process.exit(1);
});

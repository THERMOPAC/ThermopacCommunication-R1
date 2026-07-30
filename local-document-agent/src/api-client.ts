/**
 * api-client.ts
 *
 * All outbound HTTPS calls to the ERP cloud API.
 * Uses Node 20 native global fetch — no node-fetch dependency.
 * No inbound connections — agent is always the initiator.
 */

import { AgentConfig } from './config';
import { info, warn, error } from './logger';

export interface AgentJob {
  id:              number;
  jobType:         string;
  relativePath:    string;
  fileUrl?:        string;
  fileName?:       string;
  expectedSha256?: string;
  sourceRef?:      string;
  /** Populated for CREATE_PROJECT_STRUCTURE jobs — folder snapshot from the template. */
  inputPayload?:   {
    templateCode:    string;
    templateVersion: number;
    folders:         string[];
  };
}

export interface HeartbeatPayload {
  environment:  string;
  agentState:   string;
  agentVersion: string;
  machineName:  string;
  lastError?:   string;
}

export interface JobResultPayload {
  jobId:            number;
  success:          boolean;
  actualSha256?:    string;
  resultLocalPath?: string;
  resultPayload?:   Record<string, unknown>;
  failedReason?:    string;
}

const REQUEST_TIMEOUT_MS = 20_000; // 20 s — abort if ERP doesn't respond

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function networkError(endpoint: string, err: unknown): Error {
  if (err instanceof Error) {
    // Node native fetch wraps the real network error in err.cause
    const cause = (err as any).cause;
    const detail = cause instanceof Error ? ` (${cause.message})` : '';
    const label  = err.name === 'AbortError' ? 'timed out' : err.message;
    return new Error(`${label}${detail} — ${endpoint}`);
  }
  return new Error(`fetch error — ${endpoint}: ${String(err)}`);
}

async function post(config: AgentConfig, endpoint: string, body: unknown): Promise<unknown> {
  const url = `${config.erpBaseUrl}/api/local-agent${endpoint}`;
  const { signal, clear } = withTimeout(REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-code': config.agentCode,
        'x-api-key':    config.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw networkError(endpoint, err);
  } finally {
    clear();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ERP API error ${response.status} ${endpoint}: ${text}`);
  }

  return response.json();
}

async function get(config: AgentConfig, endpoint: string): Promise<unknown> {
  const url = `${config.erpBaseUrl}/api/local-agent${endpoint}`;
  const { signal, clear } = withTimeout(REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'x-agent-code': config.agentCode,
        'x-api-key':    config.apiKey,
      },
      signal,
    });
  } catch (err) {
    throw networkError(endpoint, err);
  } finally {
    clear();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ERP API error ${response.status} ${endpoint}: ${text}`);
  }

  return response.json();
}

export async function sendHeartbeat(
  config: AgentConfig,
  payload: HeartbeatPayload,
): Promise<{ pendingJobs: number }> {
  const result = await post(config, '/heartbeat', payload) as any;
  return { pendingJobs: result.pendingJobs ?? 0 };
}

export async function claimJob(config: AgentConfig): Promise<AgentJob | null> {
  const result = await post(config, '/jobs/claim', {}) as any;
  return result.job ?? null;
}

export async function submitResult(config: AgentConfig, payload: JobResultPayload): Promise<void> {
  await post(config, '/jobs/result', payload);
}

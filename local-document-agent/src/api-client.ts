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
  id:             number;
  jobType:        string;
  relativePath:   string;
  fileUrl?:       string;
  fileName?:      string;
  expectedSha256?:string;
  sourceRef?:     string;
}

export interface HeartbeatPayload {
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

async function post(config: AgentConfig, endpoint: string, body: unknown): Promise<unknown> {
  const url = `${config.erpBaseUrl}/api/local-agent${endpoint}`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-code': config.agentCode,
      'x-api-key':    config.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ERP API error ${response.status} ${endpoint}: ${text}`);
  }

  return response.json();
}

async function get(config: AgentConfig, endpoint: string): Promise<unknown> {
  const url = `${config.erpBaseUrl}/api/local-agent${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'x-agent-code': config.agentCode,
      'x-api-key':    config.apiKey,
    },
  });

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

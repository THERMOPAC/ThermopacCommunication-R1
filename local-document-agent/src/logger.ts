import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_LOG_FILES = 5;

let logDir = 'C:\\ThermopacDocAgent\\logs';

export function setLogDir(dir: string): void {
  logDir = dir;
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function currentLogPath(): string {
  return path.join(logDir, 'agent.log');
}

function rotateLogs(): void {
  const base = currentLogPath();
  if (!fs.existsSync(base)) return;
  const stat = fs.statSync(base);
  if (stat.size < MAX_LOG_SIZE_BYTES) return;

  for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
    const from = `${base}.${i}`;
    const to   = `${base}.${i + 1}`;
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
  fs.renameSync(base, `${base}.1`);
}

export function log(level: LogLevel, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ` | ${JSON.stringify(meta)}` : '';
  const line = `[${ts}] [${level}] ${message}${metaStr}`;
  console.log(line);

  try {
    rotateLogs();
    fs.appendFileSync(currentLogPath(), line + '\n', 'utf8');
  } catch {
    // log write failure is non-fatal
  }
}

export function info(message: string, meta?: unknown): void  { log('INFO',  message, meta); }
export function warn(message: string, meta?: unknown): void  { log('WARN',  message, meta); }
export function error(message: string, meta?: unknown): void { log('ERROR', message, meta); }
export function debug(message: string, meta?: unknown): void { log('DEBUG', message, meta); }

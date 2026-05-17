import * as fs from 'fs';
import * as path from 'path';

export interface AgentConfig {
  agentCode:          string;
  erpBaseUrl:         string;
  apiKey:             string;
  allowedRootPath:    string;
  pollIntervalSeconds:number;
  maxConcurrentJobs:  number;
  logDir:             string;
  tempDir:            string;
}

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config.json');

export function loadConfig(configPath?: string): AgentConfig {
  const filePath = configPath || DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}. Copy config.json.example to config.json and fill in values.`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const cfg = JSON.parse(raw) as Partial<AgentConfig>;

  if (!cfg.agentCode)       throw new Error('Config missing: agentCode');
  if (!cfg.erpBaseUrl)      throw new Error('Config missing: erpBaseUrl');
  if (!cfg.apiKey)          throw new Error('Config missing: apiKey');
  if (!cfg.allowedRootPath) throw new Error('Config missing: allowedRootPath');

  if (cfg.apiKey === 'CHANGE_ME_MIN_16_CHARS') {
    throw new Error('Config error: apiKey must be changed from the example value');
  }

  return {
    agentCode:          cfg.agentCode,
    erpBaseUrl:         cfg.erpBaseUrl.replace(/\/$/, ''),
    apiKey:             cfg.apiKey,
    allowedRootPath:    cfg.allowedRootPath,
    pollIntervalSeconds:cfg.pollIntervalSeconds  ?? 20,
    maxConcurrentJobs:  cfg.maxConcurrentJobs    ?? 1,
    logDir:             cfg.logDir  || 'C:\\ThermopacDocAgent\\logs',
    tempDir:            cfg.tempDir || 'C:\\ThermopacDocAgent\\temp',
  };
}

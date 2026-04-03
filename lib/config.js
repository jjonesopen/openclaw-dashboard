// ── Configuration ─────────────────────────────────────────────
// All tunables in one place. Override via environment variables.

import { homedir } from 'os';
import { join } from 'path';

const home = homedir();

export default {
  // Dashboard server
  port:        parseInt(process.env.DASHBOARD_PORT || '8080', 10),
  host:        process.env.DASHBOARD_HOST || '0.0.0.0',

  // OpenClaw
  openclawDir:      process.env.OPENCLAW_DIR      || join(home, '.openclaw'),
  gatewayUrl:       process.env.GATEWAY_URL        || 'http://127.0.0.1:18789',
  gatewayWs:        process.env.GATEWAY_WS         || 'ws://127.0.0.1:18789',

  // Ollama
  ollamaUrl:        process.env.OLLAMA_URL         || 'http://127.0.0.1:11434',

  // Polling intervals (ms)
  sseInterval:      parseInt(process.env.SSE_INTERVAL || '3000', 10),
  metricsInterval:  parseInt(process.env.METRICS_INTERVAL || '2000', 10),

  // User
  username: process.env.OPENCLAW_USER || 'jjones',
};

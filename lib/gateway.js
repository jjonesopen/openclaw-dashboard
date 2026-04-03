// ── OpenClaw Gateway Client ──────────────────────────────────
// Queries the OpenClaw Gateway HTTP/REST endpoints.

import config from './config.js';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

const BASE = config.gatewayUrl;
const OC_DIR = config.openclawDir;

async function fetchJSON(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Gateway health
export async function getHealth() {
  const data = await fetchJSON('/health');
  return {
    healthy: data?.ok === true,
    status: data?.status || 'unreachable',
  };
}

// Try to get sessions from gateway API
export async function getSessions() {
  // Try common gateway API paths
  for (const path of ['/api/sessions', '/sessions', '/api/v1/sessions']) {
    const data = await fetchJSON(path);
    if (data) return Array.isArray(data) ? data : (data.sessions || []);
  }
  return [];
}

// Read OpenClaw config (sanitized)
export async function getConfig() {
  try {
    const raw = await readFile(join(OC_DIR, 'openclaw.json'), 'utf8');
    const cfg = JSON.parse(raw);
    return sanitize(cfg);
  } catch {
    return null;
  }
}

function sanitize(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/key|token|secret|password|auth|credential/i.test(k)) {
      result[k] = '***';
    } else {
      result[k] = sanitize(v);
    }
  }
  return result;
}

// Read channels config
export async function getChannels() {
  try {
    const raw = await readFile(join(OC_DIR, 'openclaw.json'), 'utf8');
    const cfg = JSON.parse(raw);
    const channels = cfg.channels || {};
    return Object.entries(channels).map(([name, conf]) => ({
      name,
      enabled: conf.enabled !== false,
      dmPolicy: conf.dmPolicy || 'unknown',
    }));
  } catch {
    return [];
  }
}

// Read agents config
export async function getAgents() {
  try {
    const agentsDir = join(OC_DIR, 'agents');
    const entries = await readdir(agentsDir, { withFileTypes: true });
    const agents = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        agents.push({ name: entry.name, type: 'directory' });
      } else if (entry.name.endsWith('.json')) {
        try {
          const raw = await readFile(join(agentsDir, entry.name), 'utf8');
          const data = JSON.parse(raw);
          agents.push({
            name: data.name || entry.name.replace('.json', ''),
            model: data.model || 'default',
            ...data,
          });
        } catch {
          agents.push({ name: entry.name, type: 'file' });
        }
      }
    }
    return agents;
  } catch {
    return [];
  }
}

// Read tools/skills config
export async function getTools() {
  try {
    const raw = await readFile(join(OC_DIR, 'openclaw.json'), 'utf8');
    const cfg = JSON.parse(raw);
    const tools = cfg.tools || {};
    const result = [];

    if (tools.exec) {
      result.push({
        name: 'exec',
        enabled: true,
        security: tools.exec.security || 'unknown',
        ask: tools.exec.ask || 'unknown',
      });
    }
    if (tools.web?.fetch?.enabled) {
      result.push({ name: 'web-fetch', enabled: true });
    }
    if (tools.web?.search?.enabled) {
      result.push({ name: 'web-search', enabled: true });
    }

    return result;
  } catch {
    return [];
  }
}

// Memory directory listing
export async function getMemoryFiles() {
  try {
    const memDir = join(OC_DIR, 'memory');
    const entries = await readdir(memDir);
    const files = [];
    for (const name of entries.slice(0, 50)) {
      try {
        const s = await stat(join(memDir, name));
        files.push({ name, size: s.size, modified: s.mtime });
      } catch {
        files.push({ name, size: 0, modified: null });
      }
    }
    return files;
  } catch {
    return [];
  }
}

// Log directory listing
export async function getRecentLogs() {
  try {
    const logDir = join(OC_DIR, 'logs');
    const entries = await readdir(logDir);
    const files = [];
    for (const name of entries.slice(-20)) {
      try {
        const s = await stat(join(logDir, name));
        files.push({ name, size: s.size, modified: s.mtime });
      } catch {
        files.push({ name, size: 0, modified: null });
      }
    }
    return files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  } catch {
    return [];
  }
}

// Workspace directory structure
export async function getWorkspaceStructure() {
  try {
    const entries = await readdir(OC_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

// Aggregate gateway state
export async function getGatewayState() {
  const [health, sessions, channels, agents, tools, memory, logs, dirs] = await Promise.all([
    getHealth(),
    getSessions(),
    getChannels(),
    getAgents(),
    getTools(),
    getMemoryFiles(),
    getRecentLogs(),
    getWorkspaceStructure(),
  ]);

  return {
    ...health,
    sessions,
    channels,
    agents,
    tools,
    memory,
    logs,
    workspaceDirs: dirs,
  };
}

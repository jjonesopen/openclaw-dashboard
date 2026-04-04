#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// OpenClaw Mission Control — Dashboard Server
// Zero external dependencies. Node.js 18+ required.
// ══════════════════════════════════════════════════════════════

import http from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

import config from './lib/config.js';
import { collectMetrics } from './lib/metrics.js';
import { getOllamaState } from './lib/ollama.js';
import { getGatewayState } from './lib/gateway.js';
import { getServiceStatus } from './lib/services.js';
import { getActiveTasks } from './lib/tasks.js';
import { getTelegramMessages } from './lib/telegram.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, 'public');

// ── MIME types ───────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── State cache ──────────────────────────────────────────────
// Collected in the background, served instantly to all clients.
let cachedState = null;
let stateTimestamp = 0;

async function refreshState() {
  try {
    const [metrics, ollama, gateway, services, tasks, telegram] = await Promise.all([
      collectMetrics(),
      getOllamaState(),
      getGatewayState(),
      getServiceStatus(),
      getActiveTasks(),
      getTelegramMessages(),
    ]);

    cachedState = {
      timestamp: Date.now(),
      system: metrics,
      ollama,
      gateway,
      services,
      tasks,
      telegram,
    };
    stateTimestamp = Date.now();
  } catch (err) {
    console.error('[state] Error refreshing:', err.message);
  }
}

// Refresh state on a timer
setInterval(refreshState, config.metricsInterval);
refreshState(); // initial

// ── SSE Clients ──────────────────────────────────────────────
const sseClients = new Set();

function broadcastSSE() {
  if (!cachedState) return;
  const data = `data: ${JSON.stringify(cachedState)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

setInterval(broadcastSSE, config.sseInterval);

// ── HTTP Server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // ── API routes ─────────────────────────────────────────────
  if (path === '/api/state') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(cachedState || { error: 'not ready' }));
    return;
  }

  if (path === '/api/metrics') {
    const metrics = await collectMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
    return;
  }

  if (path === '/api/ollama') {
    const ollama = await getOllamaState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ollama));
    return;
  }

  if (path === '/api/gateway') {
    const gateway = await getGatewayState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(gateway));
    return;
  }

  if (path === '/api/services') {
    const services = await getServiceStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(services));
    return;
  }
  
  if (path === '/api/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cachedState?.tasks || {}));
    return;
  }
  
  if (path === '/api/telegram') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cachedState?.telegram || {}));
    return;
  }

  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }

  // ── SSE stream ─────────────────────────────────────────────
  if (path === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify(cachedState || {})}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── Static files ───────────────────────────────────────────
  let filePath = path === '/' ? '/index.html' : path;
  filePath = join(PUBLIC, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not a file');
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(config.port, config.host, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        🦞 OpenClaw Mission Control Dashboard                ║
║        Running on http://${config.host}:${config.port}                    ║
╚══════════════════════════════════════════════════════════════╝
  `);
  console.log(`[config] OpenClaw dir: ${config.openclawDir}`);
  console.log(`[config] Gateway:      ${config.gatewayUrl}`);
  console.log(`[config] Ollama:       ${config.ollamaUrl}`);
  console.log(`[config] SSE interval: ${config.sseInterval}ms`);
});

# OpenClaw Mission Control — Jerry Maintenance Guide

## Overview

This is the OpenClaw Mission Control Dashboard. It runs as a Node.js server on port 8080 and provides a real-time web dashboard showing the status of the entire OpenClaw system.

**Zero external dependencies.** Everything uses Node.js built-ins only.

---

## Architecture

```
~/dashboard/
├── server.js                 # HTTP server, SSE streaming, API routes
├── package.json              # Project metadata (no dependencies)
├── install.sh                # One-shot installer
├── openclaw-dashboard.service # systemd unit file
├── lib/
│   ├── config.js             # All configuration (env vars)
│   ├── metrics.js            # System metrics (CPU, RAM, disk, GPU)
│   ├── ollama.js             # Ollama API client
│   ├── gateway.js            # OpenClaw Gateway + workspace reader
│   └── services.js           # Systemd + external service checks
└── public/
    ├── index.html            # Dashboard HTML structure
    ├── css/dashboard.css     # All styles (dark theme)
    └── js/dashboard.js       # Frontend logic (SSE client, renderers)
```

## How Data Flows

1. `server.js` starts a background timer that calls `refreshState()` every 2 seconds
2. `refreshState()` calls all 4 collectors in parallel:
   - `metrics.js` → CPU, RAM, disk, GPU via `/proc/stat`, `os` module, `nvidia-smi`
   - `ollama.js` → Ollama REST API at `http://127.0.0.1:11434`
   - `gateway.js` → OpenClaw Gateway health at `http://127.0.0.1:18789` + reads `~/.openclaw/` filesystem
   - `services.js` → `systemctl` checks for ollama and openclaw-gateway
3. Results are cached in `cachedState` (a single JSON object)
4. Every 3 seconds, `cachedState` is broadcast to all connected SSE clients
5. The frontend (`dashboard.js`) receives SSE events and renders each panel

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/state` | GET | Full aggregated state JSON |
| `/api/stream` | GET | SSE stream (real-time updates) |
| `/api/metrics` | GET | System metrics only |
| `/api/ollama` | GET | Ollama state only |
| `/api/gateway` | GET | Gateway state only |
| `/api/services` | GET | Service status only |
| `/health` | GET | Dashboard health check |

## Configuration

All config is in `lib/config.js`. Override via environment variables:

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | 8080 | Server port |
| `DASHBOARD_HOST` | 0.0.0.0 | Bind address |
| `OPENCLAW_DIR` | ~/.openclaw | OpenClaw config directory |
| `GATEWAY_URL` | http://127.0.0.1:18789 | Gateway HTTP URL |
| `OLLAMA_URL` | http://127.0.0.1:11434 | Ollama API URL |
| `SSE_INTERVAL` | 3000 | How often to push SSE updates (ms) |
| `METRICS_INTERVAL` | 2000 | How often to collect metrics (ms) |

## Common Tasks for Jerry

### Adding a New Panel

1. **HTML**: Add a new `<section class="panel">` block in `public/index.html` inside `#grid`
2. **CSS**: Panel styles are automatic. Add custom styles in `dashboard.css` if needed
3. **Backend**: Create a new collector function in the appropriate `lib/*.js` file
4. **Wire it up**: Add the collector call to `refreshState()` in `server.js`
5. **Frontend**: Add a `renderNewPanel()` function in `dashboard.js` and call it from `render()`

### Adding a New Data Source

Example: Adding Etsy order tracking.

1. Create `lib/etsy.js`:
```javascript
export async function getEtsyOrders() {
  // Call Etsy API or read local data
  return { orders: [], totalRevenue: 0 };
}
```

2. In `server.js`, import and add to `refreshState()`:
```javascript
import { getEtsyOrders } from './lib/etsy.js';
// Inside refreshState():
const [metrics, ollama, gateway, services, etsy] = await Promise.all([
  collectMetrics(), getOllamaState(), getGatewayState(), getServiceStatus(), getEtsyOrders(),
]);
cachedState = { ...cachedState, etsy };
```

3. Add HTML panel and JS renderer as described above.

### Modifying Update Intervals

- Change `SSE_INTERVAL` env var for how often the frontend gets updates
- Change `METRICS_INTERVAL` env var for how often the backend collects data
- For individual slow collectors, you can cache them separately with longer TTLs

### Restarting the Dashboard

```bash
sudo systemctl restart openclaw-dashboard
```

### Viewing Logs

```bash
sudo journalctl -u openclaw-dashboard -f
```

### Testing Changes Without Restarting

During development, use:
```bash
cd ~/dashboard && node --watch server.js
```

This auto-restarts on file changes.

## Frontend Panel Reference

Each panel in the dashboard follows this pattern:

```html
<section class="panel" id="panel-example">
  <h2>Panel Title</h2>
  <div class="panel-body" id="example-content">
    <span class="dim">Loading…</span>
  </div>
</section>
```

```javascript
function renderExample(data) {
  const el = document.getElementById('example-content');
  if (!el || !data) return;
  el.innerHTML = `<div>...</div>`;
}
```

## Key CSS Classes

- `.service-item` — Row with dot indicator, name, and meta text
- `.model-card` — Card with name and metadata tags
- `.file-item` — File listing row
- `.info-grid` — 2-column key-value grid
- `.hero-card` — Top-level metric card
- `.dot.green/.red/.yellow` — Status indicator dots
- `.status-badge.online/.offline` — Connection status badges

## Security Notes

- Dashboard binds to 0.0.0.0 by default (accessible on LAN)
- No authentication built in — restrict via firewall if needed
- All secrets in openclaw.json are redacted before serving to the frontend
- nvidia-smi and systemctl calls have 5-second timeouts
- Static file serving prevents directory traversal

## Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard shows "Connecting..." | Server not running. Check `systemctl status openclaw-dashboard` |
| GPU panel shows N/A | `nvidia-smi` not in PATH or no NVIDIA GPU |
| Gateway shows Down | OpenClaw gateway not running. Check `systemctl --user status openclaw-gateway` |
| Ollama not reachable | Ollama service stopped. Check `systemctl status ollama` |
| High CPU from dashboard | Increase `METRICS_INTERVAL` to 5000 or higher |
| Port 8080 already in use | Change `DASHBOARD_PORT` env var |

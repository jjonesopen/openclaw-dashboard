// ══════════════════════════════════════════════════════════════
// OpenClaw Mission Control — Frontend
// Connects via SSE and renders live state into the dashboard.
// ══════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatUptime(seconds) {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setBar(id, pctId, percent) {
  const bar = $(id);
  const label = $(pctId);
  if (bar) bar.style.width = Math.min(100, percent) + '%';
  if (label) label.textContent = percent + '%';
}

function colorForPercent(pct) {
  if (pct >= 90) return 'var(--red)';
  if (pct >= 70) return 'var(--yellow)';
  return 'var(--green)';
}

// ── Clock ────────────────────────────────────────────────────
function updateClock() {
  const el = $('clock');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  }
}
setInterval(updateClock, 1000);
updateClock();

// ── SSE Connection ───────────────────────────────────────────
let evtSource = null;
let reconnectTimer = null;

function connect() {
  if (evtSource) { evtSource.close(); }
  evtSource = new EventSource('/api/stream');

  evtSource.onopen = () => {
    $('connection-status').textContent = 'Live';
    $('connection-status').className = 'status-badge online';
  };

  evtSource.onmessage = (event) => {
    try {
      const state = JSON.parse(event.data);
      render(state);
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  evtSource.onerror = () => {
    $('connection-status').textContent = 'Disconnected';
    $('connection-status').className = 'status-badge offline';
    evtSource.close();
    // Reconnect after 5s
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  };
}

connect();

// ── Main Render Function ─────────────────────────────────────
function render(state) {
  if (!state || state.error) return;

  renderHero(state);
  renderVitals(state.system);
  renderGpu(state.system?.gpu);
  renderServices(state.services);
  renderOllama(state.ollama);
  renderChannels(state.gateway?.channels);
  renderTools(state.gateway?.tools);
  renderAgents(state.gateway?.agents);
  renderSessions(state.gateway?.sessions);
  renderMemory(state.gateway?.memory);
  renderLogs(state.gateway?.logs);
  renderWorkspace(state.gateway?.workspaceDirs);

  $('last-update').textContent = 'Last update: ' + new Date().toLocaleTimeString();
}

// ── Hero Cards ───────────────────────────────────────────────
function renderHero(state) {
  const sys = state.system;
  const ollama = state.ollama;
  const gw = state.gateway;

  $('val-uptime').textContent = formatUptime(sys?.uptime);
  $('val-cpu').textContent = (sys?.cpu?.usage ?? '--') + '%';
  $('val-cpu').style.color = colorForPercent(sys?.cpu?.usage || 0);
  $('val-ram').textContent = (sys?.memory?.percent ?? '--') + '%';
  $('val-ram').style.color = colorForPercent(sys?.memory?.percent || 0);

  if (sys?.gpu) {
    const vramPct = Math.round((sys.gpu.vramUsed / sys.gpu.vramTotal) * 100);
    $('val-gpu').textContent = `${sys.gpu.temperature}°C / ${vramPct}%`;
    $('val-gpu').style.color = colorForPercent(sys.gpu.temperature > 75 ? 90 : sys.gpu.temperature > 60 ? 70 : 30);
  } else {
    $('val-gpu').textContent = 'N/A';
  }

  $('val-models').textContent = `${ollama?.loadedCount || 0} / ${ollama?.modelCount || 0}`;
  $('val-models').style.color = ollama?.loadedCount > 0 ? 'var(--green)' : 'var(--text-dim)';

  if (gw?.healthy) {
    $('val-gateway').textContent = '● Live';
    $('val-gateway').style.color = 'var(--green)';
  } else {
    $('val-gateway').textContent = '● Down';
    $('val-gateway').style.color = 'var(--red)';
  }
}

// ── System Vitals ────────────────────────────────────────────
function renderVitals(sys) {
  if (!sys) return;

  setBar('bar-cpu', 'pct-cpu', sys.cpu?.usage || 0);
  setBar('bar-ram', 'pct-ram', sys.memory?.percent || 0);
  setBar('bar-disk', 'pct-disk', sys.disk?.percent || 0);

  let vramPct = 0;
  if (sys.gpu) {
    vramPct = Math.round((sys.gpu.vramUsed / sys.gpu.vramTotal) * 100);
  }
  setBar('bar-vram', 'pct-vram', vramPct);

  const detail = $('vitals-detail');
  if (detail) {
    const load = sys.loadAvg || [0, 0, 0];
    detail.innerHTML = `
      <strong>${sys.hostname}</strong> — ${sys.platform}<br>
      CPU: ${sys.cpu?.model} (${sys.cpu?.cores} threads)<br>
      Load: ${load.map(l => l.toFixed(2)).join(' / ')}<br>
      RAM: ${formatBytes(sys.memory?.used)} / ${formatBytes(sys.memory?.total)}<br>
      Disk: ${formatBytes(sys.disk?.used)} / ${formatBytes(sys.disk?.total)}<br>
      ${sys.cpu?.temperature ? `CPU Temp: ${sys.cpu.temperature}°C` : ''}
    `;
  }
}

// ── GPU Panel ────────────────────────────────────────────────
function renderGpu(gpu) {
  const el = $('gpu-info');
  if (!el) return;
  if (!gpu) {
    el.innerHTML = '<span class="dim">No NVIDIA GPU detected</span>';
    return;
  }
  el.innerHTML = `
    <div class="info-item"><span class="label">Model</span><span class="value">${gpu.name}</span></div>
    <div class="info-item"><span class="label">Temperature</span><span class="value" style="color:${colorForPercent(gpu.temperature > 75 ? 90 : gpu.temperature > 60 ? 70 : 30)}">${gpu.temperature}°C</span></div>
    <div class="info-item"><span class="label">VRAM Used</span><span class="value">${gpu.vramUsed} / ${gpu.vramTotal} MiB</span></div>
    <div class="info-item"><span class="label">VRAM Free</span><span class="value">${gpu.vramFree} MiB</span></div>
    <div class="info-item"><span class="label">Utilization</span><span class="value">${gpu.utilization}%</span></div>
    <div class="info-item"><span class="label">Power</span><span class="value">${gpu.powerDraw}W / ${gpu.powerLimit}W</span></div>
  `;
}

// ── Services ─────────────────────────────────────────────────
function renderServices(services) {
  const el = $('services-list');
  if (!el || !services) return;

  let html = '';

  // Systemd services
  const sd = services.systemd || {};
  for (const [key, svc] of Object.entries(sd)) {
    const active = svc.active;
    const dotClass = active ? 'green' : 'red';
    const uptime = active && svc.uptime ? formatUptime(svc.uptime / 1000) : '';
    html += `
      <div class="service-item">
        <span class="service-name"><span class="dot ${dotClass}"></span>${svc.name}</span>
        <span class="service-meta">${active ? 'Running' : 'Stopped'} ${uptime ? '· ' + uptime : ''}</span>
      </div>
    `;
  }

  // External services
  const ext = services.external || {};
  if (ext.gog) {
    const ok = ext.gog.available;
    html += `
      <div class="service-item">
        <span class="service-name"><span class="dot ${ok ? 'green' : 'red'}"></span>${ext.gog.name}</span>
        <span class="service-meta">${ok ? ext.gog.version : 'Not available'}</span>
      </div>
    `;
  }
  if (ext.github) {
    const ok = ext.github.authenticated;
    html += `
      <div class="service-item">
        <span class="service-name"><span class="dot ${ok ? 'green' : 'red'}"></span>${ext.github.name}</span>
        <span class="service-meta">${ok ? ext.github.account : 'Not authenticated'}</span>
      </div>
    `;
  }

  el.innerHTML = html || '<span class="dim">No services found</span>';
}

// ── Ollama Models ────────────────────────────────────────────
function renderOllama(ollama) {
  const el = $('ollama-models');
  if (!el || !ollama) return;

  if (!ollama.healthy) {
    el.innerHTML = '<span class="dim">Ollama not reachable</span>';
    return;
  }

  let html = '';

  // Header with version
  html += `<div style="margin-bottom:10px;font-size:11px;color:var(--text-dim)">Ollama v${ollama.version || '?'} — ${ollama.modelCount} model${ollama.modelCount !== 1 ? 's' : ''}</div>`;

  const runningNames = new Set((ollama.running || []).map(m => m.name));

  for (const model of (ollama.models || [])) {
    const loaded = runningNames.has(model.name);
    html += `
      <div class="model-card">
        <div class="model-name">
          ${model.name}
          <span class="model-tag ${loaded ? 'loaded' : 'available'}">${loaded ? '● LOADED' : 'available'}</span>
        </div>
        <div class="model-meta">
          <span>${model.params}</span>
          <span>${model.quant}</span>
          <span>${formatBytes(model.size)}</span>
          <span>${model.family}</span>
        </div>
      </div>
    `;
  }

  el.innerHTML = html || '<span class="dim">No models found</span>';
}

// ── Channels ─────────────────────────────────────────────────
function renderChannels(channels) {
  const el = $('channels-list');
  if (!el) return;
  if (!channels || channels.length === 0) {
    el.innerHTML = '<span class="dim">No channels configured</span>';
    return;
  }

  el.innerHTML = channels.map(ch => `
    <div class="service-item">
      <span class="service-name">
        <span class="dot ${ch.enabled ? 'green' : 'red'}"></span>
        ${ch.name}
      </span>
      <span class="service-meta">${ch.dmPolicy}</span>
    </div>
  `).join('');
}

// ── Tools ────────────────────────────────────────────────────
function renderTools(tools) {
  const el = $('tools-list');
  if (!el) return;
  if (!tools || tools.length === 0) {
    el.innerHTML = '<span class="dim">No tools configured</span>';
    return;
  }

  el.innerHTML = tools.map(t => `
    <div class="service-item">
      <span class="service-name">
        <span class="dot ${t.enabled ? 'green' : 'yellow'}"></span>
        ${t.name}
      </span>
      <span class="service-meta">${t.security ? 'security=' + t.security : ''} ${t.ask ? 'ask=' + t.ask : ''}</span>
    </div>
  `).join('');
}

// ── Agents ───────────────────────────────────────────────────
function renderAgents(agents) {
  const el = $('agents-list');
  if (!el) return;
  if (!agents || agents.length === 0) {
    el.innerHTML = '<span class="dim">No agents found</span>';
    return;
  }

  el.innerHTML = agents.map(a => `
    <div class="model-card">
      <div class="model-name">${a.name}</div>
      <div class="model-meta">
        ${a.model ? `<span>Model: ${a.model}</span>` : ''}
        <span>Type: ${a.type || 'agent'}</span>
      </div>
    </div>
  `).join('');
}

// ── Sessions ─────────────────────────────────────────────────
function renderSessions(sessions) {
  const el = $('sessions-list');
  if (!el) return;
  if (!sessions || sessions.length === 0) {
    el.innerHTML = '<span class="dim">No active sessions</span>';
    return;
  }

  el.innerHTML = sessions.map(s => `
    <div class="session-card">
      <div class="session-id">${s.id || s.session_id || 'unknown'}</div>
      <div class="model-meta">
        ${s.channel ? `<span>Channel: ${s.channel}</span>` : ''}
        ${s.model ? `<span>Model: ${s.model}</span>` : ''}
        ${s.status ? `<span>Status: ${s.status}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Memory Files ─────────────────────────────────────────────
function renderMemory(files) {
  const el = $('memory-list');
  if (!el) return;
  if (!files || files.length === 0) {
    el.innerHTML = '<span class="dim">No memory files</span>';
    return;
  }

  el.innerHTML = files.map(f => `
    <div class="file-item">
      <span class="file-name">📄 ${f.name}</span>
      <span class="file-meta">${formatBytes(f.size)} · ${formatDate(f.modified)}</span>
    </div>
  `).join('');
}

// ── Logs ─────────────────────────────────────────────────────
function renderLogs(logs) {
  const el = $('logs-list');
  if (!el) return;
  if (!logs || logs.length === 0) {
    el.innerHTML = '<span class="dim">No recent logs</span>';
    return;
  }

  el.innerHTML = logs.map(f => `
    <div class="file-item">
      <span class="file-name">📋 ${f.name}</span>
      <span class="file-meta">${formatBytes(f.size)} · ${formatDate(f.modified)}</span>
    </div>
  `).join('');
}

// ── Workspace Dirs ───────────────────────────────────────────
function renderWorkspace(dirs) {
  const el = $('workspace-dirs');
  if (!el) return;
  if (!dirs || dirs.length === 0) {
    el.innerHTML = '<span class="dim">No workspace directories</span>';
    return;
  }

  el.innerHTML = `<div class="dir-tags">${dirs.map(d => `<span class="dir-tag">📁 ${d}</span>`).join('')}</div>`;
}

// ── Ollama API Client ────────────────────────────────────────
// Queries the Ollama REST API for model info and status.

import config from './config.js';

const BASE = config.ollamaUrl;

async function fetchJSON(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// List all downloaded models
export async function listModels() {
  const data = await fetchJSON('/api/tags');
  if (!data?.models) return [];
  return data.models.map(m => ({
    name:       m.name,
    size:       m.size,
    family:     m.details?.family || 'unknown',
    params:     m.details?.parameter_size || 'unknown',
    quant:      m.details?.quantization_level || 'unknown',
    modified:   m.modified_at,
  }));
}

// List currently loaded (in VRAM) models
export async function runningModels() {
  const data = await fetchJSON('/api/ps');
  if (!data?.models) return [];
  return data.models.map(m => ({
    name:       m.name,
    size:       m.size,
    sizeVram:   m.size_vram,
    expiresAt:  m.expires_at,
    digest:     m.digest?.substring(0, 12),
  }));
}

// Get Ollama version
export async function getVersion() {
  const data = await fetchJSON('/api/version');
  return data?.version || null;
}

// Check if Ollama is reachable
export async function isHealthy() {
  try {
    const res = await fetch(BASE, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Aggregate Ollama state
export async function getOllamaState() {
  const [healthy, version, models, running] = await Promise.all([
    isHealthy(),
    getVersion(),
    listModels(),
    runningModels(),
  ]);

  return {
    healthy,
    version,
    models,
    running,
    modelCount: models.length,
    loadedCount: running.length,
  };
}

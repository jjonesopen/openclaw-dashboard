// ── System Metrics Collector ──────────────────────────────────
// Gathers CPU, RAM, disk, GPU stats using native OS commands.
// Zero external dependencies.

import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import os from 'os';

function run(cmd, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      resolve(err ? '' : stdout.trim());
    });
  });
}

// ── CPU ──────────────────────────────────────────────────────
let prevIdle = 0, prevTotal = 0;

async function getCpuUsage() {
  try {
    const stat = await readFile('/proc/stat', 'utf8');
    const line = stat.split('\n')[0]; // "cpu  user nice system idle ..."
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);
    const diffIdle = idle - prevIdle;
    const diffTotal = total - prevTotal;
    prevIdle = idle;
    prevTotal = total;
    if (diffTotal === 0) return 0;
    return Math.round((1 - diffIdle / diffTotal) * 100);
  } catch {
    return 0;
  }
}

function getCpuInfo() {
  const cpus = os.cpus();
  return {
    model: cpus[0]?.model || 'Unknown',
    cores: cpus.length,
    speed: cpus[0]?.speed || 0,
  };
}

// ── Memory ───────────────────────────────────────────────────
function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total,
    used,
    free,
    percent: Math.round((used / total) * 100),
  };
}

// ── Disk ─────────────────────────────────────────────────────
async function getDisk() {
  const out = await run('df', ['--output=size,used,avail,pcent', '-B1', '/']);
  const lines = out.split('\n');
  if (lines.length < 2) return { total: 0, used: 0, free: 0, percent: 0 };
  const [size, used, avail, pcent] = lines[1].trim().split(/\s+/);
  return {
    total: parseInt(size),
    used: parseInt(used),
    free: parseInt(avail),
    percent: parseInt(pcent),
  };
}

// ── GPU (NVIDIA) ─────────────────────────────────────────────
async function getGpu() {
  const out = await run('nvidia-smi', [
    '--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw,power.limit',
    '--format=csv,noheader,nounits',
  ]);
  if (!out) return null;
  const parts = out.split(',').map(s => s.trim());
  return {
    name:        parts[0] || 'Unknown',
    vramTotal:   parseInt(parts[1]) || 0,  // MiB
    vramUsed:    parseInt(parts[2]) || 0,
    vramFree:    parseInt(parts[3]) || 0,
    utilization: parseInt(parts[4]) || 0,  // %
    temperature: parseInt(parts[5]) || 0,  // °C
    powerDraw:   parseFloat(parts[6]) || 0, // W
    powerLimit:  parseFloat(parts[7]) || 0,
  };
}

// ── CPU Temperature ──────────────────────────────────────────
async function getCpuTemp() {
  // Try lm-sensors first
  const sensors = await run('sensors', ['-j']);
  if (sensors) {
    try {
      const data = JSON.parse(sensors);
      for (const chip of Object.values(data)) {
        if (typeof chip !== 'object') continue;
        for (const [key, val] of Object.entries(chip)) {
          if (key.toLowerCase().includes('tctl') || key.toLowerCase().includes('tdie')) {
            const input = Object.entries(val).find(([k]) => k.includes('input'));
            if (input) return Math.round(input[1]);
          }
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: thermal zones
  try {
    const temp = await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    return Math.round(parseInt(temp) / 1000);
  } catch {
    return null;
  }
}

// ── Uptime ───────────────────────────────────────────────────
function getUptime() {
  return os.uptime();
}

function getLoadAvg() {
  return os.loadavg();
}

// ── Aggregate ────────────────────────────────────────────────
export async function collectMetrics() {
  const [cpuUsage, disk, gpu, cpuTemp] = await Promise.all([
    getCpuUsage(),
    getDisk(),
    getGpu(),
    getCpuTemp(),
  ]);

  return {
    timestamp: Date.now(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptime: getUptime(),
    loadAvg: getLoadAvg(),
    cpu: {
      ...getCpuInfo(),
      usage: cpuUsage,
      temperature: cpuTemp,
    },
    memory: getMemory(),
    disk,
    gpu,
  };
}

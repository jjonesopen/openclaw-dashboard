// ── External Service Status Checker ──────────────────────────
// Checks systemd services, gog/Gmail, GitHub CLI, etc.

import { execFile } from 'child_process';
import config from './config.js';

function run(cmd, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

// ── Systemd service check ────────────────────────────────────
async function checkSystemdService(name, userMode = false) {
  const args = userMode
    ? ['--user', 'is-active', name]
    : ['is-active', name];
  const { ok, stdout } = await run('systemctl', args);
  const active = stdout === 'active';

  // Get uptime if active
  let uptime = null;
  if (active) {
    const propArgs = userMode
      ? ['--user', 'show', name, '--property=ActiveEnterTimestamp', '--value']
      : ['show', name, '--property=ActiveEnterTimestamp', '--value'];
    const { stdout: ts } = await run('systemctl', propArgs);
    if (ts) {
      uptime = Date.now() - new Date(ts).getTime();
    }
  }

  return { name, active, uptime };
}

// ── gog (Gmail) check ────────────────────────────────────────
async function checkGog() {
  const { ok, stdout } = await run('gog', ['--version']);
  return {
    name: 'Gmail (gog)',
    available: ok,
    version: ok ? stdout : null,
  };
}

// ── GitHub CLI check ─────────────────────────────────────────
async function checkGitHub() {
  const { ok, stdout } = await run('gh', ['auth', 'status']);
  // gh auth status outputs to stderr on success
  const { stderr } = await run('gh', ['auth', 'status']);
  const authed = (stdout + stderr).includes('Logged in');
  const accountMatch = (stdout + stderr).match(/account\s+(\S+)/);
  return {
    name: 'GitHub CLI',
    authenticated: authed,
    account: accountMatch ? accountMatch[1] : null,
  };
}

// ── Aggregate ────────────────────────────────────────────────
export async function getServiceStatus() {
  const [ollama, gateway, gog, github] = await Promise.all([
    checkSystemdService('ollama'),
    checkSystemdService('openclaw-gateway', true), // user service
    checkGog(),
    checkGitHub(),
  ]);

  return {
    systemd: { ollama, gateway },
    external: { gog, github },
  };
}

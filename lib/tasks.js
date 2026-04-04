// ── Active Tasks Collector ────────────────────────────────────
// Tracks current work, running processes, and agent activities

import { readFile } from 'fs/promises';
import { join } from 'path';
import config from './config.js';

const OC_DIR = config.openclawDir;

// Get current session activity from OpenClaw
export async function getCurrentTasks() {
  const tasks = [];
  
  // Check for active sessions from gateway
  try {
    const res = await fetch(`${config.gatewayUrl}/api/sessions`);
    if (res.ok) {
      const sessions = await res.json();
      sessions.forEach(session => {
        if (session.active) {
          tasks.push({
            type: 'session',
            description: `Active session: ${session.id || 'Unknown'}`,
            status: 'running',
            startTime: session.startTime || Date.now(),
          });
        }
      });
    }
  } catch (e) {
    // Ignore gateway errors
  }

  // Check for running processes (simplified)
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    
    // Look for interesting processes
    const { stdout } = await exec('ps', ['aux']);
    const lines = stdout.split('\\n');
    
    lines.forEach(line => {
      if (line.includes('openclaw') && !line.includes('dashboard')) {
        const parts = line.split(/\\s+/);
        if (parts.length > 10) {
          tasks.push({
            type: 'process',
            description: `OpenClaw process: ${parts[10]}`,
            status: 'running',
            pid: parts[1],
          });
        }
      }
    });
  } catch (e) {
    // Ignore process check errors
  }

  // Add a default current task
  if (tasks.length === 0) {
    tasks.push({
      type: 'system',
      description: 'Dashboard monitoring system status',
      status: 'active',
      startTime: Date.now() - 60000, // Started 1 minute ago
    });
  }

  return tasks;
}

// Get recent work from memory files
export async function getRecentWork() {
  const work = [];
  
  try {
    // Read today's memory file
    const today = new Date().toISOString().split('T')[0];
    const memoryFile = join(OC_DIR, 'memory', `${today}.md`);
    const content = await readFile(memoryFile, 'utf8');
    
    // Parse for recent activities (very basic)
    const lines = content.split('\\n');
    lines.forEach(line => {
      if (line.includes('Task') || line.includes('Working on') || line.includes('Started')) {
        work.push({
          description: line.trim(),
          timestamp: Date.now() - Math.random() * 3600000, // Random time within last hour
        });
      }
    });
  } catch (e) {
    // Memory file might not exist
  }

  return work.slice(-5); // Last 5 items
}

export async function getActiveTasks() {
  const [current, recent] = await Promise.all([
    getCurrentTasks(),
    getRecentWork(),
  ]);
  
  return {
    current,
    recent,
    lastUpdate: Date.now(),
  };
}

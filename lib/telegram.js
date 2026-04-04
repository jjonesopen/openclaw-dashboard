// ── Telegram Messages Collector ──────────────────────────────
// Reads recent Telegram messages from OpenClaw logs/memory

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import config from './config.js';

const OC_DIR = config.openclawDir;

// Parse Telegram messages from log files
async function parseLogFiles() {
  const messages = [];
  
  try {
    const logsDir = join(OC_DIR, 'logs');
    const entries = await readdir(logsDir);
    
    // Get most recent log files
    const logFiles = [];
    for (const entry of entries.slice(-5)) {
      try {
        const fullPath = join(logsDir, entry);
        const stats = await stat(fullPath);
        logFiles.push({ name: entry, path: fullPath, mtime: stats.mtime });
      } catch (e) {
        continue;
      }
    }
    
    // Sort by modification time, newest first
    logFiles.sort((a, b) => b.mtime - a.mtime);
    
    // Parse recent log files for Telegram messages
    for (const logFile of logFiles.slice(0, 2)) {
      try {
        const content = await readFile(logFile.path, 'utf8');
        const lines = content.split('\\n');
        
        lines.forEach(line => {
          // Look for Telegram message patterns
          if (line.includes('telegram') || line.includes('Telegram') || line.includes('message_id')) {
            try {
              // Try to extract message info
              const timestampMatch = line.match(/\\d{4}-\\d{2}-\\d{2}[T\\s]\\d{2}:\\d{2}:\\d{2}/);
              const timestamp = timestampMatch ? new Date(timestampMatch[0]) : new Date();
              
              messages.push({
                content: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
                timestamp: timestamp,
                source: 'log',
                file: logFile.name,
              });
            } catch (e) {
              // Skip malformed lines
            }
          }
        });
      } catch (e) {
        // Skip unreadable files
        continue;
      }
    }
  } catch (e) {
    // Logs directory might not exist
  }
  
  return messages;
}

// Get messages from memory files
async function parseMemoryFiles() {
  const messages = [];
  
  try {
    const memoryDir = join(OC_DIR, 'memory');
    const entries = await readdir(memoryDir);
    
    // Get today and yesterday's files
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const relevantFiles = entries.filter(name => 
      name.includes(today) || name.includes(yesterday) || name.endsWith('.md')
    ).slice(-3);
    
    for (const fileName of relevantFiles) {
      try {
        const content = await readFile(join(memoryDir, fileName), 'utf8');
        const lines = content.split('\\n');
        
        lines.forEach(line => {
          if (line.includes('Telegram') || line.includes('message') || line.includes('Chris')) {
            messages.push({
              content: line.trim(),
              timestamp: new Date(),
              source: 'memory',
              file: fileName,
            });
          }
        });
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    // Memory directory might not exist
  }
  
  return messages;
}

export async function getTelegramMessages() {
  const [logMessages, memoryMessages] = await Promise.all([
    parseLogFiles(),
    parseMemoryFiles(),
  ]);
  
  // Combine and sort by timestamp
  const allMessages = [...logMessages, ...memoryMessages];
  allMessages.sort((a, b) => b.timestamp - a.timestamp);
  
  // Return top 10 most recent
  return {
    messages: allMessages.slice(0, 10),
    lastUpdate: Date.now(),
    totalFound: allMessages.length,
  };
}

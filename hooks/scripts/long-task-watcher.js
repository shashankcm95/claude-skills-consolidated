#!/usr/bin/env node

// Detached watcher: runs as a child process spawned by long-task-start.js.
// Sleeps for the threshold (kernel-level, 0% CPU), then checks the tracker.
// Single-fire — exits after one check, no loops, no polling.
//
// Args: <toolUseId> <sessionId> <thresholdSec>

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

let isClaudeFocused;
try {
  ({ isClaudeFocused } = require('./_focus.js'));
} catch {
  isClaudeFocused = () => false; // If helper missing, default to "not focused"
}

const [, , toolUseId, sessionId, thresholdStr] = process.argv;

if (!toolUseId || !sessionId || !thresholdStr) {
  process.exit(0);
}

const thresholdSec = parseInt(thresholdStr, 10);
if (!thresholdSec || thresholdSec < 1) process.exit(0);

const TRACKER_FILE = path.join(os.tmpdir(), `claude-long-tasks-${sessionId}.json`);
const COOLDOWN_MS = 60 * 1000;
const COOLDOWN_FILE = path.join(os.tmpdir(), 'claude-long-task-cooldown.json');

function readCooldown() {
  try {
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeCooldown(data) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data));
  } catch { /* non-critical */ }
}

function isInCooldown() {
  const data = readCooldown();
  const last = data.lastNotified || 0;
  return Date.now() - last < COOLDOWN_MS;
}

function recordCooldown() {
  const data = readCooldown();
  data.lastNotified = Date.now();
  writeCooldown(data);
}

function sendNotification(entry) {
  const elapsed = Math.round((Date.now() - entry.started) / 1000);
  const title = 'Claude is taking a while';
  const summary = entry.summary ? `${entry.name}: ${entry.summary}` : entry.name;
  const safeSummary = summary.slice(0, 120);
  const message = `${safeSummary} — ${elapsed}s elapsed`;

  try {
    if (process.platform === 'darwin') {
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title}" sound name "Submarine"`;
      execSync(`osascript -e '${script}'`, { timeout: 3000, stdio: 'ignore' });
    } else if (process.platform === 'linux') {
      execSync(`notify-send "${title}" "${message}" -u low`, { timeout: 3000, stdio: 'ignore' });
    }
  } catch { /* never block on notification failures */ }
}

// Sleep until threshold, then single check + exit
setTimeout(() => {
  try {
    const tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    const entry = tracker.tools && tracker.tools[toolUseId];

    if (!entry || entry.completed) {
      // Tool completed before threshold — silent exit
      process.exit(0);
    }

    // Tool still running. Check focus.
    if (isClaudeFocused()) {
      process.exit(0);
    }

    // Check cooldown — at most one long-task notification per minute
    if (isInCooldown()) {
      process.exit(0);
    }

    recordCooldown();
    sendNotification(entry);
  } catch {
    // Tracker missing or corrupt — silent exit
  }
  process.exit(0);
}, thresholdSec * 1000);

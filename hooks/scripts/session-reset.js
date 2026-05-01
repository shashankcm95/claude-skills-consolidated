#!/usr/bin/env node

// SessionStart hook: resets the fact-forcing gate tracker.
// Each new session starts with a clean slate — you must Read before Edit/Write.
// Also cleans up stale tracker files from previous sessions.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./_log.js');
const logger = log('session-reset');

const SESSION_ID = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CONVERSATION_ID || String(process.ppid || 'default');
const TRACKER_PATH = path.join(os.tmpdir(), `claude-read-tracker-${SESSION_ID}.json`);

try {
  // Use the same atomic-rename pattern that fact-force-gate uses on this file
  // (writers must be consistent or readers see partial JSON).
  const tmpPath = TRACKER_PATH + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify({
    files: {},
    sessionStart: Date.now(),
  }, null, 2));
  fs.renameSync(tmpPath, TRACKER_PATH);
  logger('reset', { sessionId: SESSION_ID });

  const tmpDir = os.tmpdir();
  const files = fs.readdirSync(tmpDir);
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const file of files) {
    if (!/^claude-read-tracker-.*\.json$/.test(file)) continue;
    const filePath = path.join(tmpDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > ONE_DAY) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    } catch { /* ignore stale file cleanup errors */ }
  }

  if (cleaned > 0) logger('cleanup', { staleFilesRemoved: cleaned });
} catch (err) {
  logger('error', { error: err.message });
}

// SessionStart hooks don't produce output

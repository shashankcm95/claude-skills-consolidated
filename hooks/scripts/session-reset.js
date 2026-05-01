#!/usr/bin/env node

// SessionStart hook: resets the fact-forcing gate tracker.
// Each new session starts with a clean slate — you must Read before Edit/Write.
// Also cleans up stale tracker files from previous sessions.

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_ID = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CONVERSATION_ID || String(process.ppid || 'default');
const TRACKER_PATH = path.join(os.tmpdir(), `claude-read-tracker-${SESSION_ID}.json`);

try {
  // Reset current session tracker (fact-forcing gate)
  fs.writeFileSync(TRACKER_PATH, JSON.stringify({
    files: {},
    sessionStart: Date.now(),
  }, null, 2));

  // Clean up stale tracker files older than 24 hours
  const tmpDir = os.tmpdir();
  const files = fs.readdirSync(tmpDir);
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  for (const file of files) {
    if (!/^claude-read-tracker-.*\.json$/.test(file)) continue;
    const filePath = path.join(tmpDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > ONE_DAY) {
        fs.unlinkSync(filePath);
      }
    } catch { /* ignore stale file cleanup errors */ }
  }
} catch {
  // Non-critical — if we can't reset, the gates still work
}

// SessionStart hooks don't produce output

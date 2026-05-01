#!/usr/bin/env node

// PostToolUse hook: marks a long-tracked tool as completed by removing
// its entry from the tracker. The corresponding watcher will then exit
// silently when it wakes up.

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_ID = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CONVERSATION_ID || String(process.ppid || 'default');
const TRACKER_FILE = path.join(os.tmpdir(), `claude-long-tasks-${SESSION_ID}.json`);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  // Always pass input through — PostToolUse hooks should not block
  process.stdout.write(input);

  try {
    const data = JSON.parse(input);
    const toolUseId = data.tool_use_id;
    if (!toolUseId) return;

    let tracker;
    try {
      tracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    } catch {
      return; // No tracker file = nothing to clean up
    }

    if (tracker.tools && tracker.tools[toolUseId]) {
      delete tracker.tools[toolUseId];

      const tmpFile = TRACKER_FILE + '.tmp.' + process.pid;
      try {
        fs.writeFileSync(tmpFile, JSON.stringify(tracker));
        fs.renameSync(tmpFile, TRACKER_FILE);
      } catch {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      }
    }
  } catch {
    // Never block on hook errors
  }
});

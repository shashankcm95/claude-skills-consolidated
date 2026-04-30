#!/usr/bin/env node

// PreToolUse hook: fact-forcing gate
// Blocks Edit/Write on a file that hasn't been Read first in this session.
// Prevents hallucinated edits — you must see the code before changing it.
//
// How it works:
//   - Matcher: "Read|Edit|Write"
//   - On Read: records the file_path in a session tracker file
//   - On Edit/Write: checks if the file_path was previously recorded
//   - Blocks with a clear message if the file hasn't been read

const fs = require('fs');
const path = require('path');

const TRACKER_PATH = '/tmp/claude-read-tracker.json';

function loadTracker() {
  try {
    const raw = fs.readFileSync(TRACKER_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { files: {}, sessionStart: Date.now() };
  }
}

function saveTracker(tracker) {
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
}

function normalizePath(filePath) {
  if (!filePath) return '';
  return path.resolve(filePath);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};
    const filePath = normalizePath(toolInput.file_path || toolInput.path || '');

    if (!filePath) {
      process.stdout.write(JSON.stringify({ decision: 'approve' }));
      return;
    }

    const tracker = loadTracker();

    if (toolName === 'Read') {
      // Record that this file has been read
      tracker.files[filePath] = Date.now();
      saveTracker(tracker);
      process.stdout.write(JSON.stringify({ decision: 'approve' }));
      return;
    }

    // Edit or Write — check if file was read first
    if (toolName === 'Edit' || toolName === 'Write') {
      const wasRead = tracker.files[filePath];

      // For Write to NEW files (that don't exist yet), allow without Read
      if (toolName === 'Write' && !fs.existsSync(filePath)) {
        process.stdout.write(JSON.stringify({ decision: 'approve' }));
        return;
      }

      if (!wasRead) {
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: `FACT-FORCING GATE: You must Read "${filePath}" before editing it. Read the file first to understand its current state, then retry the edit.`,
        }));
        return;
      }

      process.stdout.write(JSON.stringify({ decision: 'approve' }));
      return;
    }

    // Unknown tool — approve
    process.stdout.write(JSON.stringify({ decision: 'approve' }));
  } catch {
    // On error, don't block workflow
    process.stdout.write(JSON.stringify({ decision: 'approve' }));
  }
});

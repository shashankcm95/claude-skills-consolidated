#!/usr/bin/env node

// PreToolUse hook: fact-forcing gate
// Blocks Edit/Write on a file that hasn't been Read first in this session.
// Prevents hallucinated edits — you must see the code before changing it.
//
// How it works:
//   - Matcher: "Read|Edit|Write"
//   - On Read: records the file_path in a session-scoped tracker file
//   - On Edit/Write: checks if the file_path was previously recorded
//   - Blocks with a clear message if the file hasn't been read
//
// Race condition prevention:
//   - Tracker is scoped per session via CLAUDE_SESSION_ID or PPID
//   - Writes use atomic rename to prevent partial-write corruption

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./_log.js');
const logger = log('fact-force-gate');

// Session-scoped tracker: isolates parallel agents and separate sessions
const SESSION_ID = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CONVERSATION_ID || String(process.ppid || 'default');
const TRACKER_PATH = path.join(os.tmpdir(), `claude-read-tracker-${SESSION_ID}.json`);

function loadTracker() {
  try {
    const raw = fs.readFileSync(TRACKER_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { files: {}, sessionStart: Date.now() };
  }
}

function saveTracker(tracker) {
  // Atomic write: write to temp file, then rename. Do NOT fall back to a
  // non-atomic write — concurrent readers seeing a half-written tracker
  // get parse errors and reset to {files:{}}, which silently disables the
  // fact-forcing gate. A missed update is recoverable; corruption is not.
  const tmpFile = TRACKER_PATH + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(tracker, null, 2));
    fs.renameSync(tmpFile, TRACKER_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup failure */ }
    logger('atomic_write_failed', { error: err.message });
    // Intentionally don't re-throw — hook should fail open, not block tools
  }
}

function normalizePath(filePath) {
  if (!filePath) return '';
  const resolved = path.resolve(filePath);
  // Resolve symlinks for consistent tracking
  try { return fs.realpathSync(resolved); } catch { return resolved; }
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
      logger('approve', { toolName, reason: 'no_file_path' });
      process.stdout.write(JSON.stringify({ decision: 'approve' }));
      return;
    }

    const tracker = loadTracker();

    if (toolName === 'Read') {
      tracker.files[filePath] = Date.now();
      saveTracker(tracker);
      logger('read_recorded', { filePath });
      process.stdout.write(JSON.stringify({ decision: 'approve' }));
      return;
    }

    if (toolName === 'Edit' || toolName === 'Write') {
      const wasRead = tracker.files[filePath];

      if (toolName === 'Write' && !fs.existsSync(filePath)) {
        // Detect rm-then-Write bypass attempt: file was previously Read
        // (so it existed) but is now gone. Could be legitimate
        // (delete-and-recreate) or a deliberate bypass via Bash rm.
        // Log for audit; full enforcement requires a Bash hook to track
        // rm operations explicitly.
        if (wasRead) {
          logger('write_to_deleted_file', {
            filePath,
            readAt: wasRead,
            note: 'File was previously Read but no longer exists. Possible rm-then-Write bypass.',
          });
        }
        logger('approve', { toolName, filePath, reason: 'new_file' });
        process.stdout.write(JSON.stringify({ decision: 'approve' }));
        return;
      }

      if (!wasRead) {
        logger('block', { toolName, filePath, reason: 'not_read' });
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: `FACT-FORCING GATE: You must Read "${filePath}" before editing it. Read the file first to understand its current state, then retry the edit.`,
        }));
        return;
      }

      logger('approve', { toolName, filePath, reason: 'previously_read' });
      process.stdout.write(JSON.stringify({ decision: 'approve' }));
      return;
    }

    logger('approve', { toolName, reason: 'unknown_tool' });
    process.stdout.write(JSON.stringify({ decision: 'approve' }));
  } catch (err) {
    logger('error', { error: err.message });
    process.stdout.write(JSON.stringify({ decision: 'approve' }));
  }
});

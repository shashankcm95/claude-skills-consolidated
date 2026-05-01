#!/usr/bin/env node

// PreToolUse hook: fact-forcing gate
// Blocks Edit/Write on a file that hasn't been Read first in this session.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./_log.js');
const logger = log('fact-force-gate');

// Session-scoped tracker. PPID is the key: child hook processes spawned
// from the same Claude Code parent share the parent's PPID, so reads
// and subsequent edits hit the same tracker file.
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
  // Atomic write: write to temp file, then rename.
  const tmpFile = TRACKER_PATH + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(tracker, null, 2));
    fs.renameSync(tmpFile, TRACKER_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    logger('atomic_write_failed', { error: err.message });
  }
}

function normalizePath(filePath) {
  if (!filePath) return '';
  const resolved = path.resolve(filePath);
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

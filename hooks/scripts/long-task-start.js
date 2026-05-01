#!/usr/bin/env node

// PreToolUse hook: tracks slow tool invocations and spawns a detached
// watcher that fires a notification if the tool runs longer than threshold.
//
// Event-driven, not polling — the watcher uses kernel-level sleep (0% CPU
// while waiting). Watcher exits silently if PostToolUse marks the tool
// as completed before the threshold elapses.
//
// Watched tools: Bash, Task, WebFetch, WebSearch, all MCP tools.
// Not watched: Read, Edit, Write, Grep, Glob — these complete in ms.
//
// Configuration:
//   CLAUDE_LONG_TASK_THRESHOLD_SEC=30   threshold in seconds (default 30)
//   CLAUDE_LONG_TASK_DISABLE=1          turn off entirely

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const WATCH_PATTERN = /^(Bash|Task|WebFetch|WebSearch|mcp__.*)$/;
const SESSION_ID = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CONVERSATION_ID || String(process.ppid || 'default');
const TRACKER_FILE = path.join(os.tmpdir(), `claude-long-tasks-${SESSION_ID}.json`);
const THRESHOLD_SEC = parseInt(process.env.CLAUDE_LONG_TASK_THRESHOLD_SEC || '30', 10);
const DISABLED = process.env.CLAUDE_LONG_TASK_DISABLE === '1';
const WATCHER_SCRIPT = path.join(__dirname, 'long-task-watcher.js');

function summarize(toolName, toolInput) {
  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    return cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd;
  }
  if (toolName === 'Task') {
    return `subagent: ${toolInput.subagent_type || 'general'}`;
  }
  if (toolName.startsWith('mcp__')) {
    return toolName.replace(/^mcp__/, '');
  }
  if (toolName === 'WebFetch') {
    return toolInput.url || '';
  }
  if (toolName === 'WebSearch') {
    return toolInput.query || '';
  }
  return toolName;
}

function loadTracker() {
  try {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return { tools: {} };
  }
}

function saveTracker(tracker) {
  const tmpFile = TRACKER_FILE + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(tracker));
    fs.renameSync(tmpFile, TRACKER_FILE);
  } catch {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  // Always approve — this hook is purely observational, not a gate
  process.stdout.write(JSON.stringify({ decision: 'approve' }));

  if (DISABLED) return;

  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    if (!WATCH_PATTERN.test(toolName)) return;

    const toolUseId = data.tool_use_id || `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toolInput = data.tool_input || {};

    const entry = {
      toolUseId,
      name: toolName,
      summary: summarize(toolName, toolInput),
      started: Date.now(),
      completed: null,
    };

    const tracker = loadTracker();
    tracker.tools[toolUseId] = entry;
    saveTracker(tracker);

    // Spawn detached watcher — sleeps until threshold, then checks tracker
    const child = spawn('node', [WATCHER_SCRIPT, toolUseId, SESSION_ID, String(THRESHOLD_SEC)], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Never block tool execution on hook errors
  }
});

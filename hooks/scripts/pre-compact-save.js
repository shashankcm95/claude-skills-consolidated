#!/usr/bin/env node

// PreCompact hook: deterministically saves a checkpoint of the conversation
// context to a local file, THEN instructs Claude to enrich it with MemPalace.
//
// This follows "hooks over prompts" — the deterministic write always happens,
// regardless of whether the LLM follows the MemPalace instruction.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./_log.js');
const logger = log('pre-compact-save');

// Deterministic checkpoint: extract key signals from the input
function extractCheckpoint(inputText) {
  const timestamp = new Date().toISOString();
  const cwd = process.cwd();

  // Extract file paths mentioned in the conversation (heuristic)
  const filePathPattern = /(?:\/[\w.-]+)+\.\w+/g;
  const mentionedFiles = [...new Set(inputText.match(filePathPattern) || [])].slice(0, 20);

  return {
    timestamp,
    cwd,
    mentionedFiles,
    contextLength: inputText.length,
    summary: 'Pre-compact checkpoint — context was compressed after this point.',
  };
}

function writeCheckpoint(checkpoint) {
  // Write to a predictable location that survives compaction
  const checkpointDir = path.join(os.homedir(), '.claude', 'checkpoints');
  try {
    fs.mkdirSync(checkpointDir, { recursive: true });
  } catch { /* exists */ }

  const checkpointFile = path.join(checkpointDir, 'last-compact.json');
  const historyFile = path.join(checkpointDir, 'compact-history.jsonl');

  // Write latest checkpoint (overwrite)
  fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));

  // Append to history (keep last 50 entries)
  fs.appendFileSync(historyFile, JSON.stringify(checkpoint) + '\n');

  // Trim history if too large (keep last 50 lines)
  try {
    const lines = fs.readFileSync(historyFile, 'utf8').trim().split('\n');
    if (lines.length > 50) {
      fs.writeFileSync(historyFile, lines.slice(-50).join('\n') + '\n');
    }
  } catch { /* ignore trim errors */ }
}

// The prompt for Claude to do the intelligent part (MemPalace + memory)
const SAVE_PROMPT = `BEFORE COMPACTING — A checkpoint has been saved to ~/.claude/checkpoints/last-compact.json.

Now do the intelligent part that only you can do:

1. **Update project MEMORY.md** with: current task status, key decisions, discovered patterns, next steps.
2. **Store in MemPalace** (if MCP available): session learnings, domain conventions, forged agent personality. If MemPalace is unavailable, write to ~/.claude/checkpoints/mempalace-fallback.md instead.
3. **Self-improvement candidates**: patterns that recurred, gaps detected, rules to codify.

The checkpoint file has the file paths and timestamp. You provide the meaning.`;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let checkpointOk = false;
  try {
    const checkpoint = extractCheckpoint(input);
    writeCheckpoint(checkpoint);
    checkpointOk = true;
    logger('checkpoint_saved', {
      contextLength: input.length,
      mentionedFiles: checkpoint.mentionedFiles.length,
      cwd: checkpoint.cwd,
    });
  } catch (err) {
    logger('error', { error: err.message });
  }

  // Only emit SAVE_PROMPT when the checkpoint was actually written.
  // Otherwise Claude would be told to reference a file that doesn't exist.
  const suffix = checkpointOk
    ? '\n\n---\n' + SAVE_PROMPT
    : '\n\n---\n[pre-compact-save: checkpoint write failed — MemPalace instruction skipped to avoid hallucinated file references]';
  process.stdout.write(input + suffix);
});

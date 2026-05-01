#!/usr/bin/env node

// Prompt pattern storage CLI — used by the prompt-enrichment skill to
// persist approved enrichment patterns and look them up on future prompts.
//
// Storage: ~/.claude/prompt-patterns.json (local fallback when MemPalace
// MCP isn't available — the canonical location for the toolkit).
//
// Subcommands:
//   store    — record a new pattern or increment its approval count
//   lookup   — find similar patterns for a raw prompt
//   list     — show all stored patterns
//   stats    — summary: total patterns, top patterns by approval count
//
// Usage examples:
//   node prompt-pattern-store.js store --raw "fix the auth" --enriched "..." --category "bugfix"
//   node prompt-pattern-store.js lookup --raw "fix the auth"
//   node prompt-pattern-store.js list
//   node prompt-pattern-store.js stats

const fs = require('fs');
const path = require('path');
const os = require('os');
// Phase-F3: this is a CLI utility, not a hook — moved to scripts/.
// Look for _log.js in ../hooks/scripts/ (canonical) or ./_log.js
// (compat for old layouts).
let makeLogger;
try {
  ({ log: makeLogger } = require('../hooks/scripts/_log.js'));
} catch {
  try {
    ({ log: makeLogger } = require('./_log.js'));
  } catch {
    makeLogger = () => () => {}; // no-op logger if helper missing
  }
}
const log = makeLogger('prompt-pattern-store');

const STORE_PATH = path.join(os.homedir(), '.claude', 'prompt-patterns.json');
const LOCK_PATH = STORE_PATH + '.lock';
const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 30000;
const MAX_PATTERNS = 500; // F5: LRU eviction threshold

// Acquire an exclusive advisory lock by atomically creating a lockfile
// (O_CREAT | O_EXCL via 'wx' flag). Retries with backoff if the lock is
// held; clears stale locks (> 30s old). Returns true on success, false
// on timeout. Caller MUST call releaseLock() in a finally block.
function acquireLock() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const start = Date.now();
  let backoff = 10;
  while (Date.now() - start < LOCK_TIMEOUT_MS) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: Date.now() }));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Lock exists. Check if it's stale.
      try {
        const stat = fs.statSync(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(LOCK_PATH);
          continue;
        }
      } catch { /* lock vanished — race fine, retry */ }
      // Wait with exponential backoff, capped at 200ms
      const sleep = Math.min(backoff, 200);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleep);
      backoff *= 2;
    }
  }
  return false;
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* already gone — fine */ }
}

// Run a function under exclusive lock. Re-reads the store inside the lock
// to close the TOCTOU window from the original load → mutate → save flow.
function withLock(fn) {
  if (!acquireLock()) {
    log('lock_timeout', { timeout_ms: LOCK_TIMEOUT_MS });
    console.error(`Error: could not acquire pattern store lock within ${LOCK_TIMEOUT_MS}ms`);
    process.exit(2);
  }
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { patterns: [], version: 1 };
  }
}

function saveStore(store) {
  const tmpFile = STORE_PATH + '.tmp.' + process.pid;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2));
    fs.renameSync(tmpFile, STORE_PATH);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw err;
  }
}

// Normalize prompts for fuzzy comparison.
// Phase-F6: Unicode-normalize and strip zero-width/control chars to
// prevent dedup bypass via lookalike characters (fix the auth vs
// f​ix the auth).
function normalize(prompt) {
  return prompt
    .normalize('NFKC')                              // canonical decomposition + compatibility
    .replace(/[​-‏⁠﻿\x00-\x08\x0E-\x1F\x7F]/g, '')  // zero-width + control chars
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
}

// Simple Jaccard similarity on word sets
function similarity(a, b) {
  const aWords = new Set(normalize(a).split(/\W+/).filter(Boolean));
  const bWords = new Set(normalize(b).split(/\W+/).filter(Boolean));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let intersection = 0;
  for (const w of aWords) if (bWords.has(w)) intersection++;
  return intersection / (aWords.size + bWords.size - intersection);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      // Phase-E2: don't consume the next token if it's another --flag
      // (avoids silently mismapping when a flag value is missing)
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true; // boolean flag form
      }
    }
  }
  return args;
}

function cmdStore(args) {
  // Phase-E2: validate string values (not just truthy) — parseArgs may
  // assign `true` for missing values, which then crashes downstream.
  if (typeof args.raw !== 'string' || typeof args.enriched !== 'string' ||
      !args.raw.trim() || !args.enriched.trim()) {
    console.error('Error: --raw and --enriched are required (must be non-empty strings)');
    process.exit(1);
  }

  withLock(() => {
    // Load INSIDE the lock — this closes the TOCTOU race where two
    // concurrent stores both read count=N and both write count=N+1
    // (true count should be N+2).
    const store = loadStore();
    // Phase-E5: removed dead variable `normalizedRaw` (similarity()
    // handles normalization internally).
    const existing = store.patterns.find((p) => similarity(p.raw, args.raw) >= 0.6);

    if (existing) {
      existing.approvalCount = (existing.approvalCount || 1) + 1;
      existing.lastUsed = new Date().toISOString();
      if (args.enriched) existing.enriched = args.enriched;
      if (args.category) existing.category = args.category;
      if (args.modified === 'true') existing.userModified = true;
      saveStore(store);
      log('store_updated', { raw: args.raw.slice(0, 80), approvalCount: existing.approvalCount });
      console.log(JSON.stringify({
        action: 'updated',
        approvalCount: existing.approvalCount,
        tier: tierFor(existing.approvalCount),
        pattern: existing,
      }, null, 2));
      return;
    }

    const pattern = {
      raw: args.raw,
      enriched: args.enriched,
      category: args.category || 'uncategorized',
      techniques: args.techniques ? args.techniques.split(',') : [],
      approvalCount: 1,
      userModified: args.modified === 'true',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };
    store.patterns.push(pattern);

    // Phase-F5: LRU eviction. Keep only the MAX_PATTERNS most-recently-
    // used patterns (sorted by lastUsed). Prevents unbounded growth
    // and keeps lookup fast.
    if (store.patterns.length > MAX_PATTERNS) {
      const before = store.patterns.length;
      store.patterns.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
      store.patterns = store.patterns.slice(0, MAX_PATTERNS);
      log('lru_evicted', { evicted: before - store.patterns.length });
    }

    saveStore(store);
    log('store_new', { raw: args.raw.slice(0, 80), category: pattern.category });
    console.log(JSON.stringify({
      action: 'created',
      approvalCount: 1,
      tier: tierFor(1),
      pattern,
    }, null, 2));
  });
}

function tierFor(approvalCount) {
  if (approvalCount >= 5) return 'Independent';
  if (approvalCount >= 3) return 'Trusted';
  if (approvalCount >= 1) return 'Familiar';
  return 'Learning';
}

function cmdLookup(args) {
  if (!args.raw) {
    console.error('Error: --raw is required');
    process.exit(1);
  }

  const store = loadStore();
  const matches = store.patterns
    .map((p) => ({ pattern: p, score: similarity(p.raw, args.raw) }))
    .filter((m) => m.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  log('lookup', { raw: args.raw.slice(0, 80), matchCount: matches.length });

  if (matches.length === 0) {
    console.log(JSON.stringify({ action: 'lookup', matches: [] }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    action: 'lookup',
    bestMatch: matches[0].score >= 0.6 ? matches[0] : null,
    bestMatchTier: matches[0].score >= 0.6 ? tierFor(matches[0].pattern.approvalCount) : null,
    matches: matches.map((m) => ({
      similarity: Math.round(m.score * 100) / 100,
      raw: m.pattern.raw,
      tier: tierFor(m.pattern.approvalCount),
      approvalCount: m.pattern.approvalCount,
    })),
  }, null, 2));
}

function cmdList() {
  const store = loadStore();
  console.log(JSON.stringify({
    total: store.patterns.length,
    patterns: store.patterns.map((p) => ({
      raw: p.raw,
      category: p.category,
      tier: tierFor(p.approvalCount),
      approvalCount: p.approvalCount,
      lastUsed: p.lastUsed,
    })),
  }, null, 2));
}

function cmdStats() {
  const store = loadStore();
  const byCategory = {};
  const byTier = { Learning: 0, Familiar: 0, Trusted: 0, Independent: 0 };
  for (const p of store.patterns) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
    byTier[tierFor(p.approvalCount)]++;
  }
  const top = [...store.patterns]
    .sort((a, b) => b.approvalCount - a.approvalCount)
    .slice(0, 5)
    .map((p) => ({ raw: p.raw, approvalCount: p.approvalCount }));

  console.log(JSON.stringify({
    total: store.patterns.length,
    storePath: STORE_PATH,
    byTier,
    byCategory,
    top,
  }, null, 2));
}

const [, , subcommand, ...rest] = process.argv;
const args = parseArgs(rest);

switch (subcommand) {
  case 'store':  cmdStore(args); break;
  case 'lookup': cmdLookup(args); break;
  case 'list':   cmdList(); break;
  case 'stats':  cmdStats(); break;
  default:
    console.error('Usage: prompt-pattern-store {store|lookup|list|stats} [args]');
    console.error('  store  --raw "..." --enriched "..." [--category "..."] [--techniques "a,b,c"] [--modified true]');
    console.error('  lookup --raw "..."');
    console.error('  list');
    console.error('  stats');
    process.exit(1);
}

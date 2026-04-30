#!/usr/bin/env node

// SessionStart hook: resets the fact-forcing gate tracker.
// Each new session starts with a clean slate — you must Read before Edit/Write.

const fs = require('fs');

const TRACKER_PATH = '/tmp/claude-read-tracker.json';

try {
  const tracker = {
    files: {},
    sessionStart: Date.now(),
  };
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
} catch {
  // Non-critical — if we can't reset, the gate still works
  // (it just remembers reads from previous sessions)
}

// SessionStart hooks don't produce output

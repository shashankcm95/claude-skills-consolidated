#!/usr/bin/env node

// PreCompact hook: instructs Claude to save critical context to both
// project memory files AND MemPalace before context window compression.
// This ensures nothing is lost when the context resets.

const SAVE_PROMPT = `BEFORE COMPACTING — You MUST save critical context now:

## Step 1: Write to Project Memory
Update the project's MEMORY.md (or CLAUDE.md) with:
- **Current task**: What you're working on and its status
- **Key decisions**: Architectural or design decisions made this session
- **Discovered patterns**: Recurring workflows or conventions observed
- **File paths**: Which files are being actively modified
- **Next steps**: What should happen after compaction

## Step 2: Store in MemPalace (if MCP available)
Use MemPalace MCP tools to persist deeper context:
- store_memory: Save session learnings with semantic tags
- Include: task context, discovered conventions, failure patterns, success patterns
- Tag with project name and current date for future recall
- Store any forged agent/skill personality accumulated this session

## Step 3: Record Self-Improvement Candidates
If you noticed any of these during the session, note them in memory:
- Patterns that appeared 2+ times (promotion candidates)
- Gaps where a specialized agent/skill would have helped
- Rules that were followed but aren't yet codified
- Existing rules or skills that felt outdated

This context will be LOST if you don't save it now. Act immediately.`;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  process.stdout.write(SAVE_PROMPT + '\n\n' + input);
});

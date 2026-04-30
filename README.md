# claude-toolkit

A curated, opinionated enhancement layer for Claude Code. Eight hooks, eight rules, seven skills, five agents, and seven slash commands working together to make Claude more reliable, less hallucinatory, and continuously self-improving — across any project, any stack.

**Repository**: https://github.com/shashankcm95/claude-skills-consolidated

---

## What's Inside

| Layer | Count | Invocation |
|-------|-------|------------|
| **Hooks** (deterministic scripts) | 8 | Automatic on Claude Code events |
| **Rules** (always-on guidance) | 8 | Injected into every session |
| **Agents** (scoped specialists) | 5 | Claude delegates when needed |
| **Skills** (workflow guides) | 7 | Claude matches to tasks |
| **Commands** (manual shortcuts) | 7 | User types `/command-name` |

---

## Design Philosophy

1. **Hooks over prompts** — Critical behaviors run as deterministic scripts, not LLM instructions that can be forgotten under context pressure.
2. **Read before write** — A PreToolUse hook blocks Edit/Write until the target file has been Read in the current session, eliminating hallucinated edits.
3. **Vagueness has a deterministic gate** — A UserPromptSubmit hook detects vague prompts before Claude processes them and forces 4-part enrichment that's impossible to skip.
4. **Memory at boundaries** — A PreCompact hook deterministically writes a checkpoint file, then prompts Claude to enrich it with MemPalace storage before context compression.
5. **Focus-aware UX** — Notifications fire only when Claude Code is in the background; you don't get pinged while you're already watching the terminal.
6. **Least privilege** — Each agent declares its tools and model tier explicitly. Opus for reasoning-heavy work (planner, architect), Sonnet for mechanical work (reviewer, optimizer).
7. **Self-improvement loop** — Patterns flow from session memory → MemPalace → permanent rules as they prove themselves across multiple sessions.
8. **Graceful degradation** — Every MemPalace dependency has a local-file fallback (`~/.claude/prompt-patterns.json`, `~/.claude/checkpoints/`).

---

## Component Deep-Dives

### Hooks (8) — The Deterministic Layer

Hook scripts run as external Node.js processes triggered by Claude Code's lifecycle events. They're the only layer with hard guarantees — pure logic, no LLM interpretation.

#### 1. `fact-force-gate.js` — Anti-Hallucination Read Tracker
**Event**: `PreToolUse` on `Read|Edit|Write`

Maintains a per-session JSON tracker of every file Claude has Read. When Claude attempts an Edit or Write, the hook checks the tracker:
- File was Read this session → approve
- File doesn't exist yet (new Write) → approve
- File exists but wasn't Read → **block** with: *"FACT-FORCING GATE: You must Read X before editing it."*

**Inner logic**: Tracker file is session-scoped via `CLAUDE_SESSION_ID` env var (or PPID fallback) at `os.tmpdir()/claude-read-tracker-{id}.json`. Writes use atomic rename (`writeFileSync` to `.tmp`, then `renameSync`) to prevent corruption from concurrent agents. Symlinks are resolved via `fs.realpathSync` for consistent tracking.

#### 2. `session-reset.js` — Tracker Hygiene
**Event**: `SessionStart`

Wipes the current session's tracker for a clean slate, and garbage-collects tracker files older than 24 hours from `tmpdir`.

#### 3. `config-guard.js` — Linter/Formatter Protection
**Event**: `PreToolUse` on `Edit|Write`

Blocks edits to files matching anchored regex patterns: `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `biome.json[c]`, `tsconfig*.json`, `.editorconfig`, `.stylelintrc*`. The patterns use `(?:^|\/)` anchors to match only true config files (not `not-a-tsconfig.json`).

**Why**: Forces Claude to fix code to satisfy the existing config, not weaken the config to permit broken code.

#### 4. `console-log-check.js` — Pre-Commit Lint
**Event**: `Stop`

Runs `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` to find both modified and brand-new TS/JS files, then scans them for `console.log(` calls. Skips lines with `// eslint-disable`, `/* eslint-disable */`, or `eslint-disable-next-line` on the previous line.

If any are found, appends a warning to the response: *"⚠ console.log detected in edited files: ... Remove before committing."*

Uses `git rev-parse --show-toplevel` to resolve absolute paths — works correctly in monorepos and from non-root cwd.

#### 5. `pre-compact-save.js` — Hybrid Deterministic Memory
**Event**: `PreCompact`

Two-phase save before context compression:
- **Deterministic phase**: Extracts file paths from the conversation (regex-based, deduplicated, capped at 20), writes a JSON checkpoint to `~/.claude/checkpoints/last-compact.json` and appends to `compact-history.jsonl` (rolling 50 entries).
- **LLM phase**: Appends a `SAVE_PROMPT` instruction telling Claude to update project `MEMORY.md`, store learnings in MemPalace (or fall back to `~/.claude/checkpoints/mempalace-fallback.md`), and capture self-improvement candidates.

The deterministic phase always succeeds, even if the LLM ignores the prompt. Instructions go *after* the input to avoid polluting the compacted summary.

#### 6. `desktop-notify.js` — Completion Notification
**Event**: `Stop` (async, non-blocking)

Sends a desktop notification when Claude finishes a response. Uses `osascript` on macOS, `notify-send` on Linux, silently skipped elsewhere. **Focus-aware** via `_focus.js` — skipped if Claude/terminal is currently the frontmost app.

#### 7. `notify-waiting.js` — Permission/Idle Notification
**Event**: `Notification` (async, non-blocking)

Fires when Claude is waiting for the user. Two notification types handled:
- `permission_prompt`: *"Claude needs permission — Approve {tool_name} to continue."*
- `idle_prompt`: *"Claude is waiting — Idle for {N}s — your input is needed."*

**Inner logic**: 20-second cooldown per notification key (e.g., `permission:Bash`) stored in `tmpdir/claude-notify-waiting-cooldown.json` to prevent spam. Different macOS sounds per type (Ping for permission, Pop for idle, Glass for completion). Focus-aware. Override via `CLAUDE_NOTIFY_ALWAYS=1` or `CLAUDE_NOTIFY_NEVER=1`.

#### 8. `prompt-enrich-trigger.js` — Vagueness Forcing Gate
**Event**: `UserPromptSubmit`

Heuristic vagueness detection runs on every user prompt before Claude processes it (~5ms, regex-based, no I/O). Two-stage classification:

**Skip patterns** (silent pass-through):
- Slash commands (`/review`, `/plan`)
- Confirmations (`yes`, `no`, `approve`, `cancel`)
- Wh-questions (`what`, `how`, `where`, `why`, `when`)
- Aux-verb questions (`is the file ready`, `does the test pass`)
- `do + pronoun` questions (`do you have time`) — but NOT `do + article` imperatives (`do the cleanup`)
- Verb-first commands (`run tests`, `commit this`)
- Tool-prefixed (`git push`, `npm install`, `cargo build`)
- Show/explain requests
- Anything with file paths or specific entities (PascalCase, URLs, backticks, quoted strings)

**Vague signals** (inject forcing instruction):
- Generic action verb + generic noun: `fix the X`, `improve the Y`, `clean it up`, `refactor it`
- Length < 15 chars without file path or entity
- `make it better/faster/cleaner` patterns
- `do something/the thing/stuff` patterns

When vague, injects `[PROMPT-ENRICHMENT-GATE]` text that forces Claude to: check MemPalace for similar past prompts, build the 4-part enriched prompt (Instructions / Context / Input Data / Output Indicator), show it to the user for approval, store the pattern on approval.

**Detection accuracy**: 24/24 on test corpus.

#### `_focus.js` — Shared Focus Detection Helper

Detects whether Claude Code is currently the frontmost (focused) app:
- **macOS**: `osascript` queries System Events for the frontmost application name
- **Linux**: `xdotool getactivewindow getwindowname` returns the active window
- Recognizes Claude Desktop, Claude Code, all major terminals (Terminal, iTerm2, Warp, Hyper, Alacritty, kitty, WezTerm, Tabby, Ghostty), and editors with integrated terminals (VS Code, Cursor, Windsurf, Zed)
- Env var overrides: `CLAUDE_NOTIFY_ALWAYS=1`, `CLAUDE_NOTIFY_NEVER=1`

---

### Rules (8) — The Always-On Guidance Layer

Rules are markdown files injected into every session's context. They shape Claude's reasoning but rely on instruction-following — no enforcement mechanism beyond the model.

| Rule | What it enforces |
|------|------------------|
| `core/fundamentals.md` | KISS / DRY / YAGNI, immutability, files <800 lines, functions <50 lines, no nesting >4 levels, explicit error handling, schema-based input validation, naming conventions |
| `core/security.md` | No hardcoded secrets, parameterized SQL, output escaping, CSRF protection, auth on every protected route, rate limiting, security response protocol (stop work → invoke security-auditor → fix → rotate) |
| `core/workflow.md` | Conventional commits, feature branches, <400-line PRs, 80%+ coverage on critical paths, code review checklist (security → correctness → performance → readability) |
| `core/research-mode.md` | Epistemic honesty (say "I don't know" if no source), Read files before claiming what's in them, cite every factual claim about external libs/APIs |
| `core/self-improvement.md` | Gap detection (throttled — observe silently, batch for session-end), pre-compact awareness, pointer to skill-forge for procedure |
| `core/prompt-enrichment.md` | Vagueness detection criteria, skip patterns, MemPalace fallback path, sub-agent enrichment requirement |
| `typescript/style.md` | Type discipline, Zod validation at boundaries, no console.log in production code |
| `web/react-nextjs.md` | Server/client component boundaries, hooks rules, key prop discipline, Server Action conventions |

---

### Agents (5) — The Specialist Layer

Each agent is a `.md` file with YAML frontmatter declaring its name, description, tools, model tier, and color. Claude delegates to them when it judges a specialist would help.

| Agent | Model | Tools | Specialty |
|-------|-------|-------|-----------|
| `planner` | opus | Read, Grep, Glob | Phased implementation planning, dependency mapping, parallelization analysis |
| `architect` | opus | Read, Grep, Glob | System design, ADRs, evaluating trade-offs between competing approaches |
| `code-reviewer` | sonnet | Read, Grep, Glob, Bash | Severity-based review (Critical/High/Medium/Low), security → correctness → performance → readability |
| `security-auditor` | sonnet | Read, Write, Edit, Bash, Grep, Glob | OWASP Top 10 audit, secret detection, auth/authz verification, can fix critical vulnerabilities |
| `optimizer` | sonnet | Read, Grep, Glob, Bash, Edit | Harness configuration tuning, agent performance analysis, hook efficiency, MCP health |

---

### Skills (7) — The Workflow Layer

Skills are markdown procedures Claude matches to tasks contextually. They contain step-by-step workflows that complement the rules.

| Skill | What it does |
|-------|-------------|
| `fullstack-dev` | Server-first development workflow: data layer → API layer → UI layer → tests |
| `deploy-checklist` | Pre-deployment verification: tests, migrations, env vars, bundle size, rollback plan, monitoring |
| `agent-swarm` | Multi-agent orchestration: identifying parallelizable work, dispatching to specialists, merging results |
| `research-mode` | Anti-hallucination workflow: source cascade (local files → WebSearch → WebFetch), citation format `[Source: path:line]`, max 5 searches/3 fetches per question |
| `self-improve` | Memory-to-rules promotion pipeline: scan MEMORY.md → identify recurring patterns → promote to rules/skills/agents → prune stale entries |
| `skill-forge` | Dynamic agent/skill creation at runtime: gap detection → name + scope + model + tools → create file in repo + ~/.claude/ → store in MemPalace |
| `prompt-enrichment` | 4-part structured prompt builder triggered by the vagueness hook. Confidence tiers: **Learning** (0 approvals, full review), **Familiar** (1-2, light confirmation), **Trusted** (3-4, summary auto-proceed), **Independent** (5+, silent enrichment) |

---

### Commands (7) — The Manual Shortcut Layer

Commands are `.md` files invoked by typing `/command-name`. They're explicit triggers; the same behaviors are also available as automatic rules where appropriate.

| Command | Action |
|---------|--------|
| `/review` | Delegate to code-reviewer agent |
| `/plan` | Delegate to planner agent |
| `/security-audit` | Delegate to security-auditor agent |
| `/self-improve` | Run the full self-improvement review cycle |
| `/forge` | Create a new agent or skill on the fly |
| `/evolve` | Update an existing agent/skill with new learnings |
| `/prune` | Remove stale memory entries, duplicate rules, unused skills |

---

### MemPalace Integration (Optional)

MemPalace is a local MCP server that provides persistent semantic memory across sessions. When available, the toolkit uses it for:
- **Pre-compact storage**: Session learnings, decisions, conventions stored before context compression
- **Prompt patterns**: The `prompt-patterns` room stores raw→enriched prompt mappings with approval counts for the prompt-enrichment confidence-tier system
- **Forged agent personality**: Agents created via `/forge` accumulate experience across sessions
- **Self-improvement candidates**: Recurring patterns surface here for promotion to rules

When MemPalace is **not** installed, all components fall back to local files:
- Pre-compact → `~/.claude/checkpoints/last-compact.json` + `mempalace-fallback.md`
- Prompt patterns → `~/.claude/prompt-patterns.json`
- Forged agents → just live in `~/.claude/agents/` as usual

---

## How Components Are Invoked

| Component | Trigger | User action needed? |
|-----------|---------|-------------------|
| **Hooks** | Claude Code lifecycle events (file edit, session start, etc.) | None — fully automatic |
| **Rules** | Injected into every session silently | None — fully automatic |
| **Agents** | Claude delegates to specialists when needed | None — Claude decides |
| **Skills** | Claude matches to current task from available list | None — Claude picks them up |
| **Commands** | User types `/command-name` in chat | Yes — manual shortcut |

For non-technical users: **rules and hooks are always active**. You don't need to type anything to benefit from anti-hallucination, prompt enrichment, or pre-compact memory — they just work.

---

## Install

```bash
# Clone the repo
git clone https://github.com/shashankcm95/claude-skills-consolidated.git ~/Documents/claude-toolkit
cd ~/Documents/claude-toolkit

# Preview what would change
./install.sh --diff --all

# Install everything with backup and smoke tests
./install.sh --backup --all --test

# Or install selectively
./install.sh --agents --rules --hooks
```

### Installer Flags

| Flag | Effect |
|------|--------|
| `--all` | Install agents, rules, hooks, commands, skills |
| `--agents` / `--rules` / `--hooks` / `--commands` / `--skills` | Install selectively |
| `--diff` | Dry run: show what would change without installing |
| `--backup` | Snapshot existing `~/.claude/` to `~/.claude/backups/backup-{timestamp}/` |
| `--test` | Run 8-point smoke test suite after install (verifies hooks fire correctly) |

### Hook Configuration

Hook scripts copy automatically; the configuration must be merged into `~/.claude/settings.json`. Reference template at `hooks/settings-reference.json` — replace `HOME_DIR` with your home directory path.

### MemPalace Setup (Optional)

```bash
pip3 install mempalace
mempalace init --yes
```

Add to `~/.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "mempalace": {
      "command": "mempalace",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

Restart Claude Code to connect the MCP server.

---

## Project Structure

```
claude-toolkit/
├── agents/                  # 5 agents with YAML frontmatter
├── rules/
│   ├── core/                # 6 always-on core rules
│   ├── typescript/          # 1 language-specific rule
│   └── web/                 # 1 framework-specific rule
├── hooks/
│   ├── scripts/             # 8 hook scripts + 1 shared helper (_focus.js)
│   └── settings-reference.json  # Hook config template
├── commands/                # 7 slash command definitions
├── skills/                  # 7 skill workflow guides (each in own dir)
├── install.sh               # Installer with --diff, --backup, --test
├── ATTRIBUTION.md           # Detailed attribution
├── LICENSE                  # MIT
└── README.md                # This file
```

---

## Extending

| Goal | Use a... | File location |
|------|----------|---------------|
| Always-active behavior | **Rule** | `rules/{category}/{name}.md` |
| Deterministic block/modify on tool calls | **Hook** | `hooks/scripts/{name}.js` + entry in `settings-reference.json` |
| Specialist Claude delegates to | **Agent** | `agents/{name}.md` (with YAML frontmatter) |
| Multi-step workflow Claude follows when relevant | **Skill** | `skills/{name}/SKILL.md` |
| Explicit shortcut a user types | **Command** | `commands/{name}.md` |

---

## References & Attribution

This toolkit is original code, but its architectural patterns and design philosophies were informed by the following open-source projects. All referenced projects are under MIT or permissive licenses; **no code was copied** — only patterns and concepts were studied.

### Repositories That Shaped This Toolkit

#### [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — Affaan Mustafa
**Patterns extracted**:
- **Hook architecture**: PreToolUse / PostToolUse / Stop / PreCompact / SessionStart event model
- **Config-guard hook**: Blocking edits to linter/formatter configs to force code fixes over config weakening
- **Agent delegation**: Specialist agents with scoped tools and explicit model tier (opus vs sonnet)
- **Rules-as-guardrails**: Always-on markdown injection pattern for behavioral guidance
- **Continuous learning instinct**: Capture pattern signals during work for later promotion

#### [MemPalace](https://github.com/mempalace/mempalace) — MemPalace contributors
**Patterns extracted**:
- **Pre-compaction memory save**: PreCompact hook that preserves context before window compression — the model architecture for our `pre-compact-save.js`
- **"Hooks over prompts" principle**: Deterministic shell scripts beat LLM instructions for critical behaviors
- **MCP-based persistent memory**: Using a Model Context Protocol server for cross-session semantic memory
- **Memory hierarchy metaphor**: Palace → Wing → Room → Drawer organizational structure (informed our `prompt-patterns` room concept)

#### [MiroFish](https://github.com/666ghj/MiroFish) — 666ghj and contributors
**Patterns extracted**:
- **Multi-agent swarm orchestration**: Patterns for parallel agent execution with independent contexts (basis for `agent-swarm` skill)
- **Autonomous agent memory and personality**: Agents that accumulate experience across runs (informed our `skill-forge` MemPalace storage step)
- **Knowledge graph construction**: Building project-wide context understanding through agent collaboration
- **Parallel simulation**: Isolated agent contexts that can be merged at task boundaries

#### [claude-superpowers](https://github.com/ivan-magda/claude-superpowers) — Ivan Magda
**Patterns extracted**:
- **Plugin manifest structure**: Clean separation of components (agents, rules, hooks, commands, skills)
- **Skill workflow format**: SKILL.md convention for procedural guides
- **Skill versioning and release**: How to evolve skills safely without breaking existing usage
- **Marketplace integration patterns**: Discoverability and installation conventions

### Patterns from Community Sources

#### Self-Evolving Claude Agent (Community Pattern)
**Source**: Various community discussions, blog posts, and open-source examples
**Patterns extracted**:
- **Self-improvement loop**: `Work → Capture → Review → Promote → Enforce` cycle (basis for our `self-improve` skill and `/self-improve` command)
- **Dynamic agent/skill forging**: Creating specialists at runtime when gaps are detected (basis for `skill-forge`)
- **Quality gates for promotion**: Pattern must appear in 2+ sessions, lead to successful outcomes, generalize beyond one project
- **Memory-to-rules pipeline**: Graduating proven patterns from session memory into permanent rules

#### Research Mode / Anti-Hallucination Patterns
**Source**: dwarvesf guardrails repository, Anthropic engineering blog posts, community AI safety patterns
**Patterns extracted**:
- **Epistemic honesty enforcement**: Saying "I don't know" instead of speculating (in `research-mode` rule)
- **Source cascade with token budgets**: Local files → WebSearch → WebFetch → explicit uncertainty (in `research-mode` skill, max 5 searches / 3 fetches per question)
- **Fact-forcing gate**: "You must Read before Edit" — the inspiration for `fact-force-gate.js`
- **Evidence-first reasoning**: Read the file before claiming what's in it
- **Citation requirements**: `[Source: path:line]` format for all factual claims

#### Prompt Engineering Framework
**Source**: AWS prompt engineering guidelines + Anthropic best practices
**Patterns extracted**:
- **4-part structured prompt**: Instructions / Context / Input Data / Output Indicator (in `prompt-enrichment` skill)
- **Negative prompting**: Specifying what NOT to do, drawn from past corrections
- **Few-shot / chain-of-thought selection**: Choosing technique based on task type (reasoning → CoT, format-sensitive → few-shot, RAG when context needed)
- **Confidence-tier learning**: Progressive automation as approved patterns accumulate

### Original Contributions (Not Derived)

These are unique to this toolkit:
- **Session-scoped fact-forcing tracker**: Per-session tracker file with atomic writes, prevents race conditions across parallel agents
- **UserPromptSubmit forcing gate**: Heuristic vagueness detection that makes prompt enrichment impossible to skip — even in long conversations
- **Focus-aware notifications**: Skipping notifications when Claude is the frontmost app, with cross-platform detection
- **Confidence tiers for prompt patterns**: Learning → Familiar → Trusted → Independent automation ramp
- **Hybrid deterministic + LLM pre-compact**: Deterministic checkpoint write paired with LLM-driven MemPalace enrichment
- **Smoke test suite**: 8-point installer test verifying every hook fires correctly with synthetic input
- **MemPalace graceful degradation**: Local-file fallbacks for every MemPalace dependency

---

## License

MIT. See [LICENSE](LICENSE).

# Agent Team — Hierarchical Engineering Team Simulation (HETS)

Reusable toolkit primitive for orchestrating multiple agents in a tree structure that mimics a real software engineering team: PM → Senior → Mid → Junior. Each level has scoped responsibilities, contracts that must be satisfied, and budget allocations. Trust builds incrementally so high-trust roles get spot-checked rather than fully reviewed.

## When to use HETS

- Multi-step tasks that decompose naturally into parallel sub-tasks
- Tasks where verification matters (not just output, but approach quality)
- Tasks where you'd benefit from review at multiple abstraction levels
- Audits, code reviews, large refactors, multi-file features

## When NOT to use HETS

- Single-actor tasks (just spawn one Agent directly)
- Tasks under 30 minutes (the orchestration overhead exceeds the work)
- Tasks where a single perspective is correct (no review needed)

## The role hierarchy

| Real-world role | Agent role | Depth | Verifies | Budget |
|----------------|-----------|-------|----------|--------|
| Product Manager | super-agent | 0 | Cross-area patterns, business outcome | Uses parent context |
| Senior Engineer | orchestrator | 1 | Architectural soundness of children | 8K tokens |
| Mid Engineer | sub-orchestrator | 2 | Implementation quality of children | 8K tokens |
| Junior Engineer | actor | 2-3 | Functional outputs match contract | 30K tokens |

**Recursion limit**: `max_depth = 3` by default. At depth 3, only actors can be spawned.

## The triple contract (anti-1000-zeros defense)

Each agent has THREE contracts, validated by `scripts/agent-team/contract-verifier.js`:

### 1. Functional contract — did you produce required outputs?
- Output structure (frontmatter, sections)
- Minimum quantities (≥N findings, ≥M citations)
- Required fields populated

### 2. Anti-pattern contract — did you avoid known shortcuts?
- No paraphrasing of prior runs (text similarity check)
- No template repetition across child outputs
- All claims have evidence markers (`file:line`, `verified by`)
- No padding without acknowledgment

### 3. Pattern contract (Phase H.2) — did you use correct approach?
- Right abstractions (e.g., a loop instead of brute-force expansion)
- Idiomatic for the role (e.g., hacker actually attempts attacks)
- Integrates with toolkit conventions

The 1000-zeros example fails Contract #2 (template repetition) and #3 (no abstraction). The hacker writing "brute-forced 1000 cases" instead of using a meaningful test fails #2.

## Workflow

### 1. Pre-run: load contracts and budgets
For each agent role you'll spawn, locate its contract file (e.g., `swarm/personas-contracts/01-hacker.contract.json`). The contract specifies:
- Token budget (with extension policy)
- Required functional outputs
- Anti-pattern checks
- Acceptable fallback behaviors

### 2. Spawn with explicit contract
Each spawned agent receives in its prompt:
- Its frontmatter contract (id, role, depth, parent, max_depth)
- Reference to its contract file (`see X.contract.json`)
- Token budget and extension policy
- Required outputs schema

### 3. Track in tree
The `tree-tracker.js` records every spawn:
```bash
node scripts/agent-team/tree-tracker.js spawn \
  --run-id chaos-... --parent super-root \
  --child orch-code --task "..." --role orchestrator
```

This persists to `swarm/run-state/{run_id}/tree.json` with full audit trail (spawn time, parent, status).

### 4. Agent completes → contract verifier runs
After each agent finishes, the parent (or super agent) invokes:

```bash
node scripts/agent-team/contract-verifier.js \
  --contract swarm/personas-contracts/01-hacker.contract.json \
  --output swarm/run-state/{run_id}/node-actor-hacker.md \
  --previous-run swarm/run-state/{prior_run_id}
```

Returns JSON with:
- `verdict`: pass | partial | fail
- Per-check status (functional, anti-pattern)
- Recommendation: accept | retry-with-tighter-prompt | escalate-to-orchestrator

### 5. On failure: retry once with tighter prompt
If verdict is `fail` and the agent has retry budget, the parent re-spawns with:
- A clearer task description
- Specific failed check ids highlighted
- Reduced scope if budget is tight

If retry also fails: escalate to orchestrator. The orchestrator may either accept-with-caveat (mark in their findings) or downgrade the trust score for that persona.

### 6. Self-learning hook
Every contract verification result is appended to `~/.claude/agent-patterns.json` via `pattern-recorder.js`:

```json
{
  "task_signature": "<hash of task>",
  "agent_role": "actor",
  "persona": "01-hacker",
  "verdict": "pass",
  "checks_passed": ["F1", "F2", "F3", "A1", "A3"],
  "checks_failed": ["A2"],
  "evidence_quality": 0.85,
  "tokens_used": 28400,
  "tokens_extended": false,
  "ran_at": "2026-05-02T..."
}
```

This feeds the existing `/self-improve` workflow so users can see WHICH agent patterns succeed across runs and WHICH consistently fail.

### 7. Super agent reviews
After all leaves complete and contracts verify:
- Super agent runs the aggregator (`hierarchical-aggregate.js`)
- Reviews orchestrator-level synthesis
- Spot-checks actor outputs based on trust scores (Phase H.2)
- Writes consolidated report
- Triggers cross-run delta analysis

## Inheritance from MiroFish (and beyond)

| MiroFish concept | HETS analog |
|------------------|-------------|
| Multi-platform parallel sim | Multi-orchestrator parallel decomp |
| `simulation_manager.py` | `tree-tracker.js` + orchestrator skill |
| `report_agent.py` | `super-agent.md` + `hierarchical-aggregate.js` |
| Static personality | Trust-evolving role contracts |
| Run state tracking | `tree.json` + per-node `node-{id}.md` files |

The HETS pattern goes further than MiroFish in three ways:
1. **Verifiable contracts** — every agent must satisfy functional + anti-pattern checks
2. **Recursion with limit** — orchestrators can spawn sub-orchestrators (bounded by max_depth)
3. **Trust-based delegation** (Phase H.2) — high-trust roles get spot-checked instead of fully reviewed

## Anti-pattern: the 1000-zeros problem

Stated by user: *"a sub-agent is asked to create a program to print a 1000 0s. We'd expect a loop. But, it's just as likely that printing 0 a thousand times could pass the test but is architecturally wrong."*

The defense:
- **Functional contract** would pass either solution (output is 1000 zeros)
- **Anti-pattern contract** detects template repetition (1000 lines of `console.log("0")`)
- **Pattern contract** (H.2) detects missing abstraction (no loop construct found in the code)
- **Trust scoring** (H.2) penalizes patterns that brute-force their way to passing

## Persona-skills mapping (Phase H.2-bridge)

Each persona contract has `skills.required` (must invoke ≥1) and `skills.recommended` (advisory):

```json
"skills": {
  "required": ["security-audit"],
  "recommended": ["review", "research-mode"]
}
```

Spawn prompts list **skill names only** (not descriptions) — the actor invokes the `Skill` tool to load on demand. Saves ~80% prompt-tokens per skill mention. See pattern: [persona-skills-mapping](patterns/persona-skills-mapping.md).

## Agent identity & reputation (Phase H.2-bridge)

Persona = role; identity = named instance. Each persona has a small roster (e.g. architect → `["mira", "theo", "ari"]`); spawns assign one identity at a time and the identity accumulates per-instance trust across runs. So "I trust mira" becomes meaningful, not just "I trust architects."

```bash
node scripts/agent-team/agent-identity.js init      # one-time, creates ~/.claude/agent-identities.json
node scripts/agent-team/agent-identity.js assign --persona 04-architect    # round-robin returns "mira"
node scripts/agent-team/agent-identity.js stats --identity 04-architect.mira
```

Verifier accepts `--identity persona.name` and `--skills s1,s2`; both flow into `agent-patterns.json` (per-persona aggregate) AND `agent-identities.json` (per-identity track record). See pattern: [agent-identity-reputation](patterns/agent-identity-reputation.md).

## Pattern library

Reusable patterns extracted from HETS development live in `patterns/`. Each pattern has a **summary block (≤5 lines, paste-inline cheap)** and a full doc with intent, components, failure modes, validation strategy. See `patterns/README.md` for the index. Current catalog:

| Pattern | Status |
|---------|--------|
| [Asymmetric Challenger](patterns/asymmetric-challenger.md) | proposed |
| [Trust-Tiered Verification Depth](patterns/trust-tiered-verification.md) | proposed |
| [Convergence-as-Signal](patterns/convergence-as-signal.md) | observed |
| [Persona-Skills Mapping](patterns/persona-skills-mapping.md) | implementing |
| [Agent Identity & Reputation](patterns/agent-identity-reputation.md) | implementing |
| [Meta-Validation](patterns/meta-validation.md) | active |
| [Prompt Distillation](patterns/prompt-distillation.md) | implementing |

To target a pattern in a future chaos run, read its "Validation Strategy" section — each lists concrete failure modes and how an actor could stress them. `chaos-test --pattern <name>` is planned for full H.2.

## Files in this skill

- `SKILL.md` — this file
- `contract-format.md` — full spec for contract JSON
- `patterns/` — reusable architectural patterns (this is the substrate for new simulations)
- `role-templates/pm.md` — super-agent role template
- `role-templates/senior.md` — orchestrator role template
- `role-templates/engineer.md` — actor role template

## Files this skill consumes (in scripts/agent-team/)

- `tree-tracker.js` — BFS/DFS over the spawn tree, persisted to tree.json
- `contract-verifier.js` — runs functional + anti-pattern checks (post-fix: prototype-pollution-safe, .every semantics, valid JS regex for end-of-input)
- `pattern-recorder.js` — appends results to ~/.claude/agent-patterns.json; forwards `--identity` to agent-identity.js when supplied
- `agent-identity.js` — assign/list/stats/record per-identity; round-robin assignment with file-locked persistence to ~/.claude/agent-identities.json
- (Phase H.2: `trust-tracker.js` — persists per-persona trust scores)
- (Phase H.2: `budget-manager.js` — handles on-demand token extensions)

## Phase status

- **H.1 (shipped)**: tree tracking, functional + anti-pattern contracts, self-learning recorder
- **H.2-bridge (this phase)**: verifier-bug fixes (C-1 prototype pollution, H-1 `.some` semantics, `\Z` regex), persona-skills mapping in contracts, identity registry + per-identity recording, patterns library
- **H.2 (next)**: trust scoring with persistence + trust-tiered review depth, on-demand budget extensions, full pattern contracts (structural code review), `invokesRequiredSkills` verifier check (transcript-driven), asymmetric challenger spawning, `chaos-test --pattern <name>`

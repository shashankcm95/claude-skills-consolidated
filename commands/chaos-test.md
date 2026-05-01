# Chaos Test — Hierarchical Multi-Persona Toolkit Audit

Trigger a full hierarchical chaos test of the claude-toolkit. Spawns a 3-tier tree (Super Agent → Orchestrators → Actors), runs in parallel, aggregates with cross-run delta analysis, and produces a consolidated report.

## Arguments
$ARGUMENTS — optional. Examples:
- `(no args)` — default tri-fold (Code/Behavior/Architecture orchestrators)
- `--max-depth 2` — limit recursion (default 3; 2 means flat swarm)
- `--no-baseline` — skip cross-run delta even if prior runs exist

## Steps

### 1. Initialize run
```bash
RUN_ID="chaos-$(date +%Y%m%d-%H%M%S)"
mkdir -p ~/Documents/claude-toolkit/swarm/run-state/$RUN_ID
echo "Run ID: $RUN_ID"
```

### 2. Activate Super Agent
Read `~/Documents/claude-toolkit/swarm/super-agent.md`. Follow its workflow:
- Spawn 3 orchestrators in parallel (Code / Behavior / Architecture)
- Each orchestrator spawns its actors
- Wait for tree completion
- Run `node swarm/hierarchical-aggregate.js $RUN_ID` for delta analysis
- Run `bash scripts/compliance-probe.sh --last-24h` for behavior metrics
- Write `node-super-root.md` with executive summary

### 3. Show user the consolidated report
After super agent completes, display:
- Path to `~/Documents/claude-toolkit/swarm/run-state/$RUN_ID/hierarchical-report.md`
- The executive summary from `node-super-root.md`
- Top recommendation for next fix phase

**Do not start fixing anything** — the chaos test is the audit. A separate `/forge` or manual approval kicks off the fix phase.

## Why a hierarchical chaos test?

Flat swarms (5 actors → 1 aggregator) miss cross-cutting patterns. The hierarchy lets:
- Each **orchestrator** see patterns within its area
- The **super agent** see patterns across areas
- **Recursion** allows complex test areas to decompose further (with `max_depth` limit)

Inspired by MiroFish's multi-platform simulation but adapted to a tree-of-teams pattern.

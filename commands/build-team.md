# /build-team — Spawn a HETS team for a build task

User-facing entry point for the [tech-stack-analyzer](../skills/tech-stack-analyzer/SKILL.md) skill. Translates a high-level task description into a concrete spawn plan with user redirect gates before execution.

## Arguments

`$ARGUMENTS` — the task description in natural language.

Examples:
- `/build-team Build me a marketing site with a blog`
- `/build-team Add an iOS companion app to my existing web product`
- `/build-team Refactor the Spring Boot service to use structured concurrency`
- `/build-team Audit the auth flow before we ship the new payments feature`

If `$ARGUMENTS` is empty, ask one clarifying question (intent + domain) and stop.

## Steps

### 1. Pre-flight check
Verify the HETS substrate is ready:

```bash
node ~/Documents/claude-toolkit/scripts/agent-team/kb-resolver.js cat hets/stack-skill-map | head -3
node ~/Documents/claude-toolkit/scripts/agent-team/kb-resolver.js scan
node ~/Documents/claude-toolkit/scripts/agent-team/agent-identity.js list | head -3
```

If any of these fail, surface the issue and STOP. Don't try to build a team on broken substrate.

### 2. Invoke the tech-stack-analyzer skill
Follow the 7-step workflow in `skills/tech-stack-analyzer/SKILL.md`:
- Step 1: Parse user intent (extract `intent` + `domain` + `constraints`)
- Step 2: Look up matching stack from `kb:hets/stack-skill-map`
- Step 3: Build the plan (stack + skills + personas + team-size estimate)
- Step 4: Cross-check skill availability (mark each as available / marketplace / missing)
- Step 5: **USER GATE 1** — present plan, wait for approve / adjust / cancel
- Step 6: **USER GATE 2** (if missing skills) — bootstrap-via-forge approval
- Step 7: Spawn the team using `agent-identity recommend-verification` per identity

### 3. Show user the consolidated artifact

After all spawned actors complete + verification + (per policy) challenger pairs:
- Each persona's `node-actor-{persona}-{identity}.md` in `swarm/run-state/<run-id>/`
- Optional: super-agent synthesis at `node-super-root.md` if team-size ≥3

### 4. Handle capability requests from sub-agents (H.6.5)

After every spawned actor completes, scan its return value for a `request:` block in the `## Notes` section. Sub-agents follow the **missing-capability-signal** convention (see `patterns/missing-capability-signal.md`): they do NOT write substrate files themselves; they emit structured requests for root (you, the orchestrator) to act on.

For each request, surface to the user with the concrete file list, then act per the user's decision:

| Request type | Root acquires by | User-gate question |
|--------------|---------------------|----------------------|
| `forge-skill` | Invoke `/forge` skill (existing flow) | "Author skill X via /forge?" |
| `forge-persona` | Direct authoring via Edit/Write — 4 files (persona.md, contract.json, 2 KB docs) + 3 config edits (DEFAULT_ROSTERS in agent-identity.js, live `agent-identities.json`, stack-skill-map) | "Author new persona X with these 4 files + 3 config edits?" |
| `author-kb-doc` | Direct Write of the KB doc + `kb-resolver scan` to register | "Author KB doc kb:X/Y at path Z?" |
| `extend-stack-map` | Edit `kb:hets/stack-skill-map` to add the new stack entry | "Extend stack-skill-map with entry for stack X?" |

Skip a request if the user rejects, but record the rejection in the run notes. **Never silently ignore a request** — that's how capability gaps perpetuate across runs.

### 5. Don't auto-commit

Same convention as `/chaos-test`: this command produces *artifacts* the user can review and act on. It does NOT auto-commit code, push branches, or merge PRs. Spawned personas may write code (e.g., 09-react-frontend implementing a component) but the user explicitly reviews + commits.

Capability requests acquired in step 4 ARE allowed to land as committed file additions on a feature branch (substrate extensions persist; not auto-committed but the user is expected to commit them once the run finishes since they're tracked as toolkit growth).

## What this command is NOT

- Not for one-off questions ("how do I write a regex for X?") — use plain Claude
- Not for chaos-testing the toolkit itself — use `/chaos-test`
- Not a substitute for explicit project planning when stakes are high — use `/plan` first if you want a written plan before spawning the team

## Why a separate command vs always-on heuristic

Same rationale as the prompt-enrichment gate: explicit user invocation makes the trust boundary clear. The user knows they're spawning a team (cost, latency, multiple personas). The skill's two user-gates inside the workflow handle the "did I pick the right stack" question.

## Phase status

`/build-team` is the H.2.5 entry point. As of H.2.5, the skill scaffold + KB + pattern are implemented. The actual `/forge` integration for skill-bootstrapping uses the existing `/forge` command — which authors locally but does NOT yet do internet research. Internet-research gating is documented in [patterns/skill-bootstrapping.md](../skills/agent-team/patterns/skill-bootstrapping.md) and remains a follow-up. For now, missing skills surface to the user; if the user picks "proceed without specialization", the spawn proceeds with promise-mode references intact.

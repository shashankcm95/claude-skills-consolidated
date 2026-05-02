---
pattern: agent-identity-reputation
status: implementing
intent: Personas as roles; identities as persistent named instances accumulating per-identity trust.
related: [trust-tiered-verification, persona-skills-mapping, hets]
---

## Summary

Persona = role (e.g., `04-architect`). Identity = named instance within that role (e.g., `architect.mira`). Each identity has persistent track record across runs: verdicts, specializations, skill invocations. Trust scored per identity, not per persona class — so "I trust mira" is meaningful, not just "I trust architects." Identities are assigned at spawn time from a per-persona roster (round-robin initially; trust-weighted later).

## Intent

A team of three architects on a real engineering team isn't three interchangeable units — each has a track record, specialty, and earned trust. Modelling agents the same way enables (a) reasoning about specific contributors, (b) targeted skill development per identity, (c) graceful retirement of underperforming identities, (d) social-cognitive scaffolding for humans reviewing the team's output ("mira flagged this — she's been right 19/20 times on architecture claims").

## Components

- **Identity registry** — `~/.claude/agent-identities.json` (gitignored). Schema: per-identity entry with `persona`, `name`, `createdAt`, `lastSpawnedAt`, `totalSpawns`, `verdicts {pass, partial, fail}`, `specializations[]`, `skillInvocations {skill: count}`.
- **Per-persona roster** — small set of names per persona, defined once at toolkit init. Suggested:
  - `01-hacker` → `["zoe", "ren", "kai"]`
  - `02-confused-user` → `["sam", "alex", "rafael"]`
  - `03-code-reviewer` → `["nova", "jade", "blair"]`
  - `04-architect` → `["mira", "theo", "ari"]`
  - `05-honesty-auditor` → `["quinn", "lior", "aki"]`
- **Assignment policy** — `agent-identity assign --persona 04-architect [--task ...]` returns an identity name. v1: round-robin across roster. v2 (post-tiering): pick best-fit by `(specializations × task tags)` overlap.
- **Recording** — `pattern-recorder record --identity 04-architect.mira --verdict pass ...` updates the identity's history. Existing per-persona stats remain (aggregated view).
- **Frontmatter ID convention** — actor spawns now have `id: actor-architect-mira` (was `actor-architect`). Tree-tracker child IDs follow same convention.

## Failure Modes

1. **Roster exhaustion** — if all roster names for a persona are spawned in a single run, round-robin starts to repeat. Counter: roster size ≥ max parallel actors per persona; default 3 covers current chaos-test usage.
2. **Stale specializations** — auto-derived specializations (e.g., "regex-bug-hunting") may persist after the identity's actual focus shifts. Counter: decay specializations over runs; require ≥3 recent runs in a category to keep the tag.
3. **Identity squatting** — a persona's roster could be exhausted by a single bad-faith user pre-spawning all names. Counter: rosters are toolkit-shipped, not user-mutable in v1.
4. **Concurrent identity assignment race** — two parallel spawns ask for an architect simultaneously; both get `mira`. Counter: file lock on `agent-identities.json` write; same lock pattern as `pattern-recorder.js`.

## Validation Strategy

Stress-test scenarios:
- Spawn 3 architects in one run. Verify each gets a distinct identity. Verify `nextIndex` advances correctly.
- Spawn 4 architects in one run (exceeds default roster of 3). Verify round-robin wraps and the 4th reuses `mira` (and downstream tooling tolerates duplicate identities in one run).
- Run 5 chaos cycles with consistent personas. Verify each identity's `totalSpawns` advances monotonically and `passRate` is computed correctly.
- Manually edit `agent-identities.json` to corrupt one identity's verdict counts. Verify the script either repairs or refuses to advance until corrected.
- Spawn under file-lock contention (5 parallel `record` calls). Verify no lost updates.

## When to Use

- All HETS chaos runs once `agent-identities.json` exists (Phase H.2 onwards)
- Any future multi-agent coordination outside chaos-test (HETS pattern is general)

## When Not to Use

- One-off experiments where identity continuity is noise
- Test runs that need fresh / unbiased identities (use `--ephemeral` flag — not yet implemented)

## Related Patterns

- [Trust-Tiered Verification Depth](trust-tiered-verification.md) — reads per-identity trust to decide verification depth
- [Persona-Skills Mapping](persona-skills-mapping.md) — identities accumulate per-skill invocation history
- [HETS](../SKILL.md) — the substrate

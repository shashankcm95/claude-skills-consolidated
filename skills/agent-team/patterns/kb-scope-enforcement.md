---
pattern: kb-scope-enforcement
status: active
intent: Verify actor consumed every KB doc declared in `contract.kb_scope.default` by scanning the transcript for `kb-resolver cat` / `resolve` / `Read kb/<id>.md` invocations.
related: [shared-knowledge-base, content-addressed-refs, persona-skills-mapping, hets]
---

## Summary

Each persona contract has `kb_scope.default` (a list of `kb:domain/doc-id` strings). Spawn prompts list these refs. The verifier check `kb_scope_consumed` reads the actor's transcript JSONL post-hoc, extracts every KB read (Bash `kb-resolver cat`, `kb-resolver resolve kb:<id>`, or `Read` against `skills/agent-team/kb/<id>.md`), and confirms each declared scope appears ≥1 time. Failure mode: declare-but-don't-read drift — same shape as the H.2.6 `invokesRequiredSkills` precedent. Graceful pass when no transcript supplied so spawn-time invocations remain backwards-compatible; enforcement triggers only when a transcript is fed in at verification time.

## Intent

CS-1 and CS-2 architects both flagged: `kb_scope` was loaded into spawn-time prompt blocks, then ignored by actors with zero consequence. Contracts could declare `["kb:security-dev/threat-modeling-essentials", ...]` and the security-engineer actor could write its findings without ever opening any of those docs — the contract field was advisory-only, enforcement was theatre. This pattern closes the gap.

## Components

- **Contract field** — `"kb_scope": { "default": ["kb:security-dev/threat-modeling-essentials", "kb:security-dev/auth-patterns", "kb:hets/spawn-conventions"] }`
- **Spawn prompt block** — `## Required reading\nRead each of these BEFORE writing findings (use kb-resolver cat or Read):\n- kb:security-dev/threat-modeling-essentials\n- ...\n`
- **Transcript extractor** — walks the JSONL, scans `tool_use` blocks, normalizes three invocation shapes to `kb:<domain>/<doc>` form:
  - Bash: `kb-resolver(.js)? cat <id>` (bare or `kb:`-prefixed)
  - Bash: `kb-resolver(.js)? resolve kb:<id>[@<short-hash>]`
  - Read: `file_path` matching `skills/agent-team/kb/<domain>/<doc>.md`
- **Verifier check** `kb_scope_consumed` — diff declared vs observed; missing entries → fail. Returns rich `{pass, source, declared, consumed, kbReadsObserved, missingKbScope}` for audit.
- **No CLI fallback** — unlike `invokesRequiredSkills`, there is no `--kb-reads` flag. The whole point is to prevent self-reporting drift; manual passthrough would defeat enforcement.

## Failure Modes

1. **Declare-without-read drift** — the bug this pattern fixes. Caught directly.
2. **Read via different invocation shape** — actor uses a tool not covered by the extractor (e.g., `cat` shell command on the resolved file path). Counter: extractor tracks 3 shapes covering the documented invocation paths; if a 4th lands, extend (and add a probe).
3. **Read of a different KB doc not in scope** — extractor records it in `kbReadsObserved` but doesn't credit it toward `kb_scope.default`. This is correct: scope says "you must read X", reading Y instead doesn't satisfy.
4. **Hash-pinned ref vs unpinned** — `resolve kb:foo@abc123` strips the `@hash` suffix before matching, so `kb:foo` in scope matches whether the actor pinned a hash or not. (Hashes are integrity-of-content, not part of identity.)
5. **No transcript supplied** — graceful pass with `reason: 'no_transcript_supplied'`; matches `invokesRequiredSkills` semantics so the verifier can run pre-transcript-collection without breaking. The trade-off: spawn-time-only invocations don't enforce. Acceptable because chaos-test + production HETS runs always pass `--transcript`.

## Validation Strategy

Stress-test scenarios:
- Spawn `12-security-engineer` with all 3 declared kb_scope docs read in the transcript → F9 passes
- Spawn same actor but skip one read → F9 fails with `missingKbScope: ["kb:hets/spawn-conventions"]`
- Spawn an actor with no `kb_scope` field on its contract → F9 graceful-passes with `reason: 'no_kb_scope_declared'`
- Run verifier without `--transcript` flag → F9 graceful-passes with `reason: 'no_transcript_supplied'`
- Pass `--transcript /nonexistent.jsonl` → F9 fails with `reason: 'transcript_not_found'`
- Mix invocation shapes in one transcript (Bash `cat`, Bash `resolve kb:X@hash`, Read of `kb/X.md`) → all three credited toward scope

## When to Use

- All actor spawns where the contract declares `kb_scope.default`
- New persona-contract creation: declare scope based on which KB docs the persona's task domain references; opt into the `kb_scope_consumed` check as a required functional check

## When Not to Use

- Spawn-time-only fixtures where no transcript will ever be collected (the check graceful-passes anyway, but adding the check just adds noise to the result JSON)
- Personas whose tasks intentionally span ad-hoc KB reads (declare scope as `[]` then; the check graceful-passes)

## Related Patterns

- [Shared Knowledge Base](shared-knowledge-base.md) — where the KB docs live and are content-addressed
- [Content-Addressed References](content-addressed-refs.md) — how `kb:<id>@<hash>` resolves; why the extractor strips the `@hash` for matching
- [Persona-Skills Mapping](persona-skills-mapping.md) — the parallel enforcement pattern for `skills.required`; `kb_scope_consumed` mirrors `invokesRequiredSkills` semantics
- [HETS](../SKILL.md) — the substrate that loads `kb_scope` into spawn-time prompts

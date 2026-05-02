# Contributing — Git Workflow

Going-forward conventions for the claude-toolkit repo. Adopted post-H.2.7 after the user noted that the H.1 → H.2.7 phase work had landed directly on `main` without branching, tagging, or PR review. **All prior phase commits are now retroactively tagged** (`phase-H.1` through `phase-H.2.7`); the conventions below apply to new work.

## Branch model

- `main` — protected. Direct commits only for trivial doc fixes (typos, README link tweaks). Anything substantive goes through a feature branch.
- Feature branches:
  - **Phase work**: `feat/phase-H.x.y-short-name` (e.g., `feat/phase-H.2.8-budget-extensions`)
  - **Bug fixes**: `fix/short-description` (e.g., `fix/verifier-regex-extension-length`)
  - **Refactors**: `refactor/short-description`
  - **Docs**: `docs/short-description`
- One branch per logical change. Don't bundle unrelated fixes — they should be separate branches + separate PRs for separate reviews.

## Commit conventions

Conventional commits, same as before:

```
feat(phase-H.2.8): on-demand budget extensions

[Body — what changed and why]

[Optional footer — Co-Authored-By, BREAKING CHANGE notes]
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

For phase work, scope is `phase-H.x.y` so commits remain auditable across the H.2 trajectory.

## Tagging policy

- **Phase tags**: every phase that ships gets an annotated tag at the merge commit.
  - Format: `phase-H.x.y` (matches commit scope; e.g., `phase-H.2.8`)
  - Annotated (`-a` flag), with one-line description in the message
  - Apply at the moment the phase's branch merges to main
- **Release tags** (future): `v0.1.0`, `v0.2.0`, etc. Adopt semver once we have a stable surface (~Phase H.3+).

## PR workflow

The remote is `github.com/shashankcm95/claude-skills-consolidated`. Use `gh pr create` for every feature branch:

```bash
git checkout -b feat/phase-H.2.8-budget-extensions
# ... do work, commit ...
git push -u origin feat/phase-H.2.8-budget-extensions
gh pr create --title "feat(phase-H.2.8): on-demand budget extensions" --body "$(cat <<'EOF'
## Summary
- New scripts/agent-team/budget-tracker.js
- Extension request/approve flow
- Per-spawn token audit trail

## Test plan
- [ ] E2E probes for budget tracking
- [ ] Verify pattern-recorder integration

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR review checklist (self-review when working solo):
- [ ] All E2E probes documented in commit message + actually green when re-run
- [ ] No secrets in code (env vars only)
- [ ] Spec docs updated if schema changed (contract-format.md)
- [ ] BACKLOG.md follow-ups added for known limitations
- [ ] SKILL.md phase-status entry reflects what shipped

## Merge policy

- **Squash-and-merge** for small features (1-3 commits on the branch). Keeps main history linear.
- **Merge with `--no-ff`** for substantial features (4+ commits, multiple distinct changes). Preserves the branch story.
- Never `git rebase` shared branches. Never force-push to `main`.

## Tagging at merge

After PR merge, tag the merge commit:

```bash
git checkout main
git pull
git tag -a phase-H.2.8 -m "Phase H.2.8: on-demand budget extensions"
git push origin phase-H.2.8
```

## Retroactive tagging — the snapshot at H.2.7

After CONTRIBUTING.md adoption, all prior phase commits were tagged in place (annotated tags pointing at the existing main commits):

| Tag | Commit | Phase |
|-----|--------|-------|
| `phase-H.1` | `d2c3554` | HETS pattern foundation |
| `phase-H.2-bridge` | `947c31d` | Patterns library + identity model + verifier fixes |
| `phase-H.2-bridge.2` | `845d370` | Shared KB + content-addressed refs |
| `phase-H.2.1` | `8cc383b` | First builder persona vertical slice |
| `phase-H.2.2` | `15ef4cf` | Builder family complete + marketplace integration |
| `phase-H.2.3` | `97dc736` | Asymmetric challenger spawning |
| `phase-H.2.4` | `c3fdfa0` | Trust-tiered verification depth (LATENCY-CRITICAL) |
| `phase-H.2.5` | `7e80b53` | Tech-stack analyzer + skill-bootstrapping wiring |
| `phase-H.2.6` | `782be51` | invokesRequiredSkills verifier check |
| `phase-H.2.7` | `0a06cec` | Full pattern contracts (third leg of triple defense) |

`d166add` (README refresh) was a doc-only commit between H.2.4 and H.2.5 — no tag (matches "trivial docs allowed direct on main" rule).

## What this changes vs prior practice

| Before (H.1 → H.2.7) | After (H.2.8 onwards) |
|----------------------|----------------------|
| All commits direct to `main` | Feature branches per phase / fix |
| No tags | `phase-H.x.y` tag at every merge |
| Self-merged via single push | PR via `gh pr create` (self-review checklist) |
| No clear release boundary | Each tag is a navigable boundary; `git checkout phase-H.2.4` reproduces that state |

## When to skip the workflow

- **Hotfix on main**: a single-line typo fix in a doc — direct commit + push is fine.
- **Experimental scratch**: spike branches that won't merge — no PR needed, but DO NOT name them `feat/` (use `spike/` or `wip/`).
- **Work-in-progress sync**: pushing to your own feature branch mid-work to back up. No PR until ready for review.

## Related

- [README.md](README.md) — top-level project structure
- [skills/agent-team/SKILL.md](skills/agent-team/SKILL.md) — phase status + roadmap
- [skills/agent-team/BACKLOG.md](skills/agent-team/BACKLOG.md) — deferred work

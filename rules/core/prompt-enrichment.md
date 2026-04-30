# Prompt Enrichment — Always Active

## Vagueness Detection Gate

Before acting on any user message, evaluate whether the prompt is **vague or ambiguous**. A prompt is vague if it lacks 2 or more of:

1. **Clear task** — what specifically to do (not just "fix this" or "make it better")
2. **Scope** — which files, components, or boundaries apply
3. **Constraints** — what to avoid, what standards to follow
4. **Expected output** — what the result should look like (code, plan, review, etc.)

### Decision Flow

```
User message arrives
    ↓
Is the intent clear, scoped, and actionable?
    → YES: Proceed normally. No enrichment overhead.
    → NO (vague): Check MemPalace for recognized patterns.
        → Pattern found (approved 3+ times): Auto-apply stored enrichment.
           Show one-line summary: "Using your established pattern for [X]."
           Proceed without confirmation.
        → Pattern found (approved < 3 times): Show the enriched prompt.
           Ask: "I've structured this based on a previous pattern. Look right?"
           Allow modifications. Update approval count on confirm.
        → No pattern found: Activate the prompt-enrichment skill.
           Build the 4-part structured prompt. Show to user for review.
```

### What NOT to enrich

Skip enrichment entirely for:
- Direct commands: "run the tests", "commit this", "push to main"
- Follow-ups in an active conversation where context is already established
- Explicit instructions with clear scope: "add a loading spinner to src/components/Button.tsx"
- Slash commands: `/review`, `/plan`, `/forge`, etc.
- Simple questions: "what does this function do?", "where is X defined?"

### Sub-Agent Awareness

When delegating to sub-agents (planner, code-reviewer, architect, etc.), **always use the enriched prompt** — not the raw user input. Sub-agents lack conversation context and benefit most from structured prompts.

## Pattern Learning

After each enriched prompt is approved (or approved with modifications):
- If MemPalace MCP is available, store the mapping in the `prompt-patterns` room:
  - Raw prompt (what the user typed)
  - Enriched prompt (what was built)
  - Whether the user modified it and how
  - Task category (refactor, feature, bugfix, review, etc.)
  - Approval count (increment on reuse)
- Modified enrichments replace the stored pattern — the user's corrections are the ground truth

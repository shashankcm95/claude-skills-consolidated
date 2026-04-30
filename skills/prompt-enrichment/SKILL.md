# Prompt Enrichment — Structured Prompt Builder

Transform vague user prompts into structured, actionable prompts that reduce miscommunication and produce better outcomes. Uses a 4-part framework with technique selection.

## When This Activates

Called by the prompt-enrichment rule when a user message is detected as vague (missing 2+ of: clear task, scope, constraints, expected output).

## Step 1: Classify and Select Techniques

Analyze the raw prompt and select the appropriate prompting techniques:

| User Intent | Technique | Why |
|-------------|-----------|-----|
| Reasoning-heavy task (debug, architect, optimize) | **Chain of Thought** | Forces step-by-step reasoning, reduces errors |
| Format-sensitive output (API design, schema, config) | **Few-Shot** | Examples anchor the expected shape |
| Task with known failure modes | **Negative Prompting** | "Do NOT do X" prevents repeat mistakes |
| Task needing project context | **RAG** | Pull from MemPalace, MEMORY.md, or local files |
| Simple unfamiliar task | **Zero-Shot** | Clear instructions suffice without examples |

Multiple techniques can combine. Chain-of-thought + negative prompting is common for debugging.

## Step 2: Build the 4-Part Prompt

Structure the enriched prompt with these sections:

### Instructions
- What specifically to do (verb + object + qualifier)
- How to approach it (technique-specific framing)
- What constraints apply
- What NOT to do (negative prompting, drawn from past corrections if available)

### Context
- Relevant project background (from MEMORY.md, MemPalace, or conversation)
- Related files and their purposes (quick Glob/Grep to identify)
- Architectural patterns in use
- Previous decisions that affect this task

### Input Data
- Specific files, components, or code sections involved
- Error messages, logs, or symptoms if debugging
- Requirements or specifications if building
- Reference implementations or examples if available

### Output Indicator
- Expected deliverable type (code, plan, review, explanation, config)
- Format constraints (language, framework patterns, file structure)
- Quality criteria (tests required? docs? backward compatible?)
- Scope boundaries (which files to touch, which to leave alone)

## Step 3: Size Check and Summary

If the enriched prompt exceeds ~500 words:
- Show a **summary view** (one sentence per section, ~4 lines total)
- Indicate: "Full enriched prompt is [N] words. Showing summary. Say 'show full' to see everything."

If under 500 words, show the full enriched prompt.

## Step 4: Present for Review

Show the enriched prompt to the user with clear formatting:

```
📋 Enriched Prompt:

**Instructions**: [what to do, how, constraints]
**Context**: [relevant background pulled from project]
**Input**: [specific files/data involved]
**Output**: [expected deliverable and format]

[Technique tags: #chain-of-thought #negative-prompting]

Approve, modify, or say "just do it" to skip enrichment.
```

### User Responses
- **Approve** (yes, looks good, go ahead): Execute the enriched prompt. Store pattern.
- **Modify** (change X to Y, also include Z): Apply changes. Show updated version. Re-present.
- **Skip** ("just do it", "skip"): Execute raw prompt as-is. Don't store pattern.
- **Always skip for this type**: Store a "skip" preference for this task category.

## Step 5: Store in MemPalace

On approval, store the pattern for future reuse:

```
Room: prompt-patterns
Memory:
  raw: "refactor the auth"
  enriched: {instructions, context, input, output}
  techniques: ["chain-of-thought", "rag"]
  category: "refactor"
  user_modified: true/false
  modification_notes: "user narrowed scope to JWT only"
  approval_count: 1
  last_used: timestamp
```

On subsequent matches (fuzzy match against stored raws):
- approval_count < 3: Show enriched prompt, ask for confirmation
- approval_count >= 3: Auto-apply, show one-line summary only
- User can always say "show me the full prompt" to review

## Step 6: Execute

Run the enriched prompt through the normal Claude workflow:
- If the task maps to an existing agent (planner, code-reviewer, etc.), delegate with the enriched prompt
- If it's direct work, proceed with the structured context
- The enriched prompt becomes the working context — not the raw input

## Confidence Tiers

The system gains independence through approval accumulation:

| Tier | Approval Count | Behavior |
|------|---------------|----------|
| **Learning** | 0 | Full enrichment shown, must approve |
| **Familiar** | 1–2 | Enrichment shown with "Looks right?" confirmation |
| **Trusted** | 3–4 | One-line summary shown, auto-proceeds after 3s |
| **Independent** | 5+ | Silent enrichment, no confirmation needed |

User can always override: "show me the prompt" forces full display regardless of tier.

## Example

**Raw prompt**: "fix the login"

**Enriched prompt**:
- **Instructions**: Debug and fix the login authentication flow. Use chain-of-thought reasoning to trace the failure path. Do NOT modify the OAuth provider configuration or change the session storage mechanism.
- **Context**: Project uses Auth.js v5 with GitHub OAuth. Auth config is at `src/lib/auth.ts`. Session management uses JWT strategy. Recent MEMORY.md notes mention a redirect loop issue after OAuth callback.
- **Input**: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`, browser console errors if available.
- **Output**: Fixed authentication code with explanation of root cause. Include test for the fix. Preserve backward compatibility with existing sessions.

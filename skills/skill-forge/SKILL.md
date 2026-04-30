# Skill Forge — Dynamic Agent & Skill Creation

Create specialized agents and skills on the fly when existing ones don't fit the task.

## When to Forge

- The current task requires domain-specific expertise not covered by existing agents/skills
- A pattern emerges that will recur (e.g., "we keep doing Stripe integrations")
- The user explicitly asks to create a specialized workflow
- Post-task review reveals a reusable pattern worth capturing

## Forge Process

### 1. Gap Detection
Before starting complex work, check:
- `ls ~/.claude/agents/` — what agents exist?
- `ls ~/.claude/skills/` — what skills exist?
- Does the current task fit an existing agent's description?
- If not, what specialty is missing?

### 2. Design the Agent/Skill
Determine:
- **Name**: Short, descriptive (e.g., `stripe-integrator`, `graphql-designer`)
- **Type**: Agent (has tools, model tier, acts autonomously) vs Skill (workflow guide, no tools)
- **Scope**: What does it handle? What does it NOT handle?
- **Personality**: Accumulated preferences, conventions, and lessons learned

### 3. Create the File

**For agents** — write to `~/.claude/agents/{name}.md`:
```markdown
---
name: {name}
description: {one-line description — this is what the orchestrator reads}
tools: ["Read", "Grep", "Glob", "Bash"]  # scope appropriately
model: sonnet  # sonnet for mechanical, opus for reasoning
color: {color}
---

{System prompt with domain expertise, workflow, and constraints}
```

**For skills** — write to `~/.claude/skills/{name}/SKILL.md`:
```markdown
# {Skill Name}

{One-paragraph description}

## Steps
1. {Step with rationale}
2. {Step with rationale}
...
```

### 4. Store Personality in MemPalace
After creating the agent/skill, store its context in MemPalace:
- What task triggered its creation
- Domain-specific conventions discovered
- Failure patterns to avoid
- Success patterns to replicate

Use MemPalace MCP tools: `store_memory` with the agent name as the room.

### 5. Register for Recall
The new agent/skill is immediately available in `~/.claude/agents/` or `~/.claude/skills/`.
MemPalace enables semantic recall: "find the agent I built for payment integrations."

## Evolution
After each use of a forged agent/skill:
- Did it succeed? Update its instructions with learnings.
- Did it fail? Record the failure pattern and adjust.
- Has it been used 3+ times successfully? Consider promoting its key patterns to rules.

## Anti-Patterns
- Don't create agents for one-off tasks — just do the work
- Don't duplicate existing agent capabilities — extend instead
- Don't create agents without clear scope boundaries — they become god-objects
- Don't skip the MemPalace storage step — that's what enables recall

# Self-Improvement Loop — Memory to Rules Pipeline

Continuously evolve the toolkit by promoting proven patterns from session memory to permanent rules, and by forging new skills from recurring workflows.

## The Loop

```
Work → Capture (auto-memory + MemPalace) → Review → Promote → Enforce
```

### 1. Capture (Automatic)
- Auto-memory records patterns in `MEMORY.md` during sessions
- MemPalace stores verbatim session content via pre-compact hooks
- Forged agents/skills accumulate personality over time

### 2. Review (On Demand — `/self-improve`)
Analyze what's been captured:

**Check auto-memory:**
```
Read the project's MEMORY.md
Identify patterns that appear 2+ times
Flag stale entries that no longer apply
```

**Check MemPalace (if MCP available):**
```
Search for recurring patterns across sessions
Find forged agents/skills that succeeded or failed
Identify conventions that emerged organically
```

**Check existing rules:**
```
Read ~/.claude/rules/toolkit/
Are any rules outdated?
Are there gaps — patterns we follow but haven't codified?
```

### 3. Promote
When a pattern is proven (recurring, successful, stable):

**Memory → Rule**: Move from `MEMORY.md` to `~/.claude/rules/toolkit/{category}/`
- The pattern becomes permanent guidance, not a memory entry
- Frees memory capacity for new observations

**Pattern → Skill**: Convert a recurring multi-step workflow into a skill
- Write to `~/.claude/skills/{name}/SKILL.md`
- Store context in MemPalace for semantic recall

**Pattern → Agent**: When a domain needs persistent expertise
- Use the Skill Forge to create a specialized agent
- Give it accumulated personality from MemPalace

### 4. Prune
Remove what's no longer useful:
- Stale memory entries that contradict current practices
- Rules that duplicate other rules
- Skills/agents that haven't been used in weeks
- Demote overly-specific rules back to memory

## Commands

| Command | Action |
|---------|--------|
| `/self-improve` | Full review cycle: scan memory, identify promotions, suggest changes |
| `/forge` | Create a new agent or skill on the fly (delegates to Skill Forge) |
| `/evolve {agent}` | Update an existing agent with new learnings |
| `/prune` | Remove stale entries from memory and rules |

## Quality Gates

Before promoting anything:
- Has the pattern appeared in 2+ separate sessions?
- Did it lead to successful outcomes when followed?
- Is it general enough to apply beyond one specific project?
- Does it conflict with existing rules?

## Integration with MemPalace

MemPalace is the backbone:
- **Store**: Session learnings, agent personalities, task outcomes
- **Search**: "What did we learn about auth flows?" → semantic recall
- **Scope**: Project-specific vs global patterns (separate wings)
- **Timeline**: When was this pattern last relevant?

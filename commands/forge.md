# Forge — Dynamic Agent or Skill Creation

Create a new specialized agent or skill on the fly when existing ones don't cover the current task.

## Arguments
$ARGUMENTS — description of the agent/skill to create (e.g., "stripe payment integration specialist" or "graphql schema designer")

## Steps

### 1. Gap Detection
Check what already exists:
- `ls ~/.claude/agents/` — existing agents
- `ls ~/.claude/skills/` — existing skills
- Determine if any existing agent/skill already covers this domain
- If overlap exists, suggest extending rather than creating new

### 2. Design
Based on the description, determine:
- **Name**: Short, kebab-case (e.g., `stripe-integrator`)
- **Type**: Agent (autonomous, has tools) or Skill (workflow guide)
- **Scope**: Clear boundaries — what it handles and what it doesn't
- **Model tier**: `sonnet` for mechanical/repetitive, `opus` for reasoning-heavy
- **Tools**: Minimum set needed (principle of least privilege)

### 3. Create

**For agents** — write to both locations:
- `~/Documents/claude-toolkit/agents/{name}.md`
- `~/.claude/agents/{name}.md`

**For skills** — write to both locations:
- `~/Documents/claude-toolkit/skills/{name}/SKILL.md`
- `~/.claude/skills/{name}/SKILL.md`

### 4. Store in MemPalace
If MemPalace MCP is available, store the agent/skill context:
- What task triggered creation
- Domain conventions discovered
- Initial design decisions and rationale

### 5. Confirm
Report what was created, where it lives, and how to invoke it.

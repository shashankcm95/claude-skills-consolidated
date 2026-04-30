# Attribution

This toolkit was built from original work, informed by architectural patterns
and concepts from the following open-source projects:

## everything-claude-code (MIT License)
- **Author**: Affaan Mustafa
- **Repository**: https://github.com/affaan-m/everything-claude-code
- **What we learned from**: Hook architecture patterns (PreToolUse guards,
  PostToolUse quality gates, Stop-phase batch operations), agent delegation
  model with scoped tool access and model tier routing, config protection
  concept, continuous learning instinct extraction, rules-as-guardrails
  injection pattern.

## MemPalace (MIT License)
- **Author**: MemPalace contributors
- **Repository**: https://github.com/mempalace/mempalace
- **What we learned from**: Pre-compaction memory save hooks that preserve
  context before window compression, structured memory hierarchy
  (palace/wing/room/drawer metaphor), the principle of "hooks over prompts
  for reliability" — deterministic scripts for critical behaviors.

## MiroFish (License: see repository)
- **Author**: 666ghj and contributors
- **Repository**: https://github.com/666ghj/MiroFish
- **What we learned from**: Multi-agent swarm orchestration patterns,
  autonomous agent memory and personality systems, parallel simulation
  with independent agent contexts, knowledge graph construction for
  project understanding.

## claude-superpowers (MIT License)
- **Author**: Ivan Magda
- **Repository**: https://github.com/ivan-magda/claude-superpowers
- **What we learned from**: Clean plugin manifest structure, skill
  versioning and release workflow, marketplace integration patterns.

## Self-Evolving Claude Agent (Community Pattern)
- **Source**: Various community discussions and open-source examples
- **What we learned from**: Self-improvement loop concept (work → capture →
  review → promote → enforce), dynamic agent/skill forging at runtime,
  quality gates for pattern promotion (2+ sessions, successful outcomes,
  generality checks), memory-to-rules pipeline.

## Research Mode / Anti-Hallucination Patterns (Community)
- **Source**: dwarvesf guardrails, Anthropic best practices, community patterns
- **What we learned from**: Epistemic honesty enforcement (say "I don't know"),
  source cascade with token budgets, fact-forcing gates (read before write),
  evidence-first reasoning, citation requirements for factual claims.

---

All referenced projects are under MIT or permissive licenses. This toolkit
contains original implementations — no code was copied from the above
projects. The architectural patterns and design philosophies that informed
this work are credited here in good faith.

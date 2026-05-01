#!/usr/bin/env node

// UserPromptSubmit hook: detects vague prompts and injects a forcing
// instruction that makes the prompt-enrichment skill impossible to skip.
//
// Architecture:
//   - Heuristic vagueness detection runs on every prompt
//   - Clear prompts: silent pass-through, zero overhead
//   - Vague prompts: inject additional context that forces 4-part enrichment
//   - Always evaluates — does NOT skip based on conversation continuity
//
// Detection is intentionally conservative: better to miss some vague prompts
// than to over-flag every clear instruction.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log: makeLogger } = require('./_log.js');
const log = makeLogger('prompt-enrich-trigger');

// Vague action verbs followed by generic referents.
// Phase-C additions: ship, tweak, rework, redo, deal with, address, look into,
// smooth out, polish, tidy, the thing.
const VAGUE_KEYWORDS = [
  /\bfix\s+(?:the|this|that|it|some)\b/i,
  /\bmake\s+(?:it|this|that)\s+(?:better|faster|cleaner|nicer|work)/i,
  /\bimprove\s+(?:the|this|that|it)\b/i,
  /\boptimi[sz]e\s+(?:the|this|that|it)\b/i,
  /\bupdate\s+(?:the|this|that|it)\b/i,
  /\bclean\s+(?:up|this|that|it)\b/i,
  /\brefactor\s+(?:the|this|that|it)(?!\s+\S+\.\w+)/i,
  /\bdo\s+(?:something|the\s+thing|stuff)\b/i,
  /\bhandle\s+(?:the|this|that|it)\b/i,
  /\bsort\s+(?:the|this|that|it)\s+out\b/i,
  /\bcheck\s+(?:the|this|that|it)\b/i,
  /\breview\s+(?:the|this|that|it)\b/i,
  // Phase-C additions (from chaos-test confused-user findings)
  /\bship\s+(?:the|this|that|it|a)\b/i,
  /\btweak\s+(?:the|this|that|it|some|a\s+few)\b/i,
  /\brework\s+(?:the|this|that|it)\b/i,
  /\bredo\s+(?:the|this|that|it)\b/i,
  /\bdeal\s+with\s+(?:the|this|that|it)\b/i,
  /\baddress\s+(?:the|this|that|it)\b/i,
  /\blook\s+into\s+(?:the|this|that|it)\b/i,
  /\bsmooth\s+(?:this|that|it|things?)\s+out\b/i,
  /\bpolish\s+(?:the|this|that|it)\b/i,
  /\btidy\s+(?:up|this|that|it)\b/i,
  /\bthe\s+thing\b/i,                 // "help me with the thing"
  /\bsome\s+(?:things|stuff|changes)\b/i,  // "tweak some things"
  /\btak(?:e|ing|en)\s+a\s+(?:quick\s+)?look\b/i,  // "take a look", "would you mind taking a look"
  /\bhav(?:e|ing)\s+a\s+(?:quick\s+)?look\b/i,
];

// Verb-less observation patterns ("X broken on main", "users can't log in")
// — these are bug reports without an action ask. They satisfy length checks
// but are still vague because they don't say what to do.
const OBSERVATION_PATTERNS = [
  /\b(broken|failing|down|red|hanging|stuck|slow|crashing)\s+(on|in|at)\s+\w+/i,
  /\bcan'?t\s+(log\s+in|sign\s+in|connect|access|reach|see|find)\b/i,
  /\bis\s+broken\b/i,
  /\bhas\s+a\s+(bug|deadlock|race|leak|issue)\b/i,
];

const SKIP_PATTERNS = [
  // Slash commands
  /^\s*\//,
  // Confirmation responses (Phase-C: extended with combinations and common phrases)
  /^\s*(yes|yep|yeah|y|sure|ok|okay|approve|approved|confirm|confirmed|go|go ahead|proceed|continue|do it|please)\s*[.!?]?\s*$/i,
  /^\s*(please\s+)?(proceed|continue|go ahead|do it|carry on|carry on then)\s*[.!?]?\s*$/i,
  /^\s*(sounds?\s+good|looks?\s+good|lgtm|nice|perfect|great|thanks|thank\s+you|ty)\s*[.!?]?\s*$/i,
  /^\s*(no|nope|n|cancel|stop|skip|pass|nvm|never\s*mind)\s*[.!?]?\s*$/i,
  // Numeric / option selection: "1", "option 1", "(a)", "1.", "a.", etc.
  /^\s*\(?[a-z0-9]\)?\s*[.!?]?\s*$/i,
  /^\s*option\s+\(?\w\)?\s*[.!?]?\s*$/i,
  // Wh-questions
  /^\s*(what|how|where|why|when|who|which)\s/i,
  // Aux-verb questions: subject pronoun OR article (e.g., "is the file ready")
  // Note: "do" is excluded — "do the X" is imperative, not a question
  /^\s*(is|are|was|were|will|should|may|might|must|has|have|had|does|did)\s+(you|i|we|they|it|he|she|the|this|that|these|those|there|a|an)\b/i,
  // "do" as question prefix: only when followed by a subject pronoun (not article)
  /^\s*do\s+(you|i|we|they|it|he|she|there)\b/i,
  // Direct verb-first commands
  /^\s*(run|execute|test|build|deploy|commit|push|pull|merge|rebase|stash|install|undo|revert)\s/i,
  // Tool-prefixed commands (git push, npm install, etc.)
  // Phase-C: tightened — "node fix it" should NOT skip. The matched word
  // after the tool name must look like a sub-command (lowercase, ASCII).
  /^\s*(git|npm|yarn|pnpm|bun|cargo|python|deno|docker|kubectl|make|cmake|gradle|mvn|dotnet|rustc|tsc|eslint|prettier)\s+(install|run|test|build|push|pull|exec|status|log|init|add|remove|update|start|stop|fmt|check|publish|version|completion)\b/i,
  // Show/explain (informational)
  /^\s*(show|explain|describe|list|tell|display)\s/i,
];

// Phase-C: aux-verb question prefixes that should NOT auto-skip if the body
// contains a vague keyword. ("could you fix the auth" → still flag.)
const POLITENESS_PREFIXES = [
  /^\s*(?:hey\s+)?(?:could|would|can|will)\s+you\s+(?:please\s+)?(?:if\s+(?:its|it'?s)\s+not\s+too\s+much\s+trouble\s+)?/i,
  /^\s*(?:would|could)\s+you\s+mind\s+/i,
  /^\s*(?:please\s+)/i,
  /^\s*(?:hey\s+|hi\s+|sorry\s+)/i,
];

function stripPolitenessPadding(prompt) {
  let stripped = prompt;
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const pattern of POLITENESS_PREFIXES) {
      const newStripped = stripped.replace(pattern, '');
      if (newStripped !== stripped) {
        stripped = newStripped;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return stripped.trim();
}

function hasFilePath(prompt) {
  return /\/[\w.-]+/.test(prompt) ||
         /\b\w+\.(ts|tsx|js|jsx|py|rs|go|rb|md|json|yaml|yml|toml|sh|sql|css|scss|html|vue|svelte|tf|hcl|proto)\b/i.test(prompt) ||
         /\b(src|app|lib|components?|pages?|api|tests?|hooks?|utils?|services?|controllers?|models?)\/\w+/i.test(prompt);
}

function hasSpecificEntity(prompt) {
  // Phase-C: tightened — pure all-caps acronyms like JIRA-7890 no longer count.
  // Real specificity = camelCase, PascalCase, URLs, fn calls, backticks,
  // quoted strings, OR alphanumeric-with-lowercase identifiers.
  return /\b[A-Z][a-z]+[A-Z]\w+/.test(prompt) ||           // PascalCase
         /\b[a-z]+[A-Z]\w+/.test(prompt) ||                // camelCase
         /https?:\/\//.test(prompt) ||
         /\b\w+\(\)/.test(prompt) ||                       // function calls
         /`[^`]+`/.test(prompt) ||                         // backticks
         /"[^"]{3,}"/.test(prompt) ||                      // quoted strings
         /'[^']{3,}'/.test(prompt);
  // NOTE: removed `[A-Z]{4,}` (all-caps acronyms). Tickets like JIRA-7890
  // alone don't make a prompt actionable.
}

function isObservationOnly(prompt) {
  return OBSERVATION_PATTERNS.some((p) => p.test(prompt));
}

function isVague(prompt) {
  const trimmed = prompt.trim();

  // 1. Vague keywords are the highest-signal flag — check first, even before
  //    skip patterns, so "build broken on main" (which starts with the
  //    verb-first command word "build") still gets caught.
  if (
    VAGUE_KEYWORDS.some((p) => p.test(trimmed)) &&
    !hasFilePath(trimmed) &&
    !hasSpecificEntity(trimmed)
  ) {
    return true;
  }

  // 2. Observation-only patterns (verb-less bug reports). Same rationale:
  //    catch BEFORE the verb-first command skip (which would falsely match
  //    "build broken on main" because of the leading "build").
  if (isObservationOnly(trimmed) && !hasFilePath(trimmed) && !hasSpecificEntity(trimmed)) {
    return true;
  }

  // 3. Politeness padding around vague verbs. ALWAYS check, regardless of
  //    whether a skip pattern matches — politeness questions like "would
  //    you mind fixing the auth" are still vague underneath.
  const looksLikePolitenessQuestion = /^\s*(?:hey\s+)?(?:could|would|can|will|do)\s+you\b/i.test(trimmed);
  if (looksLikePolitenessQuestion) {
    const stripped = stripPolitenessPadding(trimmed);
    if (
      VAGUE_KEYWORDS.some((p) => p.test(stripped)) ||
      isObservationOnly(stripped) ||
      (stripped.length < 15 && !hasFilePath(stripped) && !hasSpecificEntity(stripped))
    ) {
      return true;
    }
  }

  // 4. Now check explicit skip patterns. If matched, the prompt is clear.
  if (SKIP_PATTERNS.some((p) => p.test(trimmed))) return false;

  // 5. Length-based catch-all for very short prompts.
  if (trimmed.length < 15 && !hasFilePath(trimmed) && !hasSpecificEntity(trimmed)) {
    return true;
  }

  return false;
}

function buildForcingInstruction(rawPrompt) {
  // Phase-C: slice BEFORE escape (avoids trailing backslash from \" at boundary)
  const safeSlice = rawPrompt.slice(0, 200).replace(/"/g, '\\"');
  return `[PROMPT-ENRICHMENT-GATE]

The user's prompt has been flagged as VAGUE by the deterministic enrichment hook. Before acting, you MUST:

1. **Check existing patterns**: \`node ~/.claude/scripts/prompt-pattern-store.js lookup --raw "<raw prompt>"\`
2. **Build the 4-part enriched prompt** wrapped in [ENRICHED-PROMPT-START]...[ENRICHED-PROMPT-END] markers (the auto-store hook reads these to persist the pattern):
\`\`\`
[ENRICHED-PROMPT-START]
RAW: <original user prompt>
CATEGORY: <refactor|bugfix|feature|review|docs|other>
TECHNIQUES: <comma-separated, e.g. chain-of-thought,rag>
INSTRUCTIONS: <what to do, how, constraints>
CONTEXT: <relevant background>
INPUT: <files/data involved>
OUTPUT: <expected deliverable>
[ENRICHED-PROMPT-END]
\`\`\`
3. **Show this to the user** unless a pattern lookup found 5+ approvals (auto-apply with one-line summary).
4. **Wait for approval** before executing.

Raw user prompt: "${safeSlice}"

This is a deterministic gate — do NOT skip enrichment based on conversation context. Vagueness is the only criterion.

[/PROMPT-ENRICHMENT-GATE]`;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const userPrompt = data.prompt || '';

    log('invoked', { promptPreview: userPrompt.slice(0, 100), promptLen: userPrompt.length });

    if (!userPrompt) {
      log('skipped', { reason: 'no_prompt' });
      return;
    }

    const vague = isVague(userPrompt);
    log('classified', { vague });

    if (!vague) {
      return;
    }

    log('injected', { instruction: 'PROMPT-ENRICHMENT-GATE' });
    process.stdout.write(buildForcingInstruction(userPrompt));
  } catch (err) {
    log('error', { error: err.message });
  }
});

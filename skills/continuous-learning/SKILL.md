---
name: continuous-learning
description: >
  Extracts reusable knowledge (debugging discoveries, architectural decisions, conventions)
  from work sessions and saves them as structured memory files in .claude/memories/.
  Also use when the user asks to "run a retrospective", "extract learnings", or
  "save what we learned" from the current session.
allowed-tools: Write, Read, Glob, Edit, Bash, WebSearch, mcp__docs-mcp-server__search_docs, mcp__docs-mcp-server__list_libraries, TaskCreate, TaskUpdate, TaskList
---

# Continuous Learning Skill

Extract reusable knowledge from work sessions and save it as memory files in `<project>/.claude/memories/`.

> **Note:** `<project>` refers to the current working directory (project root) throughout this document. When calling `search_docs`, the library name is the root directory name of the project (e.g., for `/Users/me/dev/my-app`, use `library: "my-app"`).

## Memory Categories

### Learnings (`learning_<topic>_<specific>`)

Knowledge discovered through debugging, investigation, or problem-solving that wasn't obvious beforehand.

**Extract when:**
- Solution required significant investigation (not a documentation lookup)
- Error message was misleading — root cause was non-obvious
- Discovered a workaround for a tool/framework limitation
- Found a workflow optimization through experimentation

**Examples:** `learning_background_task_watchdog_timeout`, `learning_orm_batch_insert_memory_spike`, `learning_ci_cache_invalidation_on_dependency_update`

### Decisions (`decision_<domain>_<topic>`)

Deliberate choices about how the project should work.

**Extract when:**
- Architectural choice made (patterns, structures, dependencies)
- Project convention or style rule established (backed by lint/formatter config, docs, team agreement — written or verbal — or consistent usage in the codebase)
- Tool/library selected over alternatives with reasoning
- User says "let's use X", "from now on we do Y", "the team agreed to Z"
- Trade-off resolved between competing concerns

> Personal preferences (*"I prefer,"* *"I like"*) are **not** decisions. See [Capture Rules](#capture-rules).

**Domain prefixes:**

| Domain | Examples |
|--------|----------|
| `architecture` | `decision_architecture_mvvm_coordinators` |
| `codestyle` | `decision_codestyle_naming_conventions` |
| `tooling` | `decision_tooling_linter_config` |
| `testing` | `decision_testing_snapshot_strategy` |
| `networking` | `decision_networking_retry_policy` |
| `ui` | `decision_ui_design_system` |
| `data` | `decision_data_orm_selection` |
| `project` | `decision_project_minimum_platform_version` |

---

## Capture Rules

Every memory must satisfy all three rules, regardless of whether the KB is used by one engineer or shared with a team.

- **Project-specific or a real gotcha.** The memory must be about *this* codebase's architecture, conventions, bugs, or workflows — **or** a non-obvious language/framework/tool gotcha that the project actually hit through debugging. Documentation-style knowledge that any capable LLM already has (how a CLI flag works, how a stdlib function behaves per its docs, a well-known framework API) does not belong here. The test is not *"is this about a language or tool?"* — it's *"did we discover this, or could we have looked it up?"* If the answer is *"we discovered it,"* save it even if the root cause is a language quirk.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Omit the actor; do not invent a role for them. Applies even in a single-user KB — identifiers age badly and add no signal.
- **Project pattern, not personal preference.** Capture what the *project* does, not what the engineer driving the session likes. A pattern qualifies when any of these hold: it's enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — Slack, meeting, session-level consensus all count), **or** already used consistently in the codebase. The codebase itself is the strongest evidence — if the pattern is demonstrably present in existing code, it's a pattern. If none of those hold and the only support is *"I prefer,"* *"I like,"* *"my style,"* it's a preference — do not save. When in doubt, the project's existing patterns win over the engineer's taste.

## Extraction Workflow

> **Autonomous by default.** This skill saves memories automatically when the quality gates are met. Never ask the user for permission to save — evaluate, decide, and save silently. Only mention saved memories in a brief one-line note after the main task response.

### Step 1: Evaluate the Current Task

After completing any task, evaluate in two stages.

**Stage A — Is it worth saving?**
- Did this require non-obvious investigation or debugging?
- Was a choice made about architecture, patterns, or approach?
- Is there an established project convention worth documenting?
- Would future sessions benefit from having this documented?

If NO to all → skip. Otherwise continue to Stage B.

**Stage B — Does it meet the Capture Rules?**
- Is it project-specific **or** a non-obvious gotcha the project hit through debugging (not documentation-style reference material)?
- Is it free of personal identifiers?
- Is it a project pattern (visible in the codebase, enforced by config, documented, or agreed by the team — written or verbal), not a single engineer's preference?

All three must pass. If any fail, either rewrite the memory to satisfy them (e.g. anonymize an actor) or skip. Do not save partial-fit memories.

### Step 2: Search Existing Knowledge

**Always search docs-mcp-server first** (semantic search across documentation and project memories):

```
mcp__docs-mcp-server__search_docs(library: "<project>", query: "<topic>")
```

**Fall back to file listing** if search_docs returns no results or the project library is not yet indexed:

```
Glob(pattern: ".claude/memories/*.md")
```

Determine if: update an existing memory, cross-reference related memories, or knowledge is already captured.

### Step 3: Research (When Appropriate)

**For general topics** — search available documentation sources first (the user may have MCP servers providing official docs for frameworks or libraries), then fall back to web search:
```
WebSearch(query: "<topic> best practices <current year>")
```

Research should **enrich** project-specific knowledge, not replace it. The goal is to add context or verify a finding — not to save generic knowledge that any LLM already knows. If the research result is general programming advice without a project-specific angle, skip saving it.

**Skip research for:** project-specific conventions, time-sensitive captures.

### Step 4: Structure and Save

Read [references/templates.md](references/templates.md) for template structures and staleness rules. For learnings, use the Learning Memory Template. For decisions, use the ADR-Inspired Template for complex trade-offs or the Simplified Template for straightforward, evidence-backed decisions.

**Fill in `Applies to`** at the top of every memory. Default to the current project's root directory name (the same value used as the `library` parameter when calling `search_docs`). If the session made it clear the memory applies to multiple projects, list them comma-separated. This field is informational — it helps semantic search and makes the memory portable if it's later consolidated into a cross-project knowledge base.

**Save:**
```
Write(file_path: "<project>/.claude/memories/<category>_<topic>_<specific>.md", content: "<structured markdown>")
```

**Update existing:**
```
Edit(file_path: "<project>/.claude/memories/<existing_name>.md", old_string: "<section to update>", new_string: "<updated section>")
```

---

## Quality Gates

Before saving any memory, verify:
- [ ] Name follows the correct pattern (`learning_` or `decision_<domain>_`)
- [ ] Content uses the appropriate template from references/templates.md
- [ ] Solution is verified to work (not theoretical)
- [ ] Content is specific enough to be actionable
- [ ] Content is general enough to be reusable
- [ ] No sensitive information (credentials, internal URLs)
- [ ] Does not duplicate existing memories
- [ ] References included if external sources were consulted
- [ ] No brittle references that rot quickly (see Staleness Prevention below)
- [ ] Knowledge is project-specific **or** a non-obvious gotcha the project discovered through debugging (not documentation-style reference material anyone could look up)
- [ ] No personal identifiers (names, GitHub/Slack handles, emails); actors anonymized or omitted
- [ ] Captures a project pattern, not an individual preference (evidence: consistent use in the codebase, lint/formatter config, docs, or team agreement — written or verbal)

### Do Not Save

Anti-examples, generalized — do not create memories like these:

| Category | Why it fails |
|----------|--------------|
| Generic tool / CLI reference | How a third-party command or flag works per its docs — belongs in that tool's docs, not a project KB |
| Documented language / framework behavior | A language feature or framework API working exactly as documented — anyone can read the docs |
| External API reference | Rate limits, auth flows, endpoint shapes of a public API, absent a project-specific twist |
| Personal identifier | Any memory whose content names an engineer, handle, or email — even in an example or footnote |
| Personal preference | A `decision_` not reflected in the codebase, not in any config/doc, and not agreed by the team (written or verbal) — just one engineer's taste |

**Language / framework gotchas are fair game** when they're non-obvious and the project discovered them through debugging — even if the underlying mechanic is generic. Example: a strong-reference-cycle bite in a language's closure semantics, a silent mutation in a stdlib container, a framework lifecycle ordering surprise. Those are learnings, not documentation.

When the underlying knowledge *is* salvageable, rewrite before saving — or skip entirely:

| Bad | Good |
|-----|------|
| Memory describes how a CLI flag works | *skip — that's tool documentation, not project knowledge* |
| Problem section says *"`@alice` hit a cache bug in auth"* | *"Auth flow hits a cache bug under condition X"* — drop the actor, keep the symptom |
| *"I prefer early returns"* and the codebase mixes both styles freely | *skip — preference, not pattern* |
| *"I prefer early returns"* and existing code consistently uses them (or a lint rule enforces it, or the team agreed) | Save as `decision_codestyle_early_returns` citing the codebase usage, rule, or agreement — now it's a pattern with evidence |

---

## Staleness Prevention

Before saving, check memory content against the Staleness Rules in [references/templates.md](references/templates.md). In short: use symbol names instead of line numbers, module-level references instead of deep file paths, and omit transient details like feature flags being removed or in-progress PR numbers.

---

## Retrospective Mode

When the user asks to "run a retrospective", "extract learnings from this session", or similar:

1. Review conversation history for extractable knowledge
2. Search existing memories following Step 2 of the Extraction Workflow
3. List candidates with brief justifications — prioritize by the evaluation criteria in Step 1 (non-obvious investigation, architectural choices, established project conventions). Filter the list through the Capture Rules before presenting it — drop anything that's documentation-style, names an engineer, or is a personal preference without project evidence.
4. Extract top 1-3 highest-value memories
5. Report what was created and why

---

## Tool Reference

| Tool | Purpose |
|------|---------|
| `mcp__docs-mcp-server__search_docs` | **Primary:** Semantic search across docs and memories |
| `mcp__docs-mcp-server__list_libraries` | List indexed libraries |
| `Glob` | **Fallback:** List all memory files (`.claude/memories/*.md`) |
| `Read` | Read a specific memory file |
| `Write` | Create new memory file |
| `Edit` | Update existing memory file |
| `Bash` | Remove outdated memory file (`rm`) |
| `WebSearch` | Built-in web search for general topics |

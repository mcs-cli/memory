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

> **Note:** `<project>` refers to the current working directory (project root) throughout this document. When calling `search_docs`, the `library:` parameter is the root directory name (e.g., for `/Users/me/dev/my-app`, use `library: "my-app"`) — this is set automatically by the indexing hook and stays folder-based. The `Applies to:` field inside memory content is **different**: it identifies the repo, not the local checkout, so it survives clones into different folder names. See [Step 4](#step-4-structure-and-save).

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

- **Tied to at least one project.** The memory must be about the architecture, conventions, bugs, workflows, or tool interactions of at least one real project, named in `Applies to:`. Multi-project captures are fine: if the same convention genuinely holds across several repos, list them comma-separated. What's excluded is free-floating language, framework, or CLI knowledge with no project anchor — even when it felt like a discovery in the moment; that belongs in the tool's own docs, not here. **Public** documentation anyone could look up (language reference, framework README, public CLI docs, public API reference) is also out. **Internal** project docs (Confluence pages, ADRs, RFCs, team wiki) are different: summarizing one into a memory *is* project knowledge, provided the memory links back to the source in `References:` so it doesn't silently drift. The test is *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → skip.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Omit the actor; do not invent a role for them. Applies even in a single-user KB — identifiers age badly and add no signal.
- **Project pattern, not personal preference.** Capture what the *project* does, not what the engineer driving the session likes. A pattern qualifies when any of these hold: it's enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — Slack, meeting, session-level consensus all count), **or** already used consistently in the codebase. The codebase itself is the strongest evidence — if the pattern is demonstrably present in existing code, it's a pattern. If none of those hold and the only support is *"I prefer,"* *"I like,"* *"my style,"* it's a preference — do not save. When in doubt, the project's existing patterns win over the engineer's taste.
  - **Bad patterns present in the code** are handled by category, not by blocking the capture. If one engineer flags a pattern as bad without team ratification, save a `learning_` warning (e.g. `learning_dont_use_X_because_Y`) — **only** when the warning has actionable shape: trigger (*"when you use X in case Y…"*), symptom (*"…it leaks / races / drops data"*), and avoidance (*"use Z instead"*). If the team has agreed the pattern is bad and should be avoided or replaced, the team agreement itself makes it a `decision_` (e.g. `decision_architecture_deprecate_X`). Pure *"this should be refactored someday"* observations without an actionable shape don't belong in the KB — they belong in the issue tracker.

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
- Is it tied to at least one real project in `Applies to:` — its code, config, workflow, or an internal doc — rather than generic tool/language reference?
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

Decide what to do, in this order of preference:

1. **Knowledge is already captured.** Skip.
2. **The new knowledge extends or refines an existing memory.** Prefer this: `Edit` the existing memory. The KB stays lean and a stronger single memory beats two partial ones.
3. **The content is too different to merge but still related.** Save a new memory and add a `Related:` cross-link to the neighbor. If the relationship is bidirectional, also `Edit` the neighbor to add a reciprocal `Related:` entry.

Use `Related:` for memories that share root causes, build on each other, contradict each other, or supersede older decisions. Don't cross-link every vaguely overlapping memory.

### Step 3: Research (When Appropriate)

**For general topics** — search available documentation sources first (the user may have MCP servers providing official docs for frameworks or libraries), then fall back to web search:
```
WebSearch(query: "<topic> best practices <current year>")
```

Research should **enrich** project-specific knowledge, not replace it. The goal is to add context or verify a finding — not to save generic knowledge that any LLM already knows. If the research result is general programming advice without a project-specific angle, skip saving it.

**Skip research for:** project-specific conventions, time-sensitive captures.

### Step 4: Structure and Save

Read [references/templates.md](references/templates.md) for template structures. For learnings, use the Learning Memory Template. For decisions, use the ADR-Inspired Template for complex trade-offs or the Simplified Template for straightforward, evidence-backed decisions.

**Fill in `Applies to`** at the top of every memory. Default to the **git repo name** — the last path segment of `git remote get-url origin`, with `.git` stripped (e.g. `git@github.com:mcs-cli/memory.git` → `memory`; `https://github.com/owner/my-app.git` → `my-app`). Fall back to the working directory's basename only when the repo has no remote configured. Use the repo name — not the directory basename — because folder names vary across clones (`~/dev/memory` vs `~/work/mcs-memory`) while the repo name is stable; this is also why `Applies to:` may differ from the `library:` parameter used for `search_docs`. If the session made it clear the memory applies to multiple projects, list them comma-separated (e.g. `**Applies to:** web-dashboard, ios-app, api-backend`); keep the content generic enough to stay true in every listed project, and if a memory is only partially relevant to one, save two separate memories instead of one mixed memory. This field is informational — it helps semantic search and makes the memory portable if it's later consolidated into a cross-project knowledge base.

**Pre-save identifier scan (mandatory).** Before `Write`, scan the drafted content for personal identifiers. Look for `@` characters (handles, emails), `<word>/<TICKET>-` and `<word>/<ticket>-description` branch-name shapes, `<word>@<word>` email shapes, and any first-name-looking tokens in examples, commit references, or narration. Any hit → rewrite to describe the artifact (the bug, pattern, decision) without the actor, or skip the save. This is a mechanical grep step, not a vibe check — the Quality Gates checkbox is not enough on its own.

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
- [ ] Knowledge is tied to at least one real project in `Applies to:` (its code, config, workflow, or an internal doc) — not generic tool/language reference material anyone could look up
- [ ] No personal identifiers (names, GitHub/Slack handles, emails); actors anonymized or omitted
- [ ] Captures a project pattern, not an individual preference (evidence: consistent use in the codebase, lint/formatter config, docs, or team agreement — written or verbal)

### Do Not Save

Anti-examples, generalized — do not create memories like these:

| Category | Concrete anti-example | Why it fails |
|----------|-----------------------|--------------|
| Public tool / CLI reference | "`git rebase -i` opens an editor with a todo list" | Git's own docs cover this verbatim |
| Documented language / framework behavior | "`$status` is read-only in zsh" | First hit in `man zshparam` — no project anchor |
| Public API reference | "GitHub API rate limit is 5000/hr authenticated" | Public API docs, no project-specific twist |
| Personal identifier | Problem section says *"`@alice` hit a cache bug"* | Rule 2 violation — names an engineer |
| Personal preference without project evidence | "Prefer early returns" with no lint rule, consistent codebase usage, or team agreement | Rule 3 violation — taste, not pattern |

**Internal docs are fair game.** A memory summarizing a Confluence page, ADR, RFC, or team-wiki entry is project knowledge — those sources aren't "documentation anyone can look up." Always include the source URL in `References:` so the memory points at the canonical version and readers can check for drift.

When the underlying knowledge *is* salvageable, rewrite before saving — or skip entirely:

| Bad | Good |
|-----|------|
| Memory describes how a CLI flag works | *skip — that's tool documentation, not project knowledge* |
| Problem section says *"`@alice` hit a cache bug in auth"* | *"Auth flow hits a cache bug under condition X"* — drop the actor, keep the symptom |
| *"I prefer early returns"* and the codebase mixes both styles freely | *skip — preference, not pattern* |
| *"I prefer early returns"* and existing code consistently uses them (or a lint rule enforces it, or the team agreed) | Save as `decision_codestyle_early_returns` citing the codebase usage, rule, or agreement — now it's a pattern with evidence |

---

## Staleness Prevention

Before saving, check memory content against these rules:

- **No line numbers.** Reference symbols (types, functions, methods) instead — they survive refactors.
- **Prefer module-level paths** over deep file paths. Use full paths only for stable, well-known files.
- **Use semantic anchors** — method signatures, protocol names, and architectural concepts are durable.
- **Omit transient details** — feature flags being removed, in-progress PR numbers, temporary workarounds.

**Good:** `SessionManager.refreshToken(forceExpiry:)` in the `Auth` module
**Bad:** `SessionManager.swift:142` at `Sources/Features/Auth/Session/SessionManager.swift`

---

## Retrospective Mode

When the user asks to "run a retrospective", "extract learnings from this session", or similar:

1. Review conversation history for extractable knowledge
2. Search existing memories following Step 2 of the Extraction Workflow
3. List candidates with brief justifications — prioritize by the evaluation criteria in Step 1 (non-obvious investigation, architectural choices, established project conventions). Filter the list through the Capture Rules before presenting it — drop anything that's generic tool/language reference with no project tie, names an engineer, or is a personal preference without project evidence.
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

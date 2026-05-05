---
name: continuous-learning
description: >
  Evaluates reusable knowledge (debugging discoveries, architectural decisions, conventions)
  from work sessions and routes it to the correct destination:
  .claude/memories/ for codebase knowledge, CLAUDE.local.md for environment/tool/instance
  config, or skip for public documentation. Also use when the user asks to "run a
  retrospective", "extract learnings", or "save what we learned" from the current session.
allowed-tools: Write, Read, Glob, Edit, Bash, WebSearch, mcp__docs-mcp-server__search_docs, mcp__docs-mcp-server__list_libraries
---

# Continuous Learning Skill

Evaluate reusable knowledge from work sessions and route it: codebase knowledge → `<project>/.claude/memories/`, environment/tool/instance config → suggest a `CLAUDE.local.md` section, public documentation → skip. The skill is the **only** path to `memories/` — never `Write` there directly. Suggesting `CLAUDE.local.md` is a successful outcome, not a failure.

> **Note:** `<project>` refers to the current working directory (project root) throughout this document. The `Applies to:` field inside memory content has its own semantics — see the `### Applies to` subsection in [Step 4](#step-4-route-and-save).

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

Apply these rules at save time. A draft that fails any rule is not saved (or is rewritten until it qualifies). The same rules apply whether the KB is used by one engineer or shared with a team.

<!-- SYNC:capture-rules -->
Every memory must satisfy all three rules.

- **Tied to at least one project.** The content must be about the architecture, conventions, bugs, workflows, or tool interactions of at least one real project named in `Applies to:`. Multi-project entries are fine when the same convention genuinely holds across several repos, listed comma-separated. Out of scope: free-floating language, framework, or CLI knowledge with no project anchor — that belongs in the tool's own docs. Public documentation anyone could look up (language reference, framework README, public CLI docs, public API reference) is also out. Internal project docs (Confluence pages, ADRs, RFCs, team wiki) are different: a memory summarizing one *is* project knowledge, provided it links back to the source in `References:`. Test: *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → the memory does not qualify.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Identifiers age badly and add no signal even in a single-user KB.
- **Project pattern, not personal preference.** Memories must capture what the *project* does, not what an individual engineer likes. A pattern qualifies when any of these hold: it is enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — chat, meeting, session-level consensus all count), **or** already used consistently in the codebase. Codebase usage is the strongest evidence. If the only support is *"I prefer,"* *"I like,"* *"my style,"* it is a preference and does not qualify.
  - **Bad patterns present in the code** are handled by category, not by exclusion. If one engineer flags a pattern as bad without team ratification, the appropriate shape is a `learning_` warning (e.g. `learning_dont_use_X_because_Y`) — **only** when it carries trigger (*"when you use X in case Y…"*), symptom (*"…it leaks / races / drops data"*), and avoidance (*"use Z instead"*). If the team has agreed the pattern is bad and should be avoided or replaced, the team agreement itself makes it a `decision_` (e.g. `decision_architecture_deprecate_X`). Pure *"this should be refactored someday"* observations without that shape belong in the issue tracker.
<!-- /SYNC -->

## Extraction Workflow

> **Autonomous by default.** This skill saves memories automatically when the quality gates are met. Never ask the user for permission to save — evaluate, decide, and save silently. Only mention saved memories in a brief one-line note after the main task response.

### Step 1: Evaluate the Current Task

After completing any task, evaluate in two stages.

**Stage A — Is it worth saving?**
- Did this require non-obvious investigation or debugging?
- Was a choice made about architecture, patterns, or approach?
- Is there an established project convention worth documenting?
- Without this, would someone make a different decision in the project?

If NO to all → skip. Otherwise continue to Stage B.

**Stage B — Apply the three Capture Rules above as hard gates. All three must pass.** Enforcement maps:

1. **Rule 1 (project-tied)** — apply Step 4 Check 1 (strip-the-anchors).
2. **Rule 2 (anonymous)** — apply Step 4 Check 2 (identifier scan).
3. **Rule 3 (pattern, not preference)** — verify by codebase usage, lint/formatter config, style guide, or recorded team agreement.

If any rule fails, rewrite the memory to satisfy it (e.g. anonymize an actor, replace tool-only substance with the actual project anchor) or skip. Do not save partial-fit memories.

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

### Step 4: Route and Save

Read [references/templates.md](references/templates.md) for template structures. For learnings, use the Learning Memory Template. For decisions, use the ADR-Inspired Template for complex trade-offs or the Simplified Template for straightforward, evidence-backed decisions.

#### Applies to

Fill in `Applies to:` at the top of every memory.

<!-- SYNC:applies-to -->
**The `Applies to:` field.** The first line of every memory declares which project(s) the memory targets. Use the **git repo name** — the last path segment of `git remote get-url origin`, with `.git` stripped (e.g. `git@github.com:org/repo.git` → `repo`; `https://github.com/owner/my-app.git` → `my-app`). Fall back to the working directory's basename only when the repo has no remote configured. Use the repo name — not the directory basename — because folder names vary across clones while the repo name is stable. This is also why `Applies to:` may differ from the `library:` parameter used for `search_docs`, which is folder-based and set automatically by the indexing hook.

When a memory genuinely applies to multiple projects, list them comma-separated (e.g. `**Applies to:** web-dashboard, ios-app, api-backend`); the content must stay true in every listed project. When a memory is only partially relevant to one listed project, split it into separate memories instead of mixing.
<!-- /SYNC -->

#### Mandatory pre-`Write` checks

Run both checks as visible output before any `Write` to `<project>/.claude/memories/`. Hidden reasoning is easy to skip; printed output is reviewable.

**Check 1: Strip-the-anchors (routing).**

<!-- SYNC:strip-the-anchors -->
**Strip-the-anchors test.** Mentally delete every project-specific reference (paths, symbols, endpoints, business logic, ticket prefixes, instance IDs, custom-field IDs, internal CLI flags) from the memory's content. What is left is the *substance*. If the substance is a useful standalone document — generic tool, language, or framework knowledge that would help any reader anywhere — the project tie was decoration and the memory does not qualify as project knowledge. **Internal or proprietary tools are not exempt:** how a private CLI, MCP server, GUI, or company-internal tool *works in general* belongs in the tool's own docs or in `CLAUDE.local.md`. Project endpoints sprinkled inside a tool how-to do not make it project knowledge.
<!-- /SYNC -->

Print, in two short lines, before the save:

- **Anchors stripped:** comma-separated list of every project-specific reference identified above. If none → the draft has no project tie; reject the save.
- **Substance without anchors:** one sentence describing what is left after stripping (e.g. *"the project's coordinator pattern between view-models and routing"*, *"how a third-party HTTP-debugging proxy's mock-rule syntax works"*).

If the substance line describes general, tool, language, or environment knowledge, reject the `Write` to `memories/`. Emit the content as a draft `CLAUDE.local.md` section (heading `## <Tool/Service Name>`) and a one-line note: "this is environment/tool config — consider adding the section above to `CLAUDE.local.md`." Stop. Do not edit `CLAUDE.local.md`; the user decides.

*Worked example.* Draft says "how to write a mock rule for an HTTP-debugging proxy returning 500 for `/checkout`."
- Anchors stripped: `/checkout`.
- Substance without anchors: "how the proxy's mock-rule syntax works."

Substance is tool knowledge → reject the `memories/` save; emit as a `CLAUDE.local.md` draft section under the proxy's name.

This shape forces the test to happen — you cannot list anchors without finding them, cannot describe the substance without evaluating it — without reprinting the full draft.

**Check 2: Personal-identifier scan.**

Scan the drafted content for personal identifiers. Look for `@` characters (handles, emails), `<word>/<TICKET>-` and `<word>/<ticket>-description` branch-name shapes, `<word>@<word>` email shapes, and any first-name-looking tokens in examples, commit references, or narration. Any hit → rewrite to describe the artifact (the bug, pattern, decision) without the actor, or skip the save. Mechanical grep, not a vibe check.

**Save (only after both checks pass):**
```
Write(file_path: "<project>/.claude/memories/<category>_<topic>_<specific>.md", content: "<structured markdown>")
```

**Update existing:**
```
Edit(file_path: "<project>/.claude/memories/<existing_name>.md", old_string: "<section to update>", new_string: "<updated section>")
```

---

## Quality Gates

> Capture Rules are gated in **Stage B** above; do not re-evaluate them here. This checklist covers formatting, quality, staleness, and security only — different concerns.

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

### Do Not Save

Anti-examples, generalized — do not create memories like these:

| Category | Concrete anti-example | Why it fails |
|----------|-----------------------|--------------|
| Public tool / CLI reference | "`git rebase -i` opens an editor with a todo list" | **[Rule 1]** Public docs cover this verbatim — no project anchor. |
| Internal / proprietary tool reference | "How to write a mock rule in `<company-internal-proxy>` to return 500 for endpoint X, plus where the rules JSON lives on disk" | **[Rule 1]** Tool mechanics — applies to any project using the tool. Sprinkling project endpoints into the example does not make it project knowledge. Belongs in the tool's own docs or `CLAUDE.local.md`. |
| Documented language / framework behavior | "`$status` is read-only in zsh" | **[Rule 1]** First hit in the language reference — no project anchor. |
| Public API reference | "Public Git hosting API rate limit is N/hr authenticated" | **[Rule 1]** Public API docs cover this — no project-specific twist. |
| Personal identifier | Problem section narrates a specific engineer hitting a cache bug | **[Rule 2]** Names an engineer. |
| Personal preference without project evidence | "Prefer early returns" with no lint rule, consistent codebase usage, or team agreement | **[Rule 3]** Taste, not pattern. |
| Historical record of a one-time shipped change | "We renamed folder `Install/` to `Sync/` after the command rename" | **[Forcing-function]** Once shipped, `git log` answers this. Future sessions read the current code, not the migration story. The memory drives no future behavior. |
| Generic engineering wisdom with a token project example | "Extract methods over condensing for lint compliance" with one PR cited | **[Rule 1]** Strip the example — what is left is universal advice that fits any project. Belongs in a coding-style doc, not a per-project KB. |
| One-line rule that belongs in CLAUDE.md | A single-sentence convention with no Context / Options / Consequences | **[Scope]** If it fits in one bullet under "Conventions" in CLAUDE.md, put it there. A standalone memory file is overhead for content that cannot grow. |
| Naming/prefix decision once enforced | "We kept the `External` prefix on adapter types" | **[Forcing-function]** Once the type system, lint, or formatter enforces it, the decision lives in the code. Future sessions read the code, not the memory. |
| One-time bug fix self-evident in current code | "Bug X used `dropFirst()`; we changed to a guarded check" | **[Forcing-function]** The fix is a small diff; the code reads correctly today. Save only if the bug class is recurring and the memory teaches the *avoidance pattern*, not the one fix. |
| Research artifact for deferred or dormant work | "Cross-platform audit / options-considered for feature X (deferred indefinitely)" | **[Forcing-function]** Useful when the work resumes — but it belongs in a planning doc or `docs/`, not the memory KB. The KB is for things that change how a session works on the active codebase today. |

**Internal docs are fair game.** A memory summarizing a Confluence page, ADR, RFC, or team-wiki entry is project knowledge — those sources aren't "documentation anyone can look up." Always include the source URL in `References:` so the memory points at the canonical version and readers can check for drift.

When the underlying knowledge *is* salvageable, rewrite before saving — or skip entirely:

| Bad | Good |
|-----|------|
| Memory describes how a CLI flag works | *skip — that's tool documentation, not project knowledge* |
| Problem section names a specific engineer hitting a cache bug in auth | *"Auth flow hits a cache bug under condition X"* — drop the actor, keep the symptom |
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

Retrospective mode runs the same autonomous flow as incidental capture, applied retroactively to the session. Save silently, report results — do not ask the user to pick.

When the user asks to "run a retrospective", "extract learnings from this session", or similar:

1. Review conversation history for extractable knowledge.
2. Search existing memories following Step 2 of the Extraction Workflow.
3. Filter candidates through the Capture Rules. Drop anything that fails Rule 1 (no project tie), Rule 2 (names an engineer), or Rule 3 (preference without project evidence).
4. Save the top 1–3 highest-value candidates that pass, following Step 4's pre-`Write` checks.
5. Report what was created and why in a brief summary.

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

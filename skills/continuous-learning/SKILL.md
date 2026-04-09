---
name: continuous-learning
description: >
  Extracts reusable knowledge (debugging discoveries, architectural decisions, conventions)
  from work sessions and saves them as structured memory files in .claude/memories/.
  Also use when the user asks to "run a retrospective", "extract learnings", or
  "save what we learned" from the current session.
allowed-tools: Write, Read, Glob, Edit, Bash, WebSearch, mcp__docs-mcp-server__search_docs, mcp__docs-mcp-server__list_libraries, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
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
- Convention or style preference established
- Tool/library selected over alternatives with reasoning
- User says "let's use X", "I prefer Y", "from now on..."
- Trade-off resolved between competing concerns

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

## Extraction Workflow

### Step 1: Evaluate the Current Task

After completing any task, ask:
- Did this require non-obvious investigation or debugging?
- Was a choice made about architecture, patterns, or approach?
- Did the user express a preference or convention?
- Would future sessions benefit from having this documented?

If NO to all → skip. If YES to any → continue.

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

**Skip research for:** project-specific conventions, personal preferences, time-sensitive captures.

### Step 4: Structure and Save

Read [references/templates.md](references/templates.md) for template structures and staleness rules, then apply the appropriate template.

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

---

## Staleness Prevention

Before saving, check memory content against the Staleness Rules in [references/templates.md](references/templates.md). In short: use symbol names instead of line numbers, module-level references instead of deep file paths, and omit transient details like feature flags being removed or in-progress PR numbers.

---

## Retrospective Mode

When the user asks to "run a retrospective", "extract learnings from this session", or similar:

1. Review conversation history for extractable knowledge
2. Search existing memories following Step 2 of the Extraction Workflow
3. List candidates with brief justifications — prioritize by the evaluation criteria in Step 1 (non-obvious investigation, architectural choices, expressed preferences)
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

---
name: continuous-learning
description: >
  Evaluates reusable knowledge (debugging discoveries, architectural decisions, conventions)
  from work sessions and routes it to the correct destination:
  .claude/memories/ for codebase knowledge, CLAUDE.local.md for environment/tool/instance
  config, or skip for public documentation. Also use when the user asks to "run a
  retrospective", "extract learnings", or "save what we learned" from the current session.
allowed-tools:
  - Read
  - Glob
  - Grep
  - WebSearch
  - Write(.claude/memories/**)
  - Edit(.claude/memories/**)
  - Bash(git grep *)
  - Bash(git show *)
  - Bash(git rev-parse *)
  - Bash(git remote get-url *)
  - mcp__memory-loop__query
  - mcp__memory-loop__get
  - mcp__memory-loop__multi_get
disallowed-tools: AskUserQuestion
---

# Continuous Learning Skill

Evaluate reusable knowledge from work sessions and route it: codebase knowledge → `<project>/.claude/memories/`, environment/tool/instance config → suggest a `CLAUDE.local.md` section, public documentation → skip. Suggesting `CLAUDE.local.md` is a successful outcome, not a failure.

> **Note:** `<project>` is the project root throughout this document: `git rev-parse --show-toplevel`, else `CLAUDE_PROJECT_DIR`, else the current working directory — the same order the memory hooks use. Run every command from there and never `cd` into `.claude/memories/` — the memories may live in a separate git repo, so `git` commands would silently answer for the wrong one. The `Applies to:` field inside memory content has its own semantics — see the **Applies to** subsection in [Step 4](#step-4-route-and-save).

> **Without version control.** Every git step applies only when the relevant root — the project for code claims, the memories folder for history — is under version control. Otherwise check the working tree with Grep/Glob, skip `Pending:` handling, and say which you did. Without VCS the working tree is the only state, so a claim missing there is wrong, not pending.

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

- **Tied to at least one project.** The content must be about the architecture, conventions, bugs, workflows, or tool interactions of at least one real project named in `Applies to:`. Multi-project entries are fine when the same convention genuinely holds across several repos, listed comma-separated. Out of scope: free-floating language, framework, or CLI knowledge with no project anchor — that belongs in the tool's own docs. Public documentation anyone could look up (language reference, framework README, public CLI docs, public API reference) is also out. Internal project docs (Confluence pages, ADRs, RFCs, team wiki) are different: a memory summarizing one *is* project knowledge, provided it links back to the source in `References:`. Test: *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → the memory does not qualify. Every claim must also change how a session works in a project whose sessions read this KB. Listing another project in `Applies to:` does not make its internals relevant: knowledge of another project's internals is cut down to the conclusion that changes work in the reading project. A claim about another project counts as checked only if the session read that project's code, or an internal doc cited in `References:`.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Identifiers age badly and add no signal even in a single-user KB.
- **Project pattern, not personal preference.** Memories must capture what the *project* does, not what an individual engineer likes. A pattern qualifies when any of these hold: it is enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — chat, meeting, or the user stating the agreement in the session), **or** already used consistently in the codebase. Codebase usage is the strongest evidence that a pattern exists, but code written in the same session is no evidence at all: the pattern needs a precedent from before the session, a lint rule or ADR, or a stated agreement. Usage alone does not make the pattern worth a memory, because the code already conveys it — unless new code could break it unnoticed. If the only support is *"I prefer,"* *"I like,"* *"my style,"* it is a preference and does not qualify.
  - **Bad patterns present in the code** are handled by category, not by exclusion. If one engineer flags a pattern as bad without team ratification, the appropriate shape is a `learning_` warning (e.g. `learning_dont_use_X_because_Y`) — **only** when it carries trigger (*"when you use X in case Y…"*), symptom (*"…it leaks / races / drops data"*), and avoidance (*"use Z instead"*). If the team has agreed the pattern is bad and should be avoided or replaced, the team agreement itself makes it a `decision_` (e.g. `decision_architecture_deprecate_X`). Pure *"this should be refactored someday"* observations without that shape belong in the issue tracker.
<!-- /SYNC -->

## Extraction Workflow

> **Autonomous by default.** This skill saves memories automatically when the quality gates are met. Never ask the user for permission to save — evaluate, decide, and save silently. *Silently* means without asking; the Step 2 and Step 4 check lines are still printed. Otherwise, only mention saved memories in a brief one-line note after the main task response.

### Step 1: Evaluate the Current Task

After completing any task, evaluate in two stages.

**Stage A — Is it worth saving?**
- Did this require non-obvious investigation or debugging?
- Was a choice made about architecture, patterns, or approach?
- Is there an established project convention the code follows but does not make obvious?
- **Forcing-function (hard gate):** without this memory, would a future session act differently in the project? If the current code or a mechanical check already drives the behavior → skip. It fails outright when the error or compiler message already names the cause, and for a "use X for Y" memory when X is already the dominant way the code does Y. The "Do Not Save" table cites this as `[Forcing-function]`.

If the forcing-function gate fails, or no other prompt answers yes → skip. Otherwise continue to Stage B.

**Stage B — The three Capture Rules above are hard gates; all three must pass.** Step 4's Checks 1 and 2 enforce Rules 1 and 2; verify Rule 3 against the evidence the rule lists. If any rule fails, rewrite the memory to satisfy it (e.g. anonymize an actor, replace tool-only substance with the actual project anchor) or skip. Do not save partial-fit memories.

### Step 2: Search Existing Knowledge

**Always search the memory index first** (semantic search across this project's memories):

```
mcp__memory-loop__query(searches: [{type: "lex", query: "<terms expected verbatim>"},
                                   {type: "vec", query: "<topic, in prose>"}],
                        intent: "<what you want, and what you don't>", rerank: false, limit: 6)
```

**Fall back to file listing** if the search returns no results or the index is not yet built:

```
Glob(pattern: ".claude/memories/*.md")
```

**Read the candidates with `mcp__memory-loop__get` before deciding.** Result snippets are capped
at 300 characters and often show only a document's title, so a merge-or-skip call made from them
is a guess — and the cost of guessing wrong is a duplicate memory or a lost refinement.

Decide what to do, in this order of preference:

1. **Knowledge is already captured.** Skip.
2. **It shares a trigger with an existing memory** — one you read and judged on-topic, not merely a search hit. Fold it in, following **Update existing** in Step 4, or skip; when unsure, skip. If this session already saved or edited that memory, edit it again only to fix a contradiction.
3. **It has a different trigger.** Save a new memory only if it passes Stage A on its own: would a future session holding only this text act differently? Otherwise skip. Link the neighbor with `Related:` in the new memory only; edit the neighbor only when it is wrong without the new memory.

When one run yields several candidates, compare them with each other as well as with the KB: candidates that share a trigger are one memory. Each memory that survives runs every check on its own, with its own search and printed lines.

Use `Related:` for memories that share root causes, build on each other, contradict each other, or supersede older decisions. Don't cross-link every vaguely overlapping memory.

Print one line recording this search before continuing, matching the Step 4 checks — hidden reasoning is easy to skip, printed output is reviewable:

```
KB search: "<query>" -> <n> hits, <what they covered> -> <branch taken, and the file edited or created>
```

### Step 3: Research (When Appropriate)

To verify a finding about a library or tool, check available documentation sources first, then `WebSearch(query: "<library or tool> <version> <the specific behavior observed>")`. Research enriches project knowledge; general advice with no project angle is not saved. Skip research for project-specific conventions and time-sensitive captures.

### Step 4: Route and Save

Read [references/templates.md](references/templates.md) for template structures. For learnings, use the Learning Memory Template. For decisions, use the ADR-Inspired Template for complex trade-offs or the Simplified Template for straightforward, evidence-backed decisions.

#### Applies to

Fill in `Applies to:` directly under the title heading of every memory.

<!-- SYNC:applies-to -->
**The `Applies to:` field.** Place `**Applies to:**` on the line immediately after the `# Title` heading of every memory; it declares which project(s) the memory targets. Use the **git repo name** — the last path segment of `git remote get-url origin`, with `.git` stripped (e.g. `git@github.com:org/repo.git` → `repo`; `https://github.com/owner/my-app.git` → `my-app`). Fall back to the project directory's basename only when the repo has no remote configured or the project is not a git repo. Use the repo name — not the directory basename — because folder names vary across clones while the repo name is stable. This is also why `Applies to:` may differ from the set of memories the search index actually covers, which is folder-based and set automatically by the indexing hook.

When a memory genuinely applies to multiple projects, list them comma-separated (e.g. `**Applies to:** web-dashboard, ios-app, api-backend`); the content must stay true in every listed project. When a memory is only partially relevant to one listed project, split it into separate memories instead of mixing.
<!-- /SYNC -->

#### Mandatory pre-`Write` checks

Run these checks as visible output before any `Write` to `<project>/.claude/memories/`, and on the added text before any `Edit`. Hidden reasoning is easy to skip; printed output is reviewable.

For a new memory, first print what it changes — Stage A's answer, made visible:

- **Drives:** what a future session does differently because this memory exists. *"Claims verified"* or a restatement of the content is not an answer. If two memories in one run print the same behavior, merge them.

**Check 1: Strip-the-anchors (routing).**

<!-- SYNC:strip-the-anchors -->
**Strip-the-anchors test.** Mentally delete every project-specific reference (paths, symbols, endpoints, business logic, ticket prefixes, instance IDs, custom-field IDs, internal CLI flags) from the memory's content. What is left is the *substance*. If the substance is a useful standalone document — generic tool, language, or framework knowledge that would help any reader anywhere — the project tie was decoration and the memory does not qualify as project knowledge. **Internal or proprietary tools are not exempt:** how a private CLI, MCP server, GUI, or company-internal tool *works in general* belongs in the tool's own docs or in `CLAUDE.local.md`. Project endpoints sprinkled inside a tool how-to do not make it project knowledge.
<!-- /SYNC -->

Print, in two short lines, before the save:

- **Anchors stripped:** comma-separated list of every project-specific reference identified above. If none → the draft has no project tie; reject the save.
- **Substance without anchors:** one sentence describing what is left after stripping (e.g. *"the project's coordinator pattern between view-models and routing"*, *"how a third-party HTTP-debugging proxy's mock-rule syntax works"*).

If the substance line describes general, tool, language, or environment knowledge, reject the `Write` to `memories/`. Emit the content as a draft `CLAUDE.local.md` section (heading `## <Tool/Service Name>`) and a one-line note: "this is environment/tool config — consider adding the section above to `CLAUDE.local.md`." Stop (on an Edit, route only the added text — see Update existing). Do not edit `CLAUDE.local.md`; the user decides.

This shape forces the test to happen — you cannot list anchors without finding them, cannot describe the substance without evaluating it — without reprinting the full draft.

**Check 2: Personal-identifier scan.**

Scan the drafted content for personal identifiers. Look for `@` characters (handles, emails), `<word>/<TICKET>-` and `<word>/<ticket>-description` branch-name shapes, `<word>@<word>` email shapes, and any first-name-looking tokens in examples, commit references, or narration. Any hit → rewrite to describe the artifact (the bug, pattern, decision) without the actor, or skip the save. Mechanical grep, not a vibe check. Print one line:

- **Identifiers:** `none` | `rewrote <what>` | `skipped`

**Check 3: Default-branch state.**

Under version control, verify the memory's central claim against the default branch, not only the working tree. Resolve the ref without fetching — `git rev-parse --verify origin/HEAD`, else the local default branch (e.g. `main`, `master`, `develop`) — then `git grep <symbol> <ref>`, or `git show <ref>:<path>` when the claim is not greppable. Print one line:

- **Default branch:** `holds` | `pending (<what must merge>)` | `no VCS`

**`pending` only when** the change is in flight and has a PR or ticket to name. A claim missing from the default branch with neither is wrong or not ready, not pending — don't save it.

**How to write it:** phrase the claim conditionally (*"once X lands…"*) and add `**Pending:** <PR or ticket>` on the line after `Applies to:` — never a branch name or a description of the change. Record what stays true after the merge, not the surface of the unmerged API. Never write *"already migrated"* or *"not merged yet"*; both go stale on merge.

**Save (only after Checks 1 and 2 pass and the Drives line and Check 3 are printed):**
```
Write(file_path: "<project>/.claude/memories/<category>_<topic>_<specific>.md", content: "<structured markdown>")
```

**Update existing:**

1. Run the checks on the added text. If Check 1 fails, route that text, not the memory.
2. Fold the new text into the section it belongs to, and rewrite a contradicted or superseded statement where it stands. Never append a section for a refinement or a correction — a `Related:` note is not a correction either. If Check 3 printed `pending`, keep the statement and add the conditional one beside it.
3. Refresh the rest of the file in the same edit. If its `Pending:` change has merged, fold it in: remove the superseded statement, the conditional phrasing, and the `Pending:` line. Check its backticked symbols with one `git grep` against the default branch, and its `Related:` targets for existence. Report a missing symbol or broken link rather than fixing or deleting it — removing content is the audit's job, after approval. Print one line:
   - **Refresh:** `pending <PR or ticket> merged -> folded` | `pending open` | `no pending` | `pending n/a (no VCS)`; `symbols <held>/<total>` (missing ones named); `links ok` | `links broken: <names>`
4. Re-read the whole file afterwards to catch a broken splice.

```
Edit(file_path: "<project>/.claude/memories/<existing_name>.md", old_string: "<section to update>", new_string: "<updated section>")
```

---

## Quality Gates

> Capture Rules are gated in **Stage B**; this checklist covers formatting, quality, and security only.

Before saving any memory, verify:
- [ ] Name follows the correct pattern (`learning_` or `decision_<domain>_`)
- [ ] Content uses the appropriate template from references/templates.md
- [ ] Solution is verified to work (not theoretical), on the branch it describes
- [ ] Content is specific enough to be actionable
- [ ] Content is general enough to be reusable
- [ ] No sensitive information (credentials, tokens, private endpoints) — an internal doc's link in `References:` is expected, not sensitive
- [ ] References included if external sources were consulted

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
| Historical record of a one-time shipped change | "We renamed folder `Install/` to `Sync/` after the command rename" | **[Forcing-function]** Once shipped, `git log` answers this. Future sessions read the current code, not the migration story. Assumes version control holds the history — without it nothing else records the change. |
| Generic engineering wisdom with a token project example | "Extract methods over condensing for lint compliance" with one PR cited | **[Rule 1]** Strip the example — what is left is universal advice that fits any project. Belongs in a coding-style doc, not a per-project KB. |
| One-line rule that belongs in CLAUDE.md | A single-sentence convention with no Context / Options / Consequences | **[Scope]** If it fits in one bullet under "Conventions" in CLAUDE.md, put it there. A standalone memory file is overhead for content that cannot grow. |
| Naming/prefix decision once enforced | "We kept the `External` prefix on adapter types" | **[Forcing-function]** Once the type system, lint, or formatter enforces it, the decision lives in the code. Future sessions read the code, not the memory. |
| One-time bug fix self-evident in current code | "Bug X skipped the first element instead of the matching one; we changed the filter to compare identity" | **[Forcing-function]** The fix is a small diff; the code reads correctly today. Save only if the bug class is recurring and the memory teaches the *avoidance pattern*, not the one fix. |
| Description of code written this session | "What the new `ReportPublisher` chain emits and in which order", saved from the session that wrote it | **[Forcing-function]** Merged, the code explains itself; unmerged, it is not evidence (Rule 3). A trap found while writing it qualifies only with trigger, symptom, and avoidance. |
| Fault in one engineer's environment | "Backend rejects signed requests because this machine's clock drifts with NTP blocked" | **[Rule 1]** Not project behavior, even with project anchors — it is that engineer's `CLAUDE.local.md` note. |
| Research artifact for deferred or dormant work | "Cross-platform audit / options-considered for feature X (deferred indefinitely)" | **[Forcing-function]** Useful when the work resumes — but it belongs in a planning doc or `docs/`, not the memory KB. The KB is for things that change how a session works on the active codebase today. |

When the underlying knowledge *is* salvageable, rewrite before saving:

| Bad | Good |
|-----|------|
| Problem section names a specific engineer hitting a cache bug in auth | *"Auth flow hits a cache bug under condition X"* — drop the actor, keep the symptom |
| *"I prefer early returns"*, existing code consistently uses them (or the team agreed), and no lint rule, formatter, or compiler check enforces them | Save as `decision_codestyle_early_returns` citing the codebase usage or agreement — Rule 3 makes it a pattern; the forcing-function passes only because nothing enforces it and new code could break it |

---

## Staleness Prevention

Before saving, check memory content against these rules:

- **No line numbers.** Reference symbols (types, functions, methods) instead — they survive refactors.
- **Prefer module-level paths** over deep file paths. Use full paths only for stable, well-known files.
- **Use semantic anchors** — method signatures, interface and type names, and architectural concepts are durable. For personal or environment tooling, name the action, not the tool (*"clean, then rebuild"*, not a specific MCP tool or local CLI) — which tool does it is environment config. Commands the project's own scripts or CI define stay verbatim.
- **Omit transient details** — feature flags being removed, in-progress PR numbers (a `Pending:` line excepted), temporary workarounds without a removal condition, and the story of how the knowledge was found (PR sequences, attempts, reverts): state what it taught as a rule.

**Good:** `SessionManager.refreshToken` in the `Auth` module
**Bad:** `src/features/auth/session/SessionManager.<ext>:142`

---

## Retrospective Mode

Retrospective mode runs the same autonomous flow as incidental capture, applied retroactively to the session. Save silently, report results — do not ask the user to pick.

When the user asks to "run a retrospective", "extract learnings from this session", or similar:

1. Review conversation history for extractable knowledge.
2. Search existing memories following Step 2 of the Extraction Workflow.
3. Filter candidates through Step 1 — Stage A's forcing-function gate and Stage B's Capture Rules.
4. Save the top 1–3 highest-value candidates that pass, following Step 4's pre-`Write` checks. The cap is deliberate: a long session can yield many qualifying memories, and three is the most worth adding at once — the gates decide what is eligible, the cap decides how many land per session. Note any you set aside.
5. Report what was created and why in a brief summary.


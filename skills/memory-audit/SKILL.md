---
name: memory-audit
description: >
  Review and audit memory files in .claude/memories/ to keep the knowledge base lean and valuable.
  Use this skill when the user says "audit memories", "review memories", "clean up memories",
  "memory audit", "check my memories", or wants to prune, deduplicate, or assess the quality
  of their stored learnings and decisions. This is a manual-only skill — never trigger automatically.
allowed-tools: Read, Glob, Grep, Edit, Bash, Write, mcp__docs-mcp-server__search_docs, mcp__docs-mcp-server__list_libraries, AskUserQuestion
---

# Memory Audit Skill

Audit the knowledge base in `<project>/.claude/memories/` to keep it lean, relevant, and high-quality. `<project>` refers to the current working directory. **DROP is not a failure** — deleting a memory that does not qualify (or that belongs in `CLAUDE.local.md`, in a planning doc, or in the tool's own docs) is the audit doing its job.

Over time, memory files accumulate — some become stale, some duplicate each other, some capture generic knowledge that doesn't belong in a project-specific KB. This skill walks through every memory with the user, recommending **KEEP**, **DROP**, or **UPDATE** with clear rationale, and only acts on user-approved changes.

> **This skill is user-initiated only.** Never run it automatically or as part of another workflow.

---

## Capture Rules

Apply these rules at audit time. A memory that fails any rule is a candidate for UPDATE (when a rewrite restores qualification) or DROP (when nothing of value remains after the rewrite).

<!-- SYNC:capture-rules -->
Every memory must satisfy all three rules.

- **Tied to at least one project.** The content must be about the architecture, conventions, bugs, workflows, or tool interactions of at least one real project named in `Applies to:`. Multi-project entries are fine when the same convention genuinely holds across several repos, listed comma-separated. Out of scope: free-floating language, framework, or CLI knowledge with no project anchor — that belongs in the tool's own docs. Public documentation anyone could look up (language reference, framework README, public CLI docs, public API reference) is also out. Internal project docs (Confluence pages, ADRs, RFCs, team wiki) are different: a memory summarizing one *is* project knowledge, provided it links back to the source in `References:`. Test: *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → the memory does not qualify.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Identifiers age badly and add no signal even in a single-user KB.
- **Project pattern, not personal preference.** Memories must capture what the *project* does, not what an individual engineer likes. A pattern qualifies when any of these hold: it is enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — chat, meeting, session-level consensus all count), **or** already used consistently in the codebase. Codebase usage is the strongest evidence. If the only support is *"I prefer,"* *"I like,"* *"my style,"* it is a preference and does not qualify.
  - **Bad patterns present in the code** are handled by category, not by exclusion. If one engineer flags a pattern as bad without team ratification, the appropriate shape is a `learning_` warning (e.g. `learning_dont_use_X_because_Y`) — **only** when it carries trigger (*"when you use X in case Y…"*), symptom (*"…it leaks / races / drops data"*), and avoidance (*"use Z instead"*). If the team has agreed the pattern is bad and should be avoided or replaced, the team agreement itself makes it a `decision_` (e.g. `decision_architecture_deprecate_X`). Pure *"this should be refactored someday"* observations without that shape belong in the issue tracker.
<!-- /SYNC -->

The audit enforces these rules through the criteria below — see Group A.

## The `Applies to:` field

<!-- SYNC:applies-to -->
**The `Applies to:` field.** Place `**Applies to:**` on the line immediately after the `# Title` heading of every memory; it declares which project(s) the memory targets. Use the **git repo name** — the last path segment of `git remote get-url origin`, with `.git` stripped (e.g. `git@github.com:org/repo.git` → `repo`; `https://github.com/owner/my-app.git` → `my-app`). Fall back to the working directory's basename only when the repo has no remote configured. Use the repo name — not the directory basename — because folder names vary across clones while the repo name is stable. This is also why `Applies to:` may differ from the `library:` parameter used for `search_docs`, which is folder-based and set automatically by the indexing hook.

When a memory genuinely applies to multiple projects, list them comma-separated (e.g. `**Applies to:** web-dashboard, ios-app, api-backend`); the content must stay true in every listed project. When a memory is only partially relevant to one listed project, split it into separate memories instead of mixing.
<!-- /SYNC -->

**Audit-time usage.** Audit only the memories in the current checkout's `.claude/memories/` and fact-check against this project only. When deciding whether a memory targets *this* project, compare its `Applies to:` against the **git repo name**, not the directory basename — a folder rename does not change the project. Never DROP a memory solely because its `Applies to:` lists other projects. If the KB is centralized across projects via a separate mechanism, that mechanism owns its own audit — this skill does not reach across repos.

---

## Audit Criteria

Evaluate each memory against the criteria below, grouped into three:

- **Group A** mirrors the Capture Rules (the same gates a memory had to pass at save time). A memory that violates any of these now is a candidate for UPDATE or DROP — even if it slipped through capture.
- **Group B** is the audit's own gate: the forcing-function test. Capture cannot test it because only audit sees how a memory has aged. This is where past audits drifted into KEEP-by-default; apply it with teeth.
- **Group C** are audit-only mechanics — tests that depend on the current state of the codebase, the KB as a whole, or time elapsed since capture.

### Group A — Capture Rules, restated

#### A.1 Tied to at least one project (Capture Rule 1)
- Does the memory's content stay tied to a real project named in `Applies to:` — its codepaths, architecture, build/deploy setup, test strategy, tooling choices, team workflow, or recurring implementation patterns?
- DROP memories that duplicate **public** documentation anyone could look up (language reference, public CLI/API docs, framework README) and memories whose content has no real tie to any project in `Applies to:`.
- KEEP summaries of **internal** docs (Confluence, ADRs, RFCs, wiki). If an internal-doc summary lacks a `References:` link back to the source, flag for UPDATE (add the link) rather than DROP.
- Apply the strip-the-anchors test:

<!-- SYNC:strip-the-anchors -->
**Strip-the-anchors test.** Mentally delete every project-specific reference (paths, symbols, endpoints, business logic, ticket prefixes, instance IDs, custom-field IDs, internal CLI flags) from the memory's content. What is left is the *substance*. If the substance is a useful standalone document — generic tool, language, or framework knowledge that would help any reader anywhere — the project tie was decoration and the memory does not qualify as project knowledge. **Internal or proprietary tools are not exempt:** how a private CLI, MCP server, GUI, or company-internal tool *works in general* belongs in the tool's own docs or in `CLAUDE.local.md`. Project endpoints sprinkled inside a tool how-to do not make it project knowledge.
<!-- /SYNC -->

If the test fails, recommend DROP — or UPDATE only if a rewrite around the actual project anchor produces something genuinely project-specific.

#### A.2 Anonymous (Capture Rule 2)
- Does the memory name specific engineers, GitHub/Slack handles, or emails anywhere (problem, example, footnote)?
- Does it narrate "who investigated whom" or "who fixed what"?
- **Verdict:** UPDATE to strip the identifier entirely (describe the artifact, not the actor) when the underlying knowledge is still useful; DROP when the identifier *is* the content and removing it leaves nothing.

#### A.3 Project pattern, not personal preference (Capture Rule 3)
- Is the memory a `decision_` backed by real evidence the pattern is the project's? Valid evidence: consistent use in the codebase, lint/formatter config, style guide / docs, or a team agreement (written *or* verbal — not every agreement is in a doc).
- Red-flag phrases inside the memory: *"I prefer,"* *"I like,"* *"my style."*
- Spot-check the repo — **codebase usage is the strongest single signal**. If the declared pattern is demonstrably present in existing code, the memory is a pattern even without a written rule. If the codebase is inconsistent and there's no config/doc/agreement, it is a preference.
- **Verdict:** DROP when no evidence exists anywhere. UPDATE when the pattern is real (visible in code, or the user confirms a team agreement) but the memory is phrased as personal taste; rewrite to point at the actual evidence.

### Group B — The audit's own gate

#### B.1 Actionability — the forcing-function test
- **Primary test:** *"Would a future session act differently in this codebase because this memory exists?"* If the answer is "no, the code itself or `git log` already conveys it" → DROP.
- Can a future session **act on** this memory to avoid a mistake or follow a convention? Or is it purely descriptive/documentary with no clear "do this, not that" takeaway?
- **Fact-check ≠ actionability.** A claim being *true* and *project-specific* is not enough. Many memories pass A.1 (real anchors) and C.4 (claims still verifiable) but still fail this one — historical records, shipped naming decisions, one-time bug fixes whose fix is self-evident in the code. Apply both passes; do not conflate them.
- **Bias check.** If you find yourself defending KEEP with "it's project-specific and still accurate" without identifying the *behavior change* it drives, that's the leniency trap. KEEP requires a positive answer to the forcing-function test, not just absence of a reason to drop.

### Group C — Audit-only mechanics

#### C.1 Naming Convention
- Learnings must follow `learning_<topic>_<specific>.md`.
- Decisions must follow `decision_<domain>_<topic>.md`.
- Files that don't follow either pattern are likely older or ad-hoc — flag for rename or reclassification.

#### C.2 Duplication
- Does this memory overlap significantly with another memory?
- Could two or more memories be merged into one stronger entry?
- If overlap is partial and the memories are genuinely distinct (different root causes, different scopes, or different categories like a `learning_` warning next to a `decision_` that resolved it), recommend UPDATE to cross-link them via `Related:` instead of merging.
- Search the existing knowledge base or memory files for semantically similar content — two memories may use different names but cover the same ground.

#### C.3 Quality
- Does the memory follow the standard templates? (Problem/Trigger/Solution/Verification/Example for learnings; Decision/Context/Options/Choice/Consequences for ADR decisions; Decision/Rationale/Examples for simplified decisions)
- Is the content specific enough to be useful but general enough to be reusable?
- Are code examples still accurate?

#### C.4 Fact-Checking
- **Verify key claims against the codebase.** If a memory says "we use pattern X in module Y," search the code to confirm that pattern still exists.
- Use `Grep` to check for symbol names, type names, or patterns referenced in the memory.
- Use `Glob` to verify that referenced files or modules still exist.
- If a memory describes a convention (e.g., "all repositories conform to protocol X"), spot-check a few cases to confirm it holds.
- Do not audit every single line — focus on the **central claim** of the memory. If the core assertion is wrong, recommend DROP or UPDATE.

#### C.5 Staleness Signals
- **Line number references** — e.g., `lines 266-296` or `FileName.swift:142`. These break after any edit. Recommend UPDATE to replace with symbol names.
- **Deep file paths** — full nested paths are fragile. Recommend UPDATE to use module-level references unless the path is stable and well-known.
- **Transient details** — feature flag names being removed, in-progress PR numbers, temporary workarounds with known expiry.
- References to features or files that may have been removed or heavily refactored.
- **Broken `Related:` links** — an entry in the memory's `Related:` section that points at a memory filename no longer present (DROP'd or renamed during a previous audit). Recommend UPDATE to fix the link to its new name or remove the entry.
- Old dates without timeless content — treat as a signal for closer scrutiny, not an automatic DROP.

---

## DROP Categories — recurring patterns that should not need user pushback

The categories below are the recurring concrete shapes of B.1 (forcing-function) failure. When a memory matches one, the analysis is already done — call DROP without hedging. None of these are "in doubt" cases.

### A. Self-marked superseded / deferred / abandoned
- The memory itself says **SUPERSEDED**, **deferred indefinitely**, **closed without implementation**, **path abandoned**, or points at another memory as the current decision.
- The "historical context" argument is rarely worth a file. If the superseder cross-links back, that's enough provenance. DROP the older one.

### B. Pure historical records of shipped one-time changes
- Folder renames, file renames, identifier migrations, org migrations *that are done*. Once shipped, `git log` answers "why is this named X?" The memory adds nothing actionable.
- Exception: when the historical change still imposes an ongoing constraint future code must honor — then the memory is about the constraint, not the change.

### C. Shipped naming or style decisions
- "We named the prefix X" / "we kept type Y suffixed" / "we use this enum case style." Once enforced by the type system, lint, or formatter, the decision is in the code. Future sessions read the code, not the memory.
- Keep only when the rule has *no* enforcer (no lint, no formatter, no compiler check) and the codebase actually depends on humans following it.

### D. One-time bug fixes whose fix is self-evident in the code now
- "Bug X used `dropFirst()`; we changed to `where index != firstIndex`." The fix is a 2-line diff, the code reads correctly today. A future regressor would not consult the memory; the existing code is the documentation.
- Keep only when the bug class is *recurring* (same pattern in multiple places, or a footgun future code might re-introduce) and the memory teaches the *avoidance pattern*, not the one fix.

### E. Generic engineering wisdom dressed up with one project example
- "Extract methods over condensing." "DRY via helpers." "Don't blindly apply review feedback." "Validate hardcoded lists against upstream." These are universal — they belong in a coding-style doc, not a project KB.
- Test: strip the project example. If what remains is a textbook tip you'd find in any "clean code" article, DROP.

### F. Research artifacts for deferred / dormant work
- Cross-platform audits, competitor analyses, tool surveys, "options considered for feature X (deferred)." Useful when the work resumes — but they belong in a planning doc or `docs/`, not the memory KB. The KB is for things that change *how a session would work on the active codebase today*.
- Keep only if the audit findings are referenced by *currently active* decisions.

### G. One-line preferences belonging in CLAUDE.md
- A single-sentence rule with no Context / Options / Consequences. If it fits in one line of CLAUDE.md and applies project-wide, that's where it goes. A standalone memory file is overhead.
- Test: would the memory's content be a single bullet under "Conventions" in CLAUDE.md? Then DROP and (if not already there) suggest moving it.

### H. Tiny / narrow learnings whose scope is fully covered by a sibling memory
- A 30-line learning that captures one facet of a 200-line learning next to it. Cross-reference and DROP the smaller one, or merge.

---

## Audit Workflow

> **Per-batch consent is mandatory.** Each batch is its own approval cycle: produce the verdict table, **stop**, wait for the user, apply their decisions, summarize, then — only after that — move on to the next batch. Never chain batches without an explicit go-ahead between them. See Step 3 for the hard-stop rules.

> **Stay at project root.** Do not `cd` into `.claude/memories/` (or any subdirectory) at any point during the audit. Codebase fact-checks (Grep/Glob/Bash) need cwd at the project root — running them from inside `.claude/memories/` resolves patterns against memory files instead of project source, silently passing fact-checks that should fail. Reference memory files by full path (e.g. `.claude/memories/<file>.md`).

> **Scope.** Default scope is every memory in `<project>/.claude/memories/`. The user may scope narrower: by category (`learning_*` only), by age (older than N months), or by `Applies to:` (only memories tagging this repo). Honor the requested scope; report the count covered vs. total.

### Step 1: Inventory

List all memory files in the project:

```
Glob(pattern: "<project>/.claude/memories/*.md")
```

If the directory is missing or empty, report the situation (specify whether it doesn't exist or is just empty) and exit — do not create the directory. If it has files, report the total count and a breakdown by category (learnings vs decisions vs non-standard naming).

### Step 2: Batch Assessment

**Fact-check first, verdict second.** Before producing the verdict table for a batch, run a single grep pass against the codebase for the central claims (symbol names, file paths, type names) referenced across the batch. Verdicts that rest on unverified claims are guesses dressed up as analysis. Specifically:
- Grep for every distinct symbol/type referenced in the batch — confirm presence, note renames or deletions.
- Spot-check any line numbers and historical line counts; flag stale ones for UPDATE.
- Watch for `Applies to:` typos (e.g. `mcs-2` when the project is `mcs`) — quick one-line fixes.

Read memories in batches (10-15 at a time) and produce a verdict table for each batch:

```
| # | File | Verdict | Rationale |
|---|------|---------|-----------|
| 1 | learning_background_task_watchdog.md | KEEP | Project-specific debugging discovery; future sessions act on the avoidance pattern (B.1) |
| 2 | learning_cli_tool_flags.md | DROP | Generic third-party CLI reference, no project anchor (A.1) |
| 3 | learning_auth_cache_bug.md | UPDATE | Problem section names an engineer — strip the identifier, keep the symptom (A.2) |
| 4 | decision_codestyle_tabs.md | DROP | Personal preference with no lint rule, formatter config, or team agreement (A.3) |
| 5 | decision_codestyle_naming.md | UPDATE | Convention still valid but example uses old API (C.4) |
```

**Verdict definitions:**

- **KEEP** — Memory is relevant, actionable, well-structured, and not duplicated. No changes needed.
- **DROP** — Memory is stale, duplicated, generic, or no longer applicable. Recommend deletion.
- **UPDATE** — Memory has value but needs fixes: rename to follow conventions, merge with another memory, refresh stale references, or improve structure.

For UPDATE verdicts, briefly describe what needs to change.

### Step 3: User Review — HARD STOP

**This is a blocking gate. After printing the verdict table, stop. Do not call any tool. Do not start the next batch. Do not run any `Edit`, `Write`, `Bash(rm)`, or `Bash(mv)`. Wait for the user's reply.**

The user must explicitly respond before you do anything else. Acceptable signals to proceed:
- Explicit approval ("approved," "go ahead," "looks good," "yes," "proceed").
- Per-item overrides ("keep #2, drop the rest," "change #3 to UPDATE").
- A request to see more (full content of a memory, fuller rationale) — answer it, then return to the stop.

Things that are **not** approval:
- Silence, a thumbs-up emoji alone, or a one-word "ok" without context — if ambiguous, ask.
- The model's own internal certainty that the batch looks fine.
- A previous batch's approval — approval is per-batch, never carried forward.
- A general "do an audit" instruction at the start of the session — that authorizes the audit, not any specific verdict.

If the user goes quiet after a batch, do not move on. End the turn. The user resumes when ready.

Respect every override without arguing — the user knows their workflow better than any heuristic. If you disagree with an override, note it once for the record and apply the override anyway.

### Step 4: Execute Approved Changes

Run only after Step 3 has produced an explicit approval (or per-item decisions) for *this* batch. Apply the user's decisions, not the originally proposed verdicts when they differ.

- **DROP**: Delete the file with `Bash(rm <path>)`
- **UPDATE (rename)**: Rename with `Bash(mv <old> <new>)`
- **UPDATE (content)**: Use `Edit` or `Write` to update the file
- **UPDATE (merge)**: Create the merged file, then delete the originals
- **UPDATE (uncertain)**: If the correct replacement isn't obvious (e.g., a referenced symbol was removed and the new equivalent is unclear), ask the user what the updated content should be rather than guessing.

Report what was done after each batch.

### Step 5: Summary

After all batches are processed, present a final summary:

```
## Audit Complete

- Total memories reviewed: 42
- KEEP: 28
- DROP: 8
- UPDATE: 6
  - Renamed: 3
  - Content updated: 2
  - Merged: 1

Knowledge base reduced from 42 → 34 files.
```

---

## Guidelines

- **Never delete or edit without explicit per-batch approval.** Print the verdict table, then stop. Do not run any tool until the user replies for *this* batch — silence is not consent, and approval of an earlier batch does not carry forward.
- **Explain the "why" clearly.** The user should understand the reasoning behind every DROP and UPDATE recommendation, not just see the label.
- **Apply criteria with teeth, not deference.** Past audits drifted into KEEP-by-default because each memory had *some* tie to the project. The forcing-function test (B.1) is the correction: KEEP requires identifying behavior the memory drives, not just absence of error. When the DROP categories above match, call DROP — don't soften it to UPDATE or stash in KEEP "to be safe."
- **In genuine doubt, prefer DROP with rationale over silent KEEP.** The user can always override. A KEEP that should have been DROP rarely gets revisited; a proposed DROP gets debated and resolved in seconds. **DROP is not a failure** — moving content to `CLAUDE.local.md`, to a planning doc, or simply deleting it because the code now documents itself is the audit doing its job.
- **Watch for the "but it's true and project-specific" trap.** That sentence is A.1 and C.4 passing — it says nothing about B.1. Two-pass thinking: first verify, then ask "does this change behavior?"
- **Batch size matters.** 10-15 per batch keeps the review manageable.
- **End-of-audit check for broken cross-links.** After DROPs land, grep `Related:` / `References:` lines for any pointer to a deleted filename and clean those up — broken refs accumulate silently otherwise.

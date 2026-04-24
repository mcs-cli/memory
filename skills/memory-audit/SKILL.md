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

Audit the knowledge base in `<project>/.claude/memories/` to keep it lean, relevant, and high-quality. `<project>` refers to the current working directory. When calling `search_docs`, the library name is the root directory name of the project.

Over time, memory files accumulate — some become stale, some duplicate each other, some capture generic knowledge that doesn't belong in a project-specific KB. This skill walks through every memory with the user, recommending **KEEP**, **DROP**, or **UPDATE** with clear rationale, and only acts on user-approved changes.

> **Rule alignment.** The audit uses the same three Capture Rules as the [continuous-learning skill](../continuous-learning/SKILL.md#capture-rules): tied to at least one project, anonymous, project-pattern-not-personal-preference. Existing memories that violate any of them are candidates for UPDATE or DROP — see criteria 1, 8, and 9 below.

> **`Applies to` field is informational.** Memories carry an `Applies to:` line declaring which project(s) they target. Use it as context, but audit only the memories in the current project's `.claude/memories/` — fact-check against this project only, and never DROP a memory solely because its `Applies to` lists other projects. If the KB is centralized across projects via a separate mechanism (e.g. a shared-memories techpack), that mechanism owns its own audit — this skill does not reach across repos.

> **This skill is user-initiated only.** Never run it automatically or as part of another workflow.

---

## Audit Criteria

Evaluate each memory against these dimensions:

### 1. Relevance
- Does this memory apply to the **current state** of the project?
- Has the underlying code, API, or framework changed since it was written?
- **Tied to at least one project vs. generic.** KEEP memories meaningfully tied to at least one project listed in `Applies to:` (single- or multi-project both count) — its codepaths, architecture, build/deploy setup, test strategy, tooling choices, team workflow, or recurring implementation patterns. DROP generic best practices, generic style advice, or broadly applicable how-to guidance that could fit almost any project with no real anchor to the repos in `Applies to:`.
- **Public docs vs. project knowledge vs. internal docs.** DROP memories that duplicate **public** documentation anyone could look up (language reference, public CLI/API docs, framework README). DROP memories whose content has no tie to any project in `Applies to:` — even if the memory describes a "non-obvious gotcha," if the root cause is generic and nothing in the content anchors it to a real codebase, config, or workflow, it belongs in the tool's docs, not here. **KEEP** summaries of **internal** docs (Confluence, ADRs, RFCs, wiki) — those sources aren't publicly lookupable, and a local summary makes them discoverable from a session. If an internal-doc summary lacks a `References:` link back to the source, flag for UPDATE (add the link) rather than DROP. Test: *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → DROP.

### 2. Actionability
- Can a future session **act on** this memory to avoid a mistake or follow a convention?
- Or is it purely descriptive/documentary with no clear "do this, not that" takeaway?

### 3. Naming Convention
- Learnings must follow `learning_<topic>_<specific>.md`
- Decisions must follow `decision_<domain>_<topic>.md` — see the domain prefixes table in the [continuous-learning skill](../continuous-learning/SKILL.md) for valid domains.
- Files that don't follow either pattern are likely older or ad-hoc — flag for rename or reclassification.

### 4. Duplication
- Does this memory overlap significantly with another memory?
- Could two or more memories be merged into one stronger entry?
- If overlap is partial and the memories are genuinely distinct (different root causes, different scopes, or different categories like a `learning_` warning next to a `decision_` that resolved it), recommend UPDATE to cross-link them via `Related:` instead of merging.
- Search the existing knowledge base or memory files for semantically similar content — two memories may use different names but cover the same ground.

### 5. Quality
- Does the memory follow the templates in [continuous-learning/references/templates.md](../continuous-learning/references/templates.md)? (Problem/Trigger/Solution/Verification/Example for learnings; Decision/Context/Options/Choice/Consequences for ADR decisions; Decision/Rationale/Examples for simplified decisions)
- Is the content specific enough to be useful but general enough to be reusable?
- Are code examples still accurate?

### 6. Fact-Checking
- **Verify key claims against the codebase.** If a memory says "we use pattern X in module Y", search the code to confirm that pattern still exists.
- Use `Grep` to check for symbol names, type names, or patterns referenced in the memory.
- Use `Glob` to verify that referenced files or modules still exist.
- If a memory describes a convention (e.g., "all repositories conform to protocol X"), spot-check a few cases to confirm it holds.
- Don't audit every single line — focus on the **central claim** of the memory. If the core assertion is wrong, recommend DROP or UPDATE.

### 7. Staleness Signals
- **Line number references** — e.g., `lines 266-296` or `FileName.swift:142`. These break after any edit. Recommend UPDATE to replace with symbol names.
- **Deep file paths** — full nested paths like `Sources/Features/Auth/Managers/Session/SessionManager.swift` are fragile. Recommend UPDATE to use module-level references unless the path is stable and well-known.
- **Transient details** — feature flag names being removed, in-progress PR numbers, temporary workarounds with known expiry.
- References to features/files that may have been removed or heavily refactored.
- **Broken `Related:` links** — an entry in the memory's `Related:` section that points at a memory filename no longer present (DROP'd or renamed during a previous audit). Recommend UPDATE to fix the link to its new name or remove the entry.
- Old dates without timeless content — treat as a signal for closer scrutiny, not an automatic DROP.

### 8. Personal Identifiers
- Does the memory name specific engineers, GitHub/Slack handles, or emails — anywhere (problem, example, footnote)?
- Does it narrate "who investigated whom" or "who fixed what"?
- **Verdict:** UPDATE to strip the identifier entirely (describe the artifact, not the actor) when the underlying knowledge is still useful; DROP when the identifier *is* the content and removing it leaves nothing.

### 9. Preference vs Pattern
- Is the memory a `decision_` backed by real evidence the pattern is the project's? Valid evidence: consistent use in the codebase, lint/formatter config, style guide / docs, or a team agreement (written *or* verbal — not every agreement is in a doc).
- Red-flag phrases inside the memory: *"I prefer,"* *"I like,"* *"my style."*
- Spot-check the repo — **codebase usage is the strongest single signal**. If the declared pattern is demonstrably present in existing code, the memory is a pattern even without a written rule. If the codebase is inconsistent and there's no config/doc/agreement, it's a preference.
- **Verdict:** DROP when no evidence exists anywhere — it's an individual preference, not a project decision. UPDATE when the pattern is real (visible in code, or the user confirms a team agreement) but the memory is phrased as personal taste; rewrite to point at the actual evidence.

---

## Audit Workflow

### Step 1: Inventory

List all memory files in the project:

```
Glob(pattern: "<project>/.claude/memories/*.md")
```

If the directory is missing or empty, report the situation (specify whether it doesn't exist or is just empty) and exit — do not create the directory. If it has files, report the total count and a breakdown by category (learnings vs decisions vs non-standard naming).

### Step 2: Batch Assessment

Read memories in batches (10-15 at a time) and produce a verdict table for each batch:

```
| # | File | Verdict | Rationale |
|---|------|---------|-----------|
| 1 | learning_background_task_watchdog.md | KEEP | Project-specific debugging discovery, still relevant |
| 2 | learning_cli_tool_flags.md | DROP | Generic third-party CLI reference, not tied to this project (criterion 1) |
| 3 | learning_auth_cache_bug.md | UPDATE | Problem section names an engineer by handle — strip the identifier, keep the symptom (criterion 8) |
| 4 | decision_codestyle_tabs.md | DROP | Stated as personal preference with no lint rule, formatter config, or team agreement behind it (criterion 9) |
| 5 | decision_codestyle_naming.md | UPDATE | Convention still valid but example uses old API |
```

**Verdict definitions:**

- **KEEP** — Memory is relevant, actionable, well-structured, and not duplicated. No changes needed.
- **DROP** — Memory is stale, duplicated, generic, or no longer applicable. Recommend deletion.
- **UPDATE** — Memory has value but needs fixes: rename to follow conventions, merge with another memory, refresh stale references, or improve structure.

For UPDATE verdicts, briefly describe what needs to change.

### Step 3: User Review

Present each batch and wait for the user's approval before proceeding. The user may:
- Agree with all verdicts
- Override specific verdicts (e.g., "keep #2, I still reference it")
- Ask for more detail on why a verdict was given
- Ask to see the full content of a memory before deciding

Respect every override — the user knows their workflow better than any heuristic.

### Step 4: Execute Approved Changes

After the user confirms a batch:

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

- **Never delete without explicit user approval.** Always present the verdict and wait.
- **Explain the "why" clearly.** The user should understand the reasoning behind every DROP and UPDATE recommendation, not just see the label.
- **Be conservative with DROP.** When in doubt between KEEP and DROP, lean toward KEEP. A slightly redundant memory is better than losing hard-won knowledge.
- **Batch size matters.** 10-15 per batch keeps the review manageable.

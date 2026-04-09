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

> **This skill is user-initiated only.** Never run it automatically or as part of another workflow.

---

## Audit Criteria

Evaluate each memory against these dimensions:

### 1. Relevance
- Does this memory apply to the **current state** of the project?
- Has the underlying code, API, or framework changed since it was written?
- Is this project-specific knowledge, or generic programming knowledge that any LLM already knows?

### 2. Actionability
- Can a future session **act on** this memory to avoid a mistake or follow a convention?
- Or is it purely descriptive/documentary with no clear "do this, not that" takeaway?

### 3. Naming Convention
- Learnings must follow `learning_<topic>_<specific>.md`
- Decisions must follow `decision_<domain>_<topic>.md`
- Files that don't follow either pattern are likely older or ad-hoc — flag for rename or reclassification.

### 4. Duplication
- Does this memory overlap significantly with another memory?
- Could two or more memories be merged into one stronger entry?
- Search the existing knowledge base or memory files for semantically similar content — two memories may use different names but cover the same ground.

### 5. Quality
- Does the memory use the structured template (Problem/Solution for learnings, Context/Decision/Rationale for decisions)?
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
- Old dates without timeless content — treat as a signal for closer scrutiny, not an automatic DROP.

---

## Audit Workflow

### Step 1: Inventory

List all memory files in the project:

```
Glob(pattern: "<project>/.claude/memories/*.md")
```

If the directory is missing or empty, report the situation (specify whether it doesn't exist or is just empty) and exit — do not create the directory. If it has files, report the total count and a breakdown by category (learnings vs decisions vs non-standard naming).

### Step 2: Batch Assessment

Read memories in batches (5-8 at a time) and produce a verdict table for each batch:

```
| # | File | Verdict | Rationale |
|---|------|---------|-----------|
| 1 | learning_background_task_watchdog.md | KEEP | Project-specific debugging discovery, still relevant |
| 2 | generic_git_workflow.md | DROP | Generic git knowledge, not project-specific |
| 3 | decision_codestyle_naming.md | UPDATE | Convention still valid but example uses old API |
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
- **Batch size matters.** 5-8 per batch keeps the review manageable.

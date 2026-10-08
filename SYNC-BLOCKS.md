# Sync Blocks (maintainer-only)

This file is **not loaded by any skill**. It is the canonical source for content that must remain verbatim-identical across `skills/continuous-learning/SKILL.md` and `skills/memory-audit/SKILL.md`.

When you edit one of the blocks below, update this file first, then copy the new text into every listed location. Run `npm run check:sync` for the non-empty assertion and three-way comparison; CI runs the same command.

> **Heads up for editors.** Anywhere outside the canonical fenced blocks below, refer to fences using the placeholder form (the text `SYNC` followed by a colon and `<tag>` in angle brackets, inside an HTML comment) — never with a real tag name like the three this file owns. The drift check grabs the first matching opener, so a literal real tag in prose would shadow the real block and make the canonical text invisible to the verifier.

The locked blocks are written in neutral voice — they describe what qualifies as a memory, not what to do with one. Each skill prepends/appends its own one-line framing **outside** the SYNC fences (capture says "do not save"; audit says "recommend DROP"). Do not move action verbs inside the locked block.

---

## Block 1: Capture Rules

Locations:
- `skills/continuous-learning/SKILL.md` — `## Capture Rules`
- `skills/memory-audit/SKILL.md` — `## Capture Rules`

```markdown
<!-- SYNC:capture-rules -->
Every memory must satisfy all three rules.

- **Tied to at least one project.** The content must be about the architecture, conventions, bugs, workflows, or tool interactions of at least one real project named in `Applies to:`. Multi-project entries are fine when the same convention genuinely holds across several repos, listed comma-separated. Out of scope: free-floating language, framework, or CLI knowledge with no project anchor — that belongs in the tool's own docs. Public documentation anyone could look up (language reference, framework README, public CLI docs, public API reference) is also out. Internal project docs (Confluence pages, ADRs, RFCs, team wiki) are different: a memory summarizing one *is* project knowledge, provided it links back to the source in `References:`. Test: *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → the memory does not qualify. Every claim must also change how a session works in a project whose sessions read this KB. Listing another project in `Applies to:` does not make its internals relevant: knowledge of another project's internals is cut down to the conclusion that changes work in the reading project. A claim about another project counts as checked only if the session read that project's code, or an internal doc cited in `References:`.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Identifiers age badly and add no signal even in a single-user KB.
- **Project pattern, not personal preference.** Memories must capture what the *project* does, not what an individual engineer likes. A pattern qualifies when any of these hold: it is enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — chat, meeting, or the user stating the agreement in the session), **or** already used consistently in the codebase. Codebase usage is the strongest evidence that a pattern exists, but code written in the same session is no evidence at all: the pattern needs a precedent from before the session, a lint rule or ADR, or a stated agreement. Usage alone does not make the pattern worth a memory, because the code already conveys it — unless new code could break it unnoticed. If the only support is *"I prefer,"* *"I like,"* *"my style,"* it is a preference and does not qualify.
  - **Bad patterns present in the code** are handled by category, not by exclusion. If one engineer flags a pattern as bad without team ratification, the appropriate shape is a `learning_` warning (e.g. `learning_dont_use_X_because_Y`) — **only** when it carries trigger (*"when you use X in case Y…"*), symptom (*"…it leaks / races / drops data"*), and avoidance (*"use Z instead"*). If the team has agreed the pattern is bad and should be avoided or replaced, the team agreement itself makes it a `decision_` (e.g. `decision_architecture_deprecate_X`). Pure *"this should be refactored someday"* observations without that shape belong in the issue tracker.
<!-- /SYNC -->
```

---

## Block 2: Strip-the-anchors test

Locations:
- `skills/continuous-learning/SKILL.md` — inside Step 4 (pre-save Check 1)
- `skills/memory-audit/SKILL.md` — inside criterion 1

```markdown
<!-- SYNC:strip-the-anchors -->
**Strip-the-anchors test.** Mentally delete every project-specific reference (paths, symbols, endpoints, business logic, ticket prefixes, instance IDs, custom-field IDs, internal CLI flags) from the memory's content. What is left is the *substance*. If the substance is a useful standalone document — generic tool, language, or framework knowledge that would help any reader anywhere — the project tie was decoration and the memory does not qualify as project knowledge. **Internal or proprietary tools are not exempt:** how a private CLI, MCP server, GUI, or company-internal tool *works in general* belongs in the tool's own docs or in `CLAUDE.local.md`. Project endpoints sprinkled inside a tool how-to do not make it project knowledge.
<!-- /SYNC -->
```

---

## Block 3: `Applies to:` semantics

Locations:
- `skills/continuous-learning/SKILL.md` — inside Step 4 (`### Applies to` subsection)
- `skills/memory-audit/SKILL.md` — inside the `Applies to:` callout near the top

```markdown
<!-- SYNC:applies-to -->
**The `Applies to:` field.** Place `**Applies to:**` on the line immediately after the `# Title` heading of every memory; it declares which project(s) the memory targets. Use the **git repo name** — the last path segment of `git remote get-url origin`, with `.git` stripped (e.g. `git@github.com:org/repo.git` → `repo`; `https://github.com/owner/my-app.git` → `my-app`). Fall back to the project directory's basename only when the repo has no remote configured or the project is not a git repo. Use the repo name — not the directory basename — because folder names vary across clones while the repo name is stable. This is also why `Applies to:` may differ from the set of memories the search index actually covers, which is folder-based and set automatically by the indexing hook.

When a memory genuinely applies to multiple projects, list them comma-separated (e.g. `**Applies to:** web-dashboard, ios-app, api-backend`); the content must stay true in every listed project. When a memory is only partially relevant to one listed project, split it into separate memories instead of mixing.
<!-- /SYNC -->
```

---

## Block 4: Shapes that do not qualify

Locations:
- `skills/continuous-learning/SKILL.md` — `## Do Not Save`
- `skills/memory-audit/SKILL.md` — `## DROP Categories`

Each row is a shape, an example, why it fails, and its exception, with no verdict. Capture's lead-in makes a match "not saved"; the audit's makes it DROP.

```markdown
<!-- SYNC:drop-shapes -->
| # | Shape | Example | Why it fails | Exception |
|---|-------|---------|--------------|-----------|
| D1 | Self-marked superseded, deferred, or abandoned | Says **SUPERSEDED**, *deferred indefinitely*, *closed without implementation*, or points at another memory as the current decision | The current memory carries the decision; a cross-link back from it is enough provenance. | A `Pending:` line marks work in flight, not deferral. |
| D2 | Record of a shipped one-time change | "Renamed folder `Install/` to `Sync/` after the command rename" | Once shipped, history answers it, and sessions read the current code, not the migration story. Without version control nothing else records the change, so judge it on behavior alone. | The change still imposes a constraint future code must honor; the memory is then about the constraint. |
| D3 | Naming or style decision an enforcer covers | "Kept the `External` prefix on adapter types" | The type system, lint, or formatter carries the decision. | The rule has no enforcer and the code depends on people following it. |
| D4 | One-time bug fix the code now shows | "The filter skipped the first element instead of the matching one; it now compares identity" | The code reads correctly today; a future regressor reads the code, not the KB. | The bug class recurs, or the memory names the tempting simplification and what it breaks, as trigger, symptom, and avoidance. |
| D5 | Description of what specific code does | "What the new `ReportPublisher` chain emits and in which order" | Merged, the code explains itself; written in the same session, it is no evidence (Rule 3). | A trap the code does not show, stated as trigger, symptom, and avoidance. |
| D6 | Generic engineering wisdom with a token project example | "Extract methods over condensing for lint compliance", one PR cited | Strip the example and a textbook tip remains (Rule 1). | — |
| D7 | Tool, language, or public API reference | "`git rebase -i` opens a todo list"; how an internal proxy's mock rules work, with project endpoints sprinkled in | Applies to any project using the tool (Rule 1); it belongs in the tool's docs or `CLAUDE.local.md`. | — |
| D8 | Fault in one engineer's environment | "Signed requests fail because this machine's clock drifts with NTP blocked" | Not project behavior, even with project anchors; it is that engineer's `CLAUDE.local.md` note. | — |
| D9 | Research for deferred or dormant work | "Options considered for feature X (deferred)" | It belongs in a planning doc; the KB is for how a session works on the active code today. | Findings a current decision depends on. |
| D10 | One-line rule | A single-sentence convention with no context or consequences | It fits one bullet in `CLAUDE.md`, where it belongs — suggest that bullet. A file is overhead for content that cannot grow. | — |
| D11 | Narrow learning covered by a sibling | A 30-line facet of the 200-line learning next to it | The sibling answers the same search. Any line the sibling lacks moves into it. | — |
<!-- /SYNC -->
```

---

## Drift verification (CI-ready)

```sh
npm run check:sync
```

The script enforces three things: every block exists in every source file (catches deleted or misspelled fences), the two skill files agree, and `SYNC-BLOCKS.md` itself agrees with them (catches "edited skills, forgot to update the maintainer reference"). The implementation is `scripts/check-sync-blocks.mts`; CI runs the same command.

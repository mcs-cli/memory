# Sync Blocks (maintainer-only)

This file is **not loaded by any skill**. It is the canonical source for content that must remain verbatim-identical across `skills/continuous-learning/SKILL.md` and `skills/memory-audit/SKILL.md`.

When you edit one of the blocks below, update this file first, then copy the new text into every listed location. The full drift-check script (with non-empty assertion and three-way comparison) is at the bottom of this file; CI runs the same logic.

> **Heads up for editors.** Anywhere outside the canonical fenced blocks below, refer to fences using the placeholder form (the text `SYNC` followed by a colon and `<tag>` in angle brackets, inside an HTML comment) — never with a real tag name like the three this file owns. The drift check's `awk` range grabs the first matching opener, so a literal real tag in prose would shadow the real block and make the canonical text invisible to the verifier.

The locked blocks are written in neutral voice — they describe what qualifies as a memory, not what to do with one. Each skill prepends/appends its own one-line framing **outside** the SYNC fences (capture says "do not save"; audit says "recommend DROP"). Do not move action verbs inside the locked block.

---

## Block 1: Capture Rules

Locations:
- `skills/continuous-learning/SKILL.md` — `## Capture Rules`
- `skills/memory-audit/SKILL.md` — `## Capture Rules`

```markdown
<!-- SYNC:capture-rules -->
Every memory must satisfy all three rules.

- **Tied to at least one project.** The content must be about the architecture, conventions, bugs, workflows, or tool interactions of at least one real project named in `Applies to:`. Multi-project entries are fine when the same convention genuinely holds across several repos, listed comma-separated. Out of scope: free-floating language, framework, or CLI knowledge with no project anchor — that belongs in the tool's own docs. Public documentation anyone could look up (language reference, framework README, public CLI docs, public API reference) is also out. Internal project docs (Confluence pages, ADRs, RFCs, team wiki) are different: a memory summarizing one *is* project knowledge, provided it links back to the source in `References:`. Test: *"Name the project(s) this applies to and why."* If the answer is "any project, it's just how the tool works" → the memory does not qualify.
- **Anonymous.** No personal names, GitHub/Slack handles, or emails anywhere in the memory — not in the problem description, not in examples, not in narration of "who did what." Describe the artifact (the bug, the pattern, the decision), not who touched it. Identifiers age badly and add no signal even in a single-user KB.
- **Project pattern, not personal preference.** Memories must capture what the *project* does, not what an individual engineer likes. A pattern qualifies when any of these hold: it is enforced by lint/formatter config, documented in a style guide or ADR, agreed by the team (written *or* verbal — chat, meeting, session-level consensus all count), **or** already used consistently in the codebase. Codebase usage is the strongest evidence. If the only support is *"I prefer,"* *"I like,"* *"my style,"* it is a preference and does not qualify.
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
**The `Applies to:` field.** Place `**Applies to:**` on the line immediately after the `# Title` heading of every memory; it declares which project(s) the memory targets. Use the **git repo name** — the last path segment of `git remote get-url origin`, with `.git` stripped (e.g. `git@github.com:org/repo.git` → `repo`; `https://github.com/owner/my-app.git` → `my-app`). Fall back to the working directory's basename only when the repo has no remote configured. Use the repo name — not the directory basename — because folder names vary across clones while the repo name is stable. This is also why `Applies to:` may differ from the set of memories the search index actually covers, which is folder-based and set automatically by the indexing hook.

When a memory genuinely applies to multiple projects, list them comma-separated (e.g. `**Applies to:** web-dashboard, ios-app, api-backend`); the content must stay true in every listed project. When a memory is only partially relevant to one listed project, split it into separate memories instead of mixing.
<!-- /SYNC -->
```

---

## Drift verification (CI-ready)

```sh
#!/usr/bin/env bash
set -uo pipefail
A=skills/continuous-learning/SKILL.md
B=skills/memory-audit/SKILL.md
C=SYNC-BLOCKS.md
overall=0
for tag in capture-rules strip-the-anchors applies-to; do
  echo "=== $tag ==="
  tag_fail=0
  for f in "$A" "$B" "$C"; do
    if [ -z "$(awk "/<!-- SYNC:${tag} -->/,/<!-- \\/SYNC -->/" "$f")" ]; then
      echo "MISSING: block '$tag' not found in $f"
      tag_fail=1
    fi
  done
  if [ "$tag_fail" -eq 0 ]; then
    for ref in "$B" "$C"; do
      if ! diff -u --label "$A" --label "$ref" \
          <(awk "/<!-- SYNC:${tag} -->/,/<!-- \\/SYNC -->/" "$A") \
          <(awk "/<!-- SYNC:${tag} -->/,/<!-- \\/SYNC -->/" "$ref"); then
        echo "DRIFT between $A and $ref for tag '$tag'"
        tag_fail=1
      fi
    done
  fi
  if [ "$tag_fail" -eq 0 ]; then
    echo "OK: identical across all three files"
  else
    overall=1
  fi
done
exit "$overall"
```

The script enforces three things: every block exists in every source file (catches deleted or misspelled fences), the two skill files agree, and `SYNC-BLOCKS.md` itself agrees with them (catches "edited skills, forgot to update the maintainer reference"). CI runs the same script.

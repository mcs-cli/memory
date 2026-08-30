# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An MCS **tech pack** — a manifest plus bash hooks, skills, and markdown templates that `mcs sync` copies into a user's `~/.claude` (global) or a project's `.claude`. There is no application, no build step, and no linter.

The consequence that matters most: **nothing here executes from the repo.** Editing `hooks/kb-gate.sh` changes no behavior until `mcs sync` reinstalls it. When debugging, be explicit about whether you are looking at this repo's copy or the installed one, which lands in `~/.claude/hooks/` and `~/.claude/skills/` for a global sync, or the project's `.claude/` for a scoped one.

## Commands

| Task | Command |
|---|---|
| Run the hook test suite | `bash tests/kb-gate-test.sh` |
| Verify the SYNC blocks agree | the snippet below (full version at the bottom of `SYNC-BLOCKS.md`) |
| Check the manifest parses | `/usr/bin/python3 -c "import yaml;yaml.safe_load(open('techpack.yaml'))"` — the system Python; Homebrew's has no PyYAML |
| Install a change locally | `mcs sync --global`, or `mcs sync` inside a project |
| Check installed health | `mcs doctor` |

```bash
for t in capture-rules strip-the-anchors applies-to; do
  x() { awk "/<!-- SYNC:$t -->/,/<!-- \/SYNC -->/" "$1"; }
  diff <(x skills/continuous-learning/SKILL.md) <(x skills/memory-audit/SKILL.md) >/dev/null \
    && diff <(x skills/continuous-learning/SKILL.md) <(x SYNC-BLOCKS.md) >/dev/null \
    && echo "OK   $t" || echo "DRIFT $t"
done
```

A tag pattern is safe to keep here: the drift check only scans the two `SKILL.md`s and `SYNC-BLOCKS.md`, so a mention in this file cannot shadow a real block.

**Run the suite twice when touching state handling** — CI does (`.github/workflows/kb-gate-test.yml`). The gate's barrier is scoped by a monotonic turn counter rather than wall-clock time, and a regression to timestamps shows up as the second run behaving differently from the first.

There is no single-test selector. The suite is one file of ~11 `group` blocks driven by crafted JSON; to isolate one, comment out the others.

Two harness details are load-bearing rather than incidental:

- It runs from a temp dir **outside any git repo**, because the hook resolves its project root with `git rev-parse --show-toplevel` first. Run from the checkout, the harness would write state into the working tree and read your real session files.
- The fixture project must contain `.claude/memories/`, or every `PreToolUse` call takes the `no_memories_dir` skip and nothing is gated. The denial count asserted at the end is what turns that into a loud failure instead of a green run that asserted nothing.

## Invariants that span files

**Placeholders are baked at sync time, not read at runtime.** `prompts:` in `techpack.yaml` declares `KB_GATE_MODE`; `hooks/kb-gate.sh` carries `MODE="__KB_GATE_MODE__"`, substituted during install. Changing the mode means re-running `mcs sync` — there is no runtime setting. The test suite injects modes the same way (`sed s/__KB_GATE_MODE__/$m/`).

**One dispatcher, four hook events.** `hooks/kb-gate.sh` is registered four times in `techpack.yaml` (UserPromptSubmit, PostToolUse, PreToolUse, SubagentStart) and branches on `hook_event_name`. Matchers are broad on purpose; which agent types count as "discovery" is decided in exactly one place, `GATED_AGENTS`. `hooks/sync-memories.sh` is likewise registered twice, on SessionStart and UserPromptSubmit.

**That dispatcher deliberately omits `set -e` and `set -u`**, unlike `sync-memories.sh` which uses `set -uo pipefail`. Its file header explains why and lists rules that are load-bearing: fail open, never `exit 2`, never call `qmd` (it loads an embedding model; far too slow for `PreToolUse`), log every evaluation. Read that header before editing it.

**Project-root derivation must match across two hooks and the manifest.** `sync-memories.sh`, `resolve_paths()` in `kb-gate.sh`, and the `memory-loop` MCP launcher in `techpack.yaml` all resolve git toplevel → `CLAUDE_PROJECT_DIR` → `$PWD`. The first two must agree on which project they are looking at; the launcher must additionally agree with `sync-memories.sh` on `.claude/.kb-index/`, because one writes the index the other opens. All three carry "keep in sync" comments. Non-git projects and launches from a subdirectory both go through the same ladder — do not "simplify" it to `$PWD`.

**The index is reached by `--index`, never by a project-local `.qmd/`.** Two reasons, and the second is the dangerous one. A user may keep their own `.qmd/` at the project root for their own code, which this pack must not touch. And a project-local `.qmd/index.yml` falls under qmd's trust gate, which covers a non-default `models.embed` — for a non-interactive caller the gate does not prompt or fail, it *skips*, silently substituting a much weaker default model. Named indexes are never gated. `QMD_CONFIG_DIR` and `INDEX_PATH` are what move a named index back under the project directory.

**Reranking and query expansion are disabled by pointing their model slots at the embedding model.** The MCP `query` tool hard-defaults `rerank: true` with no server-side way to turn it off, and a *missing* model is downloaded mid-query with no progress output. An embedding model has no ranking head, so qmd fails to build a ranking context, warns, and falls back to RRF — measured at MRR 0.792 against 0.800 for an explicit `rerank: false`, and it buys back zero R@5 versus a real reranker. Those numbers come from a 20-query fixture over this project's own memories, kept outside the repo — nothing here reproduces them, so treat them as recorded measurements rather than something CI re-checks. This depends on qmd's graceful-degradation path rather than a documented switch, which is why `@tobilu/qmd` is pinned to an exact version and why one doctor check issues a *default-argument* query: that check is what would catch the behaviour changing under an upgrade.

**The search call shape is stated in four places, deliberately.** "Typed `lex`+`vec` lines, `rerank: false`, `limit: 5`" appears in the index's `global_context` (written by `hooks/sync-memories.sh`, and the only text qmd injects into the model's system prompt), `templates/continuous-learning.md` (the only thing that reaches a user's `CLAUDE.md`), `skills/continuous-learning/SKILL.md`, and the `SubagentStart` briefing in `hooks/kb-gate.sh`. No single mechanism reaches all four consumers, so this is four copies rather than one source — change one and check the other three. It matters because the unguided path is measurably worse, not just slower.

**Three text blocks must stay byte-identical across three files.** `capture-rules`, `strip-the-anchors`, and `applies-to` appear in both `SKILL.md`s and in `SYNC-BLOCKS.md`, enforced by `.github/workflows/sync-blocks.yml`. Two rules when touching them:

- Blocks are verdict-neutral. Each skill adds its own verb *outside* the fence — capture says "skip", audit says "DROP". Never move an action verb inside the locked block.
- Never write a real tag name in prose. The drift check's `awk` range grabs the first matching opener, so a literal mention would shadow the canonical block and make it invisible to the verifier. `SYNC-BLOCKS.md` uses a placeholder form for exactly this reason.

**Templates are installed as marked sections inside someone's `CLAUDE.md`, not as files.** The `templates:` block in `techpack.yaml` maps `templates/continuous-learning.md` to a section fenced by `<!-- mcs:begin memory.continuous-learning -->`. On a global sync it lands in `~/.claude/CLAUDE.md`; on a project sync, in that project's `CLAUDE.local.md`. Edit the template here and re-sync, because editing inside the markers drifts and is overwritten. The template has no placeholders of its own; only `hooks/kb-gate.sh` carries one, `KB_GATE_MODE`.

**Installed artifacts are content-hash verified.** `mcs doctor` compares hashes of installed files, so hand-editing an installed copy registers as drift and the next `mcs sync` restores the packaged version. This is why a skill can never write to its own files: anything saved that way is destroyed on the next sync.

**`ignore:` suppresses update notifications, it does not control what ships.** Listing `CLAUDE.md`, `SYNC-BLOCKS.md`, or `tests/` there means a change to them won't prompt users to update; what actually gets installed is decided by what `components:` references. New maintainer-only files belong in the list. Note that `mcs pack validate` rejects any entry naming `techpack.yaml` or a manifest-referenced path, and a manifest change always notifies regardless.

## Editing the skills

`skills/continuous-learning` (capture) and `skills/memory-audit` (audit) encode the same rules at two different times: capture decides whether to write a memory, audit decides whether to keep one.

**Capture is `isRequired: true`; audit is optional.** Capture must therefore stand alone and can never reference the audit skill's content.

**Examples must be language-neutral.** The pack installs into projects of any stack, and Swift-specific examples have slipped in more than once. `references/templates.md` is the deliberate exception, since a filled-in example has to be concrete in some language.

**The bar for adding anything: does leaving it alone make the skill misbehave?** These files accrete easily, and a past round of additions was reverted almost entirely for failing that test. Prefer fixing a defect over adding a mechanism, and a clause on an existing sentence over a new section.

**Check what contradiction a change creates.** Both skills carry emphatic guidance that can overrule a softer new instruction. The audit's "in genuine doubt, prefer DROP" is the clearest example: a new rule saying "report this rather than dropping it" loses unless that guideline is carved out explicitly. After editing, read the new text alongside the sections that push the opposite way.

Six DROP categories are duplicated between the two skills with nothing keeping them in step. Change one side, check the other.

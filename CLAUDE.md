# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An MCS **tech pack** — a manifest plus hooks, skills, and markdown templates that `mcs sync` copies into a user's `~/.claude` (global) or a project's `.claude`. There is no application, no build step, and no linter.

The consequence that matters most: **nothing here executes from the repo.** Editing `hooks/kb-gate.mts` changes no behavior until `mcs sync` reinstalls it. When debugging, be explicit about whether you are looking at this repo's copy or the installed one, which lands in `~/.claude/hooks/` and `~/.claude/skills/` for a global sync, or the project's `.claude/` for a scoped one.

## Commands

| Task | Command |
|---|---|
| Install development dependencies | `npm ci` |
| Typecheck | `npm run typecheck` |
| Run the tests | `npm test` (stubs qmd; no model needed) |
| Run only the KB gate suite | `node --experimental-strip-types --disable-warning=ExperimentalWarning --test tests/kb-gate.test.mts` |
| Verify the SYNC blocks agree | `npm run check:sync` |
| Check the manifest | `mcs pack validate` — validates structure and component references, not just YAML syntax. A raw parse needs a Python that has PyYAML, which is not guaranteed to be `/usr/bin/python3` |
| Install a change locally | `mcs sync --global`, or `mcs sync` inside a project |
| Check installed health | `mcs doctor` |

**Run the suite twice when touching state handling** — CI does (`.github/workflows/ci.yml`). The gate's barrier is scoped by a monotonic turn counter rather than wall-clock time.

Node 22.6+ runs `.mts` files directly with `--experimental-strip-types --disable-warning=ExperimentalWarning`. `.mts` keeps the module format independent of the target project's `package.json`. Development dependencies are only for typechecking; hooks import Node built-ins and `hooks/shared.mts`. MCS installs that library as `hooks/memory/shared.mts` beside the entry points. `hooks/memory-loop-activator.sh` stays in shell because it only prints a static reminder on every prompt; its output is covered by the same contract fixtures.

Two harness details are load-bearing rather than incidental:

- It runs from a temp dir **outside any git repo**, because the hook resolves its project root with `git rev-parse --show-toplevel` first. Run from the checkout, the harness would write state into the working tree and read your real session files.
- The fixture project must contain `.claude/memories/`, or every `PreToolUse` call takes the `no_memories_dir` skip and nothing is gated. Explicit denial assertions make that a loud failure instead of a green run that asserted nothing.

`tests/sync-memories.test.mts` shares the outside-a-git-repo rule and stubs `qmd` on `PATH`, so it needs no model. Its own trap: a first run reindexes under any version of the hook, because the config file does not exist yet. The assertions that mean anything are the **second** runs, and they only discriminate because the stub creates `$INDEX_PATH` — a staleness gate guarded on that file falls through without it.

## Invariants that span files

**Placeholders are baked at sync time, not read at runtime.** `prompts:` in `techpack.yaml` declares `KB_GATE_MODE`; `hooks/kb-gate.mts` carries `const MODE: string = "__KB_GATE_MODE__"`, substituted during install. Changing the mode means re-running `mcs sync` — there is no runtime setting. The test suite injects modes the same way (string replacement in the temporary installed copy).

**One dispatcher, four hook events.** `hooks/kb-gate.mts` is registered four times in `techpack.yaml` (UserPromptSubmit, PostToolUse, PreToolUse, SubagentStart) and branches on `hook_event_name`. Matchers are broad on purpose; which agent types count as "discovery" is decided in exactly one place, `GATED_AGENTS`. `hooks/sync-memories.mts` is likewise registered twice, on SessionStart and UserPromptSubmit.

**Both hooks fail open.** Unexpected filesystem or payload errors exit 0 without output. The gate never exits 2, never calls qmd, and logs every evaluation except when disabled or when an uninteresting sub-agent starts. Preserve the append-only query and denial files, monotonic turn counter, and separate per-state/per-turn denial budgets. Gate state is compatible with previous shell installs.

**Project-root derivation must agree everywhere.** `hooks/shared.mts` resolves git toplevel → `CLAUDE_PROJECT_DIR` → `$PWD` for the hooks. The small shell launchers and doctor checks in `techpack.yaml` retain the same ladder. Keep those shell copies identical to one another and behaviorally equivalent to the TypeScript helper. All readers and writers use `.claude/.kb-index/`. Tests exercise git subdirectories, non-git fallbacks, and paths needing YAML escaping.

**Indexing is unconditional and incremental.** qmd handles added, edited, deleted, and symlinked memories. Do not add a separate staleness check. The config stores the literal memories path, repairs drift, and is written even before the first memory exists. The directory lock protects update/embed/status/cleanup, and stale empty locks are reclaimed using the previous `find -mmin +5` age rule.

**The indexing hook and a doctor check are coupled through a file.** `sync-memories.mts` writes `.claude/.kb-index/memory-loop.log` when a run fails or leaves documents unembedded, and deletes it on success; the "Memory indexing completed" check reports the file's existence. Move or rename it on one side and the check passes forever without testing anything.

**The index is reached by `--index`, never by a project-local `.qmd/`.** Two reasons, and the second is the dangerous one. A user may keep their own `.qmd/` at the project root for their own code, which this pack must not touch. And a project-local `.qmd/index.yml` falls under qmd's trust gate, which covers a non-default `models.embed` — for a non-interactive caller the gate does not prompt or fail, it *skips*, silently substituting a much weaker default model. Named indexes are never gated. `QMD_CONFIG_DIR` and `INDEX_PATH` are what move a named index back under the project directory.

**Reranking and query expansion are disabled by pointing their model slots at the embedding model.** The MCP `query` tool hard-defaults `rerank: true` with no server-side way to turn it off, and a *missing* model is downloaded mid-query with no progress output. An embedding model has no ranking head, so qmd fails to build a ranking context, warns, and falls back to RRF — measured at MRR 0.792 against 0.800 for an explicit `rerank: false`, and it buys back zero R@5 versus a real reranker. Those numbers come from a 20-query fixture over this project's own memories, kept outside the repo — nothing here reproduces them, so treat them as recorded measurements rather than something CI re-checks. The fallback is not a *strict* no-op: on a later fixture, a document RRF ranked 9th was dropped entirely when `rerank: true` was passed. Top ranks were unaffected, which is why this is a safe structural disable, but do not describe it as "reranking is off and nothing changes".

To measure any of this, `qmd bench <fixture.json> -c memories` is usable as shipped. Its fixture `query` field accepts the structured multi-line form (`intent:`/`lex:`/`vec:`), and a fixture written that way is passed through **unexpanded** — only a bare query string goes down the expansion path. So its `hybrid` row measures the pack's real configuration, not a degraded one. This depends on qmd's graceful-degradation path rather than a documented switch, which is why `@tobilu/qmd` is pinned to an exact version and why one doctor check issues a *default-argument* query: that check is what would catch the behaviour changing under an upgrade.

**The search call shape is stated in three places, deliberately.** "Typed `lex`+`vec` lines, `rerank: false`, `limit: 6`" appears in `templates/continuous-learning.md` (the only thing that reaches a user's `CLAUDE.md`), `skills/continuous-learning/SKILL.md`, and the `SubagentStart` briefing in `hooks/kb-gate.mts`. No single mechanism reaches all three consumers, so this is three copies rather than one source — change one and check the other two. It matters because the unguided path is measurably worse, not just slower.

**The index's `global_context` is deliberately not a fourth copy.** qmd serves that one string two ways: as the MCP server's `instructions`, once per connection, and as the `context` field of *every* search result. Guidance placed there is therefore paid for per result — at 342 characters it was 38% of a six-result response — while the only consumer it uniquely reaches is a client with no installed `CLAUDE.md` section, which cannot happen because the template is `isRequired`. So it carries identity only ("this is a project memory KB, not external documentation") and the guidance lives in the three copies that are not echoed. Resist putting the call shape back into it.

**The same three copies carry "retrieve before relying on a result", and the reason is only recorded here.** qmd's MCP snippet is at most five lines and 300 characters (`extractSnippet` in `store.js`, called with a hardcoded `300` from `mcp/server.js`), and it is anchored by literal substring matching of the first `lex` sub-query. When those terms are not in the matched text it falls back to the top of the chunk — in practice the file's first three lines, which for a memory is its title and `Applies to:`. Measured on a 527-document corpus, 28% of results came back title-only. So a search result is a lead, and answering from it is guessing; `get`/`multi_get` is the step that makes the answer real. The instruction is phrased as an absolute in all three copies on purpose — stating the failure condition invites the reader to decide a snippet looks complete this time. Do not "simplify" it back into step 2's old wording (`Read matching memories`), which worked only because the previous backend returned a whole chunk.

**Three text blocks must stay byte-identical across three files.** `capture-rules`, `strip-the-anchors`, and `applies-to` appear in both `SKILL.md`s and in `SYNC-BLOCKS.md`, enforced by `scripts/check-sync-blocks.mts` in CI. Two rules when touching them:

- Blocks are verdict-neutral. Each skill adds its own verb *outside* the fence — capture says "skip", audit says "DROP". Never move an action verb inside the locked block.
- Never write a real tag name in prose. The drift check grabs the first matching opener, so a literal mention would shadow the canonical block and make it invisible to the verifier. `SYNC-BLOCKS.md` uses a placeholder form for exactly this reason.

**Templates are installed as marked sections inside someone's `CLAUDE.md`, not as files.** The `templates:` block in `techpack.yaml` maps `templates/continuous-learning.md` to a section fenced by `<!-- mcs:begin memory.continuous-learning -->`. On a global sync it lands in `~/.claude/CLAUDE.md`; on a project sync, in that project's `CLAUDE.local.md`. Edit the template here and re-sync, because editing inside the markers drifts and is overwritten. The template has no placeholders of its own; only `hooks/kb-gate.mts` carries one, `KB_GATE_MODE`.

**Installed artifacts are content-hash verified.** `mcs doctor` compares hashes of installed files, so hand-editing an installed copy registers as drift and the next `mcs sync` restores the packaged version. This is why a skill can never write to its own files: anything saved that way is destroyed on the next sync.

**`ignore:` suppresses update notifications, it does not control what ships.** Listing `CLAUDE.md`, `SYNC-BLOCKS.md`, or `tests/` there means a change to them won't prompt users to update; what actually gets installed is decided by what `components:` references. New maintainer-only files belong in the list. Note that `mcs pack validate` rejects any entry naming `techpack.yaml` or a manifest-referenced path, and a manifest change always notifies regardless.

## Editing the skills

`skills/continuous-learning` (capture) and `skills/memory-audit` (audit) encode the same rules at two different times: capture decides whether to write a memory, audit decides whether to keep one.

**Capture is `isRequired: true`; audit is optional.** Capture must therefore stand alone and can never reference the audit skill's content.

**Examples must be language-neutral.** The pack installs into projects of any stack, and Swift-specific examples have slipped in more than once. `references/templates.md` is the deliberate exception, since a filled-in example has to be concrete in some language.

**The bar for adding anything: does leaving it alone make the skill misbehave?** These files accrete easily, and a past round of additions was reverted almost entirely for failing that test. Prefer fixing a defect over adding a mechanism, and a clause on an existing sentence over a new section.

**Check what contradiction a change creates.** Both skills carry emphatic guidance that can overrule a softer new instruction. The audit's "in genuine doubt, prefer DROP" is the clearest example: a new rule saying "report this rather than dropping it" loses unless that guideline is carved out explicitly. After editing, read the new text alongside the sections that push the opposite way.

Six DROP categories are duplicated between the two skills with nothing keeping them in step. Change one side, check the other.

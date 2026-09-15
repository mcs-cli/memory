# Verification

## Automated checks

- `npm test`: validation and failed replacement, single-use tickets, turn/session/project isolation, every root spawn, nested exemption, child search accounting, all modes, 4/8-denial budgets, concurrent spawn accounting, corrupt-state fail-open, compaction instructions, setup-owned cleanup, scoped approval settings, standalone bundle execution, shared policies and unchanged MCS MCP launcher.
- `bash tests/kb-gate-test.sh`: original Claude gate behavior.
- `bash tests/sync-memories-test.sh`, repeated with `MEMORY_LOOP_HOST=codex`: both adapters exercise the same source, including failure diagnostics and overlapping configuration writers.
- `node tests/qmd-smoke.mjs`: actual qmd 2.8.3 lexical/semantic search, full-document retrieval, symlinked collections, apostrophes in paths, nested cwd, separate indexes, concurrent incremental indexing, and isolation from a user-owned `.qmd/`.
- `node tests/codex-install.mjs`: native local-marketplace installation, cache-path update diagnosis, setup rebinding, remembered choices, and cleanup ownership across updates. No authenticated model calls.
- `node tests/codex-live.mjs --skills`: installs only a copied standalone plugin through an isolated marketplace and Codex home; runs setup, real hooks/MCP, two sibling agents and a grandchild, doctor, preference exclusion, audit approval boundaries, and cleanup. Requires authenticated CLI access and the downloaded model. Uses the native trust-bypass flag **only in this isolated test**; setup never bypasses user trust.

Live support is limited to the macOS CLI version tested. Desktop remains provisional.

## Defect reproductions

### Configuration publication race

The old indexer writes to one `memory-loop.yml.new` before acquiring the indexing lock. Two async hooks can both finish writing that file; the first renames it, leaving the second comparing/renaming a nonexistent file. It may also expose partially overwritten content.

The regression fixture synchronizes concurrent writers at `cmp` and checks each source exists. The fix uses a separate `mktemp` file for every writer, followed by atomic rename. Both MCS and Codex execute this exact implementation.

### False healthy status

The old `qmd status | sed | head` pipeline interprets absent output as `pending=0`, even when status failed. It deletes the indexing log and runs cleanup. The fixture covers nonzero status, empty output and unknown output. All must retain diagnostics and skip cleanup. The fix requires successful status and qmd's recognized Total summary before interpreting an absent Pending line as zero.

### macOS apostrophe escaping

The previous Bash parameter substitution emits backslashes in a single-quoted YAML path on macOS Bash. A project named `project's #1` reproduces the parse failure. The shared script now doubles single quotes using `sed`; the live qmd fixture covers this path for both integrations.

## Capture/audit scenario review

These scenarios exercise the approved policy and are also useful for live skill evaluation. No real user memories should be modified during an evaluation; use an isolated fixture.

| Scenario | Expected action |
| --- | --- |
| “I prefer tabs” with no project evidence | Skip capture; personal preference is excluded. |
| Lint config enforces tabs and existing project code follows it | A project convention may qualify; check duplication before saving. |
| Debugging finds an invoice snapshot race with a reproduced trigger, symptom and tested mutex fix | Save an anonymous project learning using the learning template, after searching and reading existing candidates. |
| Existing memory already explains the same race | Skip; extend that memory only if new evidence materially refines it. |
| Public Node documentation explains an option | Skip; generic public documentation is not a project memory. |
| Private proxy CLI usage with project endpoints used only as examples | Offer a draft for local instructions, without editing those instructions or saving a memory. |
| Audit identifies one duplicate and one stale symbol | Verify claims against code, produce DROP/UPDATE verdicts, then stop. No filesystem mutation before this batch's approval. |
| User approves batch one, then says nothing about batch two | Apply batch one only. Batch two needs its own approval. |
| Audit target is missing or empty | Report which condition holds; do not create the collection. |

Preserved boundaries: autonomous capture through the skill; no personal preferences; deduplication before save; full retrieval before relying on snippets; user-invoked audits with per-batch approval. Shared skill policy checks compare the original three policy blocks, not generated host-specific variants.

## Recorded run

Verified on macOS with Node 26.8.2, qmd 2.8.3, and Codex CLI 0.154.0. CI checks Node 22 on macOS and Linux; live desktop behavior is not verified. The original indexer fails seven of the new regression assertions (status failure/empty/unknown handling and concurrent publication), while the corrected shared source passes. `mcs pack validate` resolves the moved component sources with zero issues; its maintainer-file warnings do not justify excluding the shared plugin directory from update detection.

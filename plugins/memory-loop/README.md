# Memory Loop for Codex

Persistent project knowledge, shared with the MCS/Claude integration. Memories stay in `.claude/memories/`, including symlinked collections. Codex keeps its index and gate state in `.codex/.memory-loop/`.

## Install and set up

Requires macOS, Codex CLI with hooks (validated with 0.154.0), Node ≥22, jq, and global qmd **2.8.3**. Setup can install Node/jq/qmd through Homebrew/npm and download the shared Qwen3 embedding model (~610 MB). No `gh`, Python, TypeScript runner, MCS, or npm install inside this bundle is required. Normal hooks never install software or download models deliberately.

```sh
codex plugin marketplace add mcs-cli/memory
codex plugin add memory-loop@memory-loop
```

### Install from a local checkout

No publishing or Git push is needed. The compiled runtime is already in the bundle:

```sh
codex plugin marketplace add /absolute/path/to/mcs-memory
codex plugin add memory-loop@memory-loop
"${CODEX_HOME:-$HOME/.codex}/plugins/cache/memory-loop/memory-loop/0.1.0/scripts/memory-loop" setup --install-deps
```

Use the installed path printed by `plugin add` if it differs. This installs a cached copy. After local edits, rebuild with `npm run build`, refresh/reinstall the local plugin, rerun setup if its cache path changed, and start a new session. Review changed hooks in `/hooks`.

In a new Codex session, invoke **memory-loop-setup** for guided setup. Alternatively, run the bundled command from the installed plugin directory (the install command reports that path):

```sh
./scripts/memory-loop setup --install-deps
```

Setup defaults to global activation and `enforce`. It asks whether to disable Codex built-in memory and whether to approve automatic `prepare_brief` calls. Answers are remembered; neither setting is changed without an affirmative answer. Only the helper tool's approval setting changes. Script equivalents:

```sh
./scripts/memory-loop setup --install-deps --disable-builtin-memory no --auto-prepare yes
./scripts/memory-loop setup --scope project --disable-builtin-memory no --auto-prepare no
```

Project-only setup disables global activation of this plugin and enables it in the project's trusted `.codex/config.toml`. A global installation can opt out of one project:

```sh
./scripts/memory-loop configure --scope project --enabled no
./scripts/memory-loop configure --scope project --enabled yes
```

**Native hook trust:** start a new Codex session, open `/hooks`, and review/trust the Memory Loop hooks. Installing the plugin does not trust its hooks. Project configuration also needs Codex's project trust. Setup never edits hook-trust hashes. See [Codex hooks](https://learn.chatgpt.com/docs/hooks).

The repository marketplace is named `memory-loop`. For a copy distributed under a different catalog name, pass `--plugin-id memory-loop@YOUR_MARKETPLACE` to setup/configuration/doctor/cleanup.

## Configuration

```sh
./scripts/memory-loop configure --mode warn                 # saved global default
./scripts/memory-loop configure --scope project --mode off  # personal override
./scripts/memory-loop doctor
```

No reinstall is needed. Global settings live in `$CODEX_HOME/memory-loop/settings.json` (default `~/.codex`). Personal project overrides live in `.codex/memory-loop.local.json`; setup and first activation in each project add local git exclusions. Explicit `--project /path/to/repo` works from another directory. Re-running setup preserves a saved mode and previously answered questions; explicit yes/no flags update those choices.

| Mode | Root spawn missing prerequisites | Child startup |
| --- | --- | --- |
| `enforce` | Deny, with escape after 4 denials without another search or 8 in the turn | Shared brief, or KB reminder |
| `warn` | Explain missing prerequisites; allow | Shared brief, or KB reminder |
| `observe` | Log and allow silently | Shared brief, or KB reminder |
| `off` | No gate | No automatic brief or reminder |

The ordinary prompt reminder and capture protocol remain active in `off`. Missing collections skip gating; an existing empty collection can be searched and briefed as `none relevant`. Gate errors fail open. A failed preparation reports an error and leaves no usable replacement.

## Shared briefs and delegation

Before root-level delegation each user turn:

1. Search with `query`, pairing `lex` keywords and a `vec` question, plus `intent`, `rerank:false`, `limit:6`.
2. Read full relevant documents with `get` or `multi_get`. Snippets are leads, not evidence.
3. Call `prepare_brief(brief)` with **1–5 one-line bullets**, or **`none relevant`**, at most **4,000 characters**. Oversized input is rejected, never truncated.
4. Wait for preparation to succeed, then spawn the batch. Wait for all children and descendants to finish before replacing the brief for another batch.

Every root spawn is checked. Nested spawns are exempt. Searches made by subagents count toward the root's active user turn, as they do in Claude. Further retrieval does not invalidate a prepared brief. A new user turn does.

**Limitation:** this is parent-curated shared project context. It does not inspect the outgoing prompt, verify that findings fit each task, or associate a batch with particular child startups. Children and grandchildren receive the active root brief. Sequential batches are a workflow rule. The parent must not replace a brief while an earlier batch still needs it.

The local helper has one public tool, `prepare_brief(brief)`. A trusted `PreToolUse` hook invalidates the old readiness marker and replaces the input with a random, single-use preparation ticket. The helper consumes the ticket's hook-supplied project/session/turn, persists the brief atomically, then acknowledges readiness. Model-supplied paths and session IDs are rejected. This is coordination within a trusted local plugin, not a security boundary against processes running as your OS user.

## Capture and audit

The capture and audit skills are the exact sources MCS installs. Capture automatically deduplicates and checks project relevance, anonymity, and evidence. Personal preferences and generic public documentation do not qualify. Environment/tool configuration becomes a suggested draft for host-local instructions; the skill does not edit those instructions automatically.

Audits run only when requested. Each batch produces reviewable verdicts and waits for explicit approval before edits or deletion. The Claude permission metadata remains in the shared files; Codex uses its native tools and approval rules.

## Diagnosis and cleanup

Doctor checks runtime versions, shared model availability, model configuration, indexing failure logs, qmd status, semantic retrieval and full-document retrieval when documents exist, installed plugin visibility, and observed startup/turn hook activity for the currently bound bundle and hook definition in the last 24 hours. It reports no retrieval evidence for empty collections. Hook observation proves those hooks ran; a spawn/delivery count of zero means delegation has not been exercised. It cannot claim unseen hook paths work.

```sh
./scripts/memory-loop cleanup                         # restore owned global settings
./scripts/memory-loop cleanup --scope project         # restore owned project settings
./scripts/memory-loop cleanup --purge-state           # also delete THIS project's Codex index/logs/gate state
codex plugin remove memory-loop@memory-loop              # native bundle uninstall
```

Cleanup restores only values still equal to setup's recorded writes. Later user changes remain. The native plugin installer owns its own activation entry; uninstall through Codex after cleanup. Memories, global dependencies, and the shared model are always preserved. Project state is retained by default; use `--project` to target another project's state explicitly. Cleanup does not remove someone else's hook trust or shared catalog.

## Updates and support

Update the marketplace through `codex plugin marketplace upgrade memory-loop`, then reinstall/update the plugin with your CLI's plugin commands and start a new session. Review any changed hooks in `/hooks`. See [plugin packaging and configuration](https://developers.openai.com/plugins/build/plugins).

Run setup again after changes to dependencies, model pins, setup-owned config keys, or plugin/server identity. Ordinary skill/instruction/runtime updates are included in the bundle; reconfiguration alone needs no reinstall. Setup compares values and preserves the original ownership baseline across repeated runs. Conservative config editing refuses nested inline TOML tables it cannot safely change; expand the affected table before rerunning.

Setup records the installed bundle path in `$CODEX_HOME/memory-loop/runtime.json` because legacy Codex MCP declarations do not expand plugin-root placeholders. **Rerun setup after an update changes the installed cache path**, before removing the old version. Both MCP launchers read that binding and inherit the session working directory; the qmd launcher publishes its named-index configuration before starting the server. `CODEX_HOME` and `XDG_CACHE_HOME` are explicitly forwarded to the MCP processes.

**macOS CLI is the verified target. Desktop support is provisional** until the same installation, hook trust, nested delegation and lifecycle tests pass in a live desktop session.

## Maintainers

TypeScript lives in the repository's `src/codex/`. `npm ci && npm run build` type-checks and bundles it into `runtime/codex.cjs`; no build dependencies ship in the plugin. The bundle includes the TOML parser and lock implementation with licenses in `THIRD_PARTY_NOTICES`.

The indexing shell script is shared with MCS. MCS installs it at its unchanged destination and invokes its Claude default. Codex selects its own state directory with `MEMORY_LOOP_HOST=codex` and calls `--configure-only` before qmd MCP startup. The MCS launcher is unchanged.

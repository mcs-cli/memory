---
name: memory-loop-setup
description: Set up, diagnose, configure, or clean up the Memory Loop Codex plugin. Use for initial activation, gate modes, project opt-out, dependency/model setup, and conservative uninstall preparation.
---

# Memory Loop setup

Read [the bundled guide](../../README.md). Resolve the installed plugin root from this skill's location; use only its `scripts/memory-loop` command. Never reach into an MCS checkout or sibling repository files.

1. Explain global activation (recommended), or project-only activation if requested. Default the gate to `enforce` unless a saved choice or the user says otherwise. Run `scripts/memory-loop --help` and inspect the current setup/doctor output before changing an existing installation.
2. Ask once whether to disable Codex built-in memory and whether to permit automatic `prepare_brief` calls. If `$CODEX_HOME/memory-loop/choices.json` already records an answer, reuse it unless the user explicitly changes it. A yes changes only the relevant memory flag or helper tool approval key; never broaden approvals for other tools. Do not treat silence as consent.
3. Run `scripts/memory-loop setup --install-deps --disable-builtin-memory yes|no --auto-prepare yes|no`, adding `--scope project` when chosen. This explicit setup checks/installs dependencies and downloads the shared model. Existing dependencies/model are reused. If the user only requested diagnosis, run `doctor` instead.
4. Explain the native trust step: start a new Codex session and review Memory Loop in `/hooks`; project-only config also requires project trust. Never bypass trust on the user's behalf or write trust hashes.
5. Run doctor after activation. Report missing observable hook evidence honestly; a successful file installation alone does not prove hooks ran. Desktop support is provisional.

For mode changes, use `configure --mode enforce|warn|observe|off`, optionally `--scope project`. For project opt-out use `configure --scope project --enabled no`. No reinstall is needed.

For cleanup use `cleanup` at the requested scope, then the native Codex plugin removal command. Preserve memories, dependencies and the model. Only add `--purge-state` if the user explicitly requests removal of that project's Codex indexes/logs. Cleanup restores only still-owned values; report any preserved user edits or restoration failures.

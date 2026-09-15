#!/bin/bash

# Hook: index .claude/memories/ into this project's search index.
# Runs on SessionStart and UserPromptSubmit (async). Never fails the hook.
#
# Reindexes unconditionally; do not add a staleness check. A `find -newer` gate
# was removed because `find` does not descend a symlinked root, and
# .claude/memories is a symlink whenever the shared-memories pack is installed:
# it saw zero files, so the index froze for days with no failure log. Cost of
# dropping it, on a 527-document index: update 0.185s, embed 0.105s, status
# 0.134s, against 0.056s saved. `qmd update` resolves the collection path itself,
# so a directory and a symlink behave the same.

set -uo pipefail

# Consume stdin (hook passes JSON context)
cat >/dev/null 2>&1 || true

# Resolve the project root. Prefer the git repo toplevel — it's the stable
# anchor so launching from any subdirectory of a repo maps to the same index.
# In a non-git folder git exits non-zero (empty output); fall back to where
# Claude was launched (CLAUDE_PROJECT_DIR, else $PWD).
#
# keep in sync with the memory-loop MCP launcher in techpack.yaml — that command
# opens the index this hook writes, so both have to agree on where it lives.
project_root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$project_root" ] || project_root="${CLAUDE_PROJECT_DIR:-$PWD}"

MEMORIES_DIR="$project_root/.claude/memories"
INDEX_DIR="$project_root/.claude/.kb-index"
if [ "${MEMORY_LOOP_HOST:-claude}" = codex ]; then
    INDEX_DIR="$project_root/.codex/.memory-loop/index"
fi
CONFIG="$INDEX_DIR/memory-loop.yml"

# One model fills all three of qmd's slots. Embed is the only one that does real
# work; rerank and generate are pointed here deliberately. An embedding model has
# no ranking head, so qmd's reranker fails to build a context, warns, and falls
# back to RRF scores. That matters because the MCP `query` tool defaults
# `rerank: true` and a *missing* model would instead be downloaded mid-query —
# hundreds of MB, inside a tool call, with no progress output. Measured cost of
# the fallback: MRR 0.792 against 0.800 for an explicit rerank:false.
EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"

# Codex invokes --configure-only before launching MCP; publishing config needs
# no qmd executable. Ordinary runs never install dependencies.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if [ "${1:-}" != --configure-only ] && ! command -v qmd >/dev/null 2>&1; then
    if [ "${MEMORY_LOOP_HOST:-claude}" = codex ]; then
        mkdir -p "$INDEX_DIR" 2>/dev/null
        echo "Missing setup: qmd unavailable. Run Memory Loop setup." >"$INDEX_DIR/memory-loop.log"
    fi
    exit 0
fi
if [ "${1:-}" != --configure-only ] && [ "${MEMORY_LOOP_HOST:-claude}" = codex ]; then
    model_file="${XDG_CACHE_HOME:-$HOME/.cache}/qmd/models/hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf"
    if ! qmd --version 2>/dev/null | grep -qE '^qmd 2\.8\.3( |$)' || [ ! -f "$model_file" ]; then
        mkdir -p "$INDEX_DIR" 2>/dev/null
        echo "Missing setup: qmd 2.8.3 and the shared Qwen3 model are required. Run Memory Loop setup." >"$INDEX_DIR/memory-loop.log"
        exit 0
    fi
fi

# --- Index configuration ---
# A named index (`--index`) rather than a project-local .qmd/ directory, for two
# reasons. It leaves any .qmd/ the user keeps for their own code alone; and a
# checked-in .qmd/index.yml falls under qmd's trust gate, which skips a
# non-default embedding model for non-interactive callers *without an error* —
# retrieval would silently fall back to a weaker model. Named indexes are never
# gated. QMD_CONFIG_DIR and INDEX_PATH move that named index back under the
# project so it stays inspectable and deletable.
export QMD_CONFIG_DIR="$INDEX_DIR"
export INDEX_PATH="$INDEX_DIR/memory-loop.sqlite"

mkdir -p "$INDEX_DIR" 2>/dev/null || exit 0

# Written wholesale rather than patched: the file has exactly one collection and
# one model, so there is nothing to preserve and no YAML parser to depend on.
# Rewritten whenever it drifts, which also repairs a config edited by hand.
#
# The collection path is written as-is, unresolved. .claude/memories may be a
# plain directory or a symlink into a shared checkout (the shared-memories pack
# makes it one), and both index correctly — qmd opens the collection root
# directly and resolves both sides of its containment check. Storing the literal
# path is what keeps the two interchangeable: `qmd collection add` would record
# the symlink's *target*, which goes stale the moment the link is re-pointed or
# the pack is added to a project that already had a real directory.
# Single-quoted YAML scalar with internal quotes doubled: a project path may
# legitimately contain "#" or ": ", either of which silently changes what the
# parser sees when written bare.
mem_yaml="'$(printf '%s' "$MEMORIES_DIR" | sed "s/'/''/g")'"

# Unquoted heredoc — it has to interpolate the two variables below, so backticks
# and $ in the context text are executed by the shell and vanish from the config.
config_tmp=$(mktemp "$CONFIG.XXXXXXXX") || exit 0
trap 'rm -f "$config_tmp"' EXIT
cat >"$config_tmp" <<EOF || exit 0
collections:
  memories:
    path: $mem_yaml
    pattern: "**/*.md"
models:
  embed: $EMBED_MODEL
  generate: $EMBED_MODEL
  rerank: $EMBED_MODEL
global_context: |
  Project memory KB: this project's own past learnings, decisions and debugging
  discoveries — not external documentation.
EOF

# Identity only — no search guidance. qmd serves global_context two ways from one
# knob: the MCP server's `instructions`, once, and the `context` field of *every*
# search result. Guidance here is paid for per result and is the only copy an
# install already has via the CLAUDE.md template, which is isRequired. At 342
# characters it was 38% of a six-result response; at ~120 it is 13%.
#
# Replaced only when the content actually differs, so a no-op run leaves the
# mtime alone. Comparing whole files rather than probing for one line is what
# lets any later edit here — the context text especially — reach an install that
# already has a config.
if ! cmp -s "$config_tmp" "$CONFIG" 2>/dev/null; then
    mv -f "$config_tmp" "$CONFIG" || exit 0
else
    rm -f "$config_tmp"
fi

# The config is written even when no memory has been captured yet, because the
# MCP server reads its collection list once at startup: a server that booted
# against a config with no collections cannot see the first memory until the next
# session, however promptly this hook indexes it. Registering the collection up
# front costs nothing — qmd accepts a collection whose directory does not exist
# and reports zero documents.
[ "${1:-}" = --configure-only ] && exit 0
[ -d "$MEMORIES_DIR" ] || exit 0

# --- Reindex ---
# Both hook registrations are async, so two runs can overlap on a slow first
# index. qmd's own embed lock reports contention as success — it prints that
# another embed is running and exits 0 — so without a mutex here the losing run
# would clear the failure log having embedded nothing, hiding the pending work
# behind a clean bill of health.
#
# mkdir is the atomic test-and-set. A run killed by the hook timeout cannot
# release the lock, so a lock older than the timeout is treated as abandoned.
LOCK="$INDEX_DIR/.reindex.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
    [ -n "$(find "$LOCK" -maxdepth 0 -mmin +5 2>/dev/null)" ] || exit 0
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || exit 0
fi
trap 'rm -f "$config_tmp"; rmdir "$LOCK" 2>/dev/null' EXIT

# Removed on success, so its presence is itself the signal that indexing is broken
# and it holds the reason. A doctor check reports it. Lives beside the index, so
# removing that directory clears it too.
ERROR_LOG="$INDEX_DIR/memory-loop.log"

# `update` rescans the collection for added, changed and removed files; `embed`
# vectorises whatever came back without one. Both are incremental — a no-op pass
# is under a tenth of a second.
qmd --index memory-loop update >"$ERROR_LOG" 2>&1 || exit 0
qmd --index memory-loop embed >>"$ERROR_LOG" 2>&1 || exit 0

# Exit code is not enough: qmd reports embed-lock contention as success, so a run
# can leave documents unembedded and still exit 0.
#
# `status`, not `update`: `update`'s "needing vectors" count is computed without
# the embed model, so it reports every hash as pending on a fully embedded index.
status=$(qmd --index memory-loop status 2>>"$ERROR_LOG") || {
    printf '%s\n' 'qmd status failed; indexing health is unknown.' >>"$ERROR_LOG"
    exit 0
}
# qmd omits Pending when healthy. Require its known Total summary before
# interpreting that absence as zero; empty or unrecognized output is not health.
if ! printf '%s\n' "$status" | grep -qE 'Total: *[0-9]+ files indexed'; then
    printf '%s\n' 'Unrecognized qmd status; indexing health is unknown.' >>"$ERROR_LOG"
    exit 0
fi
pending=$(printf '%s\n' "$status" |
            sed -n 's/.*Pending: *\([0-9][0-9]*\) *need embedding.*/\1/p' | head -1)
if printf '%s\n' "$status" | grep -q 'Pending:' && [ -z "$pending" ]; then
    printf '%s\n' 'Unrecognized Pending count; indexing health is unknown.' >>"$ERROR_LOG"
    exit 0
fi
if [ "${pending:-0}" -ne 0 ]; then
    printf '%s  %s documents still need embedding after this run.\n' \
        "$(date '+%Y-%m-%dT%H:%M:%S')" "$pending" >>"$ERROR_LOG"
    exit 0
fi

# Nothing pending: clear the failure log so its presence stays meaningful.
rm -f "$ERROR_LOG"

# Editing a memory strands its old vectors; one audit left 275 orphaned chunks,
# 47% of the file. Unconditional for the same reason the staleness check is gone:
# 0.116s is not worth a condition. Also clears qmd's LLM cache, empty here since
# nothing populates it while rerank and expansion are off. Best-effort — a failed
# cleanup is a disk problem, not an indexing one.
qmd --index memory-loop cleanup >/dev/null 2>&1 || true

#!/bin/bash

# Hook: index .claude/memories/ into this project's search index.
# Runs on SessionStart and UserPromptSubmit (async). Never fails the hook.

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
CONFIG="$INDEX_DIR/memory-loop.yml"
TIMESTAMP_FILE="$project_root/.claude/.memories-last-indexed"

# One model fills all three of qmd's slots. Embed is the only one that does real
# work; rerank and generate are pointed here deliberately. An embedding model has
# no ranking head, so qmd's reranker fails to build a context, warns, and falls
# back to RRF scores. That matters because the MCP `query` tool defaults
# `rerank: true` and a *missing* model would instead be downloaded mid-query —
# hundreds of MB, inside a tool call, with no progress output. Measured cost of
# the fallback: MRR 0.792 against 0.800 for an explicit rerank:false.
EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"

# Exit early if no memories directory
[ -d "$MEMORIES_DIR" ] || exit 0

# Exit early if qmd is not installed
command -v qmd >/dev/null 2>&1 || exit 0

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
cat >"$CONFIG.new" <<EOF || exit 0
collections:
  memories:
    path: $MEMORIES_DIR
    pattern: "**/*.md"
models:
  embed: $EMBED_MODEL
  generate: $EMBED_MODEL
  rerank: $EMBED_MODEL
global_context: |
  Project memory KB: prior learnings, decisions and debugging discoveries. Not
  external documentation. Search with searches:[{type:"lex"},{type:"vec"}] plus
  an intent, and rerank:false — a bare query string is slower and scores worse.
EOF

# Kept short on purpose: qmd serves global_context two ways — once as the MCP
# server's `instructions` (the reason it is here at all) and again as the
# `context` field of *every* search result. At 591 characters it was 53% of a
# ten-result response. The fuller explanation lives in the CLAUDE.md template,
# both skills, and the sub-agent briefing, none of which are echoed per result.
#
# Replaced only when the content actually differs, so a no-op run leaves the
# mtime alone. Comparing whole files rather than probing for one line is what
# lets any later edit here — the context text especially — reach an install that
# already has a config.
config_changed=no
if ! cmp -s "$CONFIG.new" "$CONFIG" 2>/dev/null; then
    mv -f "$CONFIG.new" "$CONFIG" || exit 0
    config_changed=yes
else
    rm -f "$CONFIG.new"
fi

# --- Staleness check ---
# Runs after the config sync, not before: a config that changed (a new model, new
# guidance) has to reach the index even when no memory file moved. Skipping here
# is only safe when nothing at all has changed.
#
# The index has to be present for the timestamp to mean anything. It outlived the
# previous retrieval backend: on an upgrade the file says "indexed recently" while
# no index exists at all, and without this the hook would skip until some memory
# happened to change — leaving the KB silently unsearchable in between.
if [ "$config_changed" = no ] && [ -f "$TIMESTAMP_FILE" ] && [ -f "$INDEX_PATH" ]; then
    newest=$(find "$MEMORIES_DIR" -name "*.md" -newer "$TIMESTAMP_FILE" -print -quit 2>/dev/null)
    # Also check if the directory itself was modified (file added/removed)
    dir_changed=""
    [ "$MEMORIES_DIR" -nt "$TIMESTAMP_FILE" ] && dir_changed="yes"
    [ -n "$newest" ] || [ -n "$dir_changed" ] || exit 0
fi

# --- Reindex ---
# `update` rescans the collection for added, changed and removed files; `embed`
# vectorises whatever came back without one. Both are incremental — a no-op pass
# is under a tenth of a second.
qmd --index memory-loop update >/dev/null 2>&1 || exit 0
qmd --index memory-loop embed >/dev/null 2>&1 || exit 0

# Mark indexing time for subsequent staleness checks. Gated on the two commands
# above succeeding: an unconditional touch marks a *failed* index as fresh, and
# the staleness check then skips it forever with nothing reporting the gap.
touch "$TIMESTAMP_FILE"

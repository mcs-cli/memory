#!/bin/bash

# Hook: index .claude/memories/ into docs-mcp-server for semantic search.
# Runs on SessionStart and UserPromptSubmit (async). Never fails the hook and
# never writes to stdout (UserPromptSubmit stdout would be injected into context).

set -uo pipefail

# Read the hook's stdin JSON so we can fall back to its `cwd` field below.
hook_input=$(cat 2>/dev/null || true)
hook_event=$(printf '%s' "$hook_input" | jq -r '.hook_event_name // empty' 2>/dev/null)

# --- Resolve the project root: the directory that contains .claude/ ---
# In a git repo, anchor to the repo toplevel (original behavior): the same repo
# may be checked out under different folder names, and the repo root is the stable
# anchor so they map to one library. For a non-git folder (git rev-parse exits
# non-zero), fall back to where Claude was launched — CLAUDE_PROJECT_DIR, then the
# hook's stdin `cwd`, then $PWD.
project_root=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$project_root" ]; then
    cwd=$(printf '%s' "$hook_input" | jq -r '.cwd // empty' 2>/dev/null)
    project_root="${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}"
fi

MEMORIES_DIR="$project_root/.claude/memories"
TIMESTAMP_FILE="$project_root/.claude/.memories-last-indexed"
LOG_FILE="$project_root/.claude/.memories-index.log"

# Nothing to do without a memories directory that actually holds .md files.
[ -d "$MEMORIES_DIR" ] || exit 0
[ -n "$(find "$MEMORIES_DIR" -name '*.md' -print -quit 2>/dev/null)" ] || exit 0

# Exit early if Ollama is not running.
curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1 || exit 0

# Start each session with a fresh log so it can't grow unbounded across sessions;
# UserPromptSubmit runs during the session then append to it. Logging is
# best-effort — a failed write here must never stop indexing.
if [ "$hook_event" = "SessionStart" ]; then
    : 2>/dev/null >"$LOG_FILE" || true
fi

log() {
    printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$1" 2>/dev/null >>"$LOG_FILE" || true
}

repo_name=$(basename "$project_root")
memories_url="file://$MEMORIES_DIR"

embedding_model="openai:nomic-embed-text"
export OPENAI_API_KEY=ollama
export OPENAI_API_BASE=http://localhost:11434/v1
# `list` reads the model from this env var and rejects --embedding-model. Without
# it, `list` initializes with the default model, mismatches the nomic-built store,
# and throws EmbeddingModelChangedError — silently breaking the count check below.
export DOCS_MCP_EMBEDDING_MODEL="$embedding_model"
export DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_MODE=unrestricted
export DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_INCLUDE_HIDDEN=true
export DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_FOLLOW_SYMLINKS=true

# Echo the indexed document count for this library+source (0 if absent or empty).
# Spawns npx, so callers keep it off the per-prompt hot path. docs-mcp-server
# lowercases library names on storage, so match the name case-insensitively.
library_doc_count() {
    npx -y @arabold/docs-mcp-server@latest list --output json 2>/dev/null \
        | jq -r --arg name "$repo_name" --arg url "$memories_url" \
            'map(select((.name | ascii_downcase) == ($name | ascii_downcase)))[0].versions[]?
             | select(.sourceUrl == $url) | .documentCount // 0' 2>/dev/null \
        | head -1
}

# --- Decide whether to (re)index ---
# The cheap local checks (timestamp vs. file mtimes) run every invocation. The
# store-existence probe spawns npx, so it runs only at SessionStart — enough to
# re-add a library whose store was cleared while its timestamp lingered, without
# paying npx on every prompt. Anything changed, or no timestamp yet, => index.
should_index=1
if [ -f "$TIMESTAMP_FILE" ]; then
    newest=$(find "$MEMORIES_DIR" -name '*.md' -newer "$TIMESTAMP_FILE" -print -quit 2>/dev/null)
    if [ -z "$newest" ] && [ ! "$MEMORIES_DIR" -nt "$TIMESTAMP_FILE" ]; then
        should_index=0
        if [ "$hook_event" = "SessionStart" ]; then
            count=$(library_doc_count)
            [ "${count:-0}" -gt 0 ] 2>/dev/null || should_index=1
        fi
    fi
fi
[ "$should_index" -eq 1 ] || exit 0

# --- Index ---
# `scrape` (re)indexes in place whether or not the library exists — adds when
# missing, updates when present — so no separate refresh command is needed.
output=$(npx -y @arabold/docs-mcp-server@latest scrape "$repo_name" "$memories_url" \
    --embedding-model "$embedding_model" 2>&1)
rc=$?

# Confirm content actually landed using the same trusted count the gate uses: a
# failure — or a #/? truncated path that "succeeds" with 0 pages — leaves the
# count at 0, so we never record a false success that hides the library at zero.
count=$(library_doc_count)
if [ "$rc" -eq 0 ] && [ "${count:-0}" -gt 0 ] 2>/dev/null; then
    touch "$TIMESTAMP_FILE"
    log "index ok: '$repo_name' ($count docs) <- $memories_url"
else
    log "index FAILED (rc=$rc, docs=${count:-0}) '$repo_name' <- $memories_url :: $(printf '%s' "$output" | tr '\n' ' ' | tail -c 300)"
fi

exit 0

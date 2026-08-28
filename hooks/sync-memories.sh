#!/bin/bash

# Hook: index .claude/memories/ into docs-mcp-server for semantic search.
# Runs on SessionStart and UserPromptSubmit (async). Never fails the hook.

set -uo pipefail

# Consume stdin (hook passes JSON context)
cat >/dev/null 2>&1 || true

# Resolve the project root. Prefer the git repo toplevel — it's the stable
# anchor so launching from any subdirectory of a repo maps to the same library.
# In a non-git folder git exits non-zero (empty output); fall back to where
# Claude was launched (CLAUDE_PROJECT_DIR, else $PWD).
#
# keep in sync with hooks/kb-gate.sh resolve_paths() — that hook quotes the
# library name back to Claude, and it has to be the one indexed here.
project_root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$project_root" ] || project_root="${CLAUDE_PROJECT_DIR:-$PWD}"

MEMORIES_DIR="$project_root/.claude/memories"
TIMESTAMP_FILE="$project_root/.claude/.memories-last-indexed"

# Exit early if no memories directory
[ -d "$MEMORIES_DIR" ] || exit 0

# Exit early unless some OpenAI-compatible server is reachable. Two fixes over
# the previous `curl -s .../api/tags`:
#   -f          — without it curl exits 0 on an HTTP 404, so any server that
#                 merely accepted the connection passed the gate.
#   /v1/models  — /api/tags is Ollama-proprietary and 404s on every other
#                 provider. This one is answered by all of them.
# Deliberately the cheap probe, not an embed round-trip: this runs on EVERY
# prompt (registered on UserPromptSubmit as well as SessionStart), and almost
# every one of those exits at the staleness check just below. An embed request
# here would mean a discarded forward pass per prompt, plus a reset keep_alive
# timer pinning the model in memory. Whether the endpoint can actually embed is
# proven by the indexer itself failing below — which no longer hides.
# Keep this URL in step with the probes in techpack.yaml.
curl -sf --max-time 3 http://localhost:11434/v1/models >/dev/null 2>&1 || exit 0

# --- Staleness check ---
# If timestamp file exists and nothing changed, nothing to do.
# If timestamp file doesn't exist, this is the first run — do a full index.
if [ -f "$TIMESTAMP_FILE" ]; then
    newest=$(find "$MEMORIES_DIR" -name "*.md" -newer "$TIMESTAMP_FILE" -print -quit 2>/dev/null)
    # Also check if the directory itself was modified (file added/removed)
    dir_changed=""
    [ "$MEMORIES_DIR" -nt "$TIMESTAMP_FILE" ] && dir_changed="yes"
    [ -n "$newest" ] || [ -n "$dir_changed" ] || exit 0
fi

# --- Index ---
repo_name=$(basename "$project_root")

export OPENAI_API_KEY=ollama
export OPENAI_API_BASE=http://localhost:11434/v1
export DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_MODE=unrestricted
export DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_INCLUDE_HIDDEN=true
export DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_FOLLOW_SYMLINKS=true
export DOCS_MCP_EMBEDDING_MODEL="openai:nomic-embed-text"

# Check if library already indexed with the same source URL
existing_url=$(docs-mcp-server list 2>/dev/null \
    | jq -r --arg name "$repo_name" '.[] | select(.name == $name) | .versions[0].sourceUrl // empty')

# Advance the timestamp only on success, and keep the output of a failure around.
#
# Touching unconditionally made a failure self-concealing: the staleness check
# above would see a fresh timestamp and skip every later run, so one failed index
# meant the KB was silently never indexed again. Gating the touch fixes that, but
# on its own it trades silence for a full re-attempt every prompt with still no
# way to see why — hence the log. It is removed on success, so its presence is
# itself the signal that indexing is broken, and it holds the reason.
ERROR_LOG="$project_root/.claude/.memories-index.log"

if [ "$existing_url" = "file://$MEMORIES_DIR" ]; then
    docs-mcp-server refresh "$repo_name" \
        --silent >"$ERROR_LOG" 2>&1
else
    docs-mcp-server scrape "$repo_name" \
        "file://$MEMORIES_DIR" \
        --silent >"$ERROR_LOG" 2>&1
fi && { touch "$TIMESTAMP_FILE"; rm -f "$ERROR_LOG"; }

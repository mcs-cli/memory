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
project_root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$project_root" ] || project_root="${CLAUDE_PROJECT_DIR:-$PWD}"

MEMORIES_DIR="$project_root/.claude/memories"
TIMESTAMP_FILE="$project_root/.claude/.memories-last-indexed"

# Exit early if no memories directory
[ -d "$MEMORIES_DIR" ] || exit 0

# Exit early if Ollama is not running
curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1 || exit 0

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

if [ "$existing_url" = "file://$MEMORIES_DIR" ]; then
    docs-mcp-server refresh "$repo_name" \
        --silent >/dev/null 2>&1
else
    docs-mcp-server scrape "$repo_name" \
        "file://$MEMORIES_DIR" \
        --silent >/dev/null 2>&1
fi

# Mark indexing time for subsequent staleness checks
touch "$TIMESTAMP_FILE"

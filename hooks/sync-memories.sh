#!/bin/bash

# Hook: index .claude/memories/ into docs-mcp-server for semantic search.
# Runs on SessionStart and UserPromptSubmit (async). Never fails the hook.

set -uo pipefail

# Consume stdin (hook passes JSON context)
cat >/dev/null 2>&1 || true

project_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

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
embedding_model="openai:nomic-embed-text"

npx -y @arabold/docs-mcp-server@latest scrape "$repo_name" \
    "file://$MEMORIES_DIR" \
    --embedding-model "$embedding_model" \
    --silent >/dev/null 2>&1

# Mark indexing time for subsequent staleness checks
touch "$TIMESTAMP_FILE"

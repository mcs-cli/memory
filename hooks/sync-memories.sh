#!/bin/bash

set -euo pipefail
trap 'exit 0' ERR

MEMORIES_DIR=".claude/memories"
TIMESTAMP_FILE=".claude/.memories-last-indexed"

# Check if jq is available
command -v jq >/dev/null 2>&1 || exit 0

# Read and validate JSON input
input_data=$(cat) || exit 0
echo "$input_data" | jq '.' >/dev/null 2>&1 || exit 0

# Exit early if no memories directory
[ -d "$MEMORIES_DIR" ] || exit 0

# Exit early if Ollama is not running
curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1 || exit 0

project_root=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
[ -n "$project_root" ] || exit 0

repo_name=$(basename "$project_root")
memories_path="$project_root/$MEMORIES_DIR"

# --- Staleness check ---
# If timestamp file exists and no memories are newer, nothing to do.
# If timestamp file doesn't exist, this is the first run — do a full index.
if [ -f "$TIMESTAMP_FILE" ]; then
    newest=$(find "$MEMORIES_DIR" -name "*.md" -newer "$TIMESTAMP_FILE" -print -quit 2>/dev/null)
    [ -n "$newest" ] || exit 0
fi

# --- Index ---
export OPENAI_API_KEY=ollama
export OPENAI_API_BASE=http://localhost:11434/v1
embedding_model="openai:nomic-embed-text"

if npx -y @arabold/docs-mcp-server list --silent 2>/dev/null | grep -q "$repo_name"; then
    npx -y @arabold/docs-mcp-server refresh "$repo_name" \
        --embedding-model "$embedding_model" \
        --silent >/dev/null 2>&1
else
    npx -y @arabold/docs-mcp-server scrape "$repo_name" \
        "file://$memories_path" \
        --embedding-model "$embedding_model" \
        --silent >/dev/null 2>&1
fi

# Mark indexing time for subsequent staleness checks
touch "$TIMESTAMP_FILE"

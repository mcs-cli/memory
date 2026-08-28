#!/usr/bin/env bash
# Doctor check: is an embedding runtime available at all?
#
# Provider-neutral by design. The pack consumes an OpenAI-compatible
# /v1/embeddings endpoint and does not care who serves it — Ollama, llama.cpp,
# LM Studio, vLLM, a remote host. Ollama is only the fallback we install when
# nothing else answers.
#
# Two conditions must OR into a single doctor line, which is why this is a
# script and not two `commandExists` checks: `isOptional` is silently ignored by
# commandExists (only hookEventExists honours it), so the second check would
# show a hard red on a machine that deliberately runs something else.
#
# Exit codes: 0=pass 1=fail 2=warn 3=skip
#
# No `set -e`: the first curl is expected to fail on the fallback path.
set -uo pipefail

# Hardcoded on purpose. An env override here would steer only this check while
# the probes in techpack.yaml and hooks/sync-memories.sh stayed on localhost, so
# setting it would let this pass against a remote endpoint, skip the Ollama
# install, and then have ollama-service's localhost check fail and start a local
# Ollama anyway — the port fight this whole arrangement exists to avoid.
# Keep this URL in step with those two files.
BASE="http://localhost:11434/v1"

if curl -sf --max-time 3 "$BASE/models" >/dev/null 2>&1; then
    echo "OpenAI-compatible server responding at $BASE"
    exit 0
fi

# Installed but not serving. This arm is load-bearing: without it a stopped
# Ollama would fail the check and re-run the interactive installer on every sync.
if command -v ollama >/dev/null 2>&1; then
    echo "Ollama installed (not currently serving)"
    exit 0
fi

echo "no embedding runtime found at $BASE"
exit 1

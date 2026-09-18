#!/bin/bash

cat << 'EOF'
MANDATORY MEMORY PROTOCOL

If this starts a new sub-task or phase (tests, refactor, deploy, etc.)
→ search the KB via mcp__memory-loop__query for relevant patterns first.

If you hit an unexpected error or are about to debug/diagnose
→ search the KB FIRST, before reasoning from scratch.

If this session produced reusable knowledge worth preserving, invoke
Skill(continuous-learning) — the skill evaluates and routes the knowledge
to the correct destination. Do not ask permission.

NEVER write to .claude/memories/ directly. Always go through the skill
so the routing and quality gates run.
EOF

#!/bin/bash

cat << 'EOF'
MANDATORY MEMORY PROTOCOL

If this starts a new sub-task or phase (tests, refactor, deploy, etc.)
→ search the KB via search_docs for relevant patterns first.

If this request produced non-obvious knowledge or a deliberate decision
worth preserving, use Skill(continuous-learning) to save autonomously
to <project>/.claude/memories/. Do not ask permission.

LEARNINGS → Non-obvious debugging, workarounds, error resolutions
  Save as: learning_<topic>_<specific>

DECISIONS → Architecture choices, conventions, preferences, tool selections
  Save as: decision_<domain>_<topic>
EOF

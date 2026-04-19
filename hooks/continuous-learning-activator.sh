#!/bin/bash

cat << 'EOF'
MANDATORY MEMORY EVALUATION

If this starts a new sub-task or phase (tests, refactor, deploy, etc.)
→ search the KB via search_docs for relevant patterns first.

After completing this request, evaluate whether it produced
extractable knowledge or decisions worth saving to memory.

LEARNINGS → Non-obvious debugging, workarounds, error resolutions
  Save as: learning_<topic>_<specific>

DECISIONS → Architecture choices, conventions, preferences, tool selections
  Save as: decision_<domain>_<topic>

If YES to either → Use Skill(continuous-learning) to save
autonomously to <project>/.claude/memories/. Do not ask permission.
EOF

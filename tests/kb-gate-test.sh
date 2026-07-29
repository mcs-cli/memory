#!/bin/bash
#
# Tests for hooks/kb-gate.sh.
#
# The dispatcher's branches are driven directly with crafted JSON rather than
# through a live session: deterministic, no clock, no transcript to stage.
#
# CI runs this file twice per push on purpose. The barrier is scoped by a
# monotonic turn counter rather than wall-clock time, and a regression to
# timestamps shows up as the second run behaving differently from the first — so
# run it twice locally too when touching the state handling.
#
# Two setup details are load-bearing, not incidental:
#   - Everything runs from a temp dir OUTSIDE any git repo. The hook resolves its
#     project root with `git rev-parse --show-toplevel` first, so a harness run
#     from the checkout would write state into the working tree and read the
#     developer's real session files.
#   - The fixture project must contain .claude/memories/. Without it every
#     PreToolUse call takes the `no_memories_dir` skip and the whole suite passes
#     vacuously. The final denial-count check is what makes that failure loud.

set -uo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
src="$repo_root/hooks/kb-gate.sh"
template="$repo_root/templates/continuous-learning.md"
[ -f "$src" ] || {
    echo "FATAL: $src not found"
    exit 1
}
command -v jq >/dev/null 2>&1 || {
    echo "FATAL: jq is required"
    exit 1
}

# Budgets come from the script, never re-typed here: retuning them is a routine
# edit with no correctness risk, and it should not break the suite.
eval "$(grep -E '^MAX_DENIALS_PER_(STATE|TURN)=' "$src")"
: "${MAX_DENIALS_PER_STATE:?not found in $src}" "${MAX_DENIALS_PER_TURN:?not found in $src}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# One copy per mode, with the sync-time placeholder substituted.
for m in enforce warn observe off; do
    sed "s/__KB_GATE_MODE__/$m/" "$src" >"$work/kb-gate-$m.sh"
done

proj="$work/proj" # a project with a KB
nokb="$work/nokb" # a project without one
mkdir -p "$proj/.claude/memories" "$nokb/.claude"

pass=0
fail=0
denies=0
sid_n=0
sid=""
mode=enforce

ok() {
    pass=$((pass + 1))
    printf '  ok   %s\n' "$1"
}

bad() {
    fail=$((fail + 1))
    printf '  FAIL %s\n       %s\n' "$1" "$2"
}

group() { printf '\n== %s\n' "$1"; }

# A fresh session id is what isolates a group's state; every group starts on
# turn 1, so the turn stamp belongs here rather than in each caller.
new_session() {
    sid_n=$((sid_n + 1))
    sid="session-$sid_n"
    turn
}

# --- event payloads -------------------------------------------------------

j_turn() { jq -nc --arg s "$sid" '{hook_event_name:"UserPromptSubmit",session_id:$s}'; }

j_search() {
    jq -nc --arg s "$sid" --arg q "${1:-some topic}" \
        '{hook_event_name:"PostToolUse",session_id:$s,tool_input:{query:$q}}'
}

# j_spawn [prompt] [agent_type] [agent_id]
j_spawn() {
    jq -nc --arg s "$sid" --arg p "${1:-find the thing}" \
        --arg a "${2:-Explore}" --arg id "${3:-}" \
        '{hook_event_name:"PreToolUse",session_id:$s,agent_id:$id,
          tool_input:{subagent_type:$a,prompt:$p}}'
}

# --- invocation -----------------------------------------------------------

# run <mode> <project-dir> <json>
run() {
    (cd "$2" && printf '%s' "$3" | env -u CLAUDE_PROJECT_DIR bash "$work/kb-gate-$1.sh")
}

turn() { run "$mode" "$proj" "$(j_turn)" >/dev/null; }
search() { run "$mode" "$proj" "$(j_search "$@")" >/dev/null; }
spawn() { run "$mode" "$proj" "$(j_spawn "$@")"; }

KB="KB context: - hooks/kb-gate.sh holds the policy"

# --- assertions -----------------------------------------------------------

assert_contains() { # <label> <haystack> <needle>
    case "$2" in
    *"$3"*)
        ok "$1"
        return 0
        ;;
    *)
        bad "$1" "expected to contain '$3', got: ${2:-<no output>}"
        return 1
        ;;
    esac
}

assert_deny() {
    assert_contains "$1" "$2" '"permissionDecision":"deny"' && denies=$((denies + 1))
}

assert_allow() {
    case "$2" in
    *'"permissionDecision":"deny"'*) bad "$1" "expected ALLOW, got a denial" ;;
    *) ok "$1" ;;
    esac
}

assert_silent() {
    if [ -z "$2" ]; then ok "$1"; else bad "$1" "expected no output, got: $2"; fi
}

# The last PreToolUse decision in the log must mention <pattern>.
assert_log() {
    assert_contains "$1" \
        "$(grep '"event":"PreToolUse"' "$proj/.claude/.kb-gate.log" 2>/dev/null | tail -1)" "$2"
}

# ==========================================================================

group "sanity — the fixture actually gates (guards against a vacuous suite)"
new_session
assert_deny "bare spawn is denied" "$(spawn)"

group "satisfied barrier"
new_session
search
assert_allow "search this turn + KB block in prompt" "$(spawn "$KB — findings here")"

group "parallel fan-out is denied in full"
new_session
assert_deny "fan-out #1" "$(spawn)"
assert_deny "fan-out #2" "$(spawn)"
assert_deny "fan-out #3" "$(spawn)"

group "complying re-arms the gate for the rest of the turn"
new_session
assert_deny "first spawn denied" "$(spawn)"
search
assert_allow "retry with search + block" "$(spawn "$KB — now with findings")"
assert_allow "second compliant spawn" "$(spawn "$KB — still compliant")"
assert_deny "later spawn without a block is still gated" "$(spawn)"

group "budget: no progress"
new_session
i=1
while [ "$i" -le "$MAX_DENIALS_PER_STATE" ]; do
    assert_deny "denial $i of $MAX_DENIALS_PER_STATE" "$(spawn)"
    i=$((i + 1))
done
assert_allow "next spawn released by the no-progress budget" "$(spawn)"
assert_log "released as budget_no_progress" '"skip_reason":"budget_no_progress"'
assert_allow "and stays released" "$(spawn)"

group "budget: per-turn ceiling terminates a search-then-spawn loop"
new_session
i=1
while [ "$i" -le "$MAX_DENIALS_PER_TURN" ]; do
    assert_deny "loop denial $i of $MAX_DENIALS_PER_TURN" "$(spawn)"
    search "topic $i" # progress each round, so only the hard ceiling can stop this
    i=$((i + 1))
done
assert_allow "next spawn released by the per-turn ceiling" "$(spawn)"
assert_log "released as budget_turn" '"skip_reason":"budget_turn"'

group "turn boundary resets the barrier"
new_session
search
turn # new turn — the search above no longer counts
assert_deny "stale search does not satisfy the new turn" "$(spawn "$KB — from last turn")"

group "skips"
new_session
assert_silent "nested sub-agent call" "$(spawn "no block" Explore agent-42)"
assert_silent "non-discovery agent type" "$(spawn "no block" code-reviewer)"
assert_silent "project without a KB" "$(run "$mode" "$nokb" "$(j_spawn)")"
assert_silent "empty payload" "$(run "$mode" "$proj" "")"

group "non-enforce modes never block"
for m in warn observe off; do
    mode=$m
    new_session
    assert_allow "mode=$m does not deny" "$(spawn)"
done

group "warn mode still advises"
mode=warn
new_session
assert_contains "warn emits a reminder" "$(spawn)" additionalContext
mode=enforce

group "the KB marker is the same string on both sides of the contract"
marker=$(sed -n 's/^KB_MARKER="\(.*\)"$/\1/p' "$src")
if [ -z "$marker" ]; then
    bad "marker parsed from the hook" "KB_MARKER= not found in $src"
else
    # Changing it on one side alone silently disables the gate: the hook tests for
    # a string CLAUDE.local.md never tells Claude to write.
    assert_contains "template teaches the marker the hook tests for" \
        "$(cat "$template")" "$marker"
fi

# ==========================================================================

printf '\n%s\n' "-----------------------------------------"
if [ "$denies" -eq 0 ]; then
    printf 'FAIL: no denial was ever produced — the fixture is not gating,\n'
    printf '      so every assertion above passed vacuously.\n'
    exit 1
fi
printf '%d passed, %d failed (%d real denials exercised)\n' "$pass" "$fail" "$denies"
[ "$fail" -eq 0 ] || exit 1

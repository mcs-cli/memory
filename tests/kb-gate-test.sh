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
#     PreToolUse call takes the `no_memories_dir` skip and nothing is ever gated.
#     The denial count checked at the end is what turns that into a loud failure
#     rather than a green run that asserted nothing.

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
eval "$(grep -E '^(MAX_DENIALS_PER_(STATE|TURN)|LOG_(MAX_BYTES|KEEP_LINES))=' "$src")"
: "${MAX_DENIALS_PER_STATE:?not found in $src}" "${MAX_DENIALS_PER_TURN:?not found in $src}" \
    "${LOG_MAX_BYTES:?not found in $src}" "${LOG_KEEP_LINES:?not found in $src}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# One copy per mode, with the sync-time placeholder substituted.
for m in enforce warn observe off; do
    sed "s/__KB_GATE_MODE__/$m/" "$src" >"$work/kb-gate-$m.sh"
done

proj="$work/proj"       # a project with a KB
nokb="$work/nokb"       # a project without one
offproj="$work/offproj" # untouched except by mode=off, so "wrote nothing" is checkable
mkdir -p "$proj/.claude/memories" "$nokb/.claude" "$offproj/.claude/memories"
log="$proj/.claude/.kb-gate.log"
state="$proj/.claude/.kb-gate"

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

# A hybrid call carries `searches`, not `query`, so a recorder that reads only
# `query` records nothing and the barrier denies forever. `intent` is deliberately
# not a third shape: it never searches on its own, so it must not create a record.
j_search_typed() {
    jq -nc --arg s "$sid" --arg a "${1:-lex terms}" --arg b "${2:-vec phrasing}" \
        '{hook_event_name:"PostToolUse",session_id:$s,
          tool_input:{searches:[{type:"lex",query:$a},{type:"vec",query:$b}]}}'
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

assert_num() { # <label> <actual> <op> <expected>
    if [ "$2" "$3" "$4" ]; then ok "$1"; else bad "$1" "expected $2 $3 $4"; fi
}

# The last PreToolUse decision in the log must mention <pattern>.
assert_log() {
    assert_contains "$1" "$(grep '"event":"PreToolUse"' "$log" 2>/dev/null | tail -1)" "$2"
}

inode() { ls -i "$1" 2>/dev/null | awk '{print $1}'; }

# ==========================================================================

group "satisfied barrier"
new_session
search
assert_allow "search this turn + KB block in prompt" "$(spawn "$KB — findings here")"

group "parallel fan-out is denied in full"
new_session
assert_deny "first of the batch" "$(spawn)"
assert_deny "and the second, which the old per-turn counter let through" "$(spawn)"

group "complying re-arms the gate for the rest of the turn"
new_session
assert_deny "first spawn denied" "$(spawn)"
search
assert_allow "retry with search + block" "$(spawn "$KB — now with findings")"
assert_deny "later spawn without a block is gated again" "$(spawn)"

# Both budget groups assert only the boundary — the denial at the limit and the
# release after it. The counters are monotonic, so an early release would show up
# as the boundary denial failing; asserting each intermediate spawn adds nothing.
group "budget: released once the no-progress budget is spent"
new_session
i=1
while [ "$i" -lt "$MAX_DENIALS_PER_STATE" ]; do
    spawn >/dev/null
    i=$((i + 1))
done
assert_deny "denial $MAX_DENIALS_PER_STATE is still a denial" "$(spawn)"
assert_allow "the next one is released" "$(spawn)"
assert_log "released as budget_no_progress" '"skip_reason":"budget_no_progress"'
assert_allow "and stays released" "$(spawn)"

group "budget: the per-turn ceiling terminates a search-then-spawn loop"
new_session
i=1
while [ "$i" -lt "$MAX_DENIALS_PER_TURN" ]; do
    spawn >/dev/null
    search "topic $i" # progress every round, so only the hard ceiling can stop this
    i=$((i + 1))
done
assert_deny "denial $MAX_DENIALS_PER_TURN is still a denial" "$(spawn)"
# Fresh progress right before the release proves it came from the turn ceiling
# and not from the no-progress budget.
search "one more topic"
assert_allow "released despite having just searched" "$(spawn)"
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
mode=warn
new_session
warn_out=$(spawn)
assert_allow "warn does not deny" "$warn_out"
assert_contains "warn advises instead" "$warn_out" additionalContext

mode=observe
new_session
assert_silent "observe records but says nothing" "$(spawn)"

# off is a kill switch, not the quietest strictness level, so asserting it merely
# does not deny is too weak: without the early exit it falls through to the warn
# path and still passes that. Assert it does nothing at all instead.
mode=off
sid=off-session
run off "$offproj" "$(j_turn)" >/dev/null
assert_silent "off emits nothing" "$(run off "$offproj" "$(j_spawn)")"
assert_silent "off writes neither log nor state" \
    "$(find "$offproj/.claude" -name '.kb-gate*' 2>/dev/null)"
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

group "stale session state is swept"
new_session
touch -t 200001010000 "$state/ancient.turn" 2>/dev/null
new_session # a new session's first turn is when the sweep runs
assert_silent "state from an old session is removed" \
    "$(find "$state" -name 'ancient.turn' 2>/dev/null)"
assert_contains "the current session's state survives" \
    "$(find "$state" -name "$sid.turn" 2>/dev/null)" "$sid.turn"

# Kept last on purpose: this group fills and truncates the shared log, which
# assert_log reads. Moving it earlier breaks unrelated assertions.
group "the log is bounded"
new_session
# Built by doubling rather than a loop of thousands of printfs, and guaranteed to
# clear the cap by construction rather than by an estimated line count.
filler='{"ts":"filler","event":"UserPromptSubmit","mode":"enforce","decision":"turn_start"}
'
while [ "${#filler}" -le "$LOG_MAX_BYTES" ]; do filler="$filler$filler"; done
printf '%s' "$filler" >>"$log"

before=$(wc -c <"$log")
turn
after=$(wc -c <"$log")
assert_num "oversized log is trimmed on a turn boundary" "$after" -lt "$before"

# Under the cap the file must not be touched at all. Asserting on the inode rather
# than the size is what makes this fail against an implementation that rewrites
# unconditionally — a tail-and-rename leaves the content plausible but the inode
# different.
: >"$log"
turn
before_inode=$(inode "$log")
turn
assert_num "a log under the cap is not rewritten" "$(inode "$log")" -eq "$before_inode"

assert_silent "no stray temp files" "$(find "$state" -name '*.tmp' 2>/dev/null)"

# If the retained tail ever approached the cap, every trim would leave the file
# still over it and the rewrite would fire on every turn.
assert_num "retained tail stays well clear of the cap" \
    "$((LOG_KEEP_LINES * 200))" -lt "$((LOG_MAX_BYTES / 2))"

group "both searching shapes are recorded"

# Without this the gate fails silently rather than loudly: nothing is written,
# no error is raised, and every subsequent spawn is denied for a search that
# did happen.
queries() { tail -1 "$state/$sid.queries" 2>/dev/null; }

new_session
run "$mode" "$proj" "$(j_search "plain query field")" >/dev/null
assert_contains "a single-string query" "$(queries)" "plain query field"

new_session
run "$mode" "$proj" "$(j_search_typed "counter state" "why not wall clock")" >/dev/null
assert_contains "typed lex+vec searches are joined" "$(queries)" "counter state why not wall clock"

new_session
run "$mode" "$proj" "$(j_search_typed "hybrid" "hybrid")" >/dev/null
assert_allow "a typed search satisfies the barrier" "$(spawn "$KB — from a typed search")"

# ==========================================================================

printf '\n%s\n' "-----------------------------------------"
if [ "$denies" -eq 0 ]; then
    printf 'FAIL: no denial was ever produced — the fixture is not gating,\n'
    printf '      so every assertion above passed vacuously.\n'
    exit 1
fi
printf '%d passed, %d failed (%d real denials exercised)\n' "$pass" "$fail" "$denies"
[ "$fail" -eq 0 ] || exit 1

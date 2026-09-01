#!/bin/bash

# Hook: keep KB lookups ahead of delegated discovery.
#
# One dispatcher registered on four events, branching on `hook_event_name`:
#   UserPromptSubmit  → stamp the turn boundary, and run housekeeping
#   PostToolUse       → record a successful KB search
#   PreToolUse        → judge a sub-agent spawn, and warn or block
#   SubagentStart     → tell a discovery sub-agent the KB exists
#
# Design rules, deliberate and load-bearing:
#   - FAIL OPEN. Any unexpected state exits 0 with no output. A broken gate must
#     never stop work.
#   - NEVER exit 2. That blocks unconditionally, turning a script bug into a hard
#     gate with no escape. This is also why `set -u`/`set -e` are omitted: an
#     unset variable should fall through to a silent allow, not abort mid-branch.
#   - NEVER call qmd here. That CLI loads an embedding model; PreToolUse runs
#     before every sub-agent spawn. File stats only.
#   - Log every evaluation. Comparing log line count against the spawn count in a
#     session transcript is the only way to catch a matcher that matches nothing.
#     `off` is the one exception, and it exits before reaching any of this.

MODE="__KB_GATE_MODE__"

# Anti-deadlock budgets for enforce mode. Sized by cost asymmetry: a denial is one
# cheap round-trip, a discovery agent running without KB findings is tens of
# thousands of tokens. Two orders of magnitude, so the aim is a guaranteed stop,
# not a tight leash. How the two differ is documented where they are counted.
MAX_DENIALS_PER_STATE=4
MAX_DENIALS_PER_TURN=8

# Nothing outside this script prunes anything it writes, so both artifacts are
# bounded here. The log is a rolling diagnostic — only its recent tail is ever
# read — and grows by a line per prompt, search, gated spawn and sub-agent start:
# tens of MB a year in a project worked in daily.
#
# Keep the retained tail well clear of the cap (1000 lines is ~190 KB against
# 512 KB). If the two converge, a trim leaves the file still over the threshold
# and the rewrite fires every turn instead of every few thousand lines.
LOG_MAX_BYTES=524288
LOG_KEEP_LINES=1000

# Per-session state is three small files that nothing ever removes. Bytes are not
# the problem — inodes are, at three per session forever.
STATE_MAX_AGE_DAYS=7

# A wire protocol: the string the messages below tell Claude to write, and the
# string tested for. The CLAUDE.local.md template carries its own copy, so
# changing one side alone silently disables the gate — the test suite asserts the
# two agree.
KB_MARKER="KB context:"

# Single source of truth for "which agents do discovery". The SubagentStart and
# PreToolUse registrations both match broadly and let this list decide, so adding
# an agent type is a one-line change here.
GATED_AGENTS="Explore general-purpose Plan"

command -v jq >/dev/null 2>&1 || exit 0

# Off is a kill switch, not the quietest strictness level — `observe` is already
# "never gate, just log". So off means off: no state directory, no log lines, no
# work at all, for a user who opted out.
[ "$MODE" = "off" ] && exit 0

payload=$(</dev/stdin)
[ -n "$payload" ] || exit 0

# One jq call for every field the branches share. PreToolUse runs before each
# spawn, so process count dominates; the prompt is reduced to a boolean inside jq
# rather than round-tripping through the shell. `contains` not `test` — the marker
# is a literal, not a regex. PostToolUse parses `query` separately because it is
# the one field that can contain a newline, which the read below cannot survive.
#
# One field per LINE, read with one `read` each — deliberately not `@tsv` with a
# single tab-split read. Tab is an IFS *whitespace* character, so bash collapses
# runs of them: an empty field (`agent_id` is empty on main-thread calls) would
# silently shift every later field left. None of these values can contain a
# newline, so line-per-field is unambiguous.
fields=$(jq -r --arg m "$KB_MARKER" '[
    .hook_event_name // "",
    .session_id // "unknown",
    .agent_id // "",
    (.tool_input.subagent_type // .agent_type // ""),
    (if (.tool_input.prompt // "") | contains($m) then "true" else "false" end)
] | .[]' <<<"$payload" 2>/dev/null)
[ -n "$fields" ] || exit 0

{
    read -r event
    read -r session_raw
    read -r agent_id
    read -r agent_type
    read -r had_kb_block
} <<EOF
$fields
EOF

# Paths are resolved on demand, and `git rev-parse` is the most expensive call in
# the script. Note this only pays off on the two SubagentStart exits that precede
# any logging — every other branch logs, and logging needs the project root, so a
# skip costs the same as a decision. Keep it that way: the unconditional log is
# worth more than the fork.
resolve_paths() {
    [ -n "$project_root" ] && return 0
    # keep in sync with hooks/sync-memories.sh — that hook indexes the memories
    # directory this one gates on, and both must land on the same project.
    project_root=$(git rev-parse --show-toplevel 2>/dev/null)
    [ -n "$project_root" ] || project_root="${CLAUDE_PROJECT_DIR:-$PWD}"
    MEMORIES_DIR="$project_root/.claude/memories"
    LOG_FILE="$project_root/.claude/.kb-gate.log"
    STATE_DIR="$project_root/.claude/.kb-gate"
    # Session ids come from the harness, but sanitize anyway — this becomes a path
    # segment.
    session="${session_raw//[^A-Za-z0-9._-]/_}"
    TURN_FILE="$STATE_DIR/$session.turn"
    QUERIES_FILE="$STATE_DIR/$session.queries"
    DENIALS_FILE="$STATE_DIR/$session.denials"
}

# Only the branches that write state pay for the directory.
ensure_state() {
    resolve_paths
    [ -d "$STATE_DIR" ] || mkdir -p "$STATE_DIR" 2>/dev/null || return 1
}

# The barrier is scoped to a turn, so it needs a turn identity. A monotonic
# counter, never a timestamp: file mtimes and `date +%s` both have 1-second
# granularity, which makes "did this search happen during this turn?" ambiguous
# for anything occurring within the same second.
current_turn() {
    # Guarded rather than relying on `2>/dev/null`: a failed input redirection is
    # reported by the shell itself, so a missing file would print to stderr.
    [ -f "$TURN_FILE" ] || { echo 0; return 0; }
    read -r t <"$TURN_FILE"
    case "$t" in
    '' | *[!0-9]*) echo 0 ;;
    *) echo "$t" ;;
    esac
}

# Logging is unconditional across strictness levels: switching warn↔observe↔enforce
# must never leave a gap in the data. `$1` is a pre-built JSON object of extra
# fields.
log_event() {
    resolve_paths
    jq -nc \
        --arg session "$session" \
        --arg event "$event" \
        --arg mode "$MODE" \
        --argjson extra "$1" \
        '{ts:(now|todate),session:$session,event:$event,mode:$mode} + $extra' \
        >>"$LOG_FILE" 2>/dev/null || true
}

# Decision records share a shape, so build it with printf — every value is either
# whitelisted (agent_type, phase), a literal boolean, or an integer. Keeps a
# second jq off the hot path.
# $1=satisfied $2=decision $3=optional trailing pairs, e.g. budget_fields output
log_decision() {
    log_event "$(printf \
        '{"phase":"%s","agent_type":"%s","fresh_query":%s,"had_kb_block":%s,"satisfied":%s,"decision":"%s"%s}' \
        "$phase" "$agent_type" "$fresh_query" "$had_kb_block" "$1" "$2" "$3")"
}

# The trailing pairs every enforce-mode decision carries. One definition, so
# renaming a key or adding a counter is a single edit.
budget_fields() {
    printf ',"denials_turn":%s,"denials_state":%s' "$1" "$2"
}

# Called once per turn, never on the spawn path: the common case is one `wc`, and
# the rewrite only happens on the rare turn that crosses the threshold. Losing a
# line to a concurrent append during the swap is acceptable for a diagnostic log.
trim_log() {
    [ -f "$LOG_FILE" ] || return 0
    # `wc` pads its output with leading spaces on BSD/macOS. Stripping non-digits
    # is the whole guard: what survives is either digits or empty.
    size=$(wc -c <"$LOG_FILE" 2>/dev/null)
    size=${size//[^0-9]/}
    [ -n "$size" ] || return 0
    [ "$size" -gt "$LOG_MAX_BYTES" ] || return 0
    # Temp file lives in the state dir, which is already gitignored, so a crash
    # mid-rewrite cannot leave an untracked file in the user's working tree. `mv`
    # unlinks the source, so one unconditional cleanup covers both failure paths.
    tail -n "$LOG_KEEP_LINES" "$LOG_FILE" >"$STATE_DIR/log.tmp" 2>/dev/null &&
        mv "$STATE_DIR/log.tmp" "$LOG_FILE" 2>/dev/null
    rm -f "$STATE_DIR/log.tmp" 2>/dev/null
}

# Old sessions' state, swept on the first turn of a new session — the natural unit
# for "clean up after the ones that ended", and it keeps the fork off every turn.
# Current-session files are minutes old and never match.
sweep_state() {
    find "$STATE_DIR" -type f -mtime "+$STATE_MAX_AGE_DAYS" -delete 2>/dev/null
}

is_gated_agent() {
    case " $GATED_AGENTS " in
    *" $1 "*) return 0 ;;
    esac
    return 1
}

case "$event" in
UserPromptSubmit)
    # New turn: reset the barrier and clear this turn's denial history.
    ensure_state || exit 0
    turn=$(( $(current_turn) + 1 ))
    # Turn 1 means no turn file existed, i.e. this session just started.
    [ "$turn" = 1 ] && sweep_state
    trim_log
    : >"$DENIALS_FILE" 2>/dev/null || true
    echo "$turn" >"$TURN_FILE" 2>/dev/null || true
    log_event "$(printf '{"decision":"turn_start","turn":%s}' "$turn")"
    ;;

PostToolUse)
    # A KB search landed. Store the query text (not just the turn) so the barrier
    # can become topical later without a state migration. The number of lines
    # matching the current turn is also what stamps a denial's progress marker.
    # The search tool takes *either* a single `query` or a list of typed
    # `searches`, never both. Reading only `query` would miss every hybrid
    # lex+vec call — the form this pack steers Claude toward — and the barrier
    # would then deny forever with nothing to show why.
    # Only the two shapes that actually search: a bare `query`, or the joined
    # text of typed `searches`. `intent` is context and never searches on its
    # own, so accepting it would let a request that retrieved nothing satisfy
    # the barrier. Built as a list rather than a `//` chain: `//` only falls
    # through on null, so an empty join would stop it, and `null | map` raises.
    query=$(jq -r '[.tool_input.query,
                    ((.tool_input.searches // []) | map(.query) | join(" "))]
                   | map(select(. != null and . != "")) | first // ""' <<<"$payload" 2>/dev/null)
    [ -n "$query" ] || exit 0
    ensure_state || exit 0
    printf '%s\t%s\n' "$(current_turn)" "$query" >>"$QUERIES_FILE" 2>/dev/null || true
    log_event "$(jq -nc --arg q "$query" '{decision:"recorded",query:$q}')"
    ;;

SubagentStart)
    # Cannot block — injects context only, which is all that's needed. The parent
    # often spawns agents in the same tool block as its own KB search, so the
    # agents never receive the findings; this makes each agent self-sufficient
    # rather than depending on the parent getting the order right.
    is_gated_agent "$agent_type" || exit 0
    resolve_paths
    [ -d "$MEMORIES_DIR" ] || exit 0

    # Cost is bounded on purpose: skip the search entirely when the prompt already
    # carries findings, and spend at most one query otherwise. SubagentStart input
    # does not include the prompt, so the agent has to make that call itself.
    jq -nc --arg e "$event" --arg m "$KB_MARKER" '{
        hookSpecificOutput: {
            hookEventName: $e,
            additionalContext: (
                "This project keeps a knowledge base of past learnings, decisions, and\n" +
                "debugging discoveries in .claude/memories/, searchable with\n" +
                "mcp__memory-loop__query.\n\n" +
                "- If your prompt contains a \"" + $m + "\" block, treat it as established\n" +
                "  ground truth. Verify it against the code, but do NOT search the KB and\n" +
                "  do NOT re-derive it.\n" +
                "- Otherwise, if you are about to read or grep more than a couple of files,\n" +
                "  issue ONE mcp__memory-loop__query for the topic of your task first — a\n" +
                "  lex line of terms you expect verbatim plus a vec line phrased as a\n" +
                "  question, and an intent saying what you want and what to avoid, with\n" +
                "  rerank:false and limit:5. One search is far cheaper than a blind\n" +
                "  file sweep. Unlike the main thread, do not try keyword variations: if\n" +
                "  nothing relevant comes back, move on to the code.\n" +
                "- Snippets are leads, not evidence — they are capped at 300 characters and\n" +
                "  often show only a title. mcp__memory-loop__get a document before relying\n" +
                "  on what it says.\n" +
                "- Report back anything the KB got wrong or left out."
            )
        }
    }'
    log_event "$(printf '{"agent_type":"%s","decision":"briefed"}' "$agent_type")"
    ;;

PreToolUse)
    phase=discovery

    # --- Skip guards, cheapest first ---

    # PreToolUse also fires for tool calls made *inside* sub-agents. Judging those
    # against the parent's markers would gate an agent for its parent's omission.
    [ -z "$agent_id" ] || {
        log_event '{"decision":"skip","skip_reason":"nested_subagent"}'
        exit 0
    }

    # code-reviewer, statusline-setup, the `claude` catch-all: usually
    # non-discovery work where a gate is pure friction.
    is_gated_agent "$agent_type" || {
        log_event "$(printf \
            '{"agent_type":"%s","decision":"skip","skip_reason":"agent_type_not_gated"}' \
            "$agent_type")"
        exit 0
    }

    resolve_paths
    # No KB to search — never nag about a knowledge base that doesn't exist.
    [ -d "$MEMORIES_DIR" ] || {
        log_event '{"decision":"skip","skip_reason":"no_memories_dir"}'
        exit 0
    }

    # --- Evaluate the two halves of the barrier ---

    # Ordering: was a KB search recorded during *this* turn? Counted rather than
    # merely tested, because the same number does double duty below as the
    # progress stamp on a denial — "how much had Claude searched when this was
    # written". A later denial carrying a different count means a search landed
    # in between.
    turn=$(current_turn)
    qseen=0
    [ -f "$QUERIES_FILE" ] && qseen=$(awk -F'\t' -v t="$turn" \
        '$1 == t { n++ } END { print n + 0 }' "$QUERIES_FILE" 2>/dev/null)
    case "$qseen" in
    '' | *[!0-9]*) qseen=0 ;;
    esac
    fresh_query=false
    [ "$qseen" -gt 0 ] && fresh_query=true

    if [ "$fresh_query" = true ] && [ "$had_kb_block" = true ]; then
        log_decision true allow
        exit 0
    fi

    # observe: recorded, but nothing is said to Claude. (off already exited above.)
    [ "$MODE" = "observe" ] && {
        log_decision false observe
        exit 0
    }

    # Name whichever half failed, so the message is actionable.
    missing=""
    [ "$fresh_query" = false ] && missing="no KB search has run since this turn began"
    [ "$had_kb_block" = false ] &&
        missing="${missing:+$missing, and }the prompt has no \"$KB_MARKER\" block"

    if [ "$MODE" = "enforce" ]; then
        # Anti-deadlock. Two budgets from one append-only file: each denial is
        # stamped with the search count at the time it was written, so counting
        # lines two ways answers two different questions. Only appends, no
        # read-modify-write — several of these can run at once when a batch of
        # spawns arrives together, and only an append is atomic.
        #
        #   denials_state — denials since the last KB search. A search changes
        #                   $qseen, which retires the old stamps and re-arms the
        #                   gate, so complying mid-turn is rewarded rather than
        #                   spending budget.
        #   denials_turn  — every denial this turn, never reset. This is the one
        #                   that guarantees termination: whatever the cause of a
        #                   loop, it stops here.
        #
        # Both keyed by phase, so a denied spawn cannot burn the budget of an
        # unrelated gate.
        denials_turn=0
        denials_state=0
        if [ -f "$DENIALS_FILE" ]; then
            # Guarded, not just `2>/dev/null`: awk on a missing file exits 2 and
            # prints nothing, leaving both counters empty — which would fail
            # *closed*, the one direction this script must never fail in.
            counts=$(awk -F'\t' -v t="$turn" -v p="$phase" -v q="$qseen" \
                '$1 == t && $2 == p { total++; if (($3 + 0) == q) same++ }
                 END { print total + 0, same + 0 }' "$DENIALS_FILE" 2>/dev/null)
            read -r denials_turn denials_state <<EOF
$counts
EOF
        fi

        # Anything unreadable is a script bug, and a script bug must not block.
        budget_unreadable=false
        case "$denials_turn" in '' | *[!0-9]*) budget_unreadable=true ;; esac
        case "$denials_state" in '' | *[!0-9]*) budget_unreadable=true ;; esac
        if [ "$budget_unreadable" = true ]; then
            log_decision false allow ',"skip_reason":"budget_unreadable"'
            exit 0
        fi

        # Tested in this order so the turn ceiling wins the reason when both are
        # spent — it is the one that makes termination unconditional.
        budget_spent=""
        [ "$denials_state" -ge "$MAX_DENIALS_PER_STATE" ] && budget_spent=budget_no_progress
        [ "$denials_turn" -ge "$MAX_DENIALS_PER_TURN" ] && budget_spent=budget_turn
        if [ -n "$budget_spent" ]; then
            log_decision false allow ',"skip_reason":"'"$budget_spent"'"'"$(budget_fields "$denials_turn" "$denials_state")"
            exit 0
        fi

        printf '%s\t%s\t%s\n' "$turn" "$phase" "$qseen" >>"$DENIALS_FILE" 2>/dev/null || true
        log_decision false deny "$(budget_fields "$((denials_turn + 1))" "$((denials_state + 1))")"

        # Phrased as a missing prerequisite plus an explicit retry instruction. A
        # bare denial reads as "the user declined" and makes Claude abandon the
        # path instead of satisfying the requirement.
        jq -nc --arg e "$event" --arg r "Prerequisite missing: $missing. Search the KB with mcp__memory-loop__query first, then re-issue this exact call with a \"$KB_MARKER\" block (1-5 bullets of findings, or \"$KB_MARKER none relevant.\") at the top of the prompt. Spawning several agents at once: write the findings to a scratchpad file and open each prompt with \"$KB_MARKER see <path>\" instead of repeating them. Sub-agents cannot see your KB results — unpasted context is rediscovered from scratch." \
            '{hookSpecificOutput:{hookEventName:$e,permissionDecision:"deny",permissionDecisionReason:$r}}'
        exit 0
    fi

    # warn: advise without blocking. No permissionDecision field — returning
    # "allow" would bypass the normal permission flow.
    log_decision false warn
    jq -nc --arg e "$event" --arg m "KB protocol: $missing. Sub-agents cannot see your KB results, so this agent will rediscover from scratch. Before the next spawn, search the KB and open the prompt with a \"$KB_MARKER\" block." \
        '{hookSpecificOutput:{hookEventName:$e,additionalContext:$m}}'
    ;;
esac

exit 0

#!/bin/bash

# Hook: keep KB lookups ahead of delegated discovery.
#
# One dispatcher registered on four events, branching on `hook_event_name`:
#   UserPromptSubmit  → stamp the turn boundary (resets the barrier each prompt)
#   PostToolUse       → record a successful search_docs query
#   PreToolUse        → judge a sub-agent spawn, and warn or block
#   SubagentStart     → tell a discovery sub-agent the KB exists
#
# Design rules, deliberate and load-bearing:
#   - FAIL OPEN. Any unexpected state exits 0 with no output. A broken gate must
#     never stop work.
#   - NEVER exit 2. That blocks unconditionally, turning a script bug into a hard
#     gate with no escape. This is also why `set -u`/`set -e` are omitted: an
#     unset variable should fall through to a silent allow, not abort mid-branch.
#   - NEVER call docs-mcp-server here. That CLI takes seconds; PreToolUse runs
#     before every sub-agent spawn. File stats only.
#   - Log every evaluation. Comparing log line count against the spawn count in a
#     session transcript is the only way to catch a matcher that matches nothing.

MODE="__KB_GATE_MODE__"

# The prompt marker is a wire protocol shared with the `KB context:` contract in
# the CLAUDE.local.md template. Single definition: it is both the string the
# messages below instruct Claude to write, and the string tested for.
KB_MARKER="KB context:"

# Single source of truth for "which agents do discovery". The SubagentStart and
# PreToolUse registrations both match broadly and let this list decide, so adding
# an agent type is a one-line change here.
GATED_AGENTS="Explore general-purpose Plan"

command -v jq >/dev/null 2>&1 || exit 0

payload=$(</dev/stdin)
[ -n "$payload" ] || exit 0

# Every field any branch needs, in ONE jq call. PreToolUse runs before each spawn,
# so process count dominates; the prompt is reduced to a boolean inside jq rather
# than round-tripping through the shell. `contains` not `test` — the marker is a
# literal, not a regex.
#
# One field per LINE, read with one `read` each — deliberately not `@tsv` with a
# single tab-split read. Tab is an IFS *whitespace* character, so bash collapses
# runs of them: an empty field (`agent_id` is empty on main-thread calls) would
# silently shift every later field left. None of these values can contain a
# newline, so line-per-field is unambiguous.
fields=$(printf '%s' "$payload" | jq -r --arg m "$KB_MARKER" '[
    .hook_event_name // "",
    .session_id // "unknown",
    .agent_id // "",
    (.tool_input.subagent_type // .agent_type // ""),
    (if (.tool_input.prompt // "") | contains($m) then "true" else "false" end)
] | .[]' 2>/dev/null)
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

# Paths are resolved on demand: the skip guards below need none of them, and
# `git rev-parse` is the most expensive call in the script.
resolve_paths() {
    [ -n "$project_root" ] && return 0
    project_root=$(git rev-parse --show-toplevel 2>/dev/null)
    [ -n "$project_root" ] || project_root="${CLAUDE_PROJECT_DIR:-$PWD}"
    # Matches sync-memories.sh's derivation, so the library name quoted back to
    # Claude is the one that was actually indexed.
    library="${project_root##*/}"
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

# Logging is unconditional and mode-independent: a mode change must never leave a
# gap in the data. `$1` is a pre-built JSON object of extra fields.
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
# $1=satisfied $2=decision $3=optional trailing pairs, e.g. ',"attempt":2'
log_decision() {
    log_event "$(printf \
        '{"phase":"%s","agent_type":"%s","fresh_query":%s,"had_kb_block":%s,"satisfied":%s,"decision":"%s"%s}' \
        "$phase" "$agent_type" "$fresh_query" "$had_kb_block" "$1" "$2" "$3")"
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
    : >"$DENIALS_FILE" 2>/dev/null || true
    turn=$(( $(current_turn) + 1 ))
    echo "$turn" >"$TURN_FILE" 2>/dev/null || true
    log_event "$(printf '{"decision":"turn_start","turn":%s}' "$turn")"
    ;;

PostToolUse)
    # A KB search landed. Store the query text (not just the turn) so the barrier
    # can become topical later without a state migration.
    query=$(printf '%s' "$payload" | jq -r '.tool_input.query // ""' 2>/dev/null)
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
    [ "$MODE" = "off" ] && exit 0
    is_gated_agent "$agent_type" || exit 0
    resolve_paths
    [ -d "$MEMORIES_DIR" ] || exit 0

    # Cost is bounded on purpose: skip the search entirely when the prompt already
    # carries findings, and spend at most one query otherwise. SubagentStart input
    # does not include the prompt, so the agent has to make that call itself.
    jq -nc --arg e "$event" --arg m "$KB_MARKER" --arg lib "$library" '{
        hookSpecificOutput: {
            hookEventName: $e,
            additionalContext: (
                "This project keeps a knowledge base of past learnings, decisions, and\n" +
                "debugging discoveries in .claude/memories/, searchable with\n" +
                "mcp__docs-mcp-server__search_docs using library=\"" + $lib + "\".\n\n" +
                "- If your prompt contains a \"" + $m + "\" block, treat it as established\n" +
                "  ground truth. Verify it against the code, but do NOT search the KB and\n" +
                "  do NOT re-derive it.\n" +
                "- Otherwise, if you are about to read or grep more than a couple of files,\n" +
                "  issue ONE search_docs query for the topic of your task first — one search\n" +
                "  is far cheaper than a blind file sweep. Unlike the main thread, do not try\n" +
                "  keyword variations: if nothing relevant comes back, move on to the code.\n" +
                "- Report back anything the KB got wrong or left out."
            )
        }
    }'
    log_event "$(printf '{"agent_type":"%s","decision":"briefed"}' "$agent_type")"
    ;;

PreToolUse)
    phase=discovery

    # --- Fail-open guards. All use already-parsed fields, so they cost nothing ---

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

    # Ordering: was a KB search recorded during *this* turn?
    turn=$(current_turn)
    fresh_query=false
    if [ -f "$QUERIES_FILE" ] && awk -F'\t' -v t="$turn" \
        '$1 == t { found = 1 } END { exit !found }' "$QUERIES_FILE" 2>/dev/null; then
        fresh_query=true
    fi

    if [ "$fresh_query" = true ] && [ "$had_kb_block" = true ]; then
        log_decision true allow
        exit 0
    fi

    case "$MODE" in
    off | observe)
        # Recorded, but nothing is said to Claude.
        log_decision false "$MODE"
        exit 0
        ;;
    esac

    # Name whichever half failed, so the message is actionable.
    missing=""
    [ "$fresh_query" = false ] && missing="no search_docs call has run since this turn began"
    [ "$had_kb_block" = false ] &&
        missing="${missing:+$missing, and }the prompt has no \"$KB_MARKER\" block"

    if [ "$MODE" = "enforce" ]; then
        # Anti-deadlock: allow through on the second denial of this phase in this
        # turn. Whatever the cause — an unsatisfiable condition, a rephrasing
        # loop, a bug — the worst case is one wasted call, never a hang. Keyed by
        # phase so a denied spawn cannot burn the budget for an unrelated gate.
        attempt=$(( $(awk -F'\t' -v t="$turn" -v p="$phase" \
            '$1 == t && $2 == p { n++ } END { print n + 0 }' \
            "$DENIALS_FILE" 2>/dev/null || echo 0) + 1 ))
        if [ "$attempt" -ge 2 ]; then
            log_decision false allow ',"skip_reason":"attempt_limit","attempt":'"$attempt"
            exit 0
        fi
        printf '%s\t%s\n' "$turn" "$phase" >>"$DENIALS_FILE" 2>/dev/null || true
        log_decision false deny ',"attempt":'"$attempt"

        # Phrased as a missing prerequisite plus an explicit retry instruction. A
        # bare denial reads as "the user declined" and makes Claude abandon the
        # path instead of satisfying the requirement.
        jq -nc --arg e "$event" --arg r "Prerequisite missing: $missing. Call search_docs(library=\"$library\", query=\"<your topic>\") first, then re-issue this exact call with a \"$KB_MARKER\" block (1-5 bullets of findings, or \"$KB_MARKER none relevant.\") at the top of the prompt. Sub-agents cannot see your KB results — unpasted context is rediscovered from scratch." \
            '{hookSpecificOutput:{hookEventName:$e,permissionDecision:"deny",permissionDecisionReason:$r}}'
        exit 0
    fi

    # warn: advise without blocking. No permissionDecision field — returning
    # "allow" would bypass the normal permission flow.
    log_decision false warn
    jq -nc --arg e "$event" --arg m "KB protocol: $missing. Sub-agents cannot see your KB results, so this agent will rediscover from scratch. Before the next spawn, search the KB (library=\"$library\") and open the prompt with a \"$KB_MARKER\" block." \
        '{hookSpecificOutput:{hookEventName:$e,additionalContext:$m}}'
    ;;
esac

exit 0

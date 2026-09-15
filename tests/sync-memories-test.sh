#!/bin/bash
#
# Tests for plugins/memory-loop/runtime/sync-memories.sh.
#
# qmd is stubbed on PATH, so the suite asserts what the hook decides to do rather
# than what qmd does with it — no model, no index, fast in CI.
#
# Three setup details are load-bearing:
#   - Everything runs from a temp dir OUTSIDE any git repo. The hook resolves its
#     project root with `git rev-parse --show-toplevel` first.
#   - The stub creates $INDEX_PATH on `update`. The staleness gate this suite
#     guards against was itself guarded by `[ -f "$INDEX_PATH" ]`, so against a
#     stub that never creates the file the old hook reindexes anyway and the
#     symlink case passes for the wrong reason.
#   - The discriminating assertion is the SECOND run. A first run always
#     reindexes, old code included, because the config file does not exist yet.

set -uo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
src="${SYNC_SOURCE:-$repo_root/plugins/memory-loop/runtime/sync-memories.sh}"
index_rel=".claude/.kb-index"
[ "${MEMORY_LOOP_HOST:-claude}" = codex ] && index_rel=".codex/.memory-loop/index"
[ -f "$src" ] || {
    echo "FATAL: $src not found"
    exit 1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

pass=0
fail=0
calls=0
last_exit=0

ok() {
    pass=$((pass + 1))
    printf '  ok   %s\n' "$1"
}

bad() {
    fail=$((fail + 1))
    printf '  FAIL %s\n       %s\n' "$1" "$2"
}

group() { printf '\n== %s\n' "$1"; }

# --- qmd stub -------------------------------------------------------------

stub="$work/bin"
mkdir -p "$stub"
export XDG_CACHE_HOME="$work/cache"
mkdir -p "$XDG_CACHE_HOME/qmd/models"
: >"$XDG_CACHE_HOME/qmd/models/hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf"
cat >"$stub/qmd" <<'STUB'
#!/bin/bash
[ "${1:-}" = --version ] && { echo 'qmd 2.8.3'; exit 0; }
printf '%s\n' "$*" >>"$STUB_LOG"
case " $* " in
*" update "*)
    [ "${STUB_MODE:-ok}" = update_fails ] && {
        echo "update exploded" >&2
        exit 1
    }
    [ -n "${INDEX_PATH:-}" ] && : >>"$INDEX_PATH"
    echo "All collections updated."
    ;;
*" embed "*)
    echo "All content hashes already have embeddings."
    ;;
*" status "*)
    [ "${STUB_MODE:-ok}" = status_fails ] && { echo 'status exploded' >&2; exit 1; }
    [ "${STUB_MODE:-ok}" = status_empty ] && exit 0
    [ "${STUB_MODE:-ok}" = status_unknown ] && { echo 'Unknown status format'; exit 0; }
    echo "  Total:    2 files indexed"
    [ "${STUB_MODE:-ok}" = pending ] &&
        echo "  Pending:  3 need embedding (run 'qmd embed')"
    ;;
*" cleanup "*)
    [ "${STUB_MODE:-ok}" = cleanup_fails ] && exit 1
    ;;
esac
exit 0
STUB
chmod +x "$stub/qmd"

# --- fixtures -------------------------------------------------------------

# A real directory, and a symlink into a sibling checkout — the shape the
# shared-memories pack installs.
plain="$work/plain"
mkdir -p "$plain/.claude/memories"
printf '# One\n' >"$plain/.claude/memories/one.md"

link="$work/link"
mkdir -p "$link/.claude/.memories-repo/memories"
printf '# Two\n' >"$link/.claude/.memories-repo/memories/two.md"
ln -s ".memories-repo/memories" "$link/.claude/memories"

nomem="$work/nomem"
mkdir -p "$nomem/.claude"

# --- invocation -----------------------------------------------------------

# run <project-dir> [stub-mode]
run() {
    : >"$work/stub.log"
    (
        cd "$1" || exit 1
        printf '{}' | env -u CLAUDE_PROJECT_DIR \
            PATH="$stub:$PATH" STUB_LOG="$work/stub.log" STUB_MODE="${2:-ok}" \
            bash "$src"
    )
    last_exit=$?
    calls=$((calls + $(grep -c . "$work/stub.log")))
}

stub_log() { cat "$work/stub.log"; }

# --- assertions -----------------------------------------------------------

assert_contains() { # <label> <haystack> <needle>
    case "$2" in
    *"$3"*) ok "$1" ;;
    *) bad "$1" "expected to contain '$3', got: ${2:-<empty>}" ;;
    esac
}

assert_not_contains() { # <label> <haystack> <needle>
    case "$2" in
    *"$3"*) bad "$1" "expected NOT to contain '$3', got: $2" ;;
    *) ok "$1" ;;
    esac
}

assert_missing() { # <label> <path>
    [ -e "$2" ] && bad "$1" "$2 exists" || ok "$1"
}

assert_exists() { # <label> <path>
    [ -e "$2" ] && ok "$1" || bad "$1" "$2 is missing"
}

assert_silent() { # <label> <text>
    [ -z "$2" ] && ok "$1" || bad "$1" "expected no output, got: $2"
}

# ==========================================================================

group "a real memories directory reindexes"
run "$plain"
assert_contains "first run calls update" "$(stub_log)" "update"
assert_contains "first run calls embed" "$(stub_log)" "embed"

# The config is unchanged from here on, which is exactly when the removed
# staleness gate used to skip.
run "$plain"
assert_contains "second run still calls update" "$(stub_log)" "update"
assert_contains "second run still calls embed" "$(stub_log)" "embed"

group "a symlinked memories directory reindexes"
run "$link"
assert_contains "first run calls update" "$(stub_log)" "update"

# The regression guard. `find` does not descend a symlinked root, so a
# `find -newer` gate reports "nothing changed" here forever.
run "$link"
assert_contains "second run still calls update" "$(stub_log)" "update"
assert_contains "second run still calls embed" "$(stub_log)" "embed"

group "config records the literal path, not the symlink target"
assert_contains "collection path is the symlink" \
    "$(cat "$link/$index_rel/memory-loop.yml")" "$link/.claude/memories"

group "no memories directory is a no-op"
run "$nomem"
assert_silent "qmd is never called" "$(stub_log)"
assert_missing "no index directory is populated" "$nomem/$index_rel/memory-loop.sqlite"

group "failures leave the reason on disk"
run "$plain" update_fails
assert_exists "a failed update keeps the log" "$plain/$index_rel/memory-loop.log"
assert_not_contains "and stops before cleanup" "$(stub_log)" "cleanup"

run "$plain" pending
assert_contains "unembedded documents keep the log" \
    "$(cat "$plain/$index_rel/memory-loop.log")" "still need embedding"
assert_not_contains "and stops before cleanup" "$(stub_log)" "cleanup"

group "a clean run leaves nothing behind"
run "$plain"
assert_missing "the failure log is cleared" "$plain/$index_rel/memory-loop.log"
assert_missing "the lock is released" "$plain/$index_rel/.reindex.lock"
assert_contains "orphaned chunks are cleaned up" "$(stub_log)" "cleanup"

# Housekeeping must never turn into an indexing failure.
run "$plain" cleanup_fails
assert_missing "a failed cleanup writes no failure log" "$plain/$index_rel/memory-loop.log"
[ "$last_exit" -eq 0 ] && ok "a failed cleanup still exits 0" ||
    bad "a failed cleanup still exits 0" "hook exited $last_exit"

group "failed or unrecognized status never reports healthy"
for mode in status_fails status_empty status_unknown; do
    run "$plain" "$mode"
    assert_exists "$mode retains diagnostics" "$plain/$index_rel/memory-loop.log"
    assert_not_contains "$mode skips cleanup" "$(stub_log)" "cleanup"
done

group "configuration publication is safe under overlap"
# Block cmp until all writers reach it. The old shared .new file then gets
# renamed out from under other writers; unique temporary files all survive.
real_cmp=$(command -v cmp)
real_mv=$(command -v mv)
rm "$nomem/$index_rel/memory-loop.yml"
cat >"$stub/cmp" <<'CMP'
#!/bin/bash
: >"$RACE_BARRIER/$$"
leader=false
mkdir "$RACE_BARRIER/leader" 2>/dev/null && leader=true
while [ "$(find "$RACE_BARRIER" -type f | wc -l | tr -d ' ')" -lt 8 ]; do sleep 0.02; done
if [ "$leader" = false ]; then
    while [ ! -f "$RACE_RELEASE" ]; do sleep 0.02; done
fi
[ -f "$2" ] || { echo missing >>"$RACE_ERRORS"; }
exec "$REAL_CMP" "$@"
CMP
cat >"$stub/mv" <<'MV'
#!/bin/bash
"$REAL_MV" "$@"
result=$?
: >"$RACE_RELEASE"
exit "$result"
MV
chmod +x "$stub/cmp" "$stub/mv"
mkdir -p "$work/barrier"
for i in 1 2 3 4 5 6 7 8; do
    (cd "$nomem" && printf '{}' | env PATH="$stub:$PATH" REAL_CMP="$real_cmp" \
       RACE_BARRIER="$work/barrier" RACE_ERRORS="$work/race-errors" REAL_MV="$real_mv" RACE_RELEASE="$work/released" \
       bash "$src" --configure-only) &
done
wait
assert_missing "every writer owns its temporary config" "$work/race-errors"
assert_exists "complete config is published" "$nomem/$index_rel/memory-loop.yml"
rm "$stub/cmp" "$stub/mv"

# ==========================================================================

printf '\n%s\n' "-----------------------------------------"
if [ "$calls" -eq 0 ]; then
    printf 'FAIL: qmd was never invoked — the fixtures are not exercising the\n'
    printf '      hook, so every assertion above passed vacuously.\n'
    exit 1
fi
printf '%d passed, %d failed (%d stub invocations)\n' "$pass" "$fail" "$calls"
[ "$fail" -eq 0 ] || exit 1

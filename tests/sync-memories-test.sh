#!/bin/bash
#
# Tests for hooks/sync-memories.sh.
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
src="$repo_root/hooks/sync-memories.sh"
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
cat >"$stub/qmd" <<'STUB'
#!/bin/bash
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
    "$(cat "$link/.claude/.kb-index/memory-loop.yml")" "$link/.claude/memories"

group "no memories directory is a no-op"
run "$nomem"
assert_silent "qmd is never called" "$(stub_log)"
assert_missing "no index directory is populated" "$nomem/.claude/.kb-index/memory-loop.sqlite"

group "failures leave the reason on disk"
run "$plain" update_fails
assert_exists "a failed update keeps the log" "$plain/.claude/.kb-index/memory-loop.log"
assert_not_contains "and stops before cleanup" "$(stub_log)" "cleanup"

run "$plain" pending
assert_contains "unembedded documents keep the log" \
    "$(cat "$plain/.claude/.kb-index/memory-loop.log")" "still need embedding"
assert_not_contains "and stops before cleanup" "$(stub_log)" "cleanup"

group "a clean run leaves nothing behind"
run "$plain"
assert_missing "the failure log is cleared" "$plain/.claude/.kb-index/memory-loop.log"
assert_missing "the lock is released" "$plain/.claude/.kb-index/.reindex.lock"
assert_contains "orphaned chunks are cleaned up" "$(stub_log)" "cleanup"

# Housekeeping must never turn into an indexing failure.
run "$plain" cleanup_fails
assert_missing "a failed cleanup writes no failure log" "$plain/.claude/.kb-index/memory-loop.log"
[ "$last_exit" -eq 0 ] && ok "a failed cleanup still exits 0" ||
    bad "a failed cleanup still exits 0" "hook exited $last_exit"

# ==========================================================================

printf '\n%s\n' "-----------------------------------------"
if [ "$calls" -eq 0 ]; then
    printf 'FAIL: qmd was never invoked — the fixtures are not exercising the\n'
    printf '      hook, so every assertion above passed vacuously.\n'
    exit 1
fi
printf '%d passed, %d failed (%d stub invocations)\n' "$pass" "$fail" "$calls"
[ "$fail" -eq 0 ] || exit 1

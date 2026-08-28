#!/bin/bash
#
# Tests for checks/embedding-runtime.sh.
#
# The check answers one question — "is an embedding runtime available at all?" —
# by OR-ing two conditions: an OpenAI-compatible endpoint responding, or an
# `ollama` binary on PATH. mcs uses it two ways at once, which is why both arms
# matter: as a doctor line, and (via `isAlreadyInstalled`, which skips a `shell:`
# install when ANY doctorCheck passes) as the gate on the Ollama installer.
#
# Two setup details are load-bearing, not incidental:
#   - `curl` and `ollama` are stubbed through a PATH shim, so no test touches the
#     network or the developer's real Ollama. A run that reached a live endpoint
#     would pass or fail based on the machine rather than the code.
#   - The arm tally at the end is derived from the message the script printed,
#     never incremented straight-line. That is the whole point of it: if the shim
#     ever failed to take effect and real `curl` answered a live Ollama, the
#     "endpoint down" group would still exit 0 and its assertion would still
#     pass — but via the wrong arm. Counting what the script actually said is
#     what turns that into a loud failure instead of a vacuous green.

set -uo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
src="$repo_root/checks/embedding-runtime.sh"
[ -f "$src" ] || {
    echo "FATAL: $src not found"
    exit 1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

shim="$work/bin"
mkdir -p "$shim"

pass=0
fail=0
endpoint_arm=0 # times the endpoint arm decided the outcome
binary_arm=0   # times the fallback binary arm decided it

ok() {
    pass=$((pass + 1))
    printf '  ok   %s\n' "$1"
}

bad() {
    fail=$((fail + 1))
    printf '  FAIL %s\n' "$1"
}

group() {
    printf '\n%s\n' "$1"
}

# Stub curl. $1: the exit code it should return. The script branches only on
# success vs failure, never on the specific code, so one failure value is enough
# to cover them all — 7 (connection refused) stands in for 22 (`-f` on 4xx/5xx).
stub_curl() {
    cat >"$shim/curl" <<STUB
#!/bin/bash
exit $1
STUB
    chmod +x "$shim/curl"
}

# Present or hide an `ollama` binary on PATH.
stub_ollama() {
    if [ "$1" = present ]; then
        printf '#!/bin/bash\nexit 0\n' >"$shim/ollama"
        chmod +x "$shim/ollama"
    else
        rm -f "$shim/ollama"
    fi
}

# Run with ONLY the shim plus the minimum real tools on PATH, so a stray system
# `ollama` cannot satisfy the fallback arm by accident.
run_check() {
    PATH="$shim:/usr/bin:/bin" bash "$src" 2>&1
    return $?
}

# Credit whichever arm the script says it took. Never called unconditionally.
record_arm() {
    case "$1" in
    *"responding at"*) endpoint_arm=$((endpoint_arm + 1)) ;;
    *"not currently serving"*) binary_arm=$((binary_arm + 1)) ;;
    esac
}

assert_exit() {
    local label=$1 expected=$2 actual=$3
    if [ "$actual" -eq "$expected" ]; then
        ok "$label (exit $actual)"
    else
        bad "$label — expected exit $expected, got $actual"
    fi
}

assert_says() {
    local label=$1 needle=$2 haystack=$3
    case "$haystack" in
    *"$needle"*) ok "$label" ;;
    *) bad "$label — output did not mention '$needle': $haystack" ;;
    esac
}

# ==========================================================================
group "endpoint responding — passes regardless of who serves it"

stub_curl 0
stub_ollama absent # nothing Ollama-ish anywhere
out=$(run_check)
rc=$?
record_arm "$out"
assert_exit "a reachable endpoint with no Ollama installed still passes" 0 "$rc"
assert_says "wording stays provider-neutral" "OpenAI-compatible" "$out"

# ==========================================================================
group "endpoint down, Ollama installed — the installed-but-stopped case"

stub_curl 7
stub_ollama present
out=$(run_check)
rc=$?
record_arm "$out"
assert_exit "a stopped Ollama does not re-trigger the installer" 0 "$rc"
assert_says "says why it passed" "not currently serving" "$out"

# ==========================================================================
group "endpoint down, nothing installed — the only failing case"

stub_curl 7
stub_ollama absent
out=$(run_check)
rc=$?
record_arm "$out"
assert_exit "no runtime at all fails" 1 "$rc"
assert_says "reports what it probed" "no embedding runtime found" "$out"
assert_says "probes the pack-wide endpoint" "localhost:11434" "$out"

# ==========================================================================

printf '\n%s\n' "-----------------------------------------"
if [ "$endpoint_arm" -eq 0 ] || [ "$binary_arm" -eq 0 ]; then
    printf 'FAIL: one arm never decided an outcome (endpoint=%d, binary=%d).\n' \
        "$endpoint_arm" "$binary_arm"
    printf '      The OR is not being exercised — suspect the PATH shim.\n'
    exit 1
fi
printf '%d passed, %d failed (both arms exercised)\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1

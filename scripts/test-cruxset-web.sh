#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=cruxset-web
source "$PROJECT_ROOT/scripts/cruxset-web"

failures=0

assert_eq() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "$expected" != "$actual" ]]; then
    printf 'FAIL: %s\nexpected: %s\nactual: %s\n' "$label" "$expected" "$actual" >&2
    failures=$((failures + 1))
  fi
}

assert_status() {
  local expected="$1"
  local label="$2"
  shift 2
  set +e
  "$@" >/dev/null 2>&1
  local actual=$?
  set -e
  assert_eq "$expected" "$actual" "$label"
}

parse_args start --setup
assert_eq "start" "$ACTION" "parses start"
assert_eq "1" "$WITH_SETUP" "enables setup"
parse_args status
assert_eq "status" "$ACTION" "parses status"
assert_eq "0" "$WITH_SETUP" "leaves setup disabled"
assert_status 2 "rejects setup for stop" parse_args stop --setup
assert_status 2 "rejects unknown action" parse_args destroy

assert_eq "https://pink-sunset.trycloudflare.com" \
  "$(printf '%s\n' 'INF https://pink-sunset.trycloudflare.com ready' | extract_tunnel_url)" \
  "extracts Quick Tunnel URL"
assert_eq "" "$(printf '%s\n' 'tunnel is connecting' | extract_tunnel_url)" "does not invent URL"
assert_eq $'SESSION_SECRET\nCRUXSET_SEGMENTATION_PUBLISH_KEY\nCRUXSET_SEGMENTATION_PUBLISH_OWNER_ID' \
  "$(required_env_keys)" "declares prompted environment keys"

if (( failures )); then
  exit 1
fi

printf 'PASS: cruxset-web tests\n'

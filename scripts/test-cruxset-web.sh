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

parse_args start
assert_eq "start" "$ACTION" "parses start"
parse_args status
assert_eq "status" "$ACTION" "parses status"
assert_status 2 "rejects deprecated setup flag" parse_args start --setup
assert_status 2 "rejects unknown action" parse_args destroy

assert_eq "https://pink-sunset.trycloudflare.com" \
  "$(printf '%s\n' 'INF https://pink-sunset.trycloudflare.com ready' | extract_tunnel_url)" \
  "extracts Quick Tunnel URL"
assert_eq "" "$(printf '%s\n' 'tunnel is connecting' | extract_tunnel_url)" "does not invent URL"
assert_eq $'SESSION_SECRET\nCRUXSET_SEGMENTATION_PUBLISH_KEY\nCRUXSET_SEGMENTATION_PUBLISH_OWNER_ID' \
  "$(required_env_keys)" "declares prompted environment keys"
assert_status 0 "does not enable services during setup" \
  grep -q 'systemctl disable caddy cruxset-api cruxset-quick-tunnel' "$PROJECT_ROOT/scripts/cruxset-web"

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
ENV_FILE="$temp_dir/cruxset.env"
printf 'SESSION_SECRET=present\n' > "$ENV_FILE"
assert_status 0 "reads non-system environment file" env_has_value SESSION_SECRET

curl_attempts=0
curl() {
  curl_attempts=$((curl_attempts + 1))
  if (( curl_attempts < 3 )); then
    printf 'temporary connection failure\n' >&2
    return 7
  fi
}
sleep() { :; }
wait_for_api 2>"$temp_dir/health-retry.err"
assert_eq "3" "$curl_attempts" "retries API health check until it succeeds"
assert_eq "" "$(<"$temp_dir/health-retry.err")" "keeps transient health-check failures quiet"

PUBLISH_REPO="$temp_dir/cruxset-live-url"
git init --quiet "$PUBLISH_REPO"
git -C "$PUBLISH_REPO" config user.name "CruxSet test"
git -C "$PUBLISH_REPO" config user.email "test@example.invalid"
printf '{"url":"","updatedAt":null}\n' > "$PUBLISH_REPO/latest.json"
git -C "$PUBLISH_REPO" add latest.json
git -C "$PUBLISH_REPO" commit --quiet -m "initial state"
LIVE_URL_REPO="$PUBLISH_REPO"
assert_status 0 "publishes latest URL to separate repository" \
  publish_tunnel_url "https://pink-sunset.trycloudflare.com"
assert_eq 'https://pink-sunset.trycloudflare.com' \
  "$(sed -n 's/.*\"url\": \"\([^\"]*\)\".*/\1/p' "$PUBLISH_REPO/latest.json")" \
  "writes latest URL"
LIVE_URL_REPO="$temp_dir/absent-live-url-repository"
assert_status 0 "skips missing separate repository" \
  publish_tunnel_url "https://pink-sunset.trycloudflare.com"

if (( failures )); then
  exit 1
fi

printf 'PASS: cruxset-web tests\n'

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/cruxset-dev"
failures=0
assert_eq() { [[ "$1" == "$2" ]] || { echo "FAIL: $3" >&2; failures=$((failures+1)); }; }
parse_args start; assert_eq start "$ACTION" start
parse_args status; assert_eq status "$ACTION" status
assert_eq 'local-only-long-random-secret' "$PUBLISH_KEY" key
assert_eq 'usr_web_lgjUPpx-3eu-s1_r' "$PUBLISH_OWNER_ID" owner
assert_eq 'https://cloud1-d0g8toggn7735e61e-1475845516.ap-shanghai.app.tcloudbase.com/api/storage-upload' "$CLOUDBASE_STORAGE_URL" cloudbase-storage-url
assert_eq 'https://cloud1-d0g8toggn7735e61e-1475845516.ap-shanghai.app.tcloudbase.com/api/segmentation-publish' "$CLOUDBASE_FUNCTION_URL" cloudbase-function-url
env_file="$(mktemp)"
printf '%s\n' 'CRUXSET_CLOUDBASE_SIGNING_KEY=file-secret' 'CRUXSET_CLOUDBASE_OWNER_OPENID=file-owner' > "$env_file"
ENV_FILE="$env_file"
unset CRUXSET_CLOUDBASE_SIGNING_KEY CRUXSET_CLOUDBASE_OWNER_OPENID
load_cloudbase_env
assert_eq file-secret "$CRUXSET_CLOUDBASE_SIGNING_KEY" env-file-signing-key
assert_eq file-owner "$CRUXSET_CLOUDBASE_OWNER_OPENID" env-file-owner
rm -f "$env_file"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
RUNTIME_DIR="$tmp"; mkdir -p "$RUNTIME_DIR"; echo 999999 > "$(pid_file api)"
cleanup_stale_pid api; [[ ! -e "$(pid_file api)" ]] || failures=$((failures+1))
((failures==0)) && echo 'PASS: cruxset-dev tests'

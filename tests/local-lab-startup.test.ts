import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('starts the local API, Web and lab without optional CloudBase configuration', () => {
  const output = execFileSync('bash', ['-c', 'source scripts/cruxset-dev; RUNTIME_DIR="$(mktemp -d)"; trap \'rm -rf "$RUNTIME_DIR"\' EXIT; start_one() { echo "$1"; }; wait_port() { return 0; }; status_services() { :; }; start_services'], {encoding:'utf8',env:{...process.env,ENV_FILE:'/tmp/cruxset-nonexistent-env',CRUXSET_CLOUDBASE_STORAGE_URL:'',CRUXSET_CLOUDBASE_FUNCTION_URL:''}})
  expect(output.trim().split('\n')).toEqual(['api','web','lab'])
})
it('routes local Caddy lab paths ahead of the main API while denying public tunnel access', () => {
  const config = execFileSync('bash',['-c','source scripts/cruxset-web; render_caddy'],{encoding:'utf8'})
  expect(config).toContain('host localhost 127.0.0.1')
  expect(config).not.toContain('uri path_regexp ^/api/v1/segmentation-lab /api')
  expect(config).not.toContain('reverse_proxy 127.0.0.1:8765')
  expect(config).toContain('reverse_proxy 127.0.0.1:8000')
  expect(config.indexOf('handle @localLabApi')).toBeLessThan(config.indexOf('handle /api/*'))
  expect(config).toContain('handle @blockedLab')
  expect(config).toContain('respond "Not found" 404')
})

it('generates private persistent local auth keys instead of using known development defaults', () => {
  const output = execFileSync('bash', ['-c', 'source scripts/cruxset-dev; RUNTIME_DIR="$(mktemp -d)"; trap \'rm -rf "$RUNTIME_DIR"\' EXIT; unset SESSION_SECRET CRUXSET_LAB_INTERNAL_KEY CRUXSET_SEGMENTATION_PUBLISH_KEY; load_local_auth_env; first="$CRUXSET_LAB_INTERNAL_KEY"; first_session="$SESSION_SECRET"; first_publish="$CRUXSET_SEGMENTATION_PUBLISH_KEY"; unset SESSION_SECRET CRUXSET_LAB_INTERNAL_KEY CRUXSET_SEGMENTATION_PUBLISH_KEY; load_local_auth_env; [[ "$first" == "$CRUXSET_LAB_INTERNAL_KEY" && "$first_session" == "$SESSION_SECRET" && ${#first} -ge 40 && "$first_publish" == "$CRUXSET_SEGMENTATION_PUBLISH_KEY" && ${#first_publish} -ge 40 && "$first_publish" != "local-only-long-random-secret" && "$first" != "$SESSION_SECRET" ]]; stat -c "%a" "$RUNTIME_DIR/lab-internal.key" "$RUNTIME_DIR/session.key" "$RUNTIME_DIR/publish.key"'], {encoding:'utf8',env:{...process.env,ENV_FILE:'/tmp/cruxset-nonexistent-env'}})
  expect(output.trim().split('\n')).toEqual(['600','600','600'])
})

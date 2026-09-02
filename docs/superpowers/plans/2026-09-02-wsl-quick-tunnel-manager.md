# WSL Quick Tunnel Manager Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Provide one WSL command that configures and manages the local CruxSet web workspace with a Cloudflare Quick Tunnel.

**Architecture:** A Bash script separates pure command parsing and URL extraction helpers from privileged setup and lifecycle functions. Setup generates Caddy and systemd configuration, preserves existing values in the environment file, and builds web assets. Lifecycle commands manage three services and read the current temporary address from the journal.

**Tech Stack:** Bash, systemd, Caddy, cloudflared, uv/Uvicorn, npm/Vite, dependency-free Bash tests.

---

## Files

- Create scripts/cruxset-web: setup and lifecycle command dispatcher.
- Create scripts/test-cruxset-web.sh: helper and lifecycle tests.
- Modify docs/wsl-cloudflare-tunnel.md: one-command installation and operation guide.

### Task 1: Command contract

**Files:**
- Create scripts/cruxset-web
- Create scripts/test-cruxset-web.sh

- [ ] Step 1: Write a failing test that sources the script and verifies parse_args accepts start, restart, stop, status; accepts --setup only for start/restart; returns status 2 for invalid input; and extract_tunnel_url returns https://pink-sunset.trycloudflare.com from text that contains that URL.

- [ ] Step 2: Run bash scripts/test-cruxset-web.sh. Expected: failure because scripts/cruxset-web does not exist.

- [ ] Step 3: Create the executable script with ACTION and WITH_SETUP globals, usage, parse_args, required_env_keys, and extract_tunnel_url. required_env_keys outputs SESSION_SECRET, CRUXSET_SEGMENTATION_PUBLISH_KEY, and CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID, one per line. extract_tunnel_url uses grep to return only the last URL matching https://[-a-z0-9]+.trycloudflare.com. Keep runtime execution behind a BASH_SOURCE guard so the tests can source the helpers.

- [ ] Step 4: Run chmod +x scripts/cruxset-web scripts/test-cruxset-web.sh and bash scripts/test-cruxset-web.sh. Expected: all assertions pass.

- [ ] Step 5: Commit.

    git add scripts/cruxset-web scripts/test-cruxset-web.sh
    git commit -m "test: define WSL web manager command contract"

### Task 2: Safe setup

**Files:**
- Modify scripts/cruxset-web
- Modify scripts/test-cruxset-web.sh

- [ ] Step 1: Write a failing test using a temporary ENV_FILE containing SESSION_SECRET=keep-me and an unrelated entry. Invoke ensure_env_file with input only for missing publish key and owner ID. Assert the existing secret and unrelated entry remain unchanged, missing keys are added, and SESSION_COOKIE_SECURE=true exists.

- [ ] Step 2: Run bash scripts/test-cruxset-web.sh. Expected: failure because ensure_env_file is not defined.

- [ ] Step 3: Implement ensure_env_file. Default ENV_FILE to /etc/cruxset.env. Create a missing real file using sudo install -o root -g root -m 600 /dev/null /etc/cruxset.env. For each required key, preserve a nonempty existing KEY=value; otherwise prompt with hidden read -rsp for SESSION_SECRET and normal read -rp for the other two values, rejecting blank input. Preserve all unrelated lines. Add or replace only SESSION_COOKIE_SECURE=true using a temporary file installed as root mode 600. Never print the environment file.

- [ ] Step 4: Implement setup_workspace. Require systemctl, sudo, uv, cloudflared, caddy, npm, and rsync. Resolve repository root from the script location. Run npm ci, npm run build, and npm run web:build. Synchronize web/dist to /srv/cruxset/web with sudo rsync -a --delete and set caddy:caddy ownership. Generate the localhost-only Caddyfile from the current guide and validate it.

- [ ] Step 5: Generate cruxset-api.service with the current WSL user, the resolved server directory, EnvironmentFile=/etc/cruxset.env, absolute uv path, Uvicorn binding 127.0.0.1:8000, and Restart=always. Generate cruxset-quick-tunnel.service with the current WSL user, After=network-online.target caddy.service cruxset-api.service, absolute cloudflared path, tunnel --no-autoupdate --url http://127.0.0.1:8080, Restart=always, and RestartSec=3. Run sudo systemctl daemon-reload.

- [ ] Step 6: Run bash scripts/test-cruxset-web.sh and bash -n scripts/cruxset-web. Expected: all pass.

- [ ] Step 7: Commit.

    git add scripts/cruxset-web scripts/test-cruxset-web.sh
    git commit -m "feat: configure WSL web workspace"

### Task 3: Lifecycle and current URL

**Files:**
- Modify scripts/cruxset-web
- Modify scripts/test-cruxset-web.sh

- [ ] Step 1: Write failing tests that replace sudo, systemctl, curl, journalctl, and sleep with shell functions. Assert start runs caddy, API, then Quick Tunnel; stop runs Quick Tunnel, API, then caddy; a mocked journal URL from the second call is returned by wait_for_tunnel_url.

- [ ] Step 2: Run bash scripts/test-cruxset-web.sh. Expected: failure because lifecycle functions are not defined.

- [ ] Step 3: Implement wait_for_api with 15 one-second retries of curl --fail --silent --show-error http://127.0.0.1:8000/healthz. On failure show the last 40 cruxset-api journal lines and return nonzero. start_services starts Caddy and API, checks health, then restarts the Quick Tunnel. restart_services restarts Caddy and API, checks health, then restarts the tunnel. stop_services stops tunnel, API, caddy in that order and accepts inactive units.

- [ ] Step 4: Immediately before tunnel start/restart save date --iso-8601=seconds. Implement wait_for_tunnel_url to poll journalctl -u cruxset-quick-tunnel --since that timestamp --no-pager for 30 seconds and parse the URL. Print only the new URL on success. On timeout show the last 40 tunnel journal lines and return nonzero. Implement status to show all three service states and the last URL from 200 tunnel log lines, or a Chinese message that no URL is available.

- [ ] Step 5: Extend main: run setup only for start --setup and restart --setup; execute the selected action; after a successful start/restart print 本次 Quick Tunnel 地址 followed by the newly discovered URL.

- [ ] Step 6: Run bash scripts/test-cruxset-web.sh, bash -n scripts/cruxset-web, and ./scripts/cruxset-web status. Expected: tests pass and status makes no service changes.

- [ ] Step 7: Commit.

    git add scripts/cruxset-web scripts/test-cruxset-web.sh
    git commit -m "feat: manage Quick Tunnel lifecycle"

### Task 4: Documentation

**Files:**
- Modify docs/wsl-cloudflare-tunnel.md
- Modify scripts/test-cruxset-web.sh

- [ ] Step 1: Add failing document assertions that the guide contains ./scripts/cruxset-web start --setup, restart, stop, status, and the Quick Tunnel public-access warning.

- [ ] Step 2: Run bash scripts/test-cruxset-web.sh. Expected: failure because direct foreground cloudflared operation is still described.

- [ ] Step 3: Retain WSL/systemd and package prerequisites. Replace the manual environment-file, Caddy, API-unit, and foreground tunnel instructions with ./scripts/cruxset-web start --setup. State that only missing variables are prompted and existing values remain unchanged. Add all four daily commands and explain that every start/restart prints a new address. Retain the named-tunnel alternative, security warning, logs, restart --setup update workflow, and backup guidance.

- [ ] Step 4: Run bash scripts/test-cruxset-web.sh, bash -n scripts/cruxset-web, and git diff --check. Expected: all pass.

- [ ] Step 5: Commit.

    git add docs/wsl-cloudflare-tunnel.md scripts/test-cruxset-web.sh
    git commit -m "docs: simplify WSL Quick Tunnel operation"

### Task 5: Target-machine verification

**Files:**
- Verify scripts/cruxset-web

- [ ] Step 1: Run sudo test -s /etc/cruxset.env and sudo stat -c '%a %U %G' /etc/cruxset.env. Expected: nonempty and 600 root root. Do not display its contents.

- [ ] Step 2: Run ./scripts/cruxset-web start --setup, status, restart, and stop. Expected: existing values are not prompted, start/restart print a trycloudflare.com URL, and stop leaves all services inactive.

- [ ] Step 3: Run git status --short and git log --oneline -4. Expected: no database, environment file, or generated output is tracked.

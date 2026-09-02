# Local Development Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a background manager for the local API, Vite Web, and segmentation lab.

**Architecture:** A Bash script records only the PIDs it starts under .runtime/cruxset-dev. It sets fixed local publishing variables for API and lab child processes, checks ports and process identity, and cleans stale PID files rather than killing unowned processes.

**Tech Stack:** Bash, nohup, curl, npm/Vite, uv/Uvicorn.

---

### Task 1: Test CLI and PID safety

**Files:**
- Create: scripts/cruxset-dev
- Create: scripts/test-cruxset-dev.sh

- [ ] Step 1: Write failing sourceable Bash tests for parse_args accepting start, stop, restart, status; for stale PID cleanup; and for fixed KEY and OWNER values in service environment builders.

- [ ] Step 2: Run bash scripts/test-cruxset-dev.sh. Expected: failure because the script does not exist.

- [ ] Step 3: Implement usage, parse_args, runtime_dir, pid_file, is_managed_pid, cleanup_stale_pid, and the fixed local variable constants. Put main behind a BASH_SOURCE guard.

- [ ] Step 4: Run bash scripts/test-cruxset-dev.sh and bash -n scripts/cruxset-dev. Expected: all pass.

- [ ] Step 5: Commit scripts/cruxset-dev and scripts/test-cruxset-dev.sh with message test: define local development manager contract.

### Task 2: Start and stop each managed service

**Files:**
- Modify: scripts/cruxset-dev
- Modify: scripts/test-cruxset-dev.sh

- [ ] Step 1: Add failing tests with mocked nohup, kill, and ps functions. Assert start records separate API, web, and lab PIDs; assert stop only sends TERM to PIDs that match the recorded expected command.

- [ ] Step 2: Run bash scripts/test-cruxset-dev.sh. Expected: missing start_services and stop_services functions.

- [ ] Step 3: Implement startup commands from the repository root: API runs in server with SESSION_COOKIE_SECURE=false, PYTHONPATH=., fixed publish key and owner, and uv run uvicorn app.main:app --host 127.0.0.1 --port 8000. Web runs npm run web -- --host 0.0.0.0. Lab runs in tools/segmentation-lab with SEG_LAB_DATA_DIR=./data, fixed publish key, CRUXSET_BASE_URL=http://127.0.0.1:8000, CRUXSET_WEB_URL=http://127.0.0.1:5173, and uv run uvicorn segmentation_lab.api:app --host 127.0.0.1 --port 8765. Start each with nohup, redirect to its log file, and save PID.

- [ ] Step 4: Before every service start, reject a live PID file or a listener on its port with an actionable message. Wait up to 15 seconds for API and lab HTTP availability and Vite port availability. On failure stop only services started by this invocation and print the relevant log path.

- [ ] Step 5: Implement stop in lab, web, API order. Validate each PID command before TERM, wait briefly, then KILL only that same PID if necessary; remove PID files. Never kill by port.

- [ ] Step 6: Run test and syntax checks. Expected: pass.

- [ ] Step 7: Commit with message feat: manage local development services.

### Task 3: Status, restart, and README

**Files:**
- Modify: scripts/cruxset-dev
- Modify: scripts/test-cruxset-dev.sh
- Modify: README.md

- [ ] Step 1: Add failing status tests for running, stale, and absent PID files.

- [ ] Step 2: Run bash scripts/test-cruxset-dev.sh. Expected: status test failure.

- [ ] Step 3: Implement status to print API, Web, and lab state, PID, port, and respective .runtime/cruxset-dev log location. Implement restart as stop followed by start, returning failure if stop cannot validate an owned process.

- [ ] Step 4: In README local development and manual lab sections, add scripts/cruxset-dev start, stop, restart, and status as the recommended background workflow. Preserve the manual three-terminal commands as troubleshooting reference and state the development key and owner are intentionally fixed in the script.

- [ ] Step 5: Run bash scripts/test-cruxset-dev.sh, bash -n scripts/cruxset-dev, npm test, and git diff --check. Expected: all pass.

- [ ] Step 6: Commit with message docs: document local development manager.

### Task 4: Manual verification

**Files:**
- Verify: scripts/cruxset-dev

- [ ] Step 1: Run ./scripts/cruxset-dev start. Expected: three running statuses and three PID files under .runtime/cruxset-dev.

- [ ] Step 2: Open http://127.0.0.1:5173 and http://127.0.0.1:8765, and confirm API health at http://127.0.0.1:8000/healthz.

- [ ] Step 3: Run ./scripts/cruxset-dev restart then ./scripts/cruxset-dev stop. Expected: restart creates new PIDs; stop removes PID files and leaves unrelated processes untouched.

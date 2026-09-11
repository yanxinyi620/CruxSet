# Segmentation Actions Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. User approved execution and Terra/Luna delegation.

**Goal:** Preserve the full local lab and deliver a separate cloud upload → job → inference → calibration → publish flow.

**Architecture:** Shared lab HTML uses explicit runtime routing; Worker owns authenticated CRUD and task claims, D1 metadata and private R2 objects. A Python one-shot runner calls the existing segmentation core and uploads bounded outputs.

**Tech Stack:** TypeScript Workers/D1/R2, Python 3.11, SAM2 CPU, GitHub Actions, existing static HTML.

## Task 1: Cloud contract and Worker implementation (root)
- [x] Add failing integration tests in edge/tests/segmentation-lab.test.ts for authorization, upload, dispatch, claims, callback idempotency, calibration/publish, deletion and timeout.
- [x] Add edge/migrations/0009_segmentation_lab.sql and focused edge/src/lab modules. Reuse session() from index.ts through routing delegation.
- [x] Route /api/v1/segmentation-lab/*, protect encoded lab object keys from the existing media endpoint, add scheduled cleanup.
- [x] Run `npm run edge:test` and `npm run edge:typecheck`.

## Task 2: One-shot executor (Terra)
- [x] Write failing MockTransport tests for the protocol below; run `.venv/bin/python -m pytest -q tests/test_cloud_runner.py`.
- [x] Add segmentation_lab/cloud_runner.py, SAM2-only dependency extra and .github/workflows/segmentation-lab.yml. Preserve existing models extra.
- [x] Validate actual input, use BenchmarkService, create display.webp, candidates.json and masks.zip, upload and report terminal state. Pin model revision through environment/adapter configuration.
- [x] Run targeted and full Python tests.

## Task 3: Shared frontend (Terra)
- [x] Write failing local/cloud route and build tests.
- [x] Add explicit local/cloud runtime config and shared request/path helpers to lab static pages. Default local URLs remain compatible.
- [x] Add build copy step serving cloud pages under /segmentation-lab/, retain editing/export/delete and add cloud queued/error/retry status and login entry.
- [x] Add a cloud-only administrator link in Web. Run build and local regression tests.

## Task 4: Documentation and review (Luna after contract stabilizes)
- [x] Document environment setup, credentials, activation, cold/warm model checks, failure recovery and local preservation.
- [x] Review contract coverage and report actionable gaps independently.

## Wire contract (authoritative for parallel tasks)
Base: /api/v1/segmentation-lab. Browser endpoints mirror local /api suffixes (experiments, models, calibrations, nested candidates/runs/calibrations/image/export.svg/publish).

Runner endpoints:
- POST /runner/claim, Authorization Bearer LAB_RUNNER_KEY, JSON {taskId,attemptId,runId}; response {token,task:{id,attemptId,experimentId,model,parameters,image:{name,width,height,sha256}},inputUrl}. Claim is single-use atomic; rejected claims must not report failure on an unclaimed task.
- GET /runner/tasks/:taskId/input with task Bearer token returns image.
- POST /runner/tasks/:taskId/progress with task token, JSON {progress,message}.
- PUT /runner/tasks/:taskId/outputs/:name with task token and raw body; allowed names candidates.json (object {items:[local candidate records]}), display.webp, masks.zip. URLs are base + these paths. No dynamic arbitrary upload URL.
- POST /runner/tasks/:taskId/complete with task token, JSON {status:'succeeded'} or {status:'failed',error:{code,message}}. Success requires all three uploaded objects and validates JSON. Token expires at running deadline. A repeated successful callback is accepted, but uploads cannot modify terminal tasks.

Worker service config: LAB_GITHUB_TOKEN, LAB_GITHUB_REPOSITORY, LAB_GITHUB_REF, LAB_GITHUB_WORKFLOW (segmentation-lab.yml), LAB_RUNNER_KEY. Workflow uses repository secret LAB_API_URL (https://host/api/v1/segmentation-lab), LAB_RUNNER_KEY; inputs task_id and attempt_id only, runId = GITHUB_RUN_ID:GITHUB_RUN_ATTEMPT.

Cloud publish returns local-compatible {target:'cloudflare',targets:{cloudflare:{status:'succeeded',wallId,browseUrl}},wallId,browseUrl}. Calibration list records include publish receipt. Times returned to shared pages use seconds, stored D1 deadlines use milliseconds. Initial limits: 20 MiB input, 4096 max side, 16,777,216 pixels, 2 pending tasks per owner, points 8–64, batch 1–8, crop layers 0.

## Final integration
- [x] Run complete Python, TS suites; edge typecheck, Web build, Worker dry-run.
- [x] Exercise browser with actual local API and cloud Worker emulator or authorized deployed endpoint.
- [ ] Inspect configured deployment access without printing secrets. Deploy and dispatch actual model runs when credentials and repository workflow availability permit; otherwise state exact missing configuration while finishing all local verification.
- [x] Independent spec review followed by quality review; resolve findings and repeat affected checks.

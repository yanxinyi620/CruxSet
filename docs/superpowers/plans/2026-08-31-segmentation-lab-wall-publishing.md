# Segmentation Lab Wall Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the local Spraywall Segmentation Lab publish a saved, calibrated result as a new public Wall in the local CruxSet service.

**Architecture:** The lab service reads the original image and calibrated pixel polygons, then sends one multipart request to a dedicated, least-privilege CruxSet endpoint using a locally configured publish key. CruxSet validates the source payload, writes the image, converts pixel geometry to normalized Holds with stable IDs, creates a public locked Wall, and returns a browse path. SVG remains an independent preview/export artifact.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, HTTPX, Pillow, pytest, existing static HTML workbench, SQLite repositories.

---

## File map

- CruxSet configuration and publish route: `server/app/main.py`, `server/app/api/creator.py`, `server/app/api/media.py`.
- CruxSet tests: `server/tests/test_segmentation_publish_api.py`, `server/tests/test_local_media_api.py`.
- Lab configuration/client/route: `tools/segmentation-lab/src/segmentation_lab/config.py`, `tools/segmentation-lab/src/segmentation_lab/cruxset.py`, `tools/segmentation-lab/src/segmentation_lab/api.py`.
- Lab UI/tests: `tools/segmentation-lab/static/index.html`, `tools/segmentation-lab/tests/test_api.py`, `tools/segmentation-lab/tests/test_cruxset_publish.py`.
- Operational docs: `README.md`, `tools/segmentation-lab/README.md`, `docs/manual-test.md`.

### Task 1: Define the local publish configuration and CruxSet API contract

**Files:**
- Modify: `server/app/main.py`
- Modify: `server/app/api/creator.py`
- Modify: `server/app/api/media.py`
- Create: `server/tests/test_segmentation_publish_api.py`

- [ ] **Step 1: Write failing endpoint tests**

Create a test client with `app.state.segmentation_publish_key = "test-key"` and `app.state.segmentation_publish_owner_id = account["userId"]`. Add a valid PNG plus this form field:

```json
{
  "publishRequestId": "request-1",
  "sourceExperimentId": "experiment-1",
  "sourceCalibrationId": "calibration-1",
  "wallName": "日坛 spraywall · 2026-08-31",
  "imageWidth": 100,
  "imageHeight": 80,
  "holds": [{"sourceId":"manual-1","kind":"hold","polygon":[[10,10],[30,10],[20,30]]}]
}
```

Assert `POST /api/v1/admin/segmentation-walls` rejects missing/wrong Bearer keys, succeeds with a correct key, returns `{wallId, holdCount, browsePath, created}`, creates a public Wall owned by the configured admin, and normalizes the Hold geometry.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd server && PYTHONPATH=. uv run --group dev pytest tests/test_segmentation_publish_api.py -q`

Expected: FAIL with 404 because the endpoint does not exist.

- [ ] **Step 3: Add explicit startup configuration**

In `server/app/main.py`, read `CRUXSET_SEGMENTATION_PUBLISH_KEY` and `CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID` into app state. The endpoint must return `503 PUBLISH_NOT_CONFIGURED` when either is blank or the owner is not an administrator; it must never create anonymous Walls.

- [ ] **Step 4: Implement a dedicated multipart endpoint**

Use a `SegmentationPublishMetadata` Pydantic model with `extra="forbid"`. Require `Authorization: Bearer <key>` with `secrets.compare_digest`. Reuse extracted media-save validation from `media.py` so JPEG and PNG size/type validation applies identically to direct uploads and publishing.

Convert each source polygon from pixel coordinates to normalized `polygon`, `bbox`, representative center `x/y`, and an equivalent `radius`; reject a whole request if a point is non-finite/out of bounds, a polygon has fewer than three distinct points, source IDs repeat, or source count is zero. Generate stable Hold IDs by sorting bbox top-to-bottom then left-to-right and using `sourceId` as final tie-breaker. Create one public, published, polygon-geometry Wall with `source` metadata and return its ID.

- [ ] **Step 5: Add idempotency without changing repository protocols**

Before creating, search Walls for `source.publishRequestId`. If the same ID has the same calibration and image dimensions, return that Wall with `created: false`; otherwise return `409 PUBLISH_REQUEST_CONFLICT`. A new click from the lab creates a new UUID and therefore a new Wall.

- [ ] **Step 6: Run API tests**

Run: `cd server && PYTHONPATH=. uv run --group dev pytest tests/test_segmentation_publish_api.py tests/test_local_media_api.py -q`

Expected: PASS, including wrong key, invalid polygon, request replay, and resulting public media access tests.

- [ ] **Step 7: Commit**

```bash
git add server/app/main.py server/app/api/creator.py server/app/api/media.py server/tests/test_segmentation_publish_api.py server/tests/test_local_media_api.py
git commit -m "feat: accept segmentation wall publications"
```

### Task 2: Add a CruxSet publisher to the segmentation service

**Files:**
- Modify: `tools/segmentation-lab/pyproject.toml`
- Modify: `tools/segmentation-lab/src/segmentation_lab/config.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/cruxset.py`
- Modify: `tools/segmentation-lab/src/segmentation_lab/api.py`
- Create: `tools/segmentation-lab/tests/test_cruxset_publish.py`

- [ ] **Step 1: Write failing publisher tests using HTTPX MockTransport**

Require a `CruxSetPublisher` initialized by:

```python
CruxSetPublisher(base_url="http://127.0.0.1:8000", publish_key="test-key")
```

Assert it sends `Authorization: Bearer test-key`, multipart `image`, metadata with original pixel polygons, and returns the CruxSet response. Assert 401/409/422/503 and connection failures become `SegmentationLabError` with a non-secret, retryable message where appropriate.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_cruxset_publish.py -q`

Expected: FAIL because the publisher module is absent.

- [ ] **Step 3: Add local target configuration**

Extend `Settings` with `cruxset_base_url` and `cruxset_publish_key`, read from `CRUXSET_BASE_URL` and `CRUXSET_SEGMENTATION_PUBLISH_KEY`. If either is blank, publishing is unavailable and the UI shows a configuration message; no key is sent to the browser.

- [ ] **Step 4: Implement the publisher and API route**

Add `POST /api/experiments/{experiment_id}/calibrations/{calibration_id}/publish`. It loads the calibration, original image and experiment dimensions server-side, derives a default Wall name, accepts optional `wallName`, creates a fresh `publishRequestId` unless a retry ID is supplied, invokes `CruxSetPublisher`, and records `{publishRequestId, wallId, wallName, holdCount, browsePath, status, publishedAt}` in the calibration directory. The record is append-only and does not alter candidates.

- [ ] **Step 5: Return safe status and refresh data**

Add the latest publish result to calibration listing output. Do not include the key or target URL. Failed attempts return a stable error envelope and leave the calibration selectable for a new publish attempt.

- [ ] **Step 6: Run lab unit/API tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_cruxset_publish.py tests/test_api.py tests/test_calibrations.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/segmentation-lab/pyproject.toml tools/segmentation-lab/src tools/segmentation-lab/tests
git commit -m "feat: publish calibrated walls to CruxSet"
```

### Task 3: Add the publish action to the lab workbench

**Files:**
- Modify: `tools/segmentation-lab/static/index.html`
- Modify: `tools/segmentation-lab/tests/test_api.py`

- [ ] **Step 1: Write failing static UI assertions**

Extend `test_api.py` to require a “发布到 CruxSet” column/button in the saved calibration table, a name-edit dialog, disabled/in-progress state, an error message surface, and an “在 CruxSet 中打开” link when a result contains `browsePath`.

- [ ] **Step 2: Run the UI assertions and confirm they fail**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_api.py -q`

Expected: FAIL because the calibration table only provides continue, SVG, and delete actions.

- [ ] **Step 3: Implement a minimal publish dialog**

For each saved calibration, expose a publish button. The dialog pre-fills `wallName` with the server-provided default name and POSTs JSON `{wallName}` to its publish endpoint. Disable the row button while the request runs, reload the calibration table on success, display the returned Hold count and a link to `CRUXSET_BASE_URL + browsePath` only when the server reports success. Escape all dynamic text.

- [ ] **Step 4: Make retry semantics visible**

After a failed attempt, restore the button and display the server message. After a success, leave “再次发布为新墙面” available; clicking it intentionally generates a new request ID and therefore a new Wall.

- [ ] **Step 5: Run lab test suite**

Run: `cd tools/segmentation-lab && uv run --extra test pytest -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/segmentation-lab/static/index.html tools/segmentation-lab/tests/test_api.py
git commit -m "feat: add CruxSet publish control to lab"
```

### Task 4: Document configuration and run end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `tools/segmentation-lab/README.md`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Document exact local configuration**

Document matching values for both processes:

```bash
CRUXSET_SEGMENTATION_PUBLISH_KEY=<long-random-local-secret>
CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID=<existing-admin-user-id>
CRUXSET_BASE_URL=http://127.0.0.1:8000
```

State that the key is local-only, never a browser value, and must not be committed. Document starting CruxSet before the lab.

- [ ] **Step 2: Add manual acceptance steps**

Include: select a saved calibration; publish once; refresh Web browse to see a new Wall; open it and confirm polygon alignment; create a Problem; see Wall in the administrator’s page; deletion is blocked while the Problem exists; publish again and confirm a different Wall ID.

- [ ] **Step 3: Run all automated verification**

Run:

```bash
npm test
npm run build
npm run web:build
cd server && PYTHONPATH=. uv run --group dev pytest -q
cd ../tools/segmentation-lab && uv run --extra test pytest -q
```

Expected: every command exits 0.

- [ ] **Step 4: Run a real local publish**

With both services configured, select an existing saved calibration and publish it. Verify the CruxSet response, then query `/api/v1/walls` and confirm one newly created public polygon Wall with the expected Hold count. Do not delete the user’s calibration or existing Walls.

- [ ] **Step 5: Inspect and commit**

Run: `git diff --check && git status --short`

Then commit documentation and any verification-only correction:

```bash
git add README.md tools/segmentation-lab/README.md docs/manual-test.md
git commit -m "docs: describe local segmentation publishing"
```

## Completion gate

Stop after the local flow is verified. Do not add remote deployment, multi-user credential management, CloudBase publish support, reverse synchronization, or SVG-as-data handling.

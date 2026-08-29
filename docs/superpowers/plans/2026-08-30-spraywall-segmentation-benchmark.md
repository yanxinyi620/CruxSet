# Spraywall Segmentation Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent CPU-first desktop lab that compares SAM 3 and SAM 2.1 on one Spraywall image, supports complete SVG-based mask correction, and reports which model minimizes human correction work.

**Architecture:** Add an isolated `tools/segmentation-lab` application. A FastAPI backend owns model inference, lossless masks, experiment snapshots, editing commands, recovery, and exports; an independent Vite/TypeScript frontend owns comparison views and an SVG overlay whose polygons are always regenerated from backend masks. Model-specific adapters emit one shared candidate contract so either model can fail without disabling the rest of the lab.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, NumPy, Pillow, OpenCV, PyTorch CPU, Hugging Face Transformers SAM 2.1, official Meta SAM 3, TypeScript, Vite, Vitest, SVG.

---

## File structure

Create the following isolated tree:

```text
tools/segmentation-lab/
├── README.md                         # installation, weights, CPU operation, and workflow
├── pyproject.toml                    # backend/runtime/test dependencies
├── frontend/
│   ├── index.html                    # lab shell
│   ├── package.json                  # frontend-only scripts
│   ├── tsconfig.json                 # DOM + strict TypeScript config
│   ├── vite.config.ts                # build and local API proxy
│   ├── src/
│   │   ├── api.ts                    # typed HTTP client
│   │   ├── app.ts                    # page orchestration and event wiring
│   │   ├── geometry.ts               # SVG viewBox and pointer transforms
│   │   ├── state.ts                  # view/filter/selection state reducer
│   │   ├── svg-editor.ts             # SVG rendering and pointer tools
│   │   └── styles.css                # desktop workbench styling
│   └── tests/
│       ├── geometry.test.ts
│       ├── state.test.ts
│       └── svg-editor.test.ts
├── src/segmentation_lab/
│   ├── __init__.py
│   ├── api.py                        # FastAPI routes and static frontend mount
│   ├── config.py                     # storage and model configuration
│   ├── domain.py                     # shared dataclasses and JSON encoding
│   ├── errors.py                     # stable user-facing error codes
│   ├── experiments.py                # append-only experiment persistence/recovery
│   ├── masks.py                      # cleanup, IoU, dedupe, contour, and raster operations
│   ├── editing.py                    # reversible editing command service
│   ├── evaluation.py                 # final-to-candidate matching and report metrics
│   ├── exports.py                    # PNG/SVG/JSON export bundle
│   ├── service.py                    # orchestration and per-model failure isolation
│   └── adapters/
│       ├── base.py                   # adapter protocol and cancellation/progress types
│       ├── sam2.py                   # SAM 2.1 automatic masks and prompted refinement
│       └── sam3.py                   # SAM 3 text/exemplar masks and prompted refinement
└── tests/
    ├── fixtures.py
    ├── test_api.py
    ├── test_domain.py
    ├── test_editing.py
    ├── test_evaluation.py
    ├── test_experiments.py
    ├── test_exports.py
    ├── test_masks.py
    ├── test_model_contract.py
    ├── test_service.py
    └── test_ritan_smoke.py
```

Only add root-level script aliases after both isolated builds work. Do not import from `web/src`, `server/app`, or `miniprogram`.

### Task 1: Scaffold the isolated backend and health contract

**Files:**
- Create: `tools/segmentation-lab/pyproject.toml`
- Create: `tools/segmentation-lab/src/segmentation_lab/__init__.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/config.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/errors.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/api.py`
- Create: `tools/segmentation-lab/tests/test_api.py`

- [ ] **Step 1: Write the failing health test**

```python
# tools/segmentation-lab/tests/test_api.py
from fastapi.testclient import TestClient
from segmentation_lab.api import create_app
from segmentation_lab.config import Settings


def test_health_exposes_cpu_and_storage(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "device": "cpu",
        "dataDir": str(tmp_path),
    }
```

- [ ] **Step 2: Run the test and verify the missing package failure**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_api.py -v`  
Expected: FAIL because `segmentation_lab.api` does not exist.

- [ ] **Step 3: Add the minimal package and application factory**

```toml
# tools/segmentation-lab/pyproject.toml
[project]
name = "cruxset-segmentation-lab"
version = "0.1.0"
requires-python = ">=3.11,<3.13"
dependencies = [
  "fastapi>=0.116,<1",
  "uvicorn>=0.35,<1",
  "numpy>=2.1,<3",
  "pillow>=11,<13",
  "opencv-python-headless>=4.10,<5",
  "python-multipart>=0.0.20,<1",
]

[project.optional-dependencies]
models = [
  "torch>=2.7,<3",
  "torchvision>=0.22,<1",
  "transformers>=4.56,<6",
  "sam-3 @ git+https://github.com/facebookresearch/sam3.git",
]
test = ["pytest>=8,<9", "httpx>=0.28,<1"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/segmentation_lab"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

```python
# tools/segmentation-lab/src/segmentation_lab/config.py
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    device: str = "cpu"
```

```python
# tools/segmentation-lab/src/segmentation_lab/api.py
from fastapi import FastAPI
from .config import Settings


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Spraywall Segmentation Lab")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "device": settings.device, "dataDir": str(settings.data_dir)}

    return app
```

Define `SegmentationLabError(code: str, message: str, retryable: bool)` in `errors.py`; install one FastAPI exception handler that returns those three fields with HTTP 422. Keep `__init__.py` empty.

- [ ] **Step 4: Run the backend test**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_api.py -v`  
Expected: 1 passed.

- [ ] **Step 5: Commit the scaffold**

```bash
git add tools/segmentation-lab
git commit -m "feat: scaffold segmentation lab backend"
```

### Task 2: Define stable domain contracts and mask serialization

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/domain.py`
- Create: `tools/segmentation-lab/tests/test_domain.py`

- [ ] **Step 1: Write contract round-trip tests**

```python
# tools/segmentation-lab/tests/test_domain.py
from segmentation_lab.domain import BBox, RawCandidate, candidate_from_json, candidate_to_json


def test_raw_candidate_round_trips_without_embedding_mask_bytes():
    candidate = RawCandidate(
        id="sam2-0001",
        source="sam2",
        mask_path="masks/sam2-0001.png",
        bbox=BBox(10, 20, 40, 60),
        area=842,
        model_score=0.91,
        post_score=0.87,
        polygon=((10.0, 20.0), (40.0, 20.0), (30.0, 60.0)),
        status="pending",
        metadata={"stability": 0.94},
    )
    payload = candidate_to_json(candidate)
    assert "maskBytes" not in payload
    assert candidate_from_json(payload) == candidate
```

- [ ] **Step 2: Run the contract test and verify failure**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_domain.py -v`  
Expected: FAIL because `domain.py` is missing.

- [ ] **Step 3: Implement immutable contracts**

Create frozen dataclasses for `BBox`, `Point`, `RawCandidate`, `FinalInstance`, `ModelRun`, `Experiment`, and `EditEvent`. Use these exact literals:

```python
Source = Literal["sam2", "sam3", "manual"]
CandidateStatus = Literal["pending", "confirmed", "deleted"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "interrupted"]
```

`RawCandidate` uses the fields from the test. `FinalInstance` adds `source_candidate_ids`, `mask_path`, `polygon`, `bbox`, and `status`. JSON helpers emit camelCase keys, validate finite coordinates, require `x2 > x1` and `y2 > y1`, and reject polygons with fewer than three points.

- [ ] **Step 4: Run all domain tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_domain.py -v`  
Expected: all tests pass, including added invalid-bbox and invalid-polygon cases.

- [ ] **Step 5: Commit the contracts**

```bash
git add tools/segmentation-lab/src/segmentation_lab/domain.py tools/segmentation-lab/tests/test_domain.py
git commit -m "feat: define segmentation experiment contracts"
```

### Task 3: Implement lossless mask processing and SVG contours

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/masks.py`
- Create: `tools/segmentation-lab/tests/fixtures.py`
- Create: `tools/segmentation-lab/tests/test_masks.py`

- [ ] **Step 1: Write failing tests for cleanup, IoU, dedupe, and contours**

```python
# tools/segmentation-lab/tests/test_masks.py
import numpy as np
from segmentation_lab.masks import clean_mask, mask_iou, deduplicate, polygon_from_mask, rasterize_polygon


def test_clean_mask_removes_island_and_fills_hole():
    mask = np.zeros((20, 20), np.uint8)
    mask[4:16, 4:16] = 1
    mask[9, 9] = 0
    mask[1, 1] = 1
    cleaned = clean_mask(mask, min_region_area=4, max_hole_area=4)
    assert cleaned[9, 9] == 1
    assert cleaned[1, 1] == 0


def test_polygon_respects_pixel_error_bound():
    mask = np.zeros((30, 30), np.uint8)
    mask[5:25, 7:23] = 1
    polygon = polygon_from_mask(mask, epsilon_pixels=1.0)
    assert len(polygon) == 4
    assert mask_iou(mask, rasterize_polygon(polygon, mask.shape)) >= 0.95
```

Also test zero-union IoU, nested duplicate masks, overlapping distinct masks, ROI clipping, and holes.

- [ ] **Step 2: Run the focused tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_masks.py -v`  
Expected: FAIL because `masks.py` is missing.

- [ ] **Step 3: Implement pure mask functions**

Implement `clean_mask`, `mask_iou`, `clip_to_roi`, `bbox_from_mask`, `deduplicate`, `polygon_from_mask`, `rasterize_polygon`, and `match_candidates`. Use OpenCV connected components and contours. `polygon_from_mask` must return outer rings and hole rings separately; use `cv2.approxPolyDP` with `epsilon_pixels`, then validate the simplified polygon by rasterizing it. If IoU falls below the requested bound, halve epsilon until the bound passes or epsilon reaches 0.25 pixels.

For duplicate suppression, discard the lower-scoring candidate only when IoU is at least the configured threshold or the smaller-mask containment ratio is at least the containment threshold. Do not merge pixels across models.

- [ ] **Step 4: Run mask tests and static checks**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_masks.py -v`  
Expected: all mask tests pass.

- [ ] **Step 5: Commit mask processing**

```bash
git add tools/segmentation-lab/src/segmentation_lab/masks.py tools/segmentation-lab/tests
git commit -m "feat: add lossless mask processing"
```

### Task 4: Persist recoverable experiment snapshots

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/experiments.py`
- Create: `tools/segmentation-lab/tests/test_experiments.py`

- [ ] **Step 1: Write atomic persistence and recovery tests**

```python
# tools/segmentation-lab/tests/test_experiments.py
from segmentation_lab.experiments import ExperimentStore


def test_failed_run_never_replaces_latest_success(tmp_path):
    store = ExperimentStore(tmp_path)
    first = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    store.finish_run(first.id, "sam2", status="succeeded", candidate_count=12)
    second = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    store.finish_run(second.id, "sam2", status="failed", error={"code": "oom"})
    assert store.latest_success("abc", "sam2").id == first.id
```

Also test atomic JSON replacement, interrupted-run recovery, append-only edit events, and path traversal rejection.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_experiments.py -v`  
Expected: FAIL because `ExperimentStore` is absent.

- [ ] **Step 3: Implement the on-disk layout**

Use this exact layout:

```text
data/experiments/<uuid>/
├── experiment.json
├── input/original.<ext>
├── runs/sam2.json
├── runs/sam3.json
├── candidates/<candidate-id>.json
├── masks/<candidate-id>.png
├── final/<instance-id>.json
├── final/<instance-id>.png
├── edits.jsonl
└── report.json
```

Write JSON to a sibling `.tmp`, flush and `os.fsync`, then `os.replace`. Append events as one JSON object per line and flush after each command. On startup, convert a stale `running` run to `interrupted`; never infer success from candidate files alone.

- [ ] **Step 4: Run persistence tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_experiments.py -v`  
Expected: all experiment tests pass.

- [ ] **Step 5: Commit persistence**

```bash
git add tools/segmentation-lab/src/segmentation_lab/experiments.py tools/segmentation-lab/tests/test_experiments.py
git commit -m "feat: persist recoverable segmentation experiments"
```

### Task 5: Add model adapters with per-model failure isolation

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/adapters/base.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/adapters/sam2.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/adapters/sam3.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/service.py`
- Create: `tools/segmentation-lab/tests/test_model_contract.py`
- Create: `tools/segmentation-lab/tests/test_service.py`

- [ ] **Step 1: Write adapter contract tests with fake models**

```python
# tools/segmentation-lab/tests/test_service.py
from segmentation_lab.service import BenchmarkService


def test_one_model_failure_preserves_other_results(store, fake_image, fake_adapter):
    good = fake_adapter("sam2", candidate_count=3)
    bad = fake_adapter("sam3", error=MemoryError("allocation failed"))
    result = BenchmarkService(store, {"sam2": good, "sam3": bad}).run_benchmark(fake_image)
    assert result.runs["sam2"].status == "succeeded"
    assert result.runs["sam3"].status == "failed"
    assert len(store.list_candidates(result.id, source="sam2")) == 3
```

The contract suite must run without model weights. It verifies `available()`, `generate()`, `refine()`, progress callbacks, cancellation, CPU device selection, and normalized exception codes.

- [ ] **Step 2: Run contract tests and verify failure**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_model_contract.py tests/test_service.py -v`  
Expected: FAIL because adapters and service are missing.

- [ ] **Step 3: Implement the shared adapter protocol and service**

```python
# tools/segmentation-lab/src/segmentation_lab/adapters/base.py
class SegmentationAdapter(Protocol):
    name: Literal["sam2", "sam3"]
    def available(self) -> ModelAvailability: ...
    def generate(self, request: GenerateRequest, progress: ProgressCallback) -> Iterable[AdapterMask]: ...
    def refine(self, request: RefineRequest) -> list[AdapterMask]: ...
```

`BenchmarkService.run_benchmark` creates one experiment, runs the selected adapters sequentially on CPU to cap peak memory, unloads each model after its branch, persists each branch independently, then runs common postprocessing. Convert `MemoryError` and PyTorch out-of-memory errors to code `model_out_of_memory`, missing weights to `model_unavailable`, and cancellation to `run_interrupted`.

- [ ] **Step 4: Implement SAM 2.1 and SAM 3 adapters**

SAM 2.1:

- load `facebook/sam2.1-hiera-large` through `transformers` on CPU;
- use mask-generation mode with persisted `points_per_side`, `points_per_batch`, `pred_iou_thresh`, `stability_score_thresh`, crop layers, and working-image size;
- reuse image embeddings for point/box refinement when supported; otherwise record the fallback re-encode in run metadata;
- return every mask with model score, stability score, and original-image coordinates.

SAM 3:

- import the official `sam3` package lazily;
- require a local checkpoint path and never silently download gated weights during a run;
- run text prompts and exemplar boxes as separately named prompt sets;
- convert the official processor output to the shared `AdapterMask` contract;
- support positive/negative points and boxes through the released interactive predictor; when a requested prompt type is unsupported by the installed checkpoint/API, return `prompt_not_supported` without changing the current mask.

Do not catch broad exceptions inside adapters except to attach model context and re-raise; the service owns stable error conversion.

- [ ] **Step 5: Run adapter contract tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_model_contract.py tests/test_service.py -v`  
Expected: all tests pass without downloading weights.

- [ ] **Step 6: Commit model boundaries**

```bash
git add tools/segmentation-lab/src/segmentation_lab/adapters tools/segmentation-lab/src/segmentation_lab/service.py tools/segmentation-lab/tests
git commit -m "feat: add isolated SAM benchmark adapters"
```

### Task 6: Add reversible mask editing commands

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/editing.py`
- Create: `tools/segmentation-lab/tests/test_editing.py`

- [ ] **Step 1: Write command, undo, and mask-authority tests**

```python
# tools/segmentation-lab/tests/test_editing.py
def test_merge_updates_mask_then_regenerates_polygon(editor, two_instances):
    before = editor.snapshot()
    merged = editor.merge([two_instances[0].id, two_instances[1].id])
    assert merged.mask.sum() == (two_instances[0].mask | two_instances[1].mask).sum()
    assert merged.polygon == editor.contour_for(merged.mask)
    editor.undo()
    assert editor.snapshot() == before
```

Add tests for confirm, soft delete/restore, prompt refinement, box refinement, split-by-watershed seeds, merge, add-from-click, undo, redo, redo truncation after a new command, and crash replay from `edits.jsonl`.

- [ ] **Step 2: Run editing tests and verify failure**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_editing.py -v`  
Expected: FAIL because `editing.py` is missing.

- [ ] **Step 3: Implement command objects and replay**

Implement `Confirm`, `SoftDelete`, `Restore`, `Refine`, `Split`, `Merge`, and `AddManual` commands. Every command records the before/after instance IDs and mask paths. Never mutate an existing PNG; write a new revision such as `final/F-0007-r3.png`, atomically update the instance JSON, then append the event.

`Split` accepts two or more positive seed points and uses watershed constrained to the selected mask. `Merge` uses pixel union. `Refine` saves all returned masks as alternatives and changes the active mask only after the user chooses one.

- [ ] **Step 4: Run editing tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_editing.py -v`  
Expected: all editing and replay tests pass.

- [ ] **Step 5: Commit editing**

```bash
git add tools/segmentation-lab/src/segmentation_lab/editing.py tools/segmentation-lab/tests/test_editing.py
git commit -m "feat: add reversible mask correction commands"
```

### Task 7: Expose experiment, inference, editing, and progress APIs

**Files:**
- Modify: `tools/segmentation-lab/src/segmentation_lab/api.py`
- Create: `tools/segmentation-lab/tests/test_api.py`

- [ ] **Step 1: Expand API tests**

Test these exact endpoints with dependency-injected fake adapters:

```text
POST   /api/experiments
GET    /api/experiments/{id}
POST   /api/experiments/{id}/runs
GET    /api/experiments/{id}/progress
GET    /api/experiments/{id}/candidates?source=&status=
POST   /api/experiments/{id}/commands
POST   /api/experiments/{id}/undo
POST   /api/experiments/{id}/redo
GET    /api/experiments/{id}/report
POST   /api/experiments/{id}/exports
GET    /api/models
```

```python
def test_empty_run_does_not_replace_previous_candidates(client, experiment_with_candidates):
    response = client.post(f"/api/experiments/{experiment_with_candidates.id}/runs", json={"models": ["sam2"], "parameters": {"sam2": {"predIouThresh": 1.0}}})
    assert response.status_code == 202
    wait_until_finished(client, experiment_with_candidates.id)
    assert len(client.get(f"/api/experiments/{experiment_with_candidates.id}/candidates").json()["items"]) > 0
```

- [ ] **Step 2: Run API tests and verify missing routes**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_api.py -v`  
Expected: health passes; new endpoint tests fail with 404.

- [ ] **Step 3: Implement validated routes and background runs**

Use Pydantic request/response models local to `api.py`. Accept JPEG/PNG only, cap uploads at a configurable 80 MiB, calculate SHA-256 while streaming to disk, validate ROI against image dimensions, and return HTTP 202 for runs. Use one process-local worker queue with a single CPU inference worker; expose polled progress instead of WebSockets for the first version.

Command payloads use a discriminated `type` field. Return `409 run_in_progress` for a second run on the same experiment. Return `422 invalid_geometry`, `404 experiment_not_found`, and `503 model_unavailable` using `SegmentationLabError`.

- [ ] **Step 4: Run all backend API tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_api.py -v`  
Expected: all API tests pass.

- [ ] **Step 5: Commit APIs**

```bash
git add tools/segmentation-lab/src/segmentation_lab/api.py tools/segmentation-lab/tests/test_api.py
git commit -m "feat: expose segmentation lab API"
```

### Task 8: Scaffold the independent SVG workbench frontend

**Files:**
- Create: `tools/segmentation-lab/frontend/package.json`
- Create: `tools/segmentation-lab/frontend/tsconfig.json`
- Create: `tools/segmentation-lab/frontend/vite.config.ts`
- Create: `tools/segmentation-lab/frontend/index.html`
- Create: `tools/segmentation-lab/frontend/src/api.ts`
- Create: `tools/segmentation-lab/frontend/src/state.ts`
- Create: `tools/segmentation-lab/frontend/src/geometry.ts`
- Create: `tools/segmentation-lab/frontend/src/app.ts`
- Create: `tools/segmentation-lab/frontend/src/styles.css`
- Create: `tools/segmentation-lab/frontend/tests/geometry.test.ts`
- Create: `tools/segmentation-lab/frontend/tests/state.test.ts`

- [ ] **Step 1: Write frontend state and coordinate tests**

```typescript
// tools/segmentation-lab/frontend/tests/geometry.test.ts
import { describe, expect, it } from 'vitest'
import { clientToImage } from '../src/geometry'

it('maps a zoomed SVG pointer into original image pixels', () => {
  expect(clientToImage({ x: 250, y: 175 }, { left: 50, top: 25, width: 400, height: 300 }, { width: 2000, height: 1500 }))
    .toEqual({ x: 1000, y: 750 })
})
```

State tests cover view modes `merged | sam2 | sam3 | split`, status filters, selection, active tool, run locking, and preservation of confirmed items when a run fails.

- [ ] **Step 2: Run frontend tests and verify failure**

Run: `cd tools/segmentation-lab/frontend && npm install && npm test`  
Expected: FAIL because frontend modules are missing.

- [ ] **Step 3: Implement the shell, typed API client, reducer, and geometry**

Use an SVG with `viewBox="0 0 <originalWidth> <originalHeight>"` positioned over an image with identical aspect ratio. Define API types that mirror backend camelCase JSON. `state.ts` must be a pure reducer. `api.ts` must convert non-2xx responses into `LabApiError` preserving backend `code`, `message`, and `retryable`.

Lay out top controls, left view/filter rail, central viewport, right inspector, and bottom save/export bar. Use CSS Grid with a minimum supported viewport of 1100×700; this is a desktop-only tool.

- [ ] **Step 4: Run frontend unit tests and production build**

Run: `cd tools/segmentation-lab/frontend && npm test && npm run build`  
Expected: all tests pass and Vite produces `dist/`.

- [ ] **Step 5: Commit the frontend shell**

```bash
git add tools/segmentation-lab/frontend
git commit -m "feat: scaffold SVG segmentation workbench"
```

### Task 9: Implement SVG selection, correction tools, and recovery UX

**Files:**
- Create: `tools/segmentation-lab/frontend/src/svg-editor.ts`
- Modify: `tools/segmentation-lab/frontend/src/app.ts`
- Modify: `tools/segmentation-lab/frontend/src/styles.css`
- Create: `tools/segmentation-lab/frontend/tests/svg-editor.test.ts`

- [ ] **Step 1: Write DOM interaction tests**

Using Vitest with `happy-dom`, verify:

```typescript
it('renders polygon state with color-independent line styles', () => {
  const editor = mountEditor(candidateFixture())
  expect(editor.querySelector('[data-status="confirmed"]')?.getAttribute('class')).toContain('solid')
  expect(editor.querySelector('[data-status="pending"]')?.getAttribute('class')).toContain('dashed')
})
```

Also test SVG path selection, hover, zoom/pan transforms, positive/negative points, box drag, candidate alternative selection, delete, split seeds, merge selection, undo/redo shortcuts, and suppression of shortcuts while an input has focus.

- [ ] **Step 2: Run the interaction tests and verify failure**

Run: `cd tools/segmentation-lab/frontend && npm test -- svg-editor.test.ts`  
Expected: FAIL because `svg-editor.ts` is missing.

- [ ] **Step 3: Implement editor rendering and commands**

Render each candidate as an SVG `<path>` with `data-id`, `data-source`, and `data-status`. Use event delegation on the SVG root. Do not implement point-in-polygon in JavaScript. Add non-scaling strokes so outlines remain legible at all zoom levels.

Map tools to commands exactly:

```text
Enter → confirm
Delete → soft-delete
1 → positive-point
2 → negative-point
B → box
S → split
M → merge
Ctrl/Cmd+Z → undo
Ctrl/Cmd+Shift+Z → redo
[ / ] → previous/next alternative
Space+drag → pan
Wheel → zoom around pointer
```

Show model progress by polling every two seconds while a run is active. If the page reloads, fetch the experiment snapshot and current edit cursor before enabling tools. A failed branch appears as a dismissible diagnostic card; it must not cover the viewport or disable editing.

- [ ] **Step 4: Run interaction tests and frontend build**

Run: `cd tools/segmentation-lab/frontend && npm test && npm run build`  
Expected: all tests and the build pass.

- [ ] **Step 5: Commit the workbench interactions**

```bash
git add tools/segmentation-lab/frontend
git commit -m "feat: add SVG mask correction workflow"
```

### Task 10: Generate evaluation reports and lossless exports

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/evaluation.py`
- Create: `tools/segmentation-lab/src/segmentation_lab/exports.py`
- Create: `tools/segmentation-lab/tests/test_evaluation.py`
- Create: `tools/segmentation-lab/tests/test_exports.py`
- Modify: `tools/segmentation-lab/frontend/src/app.ts`

- [ ] **Step 1: Write metric and export tests**

```python
# tools/segmentation-lab/tests/test_evaluation.py
def test_report_prefers_recall_then_lower_correction_time(report_builder):
    report = report_builder(
        sam2={"recall": .95, "editSeconds": 1800},
        sam3={"recall": .95, "editSeconds": 1200},
    )
    assert report.recommendation == "sam3"
    assert report.reason == "equal recall; lower human correction time"
```

Test IoU matching, manually overridden matches, false positives, untouched/lightly-edited/rebuilt buckets, operation counts, and no recommendation when the final set is incomplete. Export tests unzip the bundle and validate PNG dimensions, SVG `viewBox`, polygon validity, JSON schema, and manifest hashes.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_evaluation.py tests/test_exports.py -v`  
Expected: FAIL because evaluation and export modules are missing.

- [ ] **Step 3: Implement deterministic metrics and exports**

Match candidates to final instances by maximum mask IoU above a configurable threshold, then apply persisted manual match overrides. Calculate recall, precision, mean/median IoU, correction buckets, command counts, inference seconds, edit seconds, and total seconds for `sam2`, `sam3`, and `merged`.

Recommendation ordering is: higher recall; if within 0.5 percentage points, lower edit time; if within 5% edit time, higher median IoU; otherwise report a tie. Do not recommend a model until every non-deleted final instance is confirmed.

Build a ZIP with `manifest.json`, `report.json`, `instances.json`, `wall.svg`, one full-resolution 1-bit PNG per final mask, and SHA-256 for every file. SVG embeds no image; it references the original filename and uses original pixel `viewBox` coordinates.

- [ ] **Step 4: Render the report in the frontend**

Add a report drawer containing the three comparison columns, metric definitions, experiment/model versions, and a download button. Label the recommendation as evidence from this wall image only, not a general model benchmark.

- [ ] **Step 5: Run backend and frontend tests**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_evaluation.py tests/test_exports.py -v`  
Expected: backend tests pass.  
Run: `cd tools/segmentation-lab/frontend && npm test && npm run build`  
Expected: frontend tests and build pass.

- [ ] **Step 6: Commit reporting and exports**

```bash
git add tools/segmentation-lab
git commit -m "feat: report and export segmentation results"
```

### Task 11: Package local startup and model diagnostics

**Files:**
- Create: `tools/segmentation-lab/README.md`
- Modify: `tools/segmentation-lab/src/segmentation_lab/api.py`
- Modify: `package.json`
- Create: `tools/segmentation-lab/tests/test_model_contract.py`

- [ ] **Step 1: Add startup diagnostics tests**

Test `/api/models` with no optional dependencies, missing SAM 3 checkpoint, readable checkpoint, and failed checkpoint checksum. Assert each response includes `available`, `reason`, `weightPath`, `weightVersion`, and `device` without attempting inference or network downloads.

- [ ] **Step 2: Run diagnostics tests and verify the missing fields**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_model_contract.py -v`  
Expected: the new diagnostics cases fail.

- [ ] **Step 3: Implement diagnostics and static frontend serving**

Resolve configuration from explicit `SEG_LAB_DATA_DIR`, `SEG_LAB_SAM3_CHECKPOINT`, and `SEG_LAB_SAM2_MODEL` environment variables. Do not overload `HOME` or other system variables. Mount `frontend/dist` only when it exists; in development, Vite proxies `/api` to FastAPI.

Add `Settings.from_env()` and expose the production entry point as `app = create_app(Settings.from_env())` so the documented Uvicorn command imports a concrete application.

Document these CPU installation commands:

```bash
cd tools/segmentation-lab
uv sync --extra test
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
uv sync --extra models
cd frontend && npm install && npm run build && cd ..
SEG_LAB_DATA_DIR=./data uv run uvicorn segmentation_lab.api:app --host 127.0.0.1 --port 8765
```

Document that SAM 3 weights may require accepting Meta/Hugging Face access terms and must be placed locally before a run. Include troubleshooting for memory reduction in this order: lower point batch, lower working-image dimension, disable crop layers, run one model only.

- [ ] **Step 4: Add root script aliases**

Add only these scripts to the root `package.json`:

```json
"seg:frontend": "vite --config tools/segmentation-lab/frontend/vite.config.ts",
"seg:frontend:test": "vitest run --config tools/segmentation-lab/frontend/vite.config.ts",
"seg:backend:test": "cd tools/segmentation-lab && uv run --extra test pytest"
```

- [ ] **Step 5: Run diagnostics and both builds**

Run: `npm run seg:backend:test`  
Expected: backend suite passes without model weights.  
Run: `npm run seg:frontend:test && npm run web:build`  
Expected: lab frontend tests pass and the existing CruxSet web build still passes.

- [ ] **Step 6: Commit packaging**

```bash
git add package.json tools/segmentation-lab
git commit -m "docs: package local segmentation lab"
```

### Task 12: Run the real Ritan wall CPU benchmark and acceptance pass

**Files:**
- Create: `tools/segmentation-lab/tests/test_ritan_smoke.py`
- Create: `tools/segmentation-lab/config/ritan-cpu-baseline.json`
- Modify: `tools/segmentation-lab/README.md`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Add an opt-in real-image smoke test**

```python
# tools/segmentation-lab/tests/test_ritan_smoke.py
import os
import pytest


@pytest.mark.skipif(os.getenv("SEG_LAB_RUN_MODELS") != "1", reason="requires local model weights")
def test_ritan_wall_produces_valid_in_roi_candidates(real_service, ritan_image, ritan_baseline):
    experiment = real_service.run_benchmark(ritan_image, parameters=ritan_baseline)
    candidates = real_service.list_candidates(experiment.id)
    assert candidates
    assert all(c.area > 0 and ritan_baseline.roi.contains(c.bbox) for c in candidates)
```

The committed baseline contains ROI, working size, prompt text, exemplar boxes, and both model parameter sets, but no generated masks or model weights.

- [ ] **Step 2: Verify the smoke test skips by default**

Run: `cd tools/segmentation-lab && uv run --extra test pytest tests/test_ritan_smoke.py -v`  
Expected: 1 skipped with `requires local model weights`.

- [ ] **Step 3: Run SAM 2.1 on the real wall**

Run: `cd tools/segmentation-lab && SEG_LAB_RUN_MODELS=1 uv run --extra models --extra test pytest tests/test_ritan_smoke.py -v -k sam2`  
Expected: PASS, with non-empty candidates fully clipped to ROI. Record model version, parameters, wall-clock duration, peak resident memory, and candidate count in the experiment snapshot, not in the committed baseline.

- [ ] **Step 4: Run SAM 3 on the real wall**

Run: `cd tools/segmentation-lab && SEG_LAB_RUN_MODELS=1 SEG_LAB_SAM3_CHECKPOINT=/absolute/path/to/sam3.pt uv run --extra models --extra test pytest tests/test_ritan_smoke.py -v -k sam3`  
Expected: PASS, with non-empty candidates fully clipped to ROI. If the official SAM 3 release cannot run on CPU, preserve the diagnostic as `model_unavailable` and continue acceptance with SAM 2.1; do not substitute an unofficial model under the `sam3` name.

- [ ] **Step 5: Complete the browser acceptance workflow**

Start the backend and frontend, then verify and record in `docs/manual-test.md`:

```text
[ ] Open the Ritan image and restore its saved ROI.
[ ] Run both available model branches and compare merged/sam2/sam3/split modes.
[ ] Confirm one untouched candidate.
[ ] Add positive and negative points and select an alternative mask.
[ ] Box-refine one missed hold.
[ ] Split one joined mask and merge one fragmented mask.
[ ] Delete and restore a false positive.
[ ] Undo and redo each command type.
[ ] Reload the browser and recover the exact edit cursor.
[ ] Finish the wall and generate a report.
[ ] Export and inspect PNG masks, SVG, JSON, hashes, and original-pixel coordinates.
[ ] Stop one model mid-run and confirm completed work remains editable.
```

- [ ] **Step 6: Run all regression checks**

Run: `npm test && npm run build && npm run web:build && npm run seg:backend:test && npm run seg:frontend:test`  
Expected: all existing CruxSet tests/builds and all weight-free lab tests pass.

- [ ] **Step 7: Commit the acceptance assets**

```bash
git add tools/segmentation-lab/config/ritan-cpu-baseline.json tools/segmentation-lab/tests/test_ritan_smoke.py tools/segmentation-lab/README.md docs/manual-test.md
git commit -m "test: add Ritan segmentation acceptance flow"
```

## Completion criteria

- The tool starts locally on `127.0.0.1` and reports model availability before inference.
- At least SAM 2.1 completes against the repository Ritan wall image on CPU; SAM 3 either completes or produces a precise preserved diagnostic without blocking the workflow.
- Automatic candidates, raw masks, parameters, versions, timings, and filter decisions are recoverable after restart.
- The SVG workbench completes every correction operation while masks remain the source of truth.
- The generated report compares recall, precision, mask quality, edit operations, and human correction time.
- The export bundle passes hash, dimension, geometry, and schema checks.
- Existing CruxSet tests and builds remain green.

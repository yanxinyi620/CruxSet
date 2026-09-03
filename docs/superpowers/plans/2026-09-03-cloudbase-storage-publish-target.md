# CloudBase Storage 上传与发布目标实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加受保护的 `storageUpload` 云函数，并让分割实验台明确选择发布到本地 Web、小程序 CloudBase 或两者。

**Architecture:** `storageUpload` 负责接收分割实验台的 multipart 文件并返回 CloudBase `fileID`；`segmentationPublish` 继续负责写入公开 Wall。实验台默认目标保持本地 Web，CloudBase 和同时发布必须显式选择，任一旁路失败都不影响另一条路径。

**Tech Stack:** Python FastAPI、httpx、微信云函数 Node.js、wx-server-sdk、CloudBase Storage、Vitest/Pytest。

---

### Task 1: Implement protected storageUpload cloud function

**Files:**
- Create: `cloudfunctions/storageUpload/index.js`
- Create: `cloudfunctions/storageUpload/package.json`
- Modify: `config/cloudbase.rules.json`
- Modify: `cloudfunctions/README.md`
- Test: `tests/storage-upload-contract.test.ts`

- [ ] Write failing tests for signed multipart upload contract, invalid signature/type/size rejection, and `cloud://` response shape.
- [ ] Run focused test and confirm the function is missing.
- [ ] Implement signature verification, content-type/size validation, `cloud.uploadFile`, and `{ fileID }` response. Never expose credentials to the client.
- [ ] Add the function to deployment documentation and keep storage receipt/client reads denied.
- [ ] Run focused tests, `npm test`, `npm run build`, `npm run verify:phase1`, and `git diff --check`.
- [ ] Commit locally.

### Task 2: Add explicit publish target selection with independent outcomes

**Files:**
- Modify: `tools/segmentation-lab/static/index.html`
- Modify: `tools/segmentation-lab/src/segmentation_lab/api.py`
- Modify: `tools/segmentation-lab/src/segmentation_lab/cloudbase_sync.py`
- Modify: `tools/segmentation-lab/src/segmentation_lab/config.py`
- Modify: `tools/segmentation-lab/tests/test_publish_api.py`
- Modify: `tools/segmentation-lab/tests/test_cloudbase_sync.py`

- [ ] Write failing tests for targets `web`, `cloudbase`, and `both`; default target `web`; invalid target rejection; independent success/failure reporting.
- [ ] Run focused tests and confirm the target field is unsupported.
- [ ] Add a target selector to the publish confirmation UI and send it in the request.
- [ ] Keep the existing Web publish call unchanged for `web`; invoke CloudBase upload then `segmentationPublish` for `cloudbase`; run both independently for `both` and return per-target status.
- [ ] Ensure CloudBase configuration is required only for CloudBase targets; Web-only publishing works with existing settings.
- [ ] Persist target/status in calibration publish records without changing existing Web result fields.
- [ ] Run segmentation-lab tests, root tests/build/verifier, and `git diff --check`.
- [ ] Commit locally.

### Task 3: Final verification and local integration

- [ ] Run `npm test`, `npm run build`, `npm run verify:phase1 -- --release`, server pytest, and segmentation-lab pytest.
- [ ] Confirm `web/` and `server/` behavior/routes are unchanged.
- [ ] Merge the feature branch into local `main` only; do not push GitHub.

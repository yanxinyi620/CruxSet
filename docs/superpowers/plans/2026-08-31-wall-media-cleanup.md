# Wall Media Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete a wall's original media files when, and only when, no remaining wall references them.

**Architecture:** The wall-deletion endpoint extracts safe media IDs before removing its document, then asks a media helper to remove only IDs no longer referenced by remaining walls. The existing route-reference guard remains first.

**Tech Stack:** FastAPI, Python `pathlib`, pytest.

---

### Task 1: Define the cleanup behaviour with API tests

**Files:**
- Modify: `server/tests/test_creator_lifecycle_api.py`

- [ ] **Step 1: Write the failing unique-media deletion test**

```python
def test_deleting_an_unreferenced_wall_removes_its_image(client, media_directory):
    media = upload_image(client, "wall.jpg", b"wall")
    wall = create_wall(client, image_file_id=media["url"])

    assert client.delete(f"/api/v1/walls/{wall['id']}", cookies=admin_cookie).status_code == 200
    assert not (media_directory / media["id"]).exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && TMPDIR=/tmp uv run pytest -q tests/test_creator_lifecycle_api.py::test_deleting_an_unreferenced_wall_removes_its_image`

Expected: FAIL because the existing endpoint leaves media files in place.

- [ ] **Step 3: Write the failing shared-media retention test**

```python
def test_deleting_a_wall_keeps_media_referenced_by_another_wall(client, media_directory):
    media = upload_image(client, "wall.jpg", b"wall")
    first = create_wall(client, image_file_id=media["url"])
    create_wall(client, name="Second wall", image_file_id=media["url"])

    assert client.delete(f"/api/v1/walls/{first['id']}", cookies=admin_cookie).status_code == 200
    assert (media_directory / media["id"]).is_file()
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd server && TMPDIR=/tmp uv run pytest -q tests/test_creator_lifecycle_api.py::test_deleting_a_wall_keeps_media_referenced_by_another_wall`

Expected: FAIL because retention is not yet asserted or implemented.

### Task 2: Implement safe local-media cleanup

**Files:**
- Modify: `server/app/api/media.py`
- Modify: `server/app/api/creator.py:238-246`

- [ ] **Step 1: Add a helper which removes only basename media IDs absent from all remaining walls**

```python
def delete_unreferenced_media(media_ids: set[str], walls: list[dict]) -> None:
    referenced = {Path(str(wall.get(field) or "")).name for wall in walls for field in ("imageFileId", "displayImageFileId")}
    for media_id in media_ids - referenced:
        if media_id and Path(media_id).name == media_id:
            (_media_directory() / media_id).unlink(missing_ok=True)
```

- [ ] **Step 2: In `delete_wall`, capture image IDs, delete the wall document, and call the helper with remaining walls**

```python
media_ids = {Path(str(wall.get(field) or "")).name for field in ("imageFileId", "displayImageFileId")}
_repo(request).delete_wall(wall_id)
delete_unreferenced_media(media_ids, _repo(request).list_walls())
```

- [ ] **Step 3: Run focused tests**

Run: `cd server && TMPDIR=/tmp uv run pytest -q tests/test_creator_lifecycle_api.py tests/test_local_media_api.py`

Expected: PASS; unique media is removed, shared media remains, and existing media access checks pass.

### Task 3: Verify and commit

**Files:**
- Verify: `server/app/api/creator.py`
- Verify: `server/app/api/media.py`

- [ ] **Step 1: Run the full server suite**

Run: `cd server && TMPDIR=/tmp uv run pytest -q`

Expected: PASS with no failures.

- [ ] **Step 2: Commit the implementation**

```bash
git add server/app/api/creator.py server/app/api/media.py server/tests/test_creator_lifecycle_api.py
git commit -m "feat: clean up unreferenced wall media"
```

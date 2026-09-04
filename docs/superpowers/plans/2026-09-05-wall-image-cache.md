# Wall Image Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse an unchanged wall image in the browser and make local wall-media responses safely cacheable.

**Architecture:** The media endpoint adds a seven-day private immutable cache directive because media IDs are random and never overwritten. A module-level frontend loader deduplicates pending and completed URL loads, while `WallCanvasView` retains responsibility for drawing and error rendering.

**Tech Stack:** FastAPI/Starlette, pytest, TypeScript, Vitest, Vite.

---

### Task 1: Cache policy for local media

**Files:**
- Modify: `server/tests/test_local_media_api.py`
- Modify: `server/app/api/media.py`

- [ ] **Step 1: Write the failing test**

```python
def test_readable_local_media_is_privately_cached_for_one_year(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    app = create_app()
    client = TestClient(app)
    media = client.post(
        "/api/v1/media/images",
        files={"file": ("wall.jpg", b"\\xff\\xd8\\xff\\xe0test-image", "image/jpeg")},
    ).json()["media"]
    app.state.repository.insert_wall({"id": "wall_public", "imageFileId": media["url"], "visibility": "public", "published": True})

    response = client.get(media["url"])

    assert response.headers["cache-control"] == "private, max-age=604800, immutable"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && uv run pytest tests/test_local_media_api.py -q`

Expected: the new assertion fails because `FileResponse` currently supplies no explicit `Cache-Control` value.

- [ ] **Step 3: Write minimal implementation**

```python
return FileResponse(path, headers={"Cache-Control": "private, max-age=604800, immutable"})
```

- [ ] **Step 4: Run the focused server test to verify it passes**

Run: `cd server && uv run pytest tests/test_local_media_api.py -q`

Expected: all tests pass.

### Task 2: Deduplicate wall-image loads in memory

**Files:**
- Create: `web/src/image-cache.ts`
- Create: `web/src/image-cache.test.ts`
- Modify: `web/src/wall-canvas.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { loadCachedImage, resetImageCacheForTests } from './image-cache.js'

afterEach(() => resetImageCacheForTests())

test('shares one pending image load for the same URL', async () => {
  const first = loadCachedImage('/api/v1/media/wall.jpg')
  const second = loadCachedImage('/api/v1/media/wall.jpg')
  expect(first).toBe(second)
})

test('removes a failed image so it can be retried', async () => {
  // Dispatch an error on the first constructed image, then assert the next call constructs another image.
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/image-cache.test.ts`

Expected: the module cannot be resolved because it does not yet exist.

- [ ] **Step 3: Write minimal implementation**

```ts
const cache = new Map<string, Promise<HTMLImageElement>>()

export const loadCachedImage = (source: string) => {
  const existing = cache.get(source)
  if (existing) return existing
  const image = new Image()
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => { cache.delete(source); reject(new Error('IMAGE_LOAD_FAILED')) }
  })
  cache.set(source, pending)
  image.src = source
  return pending
}
```

Update `WallCanvasView` to call `loadCachedImage(imageUrlFor(opts.imageUrl))`, assign the returned image on resolution, and preserve `imageError` on rejection.

- [ ] **Step 4: Run focused frontend tests to verify they pass**

Run: `npx vitest run web/src/image-cache.test.ts`

Expected: all image-cache tests pass.

### Task 3: Full verification

**Files:**
- Verify only: modified files from Tasks 1 and 2

- [ ] **Step 1: Run all tests**

Run: `npm test && (cd server && uv run pytest -q)` 

Expected: both suites finish successfully.

- [ ] **Step 2: Build the production web bundle**

Run: `npm run web:build`

Expected: Vite finishes with a generated `web/dist` bundle and no TypeScript errors.

- [ ] **Step 3: Review the scoped diff**

Run: `git diff -- server/app/api/media.py server/tests/test_local_media_api.py web/src/image-cache.ts web/src/image-cache.test.ts web/src/wall-canvas.ts`

Expected: only the cache policy and URL-keyed frontend image loader changes are present.

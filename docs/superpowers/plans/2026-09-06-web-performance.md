# Web Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Web session initialization one request and keep its in-memory session current after writes without a full reload.

**Architecture:** FastAPI will expose one bootstrap snapshot assembled from one visibility calculation and a batched creator-name lookup. `LocalApiClient` will request that snapshot, and `ApiSession` will mutate its local collections after successful writes. Existing endpoints remain compatible.

**Tech Stack:** FastAPI, Python, SQLite, TypeScript, Vitest, pytest.

---

### Task 1: Add the server bootstrap snapshot and batched setter names

**Files:**
- Modify: `server/app/api/creator.py:196-228`
- Modify: `server/app/api/auth.py:118-130`
- Test: `server/tests/test_creator_permissions.py`

- [ ] **Step 1: Write failing API tests**

Add a fixture with two public problems sharing one creator and one private problem. Test `GET /api/v1/bootstrap` returns `user: null` for an anonymous client, only the public wall/problem, and the public problem's setter name. Add an authenticated test that verifies owned private content appears and the user object has id, email, displayName, and isAdmin.

```python
response = client.get("/api/v1/bootstrap")
assert response.status_code == 200
assert response.json()["user"] is None
assert [wall["id"] for wall in response.json()["walls"]] == ["wall_public"]
assert response.json()["problems"][0]["setterName"] == "owner"
```

- [ ] **Step 2: Run test and verify it fails**

Run: `cd server && .venv/bin/python -m pytest tests/test_creator_permissions.py -q`

Expected: FAIL with a 404 response for `/api/v1/bootstrap`.

- [ ] **Step 3: Implement the snapshot**

In `creator.py`, extract `_problems_for_walls(request, walls)`. It must read problems once, collect unique `createdBy` values, query each creator's user and admin record no more than once, and attach `setterName` only for a creator with an account. Make `list_problems()` use this helper. In `auth.py`, extract `_safe_user(request)`, returning `None` with no valid session and `{id, email, displayName, isAdmin}` otherwise. Add the bootstrap route:

```python
@router.get("/bootstrap")
async def bootstrap(request: Request):
    walls = _visible_walls(request)
    return {"user": _safe_user(request), "walls": walls, "problems": _problems_for_walls(request, walls)}
```

- [ ] **Step 4: Run server tests and verify green**

Run: `cd server && .venv/bin/python -m pytest tests/test_creator_permissions.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app/api/creator.py server/app/api/auth.py server/tests/test_creator_permissions.py
git commit -m "feat: add web bootstrap snapshot"
```

### Task 2: Change the Web API client to use the snapshot

**Files:**
- Modify: `web/src/api.ts:3-40`
- Test: `tests/web-api-client.test.ts`

- [ ] **Step 1: Write a failing client test**

Replace the two-request browse-load expectation with a `loadBootstrap()` test. Mock a response containing user, walls, and problems. Assert exactly one `GET /api/v1/bootstrap` request and the parsed snapshot.

```ts
await expect(api.loadBootstrap()).resolves.toEqual({
  user: { id: 'usr_1', isAdmin: true }, walls: [{ id: 'wall_demo' }], problems: [{ id: 'problem_1' }],
})
expect(fetcher).toHaveBeenCalledOnce()
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --run tests/web-api-client.test.ts`

Expected: FAIL because `loadBootstrap` is missing.

- [ ] **Step 3: Implement the client method and timing logs**

Define `BootstrapData`, add `loadBootstrap()` using `GET /api/v1/bootstrap`, and remove `loadBrowseData()` only after all callers migrate. In shared `request()`, measure elapsed time and log method, path, and rounded milliseconds only when `import.meta.env.DEV` is true. Do not log bodies or headers.

```ts
async loadBootstrap(): Promise<BootstrapData> {
  return (await this.get('/api/v1/bootstrap')) as BootstrapData
}
```

- [ ] **Step 4: Run test and verify green**

Run: `npm test -- --run tests/web-api-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts tests/web-api-client.test.ts
git commit -m "feat: load web session from bootstrap"
```

### Task 3: Make ApiSession update local state after writes

**Files:**
- Modify: `web/src/data/api-session.ts:10-24`
- Test: `tests/dev-preview-api-session.test.ts`

- [ ] **Step 1: Write failing session tests**

Make the fixture supply `loadBootstrap`. Test `refresh()` calls it once. Add tests that create wall adds its returned wall, save/publish replaces that wall, create/update problem adds or replaces its returned problem, delete problem removes it, and delete wall removes it and all linked problems.

```ts
await session.deleteWall('wall_1')
await expect(session.listProblems({ wallId: 'wall_1' })).resolves.toEqual([])
expect(api.loadBootstrap).toHaveBeenCalledTimes(1)
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --run tests/dev-preview-api-session.test.ts`

Expected: FAIL because writes invoke `refresh()` or local collections remain unchanged.

- [ ] **Step 3: Implement snapshot ingest and mutation helpers**

Add private `replaceWall`, `replaceProblem`, `removeProblem`, and `removeWall` helpers that clone values before storage. Make `refresh()` atomically ingest `loadBootstrap()`. Apply helpers only after the successful write response. Keep a `refresh()` fallback only if a response lacks the resource needed for a local update.

```ts
private replaceProblem(problem: Problem) {
  this.problems = [...this.problems.filter(item => item.id !== problem.id), structuredClone(problem)]
}
```

- [ ] **Step 4: Run test and verify green**

Run: `npm test -- --run tests/dev-preview-api-session.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/data/api-session.ts tests/dev-preview-api-session.test.ts
git commit -m "perf: update web session locally after writes"
```

### Task 4: Migrate management loading and run complete verification

**Files:**
- Modify: `web/src/main.ts:128-140`
- Test: `tests/admin-management.test.ts`

- [ ] **Step 1: Write a failing management test**

Update the management fixture to supply `loadBootstrap()` instead of `loadBrowseData()`, and assert the loader uses bootstrap walls and problems plus the independent administrator user list.

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --run tests/admin-management.test.ts`

Expected: FAIL because `loadBrowseData` remains in use.

- [ ] **Step 3: Migrate the management loader**

In `loadAdminManagement`, replace `api.loadBrowseData()` with `api.loadBootstrap()` and read its `walls` and `problems` fields. Do not request the current user again.

- [ ] **Step 4: Run complete verification**

Run: `npm test && npm run build && cd server && .venv/bin/python -m pytest -q`

Expected: all checks pass without errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/main.ts tests/admin-management.test.ts
git commit -m "perf: reuse web bootstrap in management"
git status --short
```


# Admin Web Creator and Unified API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a FastAPI-based unified API and an administrator-only Web creator that share CruxSet business rules and CloudBase data with the mini program.

**Architecture:** Deploy FastAPI as a CloudBase CloudRun service. It exposes HTTPS JSON endpoints, authenticates Web administrators with an HttpOnly cookie, and accesses CloudBase only with server-side credentials. `src/domain` becomes the single source for platform-neutral rules; Mini Program and Web use platform-specific services that implement one API contract.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, Pydantic v2, Argon2id, signed session cookies, Tencent Cloud Python SDK (`tencentcloud-sdk-python-tcb`), Vite + TypeScript, Vitest, CloudBase CloudRun.

**References:** [CloudBase HTTP access](https://docs.cloudbase.net/en/service/access-cloud-function), [CloudBase HTTP function credential requirements](https://docs.cloudbase.net/en/cloud-function/develop/how-to-writing-functions-code), [CloudBase document database server access](https://cloud.tencent.com/document/product/876/19367).

---

## File structure

```text
src/domain/                         shared pure rules and types (single source)
server/
  app/
    api/                            FastAPI routers and request/response schemas
    auth/                           password hashing, session cookies, admin guard
    repositories/                   CloudBase and in-memory repository implementations
    services/                       Wall, Layout, Problem application services
    main.py                         FastAPI application and router registration
  scripts/create_admin.py           controlled administrator bootstrap command
  tests/                            API, authorization, and service tests
  requirements.txt
  Dockerfile
web/
  src/                              formal administrator Web application
  public/
  vite.config.ts
  package.json
miniprogram/services/               API-contract adapters; no page calls CloudBase directly
```

`dev-preview/` remains a visual prototype until Task 8 migrates its useful UI and Canvas code to `web/`. Do not modify unrelated, currently uncommitted Preview work while executing this plan.

### Task 1: Consolidate shared domain modules

**Files:**
- Modify: `src/index.ts`
- Modify: `miniprogram/domain/*.ts`
- Create: `tests/shared-domain-imports.test.ts`

- [ ] **Step 1: Write the failing import-boundary test**

```ts
import { expect, it } from 'vitest'
import { createProblem } from '../src/domain/routes.js'
import { createProblem as miniCreateProblem } from '../miniprogram/domain/routes.js'

it('uses the same route rule implementation on both clients', () => {
  expect(miniCreateProblem).toBe(createProblem)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/shared-domain-imports.test.ts`

Expected: FAIL because the two modules export different function instances.

- [ ] **Step 3: Replace Mini Program domain duplicates with re-exports**

Each platform-neutral `miniprogram/domain/<name>.ts` becomes a re-export of its `src/domain/<name>.ts` counterpart, for example:

```ts
export * from '../../src/domain/routes.js'
```

Do this only for modules that do not import `wx`, `document`, Canvas objects, or platform storage.

- [ ] **Step 4: Run focused and full checks**

Run: `npm test -- tests/shared-domain-imports.test.ts && npm test && npm run build`

Expected: all tests pass and both TypeScript projects compile.

- [ ] **Step 5: Commit**

```bash
git add src miniprogram/domain tests/shared-domain-imports.test.ts
git commit -m "refactor: share domain rules across clients"
```

### Task 2: Define the versioned API contract and error envelope

**Files:**
- Create: `src/contracts/api.ts`
- Create: `server/app/api/errors.py`
- Create: `server/app/api/schemas.py`
- Create: `server/tests/test_error_envelope.py`

- [ ] **Step 1: Write failing error-envelope tests**

```py
from fastapi.testclient import TestClient
from app.main import app

def test_unknown_route_uses_stable_error_shape():
    response = TestClient(app).get('/api/v1/missing')
    assert response.status_code == 404
    assert response.json() == {'error': {'code': 'NOT_FOUND', 'message': 'Resource not found'}}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && pytest tests/test_error_envelope.py -q`

Expected: FAIL because no FastAPI application exists.

- [ ] **Step 3: Add contract types and FastAPI base application**

Define `ApiError`, `ApiResult`, `CurrentUser`, `WallSummary`, `LayoutSummary`, and `ProblemSummary` in `src/contracts/api.ts`. Create FastAPI at `server/app/main.py` with `/healthz`, `/api/v1`, CORS restricted to the configured Web origin, and exception handlers that map domain exceptions to `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `LAYOUT_LOCKED`, `LAYOUT_NOT_ROUTABLE`, `INVALID_INPUT`, and `RATE_LIMITED`.

- [ ] **Step 4: Run tests**

Run: `cd server && pytest tests/test_error_envelope.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contracts server
git commit -m "feat: add versioned API contract and errors"
```

### Task 3: Add CloudBase repository boundary and local API test repository

**Files:**
- Create: `server/app/repositories/protocols.py`
- Create: `server/app/repositories/memory.py`
- Create: `server/app/repositories/cloudbase.py`
- Create: `server/tests/test_repository_contract.py`
- Create: `server/.env.example`

- [ ] **Step 1: Write the repository contract tests**

```py
def test_memory_repository_returns_only_latest_layout_snapshot(repository):
    repository.insert_layout({'id': 'layout_1', 'version': 1, 'published': False})
    repository.insert_layout({'id': 'layout_1', 'version': 2, 'published': True})
    assert repository.list_layouts('wall_1') == [{'id': 'layout_1', 'version': 2, 'published': True}]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && pytest tests/test_repository_contract.py -q`

Expected: FAIL because repository types do not exist.

- [ ] **Step 3: Implement repository protocol and adapters**

`CruxRepository` must expose typed operations for users/admins, walls, layouts, problems and media metadata. `MemoryRepository` is only for deterministic API tests. `CloudBaseRepository` uses the Tencent Cloud TCB `RunCommands` API with credentials read exclusively from server environment variables:

```text
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
TENCENT_REGION
CLOUDBASE_ENV_ID
```

Never expose these values to a Web bundle, Mini Program bundle, logs, or API response. Validate all collection and command names in code; never accept an arbitrary database command from a request.

- [ ] **Step 4: Run repository tests**

Run: `cd server && pytest tests/test_repository_contract.py -q`

Expected: PASS with `MemoryRepository`; CloudBase calls are covered by adapter request-shape unit tests, not live credentials.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: add CloudBase API repository boundary"
```

### Task 4: Implement controlled administrator credentials and sessions

**Files:**
- Create: `server/app/auth/passwords.py`
- Create: `server/app/auth/sessions.py`
- Create: `server/app/api/auth.py`
- Create: `server/scripts/create_admin.py`
- Create: `server/tests/test_admin_auth.py`

- [ ] **Step 1: Write failing authentication tests**

```py
def test_admin_login_sets_http_only_session(client, admin_record):
    response = client.post('/api/v1/auth/admin/login', json={'email': 'admin@example.com', 'password': 'correct horse'})
    assert response.status_code == 200
    assert response.json()['user']['isAdmin'] is True
    assert 'httponly' in response.headers['set-cookie'].lower()

def test_non_admin_and_wrong_password_get_identical_failure(client, user_record):
    assert client.post('/api/v1/auth/admin/login', json={'email': user_record.email, 'password': 'wrong'}).json()['error']['code'] == 'AUTH_REQUIRED'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pytest tests/test_admin_auth.py -q`

Expected: FAIL because login routes do not exist.

- [ ] **Step 3: Implement admin-only login**

Add `emailNormalized` and `passwordHash` to server-only `admins` records. `create_admin.py` normalizes an email, creates or links a `users.id`, generates an Argon2id hash using `ADMIN_BOOTSTRAP_PASSWORD`, and writes `{userId, role: 'admin', emailNormalized, passwordHash}`. It must refuse to overwrite an existing credential unless `--reset-password` is passed interactively.

`POST /api/v1/auth/admin/login` uses a constant-time password verifier, applies per-email and per-IP rate limiting, returns a generic `AUTH_REQUIRED` failure for all invalid credentials, and sets a signed short-lived `HttpOnly; Secure; SameSite=Lax` cookie. Add `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`.

- [ ] **Step 4: Run authentication tests**

Run: `cd server && pytest tests/test_admin_auth.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: add administrator password sessions"
```

### Task 5: Move Wall, Layout and Problem permissions into application services

**Files:**
- Create: `server/app/services/walls.py`
- Create: `server/app/services/layouts.py`
- Create: `server/app/services/problems.py`
- Create: `server/app/api/walls.py`
- Create: `server/app/api/layouts.py`
- Create: `server/app/api/problems.py`
- Create: `server/tests/test_creator_permissions.py`
- Create: `server/tests/test_layout_lifecycle_api.py`

- [ ] **Step 1: Write failing authorization and lifecycle tests**

```py
def test_admin_can_publish_two_layouts_and_both_can_create_routes(client, admin_cookie, seeded_wall):
    first = publish_layout(client, admin_cookie, seeded_wall.id, 'layout_a')
    second = publish_layout(client, admin_cookie, seeded_wall.id, 'layout_b')
    assert create_problem(client, admin_cookie, seeded_wall.id, first.id).status_code == 201
    assert create_problem(client, admin_cookie, seeded_wall.id, second.id).status_code == 201

def test_non_admin_cannot_create_or_upload(client):
    assert client.post('/api/v1/walls', json={'name': 'forbidden'}).status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pytest tests/test_creator_permissions.py tests/test_layout_lifecycle_api.py -q`

Expected: FAIL because protected resource routes do not exist.

- [ ] **Step 3: Implement resource endpoints**

Implement the following endpoints with `require_admin` for all mutations:

```text
GET    /api/v1/walls
POST   /api/v1/walls
DELETE /api/v1/walls/{wall_id}
GET    /api/v1/walls/{wall_id}/layouts
POST   /api/v1/walls/{wall_id}/layouts
PATCH  /api/v1/layouts/{layout_id}
POST   /api/v1/layouts/{layout_id}/publish
DELETE /api/v1/layouts/{layout_id}
GET    /api/v1/problems?wallId=&layoutId=&angle=&grade=&query=
POST   /api/v1/problems
DELETE /api/v1/problems/{problem_id}
```

Reuse `src/domain` validation for hold roles, Foot Rules, route eligibility, search and random selection. Enforce existing lifecycle rules: draft-only update, immutable published Layout, every published Layout with at least two Holds may create routes, and cascade deletion.

- [ ] **Step 4: Run tests**

Run: `cd server && pytest tests/test_creator_permissions.py tests/test_layout_lifecycle_api.py -q && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server src tests
git commit -m "feat: expose protected creator API"
```

### Task 6: Add secure image upload and read endpoints

**Files:**
- Create: `server/app/services/media.py`
- Create: `server/app/api/media.py`
- Create: `server/tests/test_media_access.py`

- [ ] **Step 1: Write failing media authorization tests**

```py
def test_draft_image_url_requires_an_authenticated_admin(client, draft_layout):
    assert client.get(f'/api/v1/layouts/{draft_layout.id}/image').status_code == 401

def test_upload_rejects_non_images_and_large_files(client, admin_cookie):
    response = client.post('/api/v1/media/uploads', cookies=admin_cookie, files={'file': ('wall.txt', b'x', 'text/plain')})
    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pytest tests/test_media_access.py -q`

Expected: FAIL because media API routes do not exist.

- [ ] **Step 3: Implement media rules**

Accept JPEG, PNG and WebP only; validate MIME plus decoded image dimensions; cap file size through `MAX_UPLOAD_BYTES`. Save under `walls/{wallId}/layouts/{layoutId}/{uuid}`. `POST /api/v1/media/uploads` requires admin. `GET /api/v1/layouts/{layout_id}/image` issues a short-lived CloudBase URL only after authorization. No raw storage credential, unrestricted file ID, or Storage SDK secret may cross the API boundary.

- [ ] **Step 4: Run media tests**

Run: `cd server && pytest tests/test_media_access.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: add secured layout image API"
```

### Task 7: Containerize and deploy the FastAPI API to CloudBase CloudRun

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`
- Create: `server/cloudrun.yaml`
- Create: `docs/web-api-deployment.md`
- Create: `server/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```py
def test_health_endpoint_is_public(client):
    assert client.get('/healthz').json() == {'status': 'ok'}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && pytest tests/test_health.py -q`

Expected: FAIL until `server/app/main.py` exposes `/healthz`.

- [ ] **Step 3: Add production container configuration**

Run Uvicorn on `$PORT`, run as an unprivileged user, accept production variables only through CloudBase CloudRun secrets, and configure the allowed Web origin. Document deployment, environment variables, secret creation, database access credentials, HTTPS domain, cookie domain, CORS, administrator bootstrap, rollback and smoke test steps. Do not commit secrets.

- [ ] **Step 4: Verify locally**

Run: `cd server && pytest tests/test_health.py -q && docker build -t cruxset-api .`

Expected: PASS and successful image build.

- [ ] **Step 5: Commit**

```bash
git add server docs/web-api-deployment.md
git commit -m "build: containerize unified API"
```

### Task 8: Create the formal administrator Web application

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/src/main.ts`
- Create: `web/src/services/api.ts`
- Create: `web/src/services/auth.ts`
- Create: `web/src/routes.ts`
- Create: `web/src/pages/login.ts`
- Create: `web/src/pages/walls.ts`
- Create: `web/src/pages/layout-editor.ts`
- Create: `web/src/pages/problem-editor.ts`
- Create: `web/src/components/wall-canvas.ts`
- Create: `web/src/styles/*.css`
- Create: `web/tests/api-client.test.ts`

- [ ] **Step 1: Write failing Web authentication tests**

```ts
import { expect, it, vi } from 'vitest'
import { login } from '../src/services/auth.js'

it('posts administrator credentials with cookie sessions enabled', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { isAdmin: true } })))
  await login(fetcher, 'admin@example.com', 'password')
  expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/admin/login', expect.objectContaining({ credentials: 'include', method: 'POST' }))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npm test -- api-client.test.ts`

Expected: FAIL because `web/` does not exist.

- [ ] **Step 3: Build the guarded administrator shell**

Create `/login`, `/walls`, `/walls/:wallId/layouts/:layoutId/edit`, and `/problems/new` routes. On startup call `/api/v1/auth/me`; unauthenticated creators are redirected to `/login`. API requests always use `credentials: 'include'`; no password or token is stored in localStorage. Reuse design tokens and content rules from the existing Preview, but treat `web/` as its own responsive product UI.

- [ ] **Step 4: Implement creator flows**

Implement walls, drafts, upload, Canvas marker editing, publication confirmation, public Layout selection, problem editor, search, sequential navigation, random selection and destructive confirmation dialogs. Use the API only; do not import CloudBase SDK into `web/`. The Canvas should reuse shared coordinate and hit-testing rules, while using `HTMLCanvasElement` event handling for mouse, touch and keyboard interactions.

- [ ] **Step 5: Run Web checks**

Run: `cd web && npm test && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat: add administrator web creator"
```

### Task 9: Migrate the Mini Program service adapter to the unified API

**Files:**
- Create: `miniprogram/services/http.ts`
- Modify: `miniprogram/services/users.ts`
- Modify: `miniprogram/services/walls.ts`
- Modify: `miniprogram/services/layouts.ts`
- Modify: `miniprogram/services/problems.ts`
- Modify: `miniprogram/config/runtime.ts`
- Create: `tests/miniprogram-http-services.test.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
it('sends Mini Program API credentials and maps stable errors', async () => {
  const client = createMiniApiClient(mockRequest)
  await expect(client.get('/api/v1/walls')).resolves.toEqual([])
  expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/miniprogram-http-services.test.ts`

Expected: FAIL because no Mini Program HTTP adapter exists.

- [ ] **Step 3: Add opt-in API runtime mode**

Add `runtimeMode: 'mock' | 'cloudbase' | 'api'`. Preserve `mock` for local development and existing `cloudbase` behavior until parity is proven. `api` calls FastAPI over HTTPS, passes the Mini Program identity exchange token, maps API errors through existing user-facing error mapping, and never changes page-level service signatures.

- [ ] **Step 4: Run checks**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram tests
git commit -m "feat: add unified API mini program adapter"
```

### Task 10: Cross-client acceptance and documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/manual-test.md`
- Modify: `README.md`
- Create: `docs/web-admin-operation.md`

- [ ] **Step 1: Add acceptance checklist**

Document these exact scenarios:

```text
1. Bootstrap an administrator without logging a password.
2. Log in on Web; create a Wall, draft Layout and Holds; publish it.
3. Verify it appears in Mini Program API mode as a public selectable Layout.
4. Create a route on Web and browse it in Mini Program.
5. Create a route in Mini Program API mode and browse it on Web.
6. Confirm draft images, writes and uploads reject unauthenticated or non-admin Web callers.
7. Confirm deleting a Layout on either client removes its routes from both clients.
```

- [ ] **Step 2: Execute automated checks**

Run: `npm test && npm run build && cd server && pytest -q && cd ../web && npm test && npm run build`

Expected: all checks pass.

- [ ] **Step 3: Execute manual desktop and Mini Program smoke tests**

Record browser, WeChat Developer Tools, CloudRun revision, API base URL and test account identity in a private deployment record; do not commit passwords, cookies, access keys or production file URLs.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: add web creator operations and acceptance"
```

## Plan self-review

- Shared domain consolidation: Task 1.
- Unified API contract, CloudBase server access and stable errors: Tasks 2–3.
- Administrator-only email/password identity: Task 4.
- Wall, Layout, Problem, lifecycle and permission rules: Task 5.
- File/image security: Task 6.
- FastAPI CloudRun deployment: Task 7.
- Full Web creation, annotation and route editing: Task 8.
- Mini Program migration without breaking Mock or current CloudBase mode: Task 9.
- Cross-client acceptance and operational documentation: Task 10.

No task opens direct browser-to-CloudBase data access, adds public Web registration, or requires a Taro/uni-app migration.

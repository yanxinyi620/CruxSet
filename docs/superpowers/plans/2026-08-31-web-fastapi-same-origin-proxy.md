# Web FastAPI Same-Origin Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let LAN phones use the Web server as the sole public local endpoint while FastAPI remains bound to loopback.

**Architecture:** `LocalApiClient` defaults to an empty base URL so all calls use relative `/api` paths. Vite proxies that prefix to `http://127.0.0.1:8000`; media paths already share the prefix and need no special client handling.

**Tech Stack:** TypeScript, Vitest, Vite development-server proxy, FastAPI.

---

### Task 1: Make the browser API client same-origin by default

**Files:**
- Modify: `web/src/api.ts`
- Modify: `tests/web-api-client.test.ts`

- [ ] **Step 1: Write the failing same-origin test**

```ts
it('uses a same-origin API base URL for LAN and localhost pages', () => {
  expect(localApiBaseUrl({ protocol: 'http:', hostname: '192.168.43.179' })).toBe('')
  expect(localApiBaseUrl({ protocol: 'http:', hostname: 'localhost' })).toBe('')
})
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- tests/web-api-client.test.ts`

Expected: FAIL because the current client returns `http://192.168.43.179:8000` for a LAN page.

- [ ] **Step 3: Implement the minimal client change**

```ts
export function localApiBaseUrl(_location: Pick<Location, 'protocol' | 'hostname'> = window.location): string {
  return ''
}
```

Keep every request as ``${this.baseUrl}/api/...`` so a default client requests `/api/...`; keep the constructor's explicit `baseUrl` argument for focused API-client tests.

- [ ] **Step 4: Verify client tests pass**

Run: `npm test -- tests/web-api-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts tests/web-api-client.test.ts
git commit -m "fix: use same-origin web API paths"
```

### Task 2: Proxy Web API paths to loopback FastAPI

**Files:**
- Modify: `web/vite.config.ts`
- Create: `tests/web-vite-proxy.test.ts`

- [ ] **Step 1: Write the failing proxy configuration test**

```ts
it('forwards same-origin API requests to loopback FastAPI', async () => {
  const config = (await import('../web/vite.config.js')).default
  expect(config.server?.proxy?.['/api']).toMatchObject({
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  })
})
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- tests/web-vite-proxy.test.ts`

Expected: FAIL because the Vite server currently has no proxy setting.

- [ ] **Step 3: Add the loopback proxy**

```ts
server: {
  port: 5173,
  strictPort: true,
  host: '0.0.0.0',
  proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
}
```

Do not proxy unrelated paths. `/api/v1/media/...` is covered by the `/api` prefix.

- [ ] **Step 4: Verify the proxy test passes**

Run: `npm test -- tests/web-vite-proxy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/vite.config.ts tests/web-vite-proxy.test.ts
git commit -m "feat: proxy local web API requests"
```

### Task 3: Verify phone-facing local behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the loopback FastAPI startup command**

```bash
cd server && SESSION_COOKIE_SECURE=false PYTHONPATH=. uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
# 另开终端：npm run web -- --host 0.0.0.0
```

Document that phones open `http://<电脑局域网IP>:5173` and do not access port 8000.

- [ ] **Step 2: Run full automated verification**

Run: `npm test && npm run build && npm run web:build`

Expected: all commands exit 0.

- [ ] **Step 3: Run a loopback proxy smoke check**

Run: `curl -fsS http://127.0.0.1:5173/healthz -o /dev/null || true; curl -fsS http://127.0.0.1:5173/api/v1/walls`

Expected: the API call returns a JSON `walls` payload through port 5173 while FastAPI only listens on `127.0.0.1:8000`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe web API proxy access"
```

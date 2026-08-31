# Route Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wall-scoped route browser with filters, route selection, and previous/next navigation.

**Architecture:** Extend the existing client-side route union with a wall-scoped route-browser state. Keep filtering and selected-route state in `main.ts`, reusing `WallCanvasView` for previews without image dimming.

**Tech Stack:** TypeScript, Vite, Vitest, existing `PreviewStore` and `WallCanvasView`.

---

### Task 1: Define the route-browser entry point

**Files:**
- Modify: `web/src/routes.ts`
- Modify: `tests/wall-management-routes.test.ts`

- [x] **Step 1: Write the failing route URL test**

```ts
[{ name: 'route-browser', wallId: 'wall 1' }, '/wall/wall%201/routes']
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/wall-management-routes.test.ts`

Expected: FAIL because `route-browser` is not in `PreviewRoute`.

- [x] **Step 3: Add the route union member and URL mapping**

```ts
| { name: 'route-browser'; wallId: string }
```

```ts
route.name === 'route-browser'
  ? `/wall/${encodeURIComponent(route.wallId)}/routes`
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/wall-management-routes.test.ts`

Expected: PASS.

### Task 2: Render wall information and the route browser

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/device.css`
- Modify: `tests/wall-management-routes.test.ts`

- [x] **Step 1: Write failing source-level behavior tests**

```ts
expect(source).toContain('data-open-route-browser')
expect(source).toContain('data-route-angle')
expect(source).toContain('data-route-grade')
expect(source).toContain('data-route-previous')
expect(source).toContain('data-route-next')
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/wall-management-routes.test.ts`

Expected: FAIL because these route-browser controls are absent.

- [x] **Step 3: Implement state, filtering, and navigation**

```ts
let routeFilterAngle: number | undefined,
  routeFilterGrade: Grade | undefined,
  selectedRouteId = '';
```

Render a wall-information page with a browser button. Render the browser with filter dialogs, a filtered list, selected canvas preview, and disabled previous/next buttons at the filtered-list boundaries.

- [x] **Step 4: Add compact styles for the filter row, list, and route pager**

```css
.route-browser-filters { display:flex; gap:8px; }
.route-pager { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
```

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- --run tests/wall-management-routes.test.ts`

Expected: PASS.

### Task 3: Verify the shipped page

**Files:**
- Verify: `web/src/main.ts`
- Verify: `web/src/routes.ts`

- [x] **Step 1: Run focused tests**

Run: `npm test -- --run tests/wall-management-routes.test.ts`

Expected: PASS.

- [x] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite build exits 0.

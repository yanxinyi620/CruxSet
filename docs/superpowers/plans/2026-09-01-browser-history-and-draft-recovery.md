# Browser History and Draft Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Keep Web routes restorable after browser back gestures, reloads, and mobile background eviction, including temporary editor drafts.

**Architecture:** Extend the existing typed route mapper with URL parsing and let `PreviewStore` own browser history synchronization. Add a small session-storage draft adapter and hydrate editor contexts on entry; clear drafts after save, publish, or explicit exit.

**Tech Stack:** TypeScript, Vite, Vitest, browser History and sessionStorage APIs.

---

### Task 1: URL route parsing and history synchronization

**Files:** Modify `web/src/routes.ts`, `web/src/preview-store.ts`, `web/src/main.ts`; Test `tests/wall-management-routes.test.ts`, new `tests/web-history.test.ts`.

- [ ] Add failing tests for URL parsing, pushState navigation, and popstate restoration.
- [ ] Implement pure `fromPreviewUrl`, store history mode, and startup hydration.
- [ ] Bind `popstate` and make internal navigations push URLs without recursive history entries.

### Task 2: Session draft persistence

**Files:** Create `web/src/draft-storage.ts`; Test new `tests/draft-storage.test.ts`.

- [ ] Add failing tests for JSON-safe save/load/clear and malformed data handling.
- [ ] Implement namespaced sessionStorage helpers.

### Task 3: Editor recovery integration

**Files:** Modify `web/src/main.ts`; Test `tests/web-editor-recovery.test.ts`.

- [ ] Add failing source-level regression tests for draft hydration, updates, and cleanup.
- [ ] Persist wall editor and problem editor temporary state on changes and restore it by route ID.
- [ ] Clear saved drafts on successful save/publish and explicit exit; preserve dirty data through reload.

### Task 4: Verification

- [ ] Run focused tests, full `npm test`, `npm run build`, and `npm run web:build`.
- [ ] Review URL fallback and editor lifecycle behavior for regressions.

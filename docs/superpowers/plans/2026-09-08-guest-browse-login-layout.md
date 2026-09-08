# Guest Browse Login Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clarify the guest browsing entry on the login page while preserving the existing login and registration button layout.

**Architecture:** Keep the existing login markup in `web/src/main.ts`; add a dedicated class and supporting text for the guest action. Extend `web/src/styles/responsive.css` with a separated, full-width guest action that remains touch-friendly on mobile.

**Tech Stack:** TypeScript, HTML template strings, CSS, Vite.

---

### Task 1: Update guest action markup and styles

**Files:**
- Modify: `web/src/main.ts` login rendering block
- Modify: `web/src/styles/responsive.css` login styles

- [ ] Change the guest button label to `访客模式浏览线路` and add a short helper line indicating no login is required.
- [ ] Style the guest action as a visually separate full-width secondary action without changing `.login-actions`.
- [ ] Add hover, focus-visible, active, and mobile spacing states.

### Task 2: Verify the frontend

**Files:**
- Test: existing frontend test suite and production build

- [ ] Run `npm run build`.
- [ ] Run `npm run web:build`.
- [ ] Confirm the working tree contains only the intended UI and plan changes before committing.

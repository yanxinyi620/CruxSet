# Personal Route Cache Implementation Plan

> Execute inline in the current task using executing-plans and test-driven-development; the user has approved implementation.

**Goal:** Remove avoidable waiting when switching to My and My Routes.

**Architecture:** Opt personal list display into the existing identity-scoped persistent browse cache, share wall details, preserve strict editor/permission reads. Add targeted route invalidation and background error reporting without changing cloud APIs.

**Tech Stack:** WeChat mini program TypeScript, Vitest.

## Tasks

- [x] Add behavioral regression tests in `tests/miniprogram-personal-cache.test.ts` and cache-unit coverage in `tests/miniprogram-data-cache.test.ts`. Exercise real services/pages with a controlled WeChat cloud/storage harness. Confirm failures with `npm test -- tests/miniprogram-personal-cache.test.ts tests/miniprogram-data-cache.test.ts`.
- [x] Extend `services/read-cache.ts`: bounded synchronous peek, selected-key invalidation with immediate persistence, background error subscribers. Preserve unrelated in-flight responses while rejecting removed entries.
- [x] Extend `services/cloud.ts`: opt-in cached `listMyProblems`, confirmed-user peek, background errors, route-specific invalidation before/after writes. Existing editing and permission services retain strict reads.
- [x] Add `services/personal-data.ts` for complete personal list reads, wall sharing and grouping; integrate background error subscription in `services/browse-page.ts`.
- [x] Update `pages/me/index.ts` and `pages/me/problems/index.ts`: synchronous cached render, independent administrator refresh, retained content/expansion, visible-page subscriptions and stale-request guards. Update templates for nonblocking refresh feedback.
- [x] Run regression tests, `npm run build`, and review final diff. Add real race/error cases revealed during review before fixes. Update cache documentation with preserved existing edits.


## Verification results

- Focused regression tests failed before implementation, then passed.
- Code review identified personal-list eviction at 100 routes; a 120-route regression reproduced it. Personal display lists now remain a single cache entry, preserving wall data.
- A malformed persisted-key regression reproduced route-write failure; invalidation now discards malformed keys.
- Full repository run before the final malformed-key guard: 89 files, 485 tests passed.
- Final mini program regression after that guard: 24 files, 95 tests passed.
- Final `npm run build`: passed (project and mini program type checks).
- No cloud-function or Web changes required. No mini program upload or real-device timing performed.

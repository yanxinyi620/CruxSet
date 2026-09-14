# Lab polling implementation plan

Goal: Reduce idle requests in both shared Web lab modes while preserving progress and cross-tab updates.
Architecture: Runtime provides a serialized adaptive poller. Experiments, calibrations and publication requests refresh independently. Hidden pages pause; visibility restoration refreshes. Authorization failures stop automatic traffic, transient failures back off to 120 seconds. Stable rendered HTML is retained.
Tech stack: Vanilla browser JavaScript, Vitest VM and fake timers.

- [x] Add behavioral timer tests and verify failure.
- [x] Add runtime scheduler and status-bearing request errors.
- [x] Integrate separate workbench loaders, mutation refresh and unchanged-content rendering.
- [x] Run focused tests, Web builds and review diff.

Approved design: user accepted the preceding optimization recommendations. Active task/publication interval 5s, pending review/admin interval 30s, idle lists 60s. Calibration refreshes on mutation, page return and low-frequency fallback. No API or authorization caching changes.

Validation: 30 focused Vitest cases, cloud/local Web builds, and repository TypeScript checks. Code review follow-ups cover explicit authorization recovery and preserving queued mutation intent.

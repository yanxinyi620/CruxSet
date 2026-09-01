# Test Baseline Alignment Design

## Goal

Make the failing test baseline describe the current, approved CruxSet behavior without changing product behavior or weakening regression coverage.

## Scope

Only these existing failures are in scope:

1. `tests/problem-service.test.ts` expects the retired global route-number format.
2. `tests/web-visual-restoration.test.ts` expects retired, exact source strings for the login heading and editor chips.
3. `tests/wall-management-routes.test.ts` expects a retired direct panel assignment.

The intermittent Vitest `ENODATA` runner error is investigated separately. It is not a reason to alter a product test unless it is reproducible and traceable to project code or test configuration.

## Approved Product Behavior

- Route numbers use wall number plus sequence within that wall. The first route on wall 1 is `CS-010001`.
- The login screen presents the CruxSet creative workspace and offers login and registration actions.
- A user can choose “新建线路” from the Create tab and reach the new-route panel.
- The route editor presents its role controls and metadata inputs.

## Test Design

- Keep the problem-number test, but assert the approved format and add a same-wall second-route assertion so the test protects the per-wall sequence rule.
- Retain UI-source tests only for durable user-facing structure and interaction markers. Do not require exact markup that is incidental to a styling refactor, such as a specific heading nesting arrangement or deprecated `chip` class.
- Retain the Create-tab test, but verify the current `data-panel="new-route"` route and the generic panel event handler rather than a hand-written assignment that no longer exists.
- Do not touch product source files unless the test investigation finds an actual behavior mismatch.

## Verification

Run each modified test file first, then run `npm test`, `npm run build`, and `npm run web:build`. Report `ENODATA` separately if it recurs after the deterministic test failures are resolved.

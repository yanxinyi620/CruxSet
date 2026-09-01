# Stable Wall Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Persist a wall number on each wall and use it as the route-number prefix without renumbering existing routes.

**Architecture:** creator.py assigns missing legacy numbers in creation order through replace_wall. Both web-created and segmentation-published walls use the current maximum number plus one. Route creation reads the stored number.

**Tech Stack:** FastAPI, Python, pytest, repository protocol implementations.

---

### Task 1: Test and implement web wall numbers

**Files:**
- Modify: server/tests/test_creator_lifecycle_api.py
- Modify: server/app/api/creator.py

- [ ] Step 1: Add a test with existing wallNumber values 1 and 3; create a wall and assert the response has wallNumber 4.
- [ ] Step 2: Run cd server && uv run pytest tests/test_creator_lifecycle_api.py -q. Expected: FAIL because new walls lack wallNumber.
- [ ] Step 3: Add an _ensure_wall_numbers helper. It sorts legacy walls by createdAt then ID, writes consecutive missing integers using replace_wall, and returns all walls. Add an _next_wall_number helper that returns the maximum stored value plus one.
- [ ] Step 4: Add wallNumber from _next_wall_number to POST /walls and use the stored wallNumber in POST /problems instead of the list index.
- [ ] Step 5: Run cd server && uv run pytest tests/test_creator_lifecycle_api.py -q. Expected: PASS.
- [ ] Step 6: Commit server/app/api/creator.py and server/tests/test_creator_lifecycle_api.py with message feat: persist wall numbers for route prefixes.

### Task 2: Cover experiment publishing and verify local migration

**Files:**
- Modify: server/tests/test_segmentation_publish_api.py
- Modify: server/app/api/creator.py
- Verify: server/data/cruxset.db (runtime data only)

- [ ] Step 1: Add a test that publishes a segmentation wall after a wall numbered 3 and asserts the saved published wall has wallNumber 4.
- [ ] Step 2: Run cd server && uv run pytest tests/test_segmentation_publish_api.py -q. Expected: FAIL because published walls lack wallNumber.
- [ ] Step 3: Add wallNumber from _next_wall_number to the segmentation publishing wall dictionary.
- [ ] Step 4: Run cd server && uv run pytest tests/test_creator_lifecycle_api.py tests/test_segmentation_publish_api.py -q && cd .. && npm run build && npm run web:build. Expected: all commands pass.
- [ ] Step 5: Call GET /api/v1/walls as the local administrator to trigger the safe backfill. Inspect stored wall records: they must be 1, 2, 3 by creation order; all existing problem number fields must be unchanged.
- [ ] Step 6: Commit server/app/api/creator.py and server/tests/test_segmentation_publish_api.py with message feat: number segmentation-published walls.

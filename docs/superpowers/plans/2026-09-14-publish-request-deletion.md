# Completed publication request deletion

User request: local and cloud workbenches allow deleting published/rejected requests, removing them from both parties' lists; use existing danger buttons/confirmation; wall IDs appear only in the published status tooltip.

Design: administrator or owning applicant may DELETE a completed review request. Persist a shared deletion timestamp, exclude deleted requests from lists and public endpoints, retain published deduplication receipts and destination walls. Pending/publishing/failed requests reject deletion with 409. Local updates use the request lock; cloud updates conditionally change terminal records. Existing polling updates other open pages.

- [x] Add failing local/cloud API and shared UI behavior tests.
- [x] Implement local deletion, D1 migration and cloud deletion with authorization/state checks.
- [x] Add shared danger button, confirmation and status tooltip; refresh request list after deletion.
- [x] Run tests, builds, typechecks and independent review; document migration requirement.

Validation: 67 focused Vitest tests, 26 local Python publication tests, cloud/local Web builds, edge and repository TypeScript checks passed. Independent review found no actionable issues. Apply migration 0016 before cloud deployment; no deployment performed.

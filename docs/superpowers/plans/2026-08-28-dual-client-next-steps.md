# Dual-Client Next Steps Implementation Plan

**Goal:** Complete the local Web creation loop, publish approved Web content to CloudBase, and independently finish Mini Program CloudBase verification.

**Architecture:** `web/ → server/ → SQLite + local media` is an offline-first administrator workspace. `miniprogram/ → cloudfunctions/ → CloudBase` remains an independent mobile path. Only validated published packages move from Web to CloudBase; drafts never synchronize.

## Current baseline

- [x] Responsive Web shell, LAN access, local administrator password login.
- [x] SQLite persistence, local image upload, fixed demo Wall / two Layouts / four Problems.
- [x] Web reads SQLite data after login and can create a Wall plus draft Layout from an image.
- [x] Mini Program Mock mode, three-tab UI, CloudBase adapters and cloud-function skeletons.
- [ ] Web draft annotation save/publish and real Problem writes.
- [ ] Web publication-package export and CloudBase importer.
- [ ] Mini Program CloudBase deployment and real-device acceptance.

## Tasks

1. **Web write completion:** test and implement draft Hold saving, publication lock, Problem create/delete, Wall delete with explicit cascade confirmation; replace remaining Mock write calls.
2. **Web annotation:** add touch pinch zoom, continuous Hold creation, Hold/Volume choice, move/radius/delete/Undo, and server-side normalized-coordinate validation.
3. **Publication package:** export published Wall/Layout/Problems/images to a checksummed zip; reject drafts and invalid references.
4. **CloudBase import:** implement dry-run and explicit `--apply` importer; validate all content before upload/write and persist an import receipt to prevent duplicates.
5. **Mini Program independence:** deploy CloudBase resources, verify imported published content appears in Lines, then verify native user upload/annotation/routing with FastAPI stopped.
6. **Release readiness:** document backup, administrator reset, export/import, rollback; complete Android and iPhone acceptance.

## Required checks

```bash
cd server && uv run pytest -q
npm test
npm run web:build
npm run build
git diff --check
```

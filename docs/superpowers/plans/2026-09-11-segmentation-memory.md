# Segmentation memory implementation plan

Goal: optimize the shared local segmentation pipeline before any Actions work.

Design accepted in conversation: convert each mask early to global polygon/bbox/area; retain only a bit-packed bbox crop for exact pixel IoU and lossless PNG export. No collection of full-image masks. Preserve stable score ordering, tiled IoU > .85, service IoU >= .90, whole-wall filtering against full image area, largest external contour approximation at epsilon=1, and full-resolution PNG compatibility. Empty masks are ignored. Keep legacy AdapterMask compatibility for SAM3 and injected adapters.

Polygon-only deduplication was considered but rejected for this change because simplified external polygons lose holes/disconnected components and can change decisions near thresholds. Compact masks preserve these decisions at a small spatially bounded cost. Generator output for the current tile may still contain many masks; eliminate cross-tile retention first and document this remaining model-library allocation.

- [x] Add reproducible isolated-process benchmark: fixed image hash, dimensions, parameters, versions, elapsed time, peak RSS, candidate bytes/count, persisted geometry.
- [x] Capture baseline from untouched source, run existing tests.
- [x] Add failing tests for compact representation, offsets, exact IoU, holes/disconnected components, tile ordering and PNG/geometry equivalence.
- [x] Implement compact candidates and bbox-local comparisons in shared adapter/service.
- [x] Run regression tests and repeat benchmark with identical inputs/configuration; compare geometry and masks and report measured scope honestly.
- [x] Document reproduction, measured results and remaining limits. No Actions changes.

Validation outcome: 1536 real SAM2 and synthetic comparisons match exact candidate JSON and all PNG hashes. Optimized 4K completed at 2525.63 MiB peak RSS. The user explicitly ended the old 4K run after its observed peak reached 10790.10 MiB; no full 4K before/after output equivalence is claimed. Reports are in docs/benchmarks/2026-09-11-segmentation-memory.md. Postprocessing/write failures now mark API tasks failed.

Follow-up authorized before commit: correct the actual local/Cloudflare authentication mismatch in CruxSetPublisher, retain the original Bearer regression test, add transmitted-metadata HMAC and target-routing tests. Verified: 97 lab tests and 4 server publishing tests pass.

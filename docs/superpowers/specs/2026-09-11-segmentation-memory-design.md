# Shared segmentation candidate memory

Scope approved in conversation: optimize the local segmentation workbench's shared core before testing GitHub Actions. No deployment, workflow or UI change. A later explicit user request also covers fixing the existing publishing authentication failure; local publishing uses Bearer and Cloudflare explicitly selects HMAC.

## Representation and lifecycle

SAM2 and SAM2 tiled produce CompactCandidate records with global polygon, bbox, pixel area, score and source metadata. Each record also owns immutable bytes encoding the bbox-local mask, packed row-wise at eight pixels per byte. Cropping uses row/column occupancy reductions rather than constructing one coordinate pair for every foreground pixel. No candidate owns a full-canvas ndarray.

Each current-tile output is polygonized with the existing largest external contour and epsilon=1 pixel, translated to global coordinates and packed. Consumed list entries are released immediately. Once conversion completes, all dense arrays from that tile are releasable before processing the next tile. The Transformers generator can still allocate a dense batch for the current tile internally; this change does not replace that model-library implementation.

## Deduplication and compatibility

Keep stable descending score order, tiled strict IoU > 0.85, then service IoU >= 0.90. Reject whole-wall candidates only in the service using full input width × height (area > 50%). Use bbox intersection and area-ratio upper bounds before decoding pixels. Decode only overlapping packed rows/bytes and calculate exact binary intersection and union from stored areas.

Do not use simplified polygon IoU: largest external contours omit holes and smaller disconnected components, so polygon-based IoU would change selection. Packed pixels retain this information losslessly. Their storage follows bbox area / 8 rather than candidate count × canvas area; pathological candidates spanning the canvas still cost more than small holds.

Preserve candidate JSON schema and full-resolution PNG files. Materialize and write one PNG at a time, then release its array. Calibration, SVG export and wall publishing keep their existing polygon data. Legacy AdapterMask results from SAM3 and test adapters remain accepted by the service. Empty masks are skipped rather than failing the task.

## Verification

Compare frozen pre-change source at commit 610b70f1f27538280182b46d84f40a5e982afad0 against the current source with identical image bytes, resize, parameters and runtime versions. Use new processes so peak RSS is independent per run. Record end-to-end elapsed seconds, peak RSS, retained candidate mask bytes after adapter deduplication, candidate/polygon counts, exact persisted candidate JSON and PNG SHA-256 hashes.

Run the tracked 4096×3072 wall photo at original resolution and at 1536×1152 with points=48, batch=8, IoU=.85, stability=.9, crop layers=0, four CPU threads and cached SAM 2.1 large weights. Also use deterministic synthetic tile masks to isolate postprocessing memory from model inference. The synthetic test is not an end-to-end SAM2 memory claim. Runs share a host; timings are observational, not controlled speedup measurements.

Regression tests cover global offsets, holes and disconnected pixels, empty inputs, bbox-local IoU, strict/inclusive threshold boundaries, stable ties, full-image area filtering, canvas-independent small-candidate storage, array release between tiles, randomized dense-reference comparison, a frozen pre-change JSON fixture, PNG reconstruction and benchmark report validation.

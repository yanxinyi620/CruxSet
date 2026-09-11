# Local Lab Integration Plan

**Goal:** Unify local lab access and assets while retaining the separate inference service.
**Architecture:** Shared Vite asset builder with local/cloud profiles, a prefix-rewriting proxy, and build-time local entry capability constrained to local hosts. Keep storage and runner code intact.

- [x] Add failing Vite integration tests for nested pages, local config, cloud build config, API prefix rewriting (method/body/query) and unavailable backend handling.
- [x] Extract web/segmentation-lab-assets.ts for shared page mapping/config/build. Update web/vite.config.ts and add separate local build/preview commands.
- [x] Add local-host detection and local entry capability, retain cloud permissions and new-tab behavior. Fix the shared results page return link and trailing slash ID handling.
- [x] Update dev startup to allow local-only usage without CloudBase config.
- [x] Update local documentation and run tests, TypeScript checks, both builds, live local HTTP and browser checks. Verify cloud output last and retain production deployment unchanged.

## Verification

- 267 TypeScript tests and 112 Python lab tests passed; TypeScript checks and both local/cloud builds passed.
- Vite dev and built preview integration tests exercise request method/body/query rewriting, deep pages, runtime profiles, and offline-lab isolation.
- Browser read-only inspection loaded existing lab images and confirmed results return link. A mocked administrator bootstrap verified the main-page local entry and new-tab behavior; no local account or experiment was changed.
- Existing 5173/8000/8765 processes kept running. Temporary verification servers/browser closed. Production was not redeployed and system Caddy configuration was not overwritten. The old public deployment mode has since been retired.
- Independent review found no actionable issues.

# Wall Image Cache Design

## Goal

Avoid repeat transfers and repeat image decoding when the same published wall image is opened in route browsing, full-screen preview, route creation, or route editing.

## Scope

The change applies to images served by the local `GET /api/v1/media/{media_id}` endpoint and to the web application's `WallCanvasView`. It does not alter image uploads, image IDs, coordinate systems, segmentation publication, or CloudBase-hosted image URLs.

## Design

The media endpoint will return `Cache-Control: private, max-age=31536000, immutable` for an authorized image. Media IDs are random, are never overwritten, and a changed image gets a new ID, so a long immutable cache lifetime is valid. `private` limits reuse to the visitor's browser cache rather than shared caches, which preserves the current authorization model for private walls.

The web app will add a small module-level image loader keyed by the normalized source URL. A request for the same URL returns the same pending or loaded `HTMLImageElement`; loading failures remove that key so a later render can retry. `WallCanvasView` will use this loader rather than constructing its own image. This keeps rendering and canvas behavior unchanged while preventing repeated downloads and decodes during app navigation or re-renders.

## Error Handling

Failed loads retain the current canvas error state. Failed entries are removed from the in-memory cache; an image that later becomes available can therefore be requested again.

## Verification

Server tests will assert that an authorized media response includes the exact cache directive. Frontend tests will verify that repeated loads of one URL construct only one `Image`, share a pending load, and evict a failed load for retry. The existing full test suite and production web build will be run after the changes.

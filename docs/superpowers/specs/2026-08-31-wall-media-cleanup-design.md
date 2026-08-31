# Wall media cleanup design

## Goal

When an administrator deletes a wall that has no associated routes, remove its original image and optional display image from local media storage if no remaining wall references either file.

## Behaviour

1. The existing route-reference guard remains first: a wall with routes returns `WALL_IN_USE` and neither wall data nor media is removed.
2. For a deletable wall, capture the basename of `imageFileId` and `displayImageFileId` before deleting the wall document. Both raw media IDs and `/api/v1/media/<id>` URLs are supported.
3. Delete the wall document.
4. For each captured media ID, inspect the remaining walls. Delete its local media file only if no remaining wall refers to that ID in either image field.
5. A missing, invalid, or already deleted media file does not make the wall deletion fail. Repeated image IDs are processed only once.

## Boundaries

- Route deletion is unchanged and does not remove wall images.
- Media files that are shared by multiple walls remain available until the final referencing wall is deleted.
- Only files inside the configured `CRUXSET_MEDIA_DIR` are eligible; path traversal input is ignored.

## Tests

- Deleting a wall whose image has no other reference removes both the wall and image file.
- Deleting a wall whose image is referenced by another wall removes only the wall data and retains the image file.
- Existing in-use wall deletion remains rejected.

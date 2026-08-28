import os
import secrets
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/v1/media", tags=["media"])

_allowed_types = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _media_directory() -> Path:
    directory = Path(os.environ.get("CRUXSET_MEDIA_DIR", "./data/media"))
    directory.mkdir(parents=True, exist_ok=True)
    return directory


@router.post("/images", status_code=201)
async def upload_image(file: UploadFile = File(...)):
    extension = _allowed_types.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are supported")
    content = await file.read()
    if len(content) > int(os.environ.get("MAX_UPLOAD_BYTES", "10485760")):
        raise HTTPException(status_code=413, detail="Image is too large")
    media_id = f"media_{secrets.token_urlsafe(12)}{extension}"
    (_media_directory() / media_id).write_bytes(content)
    return {"media": {"id": media_id, "url": f"/api/v1/media/{media_id}", "contentType": file.content_type, "size": len(content)}}


@router.get("/{media_id}")
async def read_media(media_id: str):
    if Path(media_id).name != media_id:
        raise HTTPException(status_code=404, detail="Media not found")
    path = _media_directory() / media_id
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path)

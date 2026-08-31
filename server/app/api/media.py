import os
import secrets
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.auth.sessions import read_session, session_cookie_name

router = APIRouter(prefix="/api/v1/media", tags=["media"])

_allowed_types = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _media_directory() -> Path:
    directory = Path(os.environ.get("CRUXSET_MEDIA_DIR", "./data/media"))
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def store_image(content: bytes, content_type: str) -> dict[str, object]:
    extension = _allowed_types.get(content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are supported")
    if len(content) > int(os.environ.get("MAX_UPLOAD_BYTES", "10485760")):
        raise HTTPException(status_code=413, detail="Image is too large")
    media_id = f"media_{secrets.token_urlsafe(12)}{extension}"
    (_media_directory() / media_id).write_bytes(content)
    return {"id": media_id, "url": f"/api/v1/media/{media_id}", "contentType": content_type, "size": len(content)}


@router.post("/images", status_code=201)
async def upload_image(file: UploadFile = File(...)):
    content = await file.read()
    return {"media": store_image(content, file.content_type or "")}


@router.get("/{media_id}")
async def read_media(media_id: str, request: Request):
    if Path(media_id).name != media_id:
        raise HTTPException(status_code=404, detail="Media not found")
    path = _media_directory() / media_id
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    walls = [
        wall for wall in request.app.state.repository.list_walls()
        if media_id in (wall.get("imageFileId"), wall.get("displayImageFileId"))
    ]
    if not walls:
        raise HTTPException(status_code=404, detail="Media not found")
    if not any(wall.get("visibility") == "public" for wall in walls):
        user_id = read_session(request.cookies.get(session_cookie_name()))
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        repository = request.app.state.repository
        is_admin = repository.find_admin_by_user_id(user_id) is not None
        is_owner = any(wall.get("ownerId") == user_id for wall in walls)
        if not is_admin and not is_owner:
            raise HTTPException(status_code=403, detail="Forbidden")
    return FileResponse(path)

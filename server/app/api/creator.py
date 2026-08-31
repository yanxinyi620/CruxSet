import secrets
import time
import json
import math
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.api.auth import require_admin
from app.api.errors import ApiError
from app.auth.sessions import read_session, session_cookie_name
from app.api.media import store_image

router = APIRouter(prefix="/api/v1", tags=["creator"])


class WallInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    imageFileId: str = Field(min_length=1)
    displayImageFileId: str | None = None
    imageWidth: int = Field(gt=0)
    imageHeight: int = Field(gt=0)
    angleOptions: list[int] = Field(default_factory=lambda: [20, 25, 30, 35, 40, 45])


class HoldsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    holds: list[dict[str, Any]]


class ProblemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wallId: str
    angle: int = 20
    grade: str = "V0"
    holds: dict[str, list[str]] = Field(default_factory=dict)
    footRule: str = "feet_follow"
    name: str | None = None
    description: str | None = None


def _repo(request: Request):
    return request.app.state.repository


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def _now() -> int:
    return int(time.time() * 1000)


def _publish_key(request: Request, authorization: str | None) -> None:
    expected = getattr(request.app.state, "segmentation_publish_key", "")
    if not expected:
        raise ApiError("PUBLISH_NOT_CONFIGURED", "Segmentation publishing is not configured", 503)
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not authorization or not authorization.startswith("Bearer ") or not secrets.compare_digest(supplied, expected):
        raise ApiError("UNAUTHORIZED", "Invalid publish credentials", 401)


def _segmentation_holds(raw_holds: Any, width: int, height: int) -> list[dict[str, Any]]:
    if not isinstance(raw_holds, list) or not raw_holds:
        raise ApiError("INVALID_INPUT", "At least one hold is required", 422)
    result = []
    seen: set[str] = set()
    for item in raw_holds:
        if not isinstance(item, dict) or not isinstance(item.get("sourceId"), str) or not item["sourceId"] or item["sourceId"] in seen:
            raise ApiError("INVALID_INPUT", "Hold source ids must be non-empty and unique", 422)
        seen.add(item["sourceId"])
        polygon = item.get("polygon")
        if not isinstance(polygon, list) or len(polygon) < 3:
            raise ApiError("INVALID_INPUT", f"Invalid polygon for {item['sourceId']}", 422)
        points: list[tuple[float, float]] = []
        for point in polygon:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ApiError("INVALID_INPUT", f"Invalid polygon for {item['sourceId']}", 422)
            x, y = point
            if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in (x, y)) or not (0 <= x <= width and 0 <= y <= height):
                raise ApiError("INVALID_INPUT", f"Polygon is outside image for {item['sourceId']}", 422)
            points.append((float(x) / width, float(y) / height))
        if len(set(points)) < 3:
            raise ApiError("INVALID_INPUT", f"Invalid polygon for {item['sourceId']}", 422)
        area = abs(sum(points[index][0] * points[(index + 1) % len(points)][1] - points[(index + 1) % len(points)][0] * points[index][1] for index in range(len(points))) / 2)
        if area <= 0:
            raise ApiError("INVALID_INPUT", f"Polygon area is empty for {item['sourceId']}", 422)
        xs, ys = zip(*points)
        bbox = [min(xs), min(ys), max(xs), max(ys)]
        result.append({"sourceId": item["sourceId"], "kind": item.get("kind", "hold"), "polygon": [[x, y] for x, y in points], "bbox": bbox, "x": sum(xs) / len(xs), "y": sum(ys) / len(ys), "radius": math.sqrt(area / math.pi)})
    if any(item["kind"] not in ("hold", "volume") for item in result):
        raise ApiError("INVALID_INPUT", "Invalid hold kind", 422)
    result.sort(key=lambda item: (item["bbox"][1], item["bbox"][0], item["sourceId"]))
    for index, item in enumerate(result, 1):
        item["id"] = f"H{index:03d}"
        item.pop("bbox", None)
    return result


@router.post("/admin/segmentation-walls")
async def publish_segmentation_wall(request: Request, image: UploadFile = File(...), metadata: str = Form(...), authorization: str | None = None):
    _publish_key(request, authorization or request.headers.get("Authorization"))
    try:
        payload = json.loads(metadata)
    except json.JSONDecodeError as error:
        raise ApiError("INVALID_INPUT", "Metadata must be valid JSON", 422) from error
    if not isinstance(payload, dict):
        raise ApiError("INVALID_INPUT", "Metadata must be an object", 422)
    try:
        width, height = int(payload["imageWidth"]), int(payload["imageHeight"])
        request_id, name = str(payload["publishRequestId"]), str(payload["wallName"])
        experiment_id, calibration_id = str(payload["sourceExperimentId"]), str(payload["sourceCalibrationId"])
    except (KeyError, TypeError, ValueError) as error:
        raise ApiError("INVALID_INPUT", "Missing publish metadata", 422) from error
    if width <= 0 or height <= 0 or not request_id or not name:
        raise ApiError("INVALID_INPUT", "Invalid publish metadata", 422)
    existing = next((wall for wall in _repo(request).list_walls() if wall.get("source", {}).get("publishRequestId") == request_id), None)
    if existing:
        source = existing.get("source", {})
        if source.get("calibrationId") != calibration_id or existing.get("imageWidth") != width or existing.get("imageHeight") != height:
            raise ApiError("PUBLISH_REQUEST_CONFLICT", "Publish request id was already used with different data", 409)
        return JSONResponse(status_code=200, content={"wallId": existing["id"], "wallName": existing["name"], "holdCount": len(existing.get("holds", [])), "browsePath": f"/wall/{existing['id']}", "created": False})
    holds = _segmentation_holds(payload.get("holds"), width, height)
    owner_id = getattr(request.app.state, "segmentation_publish_owner_id", "")
    if not owner_id or not _repo(request).find_admin_by_user_id(owner_id):
        raise ApiError("PUBLISH_NOT_CONFIGURED", "Segmentation publishing owner is not configured", 503)
    content = await image.read()
    media = store_image(content, image.content_type or "")
    now = _now()
    wall = {"id": _id("wall"), "name": name, "description": str(payload.get("description", "")), "imageFileId": media["id"], "imageWidth": width, "imageHeight": height, "geometryType": "polygon", "holds": holds, "published": True, "angleOptions": payload.get("angleOptions", [20, 25, 30, 35, 40, 45]), "ownerId": owner_id, "visibility": "public", "source": {"type": "segmentation_lab", "experimentId": experiment_id, "calibrationId": calibration_id, "publishRequestId": request_id}, "createdAt": now, "updatedAt": now}
    _repo(request).insert_wall(wall)
    return JSONResponse(status_code=201, content={"wallId": wall["id"], "wallName": wall["name"], "holdCount": len(holds), "browsePath": f"/wall/{wall['id']}", "created": True})


def _validate_hold_shape(holds: list[dict]) -> None:
    known: set[str] = set()
    for hold in holds:
        hold_id = hold.get("id")
        if not isinstance(hold_id, str) or not hold_id or hold_id in known:
            raise ApiError("INVALID_INPUT", "Hold ids must be non-empty and unique", 422)
        known.add(hold_id)
        values = (hold.get("x"), hold.get("y"), hold.get("radius"))
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in values):
            raise ApiError("INVALID_INPUT", "Hold coordinates must be numbers", 422)
        x, y, radius = values
        if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < radius <= .5):
            raise ApiError("INVALID_INPUT", "Hold geometry must be normalized", 422)
        if hold.get("kind", "hold") not in ("hold", "volume"):
            raise ApiError("INVALID_INPUT", "Invalid hold kind", 422)


def _editable_wall(request: Request, wall_id: str) -> dict:
    wall = _repo(request).find_wall(wall_id)
    if not wall:
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    return wall


def _visible_walls(request: Request) -> list[dict]:
    repository = _repo(request)
    user_id = read_session(request.cookies.get(session_cookie_name()))
    if user_id and repository.find_user(user_id) and repository.find_admin_by_user_id(user_id):
        return repository.list_walls()
    return [
        wall for wall in repository.list_walls()
        if wall.get("visibility") == "public" or (user_id and wall.get("ownerId") == user_id)
    ]


@router.get("/walls")
async def list_walls(request: Request):
    return {"walls": _visible_walls(request)}


@router.get("/problems")
async def list_problems(request: Request):
    visible_wall_ids = {wall["id"] for wall in _visible_walls(request)}
    return {"problems": [problem for problem in _repo(request).list_problems() if problem.get("wallId") in visible_wall_ids]}


@router.post("/walls", status_code=201)
async def create_wall(payload: WallInput, request: Request, user=Depends(require_admin)):
    now = _now()
    wall = {
        "id": _id("wall"), "name": payload.name, "description": payload.description,
        "imageFileId": payload.imageFileId, "imageWidth": payload.imageWidth, "imageHeight": payload.imageHeight,
        "geometryType": "circle", "holds": [], "published": False,
        "angleOptions": payload.angleOptions, "ownerId": user["id"], "visibility": "private",
        "createdAt": now, "updatedAt": now,
    }
    if payload.displayImageFileId:
        wall["displayImageFileId"] = payload.displayImageFileId
    _repo(request).insert_wall(wall)
    return {"wall": wall}


@router.put("/walls/{wall_id}/holds")
async def save_wall_holds(wall_id: str, payload: HoldsInput, request: Request, user=Depends(require_admin)):
    wall = _editable_wall(request, wall_id)
    if wall.get("published") or wall.get("visibility") == "public":
        raise ApiError("WALL_LOCKED", "Published wall geometry is locked", 409)
    _validate_hold_shape(payload.holds)
    wall = {**wall, "holds": payload.holds, "updatedAt": _now()}
    _repo(request).replace_wall(wall)
    return {"wall": wall}


@router.post("/walls/{wall_id}/publish")
async def publish_wall(wall_id: str, request: Request, user=Depends(require_admin)):
    wall = _editable_wall(request, wall_id)
    if wall.get("published") or wall.get("visibility") == "public":
        raise ApiError("WALL_LOCKED", "Wall is already published", 409)
    holds = wall.get("holds", [])
    _validate_hold_shape(holds)
    if len(holds) < 2:
        raise ApiError("WALL_NOT_ROUTABLE", "Published wall requires at least two holds", 409)
    wall = {**wall, "published": True, "visibility": "public", "updatedAt": _now()}
    _repo(request).replace_wall(wall)
    return {"wall": wall}


@router.delete("/problems/{problem_id}")
async def delete_problem(problem_id: str, request: Request, _=Depends(require_admin)):
    if not _repo(request).find_problem(problem_id):
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    _repo(request).delete_problem(problem_id)
    return {"ok": True}


@router.delete("/walls/{wall_id}")
async def delete_wall(wall_id: str, request: Request, user=Depends(require_admin)):
    _editable_wall(request, wall_id)
    count = _repo(request).count_problems_for_wall(wall_id)
    if count:
        raise ApiError("WALL_IN_USE", "Wall is referenced by problems", 409, {"problemCount": count})
    _repo(request).delete_wall(wall_id)
    return {"ok": True}


@router.post("/problems", status_code=201)
async def create_problem(payload: ProblemInput, request: Request, user=Depends(require_admin)):
    wall = _repo(request).find_wall(payload.wallId)
    if not wall:
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    if not wall.get("published") or wall.get("visibility") != "public" or len(wall.get("holds", [])) < 2:
        raise ApiError("WALL_NOT_ROUTABLE", "Wall is not public and routable", 409)
    if payload.angle not in wall["angleOptions"] or payload.grade not in {f"V{i}" for i in range(13)}:
        raise ApiError("INVALID_INPUT", "Invalid route data", 422)
    roles = ("start", "foot", "hand", "assist", "finish")
    holds = {role: payload.holds.get(role, []) for role in roles}
    if not holds["start"] or not holds["finish"]:
        raise ApiError("INVALID_INPUT", "Start and finish holds are required", 422)
    known = {hold["id"] for hold in wall["holds"]}
    assigned = [hold for values in holds.values() for hold in values]
    if len(set(assigned)) != len(assigned) or not set(assigned).issubset(known):
        raise ApiError("INVALID_INPUT", "Invalid route holds", 422)
    now = _now()
    problem = {
        "id": _id("problem"), "number": f"CS-{len(_repo(request).list_problems()) + 1:06d}",
        "wallId": wall["id"], "name": payload.name, "description": payload.description,
        "angle": payload.angle, "grade": payload.grade, "footRule": payload.footRule, "holds": holds,
        "createdBy": user["id"], "createdAt": now, "updatedAt": now,
    }
    _repo(request).insert_problem(problem)
    return {"problem": problem}

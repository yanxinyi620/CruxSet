import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.auth import require_admin
from app.api.errors import ApiError
from app.auth.sessions import read_session, session_cookie_name

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

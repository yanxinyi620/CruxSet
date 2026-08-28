import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.api.auth import require_admin
from app.api.errors import ApiError

router = APIRouter(prefix="/api/v1", tags=["creator"])


class WallInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    angleOptions: list[int] = Field(default_factory=lambda: [20, 25, 30, 35, 40, 45])


class LayoutInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    imageFileId: str = Field(min_length=1)
    imageWidth: int = Field(gt=0)
    imageHeight: int = Field(gt=0)


class HoldsInput(BaseModel):
    holds: list[dict[str, Any]]


class ProblemInput(BaseModel):
    wallId: str
    layoutId: str
    angle: int = 20
    grade: str = "V0"
    holds: dict[str, list[str]] = Field(default_factory=dict)
    footRule: str = "feet_follow"
    name: str | None = None
    description: str | None = None


def _repo(request):
    return request.app.state.repository


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def _now() -> int:
    return int(time.time() * 1000)


@router.get("/walls")
async def list_walls(request: Request):
    return {"walls": _repo(request).list_walls()}


@router.get("/walls/{wall_id}/layouts")
async def list_layouts(wall_id: str, request: Request):
    if not _repo(request).find_wall(wall_id):
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    return {"layouts": _repo(request).list_layouts(wall_id)}


@router.get("/problems")
async def list_problems(request: Request):
    return {"problems": _repo(request).list_problems()}


@router.post("/walls", status_code=201)
async def create_wall(payload: WallInput, request: Request, user=Depends(require_admin)):
    now = _now()
    wall = {"id": _id("wall"), "name": payload.name, "description": payload.description,
            "activeLayoutId": "", "angleOptions": payload.angleOptions, "ownerId": user["id"],
            "visibility": "private", "createdAt": now, "updatedAt": now}
    _repo(request).insert_wall(wall)
    return {"wall": wall}


@router.post("/walls/{wall_id}/layouts", status_code=201)
async def create_layout(wall_id: str, payload: LayoutInput, request: Request, user=Depends(require_admin)):
    wall = _repo(request).find_wall(wall_id)
    if not wall:
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    now = _now()
    layout = {"id": _id("layout"), "wallId": wall_id, "name": payload.name, "imageFileId": payload.imageFileId,
              "imageWidth": payload.imageWidth, "imageHeight": payload.imageHeight, "geometryType": "circle",
              "version": 1, "published": False, "holds": [], "createdAt": now, "updatedAt": now}
    _repo(request).insert_layout(layout)
    return {"layout": layout}


@router.post("/layouts/{layout_id}/publish")
async def publish_layout(layout_id: str, payload: HoldsInput, request: Request, _=Depends(require_admin)):
    layout = _repo(request).find_layout(layout_id)
    if not layout:
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    if layout["published"]:
        raise ApiError("LAYOUT_LOCKED", "Layout is already published", 409)
    holds = payload.holds
    if len(holds) < 2:
        raise ApiError("LAYOUT_NOT_ROUTABLE", "Published layout requires at least two holds", 409)
    layout = {**layout, "holds": holds, "published": True, "version": int(layout["version"]) + 1, "updatedAt": _now()}
    _repo(request).replace_layout(layout)
    return {"layout": layout}


@router.delete("/layouts/{layout_id}")
async def delete_layout(layout_id: str, request: Request, confirmCascade: bool = False, _=Depends(require_admin)):
    layout = _repo(request).find_layout(layout_id)
    if not layout:
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    if not confirmCascade:
        raise ApiError("INVALID_INPUT", "Cascade deletion requires confirmation", 422)
    _repo(request).delete_problems_for_layout(layout_id)
    _repo(request).delete_layout(layout_id)
    return {"ok": True}


@router.post("/problems", status_code=201)
async def create_problem(payload: ProblemInput, request: Request, user=Depends(require_admin)):
    wall = _repo(request).find_wall(payload.wallId)
    layout = _repo(request).find_layout(payload.layoutId)
    if not wall or not layout or layout["wallId"] != wall["id"]:
        raise ApiError("NOT_FOUND", "Resource not found", 404)
    if not layout["published"] or len(layout["holds"]) < 2:
        raise ApiError("LAYOUT_NOT_ROUTABLE", "Layout is not routable", 409)
    if payload.angle not in wall["angleOptions"] or payload.grade not in {f"V{i}" for i in range(13)}:
        raise ApiError("INVALID_INPUT", "Invalid route data", 422)
    roles = ("start", "foot", "hand", "assist", "finish")
    holds = {role: payload.holds.get(role, []) for role in roles}
    if not holds["start"] or not holds["finish"]:
        raise ApiError("INVALID_INPUT", "Start and finish holds are required", 422)
    known = {hold["id"] for hold in layout["holds"]}
    assigned = [hold for values in holds.values() for hold in values]
    if len(set(assigned)) != len(assigned) or not set(assigned).issubset(known):
        raise ApiError("INVALID_INPUT", "Invalid route holds", 422)
    now = _now()
    problem = {"id": _id("problem"), "number": f"CS-{len(_repo(request).list_problems()) + 1:06d}", "wallId": wall["id"],
               "layoutId": layout["id"], "layoutVersion": layout["version"], "name": payload.name, "description": payload.description,
               "angle": payload.angle, "grade": payload.grade, "footRule": payload.footRule, "holds": holds,
               "createdBy": user["id"], "createdAt": now, "updatedAt": now}
    _repo(request).insert_problem(problem)
    return {"problem": problem}

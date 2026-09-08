"""Export public Web walls and their display images for Static Assets."""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ExportResult:
    manifest_path: Path


def _documents(connection: sqlite3.Connection, collection: str) -> list[dict[str, Any]]:
    rows = connection.execute(
        "SELECT body FROM documents WHERE collection_name = ? ORDER BY document_id", (collection,)
    ).fetchall()
    return [json.loads(row[0]) for row in rows]


def _media_name(value: object) -> str:
    if not isinstance(value, str) or not value or "/" in value or "\\" in value or value in {".", ".."}:
        raise ValueError("Published walls require a local display image name")
    return value


def _validate_holds(wall: dict[str, Any]) -> set[str]:
    holds = wall.get("holds")
    if not isinstance(holds, list) or len(holds) < 2:
        raise ValueError(f"Wall {wall.get('id', '<missing>')} requires at least two holds")
    hold_ids: set[str] = set()
    for hold in holds:
        if not isinstance(hold, dict) or not isinstance(hold.get("id"), str):
            raise ValueError(f"Wall {wall.get('id', '<missing>')} has an invalid hold")
        hold_id = hold["id"]
        if hold_id in hold_ids:
            raise ValueError(f"Wall {wall['id']} has duplicate Hold ID {hold_id}")
        if not all(isinstance(hold.get(axis), (int, float)) and 0 <= hold[axis] <= 1 for axis in ("x", "y")):
            raise ValueError(f"Wall {wall['id']} has out-of-range Hold coordinates")
        hold_ids.add(hold_id)
    return hold_ids


def _public_wall(wall: dict[str, Any], image_path: str) -> dict[str, Any]:
    allowed = {
        "id", "wallNumber", "name", "description", "imageWidth", "imageHeight", "geometryType", "holds",
        "published", "angleOptions", "ownerId", "visibility", "createdAt", "updatedAt", "source",
    }
    exported = {key: wall[key] for key in allowed if key in wall}
    exported["imageFileId"] = image_path
    exported["displayImageFileId"] = image_path
    return exported


def export_public_snapshot(database: str | Path, media_directory: str | Path, output_directory: str | Path, *, release_id: str) -> ExportResult:
    """Write an isolated Static Assets manifest for published public walls."""
    if not release_id:
        raise ValueError("release_id is required")
    source_media = Path(media_directory).resolve()
    output = Path(output_directory).resolve()
    images = output / "wall-images"
    images.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(f"file:{Path(database).resolve()}?mode=ro", uri=True)
    try:
        walls = [wall for wall in _documents(connection, "walls") if wall.get("visibility") == "public" and wall.get("published") is True]
        problems = _documents(connection, "problems")
    finally:
        connection.close()

    exported_walls: list[dict[str, Any]] = []
    public_wall_ids: set[str] = set()
    holds_by_wall: dict[str, set[str]] = {}
    for wall in walls:
        wall_id = wall.get("id")
        if not isinstance(wall_id, str) or not wall_id:
            raise ValueError("Published wall requires an ID")
        public_wall_ids.add(wall_id)
        holds_by_wall[wall_id] = _validate_holds(wall)
        media = source_media / _media_name(wall.get("displayImageFileId") or wall.get("imageFileId"))
        if not media.is_file() or source_media not in media.resolve().parents:
            raise ValueError(f"Wall {wall_id} display image is missing")
        digest = hashlib.sha256(media.read_bytes()).hexdigest()
        destination_name = f"{digest}{media.suffix.lower()}"
        destination = images / destination_name
        if not destination.exists():
            shutil.copyfile(media, destination)
        image_path = f"wall-images/{destination_name}"
        exported_walls.append({
            "wall": _public_wall(wall, image_path),
            "image": {"path": image_path, "sha256": digest, "bytes": media.stat().st_size, "width": wall.get("imageWidth"), "height": wall.get("imageHeight")},
        })

    exported_problems: list[dict[str, Any]] = []
    for problem in problems:
        wall_id = problem.get("wallId")
        if wall_id not in public_wall_ids:
            continue
        assigned = {
            str(hold_id)
            for values in (problem.get("holds") or {}).values()
            if isinstance(values, list)
            for hold_id in values
        }
        if not assigned <= holds_by_wall[wall_id]:
            raise ValueError(f"Problem {problem.get('id', '<missing>')} references unknown holds")
        allowed = {"id", "number", "wallId", "name", "description", "angle", "grade", "footRule", "holds", "createdBy", "createdAt", "updatedAt"}
        exported_problems.append({key: problem[key] for key in allowed if key in problem})

    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps({"schemaVersion": 1, "releaseId": release_id, "walls": exported_walls, "problems": exported_problems}, ensure_ascii=False, separators=(",", ":")))
    return ExportResult(manifest_path=manifest_path)

import json
import shutil
import sqlite3
from copy import deepcopy
from pathlib import Path


_PARENT_FIELDS = ("description", "angleOptions", "ownerId", "visibility")
_LAYOUT_FIELDS = (
    "name", "imageFileId", "imageUrl", "imageWidth", "imageHeight",
    "geometryType", "holds", "createdAt", "updatedAt",
)


def flatten_legacy_documents(
    walls: list[dict], layouts: list[dict], problems: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Return independent flat walls and rewritten problems."""
    walls_by_id = {str(wall["id"]): wall for wall in walls}
    latest_layouts: dict[str, dict] = {}
    for layout in layouts:
        layout_id = str(layout.get("id", ""))
        parent_id = str(layout.get("wallId", ""))
        if not layout_id or parent_id not in walls_by_id:
            raise ValueError(f"Legacy Layout {layout_id or '<missing>'} has broken parent Wall {parent_id or '<missing>'}")
        current = latest_layouts.get(layout_id)
        if current is None or int(layout.get("version", 0)) > int(current.get("version", 0)):
            latest_layouts[layout_id] = layout

    used_ids = set(walls_by_id)
    wall_ids_by_layout: dict[str, str] = {}
    flat_walls: list[dict] = []
    for layout_id in sorted(latest_layouts):
        layout = latest_layouts[layout_id]
        candidate = f"wall_from_{layout_id}"
        suffix = 2
        while candidate in used_ids:
            candidate = f"wall_from_{layout_id}_{suffix}"
            suffix += 1
        used_ids.add(candidate)
        wall_ids_by_layout[layout_id] = candidate
        parent = walls_by_id[str(layout["wallId"])]
        flat_wall = {"id": candidate}
        for field in _LAYOUT_FIELDS:
            if field in layout:
                flat_wall[field] = deepcopy(layout[field])
        for field in _PARENT_FIELDS:
            if field in parent:
                flat_wall[field] = deepcopy(parent[field])
        flat_walls.append(flat_wall)

    flat_problems: list[dict] = []
    holds_by_layout = {
        layout_id: {str(hold.get("id")) for hold in layout.get("holds", []) if hold.get("id") is not None}
        for layout_id, layout in latest_layouts.items()
    }
    for problem in problems:
        problem_id = str(problem.get("id", "<missing>"))
        layout_id = str(problem.get("layoutId", ""))
        if layout_id not in latest_layouts:
            raise ValueError(f"Legacy Problem {problem_id} references missing Layout {layout_id or '<missing>'}")
        expected_parent = str(latest_layouts[layout_id]["wallId"])
        if str(problem.get("wallId", "")) != expected_parent:
            raise ValueError(f"Legacy Problem {problem_id} has broken parent Wall {problem.get('wallId', '<missing>')}")
        assigned = {
            str(hold_id)
            for values in problem.get("holds", {}).values()
            for hold_id in values
        }
        unknown = sorted(assigned - holds_by_layout[layout_id])
        if unknown:
            raise ValueError(f"Legacy Problem {problem_id} assigns unknown Hold IDs: {', '.join(unknown)}")
        rewritten = deepcopy(problem)
        rewritten["wallId"] = wall_ids_by_layout[layout_id]
        rewritten.pop("layoutId", None)
        rewritten.pop("layoutVersion", None)
        flat_problems.append(rewritten)
    return flat_walls, flat_problems


def migrate_sqlite_wall_only(database: str | Path, backup: str | Path) -> None:
    """Back up and transactionally flatten a legacy document-store database."""
    database_path = Path(database)
    backup_path = Path(backup)
    if backup_path.exists():
        raise FileExistsError(f"Migration backup already exists: {backup_path}")
    shutil.copy2(database_path, backup_path)

    connection = sqlite3.connect(database_path)
    try:
        def load(collection: str) -> list[dict]:
            rows = connection.execute(
                "SELECT body FROM documents WHERE collection_name = ? ORDER BY rowid", (collection,)
            ).fetchall()
            return [json.loads(row[0]) for row in rows]

        flat_walls, flat_problems = flatten_legacy_documents(load("walls"), load("layouts"), load("problems"))
        with connection:
            connection.execute("DELETE FROM documents WHERE collection_name IN ('walls', 'problems')")
            for collection, documents in (("walls", flat_walls), ("problems", flat_problems)):
                connection.executemany(
                    "INSERT INTO documents (collection_name, document_id, body) VALUES (?, ?, ?)",
                    [(collection, str(document["id"]), json.dumps(document, ensure_ascii=False, separators=(",", ":"))) for document in documents],
                )
            connection.execute("DELETE FROM documents WHERE collection_name = 'layouts'")
    finally:
        connection.close()

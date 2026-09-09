"""Import the local public snapshot into a remote D1 database via Wrangler."""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
from pathlib import Path


def sql(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database")
    parser.add_argument("--d1", required=True)
    parser.add_argument("--config", default="edge/wrangler.jsonc")
    args = parser.parse_args()
    connection = sqlite3.connect(f"file:{Path(args.database).resolve()}?mode=ro", uri=True)
    try:
        walls = [json.loads(row[0]) for row in connection.execute("SELECT body FROM documents WHERE collection_name='walls'")]
        problems = [json.loads(row[0]) for row in connection.execute("SELECT body FROM documents WHERE collection_name='problems'")]
    finally:
        connection.close()
    public = [wall for wall in walls if wall.get("visibility") == "public" and wall.get("published") is True]
    wall_ids = {wall["id"] for wall in public}
    statements: list[str] = []
    for wall in public:
        owner = wall.get("ownerId") or "edge-import"
        now = int(wall.get("updatedAt") or wall.get("createdAt") or 0)
        statements.append(f"INSERT OR IGNORE INTO users(id,display_name,created_at,updated_at) VALUES ({sql(owner)},{sql(owner)},{now},{now});")
        statements.append("INSERT OR REPLACE INTO walls(id,wall_number,name,description,image_path,image_width,image_height,geometry_type,angle_options_json,owner_id,visibility,published,created_at,updated_at) VALUES (" + ",".join(map(sql, [wall["id"], wall.get("wallNumber"), wall.get("name", ""), wall.get("description", ""), wall.get("displayImageFileId") or wall.get("imageFileId", ""), wall.get("imageWidth", 0), wall.get("imageHeight", 0), wall.get("geometryType", "circle"), json.dumps(wall.get("angleOptions", []), separators=(",", ":")), owner, "public", 1, int(wall.get("createdAt") or 0), now])) + ");")
        for hold in wall.get("holds", []):
            statements.append("INSERT OR REPLACE INTO holds(wall_id,id,x,y,radius,kind) VALUES (" + ",".join(map(sql, [wall["id"], hold["id"], hold.get("x", 0), hold.get("y", 0), hold.get("radius", 0.01), hold.get("kind")])) + ");")
    for problem in problems:
        if problem.get("wallId") not in wall_ids:
            continue
        owner = problem.get("createdBy") or "edge-import"
        now = int(problem.get("updatedAt") or problem.get("createdAt") or 0)
        statements.append(f"INSERT OR IGNORE INTO users(id,display_name,created_at,updated_at) VALUES ({sql(owner)},{sql(owner)},{now},{now});")
        statements.append("INSERT OR REPLACE INTO problems(id,number,wall_id,name,description,angle,grade,foot_rule,created_by,created_at,updated_at) VALUES (" + ",".join(map(sql, [problem["id"], problem.get("number", problem["id"]), problem["wallId"], problem.get("name"), problem.get("description"), problem.get("angle", 0), problem.get("grade", "V0"), problem.get("footRule", "feet_follow"), owner, int(problem.get("createdAt") or 0), now])) + ");")
        for role, hold_ids in (problem.get("holds") or {}).items():
            for hold_id in hold_ids:
                statements.append(f"INSERT OR REPLACE INTO problem_holds(problem_id,wall_id,hold_id,role) VALUES ({sql(problem['id'])},{sql(problem['wallId'])},{sql(hold_id)},{sql(role)});")
    for start in range(0, len(statements), 80):
        batch = "\n".join(statements[start:start + 80])
        subprocess.run(["npx", "wrangler", "d1", "execute", args.d1, "--remote", "--command", batch, "--config", args.config], check=True)
    print(f"Imported {len(public)} public walls and {sum(1 for p in problems if p.get('wallId') in wall_ids)} problems")


if __name__ == "__main__":
    main()

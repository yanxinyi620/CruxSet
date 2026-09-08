import json
import sqlite3
from pathlib import Path

from scripts.export_edge_snapshot import export_public_snapshot


def _write_documents(database: Path, documents: list[tuple[str, str, dict]]) -> None:
    connection = sqlite3.connect(database)
    try:
        connection.execute(
            "CREATE TABLE documents (collection_name TEXT NOT NULL, document_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (collection_name, document_id))"
        )
        connection.executemany(
            "INSERT INTO documents (collection_name, document_id, body) VALUES (?, ?, ?)",
            [(collection, identifier, json.dumps(body)) for collection, identifier, body in documents],
        )
        connection.commit()
    finally:
        connection.close()


def test_exports_only_public_wall_data_and_hashed_display_image(tmp_path: Path) -> None:
    media_directory = tmp_path / "media"
    media_directory.mkdir()
    (media_directory / "public.webp").write_bytes(b"public-image")
    (media_directory / "private.webp").write_bytes(b"private-image")
    database = tmp_path / "cruxset.db"
    _write_documents(database, [
        ("users", "usr_public", {"id": "usr_public", "displayName": "Setter", "secret": "must-not-export"}),
        ("admins", "admin@example.com", {"userId": "usr_public", "emailNormalized": "admin@example.com", "passwordHash": "must-not-export"}),
        ("walls", "wall_public", {"id": "wall_public", "name": "Public", "visibility": "public", "published": True, "ownerId": "usr_public", "imageFileId": "original.jpg", "displayImageFileId": "public.webp", "imageWidth": 100, "imageHeight": 200, "holds": [{"id": "H1", "x": 0.2, "y": 0.3, "radius": 0.01}, {"id": "H2", "x": 0.8, "y": 0.7, "radius": 0.01}]}),
        ("walls", "wall_private", {"id": "wall_private", "name": "Private", "visibility": "private", "published": False, "ownerId": "usr_public", "imageFileId": "private.webp", "holds": []}),
        ("problems", "problem_public", {"id": "problem_public", "number": "CS-000001", "wallId": "wall_public", "createdBy": "usr_public", "holds": {"start": ["H1"]}}),
        ("problems", "problem_private", {"id": "problem_private", "wallId": "wall_private", "createdBy": "usr_public", "holds": {}}),
    ])

    result = export_public_snapshot(database, media_directory, tmp_path / "output", release_id="release-1")

    manifest = json.loads(result.manifest_path.read_text())
    serialized = result.manifest_path.read_text()
    assert manifest["releaseId"] == "release-1"
    assert [wall["wall"]["id"] for wall in manifest["walls"]] == ["wall_public"]
    assert manifest["walls"][0]["wall"]["imageFileId"] == manifest["walls"][0]["image"]["path"]
    assert "private-image" not in serialized
    assert "wall_private" not in serialized
    assert "passwordHash" not in serialized
    assert "must-not-export" not in serialized
    assert (tmp_path / "output" / manifest["walls"][0]["image"]["path"]).read_bytes() == b"public-image"

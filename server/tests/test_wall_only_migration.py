import json
import sqlite3

import pytest

from app.migrations import flatten_legacy_documents, migrate_sqlite_wall_only


def _legacy_documents():
    walls = [{"id": "wall_parent", "name": "Parent", "description": "Training wall", "angleOptions": [20, 30], "ownerId": "usr_1", "visibility": "private"}]
    layouts = [
        {"id": "layout_a", "wallId": "wall_parent", "version": 1, "name": "A old", "holds": []},
        {"id": "layout_a", "wallId": "wall_parent", "version": 2, "name": "A", "imageFileId": "img_a", "displayImageFileId": "display_a", "imageWidth": 100, "imageHeight": 200, "geometryType": "circle", "holds": [{"id": "A1"}, {"id": "A2"}]},
        {"id": "layout_b", "wallId": "wall_parent", "version": 1, "name": "B", "imageFileId": "img_b", "imageWidth": 300, "imageHeight": 400, "geometryType": "circle", "holds": [{"id": "B1"}, {"id": "B2"}]},
    ]
    problems = [
        {"id": "problem_a", "wallId": "wall_parent", "layoutId": "layout_a", "layoutVersion": 2, "holds": {"start": ["A1"], "finish": ["A2"]}},
        {"id": "problem_b", "wallId": "wall_parent", "layoutId": "layout_b", "layoutVersion": 1, "holds": {"start": ["B1"], "finish": ["B2"]}},
    ]
    return walls, layouts, problems


def test_flatten_legacy_documents_creates_independent_walls_and_rewrites_problems():
    flat_walls, flat_problems = flatten_legacy_documents(*_legacy_documents())
    assert [wall["id"] for wall in flat_walls] == ["wall_from_layout_a", "wall_from_layout_b"]
    assert flat_walls[0] == {
        "id": "wall_from_layout_a", "name": "A", "description": "Training wall", "angleOptions": [20, 30],
        "ownerId": "usr_1", "visibility": "private", "imageFileId": "img_a", "displayImageFileId": "display_a", "imageWidth": 100,
        "imageHeight": 200, "geometryType": "circle", "holds": [{"id": "A1"}, {"id": "A2"}],
    }
    assert flat_problems == [
        {"id": "problem_a", "wallId": "wall_from_layout_a", "holds": {"start": ["A1"], "finish": ["A2"]}},
        {"id": "problem_b", "wallId": "wall_from_layout_b", "holds": {"start": ["B1"], "finish": ["B2"]}},
    ]


@pytest.mark.parametrize(("mutate", "entity_id"), [
    (lambda walls, layouts, problems: layouts[0].update(wallId="missing_wall"), "layout_a"),
    (lambda walls, layouts, problems: problems[0].update(layoutId="missing_layout"), "problem_a"),
    (lambda walls, layouts, problems: problems[0]["holds"]["start"].append("missing_hold"), "problem_a"),
])
def test_flatten_legacy_documents_rejects_broken_references(mutate, entity_id):
    walls, layouts, problems = _legacy_documents()
    mutate(walls, layouts, problems)
    with pytest.raises(ValueError, match=entity_id):
        flatten_legacy_documents(walls, layouts, problems)


def _write_legacy_database(database, walls, layouts, problems):
    connection = sqlite3.connect(database)
    connection.execute("CREATE TABLE documents (collection_name TEXT NOT NULL, document_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (collection_name, document_id))")
    for collection, documents in (("walls", walls), ("layouts", layouts), ("problems", problems)):
        for index, document in enumerate(documents):
            storage_id = f'{document["id"]}_{index}' if collection == "layouts" else document["id"]
            connection.execute("INSERT INTO documents VALUES (?, ?, ?)", (collection, storage_id, json.dumps(document)))
    connection.commit()
    connection.close()


def test_sqlite_migration_creates_backup_and_drops_layouts_only_after_success(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    database = tmp_path / "cruxset.db"
    backup = tmp_path / "cruxset.before-wall-only.db"
    _write_legacy_database(database, *_legacy_documents())
    migrate_sqlite_wall_only(database, backup)
    assert backup.exists()
    repository = SQLiteRepository(database)
    assert [wall["id"] for wall in repository.list_walls()] == ["wall_from_layout_a", "wall_from_layout_b"]
    assert repository.find_problem("problem_a")["wallId"] == "wall_from_layout_a"
    repository.close()
    connection = sqlite3.connect(database)
    assert connection.execute("SELECT count(*) FROM documents WHERE collection_name = 'layouts'").fetchone()[0] == 0
    connection.close()


def test_sqlite_migration_failure_preserves_database_and_recoverable_backup(tmp_path):
    database = tmp_path / "cruxset.db"
    backup = tmp_path / "cruxset.before-wall-only.db"
    walls, layouts, problems = _legacy_documents()
    problems[0]["holds"]["start"] = ["UNKNOWN"]
    _write_legacy_database(database, walls, layouts, problems)
    with pytest.raises(ValueError, match="problem_a"):
        migrate_sqlite_wall_only(database, backup)
    source_connection = sqlite3.connect(database)
    backup_connection = sqlite3.connect(backup)
    rows = "SELECT collection_name, document_id, body FROM documents ORDER BY collection_name, document_id"
    assert backup_connection.execute(rows).fetchall() == source_connection.execute(rows).fetchall()
    source_connection.close()
    backup_connection.close()
    connection = sqlite3.connect(database)
    assert connection.execute("SELECT count(*) FROM documents WHERE collection_name = 'layouts'").fetchone()[0] == 3
    connection.close()


def test_sqlite_migration_backup_includes_committed_wal_data(tmp_path):
    database = tmp_path / "cruxset.db"
    backup = tmp_path / "cruxset.before-wall-only.db"
    _write_legacy_database(database, *_legacy_documents())
    writer = sqlite3.connect(database)
    writer.execute("PRAGMA journal_mode = WAL")
    writer.execute("PRAGMA wal_autocheckpoint = 0")
    wal_problem = {
        "id": "problem_wal", "wallId": "wall_parent", "layoutId": "layout_a", "layoutVersion": 2,
        "holds": {"start": ["A1"], "finish": ["A2"]},
    }
    writer.execute(
        "INSERT INTO documents VALUES (?, ?, ?)",
        ("problems", wal_problem["id"], json.dumps(wal_problem)),
    )
    writer.commit()
    assert (tmp_path / "cruxset.db-wal").stat().st_size > 0

    migrate_sqlite_wall_only(database, backup)

    backup_connection = sqlite3.connect(backup)
    backup_ids = {
        row[0] for row in backup_connection.execute(
            "SELECT document_id FROM documents WHERE collection_name = 'problems'"
        )
    }
    backup_connection.close()
    writer.close()
    assert "problem_wal" in backup_ids

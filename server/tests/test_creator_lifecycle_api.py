from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _authed(repository):
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    return TestClient(app), {session_cookie_name(): create_session(account["userId"])}, account


def test_wall_deletion_cascades_to_all_referencing_problems(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    (tmp_path / "wall.jpg").write_bytes(b"wall")
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"], "imageFileId": "wall.jpg"})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1"})
    response = client.delete("/api/v1/walls/wall_1", cookies=cookie)
    assert response.status_code == 200
    assert repository.find_wall("wall_1") is None
    assert repository.find_problem("problem_1") is None
    assert not (tmp_path / "wall.jpg").exists()


def test_wall_deletion_removes_unreferenced_local_wall_media(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    (tmp_path / "source.jpg").write_bytes(b"source")
    (tmp_path / "display.jpg").write_bytes(b"display")
    repository.insert_wall({
        "id": "wall_1", "ownerId": account["userId"],
        "imageFileId": "source.jpg", "displayImageFileId": "/api/v1/media/display.jpg",
    })

    response = client.delete("/api/v1/walls/wall_1", cookies=cookie)

    assert response.status_code == 200
    assert not (tmp_path / "source.jpg").exists()
    assert not (tmp_path / "display.jpg").exists()


def test_wall_deletion_preserves_media_still_referenced_by_another_wall(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    (tmp_path / "shared.jpg").write_bytes(b"shared")
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"], "imageFileId": "shared.jpg"})
    repository.insert_wall({"id": "wall_2", "ownerId": account["userId"], "displayImageFileId": "/api/v1/media/shared.jpg"})

    assert client.delete("/api/v1/walls/wall_1", cookies=cookie).status_code == 200
    assert (tmp_path / "shared.jpg").exists()


def test_wall_deletion_ignores_missing_and_invalid_media_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    outside = tmp_path.parent / "must-remain.jpg"
    outside.write_bytes(b"outside")
    repository.insert_wall({
        "id": "wall_1", "ownerId": account["userId"],
        "imageFileId": "missing.jpg", "displayImageFileId": str(outside),
    })

    assert client.delete("/api/v1/walls/wall_1", cookies=cookie).status_code == 200
    assert outside.exists()


def test_wall_deletion_does_not_normalize_invalid_paths_to_local_media_names(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    traversal_target = tmp_path / "keep.jpg"
    absolute_target = tmp_path / "absolute.jpg"
    traversal_target.write_bytes(b"keep")
    absolute_target.write_bytes(b"absolute")
    repository.insert_wall({
        "id": "wall_1", "ownerId": account["userId"],
        "imageFileId": "../keep.jpg", "displayImageFileId": "/tmp/absolute.jpg",
    })

    assert client.delete("/api/v1/walls/wall_1", cookies=cookie).status_code == 200
    assert traversal_target.exists()
    assert absolute_target.exists()


def test_unreferenced_wall_can_be_deleted_without_confirmation():
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"]})
    assert client.delete("/api/v1/walls/wall_1", cookies=cookie).status_code == 200

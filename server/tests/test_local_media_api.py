from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def test_upload_image_returns_a_readable_local_media_url(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    response = TestClient(app).post(
        "/api/v1/media/images",
        files={"file": ("wall.jpg", b"\xff\xd8\xff\xe0test-image", "image/jpeg")},
    )

    assert response.status_code == 201
    media = response.json()["media"]
    assert media["url"].startswith("/api/v1/media/")
    app.state.repository.insert_wall({"id": "wall_public", "imageFileId": media["url"], "visibility": "public", "published": True})
    assert TestClient(app).get(media["url"]).content == b"\xff\xd8\xff\xe0test-image"


def test_private_wall_media_requires_its_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    repository = MemoryRepository()
    account = create_admin_account(repository, "owner@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)
    media = client.post("/api/v1/media/images", files={"file": ("wall.jpg", b"private", "image/jpeg")}).json()["media"]
    repository.insert_wall({"id": "wall_private", "imageFileId": "source.jpg", "displayImageFileId": media["id"], "visibility": "private", "ownerId": account["userId"]})
    assert client.get(media["url"]).status_code == 401
    cookie = {session_cookie_name(): create_session(account["userId"])}
    assert client.get(media["url"], cookies=cookie).content == b"private"


def test_unreferenced_media_is_not_public(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    app.state.repository = MemoryRepository()
    client = TestClient(app)
    media = client.post("/api/v1/media/images", files={"file": ("wall.jpg", b"orphan", "image/jpeg")}).json()["media"]
    assert client.get(media["url"]).status_code == 404


def test_invalid_wall_media_fields_cannot_authorize_local_media(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    app.state.repository = MemoryRepository()
    client = TestClient(app)
    media = client.post("/api/v1/media/images", files={"file": ("wall.jpg", b"private", "image/jpeg")}).json()["media"]

    for invalid_reference in ("../" + media["id"], "/tmp/" + media["id"], "https://example.com/" + media["id"]):
        app.state.repository = MemoryRepository()
        app.state.repository.insert_wall({"id": "wall_invalid", "imageFileId": invalid_reference, "visibility": "public"})
        assert client.get(media["url"]).status_code == 404

    app.state.repository = MemoryRepository()
    app.state.repository.insert_wall({"id": "wall_id", "imageFileId": media["id"], "visibility": "public"})
    assert client.get(media["url"]).status_code == 200
    app.state.repository = MemoryRepository()
    app.state.repository.insert_wall({"id": "wall_url", "imageFileId": media["url"], "visibility": "public"})
    assert client.get(media["url"]).status_code == 200

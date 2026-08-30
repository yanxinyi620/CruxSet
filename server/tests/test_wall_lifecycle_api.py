from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _client():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    return TestClient(app), {session_cookie_name(): create_session(account["userId"])}


def _create_wall(client, cookie):
    response = client.post("/api/v1/walls", json={"name": "Test wall", "imageFileId": "media_wall.jpg", "imageWidth": 100, "imageHeight": 200}, cookies=cookie)
    assert response.status_code == 201
    return response.json()["wall"]


def _holds():
    return [
        {"id": "H001", "x": 0.1, "y": 0.2, "radius": 0.03, "kind": "hold"},
        {"id": "H002", "x": 0.4, "y": 0.5, "radius": 0.03, "kind": "hold"},
    ]


def test_wall_is_created_as_a_private_editable_flat_document():
    client, cookie = _client()
    wall = _create_wall(client, cookie)
    assert wall["visibility"] == "private"
    assert wall["published"] is False
    assert wall["imageFileId"] == "media_wall.jpg"
    assert wall["holds"] == []
    assert "activeLayoutId" not in wall


def test_private_wall_holds_can_be_saved_then_published_and_locked():
    client, cookie = _client()
    wall = _create_wall(client, cookie)
    saved = client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": _holds()}, cookies=cookie)
    assert saved.status_code == 200
    assert saved.json()["wall"]["holds"] == _holds()
    published = client.post(f"/api/v1/walls/{wall['id']}/publish", cookies=cookie)
    assert published.status_code == 200
    assert published.json()["wall"]["published"] is True
    assert published.json()["wall"]["visibility"] == "public"
    locked = client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": _holds()}, cookies=cookie)
    assert locked.status_code == 409
    assert locked.json()["error"]["code"] == "WALL_LOCKED"


def test_publish_requires_at_least_two_valid_holds():
    client, cookie = _client()
    wall = _create_wall(client, cookie)
    one = [{"id": "H001", "x": 0.5, "y": 0.5, "radius": 0.03, "kind": "hold"}]
    client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": one}, cookies=cookie)
    response = client.post(f"/api/v1/walls/{wall['id']}/publish", cookies=cookie)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "WALL_NOT_ROUTABLE"


def test_problem_accepts_only_wall_id_and_contains_no_layout_fields():
    client, cookie = _client()
    wall = _create_wall(client, cookie)
    client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": _holds()}, cookies=cookie)
    assert client.post("/api/v1/problems", json={"wallId": wall["id"]}, cookies=cookie).status_code == 409
    client.post(f"/api/v1/walls/{wall['id']}/publish", cookies=cookie)
    response = client.post("/api/v1/problems", json={"wallId": wall["id"], "angle": 25, "grade": "V1", "holds": {"start": ["H001"], "finish": ["H002"]}}, cookies=cookie)
    assert response.status_code == 201
    problem = response.json()["problem"]
    assert problem["wallId"] == wall["id"]
    assert "layoutId" not in problem and "layoutVersion" not in problem


def test_wall_list_returns_flat_documents():
    client, cookie = _client()
    wall = _create_wall(client, cookie)
    assert client.get("/api/v1/walls").json()["walls"] == [wall]

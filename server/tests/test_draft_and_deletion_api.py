from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _client_with_admin():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}
    return client, cookie


def _two_holds():
    return [
        {"id": "H001", "x": 0.1, "y": 0.2, "radius": 0.03, "kind": "hold"},
        {"id": "H002", "x": 0.4, "y": 0.5, "radius": 0.03, "kind": "hold"},
    ]


def _create_draft_layout(client, cookie, name="draft"):
    wall = client.post("/api/v1/walls", json={"name": "Test wall"}, cookies=cookie).json()["wall"]
    layout = client.post(
        f"/api/v1/walls/{wall['id']}/layouts",
        json={"name": name, "imageFileId": "mock://wall", "imageWidth": 100, "imageHeight": 200},
        cookies=cookie,
    ).json()["layout"]
    return wall, layout


def test_saving_draft_holds_persists_without_publishing():
    client, cookie = _client_with_admin()
    wall, layout = _create_draft_layout(client, cookie)

    saved = client.put(f"/api/v1/layouts/{layout['id']}/holds", json={"holds": _two_holds()}, cookies=cookie)

    assert saved.status_code == 200
    assert saved.json()["layout"]["published"] is False
    assert len(saved.json()["layout"]["holds"]) == 2
    assert client.get(f"/api/v1/walls/{wall['id']}/layouts").json()["layouts"][0]["holds"] == _two_holds()


def test_saving_holds_on_published_layout_is_rejected():
    client, cookie = _client_with_admin()
    _, layout = _create_draft_layout(client, cookie)
    client.post(f"/api/v1/layouts/{layout['id']}/publish", json={"holds": _two_holds()}, cookies=cookie)

    response = client.put(f"/api/v1/layouts/{layout['id']}/holds", json={"holds": _two_holds()}, cookies=cookie)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAYOUT_LOCKED"


def test_publish_rejects_non_normalized_coordinates():
    client, cookie = _client_with_admin()
    _, layout = _create_draft_layout(client, cookie)

    response = client.post(
        f"/api/v1/layouts/{layout['id']}/publish",
        json={"holds": [{"id": "H001", "x": 12, "y": 34, "radius": 5, "kind": "hold"}, {"id": "H002", "x": 0.4, "y": 0.5, "radius": 0.03, "kind": "hold"}]},
        cookies=cookie,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_deleting_problem_removes_it():
    client, cookie = _client_with_admin()
    wall, layout = _create_draft_layout(client, cookie)
    client.post(f"/api/v1/layouts/{layout['id']}/publish", json={"holds": _two_holds()}, cookies=cookie)
    problem = client.post(
        "/api/v1/problems",
        json={"wallId": wall["id"], "layoutId": layout["id"], "angle": 25, "grade": "V1", "holds": {"start": ["H001"], "finish": ["H002"]}},
        cookies=cookie,
    ).json()["problem"]

    assert client.delete(f"/api/v1/problems/{problem['id']}", cookies=cookie).status_code == 200
    assert client.get("/api/v1/problems").json() == {"problems": []}
    assert client.delete(f"/api/v1/problems/{problem['id']}", cookies=cookie).status_code == 404


def test_deleting_wall_requires_confirmation_and_cascades():
    client, cookie = _client_with_admin()
    wall, layout = _create_draft_layout(client, cookie)
    client.post(f"/api/v1/layouts/{layout['id']}/publish", json={"holds": _two_holds()}, cookies=cookie)
    client.post(
        "/api/v1/problems",
        json={"wallId": wall["id"], "layoutId": layout["id"], "angle": 25, "grade": "V1", "holds": {"start": ["H001"], "finish": ["H002"]}},
        cookies=cookie,
    )

    assert client.delete(f"/api/v1/walls/{wall['id']}", cookies=cookie).status_code == 422
    assert client.delete(f"/api/v1/walls/{wall['id']}?confirmCascade=true", cookies=cookie).status_code == 200
    assert client.get("/api/v1/walls").json() == {"walls": []}
    assert client.get("/api/v1/problems").json() == {"problems": []}
    assert client.delete(f"/api/v1/walls/{wall['id']}?confirmCascade=true", cookies=cookie).status_code == 404
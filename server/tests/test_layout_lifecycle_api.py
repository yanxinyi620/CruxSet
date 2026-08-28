from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def test_admin_can_publish_multiple_layouts_but_draft_is_not_routable():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}

    wall = client.post("/api/v1/walls", json={"name": "Test wall"}, cookies=cookie).json()["wall"]
    layout = client.post(
        f"/api/v1/walls/{wall['id']}/layouts",
        json={"name": "2026-08", "imageFileId": "mock://wall", "imageWidth": 100, "imageHeight": 200},
        cookies=cookie,
    ).json()["layout"]

    assert client.post(
        "/api/v1/problems",
        json={"wallId": wall["id"], "layoutId": layout["id"]},
        cookies=cookie,
    ).status_code == 409

    published = client.post(
        f"/api/v1/layouts/{layout['id']}/publish",
        json={"holds": [{"id": "H001", "x": 0.1, "y": 0.2, "radius": 0.03, "kind": "hold"}, {"id": "H002", "x": 0.4, "y": 0.5, "radius": 0.03, "kind": "hold"}]},
        cookies=cookie,
    )
    assert published.status_code == 200

    response = client.post(
        "/api/v1/problems",
        json={"wallId": wall["id"], "layoutId": layout["id"], "angle": 25, "grade": "V1", "holds": {"start": ["H001"], "finish": ["H002"]}},
        cookies=cookie,
    )
    assert response.status_code == 201

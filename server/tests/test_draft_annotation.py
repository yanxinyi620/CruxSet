from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _client():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}
    return client, cookie


def _draft_layout(client, cookie):
    wall = client.post("/api/v1/walls", json={"name": "T"}, cookies=cookie).json()["wall"]
    layout = client.post(
        f"/api/v1/walls/{wall['id']}/layouts",
        json={"name": "L", "imageFileId": "mock://w", "imageWidth": 100, "imageHeight": 200},
        cookies=cookie,
    ).json()["layout"]
    return wall, layout


def test_draft_save_allows_incremental_zero_and_one_holds():
    client, cookie = _client()
    _, layout = _draft_layout(client, cookie)
    assert client.put(f"/api/v1/layouts/{layout['id']}/holds", json={"holds": []}, cookies=cookie).status_code == 200
    one = [{"id": "H001", "x": 0.5, "y": 0.5, "radius": 0.03, "kind": "hold"}]
    assert client.put(f"/api/v1/layouts/{layout['id']}/holds", json={"holds": one}, cookies=cookie).status_code == 200


def test_publish_still_rejects_less_than_two_holds():
    client, cookie = _client()
    _, layout = _draft_layout(client, cookie)
    one = [{"id": "H001", "x": 0.5, "y": 0.5, "radius": 0.03, "kind": "hold"}]
    response = client.post(f"/api/v1/layouts/{layout['id']}/publish", json={"holds": one}, cookies=cookie)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LAYOUT_NOT_ROUTABLE"


def test_draft_save_rejects_pixel_coordinates_and_huge_radius():
    client, cookie = _client()
    _, layout = _draft_layout(client, cookie)
    bad = [
        {"id": "H001", "x": 320, "y": 240, "radius": 18, "kind": "hold"},
        {"id": "H002", "x": 0.4, "y": 0.5, "radius": 0.03, "kind": "hold"},
    ]
    response = client.put(f"/api/v1/layouts/{layout['id']}/holds", json={"holds": bad}, cookies=cookie)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_draft_save_roundtrips_600_holds():
    client, cookie = _client()
    _, layout = _draft_layout(client, cookie)
    holds = [
        {"id": f"H{i:03d}", "x": (i % 20) / 20, "y": (i // 20) / 30, "radius": 0.018 if i % 2 else 0.05, "kind": "hold" if i % 2 else "volume"}
        for i in range(1, 601)
    ]
    response = client.put(f"/api/v1/layouts/{layout['id']}/holds", json={"holds": holds}, cookies=cookie)
    assert response.status_code == 200
    saved = response.json()["layout"]["holds"]
    assert len(saved) == 600
    assert saved[0]["id"] == "H001" and saved[-1]["id"] == "H600"
    assert saved[1]["kind"] == "volume"

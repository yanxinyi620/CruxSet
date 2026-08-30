from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _setup():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}
    wall = client.post("/api/v1/walls", json={"name": "T", "imageFileId": "mock://w", "imageWidth": 100, "imageHeight": 200}, cookies=cookie).json()["wall"]
    return client, cookie, wall


def test_private_wall_allows_incremental_zero_one_and_many_holds():
    client, cookie, wall = _setup()
    assert client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": []}, cookies=cookie).status_code == 200
    holds = [{"id": f"H{i:03d}", "x": (i % 20) / 20, "y": (i // 20) / 30, "radius": .018, "kind": "hold"} for i in range(1, 601)]
    response = client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": holds}, cookies=cookie)
    assert response.status_code == 200
    assert len(response.json()["wall"]["holds"]) == 600


def test_wall_hold_save_rejects_pixel_coordinates():
    client, cookie, wall = _setup()
    bad = [{"id": "H001", "x": 320, "y": 240, "radius": 18, "kind": "hold"}]
    response = client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": bad}, cookies=cookie)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"

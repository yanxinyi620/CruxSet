from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def test_anonymous_users_must_log_in_before_creating_walls():
    app.state.repository = MemoryRepository()
    response = TestClient(app).post("/api/v1/walls", json={"name": "Forbidden"})
    assert response.status_code == 401


def test_admin_can_create_wall():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)

    response = client.post(
        "/api/v1/walls",
        json={"name": "日坛 Spraywall", "imageFileId": "image.jpg", "imageWidth": 100, "imageHeight": 200, "angleOptions": [25, 35]},
        cookies={session_cookie_name(): create_session(account["userId"])},
    )

    assert response.status_code == 201
    assert response.json()["wall"]["name"] == "日坛 Spraywall"

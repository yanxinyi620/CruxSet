from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.sqlite import SQLiteRepository


def test_authenticated_sqlite_writes_work_through_the_api(tmp_path):
    """Regression: FastAPI runs sync auth dependencies in a thread pool, so the
    shared SQLite connection must be usable across threads (check_same_thread=False + lock)."""
    repository = SQLiteRepository(tmp_path / "cruxset.db")
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}

    created = client.post("/api/v1/walls", json={"name": "SQLite wall", "imageFileId": "wall.jpg", "imageWidth": 100, "imageHeight": 200}, cookies=cookie)
    assert created.status_code == 201, created.text
    wall = created.json()["wall"]

    holds = [
        {"id": "H001", "x": 0.1, "y": 0.2, "radius": 0.03, "kind": "hold"},
        {"id": "H002", "x": 0.5, "y": 0.6, "radius": 0.03, "kind": "hold"},
    ]
    assert client.put(f"/api/v1/walls/{wall['id']}/holds", json={"holds": holds}, cookies=cookie).status_code == 200
    assert client.post(f"/api/v1/walls/{wall['id']}/publish", cookies=cookie).status_code == 200

    problem = client.post(
        "/api/v1/problems",
        json={"wallId": wall["id"], "angle": 25, "grade": "V1", "holds": {"start": ["H001"], "finish": ["H002"]}},
        cookies=cookie,
    )
    assert problem.status_code == 201, problem.text
    assert client.delete(f"/api/v1/problems/{problem.json()['problem']['id']}", cookies=cookie).status_code == 200
    assert client.delete(f"/api/v1/walls/{wall['id']}", cookies=cookie).status_code == 200

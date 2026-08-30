from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def test_deleting_problem_does_not_delete_its_wall():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"]})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1"})
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}
    assert client.delete("/api/v1/problems/problem_1", cookies=cookie).status_code == 200
    assert repository.find_problem("problem_1") is None
    assert repository.find_wall("wall_1") is not None


def test_problem_rejects_unknown_wall_hold():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"], "published": True, "visibility": "public", "angleOptions": [20], "holds": [{"id": "H001"}, {"id": "H002"}]})
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}
    response = client.post("/api/v1/problems", json={"wallId": "wall_1", "holds": {"start": ["UNKNOWN"], "finish": ["H002"]}}, cookies=cookie)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"

from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _authed(repository):
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    return TestClient(app), {session_cookie_name(): create_session(account["userId"])}, account


def test_wall_deletion_is_non_cascading_and_reports_reference_count():
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"]})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1"})
    response = client.delete("/api/v1/walls/wall_1", cookies=cookie)
    assert response.status_code == 409
    assert response.json()["error"] == {"code": "WALL_IN_USE", "message": "Wall is referenced by problems", "details": {"problemCount": 1}}
    assert repository.find_wall("wall_1") is not None
    assert repository.find_problem("problem_1") is not None


def test_unreferenced_wall_can_be_deleted_without_confirmation():
    repository = MemoryRepository()
    client, cookie, account = _authed(repository)
    repository.insert_wall({"id": "wall_1", "ownerId": account["userId"]})
    assert client.delete("/api/v1/walls/wall_1", cookies=cookie).status_code == 200

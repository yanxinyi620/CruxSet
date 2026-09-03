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


def test_problem_can_be_deleted_by_its_creator_or_an_administrator():
    repository = MemoryRepository()
    owner_id = "usr_owner"
    other_id = "usr_other"
    admin_id = "usr_admin"
    for user_id, email in ((owner_id, "owner@example.com"), (other_id, "other@example.com")):
        repository.insert_user({"id": user_id})
        repository.insert_admin({"userId": user_id, "role": "user", "emailNormalized": email, "passwordHash": "unused"})
    repository.insert_user({"id": admin_id})
    repository.insert_admin({"userId": admin_id, "role": "admin", "emailNormalized": "admin@example.com", "passwordHash": "unused"})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1", "createdBy": owner_id})
    repository.insert_problem({"id": "problem_2", "wallId": "wall_1", "createdBy": owner_id})
    app.state.repository = repository
    client = TestClient(app)

    other_cookie = {session_cookie_name(): create_session(other_id)}
    assert client.delete("/api/v1/problems/problem_1", cookies=other_cookie).status_code == 404
    owner_cookie = {session_cookie_name(): create_session(owner_id)}
    assert client.delete("/api/v1/problems/problem_1", cookies=owner_cookie).status_code == 200
    assert repository.find_problem("problem_1") is None
    admin_cookie = {session_cookie_name(): create_session(admin_id)}
    assert client.delete("/api/v1/problems/problem_2", cookies=admin_cookie).status_code == 200
    assert repository.find_problem("problem_2") is None


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

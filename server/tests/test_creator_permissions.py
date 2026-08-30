from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def _wall(wall_id, visibility, owner_id):
    return {"id": wall_id, "name": wall_id, "visibility": visibility, "ownerId": owner_id}


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


def test_anonymous_and_non_owner_list_only_public_walls():
    repository = MemoryRepository()
    repository.insert_user({"id": "usr_owner"})
    repository.insert_user({"id": "usr_other"})
    repository.insert_wall(_wall("wall_public", "public", "usr_owner"))
    repository.insert_wall(_wall("wall_private", "private", "usr_owner"))
    app.state.repository = repository
    client = TestClient(app)

    assert [wall["id"] for wall in client.get("/api/v1/walls").json()["walls"]] == ["wall_public"]
    other_cookie = {session_cookie_name(): create_session("usr_other")}
    assert [wall["id"] for wall in client.get("/api/v1/walls", cookies=other_cookie).json()["walls"]] == ["wall_public"]


def test_owner_sees_own_private_walls_and_admin_sees_all_walls():
    repository = MemoryRepository()
    repository.insert_user({"id": "usr_owner"})
    admin = create_admin_account(repository, "admin2@example.com", "correct horse")
    repository.insert_wall(_wall("wall_public", "public", "usr_owner"))
    repository.insert_wall(_wall("wall_private", "private", "usr_owner"))
    repository.insert_wall(_wall("wall_other_private", "private", "usr_someone_else"))
    app.state.repository = repository
    client = TestClient(app)

    owner_cookie = {session_cookie_name(): create_session("usr_owner")}
    assert [wall["id"] for wall in client.get("/api/v1/walls", cookies=owner_cookie).json()["walls"]] == ["wall_public", "wall_private"]
    admin_cookie = {session_cookie_name(): create_session(admin["userId"])}
    assert [wall["id"] for wall in client.get("/api/v1/walls", cookies=admin_cookie).json()["walls"]] == ["wall_public", "wall_private", "wall_other_private"]


def test_problem_listing_follows_wall_visibility():
    repository = MemoryRepository()
    repository.insert_user({"id": "usr_owner"})
    repository.insert_user({"id": "usr_other"})
    repository.insert_wall(_wall("wall_public", "public", "usr_owner"))
    repository.insert_wall(_wall("wall_private", "private", "usr_owner"))
    repository.insert_problem({"id": "problem_public", "wallId": "wall_public"})
    repository.insert_problem({"id": "problem_private", "wallId": "wall_private"})
    app.state.repository = repository
    client = TestClient(app)

    assert [problem["id"] for problem in client.get("/api/v1/problems").json()["problems"]] == ["problem_public"]
    owner_cookie = {session_cookie_name(): create_session("usr_owner")}
    assert [problem["id"] for problem in client.get("/api/v1/problems", cookies=owner_cookie).json()["problems"]] == ["problem_public", "problem_private"]
    other_cookie = {session_cookie_name(): create_session("usr_other")}
    assert [problem["id"] for problem in client.get("/api/v1/problems", cookies=other_cookie).json()["problems"]] == ["problem_public"]

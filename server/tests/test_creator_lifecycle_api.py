from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.sessions import create_session, session_cookie_name
from app.main import app
from app.repositories.memory import MemoryRepository


def test_deleting_layout_requires_confirmation_and_cascades_problems():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    repository.insert_wall({"id": "wall_1", "name": "Wall", "ownerId": account["userId"], "angleOptions": [20]})
    repository.insert_layout({"id": "layout_1", "wallId": "wall_1", "version": 1, "published": True, "holds": [{"id": "H001"}, {"id": "H002"}]})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1", "layoutId": "layout_1"})
    app.state.repository = repository
    client = TestClient(app)
    cookie = {session_cookie_name(): create_session(account["userId"])}

    assert client.delete("/api/v1/layouts/layout_1", cookies=cookie).status_code == 422
    assert client.delete("/api/v1/layouts/layout_1?confirmCascade=true", cookies=cookie).status_code == 200
    assert client.get("/api/v1/walls/wall_1/layouts").json() == {"layouts": []}
    assert client.get("/api/v1/problems").json() == {"problems": []}

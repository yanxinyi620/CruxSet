from fastapi.testclient import TestClient

from app.auth.passwords import create_admin_account
from app.auth.rate_limit import LoginRateLimiter
from app.main import app
from app.repositories.memory import MemoryRepository


def test_admin_login_sets_http_only_session():
    repository = MemoryRepository()
    create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    app.state.login_rate_limiter = LoginRateLimiter()

    response = TestClient(app).post(
        "/api/v1/auth/admin/login",
        json={"email": "admin@example.com", "password": "correct horse"},
    )

    assert response.status_code == 200
    assert response.json()["user"]["isAdmin"] is True
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "secure" in response.headers["set-cookie"].lower()


def test_wrong_password_uses_generic_auth_failure():
    repository = MemoryRepository()
    create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    app.state.login_rate_limiter = LoginRateLimiter()

    response = TestClient(app).post(
        "/api/v1/auth/admin/login",
        json={"email": "admin@example.com", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {"error": {"code": "AUTH_REQUIRED", "message": "Authentication required"}}


def test_me_rejects_a_signed_session_for_a_non_admin_user():
    repository = MemoryRepository()
    repository.insert_user({"id": "usr_regular"})
    app.state.repository = repository
    app.state.login_rate_limiter = LoginRateLimiter()

    from app.auth.sessions import create_session, session_cookie_name

    response = TestClient(app).get(
        "/api/v1/auth/me",
        cookies={session_cookie_name(): create_session("usr_regular")},
    )

    assert response.status_code == 401


def test_login_rate_limits_repeated_failures():
    repository = MemoryRepository()
    create_admin_account(repository, "limit@example.com", "correct horse")
    app.state.repository = repository
    app.state.login_rate_limiter = LoginRateLimiter(attempts=2)
    client = TestClient(app)

    for _ in range(2):
        assert client.post(
            "/api/v1/auth/admin/login",
            json={"email": "limit@example.com", "password": "wrong"},
        ).status_code == 401

    response = client.post(
        "/api/v1/auth/admin/login",
        json={"email": "limit@example.com", "password": "wrong"},
    )
    assert response.status_code == 429
    assert response.json() == {"error": {"code": "RATE_LIMITED", "message": "Too many login attempts"}}

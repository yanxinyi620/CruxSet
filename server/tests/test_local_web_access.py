from fastapi.testclient import TestClient

from app.main import app


def test_local_web_origin_is_allowed_for_api_requests():
    response = TestClient(app).options(
        "/api/v1/auth/me",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

from fastapi.testclient import TestClient

from app.main import app


def test_unknown_route_uses_stable_error_shape():
    response = TestClient(app).get("/api/v1/missing")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Resource not found"}}

from fastapi.testclient import TestClient

from segmentation_lab.api import create_app
from segmentation_lab.config import Settings
from segmentation_lab.errors import SegmentationLabError


def test_health_exposes_cpu_and_storage(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "device": "cpu",
        "dataDir": str(tmp_path),
    }


def test_domain_error_has_stable_json_envelope(tmp_path):
    app = create_app(Settings(data_dir=tmp_path))

    @app.get("/test-error")
    def raise_domain_error() -> None:
        raise SegmentationLabError("invalid_geometry", "Polygon must have three points")

    response = TestClient(app, raise_server_exceptions=False).get("/test-error")

    assert response.status_code == 422
    assert response.json() == {
        "code": "invalid_geometry",
        "message": "Polygon must have three points",
        "retryable": False,
    }

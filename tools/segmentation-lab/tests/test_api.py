from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from segmentation_lab.api import create_app
from segmentation_lab.config import Settings
from segmentation_lab.errors import SegmentationLabError
from segmentation_lab.adapters.base import ModelAvailability


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


def test_models_reports_availability_without_starting_inference(tmp_path):
    class Adapter:
        def available(self):
            return ModelAvailability(available=False, reason="checkpoint_not_found", device="cpu")

    client = TestClient(create_app(Settings(data_dir=tmp_path), adapters={"sam3": Adapter()}))

    response = client.get("/api/models")

    assert response.json() == {"items": [{"name": "sam3", "available": False, "reason": "checkpoint_not_found", "device": "cpu"}]}


def test_upload_creates_an_experiment_with_image_metadata(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    image = BytesIO()
    Image.new("RGB", (20, 10), "white").save(image, format="PNG")

    response = client.post(
        "/api/experiments",
        files={"image": ("wall.png", image.getvalue(), "image/png")},
    )

    assert response.status_code == 201
    assert response.json()["image"] == {"name": "wall.png", "width": 20, "height": 10}


def test_root_serves_upload_workbench(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert response.status_code == 200
    assert "上传并创建实验" in response.text

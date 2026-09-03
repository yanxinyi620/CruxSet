from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from segmentation_lab.api import create_app
from segmentation_lab.config import Settings
from segmentation_lab.errors import SegmentationLabError


def test_publish_calibration_uses_original_image_and_records_result(tmp_path, monkeypatch):
    class FakePublisher:
        def __init__(self, *_args, **_kwargs):
            pass

        async def publish(self, image, filename, metadata):
            assert image
            assert filename == "wall.png"
            assert metadata["holds"][0]["polygon"] == [[10, 10], [30, 10], [20, 30]]
            return {"wallId": "wall_1", "wallName": metadata["wallName"], "holdCount": 1, "browsePath": "/wall/wall_1", "created": True}

    monkeypatch.setattr("segmentation_lab.api.CruxSetPublisher", FakePublisher)
    app = create_app(Settings(data_dir=tmp_path, cruxset_base_url="http://cruxset", cruxset_publish_key="key"))
    client = TestClient(app)
    image = BytesIO()
    Image.new("RGB", (100, 80), "white").save(image, format="PNG")
    experiment_id = client.post("/api/experiments", files={"image": ("wall.png", image.getvalue(), "image/png")}).json()["id"]
    calibration = client.post(f"/api/experiments/{experiment_id}/calibrations", json={"sourceTaskId": "task-1", "candidates": [{"id": "hold-1", "polygon": [[10, 10], [30, 10], [20, 30]]}], "changes": {}}).json()
    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration['id']}/publish", json={"wallName": "Test Wall"})
    assert response.status_code == 201
    assert response.json()["wallName"] == "Test Wall"
    assert client.get(f"/api/experiments/{experiment_id}/calibrations").json()["items"][0]["publish"]["wallId"]


def test_optional_post_success_hook_failure_does_not_change_local_publish(tmp_path, monkeypatch):
    class FakePublisher:
        def __init__(self, *_args, **_kwargs):
            pass

        async def publish(self, _image, _filename, metadata):
            return {"wallId": "wall-local", "wallName": metadata["wallName"], "holdCount": 1, "browsePath": "/wall/wall-local", "created": True}

    monkeypatch.setattr("segmentation_lab.api.CruxSetPublisher", FakePublisher)

    async def failed_hook(*_args):
        raise SegmentationLabError("cloudbase_unavailable", "offline", True)

    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key="key"), post_success_hook=failed_hook)
    client = TestClient(app)
    image = BytesIO()
    Image.new("RGB", (100, 80), "white").save(image, format="PNG")
    experiment_id = client.post("/api/experiments", files={"image": ("wall.png", image.getvalue(), "image/png")}).json()["id"]
    calibration = client.post(f"/api/experiments/{experiment_id}/calibrations", json={"sourceTaskId": "task-1", "candidates": [{"id": "hold-1", "polygon": [[10, 10], [30, 10], [20, 30]]}], "changes": {}}).json()

    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration['id']}/publish", json={})

    assert response.status_code == 201
    stored = client.get(f"/api/experiments/{experiment_id}/calibrations").json()["items"][0]
    assert stored["publish"]["wallId"] == "wall-local"
    assert stored["sync"]["status"] == "failed"

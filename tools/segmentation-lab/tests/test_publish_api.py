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


def test_optional_post_success_hook_receives_local_wall_name(tmp_path, monkeypatch):
    class FakePublisher:
        def __init__(self, *_args, **_kwargs):
            pass

        async def publish(self, _image, _filename, _metadata):
            return {"wallId": "wall-local", "holdCount": 1, "browsePath": "/wall/wall-local", "created": True}

    monkeypatch.setattr("segmentation_lab.api.CruxSetPublisher", FakePublisher)
    seen = {}

    async def hook(_store, _experiment_id, _calibration_id, _result, wall_name):
        seen["wall_name"] = wall_name

    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key="key"), post_success_hook=hook)
    client = TestClient(app)
    image = BytesIO()
    Image.new("RGB", (100, 80), "white").save(image, format="PNG")
    experiment_id = client.post("/api/experiments", files={"image": ("wall.png", image.getvalue(), "image/png")}).json()["id"]
    calibration = client.post(f"/api/experiments/{experiment_id}/calibrations", json={"sourceTaskId": "task-1", "candidates": [{"id": "hold-1", "polygon": [[10, 10], [30, 10], [20, 30]]}], "changes": {}}).json()

    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration['id']}/publish", json={"wallName": "Local name"})

    assert response.status_code == 201
    assert seen["wall_name"] == "Local name"


def _publish_fixture(client):
    image = BytesIO()
    Image.new("RGB", (100, 80), "white").save(image, format="PNG")
    experiment_id = client.post("/api/experiments", files={"image": ("wall.png", image.getvalue(), "image/png")}).json()["id"]
    calibration = client.post(f"/api/experiments/{experiment_id}/calibrations", json={"sourceTaskId": "task-1", "candidates": [{"id": "hold-1", "polygon": [[10, 10], [30, 10], [20, 30]]}], "changes": {}}).json()
    return experiment_id, calibration["id"]


def test_publish_defaults_to_web_without_implicit_cloudbase_sync(tmp_path, monkeypatch):
    class FakePublisher:
        def __init__(self, *_args, **_kwargs):
            pass

        async def publish(self, _image, _filename, metadata):
            return {"wallId": "web-wall", "wallName": metadata["wallName"], "holdCount": 1, "browsePath": "/wall/web-wall", "created": True}

    class UnexpectedCloudbase:
        def __init__(self, *_args, **_kwargs):
            raise AssertionError("default web target must not initialize CloudBase")

    monkeypatch.setattr("segmentation_lab.api.CruxSetPublisher", FakePublisher)
    monkeypatch.setattr("segmentation_lab.api.CloudBaseSynchronizer", UnexpectedCloudbase)
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key="key", cloudbase_function_url="fn", cloudbase_storage_url="storage", cloudbase_signing_key="secret", cloudbase_owner_openid="owner"))
    client = TestClient(app)
    experiment_id, calibration_id = _publish_fixture(client)

    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", json={"wallName": "Web only"})

    assert response.status_code == 201
    assert response.json()["target"] == "web"
    stored = client.get(f"/api/experiments/{experiment_id}/calibrations").json()["items"][0]
    assert stored["publish"]["target"] == "web"
    assert "sync" not in stored


def test_publish_cloudbase_only_requires_only_cloudbase_configuration_and_persists_status(tmp_path, monkeypatch):
    calls = []

    async def fake_sync(store, experiment_id, calibration_id, _synchronizer, wall_name=None, publish_request_id=None):
        calls.append((experiment_id, calibration_id, wall_name, publish_request_id))
        result = {"wallId": "cloud-wall", "wallName": wall_name, "holdCount": 1, "browsePath": "/wall/cloud-wall", "created": True}
        store.record_calibration_sync(experiment_id, calibration_id, {**result, "target": "cloudbase", "status": "succeeded", "publishRequestId": publish_request_id})
        return result

    monkeypatch.setattr("segmentation_lab.api.sync_calibration", fake_sync)
    app = create_app(Settings(data_dir=tmp_path, cloudbase_function_url="fn", cloudbase_storage_url="storage", cloudbase_signing_key="secret", cloudbase_owner_openid="owner"))
    client = TestClient(app)
    experiment_id, calibration_id = _publish_fixture(client)

    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", json={"target": "cloudbase", "wallName": "Cloud only"})

    assert response.status_code == 201
    assert response.json()["target"] == "cloudbase"
    assert response.json()["targets"]["cloudbase"]["status"] == "succeeded"
    assert "browseUrl" not in response.json()
    assert len(calls) == 1
    stored = client.get(f"/api/experiments/{experiment_id}/calibrations").json()["items"][0]
    assert stored["sync"]["target"] == "cloudbase"
    assert stored["sync"]["status"] == "succeeded"


def test_publish_both_runs_independently_and_returns_per_target_status(tmp_path, monkeypatch):
    class FailingPublisher:
        def __init__(self, *_args, **_kwargs):
            pass

        async def publish(self, *_args, **_kwargs):
            raise SegmentationLabError("cruxset_publish_failed", "web offline", True)

    async def successful_sync(store, experiment_id, calibration_id, _synchronizer, **kwargs):
        store.record_calibration_sync(experiment_id, calibration_id, {"target": "cloudbase", "status": "succeeded", "wallId": "cloud-wall"})
        return {"wallId": "cloud-wall", "holdCount": 1, "browsePath": "/wall/cloud-wall", "created": True}

    monkeypatch.setattr("segmentation_lab.api.CruxSetPublisher", FailingPublisher)
    monkeypatch.setattr("segmentation_lab.api.sync_calibration", successful_sync)
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key="key", cloudbase_function_url="fn", cloudbase_storage_url="storage", cloudbase_signing_key="secret", cloudbase_owner_openid="owner"))
    client = TestClient(app)
    experiment_id, calibration_id = _publish_fixture(client)

    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", json={"target": "both", "wallName": "Both"})

    assert response.status_code == 201
    assert response.json()["targets"]["web"]["status"] == "failed"
    assert response.json()["targets"]["cloudbase"]["status"] == "succeeded"


def test_publish_rejects_unknown_target_and_requires_only_selected_target_config(tmp_path, monkeypatch):
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key="key"))
    client = TestClient(app)
    experiment_id, calibration_id = _publish_fixture(client)

    invalid = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", json={"target": "everywhere"})
    missing_cloud = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", json={"target": "cloudbase"})

    assert invalid.status_code == 422
    assert invalid.json()["code"] == "invalid_publish_target"
    assert missing_cloud.status_code == 422
    assert missing_cloud.json()["code"] == "cloudbase_not_configured"


def test_publish_both_keeps_web_success_when_cloudbase_is_not_configured(tmp_path, monkeypatch):
    class FakePublisher:
        def __init__(self, *_args, **_kwargs):
            pass

        async def publish(self, _image, _filename, metadata):
            return {"wallId": "web-wall", "wallName": metadata["wallName"], "holdCount": 1, "browsePath": "/wall/web-wall", "created": True}

    monkeypatch.setattr("segmentation_lab.api.CruxSetPublisher", FakePublisher)
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key="key"))
    client = TestClient(app)
    experiment_id, calibration_id = _publish_fixture(client)

    response = client.post(f"/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", json={"target": "both"})

    assert response.status_code == 201
    assert response.json()["targets"]["web"]["status"] == "succeeded"
    assert response.json()["targets"]["cloudbase"]["status"] == "failed"
    assert response.json()["targets"]["cloudbase"]["code"] == "cloudbase_not_configured"

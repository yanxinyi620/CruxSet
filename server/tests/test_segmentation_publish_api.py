import json
from fastapi.testclient import TestClient
from base64 import b64decode

from app.auth.passwords import create_admin_account
from app.main import app
from app.repositories.memory import MemoryRepository


def _png() -> bytes:
    return b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


def _client(monkeypatch):
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    repository.insert_user({"id": account["userId"], "openid": "admin-openid"})
    app.state.repository = repository
    app.state.segmentation_publish_key = "test-key"
    app.state.segmentation_publish_owner_id = account["userId"]
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", "/tmp/cruxset-segmentation-publish-test")
    return TestClient(app), repository, account["userId"]


def _metadata():
    return {
        "publishRequestId": "request-1",
        "sourceExperimentId": "experiment-1",
        "sourceCalibrationId": "calibration-1",
        "wallName": "日坛 spraywall · 2026-08-31",
        "imageWidth": 1,
        "imageHeight": 1,
        "holds": [
            {"sourceId": "manual-1", "kind": "hold", "polygon": [[0.1, 0.1], [0.3, 0.1], [0.2, 0.3]]},
            {"sourceId": "manual-2", "kind": "volume", "polygon": [[0.6, 0.4], [0.9, 0.4], [0.8, 0.7]]},
        ],
    }


def test_segmentation_publish_requires_dedicated_bearer_key(monkeypatch):
    client, _, _ = _client(monkeypatch)
    response = client.post(
        "/api/v1/admin/segmentation-walls",
        files={"image": ("wall.png", _png(), "image/png")},
        data={"metadata": json.dumps(_metadata())},
    )
    assert response.status_code == 401


def test_segmentation_publish_creates_public_wall_with_normalized_holds(monkeypatch):
    client, repository, owner_id = _client(monkeypatch)
    repository.insert_wall({"id": "wall_3", "wallNumber": 3})
    response = client.post(
        "/api/v1/admin/segmentation-walls",
        headers={"Authorization": "Bearer test-key"},
        files={"image": ("wall.png", _png(), "image/png")},
        data={"metadata": json.dumps(_metadata())},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["holdCount"] == 2
    wall = repository.find_wall(body["wallId"])
    assert wall["ownerId"] == owner_id
    assert wall["visibility"] == "public"
    assert wall["published"] is True
    assert wall["wallNumber"] == 4
    assert wall["holds"][0]["id"] == "H001"
    assert wall["holds"][0]["polygon"][0] == [0.1, 0.1]


def test_segmentation_publish_replay_is_idempotent(monkeypatch):
    client, repository, _ = _client(monkeypatch)
    request = {
        "headers": {"Authorization": "Bearer test-key"},
        "files": {"image": ("wall.png", _png(), "image/png")},
        "data": {"metadata": json.dumps(_metadata())},
    }
    first = client.post("/api/v1/admin/segmentation-walls", **request)
    second = client.post("/api/v1/admin/segmentation-walls", **request)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert len(repository.list_walls()) == 1


def test_segmentation_publish_rejects_out_of_bounds_polygon(monkeypatch):
    client, _, _ = _client(monkeypatch)
    metadata = _metadata()
    metadata["holds"][0]["polygon"][0] = [-1, 0.1]
    response = client.post(
        "/api/v1/admin/segmentation-walls",
        headers={"Authorization": "Bearer test-key"},
        files={"image": ("wall.png", _png(), "image/png")},
        data={"metadata": json.dumps(metadata)},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"

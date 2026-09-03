import json

import httpx
import pytest

from segmentation_lab.cloudbase_sync import (
    CloudBaseSynchronizer,
    build_normalized_holds,
    normalize_polygon,
    sync_calibration,
)
from segmentation_lab.errors import SegmentationLabError
from segmentation_lab.experiments import ExperimentStore


def test_normalize_polygon_maps_pixels_to_unit_coordinates():
    assert normalize_polygon([[0, 10], [50, 10], [25, 40]], 100, 80) == [
        [0.0, 0.125],
        [0.5, 0.125],
        [0.25, 0.5],
    ]


def test_build_normalized_holds_sorts_and_assigns_stable_contiguous_ids():
    holds = build_normalized_holds(
        [
            {"id": "b", "kind": "volume", "polygon": [[50, 40], [70, 40], [60, 60]]},
            {"id": "a", "kind": "hold", "polygon": [[10, 10], [30, 10], [20, 30]]},
        ],
        100,
        80,
    )
    assert [hold["id"] for hold in holds] == ["H001", "H002"]
    assert [hold["sourceId"] for hold in holds] == ["a", "b"]
    assert holds[0]["x"] == pytest.approx(0.2)
    assert holds[0]["y"] == pytest.approx(0.2083333333)
    assert holds[0]["radius"] > 0


def test_sync_rejects_missing_required_metadata_before_network_calls():
    synchronizer = CloudBaseSynchronizer("https://function.example", "secret")
    with pytest.raises(SegmentationLabError) as error:
        synchronizer.validate_metadata({"wallName": "Wall"})
    assert error.value.code == "cloudbase_invalid_metadata"


def test_sync_rejects_unsupported_hold_kind():
    with pytest.raises(SegmentationLabError) as error:
        build_normalized_holds(
            [{"id": "x", "kind": "mystery", "polygon": [[0, 0], [1, 0], [0, 1]]}],
            10,
            10,
        )
    assert error.value.code == "cloudbase_invalid_hold_kind"


@pytest.mark.anyio
async def test_sync_uploads_storage_then_calls_signed_publish_function():
    requests = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/storage":
            return httpx.Response(201, json={"fileID": "cloud://wall/image.png"})
        body = json.loads(await request.aread())
        assert body["imageFileId"] == "cloud://wall/image.png"
        assert body["ownerOpenid"] == "openid-owner"
        assert request.headers["x-cruxset-signature"]
        return httpx.Response(201, json={"wallId": "wall-1", "created": True})

    synchronizer = CloudBaseSynchronizer(
        "https://function.example/publish",
        "secret",
        storage_url="https://function.example/storage",
        owner_openid="openid-owner",
        transport=httpx.MockTransport(handler),
    )
    result = await synchronizer.publish(
        b"image",
        "wall.png",
        {
            "publishRequestId": "request-1",
            "sourceExperimentId": "experiment-1",
            "sourceCalibrationId": "calibration-1",
            "wallName": "Wall",
            "imageWidth": 100,
            "imageHeight": 80,
            "holds": [{"id": "h", "polygon": [[0, 0], [50, 0], [0, 40]]}],
        },
    )
    assert result["wallId"] == "wall-1"
    assert [request.url.path for request in requests] == ["/storage", "/publish"]


@pytest.mark.anyio
async def test_sync_failure_does_not_replace_local_publish_record(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.png", "sha", 100, 80)
    calibration = store.create_calibration(
        experiment.id,
        "task",
        [{"id": "h", "polygon": [[0, 0], [50, 0], [0, 40]]}],
        {},
    )
    store.record_calibration_publish(experiment.id, calibration["id"], {"wallId": "local-wall"})
    synchronizer = CloudBaseSynchronizer("https://function.example/publish", "secret", owner_openid="owner")
    with pytest.raises(SegmentationLabError) as error:
        await sync_calibration(store, experiment.id, calibration["id"], synchronizer)
    assert error.value.retryable is True
    stored = store.list_calibrations(experiment.id)[0]
    assert stored["publish"] == {"wallId": "local-wall"}
    assert stored["sync"]["status"] == "failed"

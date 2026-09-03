import json
import hashlib
import hmac

import httpx
import pytest

from segmentation_lab.cloudbase_sync import (
    CloudBaseSynchronizer,
    build_normalized_holds,
    normalize_polygon,
    _canonical_json,
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


def test_hold_uses_area_centroid_and_normalized_bbox():
    holds = build_normalized_holds(
        [{"id": "concave", "polygon": [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]}],
        4,
        4,
    )
    # The shoelace centroid of this L-shaped polygon is outside its area;
    # synchronization must use an interior representative point instead.
    assert (holds[0]["x"], holds[0]["y"]) != pytest.approx((1.357142857, 1.357142857))
    assert holds[0]["bbox"] == [0.0, 0.0, 1.0, 1.0]
    assert 0 <= holds[0]["x"] <= 1 and 0 <= holds[0]["y"] <= 1


def test_holds_with_nearby_top_edges_share_a_sorting_band():
    holds = build_normalized_holds(
        [
            {"id": "second", "polygon": [[30, 13], [40, 13], [35, 23]]},
            {"id": "first", "polygon": [[10, 10], [20, 10], [15, 20]]},
        ],
        100,
        100,
    )
    assert [hold["sourceId"] for hold in holds] == ["first", "second"]


def test_self_intersecting_and_tiny_polygons_are_rejected():
    with pytest.raises(SegmentationLabError) as crossing:
        build_normalized_holds([{"id": "x", "polygon": [[0, 0], [10, 10], [0, 10], [10, 0]]}], 100, 100)
    assert crossing.value.code == "cloudbase_invalid_polygon"
    with pytest.raises(SegmentationLabError) as tiny:
        build_normalized_holds([{"id": "x", "polygon": [[0, 0], [0.001, 0], [0, 0.001]]}], 100, 100)
    assert tiny.value.code == "cloudbase_invalid_polygon"


def test_signature_canonical_json_does_not_use_python_exponent_format():
    assert _canonical_json({"value": 0.0000001}) == '{"value":1e-7}'
    assert _canonical_json({"value": 1e20}) == '{"value":100000000000000000000}'


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
    image = b"\x89PNG\r\n\x1a\nimage"

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/storage":
            assert request.headers["x-cruxset-filename"] == "wall.png"
            assert request.headers["x-cruxset-content-type"] == "image/png"
            assert request.headers["x-cruxset-content-sha256"] == hashlib.sha256(image).hexdigest()
            assert request.headers["x-cruxset-content-length"] == str(len(image))
            signed_metadata = {
                "timestamp": request.headers["x-cruxset-timestamp"],
                "filename": "wall.png",
                "contentType": "image/png",
                "contentSha256": hashlib.sha256(image).hexdigest(),
                "contentLength": len(image),
            }
            expected_signature = hmac.new(b"secret", _canonical_json(signed_metadata).encode(), hashlib.sha256).hexdigest()
            assert hmac.compare_digest(request.headers["x-cruxset-signature"], expected_signature)
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
        image,
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
async def test_sync_uploads_large_image_to_granted_storage_url():
    requests = []
    image = b"\x89PNG\r\n\x1a\nlarge-image"

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/storage":
            body = json.loads(await request.aread())
            assert body["contentLength"] == len(image)
            assert request.headers["x-cruxset-signature"]
            return httpx.Response(201, json={
                "fileID": "cloud://wall/image.png",
                "uploadUrl": "https://cos.example/upload",
                "authorization": "cos-signature",
                "token": "cos-token",
                "cloudObjectMeta": "cloud-meta",
            })
        if request.url.host == "cos.example":
            assert request.headers["authorization"] == "cos-signature"
            assert request.headers["x-cos-security-token"] == "cos-token"
            assert request.headers["x-cos-meta-fileid"] == "cloud-meta"
            assert await request.aread() == image
            return httpx.Response(200)
        return httpx.Response(201, json={"wallId": "wall-1"})

    synchronizer = CloudBaseSynchronizer(
        "https://function.example/publish", "secret", storage_url="https://function.example/storage",
        owner_openid="owner", transport=httpx.MockTransport(handler),
    )
    result = await synchronizer.publish(image, "wall.png", {
        "publishRequestId": "request-large", "sourceExperimentId": "experiment-1",
        "sourceCalibrationId": "calibration-1", "wallName": "Wall", "imageWidth": 100,
        "imageHeight": 80, "holds": [{"id": "h", "polygon": [[0, 0], [50, 0], [0, 40]]}],
    })
    assert result["wallId"] == "wall-1"
    assert [request.method for request in requests] == ["POST", "PUT", "POST"]


@pytest.mark.anyio
async def test_sync_sniffs_image_content_and_handles_windows_filename():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-cruxset-filename"] == "wall.jpg"
        assert request.headers["x-cruxset-content-type"] == "image/png"
        return httpx.Response(201, json={"fileID": "cloud://wall/image.png"})

    synchronizer = CloudBaseSynchronizer(
        "https://function.example/publish",
        "secret",
        storage_url="https://function.example/storage",
        owner_openid="openid-owner",
        transport=httpx.MockTransport(handler),
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await synchronizer._upload_image(client, b"\x89PNG\r\n\x1a\nimage", r"C:\\walls\\wall.jpg") == "cloud://wall/image.png"


@pytest.mark.anyio
async def test_sync_uses_ascii_transport_filename_for_unicode_source_name():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-cruxset-filename"] == "upload.png"
        return httpx.Response(201, json={"fileID": "cloud://wall/image.png"})

    synchronizer = CloudBaseSynchronizer("https://function.example/publish", "secret", storage_url="https://function.example/storage", owner_openid="owner")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await synchronizer._upload_image(client, b"\x89PNG\r\n\x1a\nimage", "日坛喷涂墙.png") == "cloud://wall/image.png"


@pytest.mark.anyio
async def test_sync_rejects_unknown_image_content_before_network_calls():
    called = False

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    synchronizer = CloudBaseSynchronizer("https://function.example/publish", "secret", storage_url="https://function.example/storage", owner_openid="owner", transport=transport)
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(SegmentationLabError) as error:
            await synchronizer._upload_image(client, b"not an image", "wall.png")
    assert error.value.code == "cloudbase_invalid_image"
    assert called is False


@pytest.mark.anyio
@pytest.mark.parametrize(("status_code", "retryable"), [(400, False), (503, True)])
async def test_sync_reports_storage_http_statuses(status_code, retryable):
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={"error": "storage failure"})

    synchronizer = CloudBaseSynchronizer(
        "https://function.example/publish",
        "secret",
        storage_url="https://function.example/storage",
        owner_openid="openid-owner",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(SegmentationLabError) as error:
        await synchronizer.publish(
            b"\x89PNG\r\n\x1a\nimage",
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
    assert error.value.code == "cloudbase_storage_failed"
    assert error.value.retryable is retryable


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

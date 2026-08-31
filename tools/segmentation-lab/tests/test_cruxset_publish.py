import httpx
import pytest

from segmentation_lab.cruxset import CruxSetPublisher


@pytest.mark.anyio
async def test_publisher_sends_image_and_metadata_with_bearer_key():
    seen = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers["authorization"]
        seen["body"] = await request.aread()
        return httpx.Response(201, json={"wallId": "wall_1", "holdCount": 2, "browsePath": "/wall/wall_1", "created": True})

    publisher = CruxSetPublisher("http://127.0.0.1:8000", "test-key", transport=httpx.MockTransport(handler))
    result = await publisher.publish(b"image", "wall.png", {"publishRequestId": "request-1", "holds": []})

    assert result["wallId"] == "wall_1"
    assert seen["authorization"] == "Bearer test-key"
    assert b"request-1" in seen["body"]
    assert b"image" in seen["body"]


@pytest.mark.anyio
async def test_publisher_maps_http_errors_to_retryable_lab_errors():
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"message": "unavailable"}})

    publisher = CruxSetPublisher("http://127.0.0.1:8000", "test-key", transport=httpx.MockTransport(handler))
    with pytest.raises(Exception) as error:
        await publisher.publish(b"image", "wall.png", {"publishRequestId": "request-1"})
    assert getattr(error.value, "code", "") == "cruxset_unavailable"
    assert getattr(error.value, "retryable", False) is True

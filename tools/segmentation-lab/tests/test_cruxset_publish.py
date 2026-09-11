import httpx
import pytest
from base64 import b64decode

from segmentation_lab.cruxset import CruxSetPublisher


@pytest.mark.anyio
async def test_publisher_sends_image_and_metadata_with_bearer_key():
    seen = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers["authorization"]
        seen["body"] = await request.aread()
        return httpx.Response(201, json={"wallId": "wall_1", "holdCount": 2, "browsePath": "/wall/wall_1", "created": True})

    publisher = CruxSetPublisher("http://127.0.0.1:8000", "test-key", transport=httpx.MockTransport(handler))
    image = b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
    result = await publisher.publish(image, "wall.png", {"publishRequestId": "request-1", "holds": []})

    assert result["wallId"] == "wall_1"
    assert seen["authorization"] == "Bearer test-key"
    assert b"request-1" in seen["body"]
    assert image in seen["body"]
    assert b"display_image" in seen["body"]


@pytest.mark.anyio
async def test_publisher_maps_http_errors_to_retryable_lab_errors():
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"message": "unavailable"}})

    publisher = CruxSetPublisher("http://127.0.0.1:8000", "test-key", transport=httpx.MockTransport(handler))
    with pytest.raises(Exception) as error:
        await publisher.publish(b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), "wall.png", {"publishRequestId": "request-1"})
    assert getattr(error.value, "code", "") == "cruxset_unavailable"
    assert getattr(error.value, "retryable", False) is True


@pytest.mark.anyio
async def test_cloudflare_publisher_signs_transmitted_metadata_without_bearer_key():
    import hashlib
    import hmac
    from email.parser import BytesParser
    from email.policy import default

    async def handler(request: httpx.Request) -> httpx.Response:
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {request.headers['content-type']}\r\n\r\n".encode() + await request.aread()
        )
        metadata = next(part.get_payload(decode=True) for part in message.iter_parts()
                        if part.get_param('name', header='content-disposition') == 'metadata')
        expected = hmac.new(b'edge-key', metadata, hashlib.sha256).hexdigest()
        assert request.headers['x-cruxset-signature'] == expected
        assert 'authorization' not in request.headers
        assert '攀岩墙'.encode() in metadata
        return httpx.Response(201, json={'wallId': 'edge-wall'})

    publisher = CruxSetPublisher('https://edge.example', 'edge-key', transport=httpx.MockTransport(handler), auth_mode='hmac')
    result = await publisher.publish(b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), 'wall.png', {'wallName': '攀岩墙', 'holds': []})
    assert result['wallId'] == 'edge-wall'

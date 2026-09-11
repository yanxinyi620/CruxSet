import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

from segmentation_lab.adapters.base import AdapterMask, ModelAvailability
import pytest

from segmentation_lab.cloud_runner import CloudRunner, RunnerError


class Response:
    def __init__(self, status_code=200, payload=None, content=b""):
        self.status_code = status_code
        self._payload = payload
        self.content = content

    def json(self):
        return self._payload


class MockTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def request(self, method, url, *, headers=None, json=None, content=None):
        self.requests.append({"method": method, "url": url, "headers": headers or {}, "json": json, "content": content})
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class Adapter:
    name = "sam2"

    def available(self):
        return ModelAvailability(True, None, "cpu")

    def generate(self, request, progress):
        progress(.5, "generating")
        mask = np.zeros((request.height, request.width), dtype=np.uint8)
        mask[1:3, 2:5] = 1
        return [AdapterMask(mask, .9, {"model": "fake"})]


def image_bytes(size=(8, 6)):
    image = Image.new("RGB", size, "white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def claim(content, *, parameters=None):
    return {
        "token": "task-token",
        "inputUrl": "https://worker.example/api/v1/segmentation-lab/runner/tasks/task-1/input",
        "task": {
            "id": "task-1", "attemptId": "attempt-1", "experimentId": "experiment-1", "model": "sam2",
            "parameters": parameters or {"points_per_side": 16, "points_per_batch": 2, "crop_n_layers": 0},
            "image": {"name": "wall.png", "width": 8, "height": 6, "sha256": hashlib.sha256(content).hexdigest()},
        },
    }


def runner(tmp_path, transport):
    return CloudRunner("https://worker.example/api/v1/segmentation-lab", "runner-secret", "task-1", "attempt-1", "run-1", transport=transport, data_dir=tmp_path, adapters={"sam2": Adapter()})


def test_claim_rejection_returns_without_failure_callback(tmp_path):
    transport = MockTransport([Response(409, {"code": "already_claimed"})])

    result = runner(tmp_path, transport).run()

    assert result.status == "not_claimed"
    assert [request["url"] for request in transport.requests] == ["https://worker.example/api/v1/segmentation-lab/runner/claim"]


def test_runner_uploads_bounded_outputs_and_completes_with_task_token(tmp_path):
    content = image_bytes()
    transport = MockTransport([Response(200, claim(content)), Response(204), Response(200, content=content), *[Response(204) for _ in range(20)]])

    result = runner(tmp_path, transport).run()

    assert result.status == "succeeded"
    output_requests = [request for request in transport.requests if request["method"] == "PUT"]
    assert [request["url"].rsplit("/", 1)[-1] for request in output_requests] == ["candidates.json", "display.webp", "masks.zip"]
    candidates = json.loads(output_requests[0]["content"])
    assert candidates["items"][0]["id"] == "task-1-0001"
    assert output_requests[0]["headers"]["Authorization"] == "Bearer task-token"
    assert transport.requests[-1]["json"] == {"status": "succeeded"}
    assert {request["json"]["message"] for request in transport.requests if request["url"].endswith("/progress")} >= {"generating"}


def test_invalid_downloaded_image_reports_failure_without_raising(tmp_path):
    content = image_bytes((4097, 1))
    transport = MockTransport([Response(200, claim(content)), Response(204), Response(200, content=content), Response(204)])

    result = runner(tmp_path, transport).run()

    assert result.status == "failed"
    assert transport.requests[-1]["url"].endswith("/runner/tasks/task-1/complete")
    assert transport.requests[-1]["json"]["status"] == "failed"
    assert transport.requests[-1]["json"]["error"]["code"] == "invalid_input"


def test_invalid_parameters_report_failure_without_running_adapter(tmp_path):
    content = image_bytes()
    transport = MockTransport([Response(200, claim(content, parameters={"points_per_side": 65, "crop_n_layers": 0})), Response(204), Response(200, content=content), Response(204)])

    result = runner(tmp_path, transport).run()

    assert result.status == "failed"
    assert transport.requests[-1]["json"]["error"]["code"] == "invalid_parameters"


def test_upload_failure_reports_task_failure(tmp_path):
    content = image_bytes()
    transport = MockTransport([
        Response(200, claim(content)), Response(204), Response(200, content=content),
        Response(204), Response(204), Response(204), Response(500), Response(204),
    ])

    result = runner(tmp_path, transport).run()

    assert result.status == "failed"
    assert transport.requests[-1]["json"]["error"]["code"] == "remote_request_failed"


def test_completion_response_loss_retries_success_callback(tmp_path):
    content = image_bytes()
    transport = MockTransport([
        Response(200, claim(content)), Response(204), Response(200, content=content),
        *[Response(204) for _ in range(7)], ConnectionError("response lost"), Response(204),
    ])

    result = runner(tmp_path, transport).run()

    assert result.status == "succeeded"
    complete = [request for request in transport.requests if request["url"].endswith("/complete")]
    assert [request["json"] for request in complete] == [{"status": "succeeded"}, {"status": "succeeded"}]


def test_malformed_claim_is_reported_after_the_token_is_received(tmp_path):
    transport = MockTransport([Response(200, {"token": "task-token", "task": "not-an-object"}), Response(204)])

    result = runner(tmp_path, transport).run()

    assert result.status == "failed"
    assert result.error_code == "invalid_claim"
    assert transport.requests[-1]["json"]["error"]["code"] == "invalid_claim"


def test_constructor_rejects_untrusted_task_identifiers_and_api_origin(tmp_path):
    with pytest.raises(ValueError):
        CloudRunner("http://worker.example/api", "key", "../task", "attempt", "run", data_dir=tmp_path)
    with pytest.raises(ValueError):
        CloudRunner("http://worker.example/api", "key", "task", "attempt", "run", data_dir=tmp_path)


def test_parameter_defaults_are_present_and_boolean_values_are_rejected():
    assert CloudRunner._validate_parameters("sam2", {"crop_n_layers": 0}) == {"crop_n_layers": 0, "points_per_side": 32, "points_per_batch": 1}
    with pytest.raises(RunnerError):
        CloudRunner._validate_parameters("sam2", {"points_per_side": True, "crop_n_layers": 0})


def test_display_thumbnail_and_output_size_limits(tmp_path):
    image = Image.new("RGB", (4096, 1536), "white")
    source = tmp_path / "input.png"
    image.save(source)
    with Image.open(io.BytesIO(runner(tmp_path, MockTransport([]))._display_webp(source))) as display:
        assert display.size == (3072, 1152)
    with pytest.raises(RunnerError):
        CloudRunner._validate_output_size("display.webp", b"x" * (10 * 1024 * 1024 + 1))

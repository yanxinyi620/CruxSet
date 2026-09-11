"""Bounded, one-shot executor for a claimed cloud segmentation task."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Mapping, Protocol
from urllib.parse import urlparse

import httpx
from PIL import Image

from .adapters.base import SegmentationAdapter
from .adapters.sam2 import Sam2Adapter
from .experiments import ExperimentStore
from .service import BenchmarkService


MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_SIDE = 4096
MAX_PIXELS = 16_777_216
MAX_CANDIDATES_BYTES = 10 * 1024 * 1024
MAX_DISPLAY_BYTES = 10 * 1024 * 1024
MAX_MASKS_BYTES = 64 * 1024 * 1024
MODEL_REVISION = "665f8e2ad61cf5f53d65644ff27c8ee525124610"
ALLOWED_PARAMETERS = {"points_per_side", "points_per_batch", "pred_iou_thresh", "stability_score_thresh", "crop_n_layers"}


class Transport(Protocol):
    def request(self, method: str, url: str, *, headers: dict[str, str] | None = None, json: object | None = None, content: bytes | None = None): ...


@dataclass(frozen=True)
class RunnerResult:
    status: str
    error_code: str | None = None


class RunnerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class HttpxTransport:
    def __init__(self) -> None:
        self.client = httpx.Client(timeout=httpx.Timeout(120.0, connect=20.0))

    def request(self, method: str, url: str, *, headers: dict[str, str] | None = None, json: object | None = None, content: bytes | None = None):
        return self.client.request(method, url, headers=headers, json=json, content=content)


class CloudRunner:
    def __init__(self, api_url: str, runner_key: str, task_id: str, attempt_id: str, run_id: str, *, transport: Transport | None = None, data_dir: Path | None = None, adapters: Mapping[str, SegmentationAdapter] | None = None) -> None:
        parsed = urlparse(api_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
            raise ValueError("LAB_API_URL must be an HTTPS API origin and path")
        if not self._safe_identifier(task_id) or not self._safe_identifier(attempt_id):
            raise ValueError("task_id and attempt_id must be path-safe identifiers")
        self.api_url = api_url.rstrip("/")
        self.runner_key = runner_key
        self.task_id = task_id
        self.attempt_id = attempt_id
        self.run_id = run_id
        self.transport = transport or HttpxTransport()
        self.data_dir = data_dir
        self.adapters = adapters

    @staticmethod
    def _safe_identifier(value: str) -> bool:
        return bool(value) and len(value) <= 128 and all(character.isalnum() or character in "._:-" for character in value) and value not in {".", ".."}

    def _url(self, suffix: str) -> str:
        return f"{self.api_url}{suffix}"

    @staticmethod
    def _ok(response, allowed: tuple[int, ...] = (200, 201, 202, 204)) -> None:
        if response.status_code not in allowed:
            raise RunnerError("remote_request_failed", f"Remote request returned HTTP {response.status_code}")

    def _task_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def _progress(self, token: str, progress: float, message: str) -> None:
        response = self.transport.request("POST", self._url(f"/runner/tasks/{self.task_id}/progress"), headers=self._task_headers(token), json={"progress": progress, "message": message})
        self._ok(response)

    def _complete(self, token: str, status: str, error: RunnerError | None = None) -> None:
        payload: dict[str, object] = {"status": status}
        if error is not None:
            payload["error"] = {"code": error.code, "message": str(error)}
        for _ in range(3):
            try:
                response = self.transport.request("POST", self._url(f"/runner/tasks/{self.task_id}/complete"), headers=self._task_headers(token), json=payload)
            except Exception:
                continue
            if response.status_code in {200, 201, 202, 204}:
                return
            if response.status_code < 500:
                self._ok(response)
        raise RunnerError("completion_failed", "Task completion could not be confirmed")

    @staticmethod
    def _validate_parameters(model: object, parameters: object) -> dict[str, object]:
        if model not in {"sam2", "sam2_tiled"}:
            raise RunnerError("invalid_parameters", "Cloud runner supports SAM 2 models only")
        if not isinstance(parameters, dict) or set(parameters) - ALLOWED_PARAMETERS:
            raise RunnerError("invalid_parameters", "Task parameters are not allowed")
        values = dict(parameters)
        values.setdefault("crop_n_layers", 0)
        values.setdefault("points_per_side", 32)
        values.setdefault("points_per_batch", 1)
        points = values["points_per_side"]
        batch = values["points_per_batch"]
        if isinstance(points, bool) or not isinstance(points, int) or not 8 <= points <= 64:
            raise RunnerError("invalid_parameters", "points_per_side must be between 8 and 64")
        if isinstance(batch, bool) or not isinstance(batch, int) or not 1 <= batch <= 8:
            raise RunnerError("invalid_parameters", "points_per_batch must be between 1 and 8")
        if values.get("crop_n_layers", 0) != 0:
            raise RunnerError("invalid_parameters", "crop_n_layers must be zero")
        for key in ("pred_iou_thresh", "stability_score_thresh"):
            if key in values and (not isinstance(values[key], (int, float)) or isinstance(values[key], bool) or not 0 <= values[key] <= 1):
                raise RunnerError("invalid_parameters", f"{key} must be between 0 and 1")
        return values

    @staticmethod
    def _validate_input(content: bytes, task: dict[str, object]) -> tuple[int, int, str]:
        image = task.get("image")
        if len(content) > MAX_INPUT_BYTES:
            raise RunnerError("invalid_input", "Input exceeds 20 MiB")
        if not isinstance(image, dict):
            raise RunnerError("invalid_input", "Task image metadata is invalid")
        if hashlib.sha256(content).hexdigest() != image.get("sha256"):
            raise RunnerError("invalid_input", "Input checksum does not match task metadata")
        try:
            with Image.open(BytesIO(content)) as decoded:
                decoded.verify()
            with Image.open(BytesIO(content)) as decoded:
                width, height = decoded.size
                image_format = decoded.format
        except Exception as error:
            raise RunnerError("invalid_input", "Input image could not be decoded") from error
        if image_format not in {"JPEG", "PNG"}:
            raise RunnerError("invalid_input", "Input must be a JPEG or PNG image")
        if width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
            raise RunnerError("invalid_input", "Input image dimensions exceed the cloud limit")
        if width != image.get("width") or height != image.get("height"):
            raise RunnerError("invalid_input", "Input dimensions do not match task metadata")
        return width, height, ".jpg" if image_format == "JPEG" else ".png"

    def _adapters_for(self, model: str) -> Mapping[str, SegmentationAdapter]:
        if self.adapters is not None:
            return self.adapters
        revision = os.environ.get("SEG_LAB_SAM2_REVISION", MODEL_REVISION)
        model_name = os.environ.get("SEG_LAB_SAM2_MODEL", "facebook/sam2.1-hiera-large")
        return {model: Sam2Adapter(model_name=model_name, revision=revision, tiled=model == "sam2_tiled")}

    @staticmethod
    def _validate_output_size(name: str, output: bytes) -> None:
        limits = {"candidates.json": MAX_CANDIDATES_BYTES, "display.webp": MAX_DISPLAY_BYTES, "masks.zip": MAX_MASKS_BYTES}
        if len(output) > limits[name]:
            raise RunnerError("output_too_large", f"{name} exceeds its cloud output limit")

    @staticmethod
    def _display_webp(image_path: Path) -> bytes:
        display = BytesIO()
        with Image.open(image_path) as source:
            thumbnail = source.convert("RGB")
            thumbnail.thumbnail((3072, 3072), Image.Resampling.LANCZOS)
            thumbnail.save(display, format="WEBP", quality=90, method=6)
        return display.getvalue()

    def _outputs(self, root: Path, experiment_id: str, task_id: str, image_path: Path) -> list[tuple[str, bytes, str]]:
        store = ExperimentStore(root)
        items = store.list_candidates(experiment_id, source=task_id)
        candidates = json.dumps({"items": items}, separators=(",", ":"), ensure_ascii=False).encode()
        archive = BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for item in items:
                mask_path = item.get("maskPath")
                if isinstance(mask_path, str):
                    output.write(store.root / experiment_id / mask_path, arcname=mask_path)
        outputs = [("candidates.json", candidates, "application/json"), ("display.webp", self._display_webp(image_path), "image/webp"), ("masks.zip", archive.getvalue(), "application/zip")]
        for name, output, _ in outputs:
            self._validate_output_size(name, output)
        return outputs

    def run(self) -> RunnerResult:
        try:
            claim = self.transport.request("POST", self._url("/runner/claim"), headers={"Authorization": f"Bearer {self.runner_key}"}, json={"taskId": self.task_id, "attemptId": self.attempt_id, "runId": self.run_id})
        except Exception:
            return RunnerResult("failed", "claim_failed")
        if claim.status_code != 200:
            return RunnerResult("not_claimed")
        token: str | None = None
        completion_started = False
        try:
            payload = claim.json()
            if isinstance(payload, dict) and isinstance(payload.get("token"), str):
                token = payload["token"]
            if not isinstance(payload, dict) or token is None or not isinstance(payload.get("task"), dict):
                raise RunnerError("invalid_claim", "Claim response is invalid")
            task = payload["task"]
            if task.get("id") != self.task_id or task.get("attemptId") != self.attempt_id:
                raise RunnerError("invalid_claim", "Claim response does not match this task attempt")
            if payload.get("inputUrl") != self._url(f"/runner/tasks/{self.task_id}/input"):
                raise RunnerError("invalid_claim", "Claim response input URL is invalid")
            self._progress(token, .05, "downloading input")
            input_response = self.transport.request("GET", self._url(f"/runner/tasks/{self.task_id}/input"), headers=self._task_headers(token))
            self._ok(input_response, (200,))
            content = input_response.content
            width, height, suffix = self._validate_input(content, task)
            parameters = self._validate_parameters(task.get("model"), task.get("parameters"))
            self._progress(token, .15, "validating input")
            with tempfile.TemporaryDirectory(dir=self.data_dir) as temporary:
                root = Path(temporary)
                image_name = f"input{suffix}"
                image_path = root / image_name
                image_path.write_bytes(content)
                store = ExperimentStore(root)
                experiment = store.create(image_name, str(task["image"]["sha256"]), width, height)
                (store.root / experiment.id / "input").mkdir(exist_ok=True)
                local_image = store.root / experiment.id / "input" / f"original{image_path.suffix.lower()}"
                local_image.write_bytes(content)
                model = str(task["model"])
                store.finish_run(experiment.id, self.task_id, "running", parameters=parameters)
                original_progress = store.update_run_progress

                def bridge_progress(experiment_id: str, task_id: str, progress: float, message: str) -> None:
                    original_progress(experiment_id, task_id, progress, message)
                    self._progress(token, min(.80, .25 + max(.0, min(1.0, progress)) * .55), message)

                store.update_run_progress = bridge_progress  # type: ignore[method-assign]
                service = BenchmarkService(store, self._adapters_for(model))
                self._progress(token, .25, "loading model")
                service.run_existing(experiment.id, local_image, width, height, self.task_id, model, parameters)
                run = next(item for item in store.list_experiments() if item["id"] == experiment.id)["runs"][self.task_id]
                if run["status"] != "succeeded":
                    raise RunnerError("generation_failed", str((run.get("error") or {}).get("message", "Segmentation failed")))
                self._progress(token, .82, "packaging outputs")
                for name, output, content_type in self._outputs(root, experiment.id, self.task_id, local_image):
                    response = self.transport.request("PUT", self._url(f"/runner/tasks/{self.task_id}/outputs/{name}"), headers={**self._task_headers(token), "Content-Type": content_type}, content=output)
                    self._ok(response)
            completion_started = True
            self._complete(token, "succeeded")
            return RunnerResult("succeeded")
        except RunnerError as error:
            if token is not None and not completion_started:
                try:
                    self._complete(token, "failed", error)
                except Exception:
                    pass
            return RunnerResult("failed", error.code)
        except Exception:
            error = RunnerError("runner_failed", "Cloud segmentation runner failed")
            if token is not None and not completion_started:
                try:
                    self._complete(token, "failed", error)
                except Exception:
                    pass
            return RunnerResult("failed", error.code)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("LAB_API_URL", ""))
    parser.add_argument("--runner-key", default=os.environ.get("LAB_RUNNER_KEY", ""))
    parser.add_argument("--task-id", default=os.environ.get("LAB_TASK_ID", ""))
    parser.add_argument("--attempt-id", default=os.environ.get("LAB_ATTEMPT_ID", ""))
    parser.add_argument("--run-id", default=os.environ.get("LAB_RUN_ID", ""))
    args = parser.parse_args()
    if not all((args.api_url, args.runner_key, args.task_id, args.attempt_id, args.run_id)):
        return 2
    result = CloudRunner(args.api_url, args.runner_key, args.task_id, args.attempt_id, args.run_id).run()
    if result.error_code:
        print(result.error_code)
    return 0 if result.status in {"succeeded", "not_claimed"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""One-way publication of calibrated segmentation results to CloudBase.

This module deliberately does not call the local CruxSet/FastAPI publisher.  It
is an optional, server-only side channel: a failed CloudBase operation is
recorded on the calibration but never changes the local publication record.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import mimetypes
import time
from pathlib import Path
from typing import Any

import httpx

from .errors import SegmentationLabError
from .experiments import ExperimentStore


SUPPORTED_HOLD_KINDS = {"hold", "volume"}
SUPPORTED_ANGLES = {20, 25, 30, 35, 40, 45}
REQUIRED_METADATA = {
    "publishRequestId",
    "sourceExperimentId",
    "sourceCalibrationId",
    "wallName",
    "imageWidth",
    "imageHeight",
    "holds",
}


def _invalid(code: str, message: str, retryable: bool = False) -> SegmentationLabError:
    return SegmentationLabError(code, message, retryable)


def normalize_polygon(polygon: Any, width: int, height: int) -> list[list[float]]:
    """Validate a pixel polygon and map it to the unit coordinate space."""
    if isinstance(width, bool) or isinstance(height, bool) or not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        raise _invalid("cloudbase_invalid_metadata", "Image dimensions must be positive integers")
    if not isinstance(polygon, (list, tuple)) or len(polygon) < 3:
        raise _invalid("cloudbase_invalid_polygon", "Each hold needs at least three polygon points")
    result: list[list[float]] = []
    for point in polygon:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise _invalid("cloudbase_invalid_polygon", "Polygon points must contain x and y")
        x, y = point
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in (x, y)):
            raise _invalid("cloudbase_invalid_polygon", "Polygon coordinates must be finite numbers")
        if not (0 <= x <= width and 0 <= y <= height):
            raise _invalid("cloudbase_invalid_polygon", "Polygon is outside the source image")
        result.append([float(x) / width, float(y) / height])
    if len({tuple(point) for point in result}) < 3:
        raise _invalid("cloudbase_invalid_polygon", "Polygon must contain three distinct points")
    area = abs(sum(result[i][0] * result[(i + 1) % len(result)][1] - result[(i + 1) % len(result)][0] * result[i][1] for i in range(len(result))) / 2)
    if not math.isfinite(area) or area <= 0:
        raise _invalid("cloudbase_invalid_polygon", "Polygon area must be positive")
    return result


def build_normalized_holds(raw_holds: Any, width: int, height: int) -> list[dict[str, Any]]:
    """Build stable H001... hold IDs from calibrated source candidates."""
    if not isinstance(raw_holds, list) or not raw_holds:
        raise _invalid("cloudbase_invalid_metadata", "At least one hold is required")
    prepared: list[dict[str, Any]] = []
    source_ids: set[str] = set()
    for item in raw_holds:
        if not isinstance(item, dict):
            raise _invalid("cloudbase_invalid_metadata", "Hold metadata must be an object")
        source_id = item.get("sourceId", item.get("id"))
        if not isinstance(source_id, str) or not source_id or source_id in source_ids:
            raise _invalid("cloudbase_invalid_metadata", "Hold source IDs must be non-empty and unique")
        source_ids.add(source_id)
        kind = item.get("kind", "hold")
        if kind not in SUPPORTED_HOLD_KINDS:
            raise _invalid("cloudbase_invalid_hold_kind", "Only hold and volume kinds are supported")
        polygon = normalize_polygon(item.get("polygon"), width, height)
        xs = [point[0] for point in polygon]
        ys = [point[1] for point in polygon]
        area = abs(sum(polygon[i][0] * polygon[(i + 1) % len(polygon)][1] - polygon[(i + 1) % len(polygon)][0] * polygon[i][1] for i in range(len(polygon))) / 2)
        prepared.append({
            "sourceId": source_id,
            "kind": kind,
            "polygon": polygon,
            "_sort": (min(ys), min(xs), source_id),
            "x": sum(xs) / len(xs),
            "y": sum(ys) / len(ys),
            "radius": math.sqrt(area / math.pi),
        })
    prepared.sort(key=lambda item: item.pop("_sort"))
    for index, item in enumerate(prepared, 1):
        item["id"] = f"H{index:03d}"
    return prepared


def _canonical_json(payload: dict[str, Any]) -> str:
    # Match JSON.stringify's representation for integral floats (for example
    # 0 rather than Python's 0.0), so signatures verify in Node as well.
    def compatible(value: Any) -> Any:
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, list):
            return [compatible(item) for item in value]
        if isinstance(value, dict):
            return {key: compatible(item) for key, item in value.items()}
        return value

    return json.dumps(compatible(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class CloudBaseSynchronizer:
    """Upload a wall image and submit a signed CloudBase publish request."""

    def __init__(
        self,
        function_url: str,
        signing_key: str = "",
        *,
        storage_url: str | None = None,
        owner_openid: str = "",
        publish_key: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 60,
    ) -> None:
        self.function_url = function_url.rstrip("/")
        self.storage_url = storage_url.rstrip("/") if storage_url else ""
        self.signing_key = signing_key or publish_key or ""
        self.owner_openid = owner_openid
        self.transport = transport
        self.timeout = timeout

    def validate_metadata(self, metadata: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(metadata, dict) or not REQUIRED_METADATA.issubset(metadata):
            raise _invalid("cloudbase_invalid_metadata", "Missing required CloudBase publish metadata")
        if "ownerId" in metadata:
            raise _invalid("cloudbase_invalid_metadata", "CloudBase ownerId must be resolved by the cloud function")
        required_strings = ("publishRequestId", "sourceExperimentId", "sourceCalibrationId", "wallName")
        if any(not isinstance(metadata.get(field), str) or not metadata[field].strip() for field in required_strings):
            raise _invalid("cloudbase_invalid_metadata", "Publish metadata identifiers and wall name are required")
        width, height = metadata["imageWidth"], metadata["imageHeight"]
        if isinstance(width, bool) or isinstance(height, bool) or not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
            raise _invalid("cloudbase_invalid_metadata", "Image dimensions must be positive integers")
        description = metadata.get("description", "")
        if not isinstance(description, str) or len(description) > 500:
            raise _invalid("cloudbase_invalid_metadata", "Wall description must be at most 500 characters")
        angles = metadata.get("angleOptions", sorted(SUPPORTED_ANGLES))
        if not isinstance(angles, list) or not angles or any(isinstance(value, bool) or value not in SUPPORTED_ANGLES for value in angles):
            raise _invalid("cloudbase_invalid_metadata", "Wall angle options are invalid")
        return {
            **metadata,
            "description": description,
            "angleOptions": angles,
            "geometryType": "polygon",
            "visibility": "public",
            "holds": build_normalized_holds(metadata["holds"], width, height),
        }

    async def _upload_image(self, client: httpx.AsyncClient, image: bytes, filename: str) -> str:
        if not self.storage_url:
            raise _invalid("cloudbase_storage_not_configured", "CloudBase Storage endpoint is not configured")
        try:
            response = await client.post(
                self.storage_url,
                files={"file": (Path(filename).name, image, mimetypes.guess_type(filename)[0] or "application/octet-stream")},
            )
        except httpx.HTTPError as error:
            raise _invalid("cloudbase_unavailable", "CloudBase Storage is unavailable", True) from error
        if response.status_code >= 400:
            raise _invalid("cloudbase_storage_failed", "CloudBase image upload failed", response.status_code >= 500)
        try:
            payload = response.json()
        except ValueError as error:
            raise _invalid("cloudbase_storage_failed", "CloudBase Storage returned invalid metadata", True) from error
        file_id = payload.get("fileID", payload.get("fileId", payload.get("file_id")))
        if not isinstance(file_id, str) or not file_id.startswith("cloud://"):
            raise _invalid("cloudbase_storage_failed", "CloudBase Storage did not return a cloud file ID", True)
        return file_id

    async def publish(self, image: bytes, filename: str, metadata: dict[str, Any]) -> dict[str, Any]:
        if not self.function_url or not self.signing_key or not self.owner_openid:
            raise _invalid("cloudbase_not_configured", "CloudBase synchronizer is not configured")
        payload = self.validate_metadata(metadata)
        async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout) as client:
            file_id = await self._upload_image(client, image, filename)
            signed_payload = {**payload, "imageFileId": file_id, "ownerOpenid": self.owner_openid, "timestamp": int(time.time())}
            signature = hmac.new(self.signing_key.encode(), _canonical_json(signed_payload).encode(), hashlib.sha256).hexdigest()
            request_payload = {**signed_payload, "signature": signature}
            try:
                response = await client.post(self.function_url, json=request_payload, headers={"x-cruxset-signature": signature})
            except httpx.HTTPError as error:
                raise _invalid("cloudbase_unavailable", "CloudBase publish function is unavailable", True) from error
        if response.status_code >= 400:
            try:
                detail = response.json().get("error", {}).get("message", "CloudBase publish failed")
            except ValueError:
                detail = "CloudBase publish failed"
            raise _invalid("cloudbase_publish_failed", str(detail), response.status_code >= 500)
        try:
            return response.json()
        except ValueError as error:
            raise _invalid("cloudbase_publish_failed", "CloudBase publish returned invalid JSON", True) from error


async def sync_calibration(store: ExperimentStore, experiment_id: str, calibration_id: str, synchronizer: CloudBaseSynchronizer, wall_name: str | None = None, publish_request_id: str | None = None) -> dict[str, Any]:
    """Sync a calibration and persist only a separate ``sync`` receipt."""
    request_id = publish_request_id or f"{experiment_id}:{calibration_id}"
    try:
        experiment = next(item for item in store.list_experiments() if item["id"] == experiment_id)
        calibration = next(item for item in store.list_calibrations(experiment_id) if item["id"] == calibration_id)
        image_path = next((store.root / experiment_id / "input").glob("original.*"), None)
        if image_path is None:
            raise _invalid("cloudbase_image_not_found", "Experiment image was not found", True)
        metadata = {
            "publishRequestId": request_id,
            "sourceExperimentId": experiment_id,
            "sourceCalibrationId": calibration_id,
            "wallName": wall_name or f"{experiment['imageName']} · 校准 {calibration_id[:8]}",
            "imageWidth": experiment["width"],
            "imageHeight": experiment["height"],
            "holds": store.read_calibration_candidates(experiment_id, calibration_id),
        }
        result = await synchronizer.publish(image_path.read_bytes(), str(experiment["imageName"]), metadata)
        receipt = {**result, "publishRequestId": request_id, "status": "succeeded", "updatedAt": time.time()}
        store.record_calibration_sync(experiment_id, calibration_id, receipt)
        return result
    except Exception as error:
        if isinstance(error, SegmentationLabError):
            sync_error = error
        else:
            sync_error = _invalid("cloudbase_sync_failed", str(error), True)
        store.record_calibration_sync(experiment_id, calibration_id, {"publishRequestId": request_id, "status": "failed", "code": sync_error.code, "message": sync_error.message, "retryable": sync_error.retryable, "updatedAt": time.time()})
        raise sync_error


# Friendly aliases for callers that describe this boundary as a publisher.
CloudBasePublisher = CloudBaseSynchronizer
CloudBaseSync = CloudBaseSynchronizer
normalize_holds = build_normalized_holds


def validate_publish_metadata(metadata: dict[str, Any], *, owner_openid: str = "") -> dict[str, Any]:
    """Validate/normalize metadata without constructing a network client."""
    return CloudBaseSynchronizer("local-validation", "local-validation", owner_openid=owner_openid).validate_metadata(metadata)

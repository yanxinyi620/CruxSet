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
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx

from .errors import SegmentationLabError
from .experiments import ExperimentStore


SUPPORTED_HOLD_KINDS = {"hold", "volume"}
SUPPORTED_ANGLES = {20, 25, 30, 35, 40, 45}
MIN_POLYGON_AREA = 1e-6
TOP_EDGE_TOLERANCE_PIXELS = 4.0
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


def detect_image_content_type(content: bytes) -> str | None:
    """Detect the supported image type from its magic bytes, not its name."""
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


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
    if _has_self_intersection(result):
        raise _invalid("cloudbase_invalid_polygon", "Polygon edges must not self-intersect")
    area = abs(_signed_area(result))
    if not math.isfinite(area) or area < MIN_POLYGON_AREA:
        raise _invalid("cloudbase_invalid_polygon", "Polygon area must be positive")
    return result


def _signed_area(polygon: list[list[float]]) -> float:
    return sum(polygon[i][0] * polygon[(i + 1) % len(polygon)][1] - polygon[(i + 1) % len(polygon)][0] * polygon[i][1] for i in range(len(polygon))) / 2


def _orientation(a: list[float], b: list[float], c: list[float]) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a: list[float], b: list[float], point: list[float]) -> bool:
    return min(a[0], b[0]) <= point[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= point[1] <= max(a[1], b[1])


def _segments_intersect(a: list[float], b: list[float], c: list[float], d: list[float]) -> bool:
    ab_c, ab_d = _orientation(a, b, c), _orientation(a, b, d)
    cd_a, cd_b = _orientation(c, d, a), _orientation(c, d, b)
    epsilon = 1e-12
    if ((ab_c > epsilon and ab_d < -epsilon) or (ab_c < -epsilon and ab_d > epsilon)) and ((cd_a > epsilon and cd_b < -epsilon) or (cd_a < -epsilon and cd_b > epsilon)):
        return True
    return (abs(ab_c) <= epsilon and _on_segment(a, b, c)) or (abs(ab_d) <= epsilon and _on_segment(a, b, d)) or (abs(cd_a) <= epsilon and _on_segment(c, d, a)) or (abs(cd_b) <= epsilon and _on_segment(c, d, b))


def _has_self_intersection(polygon: list[list[float]]) -> bool:
    length = len(polygon)
    for i in range(length):
        a, b = polygon[i], polygon[(i + 1) % length]
        for j in range(i + 1, length):
            # Adjacent edges share an endpoint by definition and are valid.
            if j in {i, (i + 1) % length} or (i == 0 and j == length - 1):
                continue
            if _segments_intersect(a, b, polygon[j], polygon[(j + 1) % length]):
                return True
    return False


def _point_in_polygon(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    x, y = point
    inside = False
    for index, current in enumerate(polygon):
        previous = polygon[index - 1]
        if ((current[1] > y) != (previous[1] > y)) and x < (previous[0] - current[0]) * (y - current[1]) / (previous[1] - current[1]) + current[0]:
            inside = not inside
    return inside


def _triangle_contains(point: list[float], triangle: list[list[float]]) -> bool:
    signs = [_orientation(triangle[i], triangle[(i + 1) % 3], point) for i in range(3)]
    return all(sign >= -1e-12 for sign in signs) or all(sign <= 1e-12 for sign in signs)


def _interior_representative(polygon: list[list[float]]) -> tuple[float, float]:
    """Return a point from an ear triangle when the area centroid is outside."""
    winding = 1 if _signed_area(polygon) > 0 else -1
    remaining = list(polygon)
    while len(remaining) > 3:
        for index, current in enumerate(remaining):
            previous, following = remaining[index - 1], remaining[(index + 1) % len(remaining)]
            if _orientation(previous, current, following) * winding <= 1e-12:
                continue
            triangle = [previous, current, following]
            if any(_triangle_contains(vertex, triangle) for offset, vertex in enumerate(remaining) if offset not in {(index - 1) % len(remaining), index, (index + 1) % len(remaining)}):
                continue
            return (sum(vertex[0] for vertex in triangle) / 3, sum(vertex[1] for vertex in triangle) / 3)
        break
    if len(remaining) == 3:
        return (sum(vertex[0] for vertex in remaining) / 3, sum(vertex[1] for vertex in remaining) / 3)
    # A valid simple polygon should have an ear. This deterministic fallback
    # handles numerical edge cases without emitting a point outside the wall.
    xs, ys = zip(*polygon)
    for row in range(1, 101):
        for column in range(1, 101):
            candidate = (min(xs) + (max(xs) - min(xs)) * row / 101, min(ys) + (max(ys) - min(ys)) * column / 101)
            if _point_in_polygon(candidate, polygon):
                return candidate
    return tuple(polygon[0])


def _polygon_centroid(polygon: list[list[float]]) -> tuple[float, float]:
    signed_area = _signed_area(polygon)
    factor = 1 / (6 * signed_area)
    x = sum((polygon[i][0] + polygon[(i + 1) % len(polygon)][0]) * (polygon[i][0] * polygon[(i + 1) % len(polygon)][1] - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]) for i in range(len(polygon))) * factor
    y = sum((polygon[i][1] + polygon[(i + 1) % len(polygon)][1]) * (polygon[i][0] * polygon[(i + 1) % len(polygon)][1] - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]) for i in range(len(polygon))) * factor
    return (x, y) if _point_in_polygon((x, y), polygon) else _interior_representative(polygon)


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
        area = abs(_signed_area(polygon))
        centroid_x, centroid_y = _polygon_centroid(polygon)
        prepared.append({
            "sourceId": source_id,
            "kind": kind,
            "polygon": polygon,
            "_top": min(ys) * height,
            "_left": min(xs),
            "x": centroid_x,
            "y": centroid_y,
            "radius": math.sqrt(area / math.pi),
            "bbox": [min(xs), min(ys), max(xs), max(ys)],
        })
    prepared.sort(key=lambda item: (item["_top"], item["_left"], item["sourceId"]))
    bands: list[tuple[float, list[dict[str, Any]]]] = []
    for item in prepared:
        if not bands or item["_top"] - bands[-1][0] > TOP_EDGE_TOLERANCE_PIXELS:
            bands.append((item["_top"], [item]))
        else:
            bands[-1][1].append(item)
    prepared = [item for _, band in bands for item in sorted(band, key=lambda item: (item["_left"], item["sourceId"]))]
    for index, item in enumerate(prepared, 1):
        item["id"] = f"H{index:03d}"
        item.pop("_top")
        item.pop("_left")
    return prepared


def _canonical_json(payload: dict[str, Any]) -> str:
    """Serialize like Node's JSON.stringify, including exponent spelling."""
    def number(value: float | int) -> str:
        if isinstance(value, int):
            return str(value)
        if value == 0:
            return "0"
        text = repr(value)
        absolute = abs(value)
        if "e" not in text and "E" not in text:
            return text[:-2] if text.endswith(".0") else text
        mantissa, exponent = text.lower().split("e")
        exponent_value = int(exponent)
        # ECMAScript uses fixed notation for [1e-6, 1e21).
        if 1e-6 <= absolute < 1e21:
            fixed = format(Decimal(text), "f")
            if "." in fixed:
                fixed = fixed.rstrip("0").rstrip(".")
            return fixed if fixed not in {"-0", ""} else "0"
        sign = "+" if exponent_value >= 0 else "-"
        return f"{mantissa}e{sign}{abs(exponent_value)}"

    def serialize(value: Any) -> str:
        if isinstance(value, bool) or value is None:
            return json.dumps(value)
        if isinstance(value, (int, float)):
            return number(value)
        if isinstance(value, str):
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if isinstance(value, list):
            return "[" + ",".join(serialize(item) for item in value) + "]"
        if isinstance(value, dict):
            return "{" + ",".join(serialize(str(key)) + ":" + serialize(value[key]) for key in sorted(value)) + "}"
        raise TypeError(f"Unsupported canonical JSON value: {type(value).__name__}")

    return serialize(payload)


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
        safe_filename = Path(str(filename).replace("\\", "/")).name or "upload"
        content_type = detect_image_content_type(image)
        if content_type is None:
            raise _invalid("cloudbase_invalid_image", "CloudBase upload requires a valid PNG, JPEG, or WebP image")
        timestamp = str(int(time.time()))
        signed_metadata = {
            "timestamp": timestamp,
            "filename": safe_filename,
            "contentType": content_type,
            "contentSha256": hashlib.sha256(image).hexdigest(),
            "contentLength": len(image),
        }
        signature = hmac.new(self.signing_key.encode(), _canonical_json(signed_metadata).encode(), hashlib.sha256).hexdigest()
        try:
            response = await client.post(
                self.storage_url,
                files={"file": (safe_filename, image, content_type)},
                headers={
                    "x-cruxset-timestamp": timestamp,
                    "x-cruxset-filename": safe_filename,
                    "x-cruxset-content-type": content_type,
                    "x-cruxset-content-sha256": signed_metadata["contentSha256"],
                    "x-cruxset-content-length": str(len(image)),
                    "x-cruxset-signature": signature,
                },
            )
        except httpx.HTTPError as error:
            raise _invalid("cloudbase_unavailable", "CloudBase Storage is unavailable", True) from error
        if not 200 <= response.status_code < 300:
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
        if not 200 <= response.status_code < 300:
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
        receipt = {**result, "target": "cloudbase", "publishRequestId": request_id, "status": "succeeded", "updatedAt": time.time()}
        store.record_calibration_sync(experiment_id, calibration_id, receipt)
        return result
    except Exception as error:
        if isinstance(error, SegmentationLabError):
            sync_error = error
        else:
            sync_error = _invalid("cloudbase_sync_failed", str(error), True)
        store.record_calibration_sync(experiment_id, calibration_id, {"target": "cloudbase", "publishRequestId": request_id, "status": "failed", "code": sync_error.code, "message": sync_error.message, "retryable": sync_error.retryable, "updatedAt": time.time()})
        raise sync_error


# Friendly aliases for callers that describe this boundary as a publisher.
CloudBasePublisher = CloudBaseSynchronizer
CloudBaseSync = CloudBaseSynchronizer
normalize_holds = build_normalized_holds


def validate_publish_metadata(metadata: dict[str, Any], *, owner_openid: str = "") -> dict[str, Any]:
    """Validate/normalize metadata without constructing a network client."""
    return CloudBaseSynchronizer("local-validation", "local-validation", owner_openid=owner_openid).validate_metadata(metadata)

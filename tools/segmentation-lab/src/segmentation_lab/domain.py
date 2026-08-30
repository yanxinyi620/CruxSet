from dataclasses import dataclass
from math import isfinite
from typing import Any, Literal


Source = Literal["sam2", "sam3", "manual"]
CandidateStatus = Literal["pending", "confirmed", "deleted"]
Point = tuple[float, float]


@dataclass(frozen=True)
class BBox:
    x1: int
    y1: int
    x2: int
    y2: int

    def __post_init__(self) -> None:
        if self.x2 <= self.x1 or self.y2 <= self.y1:
            raise ValueError("bbox must have positive width and height")


@dataclass(frozen=True)
class RawCandidate:
    id: str
    source: Source
    mask_path: str
    bbox: BBox
    area: int
    model_score: float | None
    post_score: float | None
    polygon: tuple[Point, ...]
    status: CandidateStatus
    metadata: dict[str, Any]

    def __post_init__(self) -> None:
        if not self.id or not self.mask_path:
            raise ValueError("candidate id and mask path are required")
        if self.area <= 0:
            raise ValueError("candidate area must be positive")
        if len(self.polygon) < 3:
            raise ValueError("polygon must have at least three points")
        if not all(isfinite(value) for point in self.polygon for value in point):
            raise ValueError("polygon coordinates must be finite")


def candidate_to_json(candidate: RawCandidate) -> dict[str, Any]:
    return {
        "id": candidate.id,
        "source": candidate.source,
        "maskPath": candidate.mask_path,
        "bbox": {"x1": candidate.bbox.x1, "y1": candidate.bbox.y1, "x2": candidate.bbox.x2, "y2": candidate.bbox.y2},
        "area": candidate.area,
        "modelScore": candidate.model_score,
        "postScore": candidate.post_score,
        "polygon": [[x, y] for x, y in candidate.polygon],
        "status": candidate.status,
        "metadata": candidate.metadata,
    }


def candidate_from_json(payload: dict[str, Any]) -> RawCandidate:
    bbox = payload["bbox"]
    return RawCandidate(
        id=payload["id"],
        source=payload["source"],
        mask_path=payload["maskPath"],
        bbox=BBox(bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]),
        area=payload["area"],
        model_score=payload.get("modelScore"),
        post_score=payload.get("postScore"),
        polygon=tuple((float(x), float(y)) for x, y in payload["polygon"]),
        status=payload["status"],
        metadata=payload.get("metadata", {}),
    )

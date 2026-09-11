"""Global geometry plus bit-packed bbox pixels for lossless local comparisons."""
from dataclasses import dataclass

import numpy as np

from .adapters.base import AdapterMask
from .masks import polygon_from_mask


@dataclass(frozen=True)
class CompactCandidate:
    polygon: tuple[tuple[float, float], ...]
    bbox: dict[str, int]
    area: int
    score: float | None
    metadata: dict[str, object]
    packed_mask: bytes

    @classmethod
    def from_mask(cls, item: AdapterMask, offset: tuple[int, int] = (0, 0)) -> 'CompactCandidate | None':
        mask = item.mask
        if not np.any(mask):
            return None
        rows = np.flatnonzero(np.any(mask, axis=1))
        columns = np.flatnonzero(np.any(mask, axis=0))
        bbox = {'x1': int(columns[0]), 'y1': int(rows[0]),
                'x2': int(columns[-1] + 1), 'y2': int(rows[-1] + 1)}
        x, y = bbox['x1'], bbox['y1']
        crop = (mask[y:bbox['y2'], x:bbox['x2']] > 0).astype(np.uint8)
        polygon = tuple((px + x + offset[0], py + y + offset[1]) for px, py in polygon_from_mask(crop, 1.0))
        global_bbox = {key: value + offset[0 if key.startswith('x') else 1] for key, value in bbox.items()}
        return cls(polygon, global_bbox, int(crop.sum()), item.score, item.metadata,
                   np.packbits(crop, axis=1).tobytes())

    def region(self, x1: int, y1: int, x2: int, y2: int) -> np.ndarray:
        """Decode only the requested intersection, including partial packed bytes."""
        width = self.bbox['x2'] - self.bbox['x1']
        height = self.bbox['y2'] - self.bbox['y1']
        left, right = x1 - self.bbox['x1'], x2 - self.bbox['x1']
        packed = np.frombuffer(self.packed_mask, dtype=np.uint8).reshape(height, (width + 7) // 8)
        rows = packed[y1-self.bbox['y1']:y2-self.bbox['y1'], left//8:(right+7)//8]
        return np.unpackbits(rows, axis=1)[:, left % 8:left % 8 + right-left]

    def rasterize(self, shape: tuple[int, int]) -> np.ndarray:
        """Materialize one compatibility PNG at a time; never retain this array."""
        b = self.bbox
        full = np.zeros(shape, np.uint8)
        full[b['y1']:b['y2'], b['x1']:b['x2']] = self.region(b['x1'], b['y1'], b['x2'], b['y2'])
        return full


def candidate_iou(left: CompactCandidate, right: CompactCandidate) -> float:
    a, b = left.bbox, right.bbox
    x1, y1 = max(a['x1'], b['x1']), max(a['y1'], b['y1'])
    x2, y2 = min(a['x2'], b['x2']), min(a['y2'], b['y2'])
    if x1 >= x2 or y1 >= y2:
        return 0.0
    intersection = int(np.count_nonzero(left.region(x1, y1, x2, y2) & right.region(x1, y1, x2, y2)))
    return intersection / (left.area + right.area - intersection)


def distinct_candidates(candidates: list[CompactCandidate], threshold: float, *, inclusive: bool) -> list[CompactCandidate]:
    kept: list[CompactCandidate] = []
    for candidate in sorted(candidates, key=lambda item: item.score or 0, reverse=True):
        duplicate = False
        for other in kept:
            # Area ratio is an upper bound on IoU; avoid decoding impossible matches.
            if min(candidate.area, other.area) / max(candidate.area, other.area) < threshold:
                continue
            iou = candidate_iou(candidate, other)
            overlaps = iou >= threshold if inclusive else iou > threshold
            if overlaps:
                duplicate = True
                break
        if not duplicate:
            kept.append(candidate)
    return kept

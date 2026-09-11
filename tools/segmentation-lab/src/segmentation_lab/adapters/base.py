from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable, Literal, Protocol

if TYPE_CHECKING:
    from ..candidates import CompactCandidate

import numpy as np


ProgressCallback = Callable[[float, str], None]


@dataclass(frozen=True)
class ModelAvailability:
    available: bool
    reason: str | None
    device: str


@dataclass(frozen=True)
class GenerateRequest:
    image_path: str
    width: int
    height: int
    parameters: dict[str, object]


@dataclass(frozen=True)
class AdapterMask:
    mask: np.ndarray
    score: float | None
    metadata: dict[str, object]


class SegmentationAdapter(Protocol):
    name: Literal["sam2", "sam2_tiled", "sam3"]

    def available(self) -> ModelAvailability: ...

    def generate(self, request: GenerateRequest, progress: ProgressCallback) -> list[AdapterMask] | list[CompactCandidate]: ...

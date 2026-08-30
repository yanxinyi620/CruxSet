from dataclasses import dataclass
from typing import Callable, Literal, Protocol

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
    name: Literal["sam2", "sam3"]

    def available(self) -> ModelAvailability: ...

    def generate(self, request: GenerateRequest, progress: ProgressCallback) -> list[AdapterMask]: ...

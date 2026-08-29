from importlib.util import find_spec
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

from .base import AdapterMask, GenerateRequest, ModelAvailability, ProgressCallback


class Sam2Adapter:
    name = "sam2"

    def __init__(self, model_name: str = "facebook/sam2.1-hiera-large", tiled: bool = False) -> None:
        self.model_name = model_name
        self.tiled = tiled

    @staticmethod
    def pipeline_parameters(parameters: dict[str, object]) -> dict[str, object]:
        translated = dict(parameters)
        if "points_per_side" in translated:
            translated["points_per_crop"] = translated.pop("points_per_side")
        if "crop_n_layers" in translated:
            translated["crops_n_layers"] = translated.pop("crop_n_layers")
        return translated

    @staticmethod
    def tile_boxes(width: int, height: int, overlap: float = 0.2) -> list[tuple[int, int, int, int]]:
        tile_width = int(width * (0.5 + overlap / 2))
        tile_height = int(height * (0.5 + overlap / 2))
        return [(0, 0, tile_width, tile_height), (width - tile_width, 0, width, tile_height), (0, height - tile_height, tile_width, height), (width - tile_width, height - tile_height, width, height)]

    def available(self) -> ModelAvailability:
        if find_spec("transformers") is None:
            return ModelAvailability(False, "transformers_not_installed", "cpu")
        return ModelAvailability(True, None, "cpu")

    def generate(self, request: GenerateRequest, progress: ProgressCallback) -> list[AdapterMask]:
        availability = self.available()
        if not availability.available:
            raise RuntimeError(availability.reason)
        from transformers import pipeline

        progress(0.05, "loading SAM 2.1")
        generator = pipeline("mask-generation", model=self.model_name, device=-1)
        progress(0.25, "generating masks")
        parameters = self.pipeline_parameters(request.parameters)
        if self.tiled:
            result = self._generate_tiled(generator, request, parameters)
        else:
            result = self._to_adapter_masks(generator(request.image_path, **parameters))
        progress(0.9, "converting masks")
        progress(1.0, "done")
        return result

    def _generate_tiled(self, generator, request: GenerateRequest, parameters: dict[str, object]) -> list[AdapterMask]:
        collected: list[AdapterMask] = []
        with Image.open(request.image_path) as image, TemporaryDirectory() as directory:
            for index, (x1, y1, x2, y2) in enumerate(self.tile_boxes(request.width, request.height), start=1):
                tile_path = Path(directory) / f"tile-{index}.png"
                image.crop((x1, y1, x2, y2)).save(tile_path)
                for candidate in self._to_adapter_masks(generator(str(tile_path), **parameters)):
                    full = np.zeros((request.height, request.width), dtype=np.uint8)
                    full[y1:y2, x1:x2] = candidate.mask
                    collected.append(AdapterMask(mask=full, score=candidate.score, metadata={"model": self.model_name, "tile": index}))
        return self._deduplicate(collected)

    def _to_adapter_masks(self, output: dict[str, object]) -> list[AdapterMask]:
        masks = output["masks"]
        scores = output.get("scores", [None] * len(masks))
        return [AdapterMask(mask=np.asarray(mask, dtype=np.uint8), score=float(score) if score is not None else None, metadata={"model": self.model_name}) for mask, score in zip(masks, scores)]

    @staticmethod
    def _deduplicate(candidates: list[AdapterMask]) -> list[AdapterMask]:
        kept: list[AdapterMask] = []
        for candidate in sorted(candidates, key=lambda item: item.score or 0, reverse=True):
            if not any((np.logical_and(candidate.mask, other.mask).sum() / max(1, np.logical_or(candidate.mask, other.mask).sum())) > 0.85 for other in kept):
                kept.append(candidate)
        return kept

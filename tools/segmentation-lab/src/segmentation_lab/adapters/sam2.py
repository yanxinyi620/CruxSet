from importlib.util import find_spec
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

from .base import AdapterMask, GenerateRequest, ModelAvailability, ProgressCallback
from ..candidates import CompactCandidate, distinct_candidates


def configure_sam2_sampling(processor) -> None:
    """Place automatic prompts in SAM 2's square-resized image coordinates."""
    import torch

    original = processor.generate_crop_boxes

    def generate_crop_boxes(image, target_size, crop_n_layers=0, *args, **kwargs):
        if crop_n_layers != 0:
            raise ValueError("SAM 2 automatic crop layers must be zero; use external tiling")
        boxes, points, crops, labels = original(image, target_size, crop_n_layers, *args, **kwargs)
        # Rebuild the uniform grid rather than depending on upstream's SAM 1
        # longest-edge normalization, which misses the short axis of SAM 2 images.
        count = int(points.shape[1] ** 0.5)
        if count * count != points.shape[1]:
            raise ValueError("Expected a square automatic sampling grid")
        centers = (torch.arange(count, device=points.device, dtype=points.dtype) + 0.5) / count
        yy, xx = torch.meshgrid(centers, centers, indexing="ij")
        points = torch.stack((xx * processor.size["width"], yy * processor.size["height"]), dim=-1)
        points = points.reshape(1, count * count, 1, 2)
        return boxes, points, crops, labels

    processor.generate_crop_boxes = generate_crop_boxes


class Sam2Adapter:
    name = "sam2"

    def __init__(self, model_name: str = "facebook/sam2.1-hiera-large", tiled: bool = False, revision: str | None = None) -> None:
        self.model_name = model_name
        self.tiled = tiled
        self.revision = revision

    @staticmethod
    def pipeline_parameters(parameters: dict[str, object]) -> dict[str, object]:
        translated = dict(parameters)
        if "points_per_side" in translated:
            translated["points_per_crop"] = translated.pop("points_per_side")
        if "crop_n_layers" in translated:
            translated["crops_n_layers"] = translated.pop("crop_n_layers")
        return translated

    def parameters_for_request(self, parameters: dict[str, object]) -> dict[str, object]:
        translated = self.pipeline_parameters(parameters)
        if self.tiled:
            translated["crops_n_layers"] = 0
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

    def generate(self, request: GenerateRequest, progress: ProgressCallback) -> list[CompactCandidate]:
        availability = self.available()
        if not availability.available:
            raise RuntimeError(availability.reason)
        from transformers import pipeline

        progress(0.05, "loading SAM 2.1")
        options = {"revision": self.revision} if self.revision else {}
        generator = pipeline("mask-generation", model=self.model_name, device=-1, **options)
        configure_sam2_sampling(generator.image_processor)
        progress(0.25, "generating masks")
        parameters = self.parameters_for_request(request.parameters)
        if self.tiled:
            result = self._generate_tiled(generator, request, parameters, progress)
        else:
            result = self._to_adapter_masks(generator(request.image_path, **parameters))
        progress(0.9, "converting masks")
        progress(1.0, "done")
        return result

    def _generate_tiled(self, generator, request: GenerateRequest, parameters: dict[str, object], progress: ProgressCallback) -> list[CompactCandidate]:
        collected: list[CompactCandidate] = []
        with Image.open(request.image_path) as image, TemporaryDirectory() as directory:
            for index, (x1, y1, x2, y2) in enumerate(self.tile_boxes(request.width, request.height), start=1):
                progress(0.25 + index * 0.15, f"processing tile {index}/4")
                tile_path = Path(directory) / f"tile-{index}.png"
                image.crop((x1, y1, x2, y2)).save(tile_path)
                collected.extend(self._to_adapter_masks(generator(str(tile_path), **parameters), offset=(x1, y1), tile=index))
        return self._deduplicate(collected)

    def _to_adapter_masks(self, output: dict[str, object], offset: tuple[int, int] = (0, 0), tile: int | None = None) -> list[CompactCandidate]:
        masks = output.pop("masks")
        scores = output.get("scores", [None] * len(masks))
        metadata = {"model": self.model_name}
        if tile is not None:
            metadata["tile"] = tile
        result = []
        for index in range(len(masks)):
            mask = np.asarray(masks[index], dtype=np.uint8)
            candidate = CompactCandidate.from_mask(AdapterMask(mask, float(scores[index]) if scores[index] is not None else None, metadata), offset)
            if candidate is not None:
                result.append(candidate)
            del mask
            # Transformers returns a list; release its dense masks as they are converted.
            if isinstance(masks, list):
                masks[index] = None
        return result

    @staticmethod
    def _deduplicate(candidates: list[CompactCandidate]) -> list[CompactCandidate]:
        return distinct_candidates(candidates, 0.85, inclusive=False)

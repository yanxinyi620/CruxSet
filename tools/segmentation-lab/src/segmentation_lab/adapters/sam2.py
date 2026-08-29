from importlib.util import find_spec

import numpy as np

from .base import AdapterMask, GenerateRequest, ModelAvailability, ProgressCallback


class Sam2Adapter:
    name = "sam2"

    def __init__(self, model_name: str = "facebook/sam2.1-hiera-large") -> None:
        self.model_name = model_name

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
        output = generator(request.image_path, **request.parameters)
        masks = output["masks"]
        scores = output.get("scores", [None] * len(masks))
        progress(0.9, "converting masks")
        result = [AdapterMask(mask=np.asarray(mask, dtype=np.uint8), score=float(score) if score is not None else None, metadata={"model": self.model_name}) for mask, score in zip(masks, scores)]
        progress(1.0, "done")
        return result

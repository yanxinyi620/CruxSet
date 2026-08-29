from importlib.util import find_spec
from pathlib import Path

import numpy as np

from .base import AdapterMask, GenerateRequest, ModelAvailability, ProgressCallback


class Sam3Adapter:
    name = "sam3"

    def __init__(self, checkpoint_path: Path | None = None) -> None:
        self.checkpoint_path = checkpoint_path

    def available(self) -> ModelAvailability:
        if self.checkpoint_path is None or not self.checkpoint_path.is_file():
            return ModelAvailability(False, "checkpoint_not_found", "cpu")
        if find_spec("sam3") is None:
            return ModelAvailability(False, "sam3_not_installed", "cpu")
        return ModelAvailability(True, None, "cpu")

    def generate(self, request: GenerateRequest, progress: ProgressCallback) -> list[AdapterMask]:
        availability = self.available()
        if not availability.available:
            raise RuntimeError(availability.reason)
        from PIL import Image
        from sam3.model.sam3_image_processor import Sam3Processor
        from sam3.model_builder import build_sam3_image_model

        progress(0.05, "loading SAM 3")
        model = build_sam3_image_model(
            checkpoint_path=str(self.checkpoint_path),
            device="cpu",
            load_from_HF=False,
        )
        processor = Sam3Processor(model)
        progress(0.25, "encoding image")
        state = processor.set_image(Image.open(request.image_path).convert("RGB"))
        prompt = str(request.parameters.get("text_prompt", "climbing hold"))
        progress(0.5, "detecting matching holds")
        output = processor.set_text_prompt(prompt=prompt, state=state)
        masks = output["masks"]
        scores = output.get("scores", [None] * len(masks))
        result = [
            AdapterMask(
                mask=np.asarray(mask.detach().cpu(), dtype=np.uint8).squeeze(),
                score=float(score),
                metadata={"model": "sam3", "textPrompt": prompt},
            )
            for mask, score in zip(masks, scores)
        ]
        progress(1.0, "done")
        return result

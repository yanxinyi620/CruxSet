from pathlib import Path

import numpy as np

from segmentation_lab.adapters.base import AdapterMask, GenerateRequest, ModelAvailability
from segmentation_lab.experiments import ExperimentStore
from segmentation_lab.service import BenchmarkService


class FakeAdapter:
    def __init__(self, name: str, masks: list[AdapterMask] | None = None, error: Exception | None = None) -> None:
        self.name = name
        self.masks = masks or []
        self.error = error

    def available(self) -> ModelAvailability:
        return ModelAvailability(available=True, reason=None, device="cpu")

    def generate(self, request: GenerateRequest, progress):
        progress(1.0, "done")
        if self.error:
            raise self.error
        return self.masks


def test_one_model_failure_preserves_other_results(tmp_path):
    mask = np.zeros((20, 20), np.uint8)
    mask[4:16, 4:16] = 1
    good = FakeAdapter("sam2", [AdapterMask(mask=mask, score=.9, metadata={})])
    bad = FakeAdapter("sam3", error=MemoryError("allocation failed"))
    store = ExperimentStore(tmp_path)

    result = BenchmarkService(store, {"sam2": good, "sam3": bad}).run_benchmark(Path("wall.jpg"), "abc", 20, 20)

    assert result.runs["sam2"]["status"] == "succeeded"
    assert result.runs["sam3"]["status"] == "failed"
    assert result.runs["sam3"]["error"]["code"] == "model_out_of_memory"
    assert len(store.list_candidates(result.id, source="sam2")) == 1

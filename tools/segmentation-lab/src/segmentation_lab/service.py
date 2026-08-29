from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import cv2

from .adapters.base import GenerateRequest, SegmentationAdapter
from .experiments import ExperimentRecord, ExperimentStore
from .masks import bbox_from_mask, polygon_from_mask


@dataclass(frozen=True)
class BenchmarkResult:
    id: str
    runs: dict[str, dict[str, object]]


class BenchmarkService:
    def __init__(self, store: ExperimentStore, adapters: Mapping[str, SegmentationAdapter]) -> None:
        self.store = store
        self.adapters = adapters

    def run_benchmark(self, image_path: Path, image_sha256: str, width: int, height: int) -> BenchmarkResult:
        experiment = self.store.create(image_path.name, image_sha256, width, height)
        runs: dict[str, dict[str, object]] = {}
        for source, adapter in self.adapters.items():
            try:
                masks = adapter.generate(GenerateRequest(str(image_path), width, height, {}), lambda *_: None)
                for index, item in enumerate(masks, start=1):
                    binary = (item.mask > 0).astype("uint8")
                    bbox = bbox_from_mask(binary)
                    candidate_id = f"{source}-{index:04d}"
                    mask_path = self.store.root / experiment.id / "masks" / f"{candidate_id}.png"
                    mask_path.parent.mkdir(exist_ok=True)
                    cv2.imwrite(str(mask_path), binary * 255)
                    self.store.save_candidate(experiment.id, source, {
                        "id": candidate_id,
                        "maskPath": str(mask_path.relative_to(self.store.root / experiment.id)),
                        "bbox": bbox,
                        "area": int(binary.sum()),
                        "score": item.score,
                        "polygon": polygon_from_mask(binary, 1.0),
                        "metadata": item.metadata,
                    })
                runs[source] = {"status": "succeeded", "candidateCount": len(masks)}
                self.store.finish_run(experiment.id, source, "succeeded", len(masks))
            except MemoryError:
                error = {"code": "model_out_of_memory"}
                runs[source] = {"status": "failed", "error": error}
                self.store.finish_run(experiment.id, source, "failed", error=error)
        return BenchmarkResult(experiment.id, runs)

    def run_existing(self, experiment_id: str, image_path: Path, width: int, height: int, task_id: str, source: str, parameters: dict[str, object]) -> None:
        adapter = self.adapters[source]
        masks = adapter.generate(GenerateRequest(str(image_path), width, height, parameters), lambda *_: None)
        for index, item in enumerate(masks, 1):
            binary = (item.mask > 0).astype("uint8")
            candidate_id = f"{task_id}-{index:04d}"
            path = self.store.root / experiment_id / "masks" / f"{candidate_id}.png"
            path.parent.mkdir(exist_ok=True)
            cv2.imwrite(str(path), binary * 255)
            self.store.save_candidate(experiment_id, task_id, {"id": candidate_id, "maskPath": str(path.relative_to(self.store.root / experiment_id)), "bbox": bbox_from_mask(binary), "area": int(binary.sum()), "score": item.score, "polygon": polygon_from_mask(binary, 1.0), "metadata": item.metadata})
        self.store.finish_run(experiment_id, task_id, "succeeded", len(masks), parameters=parameters)

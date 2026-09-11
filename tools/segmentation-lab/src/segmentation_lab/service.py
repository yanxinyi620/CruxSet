from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import cv2

from .adapters.base import AdapterMask, GenerateRequest, SegmentationAdapter
from .experiments import ExperimentStore
from .candidates import CompactCandidate, distinct_candidates


@dataclass(frozen=True)
class BenchmarkResult:
    id: str
    runs: dict[str, dict[str, object]]


class BenchmarkService:
    def __init__(self, store: ExperimentStore, adapters: Mapping[str, SegmentationAdapter]) -> None:
        self.store = store
        self.adapters = adapters

    def _distinct_masks(self, masks: list[AdapterMask | CompactCandidate], width: int, height: int) -> list[CompactCandidate]:
        compact = []
        for item in masks:
            candidate = item if isinstance(item, CompactCandidate) else CompactCandidate.from_mask(item)
            if candidate is not None and candidate.area <= width * height * 0.5:
                compact.append(candidate)
        return distinct_candidates(compact, 0.9, inclusive=True)

    def _save_candidates(self, experiment_id: str, task_id: str, candidates: list[CompactCandidate], width: int, height: int) -> int:
        for index, item in enumerate(candidates, 1):
            candidate_id = f"{task_id}-{index:04d}"
            path = self.store.root / experiment_id / "masks" / f"{candidate_id}.png"
            path.parent.mkdir(exist_ok=True)
            binary = item.rasterize((height, width))
            binary *= 255
            if not cv2.imwrite(str(path), binary):
                raise OSError(f"Could not write candidate mask: {path}")
            del binary
            self.store.save_candidate(experiment_id, task_id, {
                "id": candidate_id, "maskPath": str(path.relative_to(self.store.root / experiment_id)),
                "bbox": item.bbox, "area": item.area, "score": item.score,
                "polygon": item.polygon, "metadata": item.metadata,
            })
        return len(candidates)

    def run_benchmark(self, image_path: Path, image_sha256: str, width: int, height: int) -> BenchmarkResult:
        experiment = self.store.create(image_path.name, image_sha256, width, height)
        runs: dict[str, dict[str, object]] = {}
        for source, adapter in self.adapters.items():
            try:
                masks = adapter.generate(GenerateRequest(str(image_path), width, height, {}), lambda *_: None)
                distinct_masks = self._distinct_masks(masks, width, height)
                del masks
                candidate_count = self._save_candidates(experiment.id, source, distinct_masks, width, height)
                runs[source] = {"status": "succeeded", "candidateCount": candidate_count}
                self.store.finish_run(experiment.id, source, "succeeded", candidate_count)
            except MemoryError:
                error = {"code": "model_out_of_memory"}
                runs[source] = {"status": "failed", "error": error}
                self.store.finish_run(experiment.id, source, "failed", error=error)
        return BenchmarkResult(experiment.id, runs)

    def run_existing(self, experiment_id: str, image_path: Path, width: int, height: int, task_id: str, source: str, parameters: dict[str, object]) -> None:
        adapter = self.adapters[source]
        try:
            masks = adapter.generate(GenerateRequest(str(image_path), width, height, parameters), lambda progress, message: self.store.update_run_progress(experiment_id, task_id, progress, message))
            distinct_masks = self._distinct_masks(masks, width, height)
            del masks
            candidate_count = self._save_candidates(experiment_id, task_id, distinct_masks, width, height)
        except Exception as error:
            self.store.finish_run(experiment_id, task_id, "failed", error={"code": "generation_failed", "message": str(error)}, parameters=parameters)
            return
        self.store.finish_run(experiment_id, task_id, "succeeded", candidate_count, parameters=parameters)

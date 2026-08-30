from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import cv2

from .adapters.base import AdapterMask, GenerateRequest, SegmentationAdapter
from .experiments import ExperimentRecord, ExperimentStore
from .masks import bbox_from_mask, is_oversized_mask, polygon_from_mask


@dataclass(frozen=True)
class BenchmarkResult:
    id: str
    runs: dict[str, dict[str, object]]


class BenchmarkService:
    def __init__(self, store: ExperimentStore, adapters: Mapping[str, SegmentationAdapter]) -> None:
        self.store = store
        self.adapters = adapters

    @staticmethod
    def _overlaps_at_least(left: tuple[AdapterMask, object, dict[str, int], int], right: tuple[AdapterMask, object, dict[str, int], int], threshold: float = 0.9) -> bool:
        _, left_mask, left_bbox, left_area = left
        _, right_mask, right_bbox, right_area = right
        if min(left_area, right_area) / max(left_area, right_area) < threshold:
            return False
        x1, y1 = max(left_bbox["x1"], right_bbox["x1"]), max(left_bbox["y1"], right_bbox["y1"])
        x2, y2 = min(left_bbox["x2"], right_bbox["x2"]), min(left_bbox["y2"], right_bbox["y2"])
        if x1 >= x2 or y1 >= y2:
            return False
        intersection = int((left_mask[y1:y2, x1:x2] & right_mask[y1:y2, x1:x2]).sum())
        return intersection / (left_area + right_area - intersection) >= threshold

    def _distinct_masks(self, masks: list[AdapterMask]) -> list[tuple[AdapterMask, object, dict[str, int], int]]:
        kept = []
        for item in sorted(masks, key=lambda mask: mask.score or 0, reverse=True):
            binary = (item.mask > 0).astype("uint8")
            if is_oversized_mask(binary):
                continue
            candidate = (item, binary, bbox_from_mask(binary), int(binary.sum()))
            if not any(self._overlaps_at_least(candidate, existing) for existing in kept):
                kept.append(candidate)
        return kept

    def run_benchmark(self, image_path: Path, image_sha256: str, width: int, height: int) -> BenchmarkResult:
        experiment = self.store.create(image_path.name, image_sha256, width, height)
        runs: dict[str, dict[str, object]] = {}
        for source, adapter in self.adapters.items():
            try:
                masks = adapter.generate(GenerateRequest(str(image_path), width, height, {}), lambda *_: None)
                distinct_masks = self._distinct_masks(masks)
                candidate_count = 0
                for index, (item, binary, bbox, area) in enumerate(distinct_masks, start=1):
                    candidate_id = f"{source}-{index:04d}"
                    mask_path = self.store.root / experiment.id / "masks" / f"{candidate_id}.png"
                    mask_path.parent.mkdir(exist_ok=True)
                    cv2.imwrite(str(mask_path), binary * 255)
                    self.store.save_candidate(experiment.id, source, {
                        "id": candidate_id,
                        "maskPath": str(mask_path.relative_to(self.store.root / experiment.id)),
                        "bbox": bbox,
                        "area": area,
                        "score": item.score,
                        "polygon": polygon_from_mask(binary, 1.0),
                        "metadata": item.metadata,
                    })
                    candidate_count += 1
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
        except Exception as error:
            self.store.finish_run(experiment_id, task_id, "failed", error={"code": "generation_failed", "message": str(error)}, parameters=parameters)
            return
        distinct_masks = self._distinct_masks(masks)
        candidate_count = 0
        for index, (item, binary, bbox, area) in enumerate(distinct_masks, 1):
            candidate_id = f"{task_id}-{index:04d}"
            path = self.store.root / experiment_id / "masks" / f"{candidate_id}.png"
            path.parent.mkdir(exist_ok=True)
            cv2.imwrite(str(path), binary * 255)
            self.store.save_candidate(experiment_id, task_id, {"id": candidate_id, "maskPath": str(path.relative_to(self.store.root / experiment_id)), "bbox": bbox, "area": area, "score": item.score, "polygon": polygon_from_mask(binary, 1.0), "metadata": item.metadata})
            candidate_count += 1
        self.store.finish_run(experiment_id, task_id, "succeeded", candidate_count, parameters=parameters)

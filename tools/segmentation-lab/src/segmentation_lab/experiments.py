import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4


@dataclass(frozen=True)
class ExperimentRecord:
    id: str
    image_sha256: str


class ExperimentStore:
    def __init__(self, data_dir: Path) -> None:
        self.root = data_dir / "experiments"
        self.root.mkdir(parents=True, exist_ok=True)

    def create(self, image_name: str, image_sha256: str, width: int, height: int) -> ExperimentRecord:
        experiment = ExperimentRecord(id=str(uuid4()), image_sha256=image_sha256)
        path = self.root / experiment.id
        path.mkdir()
        self._write_json(path / "experiment.json", {
            "id": experiment.id,
            "imageName": image_name,
            "imageSha256": image_sha256,
            "width": width,
            "height": height,
            "createdAt": time.time(),
            "runs": {},
        })
        return experiment

    def list_experiments(self) -> list[dict[str, object]]:
        items = []
        for path in self.root.glob("*/experiment.json"):
            item = json.loads(path.read_text())
            timestamp = path.stat().st_mtime
            item.setdefault("createdAt", timestamp)
            for run_id, run in item.get("runs", {}).items():
                run.setdefault("id", run_id)
                run.setdefault("model", run_id)
                run.setdefault("updatedAt", timestamp)
            items.append(item)
        return sorted(items, key=lambda item: item["id"], reverse=True)

    def start_run(self, experiment_id: str, model: str, parameters: dict[str, object]) -> str:
        task_id = str(uuid4())
        path = self.root / experiment_id / "experiment.json"
        payload = json.loads(path.read_text())
        payload["runs"][task_id] = {"id": task_id, "model": model, "status": "running", "candidateCount": 0, "error": None, "parameters": parameters, "updatedAt": time.time()}
        self._write_json(path, payload)
        return task_id

    def finish_run(self, experiment_id: str, task_id: str, status: str, candidate_count: int = 0, error: dict[str, str] | None = None, parameters: dict[str, object] | None = None) -> None:
        path = self.root / experiment_id / "experiment.json"
        payload = json.loads(path.read_text())
        existing = payload["runs"].get(task_id, {})
        payload["runs"][task_id] = {"id": task_id, "model": existing.get("model", task_id), "status": status, "candidateCount": candidate_count, "error": error, "parameters": parameters if parameters is not None else existing.get("parameters", {}), "updatedAt": time.time()}
        self._write_json(path, payload)

    def latest_success(self, image_sha256: str, source: str) -> ExperimentRecord:
        matches: list[ExperimentRecord] = []
        for path in self.root.glob("*/experiment.json"):
            payload = json.loads(path.read_text())
            if payload["imageSha256"] == image_sha256 and any(run.get("model", run_id) == source and run.get("status") == "succeeded" for run_id, run in payload["runs"].items()):
                matches.append(ExperimentRecord(id=payload["id"], image_sha256=image_sha256))
        if not matches:
            raise LookupError("no successful experiment")
        return max(matches, key=lambda item: (self.root / item.id / "experiment.json").stat().st_mtime_ns)

    def save_candidate(self, experiment_id: str, source: str, candidate: dict[str, object]) -> None:
        directory = self.root / experiment_id / "candidates"
        directory.mkdir(exist_ok=True)
        self._write_json(directory / f"{candidate['id']}.json", {"source": source, **candidate})

    def list_candidates(self, experiment_id: str, source: str | None = None) -> list[dict[str, object]]:
        directory = self.root / experiment_id / "candidates"
        if not directory.exists():
            return []
        candidates = [json.loads(path.read_text()) for path in directory.glob("*.json")]
        return [candidate for candidate in candidates if source is None or candidate["source"] == source]

    def create_calibration(self, experiment_id: str, source_task_id: str, candidates: list[dict[str, object]], changes: dict[str, int]) -> dict[str, object]:
        calibration_id = str(uuid4())
        record = {"id": calibration_id, "sourceTaskId": source_task_id, "createdAt": time.time(), "updatedAt": time.time(), "candidateCount": len(candidates), "changes": changes}
        directory = self.root / experiment_id / "calibrations" / calibration_id
        directory.mkdir(parents=True)
        self._write_json(directory / "calibration.json", record)
        self._write_json(directory / "candidates.json", {"items": candidates})
        return record

    def list_calibrations(self, experiment_id: str) -> list[dict[str, object]]:
        directory = self.root / experiment_id / "calibrations"
        if not directory.exists():
            return []
        return sorted((json.loads(path.read_text()) for path in directory.glob("*/calibration.json")), key=lambda item: item["updatedAt"], reverse=True)

    def read_calibration_candidates(self, experiment_id: str, calibration_id: str) -> list[dict[str, object]]:
        path = self.root / experiment_id / "calibrations" / calibration_id / "candidates.json"
        return json.loads(path.read_text())["items"]

    @staticmethod
    def _write_json(path: Path, payload: dict[str, object]) -> None:
        temporary = path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)

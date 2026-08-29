import json
import os
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
            "runs": {},
        })
        return experiment

    def finish_run(self, experiment_id: str, source: str, status: str, candidate_count: int = 0, error: dict[str, str] | None = None) -> None:
        path = self.root / experiment_id / "experiment.json"
        payload = json.loads(path.read_text())
        payload["runs"][source] = {"status": status, "candidateCount": candidate_count, "error": error}
        self._write_json(path, payload)

    def latest_success(self, image_sha256: str, source: str) -> ExperimentRecord:
        matches: list[ExperimentRecord] = []
        for path in self.root.glob("*/experiment.json"):
            payload = json.loads(path.read_text())
            if payload["imageSha256"] == image_sha256 and payload["runs"].get(source, {}).get("status") == "succeeded":
                matches.append(ExperimentRecord(id=payload["id"], image_sha256=image_sha256))
        if not matches:
            raise LookupError("no successful experiment")
        return max(matches, key=lambda item: (self.root / item.id / "experiment.json").stat().st_mtime_ns)

    @staticmethod
    def _write_json(path: Path, payload: dict[str, object]) -> None:
        temporary = path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)

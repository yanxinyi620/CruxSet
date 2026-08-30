import json
import os

from segmentation_lab.experiments import ExperimentStore


def test_failed_run_never_replaces_latest_success(tmp_path):
    store = ExperimentStore(tmp_path)
    first = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    store.finish_run(first.id, "sam2", status="succeeded", candidate_count=12)
    second = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    store.finish_run(second.id, "sam2", status="failed", error={"code": "model_out_of_memory"})

    assert store.latest_success("abc", "sam2").id == first.id


def test_each_started_run_has_a_distinct_id_and_preserves_prior_run(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", image_sha256="abc", width=100, height=80)

    first_task = store.start_run(experiment.id, "sam2", {"points_per_side": 48})
    second_task = store.start_run(experiment.id, "sam2", {"points_per_side": 64})

    runs = store.list_experiments()[0]["runs"]
    assert first_task != second_task
    assert set(runs) == {first_task, second_task}
    assert runs[first_task]["model"] == "sam2"
    assert runs[second_task]["parameters"] == {"points_per_side": 64}


def test_experiments_are_listed_newest_first(tmp_path, monkeypatch):
    timestamps = iter([100.0, 200.0])
    identifiers = iter(["z-first", "a-second"])
    monkeypatch.setattr("segmentation_lab.experiments.time.time", lambda: next(timestamps))
    monkeypatch.setattr("segmentation_lab.experiments.uuid4", lambda: next(identifiers))
    store = ExperimentStore(tmp_path)

    first = store.create("first.jpg", image_sha256="first", width=100, height=80)
    second = store.create("second.jpg", image_sha256="second", width=100, height=80)

    assert [item["id"] for item in store.list_experiments()] == [second.id, first.id]


def test_legacy_experiment_uses_original_file_time_as_upload_time(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    record_path = store.root / experiment.id / "experiment.json"
    record = json.loads(record_path.read_text())
    record.pop("createdAt")
    record_path.write_text(json.dumps(record))
    original = store.root / experiment.id / "input" / "original.jpg"
    original.parent.mkdir()
    original.write_bytes(b"image")
    os.utime(original, (123.0, 123.0))

    assert store.list_experiments()[0]["createdAt"] == 123.0


def test_deleting_run_removes_its_candidate_and_mask_files(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    task_id = store.start_run(experiment.id, "sam2", {})
    mask = store.root / experiment.id / "masks" / f"{task_id}-0001.png"
    mask.parent.mkdir()
    mask.write_bytes(b"mask")
    store.save_candidate(experiment.id, task_id, {"id": f"{task_id}-0001", "maskPath": str(mask.relative_to(store.root / experiment.id))})

    store.delete_run(experiment.id, task_id)

    assert not mask.exists()
    assert store.list_candidates(experiment.id, task_id) == []

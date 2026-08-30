from segmentation_lab.experiments import ExperimentStore
from fastapi.testclient import TestClient

from segmentation_lab.api import create_app
from segmentation_lab.config import Settings


def test_calibration_is_saved_separately_from_source_task(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", "abc", 100, 80)
    source_task = store.start_run(experiment.id, "sam2", {})
    store.finish_run(experiment.id, source_task, "succeeded", 1)

    calibration = store.create_calibration(experiment.id, source_task, [{"id": "h1", "polygon": [[1, 1], [2, 1], [1, 2]]}], {"deleted": 1})

    assert calibration["sourceTaskId"] == source_task
    assert store.list_experiments()[0]["runs"][source_task]["status"] == "succeeded"
    assert store.list_calibrations(experiment.id)[0]["id"] == calibration["id"]


def test_calibration_api_saves_and_exports_svg(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", "abc", 100, 80)
    task_id = store.start_run(experiment.id, "sam2", {})
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    payload = {"sourceTaskId": task_id, "candidates": [{"id": "manual-1", "polygon": [[1, 1], [9, 1], [1, 9]]}], "changes": {"added": 1}}

    created = client.post(f"/api/experiments/{experiment.id}/calibrations", json=payload)
    calibration_id = created.json()["id"]

    assert created.status_code == 201
    assert client.get(f"/api/experiments/{experiment.id}/calibrations/{calibration_id}").json()["items"] == payload["candidates"]
    exported = client.get(f"/api/experiments/{experiment.id}/calibrations/{calibration_id}/export.svg").text
    assert "manual-1" in exported
    assert 'viewBox="0 0 100 80"' in exported
    assert 'width="100"' in exported
    assert 'height="80"' in exported
    assert store.list_experiments()[0]["runs"][task_id]["status"] == "running"


def test_all_calibrations_are_listed_newest_first(tmp_path, monkeypatch):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", "abc", 100, 80)
    timestamps = iter([100.0, 100.0, 200.0, 200.0])
    monkeypatch.setattr("segmentation_lab.experiments.time.time", lambda: next(timestamps))

    first = store.create_calibration(experiment.id, "task", [], {})
    second = store.create_calibration(experiment.id, "task", [], {})

    assert [item["id"] for item in store.all_calibrations()] == [second["id"], first["id"]]

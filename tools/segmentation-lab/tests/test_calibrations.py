from segmentation_lab.experiments import ExperimentStore


def test_calibration_is_saved_separately_from_source_task(tmp_path):
    store = ExperimentStore(tmp_path)
    experiment = store.create("wall.jpg", "abc", 100, 80)
    source_task = store.start_run(experiment.id, "sam2", {})
    store.finish_run(experiment.id, source_task, "succeeded", 1)

    calibration = store.create_calibration(experiment.id, source_task, [{"id": "h1", "polygon": [[1, 1], [2, 1], [1, 2]]}], {"deleted": 1})

    assert calibration["sourceTaskId"] == source_task
    assert store.list_experiments()[0]["runs"][source_task]["status"] == "succeeded"
    assert store.list_calibrations(experiment.id)[0]["id"] == calibration["id"]

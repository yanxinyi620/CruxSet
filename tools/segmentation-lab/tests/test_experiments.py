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

from segmentation_lab.experiments import ExperimentStore


def test_failed_run_never_replaces_latest_success(tmp_path):
    store = ExperimentStore(tmp_path)
    first = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    store.finish_run(first.id, "sam2", status="succeeded", candidate_count=12)
    second = store.create("wall.jpg", image_sha256="abc", width=100, height=80)
    store.finish_run(second.id, "sam2", status="failed", error={"code": "model_out_of_memory"})

    assert store.latest_success("abc", "sam2").id == first.id

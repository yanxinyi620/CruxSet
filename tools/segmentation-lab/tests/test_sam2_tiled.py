from segmentation_lab.adapters.sam2 import Sam2Adapter


def test_sam2_translates_workbench_parameter_names_to_transformers_names():
    parameters = Sam2Adapter.pipeline_parameters({"points_per_side": 64, "crop_n_layers": 2})

    assert parameters["points_per_crop"] == 64
    assert parameters["crops_n_layers"] == 2
    assert "points_per_side" not in parameters
    assert "crop_n_layers" not in parameters


def test_two_by_two_tiles_overlap_and_cover_the_full_image():
    boxes = Sam2Adapter.tile_boxes(width=100, height=80, overlap=0.2)

    assert len(boxes) == 4
    assert boxes[0] == (0, 0, 60, 48)
    assert boxes[-1] == (40, 32, 100, 80)

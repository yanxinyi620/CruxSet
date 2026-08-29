import numpy as np

from segmentation_lab.masks import clean_mask, mask_iou, polygon_from_mask, rasterize_polygon


def test_clean_mask_removes_island_and_fills_hole():
    mask = np.zeros((20, 20), np.uint8)
    mask[4:16, 4:16] = 1
    mask[9, 9] = 0
    mask[1, 1] = 1

    cleaned = clean_mask(mask, min_region_area=4, max_hole_area=4)

    assert cleaned[9, 9] == 1
    assert cleaned[1, 1] == 0


def test_polygon_round_trips_rectangle_with_high_iou():
    mask = np.zeros((30, 30), np.uint8)
    mask[5:25, 7:23] = 1

    polygon = polygon_from_mask(mask, epsilon_pixels=1.0)

    assert len(polygon) == 4
    assert mask_iou(mask, rasterize_polygon(polygon, mask.shape)) >= 0.95

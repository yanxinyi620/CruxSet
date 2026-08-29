import cv2
import numpy as np

from .domain import Point


def clean_mask(mask: np.ndarray, min_region_area: int, max_hole_area: int) -> np.ndarray:
    cleaned = (mask > 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] < min_region_area:
            cleaned[labels == label] = 0

    inverse = (1 - cleaned).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(inverse, connectivity=8)
    height, width = cleaned.shape
    for label in range(1, count):
        touches_edge = (
            stats[label, cv2.CC_STAT_LEFT] == 0
            or stats[label, cv2.CC_STAT_TOP] == 0
            or stats[label, cv2.CC_STAT_LEFT] + stats[label, cv2.CC_STAT_WIDTH] == width
            or stats[label, cv2.CC_STAT_TOP] + stats[label, cv2.CC_STAT_HEIGHT] == height
        )
        if not touches_edge and stats[label, cv2.CC_STAT_AREA] <= max_hole_area:
            cleaned[labels == label] = 1
    return cleaned


def mask_iou(left: np.ndarray, right: np.ndarray) -> float:
    left_bool = left.astype(bool)
    right_bool = right.astype(bool)
    union = np.logical_or(left_bool, right_bool).sum()
    if union == 0:
        return 0.0
    return float(np.logical_and(left_bool, right_bool).sum() / union)


def polygon_from_mask(mask: np.ndarray, epsilon_pixels: float) -> tuple[Point, ...]:
    contours, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return ()
    contour = max(contours, key=cv2.contourArea)
    simplified = cv2.approxPolyDP(contour, epsilon_pixels, closed=True)
    return tuple((float(point[0][0]), float(point[0][1])) for point in simplified)


def rasterize_polygon(polygon: tuple[Point, ...], shape: tuple[int, int]) -> np.ndarray:
    raster = np.zeros(shape, dtype=np.uint8)
    if len(polygon) >= 3:
        points = np.array(polygon, dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(raster, [points], 1)
    return raster

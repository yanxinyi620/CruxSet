import json
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

from segmentation_lab.adapters.base import AdapterMask, GenerateRequest
from segmentation_lab.adapters.sam2 import Sam2Adapter
from segmentation_lab.candidates import CompactCandidate, candidate_iou
from segmentation_lab.masks import polygon_from_mask
from segmentation_lab.experiments import ExperimentStore
from segmentation_lab.service import BenchmarkService


def test_compact_candidate_preserves_pixels_holes_components_and_global_geometry():
    mask = np.zeros((40, 50), np.uint8)
    mask[5:20, 8:30] = 1
    mask[8:12, 12:16] = 0
    mask[25:28, 35:38] = 1
    candidate = CompactCandidate.from_mask(AdapterMask(mask, .9, {'tile': 2}), offset=(100, 80))
    expected = np.zeros((140, 180), np.uint8)
    expected[80:120, 100:150] = mask
    assert candidate.bbox == {'x1': 108, 'y1': 85, 'x2': 138, 'y2': 108}
    assert candidate.area == int(mask.sum())
    assert candidate.polygon == polygon_from_mask(expected, 1.0)
    np.testing.assert_array_equal(candidate.rasterize((140, 180)), expected)
    assert len(candidate.packed_mask) <= 23 * 4
    assert not any(isinstance(value, np.ndarray) for value in vars(candidate).values())


def test_empty_masks_are_ignored():
    assert CompactCandidate.from_mask(AdapterMask(np.zeros((5, 7), np.uint8), None, {})) is None


@pytest.mark.parametrize('offset', [(0, 0), (7, 4), (35, 2)])
def test_local_intersection_matches_full_image_pixel_iou(offset):
    rng = np.random.default_rng(50)
    a = (rng.random((20, 30)) > .4).astype(np.uint8)
    b = (rng.random((15, 25)) > .4).astype(np.uint8)
    left = CompactCandidate.from_mask(AdapterMask(a, .9, {}), (3, 2))
    right = CompactCandidate.from_mask(AdapterMask(b, .8, {}), offset)
    full_a, full_b = left.rasterize((50, 70)), right.rasterize((50, 70))
    expected = np.logical_and(full_a, full_b).sum() / np.logical_or(full_a, full_b).sum()
    assert candidate_iou(left, right) == pytest.approx(expected)


def test_tiled_candidates_never_retain_full_image_masks_and_keep_best_duplicate(tmp_path):
    path = tmp_path / 'wall.png'
    Image.new('RGB', (100, 80)).save(path)
    boxes = Sam2Adapter.tile_boxes(100, 80)
    calls = []
    def generator(image_path, **parameters):
        x1, y1, x2, y2 = boxes[len(calls)]
        calls.append(image_path)
        mask = np.zeros((y2-y1, x2-x1), np.uint8)
        mask[35-y1:43-y1, 45-x1:53-x1] = 1
        return {'masks': [mask], 'scores': [.7 + .05 * len(calls)]}
    candidates = Sam2Adapter(tiled=True)._generate_tiled(generator, GenerateRequest(str(path), 100, 80, {}), {}, lambda *_: None)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert isinstance(candidate, CompactCandidate)
    assert candidate.metadata['tile'] == 4
    assert candidate.bbox == {'x1': 45, 'y1': 35, 'x2': 53, 'y2': 43}
    assert len(candidate.packed_mask) == 8


def test_service_compact_and_legacy_candidates_have_identical_outputs(tmp_path):
    mask = np.zeros((60, 80), np.uint8)
    mask[10:30, 20:40] = 1
    mask[13:17, 23:27] = 0
    mask[40:44, 50:54] = 1
    old = [AdapterMask(mask, .9, {}), AdapterMask(mask.copy(), .8, {})]
    compact = [CompactCandidate.from_mask(item) for item in old]
    class Adapter:
        def __init__(self, result): self.result = result
        def generate(self, *args): return self.result
    outputs = []
    for index, items in enumerate((old, compact)):
        store = ExperimentStore(tmp_path / str(index))
        result = BenchmarkService(store, {'sam2': Adapter(items)}).run_benchmark(tmp_path / 'wall.png', 'sha', 80, 60)
        candidates = store.list_candidates(result.id)
        assert len(candidates) == 1
        saved = cv2.imread(str(store.root / result.id / candidates[0]['maskPath']), cv2.IMREAD_GRAYSCALE)
        np.testing.assert_array_equal(saved, mask * 255)
        outputs.append(candidates)
    frozen = json.loads((Path(__file__).parent / 'fixtures' / 'compact-candidates-baseline.json').read_text())
    assert outputs[0] == outputs[1] == frozen


def test_packed_storage_does_not_grow_with_canvas_area():
    sizes = []
    for height, width in [(100, 120), (1600, 2000)]:
        mask = np.zeros((height, width), np.uint8)
        mask[20:36, 40:57] = 1
        candidate = CompactCandidate.from_mask(AdapterMask(mask, 1, {}))
        sizes.append(len(candidate.packed_mask))
    assert sizes == [48, 48]


def test_dedup_thresholds_remain_strict_for_tiles_inclusive_for_service():
    from segmentation_lab.candidates import distinct_candidates
    masks = []
    for count in (20, 17, 18):
        mask = np.zeros((4, 25), np.uint8)
        mask[1, 1:count+1] = 1
        masks.append(CompactCandidate.from_mask(AdapterMask(mask, 1, {})))
    assert len(distinct_candidates(masks[:2], .85, inclusive=False)) == 2
    assert len(distinct_candidates([masks[0], masks[2]], .9, inclusive=True)) == 1
    # Stable sorting keeps the first candidate when scores tie.
    from dataclasses import replace
    tied = replace(masks[0], metadata={'tie': 'second'})
    assert distinct_candidates([masks[0], tied], .9, inclusive=True) == [masks[0]]
    assert distinct_candidates([tied, masks[0]], .9, inclusive=True) == [tied]


def test_wall_filter_uses_full_image_area_for_local_candidates(tmp_path):
    local = CompactCandidate.from_mask(AdapterMask(np.ones((20, 20), np.uint8), .9, {}), (20, 10))
    service = BenchmarkService(ExperimentStore(tmp_path), {})
    assert service._distinct_masks([local], 100, 80) == [local]
    assert service._distinct_masks([local], 20, 30) == []


def test_tile_arrays_are_released_before_the_next_generator_call(tmp_path):
    import weakref
    path = tmp_path / 'wall.png'
    Image.new('RGB', (100, 80)).save(path)
    references = []
    def generator(image_path, **parameters):
        assert all(ref() is None for ref in references)
        mask = np.zeros((48, 60), np.uint8)
        mask[5:15, 5:15] = 1
        references.append(weakref.ref(mask))
        return {'masks': [mask], 'scores': [.9]}
    Sam2Adapter(tiled=True)._generate_tiled(generator, GenerateRequest(str(path), 100, 80, {}), {}, lambda *_: None)
    assert all(ref() is None for ref in references)


def test_randomized_compact_dedup_matches_original_full_mask_algorithm():
    from segmentation_lab.candidates import distinct_candidates
    rng = np.random.default_rng(928)
    raw = []
    for index in range(30):
        mask = np.zeros((70, 90), np.uint8)
        x, y = rng.integers(0, 40, size=2)
        mask[y:y+20, x:x+20] = rng.random((20, 20)) > .15
        raw.extend([AdapterMask(mask, float(index % 3), {'index': index}), AdapterMask(mask.copy(), float(index % 3), {'index': index})])
    expected = []
    for candidate in sorted(raw, key=lambda item: item.score or 0, reverse=True):
        if not any(np.logical_and(candidate.mask, other.mask).sum() / max(1, np.logical_or(candidate.mask, other.mask).sum()) > .85 for other in expected):
            expected.append(candidate)
    actual = distinct_candidates([CompactCandidate.from_mask(item) for item in raw], .85, inclusive=False)
    assert [item.metadata for item in actual] == [item.metadata for item in expected]
    for compact, dense in zip(actual, expected):
        assert compact.polygon == polygon_from_mask(dense.mask, 1.0)
        np.testing.assert_array_equal(compact.rasterize((70, 90)), dense.mask)


def test_service_dedup_matches_original_with_near_duplicates_and_wall_filter(tmp_path):
    rng = np.random.default_rng(616)
    raw = []
    for index in range(20):
        mask = np.zeros((70, 90), np.uint8)
        x, y = rng.integers(0, 40, size=2)
        mask[y:y+20, x:x+20] = 1
        near = mask.copy()
        near[y:y+2, x:x+20] = 0
        raw.extend([AdapterMask(mask, .8, {'index': index}), AdapterMask(near, .9, {'index': index})])
    raw.append(AdapterMask(np.ones((70, 90), np.uint8), 1, {'wall': True}))
    expected = []
    for candidate in sorted(raw, key=lambda item: item.score or 0, reverse=True):
        if candidate.mask.sum() > candidate.mask.size * .5:
            continue
        if not any(np.logical_and(candidate.mask, other.mask).sum() / np.logical_or(candidate.mask, other.mask).sum() >= .9 for other in expected):
            expected.append(candidate)
    actual = BenchmarkService(ExperimentStore(tmp_path), {})._distinct_masks([CompactCandidate.from_mask(item) for item in raw], 90, 70)
    assert [(item.metadata, item.score, item.area) for item in actual] == [(item.metadata, item.score, int(item.mask.sum())) for item in expected]


def test_non_tiled_generate_returns_compact_global_candidates(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace
    from segmentation_lab.adapters.base import ModelAvailability
    mask = np.zeros((80, 100), np.uint8)
    mask[20:30, 40:60] = 1
    def pipeline(task, model, device):
        assert task == 'mask-generation'
        assert device == -1
        generator = lambda *args, **kwargs: {'masks': [mask], 'scores': [.75]}
        generator.image_processor = SimpleNamespace(generate_crop_boxes=lambda *a, **k: None)
        return generator
    monkeypatch.setitem(sys.modules, 'transformers', SimpleNamespace(pipeline=pipeline))
    adapter = Sam2Adapter()
    monkeypatch.setattr(adapter, 'available', lambda: ModelAvailability(True, None, 'cpu'))
    result = adapter.generate(GenerateRequest(str(tmp_path / 'wall.png'), 100, 80, {}), lambda *_: None)
    assert len(result) == 1
    assert isinstance(result[0], CompactCandidate)
    assert result[0].bbox == {'x1': 40, 'y1': 20, 'x2': 60, 'y2': 30}
    assert result[0].metadata == {'model': 'facebook/sam2.1-hiera-large'}
    np.testing.assert_array_equal(result[0].rasterize((80, 100)), mask)


def test_existing_run_marks_postprocessing_failure_as_failed(tmp_path, monkeypatch):
    mask = np.zeros((20, 20), np.uint8)
    mask[4:12, 4:12] = 1
    class Adapter:
        def generate(self, *args):
            return [CompactCandidate.from_mask(AdapterMask(mask, .9, {}))]
    store = ExperimentStore(tmp_path)
    experiment = store.create('wall.png', 'sha', 20, 20)
    task_id = store.start_run(experiment.id, 'sam2', {})
    monkeypatch.setattr(cv2, 'imwrite', lambda *args: False)
    BenchmarkService(store, {'sam2': Adapter()}).run_existing(experiment.id, tmp_path / 'wall.png', 20, 20, task_id, 'sam2', {})
    run = store.list_experiments()[0]['runs'][task_id]
    assert run['status'] == 'failed'
    assert 'Could not write candidate mask' in run['error']['message']

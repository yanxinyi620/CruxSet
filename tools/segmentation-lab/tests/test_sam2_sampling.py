import pytest
from PIL import Image

from segmentation_lab.adapters.sam2 import configure_sam2_sampling


@pytest.mark.parametrize('size', [(1670, 452), (452, 1670), (1024, 1024), (1002, 271)])
def test_sampling_covers_actual_resized_image(size):
    transformers = pytest.importorskip('transformers')
    processor = transformers.Sam2ImageProcessor()
    configure_sam2_sampling(processor)
    _, points, crops, labels = processor.generate_crop_boxes(
        Image.new('RGB', size), 1024, 0, points_per_crop=48,
    )
    pixels = processor(images=crops, return_tensors='pt')['pixel_values']
    height, width = pixels.shape[-2:]
    assert points.shape == (1, 2304, 1, 2)
    assert labels.shape == (1, 2304, 1)
    for axis, extent in enumerate((width, height)):
        assert float(points[..., axis].min()) == pytest.approx(extent / 96)
        assert float(points[..., axis].max()) == pytest.approx(extent * 95 / 96)


def test_internal_crop_layers_rejected():
    transformers = pytest.importorskip('transformers')
    processor = transformers.Sam2ImageProcessor()
    configure_sam2_sampling(processor)
    with pytest.raises(ValueError, match='external tiling'):
        processor.generate_crop_boxes(Image.new('RGB', (1670, 452)), 1024, 1)

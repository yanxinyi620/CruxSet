from segmentation_lab.adapters.sam2 import Sam2Adapter
from segmentation_lab.adapters.sam3 import Sam3Adapter


def test_sam2_reports_missing_runtime_without_downloading(monkeypatch):
    monkeypatch.setattr("segmentation_lab.adapters.sam2.find_spec", lambda _: None)

    availability = Sam2Adapter().available()

    assert availability.available is False
    assert availability.reason == "transformers_not_installed"
    assert availability.device == "cpu"


def test_sam3_requires_explicit_local_checkpoint(tmp_path):
    availability = Sam3Adapter(checkpoint_path=tmp_path / "missing.pt").available()

    assert availability.available is False
    assert availability.reason == "checkpoint_not_found"
    assert availability.device == "cpu"

import json
from pathlib import Path
import subprocess
import sys


def test_comparison_checks_inputs_geometry_and_pngs(tmp_path):
    script = Path(__file__).parents[1] / 'scripts' / 'compare_memory.py'
    payload = dict(image_sha256='source', input_sha256='input', size=[100, 80], parameters={},
                   model='sam2_tiled', threads=4, versions={}, synthetic=True,
                   elapsed_seconds=2, peak_rss_mib=100, adapter_candidates=1,
                   retained_mask_bytes=1000, polygon_count=1,
                   candidates=[{'polygon': [[1, 2], [3, 4], [5, 6]]}], mask_sha256={'one': 'pixels'})
    before, after = tmp_path / 'before.json', tmp_path / 'after.json'
    before.write_text(json.dumps(payload))
    after.write_text(json.dumps({**payload, 'peak_rss_mib': 20, 'retained_mask_bytes': 10}))
    result = subprocess.run([sys.executable, str(script), str(before), str(after)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['exact_geometry'] is True
    for key, value in [('input_sha256', 'different'), ('mask_sha256', {'one': 'different'}), ('candidates', [])]:
        after.write_text(json.dumps({**payload, key: value}))
        result = subprocess.run([sys.executable, str(script), str(before), str(after)], capture_output=True, text=True)
        assert result.returncode == 1


def test_benchmark_synthetic_mode_records_successful_run(tmp_path):
    from PIL import Image
    import os
    root = Path(__file__).parents[1]
    image = tmp_path / 'wall.png'
    Image.new('RGB', (80, 60)).save(image)
    output = tmp_path / 'report.json'
    result = subprocess.run(
        [sys.executable, str(root / 'scripts' / 'benchmark_memory.py'), str(image), '--synthetic', '--output', str(output)],
        env={**os.environ, 'PYTHONPATH': str(root / 'src')}, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert report['synthetic'] is True
    assert report['size'] == [80, 60]
    assert report['polygon_count'] == len(report['candidates']) > 0
    assert len(report['mask_sha256']) == report['polygon_count']
    assert report['peak_rss_mib'] > 0
    assert report['retained_mask_bytes'] < report['adapter_candidates'] * 80 * 60

"""Compare isolated benchmark reports; fail on mismatched inputs or outputs."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
args = parser.parse_args()
before, after = (json.loads(path.read_text()) for path in (args.before, args.after))
fields = ('image_sha256', 'input_sha256', 'size', 'parameters', 'model', 'threads', 'versions')
mismatched_inputs = [key for key in fields if before[key] != after[key]]
if before.get('synthetic', False) != after.get('synthetic', False):
    mismatched_inputs.append('synthetic')
summary = dict(
    mismatched_inputs=mismatched_inputs,
    exact_geometry=before['candidates'] == after['candidates'],
    exact_png_files=before['mask_sha256'] == after['mask_sha256'],
    metrics={key: {'before': before[key], 'after': after[key]} for key in (
        'elapsed_seconds', 'peak_rss_mib', 'adapter_candidates', 'retained_mask_bytes', 'polygon_count')},
)
print(json.dumps(summary, indent=2))
raise SystemExit(0 if not mismatched_inputs and summary['exact_geometry'] and summary['exact_png_files'] else 1)

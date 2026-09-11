"""Run each invocation in a fresh process; select old/new sources via PYTHONPATH."""
import argparse
import hashlib
import json
import resource
import time
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from segmentation_lab.adapters.sam2 import Sam2Adapter
from segmentation_lab.experiments import ExperimentStore
from segmentation_lab.service import BenchmarkService

parser = argparse.ArgumentParser()
parser.add_argument('image', type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--max-side', type=int, default=0)
parser.add_argument('--points', type=int, default=48)
parser.add_argument('--threads', type=int, default=4)
parser.add_argument('--synthetic', action='store_true', help='Measure postprocessing with deterministic tile masks, without model inference')
parser.add_argument('--model', choices=['sam2', 'sam2_tiled'], default='sam2_tiled')
args = parser.parse_args()
if not args.synthetic:
    import torch
    torch.set_num_threads(args.threads)
parameters = dict(points_per_side=args.points, points_per_batch=8, pred_iou_thresh=.85,
                  stability_score_thresh=.9, crop_n_layers=0)

class MeasuredAdapter(Sam2Adapter):
    def generate(self, request, progress):
        if args.synthetic:
            import numpy as np
            calls = 0
            boxes = self.tile_boxes(request.width, request.height) if self.tiled else [(0, 0, request.width, request.height)]
            def generator(image_path, **parameters):
                nonlocal calls
                x1, y1, x2, y2 = boxes[calls]
                calls += 1
                masks = []
                # Fixed global hold grid: overlaps between tiles are intentional.
                step_x, step_y = max(4, request.width // 20), max(4, request.height // 20)
                for y in range(step_y, request.height-step_y, step_y):
                    for x in range(step_x, request.width-step_x, step_x):
                        if x1 <= x and y1 <= y and x+step_x//3 <= x2 and y+step_y//3 <= y2:
                            mask = np.zeros((y2-y1, x2-x1), np.uint8)
                            mask[y-y1:y-y1+step_y//3, x-x1:x-x1+step_x//3] = 1
                            masks.append(mask)
                return {'masks': masks, 'scores': [.9] * len(masks)}
            result = self._generate_tiled(generator, request, {}, progress) if self.tiled else self._to_adapter_masks(generator(request.image_path))
        else:
            result = super().generate(request, progress)
        self.count = len(result)
        self.retained_bytes = sum(item.mask.nbytes if hasattr(item, 'mask') else len(item.packed_mask) for item in result)
        return result

with TemporaryDirectory(prefix='seg-memory-') as directory:
    root = Path(directory)
    with Image.open(args.image) as image:
        image = image.convert('RGB')
        if args.max_side:
            image.thumbnail((args.max_side, args.max_side))
        width, height = image.size
        input_path = root / 'input.png'
        image.save(input_path)
    adapter = MeasuredAdapter(tiled=args.model == 'sam2_tiled')
    store = ExperimentStore(root / 'data')
    experiment = store.create(input_path.name, 'benchmark', width, height)
    task_id = store.start_run(experiment.id, args.model, parameters)
    start = time.perf_counter()
    BenchmarkService(store, {args.model: adapter}).run_existing(experiment.id, input_path, width, height, task_id, args.model, parameters)
    elapsed = time.perf_counter() - start
    run = store.list_experiments()[0]['runs'][task_id]
    if run['status'] != 'succeeded':
        raise RuntimeError(run['error'])
    candidates = store.list_candidates(experiment.id, task_id)
    candidates.sort(key=lambda item: item['id'])
    for item in candidates:
        item['id'] = item['id'].replace(task_id, args.model)
        item['source'] = args.model
    masks = {item['id']: hashlib.sha256((store.root / experiment.id / item['maskPath']).read_bytes()).hexdigest() for item in candidates}
    for item in candidates:
        item['maskPath'] = item['maskPath'].replace(task_id, args.model)
    output = dict(image_sha256=hashlib.sha256(args.image.read_bytes()).hexdigest(),
                  input_sha256=hashlib.sha256(input_path.read_bytes()).hexdigest(), size=[width, height],
                  parameters=parameters, model=args.model, threads=args.threads, synthetic=args.synthetic,
                  versions={name: version(name) for name in ['torch', 'transformers', 'numpy', 'opencv-python-headless']},
                  elapsed_seconds=elapsed, peak_rss_mib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
                  adapter_candidates=adapter.count, retained_mask_bytes=adapter.retained_bytes,
                  polygon_count=len(candidates), candidates=candidates, mask_sha256=masks)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2))
    print(json.dumps({key: value for key, value in output.items() if key not in ('candidates', 'mask_sha256')}, indent=2))

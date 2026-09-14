"""Persistent approval snapshots, independent of the editable experiment tree."""
from contextlib import contextmanager
from html import escape
import fcntl
import json
import os
from pathlib import Path
import time
from uuid import uuid4

from fastapi import Body, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

from .cloudbase_sync import build_normalized_holds
from .ownership import IDENTIFIER


def bounded_text(value, limit, field):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit or any(ord(c) < 32 for c in value):
        raise HTTPException(422, f'{field} must contain 1–{limit} characters without control characters.')
    return value.strip()


class PublishRequests:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def lock(self, name):
        # Kernel locks survive concurrent workers and are released after a crash.
        with (self.root / (name + '.lock')).open('a') as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise HTTPException(409, 'This request is already being processed.')
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def read(self, request_id):
        if not IDENTIFIER.fullmatch(request_id) or (self.root / request_id).is_symlink():
            raise HTTPException(404, 'Publish request not found.')
        try:
            return json.loads((self.root / request_id / 'request.json').read_text())
        except FileNotFoundError:
            raise HTTPException(404, 'Publish request not found.')

    def write(self, item):
        directory = self.root / item['id']
        temporary = directory / ('request-' + str(uuid4()) + '.tmp')
        with temporary.open('w') as handle:
            json.dump(item, handle, ensure_ascii=False, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(directory / 'request.json')

    def items(self):
        return sorted([json.loads(path.read_text()) for path in self.root.glob('*/request.json')], key=lambda item: item['createdAt'], reverse=True)


def install_publish_requests(app, store, settings, publish):
    requests = PublishRequests(settings.data_dir / 'publish-requests')

    def public(item):
        result = {key: value for key, value in item.items() if key not in {'metadata', 'imageName'}}
        result['retryable'] = item['status'] == 'failed'
        if item['status'] == 'publishing':
            try:
                with requests.lock(item['id']):
                    result['retryable'] = True
            except HTTPException as error:
                if error.status_code != 409:
                    raise
                result['retryable'] = False
        return result

    def accessible(request, request_id):
        item = requests.read(request_id)
        actor = request.state.actor
        if item.get('deletedAt') is not None or (not actor['isAdmin'] and item['applicantId'] != actor['userId']):
            raise HTTPException(404, 'Publish request not found.')
        return item

    def admin_only(request):
        if not request.state.actor['isAdmin']:
            raise HTTPException(403, 'Administrator access required.')

    @app.get('/api/publish-requests')
    def list_requests(request: Request):
        actor = request.state.actor
        return {'items': [public(item) for item in requests.items() if item.get('deletedAt') is None and (actor['isAdmin'] or item['applicantId'] == actor['userId'])], 'isAdmin': actor['isAdmin']}

    @app.post('/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish-requests', status_code=201)
    def create_request(experiment_id: str, calibration_id: str, request: Request, payload: dict = Body(...)):
        target = payload.get('target')
        if not isinstance(target, str) or target not in {'cloudbase', 'cloudflare'}:
            raise HTTPException(422, 'Requests support cloudbase and cloudflare targets only.')
        name = bounded_text(payload.get('wallName'), 120, 'Wall name')
        with requests.lock('create'):
            for item in requests.items():
                if (item['applicantId'], item['sourceExperimentId'], item['sourceCalibrationId'], item['target']) == (request.state.actor['userId'], experiment_id, calibration_id, target) and item['status'] != 'rejected':
                    return public(item)
            experiment = next((item for item in store.list_experiments() if item['id'] == experiment_id), None)
            if experiment is None or not any(item['id'] == calibration_id for item in store.list_calibrations(experiment_id)):
                raise HTTPException(404, 'Calibration not found.')
            image_path = next((store.root / experiment_id / 'input').glob('original.*'), None)
            if image_path is None:
                raise HTTPException(404, 'Image not found.')
            holds = [{'sourceId': str(item['id']), 'kind': item.get('kind', 'hold'), 'polygon': item['polygon']} for item in store.read_calibration_candidates(experiment_id, calibration_id)]
            build_normalized_holds(holds, experiment['width'], experiment['height'])
            request_id = str(uuid4())
            metadata = {'publishRequestId': request_id, 'sourceExperimentId': experiment_id, 'sourceCalibrationId': calibration_id, 'wallName': name, 'imageWidth': experiment['width'], 'imageHeight': experiment['height'], 'holds': holds}
            item = {'id': request_id, 'applicantId': request.state.actor['userId'], 'sourceExperimentId': experiment_id, 'sourceCalibrationId': calibration_id, 'wallName': name, 'target': target, 'status': 'pending', 'createdAt': time.time(), 'reason': '', 'error': '', 'result': None, 'metadata': metadata, 'imageName': image_path.name}
            directory = requests.root / request_id
            directory.mkdir()
            with (directory / 'image').open('wb') as handle:
                handle.write(image_path.read_bytes())
                handle.flush()
                os.fsync(handle.fileno())
            requests.write(item)
            return public(item)

    @app.delete('/api/publish-requests/{request_id}', status_code=204)
    def delete_request(request_id: str, request: Request):
        accessible(request, request_id)
        with requests.lock(request_id):
            item = accessible(request, request_id)
            if item['status'] not in {'published', 'rejected'}:
                raise HTTPException(409, 'Only published or rejected requests can be deleted.')
            # Keep the receipt to prevent submitting the same calibration twice.
            item['deletedAt'] = time.time()
            requests.write(item)
        return Response(status_code=204)

    @app.get('/api/publish-requests/{request_id}/image')
    def image(request_id: str, request: Request):
        item = accessible(request, request_id)
        return FileResponse(requests.root / request_id / 'image', media_type='image/png' if item['imageName'].endswith('.png') else 'image/jpeg')

    @app.get('/api/publish-requests/{request_id}/preview')
    def preview(request_id: str, request: Request):
        item = accessible(request, request_id)
        metadata = item['metadata']
        width, height = metadata['imageWidth'], metadata['imageHeight']
        polygons = ''.join('<polygon points="' + ' '.join(f'{float(x)},{float(y)}' for x, y in hold['polygon']) + '"/>' for hold in metadata['holds'])
        return HTMLResponse(f'<!doctype html><html><meta charset="utf-8"><title>{escape(item["wallName"])}</title><style>body{{margin:24px;background:#111;color:#eee;font-family:sans-serif}}svg{{max-width:100%;height:auto}}polygon{{fill:#77c94b44;stroke:#77c94b;stroke-width:2;vector-effect:non-scaling-stroke}}</style><h1>{escape(item["wallName"])}</h1><svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><image href="image" width="{width}" height="{height}"/>{polygons}</svg></html>')

    @app.post('/api/publish-requests/{request_id}/approve')
    async def approve(request_id: str, request: Request):
        admin_only(request)
        accessible(request, request_id)
        with requests.lock(request_id):
            item = accessible(request, request_id)
            if item['status'] == 'published':
                return public(item)
            if item['status'] == 'rejected':
                raise HTTPException(409, 'Rejected requests cannot be approved.')
            # A publishing record with no active kernel lock is a crashed attempt.
            # Reuse its immutable metadata/id so destination deduplication recovers it.
            item.update(status='publishing', error='', reviewerId=request.state.actor['userId'], reviewedAt=time.time())
            requests.write(item)
            try:
                result = await publish(item['target'], (requests.root / request_id / 'image').read_bytes(), item['imageName'], item['metadata'])
                item.update(status='published', result=result)
            except Exception as error:
                item.update(status='failed', error=str(error)[:500])
            requests.write(item)
            return public(item)

    @app.post('/api/publish-requests/{request_id}/reject')
    def reject(request_id: str, request: Request, payload: dict = Body(...)):
        admin_only(request)
        accessible(request, request_id)
        reason = payload.get('reason', '')
        if not isinstance(reason, str) or len(reason.strip()) > 300 or any(ord(c) < 32 for c in reason):
            raise HTTPException(422, 'Reason must be at most 300 characters without control characters.')
        reason = reason.strip()
        with requests.lock(request_id):
            item = accessible(request, request_id)
            if item['status'] in {'publishing', 'published', 'failed'}:
                # A failed remote attempt can have committed before a timeout.
                raise HTTPException(409, 'A started publication must be recovered through approval.')
            item.update(status='rejected', reason=reason, reviewerId=request.state.actor['userId'], reviewedAt=time.time())
            requests.write(item)
            return public(item)

import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from lab_client import TestClient
from test_publish_api import _publish_fixture
from segmentation_lab.api import create_app
from segmentation_lab.config import Settings


def setup(tmp_path):
    settings = Settings(data_dir=tmp_path, edge_segmentation_url='https://edge.example', edge_segmentation_publish_key='key')
    app = create_app(settings)
    member = TestClient(app, user_id='member', is_admin=False)
    admin = TestClient(app)
    eid, cid = _publish_fixture(member)
    url = f'/api/experiments/{eid}/calibrations/{cid}/publish-requests'
    return settings, member, admin, eid, cid, url


def submit(member, url, target='cloudflare'):
    response = member.post(url, json={'target': target, 'wallName': '<script>alert(1)</script>'})
    assert response.status_code == 201, response.text
    return response.json()


def test_admin_direct_publication_does_not_enter_application_list(tmp_path, monkeypatch):
    _, member, admin, _, _, url = setup(tmp_path)
    class Publisher:
        def __init__(self, *args, **kwargs): pass
        async def publish(self, *args): return {'wallId': 'admin-wall'}
    monkeypatch.setattr('segmentation_lab.api.CruxSetPublisher', Publisher)
    eid, cid = _publish_fixture(admin)
    response = admin.post(f'/api/experiments/{eid}/calibrations/{cid}/publish', json={'target': 'cloudflare', 'wallName': 'Direct'})
    assert response.status_code == 201
    assert admin.get('/api/publish-requests').json()['items'] == []
    application = submit(member, url)
    assert [item['id'] for item in admin.get('/api/publish-requests').json()['items']] == [application['id']]


def test_snapshot_authorization_and_approval_after_original_deleted(tmp_path, monkeypatch):
    settings, member, admin, eid, cid, url = setup(tmp_path)
    item = submit(member, url)
    assert submit(member, url)['id'] == item['id']
    other = TestClient(member.app, user_id='other', is_admin=False)
    path = '/api/publish-requests/' + item['id']
    assert other.get('/api/publish-requests').json()['items'] == []
    assert other.get(path + '/image').status_code == 404
    assert other.get(path + '/preview').status_code == 404
    assert member.post(path + '/approve').status_code == 403
    assert member.post(path + '/reject', json={'reason': 'no'}).status_code == 403
    original = member.get(path + '/image').content
    member.delete(f'/api/experiments/{eid}')
    assert member.get(path + '/image').content == original
    preview = admin.get(path + '/preview')
    assert preview.status_code == 200
    assert '<script>' not in preview.text and '&lt;script&gt;' in preview.text
    assert 'href="image"' in preview.text
    calls = []
    class Publisher:
        def __init__(self, *args, **kwargs):
            assert args == ('https://edge.example', 'key')
            assert kwargs == {'auth_mode': 'hmac'}
        async def publish(self, image, filename, metadata):
            assert 'applicantId' not in metadata
            calls.append(metadata)
            assert image == original
            assert 'ownerId' not in metadata
            return {'wallId': 'wall-1', 'browsePath': '/wall/wall-1'}
    monkeypatch.setattr('segmentation_lab.api.CruxSetPublisher', Publisher)
    admin = TestClient(create_app(settings))
    approved = admin.post(path + '/approve').json()
    assert approved['status'] == 'published'
    assert approved['reviewerId'] == 'admin' and approved['reviewedAt'] >= item['createdAt']
    assert admin.post(path + '/approve').json()['result']['wallId'] == 'wall-1'
    assert len(calls) == 1 and calls[0]['publishRequestId'] == item['id']


def test_retry_recovery_and_rejection(tmp_path, monkeypatch):
    settings, member, admin, eid, cid, url = setup(tmp_path)
    item = submit(member, url)
    path = '/api/publish-requests/' + item['id']
    calls = []
    class Publisher:
        def __init__(self, *args, **kwargs): pass
        async def publish(self, image, filename, metadata):
            calls.append(metadata['publishRequestId'])
            if len(calls) == 1: raise RuntimeError('offline')
            return {'wallId': 'wall-1'}
    monkeypatch.setattr('segmentation_lab.api.CruxSetPublisher', Publisher)
    assert admin.post(path + '/approve').json()['status'] == 'failed'
    assert submit(member, url)['id'] == item['id']
    record = tmp_path / 'publish-requests' / item['id'] / 'request.json'
    data = json.loads(record.read_text()); data['status'] = 'publishing'; record.write_text(json.dumps(data))
    assert TestClient(create_app(settings)).post(path + '/approve').json()['status'] == 'published'
    assert calls == [item['id'], item['id']]
    assert admin.post(path + '/reject', json={'reason': 'late'}).status_code == 409
    second = submit(member, url, 'cloudbase')
    reject = '/api/publish-requests/' + second['id'] + '/reject'
    assert admin.post(reject, json={'reason': 'Revise holds'}).json()['reason'] == 'Revise holds'
    assert admin.post(reject.removesuffix('reject') + 'approve').status_code == 409
    assert submit(member, url, 'cloudbase')['id'] != second['id']


@pytest.mark.parametrize('payload', [{'target': 'web'}, {'target': []}, {'target': 'cloudflare', 'wallName': 123}, {'target': 'cloudflare', 'wallName': 'x' * 121}])
def test_invalid_request_metadata(tmp_path, payload):
    *_, member, admin, eid, cid, url = setup(tmp_path)
    assert member.post(url, json=payload).status_code == 422


def test_concurrent_approval_only_publishes_once(tmp_path, monkeypatch):
    settings, member, admin, eid, cid, url = setup(tmp_path)
    item = submit(member, url)
    started, finish = Event(), Event()
    class Publisher:
        def __init__(self, *args, **kwargs): pass
        async def publish(self, *args):
            import asyncio
            started.set()
            await asyncio.to_thread(finish.wait, 5)
            return {'wallId': 'wall-1'}
    monkeypatch.setattr('segmentation_lab.api.CruxSetPublisher', Publisher)
    path = '/api/publish-requests/' + item['id'] + '/approve'
    with ThreadPoolExecutor() as pool:
        first = pool.submit(admin.post, path)
        assert started.wait(5)
        try:
            assert TestClient(create_app(settings)).post(path).status_code == 409
        finally:
            finish.set()
        assert first.result().json()['status'] == 'published'


def test_cloudbase_approval_uses_snapshot_and_admin_destination(tmp_path, monkeypatch):
    settings, member, admin, eid, cid, url = setup(tmp_path)
    from dataclasses import replace
    configured = replace(settings, cloudbase_function_url='https://fn.example', cloudbase_storage_url='https://storage.example', cloudbase_signing_key='secret', cloudbase_owner_openid='platform-admin')
    calls = []
    class Publisher:
        def __init__(self, *args, **kwargs):
            assert kwargs['owner_openid'] == 'platform-admin'
        async def publish(self, image, filename, metadata):
            assert image[:4] == b'RIFF' and filename == 'wall.webp'
            assert 'ownerId' not in metadata
            calls.append(metadata)
            return {'wallId': 'cloudbase-wall'}
    monkeypatch.setattr('segmentation_lab.api.CloudBaseSynchronizer', Publisher)
    item = submit(member, url, 'cloudbase')
    member.delete(f'/api/experiments/{eid}/calibrations/{cid}')
    result = TestClient(create_app(configured)).post('/api/publish-requests/' + item['id'] + '/approve').json()
    assert result['status'] == 'published'
    assert calls[0]['holds'][0]['polygon'] == [[10, 10], [30, 10], [20, 30]]
    assert calls[0]['publishRequestId'] == item['id']


def test_member_models_advertise_request_targets(tmp_path):
    _, member, admin, *_ = setup(tmp_path)
    models = member.get('/api/models').json()
    assert models['isAdmin'] is False
    assert models['requestTargets'] == ['cloudbase', 'cloudflare']
    assert admin.get('/api/models').json()['requestTargets'] == []


def test_optional_rejection_reason_and_private_cache(tmp_path):
    _, member, admin, _, _, url = setup(tmp_path)
    item = submit(member, url)
    path = '/api/publish-requests/' + item['id']
    assert member.get(path + '/image').headers['cache-control'] == 'no-store'
    assert member.get(path + '/preview').headers['cache-control'] == 'no-store'
    assert admin.post(path + '/reject', json={'reason': 'x' * 301}).status_code == 422
    rejected = admin.post(path + '/reject', json={}).json()
    assert rejected['reason'] == ''
    assert rejected['reviewerId'] == 'admin' and rejected['reviewedAt'] >= item['createdAt']


def test_crashed_publishing_list_advertises_safe_retry(tmp_path):
    _, member, admin, _, _, url = setup(tmp_path)
    item = submit(member, url)
    record = tmp_path / 'publish-requests' / item['id'] / 'request.json'
    data = json.loads(record.read_text()); data['status'] = 'publishing'; record.write_text(json.dumps(data))
    assert admin.get('/api/publish-requests').json()['items'][0]['retryable'] is True
    from segmentation_lab.publish_requests import PublishRequests
    with PublishRequests(tmp_path / 'publish-requests').lock(item['id']):
        assert admin.get('/api/publish-requests').json()['items'][0]['retryable'] is False

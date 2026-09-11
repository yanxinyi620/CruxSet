import hashlib
import json
from io import BytesIO

from fastapi.testclient import TestClient as DirectClient
from PIL import Image
import pytest

from lab_client import TestClient
from segmentation_lab.api import create_app
from segmentation_lab.config import Settings
from segmentation_lab.experiments import ExperimentStore


def png():
    output = BytesIO()
    Image.new("RGB", (20, 20), "white").save(output, format="PNG")
    return output.getvalue()


def upload(client):
    response = client.post('/api/experiments', files={'image': ('wall.png', png(), 'image/png')})
    assert response.status_code == 201
    return response.json()['id']


def test_direct_requests_and_spoofed_identity_are_rejected(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key'))
    client = DirectClient(app)
    for path in ['/api/health', '/api/experiments', '/api/calibrations']:
        assert client.get(path).status_code == 401
        assert client.get(path, headers={'X-CruxSet-Lab-Context': 'admin', 'X-CruxSet-Lab-Signature': 'fake'}).status_code == 401


def test_unconfigured_internal_api_fails_closed(tmp_path):
    assert DirectClient(create_app(Settings(data_dir=tmp_path))).get('/api/experiments').status_code == 503


def test_owner_scope_including_calibration_and_publish(tmp_path):
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key'))
    alice = TestClient(app, user_id='alice', is_admin=False)
    bob = TestClient(app, user_id='bob', is_admin=True)
    eid = upload(alice)
    calibration = alice.post(f'/api/experiments/{eid}/calibrations', json={'sourceTaskId': 'run', 'candidates': [{'id':'h1','polygon':[[1,1],[8,1],[8,8]]}]}).json()['id']
    assert bob.get('/api/experiments').json()['items'] == []
    assert bob.get('/api/calibrations').json()['items'] == []
    assert len(alice.get('/api/calibrations').json()['items']) == 1
    for method, path in [('GET','image'),('GET','candidates'),('GET','calibrations'),('POST','runs'),('DELETE','runs/run'),('GET',f'calibrations/{calibration}'),('GET',f'calibrations/{calibration}/export.svg'),('POST',f'calibrations/{calibration}/publish'),('DELETE',f'calibrations/{calibration}')]:
        assert bob.request(method, f'/api/experiments/{eid}/{path}').status_code == 404
    assert bob.delete(f'/api/experiments/{eid}').status_code == 404
    assert (tmp_path/'experiments'/eid/'owner.json').read_text()


def test_legacy_assignment_is_admin_only_and_idempotent(tmp_path):
    store = ExperimentStore(tmp_path)
    eid = store.create('old.png', 'hash', 20, 20).id
    original = (store.root/eid/'experiment.json').read_bytes()
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key'))
    member = TestClient(app, user_id='member', is_admin=False)
    admin = TestClient(app)
    assert member.get('/api/experiments').json()['items'] == []
    assert [e['id'] for e in admin.get('/api/experiments').json()['items']] == [eid]
    assert json.loads((store.root/eid/'owner.json').read_text())['ownerId'] == 'admin'
    before = (store.root/eid/'owner.json').read_bytes()
    member.get('/api/experiments')
    assert (store.root/eid/'owner.json').read_bytes() == before
    assert (store.root/eid/'experiment.json').read_bytes() == original


def test_local_publish_uses_actor_not_browser_owner(tmp_path, monkeypatch):
    seen = []
    class Publisher:
        def __init__(self, *args, **kwargs): pass
        async def publish(self, image, filename, metadata):
            seen.append(metadata)
            return {'wallId':'wall', 'browsePath':'/wall/wall'}
    monkeypatch.setattr('segmentation_lab.api.CruxSetPublisher', Publisher)
    client = TestClient(create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key')), user_id='member', is_admin=False)
    eid = upload(client)
    cid = client.post(f'/api/experiments/{eid}/calibrations',json={'sourceTaskId':'run','candidates':[{'id':'h','polygon':[[1,1],[8,1],[8,8]]}]}).json()['id']
    path = f'/api/experiments/{eid}/calibrations/{cid}/publish'
    assert client.post(path,json={'target':'web','ownerId':'victim'}).status_code == 201
    assert seen[0]['ownerId'] == 'member'
    for target in ['cloudbase','cloudflare']:
        assert client.post(path,json={'target':target}).status_code == 403


def test_signed_but_unsafe_identifiers_are_rejected(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key')))
    for path in ['/api/experiments/%2e%2e/image', '/api/experiments/bad%5Cpath/image']:
        assert client.get(path).status_code == 404


def test_models_declare_actor_publish_targets(tmp_path):
    from segmentation_lab.adapters.base import ModelAvailability
    class Unavailable:
        def available(self): return ModelAvailability(False, 'missing', 'cpu')
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key'), adapters={'sam2': Unavailable()})
    assert TestClient(app, user_id='member', is_admin=False).get('/api/models').json()['publishTargets'] == ['web']
    assert TestClient(app).get('/api/models').json()['publishTargets'] == ['web','cloudbase','cloudflare']


@pytest.mark.parametrize('change', [{'method':'DELETE'},{'path':'/api/calibrations'},{'query':'a=1'},{'bodySha256':'bad'},{'issuedAt':0},{'isAdmin':'true'}])
def test_signed_context_binding_and_expiry(tmp_path, change):
    import base64, hmac, time
    app = create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key'))
    context = {'userId':'admin','isAdmin':True,'legacyOwnerId':'admin','issuedAt':time.time(),'method':'GET','path':'/api/experiments','query':'','bodySha256':hashlib.sha256(b'').hexdigest(), **change}
    encoded = base64.urlsafe_b64encode(json.dumps(context).encode()).decode().rstrip('=')
    headers = {'X-CruxSet-Lab-Context':encoded,'X-CruxSet-Lab-Signature':hmac.new(b'key',encoded.encode(),hashlib.sha256).hexdigest()}
    assert DirectClient(app).get('/api/experiments',headers=headers).status_code == 401


def test_member_local_publish_does_not_invoke_external_success_hook(tmp_path, monkeypatch):
    calls = []
    class Publisher:
        def __init__(self, *args, **kwargs): pass
        async def publish(self, *args): return {'wallId':'wall','browsePath':'/wall/wall'}
    monkeypatch.setattr('segmentation_lab.api.CruxSetPublisher', Publisher)
    client = TestClient(create_app(Settings(data_dir=tmp_path, cruxset_publish_key='key'), post_success_hook=lambda *args: calls.append(args)), user_id='member', is_admin=False)
    eid = upload(client)
    cid = client.post(f'/api/experiments/{eid}/calibrations',json={'sourceTaskId':'run','candidates':[{'id':'h','polygon':[[1,1],[8,1],[8,8]]}]}).json()['id']
    assert client.post(f'/api/experiments/{eid}/calibrations/{cid}/publish',json={'target':'web'}).status_code == 201
    assert calls == []

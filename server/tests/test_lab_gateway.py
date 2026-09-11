import base64
import hashlib
import hmac
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.repositories.memory import MemoryRepository
from app.auth.sessions import create_session, session_cookie_name


@pytest.fixture
def lab(monkeypatch):
    repo = MemoryRepository()
    for uid, role in [('admin', 'admin'), ('member', 'user')]:
        repo.insert_user({'id': uid})
        repo.insert_admin({'userId': uid, 'role': role, 'emailNormalized': uid+'@example.com', 'createdAt': 1})
    monkeypatch.setattr(app.state, 'repository', repo)
    monkeypatch.setattr(app.state, 'lab_internal_key', 'secret', raising=False)
    monkeypatch.setattr(app.state, 'local_lab_url', 'http://127.0.0.1:8765', raising=False)
    monkeypatch.setattr(app.state, 'segmentation_publish_owner_id', '', raising=False)
    monkeypatch.setattr(app.state, 'lab_transport', httpx.MockTransport(lambda r: httpx.Response(200, json={'ok': True})), raising=False)
    client = TestClient(app)
    client.cookies.set(session_cookie_name(), create_session('admin'))
    return client, repo


def test_grant_revoke_and_capabilities(lab):
    client, repo = lab
    assert client.get('/api/v1/bootstrap').json()['capabilities']['manageLabAccess'] is True
    client.cookies.set(session_cookie_name(), create_session('member'))
    assert client.get('/api/v1/segmentation-lab/experiments').status_code == 403
    client.cookies.set(session_cookie_name(), create_session('admin'))
    endpoint = '/api/v1/auth/admin/users/member/lab-access'
    assert client.patch(endpoint, json={'enabled': True}, headers={'Origin': 'http://testserver'}).status_code == 200
    client.cookies.set(session_cookie_name(), create_session('member'))
    assert client.get('/api/v1/auth/me').json()['user']['labEnabled'] is True
    assert client.get('/api/v1/segmentation-lab/experiments').status_code == 200
    account = repo.find_admin_by_user_id('member'); account['labEnabled'] = False; repo.insert_admin(account)
    assert client.get('/api/v1/segmentation-lab/experiments').status_code == 403


@pytest.mark.parametrize('body', [{'enabled':'true'}, {'enabled':1}, {'enabled':True,'role':'admin'}, {}])
def test_grant_strict_schema(lab, body):
    assert lab[0].patch('/api/v1/auth/admin/users/member/lab-access', json=body, headers={'Origin':'http://testserver'}).status_code == 422


def test_grant_and_writes_require_origin(lab):
    client, _ = lab
    for origin in [None, 'https://evil.example']:
        headers = {'Origin':origin} if origin else {}
        assert client.patch('/api/v1/auth/admin/users/member/lab-access',json={'enabled':True},headers=headers).status_code == 403
        assert client.post('/api/v1/segmentation-lab/experiments',headers=headers).status_code == 403
    client.cookies.set(session_cookie_name(), create_session('member'))
    assert client.patch('/api/v1/auth/admin/users/member/lab-access',json={'enabled':True},headers={'Origin':'http://testserver'}).status_code == 403


def test_gateway_signs_actual_body_and_ignores_spoof(lab, monkeypatch):
    client, _ = lab
    def receive(request):
        encoded = request.headers['X-CruxSet-Lab-Context']
        context = json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))
        assert context['userId'] == 'admin' and context['isAdmin'] is True
        assert context['legacyOwnerId'] == 'admin'
        assert context['method'] == 'POST' and context['path'] == '/api/experiments'
        assert context['query'] == 'x=a%20b&x=2'
        assert context['bodySha256'] == hashlib.sha256(b'actual body').hexdigest()
        assert request.headers['X-CruxSet-Lab-Signature'] == hmac.new(b'secret',encoded.encode(),hashlib.sha256).hexdigest()
        assert 'authorization' not in request.headers and 'cookie' not in request.headers
        return httpx.Response(201,json={'ok':True})
    monkeypatch.setattr(app.state,'lab_transport',httpx.MockTransport(receive))
    response = client.post('/api/v1/segmentation-lab/experiments?x=a%20b&x=2',content=b'actual body',headers={'Origin':'http://testserver','Authorization':'Bearer forged','X-CruxSet-Lab-Context':'forged'})
    assert response.status_code == 201


def test_gateway_offline(lab, monkeypatch):
    def offline(request): raise httpx.ConnectError('offline')
    monkeypatch.setattr(app.state,'lab_transport',httpx.MockTransport(offline))
    assert lab[0].get('/api/v1/segmentation-lab/experiments').status_code == 503


def test_gateway_rejects_encoded_traversal(lab):
    assert lab[0].get('/api/v1/segmentation-lab/%2e%2e/healthz').status_code == 422


def test_legacy_owner_selection_and_configuration(lab, monkeypatch):
    from app.auth.lab import legacy_owner_id
    from starlette.requests import Request
    client, repo = lab
    repo.insert_user({'id':'older'})
    repo.insert_admin({'userId':'older','role':'admin','createdAt':0,'emailNormalized':'older@example.com'})
    request = Request({'type':'http','app':app})
    assert legacy_owner_id(request) == 'older'
    monkeypatch.setattr(app.state,'segmentation_publish_owner_id','member')
    assert legacy_owner_id(request) == 'older'
    monkeypatch.setattr(app.state,'segmentation_publish_owner_id','admin')
    assert legacy_owner_id(request) == 'admin'
    monkeypatch.setattr(app.state,'lab_internal_key','')
    monkeypatch.setattr(app.state,'segmentation_publish_key','')
    assert client.get('/api/v1/bootstrap').json()['capabilities'] == {'segmentationLab':False,'manageLabAccess':False,'manageOwnWalls':True}
    assert client.get('/api/v1/segmentation-lab/experiments').status_code == 503


def test_grants_persist_in_sqlite(lab, monkeypatch, tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    client, memory = lab
    db = tmp_path/'grants.db'
    repo = SQLiteRepository(str(db))
    for user in memory.list_users(): repo.insert_user(user)
    for account in memory.list_admin_accounts(): repo.insert_admin(account)
    monkeypatch.setattr(app.state,'repository',repo)
    assert client.patch('/api/v1/auth/admin/users/member/lab-access',json={'enabled':True},headers={'Origin':'http://testserver'}).status_code == 200
    assert SQLiteRepository(str(db)).find_admin_by_user_id('member')['labEnabled'] is True
    assert client.patch('/api/v1/auth/admin/users/member/lab-access',json={'enabled':False},headers={'Origin':'http://testserver'}).status_code == 200
    assert SQLiteRepository(str(db)).find_admin_by_user_id('member')['labEnabled'] is False


def test_private_gateway_responses_cannot_be_cached(lab, monkeypatch):
    client, _ = lab
    monkeypatch.setattr(app.state, 'lab_transport', httpx.MockTransport(lambda r: httpx.Response(200,content=b'private image',headers={'Content-Type':'image/png','ETag':'"image"','Cache-Control':'public,max-age=3600'})))
    response = client.get('/api/v1/segmentation-lab/experiments/mine/image')
    assert response.headers['cache-control'] == 'no-store'
    assert 'cookie' in response.headers['vary'].lower()

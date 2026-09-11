"""Real HTTP roundtrip across the two independently installed Python services."""
import base64
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import sys
import time

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
LAB_PYTHON = ROOT / 'tools/segmentation-lab/.venv/bin/python'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait_ready(url, process):
    for _ in range(100):
        assert process.poll() is None, 'Test service exited before becoming ready'
        try:
            if httpx.get(url, timeout=.5, trust_env=False).status_code == 200:
                return
        except httpx.RequestError:
            pass
        time.sleep(.05)
    raise AssertionError('Test service did not become ready')


@pytest.mark.skipif(not LAB_PYTHON.exists(), reason='Install the local lab environment for two-service HTTP verification')
def test_authenticated_local_lab_roundtrip(tmp_path):
    api_port, lab_port = free_port(), free_port()
    while api_port == lab_port:
        lab_port = free_port()
    origin, lab_origin = f'http://127.0.0.1:{api_port}', f'http://127.0.0.1:{lab_port}'
    lab_data = tmp_path / 'lab'
    legacy = lab_data / 'experiments/legacy'
    legacy.mkdir(parents=True)
    legacy_payload = json.dumps({'id':'legacy','imageName':'legacy.png','imageSha256':'hash','width':1,'height':1,'createdAt':1,'runs':{}}).encode()
    (legacy/'experiment.json').write_bytes(legacy_payload)
    env = {**os.environ, 'CRUXSET_DATABASE_URL':str(tmp_path/'db.sqlite'), 'CRUXSET_MEDIA_DIR':str(tmp_path/'media'), 'SESSION_SECRET':secrets.token_urlsafe(32), 'SESSION_COOKIE_SECURE':'false', 'CRUXSET_LAB_INTERNAL_KEY':secrets.token_urlsafe(32), 'CRUXSET_SEGMENTATION_PUBLISH_KEY':secrets.token_urlsafe(32), 'CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID':'', 'CRUXSET_LOCAL_LAB_URL':lab_origin, 'CRUXSET_BASE_URL':origin, 'CRUXSET_WEB_URL':origin, 'SEG_LAB_DATA_DIR':str(lab_data), 'WEB_ORIGIN':origin, 'LAB_TEST_PORT':str(lab_port), 'API_TEST_PORT':str(api_port)}
    api_code = """
import os, uvicorn
from app.main import app
from app.auth.passwords import create_admin_account
create_admin_account(app.state.repository, 'admin@example.com', 'test-password')
uvicorn.run(app, host='127.0.0.1', port=int(os.environ['API_TEST_PORT']), log_level='error')
"""
    lab_code = """
import os, uvicorn
from segmentation_lab.api import create_app
from segmentation_lab.config import Settings
from segmentation_lab.adapters.base import ModelAvailability
class FakeAdapter:
    def available(self): return ModelAvailability(True, None, 'cpu')
    def generate(self, *args, **kwargs): return []
uvicorn.run(create_app(Settings.from_env(), adapters={'sam2':FakeAdapter()}), host='127.0.0.1', port=int(os.environ['LAB_TEST_PORT']), log_level='error')
"""
    processes = []
    with (tmp_path/'services.log').open('w+') as log:
        try:
            processes.append(subprocess.Popen([sys.executable,'-c',api_code],cwd=ROOT/'server',env=env,stdout=log,stderr=log))
            processes.append(subprocess.Popen([str(LAB_PYTHON),'-c',lab_code],cwd=ROOT/'tools/segmentation-lab',env=env,stdout=log,stderr=log))
            wait_ready(origin+'/healthz',processes[0])
            wait_ready(lab_origin+'/',processes[1])
            prefix = '/api/v1/segmentation-lab'
            with httpx.Client(base_url=origin,headers={'Origin':origin},timeout=20,trust_env=False) as admin, httpx.Client(base_url=origin,headers={'Origin':origin},timeout=20,trust_env=False) as member:
                assert member.get(prefix+'/experiments').status_code == 401
                login = admin.post('/api/v1/auth/admin/login',json={'email':'admin@example.com','password':'test-password'})
                admin_id = login.json()['user']['id']
                registered = member.post('/api/v1/auth/register',json={'email':'member@example.com','password':'test-password','confirmPassword':'test-password'})
                uid = registered.json()['user']['id']
                assert member.get(prefix+'/experiments').status_code == 403
                grant = f'/api/v1/auth/admin/users/{uid}/lab-access'
                assert admin.patch(grant,json={'enabled':True}).status_code == 200
                assert member.get('/api/v1/bootstrap').json()['capabilities']['segmentationLab'] is True
                assert member.get(prefix+'/experiments').json()['items'] == []
                assert [e['id'] for e in admin.get(prefix+'/experiments').json()['items']] == ['legacy']
                assert json.loads((legacy/'owner.json').read_text())['ownerId'] == admin_id
                assert (legacy/'experiment.json').read_bytes() == legacy_payload
                upload = member.post(prefix+'/experiments',files={'image':('wall.png',PNG,'image/png')})
                assert upload.status_code == 201, upload.text
                eid = upload.json()['id']
                assert member.get(prefix+f'/experiments/{eid}/image').content == PNG
                task = member.post(prefix+f'/experiments/{eid}/runs',json={'model':'sam2','parameters':{}})
                assert task.status_code == 202, task.text
                for _ in range(100):
                    runs = member.get(prefix+'/experiments').json()['items'][0]['runs']
                    state = runs[task.json()['taskId']]['status']
                    if state != 'running': break
                    time.sleep(.02)
                assert state == 'succeeded'
                calibration = member.post(prefix+f'/experiments/{eid}/calibrations',json={'sourceTaskId':task.json()['taskId'],'candidates':[{'id':'h1','polygon':[[.1,.1],[.8,.1],[.8,.8]]}]})
                assert calibration.status_code == 201, calibration.text
                cid = calibration.json()['id']
                detail = prefix+f'/experiments/{eid}/calibrations/{cid}'
                assert member.get(detail+'/export.svg').status_code == 200
                assert admin.get(prefix+f'/experiments/{eid}/image').status_code == 404
                assert admin.post(detail+'/publish',json={'target':'web','wallName':'Stolen'}).status_code == 404
                assert member.post(detail+'/publish',json={'target':'cloudbase','wallName':'External'}).status_code == 403
                published = member.post(detail+'/publish',json={'target':'web','wallName':'Member wall','ownerId':admin_id})
                assert published.status_code == 201, published.text
                wall_id = published.json()['wallId']
                with sqlite3.connect(tmp_path/'db.sqlite') as db:
                    wall = json.loads(db.execute("SELECT body FROM documents WHERE collection_name='walls' AND document_id=?",(wall_id,)).fetchone()[0])
                assert wall['ownerId'] == uid and wall['published'] is True
                assert admin.patch(grant,json={'enabled':False}).status_code == 200
                assert member.get(prefix+'/experiments').status_code == 403
                assert member.post(detail+'/publish',json={'target':'web','wallName':'Again'}).status_code == 403
                assert admin.patch(grant,json={'enabled':True}).status_code == 200
                assert member.get(detail).status_code == 200
                assert httpx.get(lab_origin+'/api/experiments',trust_env=False).status_code == 401
                processes[1].terminate(); processes[1].wait(timeout=10)
                assert member.get(prefix+'/experiments').status_code == 503
                assert member.get('/api/v1/bootstrap').status_code == 200
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
                    try: process.wait(timeout=10)
                    except subprocess.TimeoutExpired: process.kill(); process.wait()

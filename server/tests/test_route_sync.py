import copy
import pytest
from app.route_sync import geometry, export_route, import_route


def wall():
    return {'id':'local', 'published':True, 'visibility':'public', 'wallNumber':3, 'angleOptions':[20,25], 'source':{'experimentId':'exp','calibrationId':'cal'}, 'holds':[
        {'id':'A','kind':'hold','polygon':[[.1,.1],[.2,.1],[.2,.2],[.1,.2]]},
        {'id':'B','kind':'hold','polygon':[[.5,.5],[.6,.5],[.6,.6],[.5,.6]]}]}


def problem():
    return {'id':'route','name':'测试', 'description':'note','angle':20,'grade':'V2','footRule':'feet_follow','holds':{'start':['A'],'finish':['B']}}


def test_geometry_ignores_ids_order_polygon_start_and_direction():
    a=wall(); b=copy.deepcopy(a)
    b['holds'].reverse()
    for h in b['holds']:
        h['id']='remote_'+h['id']; p=h['polygon']; h['polygon']=list(reversed(p[1:]+p[:1])); h['x']=0.9; h['radius']=0.1
    assert geometry(a)['geometryHash']==geometry(b)['geometryHash']
    assert import_route(b,export_route(a,problem()))['holds']['start']==['remote_A']


def test_dedupe_ignores_metadata_but_includes_grade_angle_roles_and_foot_rule():
    a=problem(); base=export_route(wall(),a)['fingerprint']
    assert export_route(wall(),{**a,'name':'another','description':'other','createdBy':'someone'})['fingerprint']==base
    for changes in [{'grade':'V3'},{'angle':25},{'footRule':'all'},{'holds':{'start':['B'],'finish':['A']}}]:
        assert export_route(wall(),{**a,**changes})['fingerprint']!=base


def test_rejects_ambiguous_geometry_unknown_holds_and_forged_hash():
    a=wall(); a['holds'].append({**a['holds'][0],'id':'C'})
    with pytest.raises(ValueError): geometry(a)
    with pytest.raises(ValueError): export_route(wall(),{**problem(),'holds':{'start':['missing'],'finish':['B']}})
    wire=export_route(wall(),problem()); wire['grade']='V3'
    with pytest.raises(ValueError): import_route(wall(),wire)


def test_transactional_import_dedupes_existing_native_routes_and_assigns_admin(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    repo=SQLiteRepository(tmp_path/'sync.db'); w=wall(); repo.insert_wall(w)
    p={**problem(),'wallId':w['id'],'number':'CS-030008','createdBy':'original'}; repo.insert_problem(p)
    wire=export_route(w,p)
    assert repo.import_synced_problem(w['id'],wire,'admin',geometry(w)['geometryHash']) is False
    wire=export_route(w,{**p,'grade':'V3'})
    assert repo.import_synced_problem(w['id'],wire,'admin',geometry(w)['geometryHash']) is True
    assert repo.import_synced_problem(w['id'],wire,'admin',geometry(w)['geometryHash']) is False
    rows=repo.list_problems(); assert len(rows)==2
    added=next(x for x in rows if x['id']!='route')
    assert added['createdBy']=='admin' and added['number']=='CS-030009'
    assert repo.find_problem('route')['createdBy']=='original'
    repo.close()


def test_admin_preview_and_bidirectional_add_only(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.auth.passwords import create_admin_account
    from app.auth.sessions import create_session,session_cookie_name
    from app.repositories.memory import MemoryRepository
    repo=MemoryRepository(); admin=create_admin_account(repo,'sync@example.com','correct horse'); w=wall(); repo.insert_wall(w)
    repo.insert_problem({**problem(),'wallId':w['id'],'number':'CS-030001'})
    monkeypatch.setattr(app.state,'repository',repo)
    remote={export_route(w,{**problem(),'grade':'V4'})['fingerprint']:export_route(w,{**problem(),'grade':'V4'})}
    calls=[]
    async def bridge(payload):
        calls.append(payload)
        if payload['action']=='snapshot': return {'wall':{'id':'remote','name':'远端','wallNumber':7,'geometryHash':geometry(w)['geometryHash']},'routes':list(remote.values()),'invalid':[],'nextOffset':None}
        wire=payload['route']; added=wire['fingerprint'] not in remote; remote[wire['fingerprint']]=wire
        return {'added':added}
    monkeypatch.setattr(app.state,'route_sync_bridge',bridge,raising=False)
    client=TestClient(app); url='/api/v1/admin/walls/local/route-sync'
    assert client.post(url,json={'action':'preview'}).status_code in (401,403)
    cookies={session_cookie_name():create_session(admin['userId'])}
    r=client.post(url,json={'action':'preview'},cookies=cookies)
    assert r.status_code==200,r.text
    assert r.json()['missingLocal']==1 and r.json()['missingRemote']==1
    assert len(repo.list_problems())==1 and len(remote)==1
    r=client.post(url,json={'action':'sync'},cookies=cookies)
    assert r.status_code==200,r.text
    assert r.json()['addedLocal']==1 and r.json()['addedRemote']==1
    assert next(p for p in repo.list_problems() if p['grade']=='V4')['createdBy']==admin['userId']
    again=client.post(url,json={'action':'sync'},cookies=cookies).json()
    assert again['addedLocal']==again['addedRemote']==0
    assert len(repo.list_problems())==len(remote)==2


def test_shared_javascript_fixture_matches_exactly():
    import json
    from pathlib import Path
    data=json.loads((Path(__file__).resolve().parents[2]/'tests/fixtures/route-sync.json').read_text())
    assert geometry(data['wall'])==data['geometry']
    assert export_route(data['wall'],data['problem'])==data['wire']


def test_concurrent_sqlite_connections_only_insert_once(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from app.repositories.sqlite import SQLiteRepository
    path=tmp_path/'concurrent.db'; a=SQLiteRepository(path); b=SQLiteRepository(path); w=wall(); a.insert_wall(w)
    wire=export_route(w,problem()); fp=geometry(w)['geometryHash']
    with ThreadPoolExecutor(2) as pool:
        futures=[pool.submit(repo.import_synced_problem,w['id'],wire,'admin',fp) for repo in (a,b)]
        assert sorted(f.result() for f in futures)==[False,True]
    assert len(a.list_problems())==1
    a.close();b.close()


@pytest.mark.parametrize('angle', range(0, 71, 5))
def test_standard_angles_round_trip_on_legacy_walls(angle):
    route = {**problem(), 'angle': angle}
    assert import_route(wall(), export_route(wall(), route))['angle'] == angle

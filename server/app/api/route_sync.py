"""Administrator-initiated, bounded add-only exchange with CloudBase."""
import hashlib
import hmac
import os
import time
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from app.api.auth import require_admin
from app.api.errors import ApiError
from app.route_sync import canonical, geometry, export_routes, import_route

router=APIRouter(prefix='/api/v1/admin/walls',tags=['route-sync'])


class SyncInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    action: Literal['preview','sync']='preview'
    target: Literal['cloudbase']='cloudbase'


async def call_bridge(request, payload):
    seam=getattr(request.app.state,'route_sync_bridge',None)
    if seam: return await seam(payload)
    endpoint=os.environ.get('CRUXSET_CLOUDBASE_ROUTE_SYNC_URL','')
    secret=os.environ.get('CRUXSET_CLOUDBASE_SIGNING_KEY','')
    if not endpoint or not secret: raise ApiError('SYNC_NOT_CONFIGURED','小程序线路同步尚未配置，请配置同步云函数地址与签名密钥。',503)
    if not endpoint.startswith('https://'): raise ApiError('SYNC_NOT_CONFIGURED','同步云函数必须使用 HTTPS。',503)
    signed={**payload,'timestamp':int(time.time())}
    signed['signature']=hmac.new(secret.encode(),canonical(signed).encode(),hashlib.sha256).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response=await client.post(endpoint,json=signed)
        result=response.json()
        if not response.is_success or not isinstance(result,dict) or result.get('error'):
            raise ValueError(str(result.get('error',result.get('message','REMOTE_SYNC_FAILED')))[:200])
        return result
    except (httpx.HTTPError,ValueError) as error:
        raise ApiError('REMOTE_SYNC_FAILED',f'小程序同步失败：{error}',502) from error


@router.post('/{wall_id}/route-sync')
async def sync_wall(wall_id: str, payload: SyncInput, request: Request, admin=Depends(require_admin)):
    repo=request.app.state.repository
    wall=repo.find_wall(wall_id)
    if not wall or wall.get('deleting') or not wall.get('published') or wall.get('visibility')!='public':
        raise ApiError('WALL_NOT_ROUTABLE','请选择已发布的墙面。',409)
    source=wall.get('source') or {}
    if not source.get('experimentId') or not source.get('calibrationId'):
        raise ApiError('WALL_SOURCE_MISSING','墙面缺少发布来源，无法可靠匹配；请先从同一校准发布到两端。',409)
    try:
        g=geometry(wall)
        selector={'experimentId':source['experimentId'],'calibrationId':source['calibrationId'],'geometryHash':g['geometryHash']}
        local,invalid=export_routes(wall,[p for p in repo.list_problems() if p.get('wallId')==wall_id])
        remote={}; remote_wall=None; offset=0; snapshot_hash=None
        for _ in range(501):
            page=await call_bridge(request,{'action':'snapshot','selector':selector,'offset':offset})
            if offset and (not snapshot_hash or page.get('snapshotHash')!=snapshot_hash): raise ValueError('REMOTE_ROUTES_CHANGED_RETRY')
            snapshot_hash=page.get('snapshotHash')
            if page['wall']['geometryHash']!=g['geometryHash']: raise ValueError('WALL_GEOMETRY_MISMATCH')
            if remote_wall and remote_wall['id']!=page['wall']['id']: raise ValueError('REMOTE_WALL_CHANGED')
            remote_wall=page['wall']
            for wire in page['routes']:
                import_route(wall,wire,g)
                remote.setdefault(wire['fingerprint'],wire)
            invalid.extend({**item,'platform':'cloudbase'} for item in page.get('invalid',[]))
            next_offset=page.get('nextOffset')
            if next_offset is None: break
            if type(next_offset) is not int or next_offset<=offset: raise ValueError('INVALID_REMOTE_PAGINATION')
            offset=next_offset
        else: raise ValueError('SYNC_ROUTE_LIMIT')
        to_local=sorted(set(remote)-set(local)); to_remote=sorted(set(local)-set(remote))
        result={'localWall':{'id':wall_id,'name':wall['name'] if 'name' in wall else wall_id,'wallNumber':wall.get('wallNumber')},'remoteWall':remote_wall,'missingLocal':len(to_local),'missingRemote':len(to_remote),'common':len(set(local)&set(remote)),'invalid':invalid,'addedLocal':0,'addedRemote':0,'skipped':0,'failed':[],'remainingLocal':len(to_local),'remainingRemote':len(to_remote)}
        if payload.action=='sync':
            # Small batches bound request duration; retries re-read both sides, never use stale browser data.
            for key in to_local[:5]:
                try:
                    added=repo.import_synced_problem(wall_id,remote[key],admin['id'],g['geometryHash'])
                    result['addedLocal' if added else 'skipped']+=1
                    result['remainingLocal']-=1
                except Exception as error: result['failed'].append({'direction':'local','message':str(error)[:200]})
            for key in to_remote[:5]:
                try:
                    # Re-read so a source deletion or edit during the scan does not export stale content.
                    current_wall=repo.find_wall(wall_id)
                    if not current_wall or current_wall.get('visibility')!='public' or not current_wall.get('published') or geometry(current_wall)['geometryHash']!=g['geometryHash']: raise ValueError('WALL_CHANGED')
                    current,_=export_routes(current_wall,[p for p in repo.list_problems() if p.get('wallId')==wall_id])
                    if key not in current: raise ValueError('SOURCE_ROUTE_CHANGED')
                    outcome=await call_bridge(request,{'action':'import','selector':{**selector,'wallId':remote_wall['id']},'route':current[key]})
                    if not isinstance(outcome.get('added'),bool): raise ValueError('INVALID_REMOTE_RESULT')
                    result['addedRemote' if outcome['added'] else 'skipped']+=1
                    result['remainingRemote']-=1
                except Exception as error: result['failed'].append({'direction':'cloudbase','message':str(error)[:200]})
        return result
    except (ValueError,KeyError,TypeError) as error:
        raise ApiError('SYNC_VALIDATION_FAILED',f'无法同步：{error}。请确认两端来自同一校准且岩点未改变。',409) from error

"""Versioned route equality and hold translation, shared contract with routeSync/fingerprint.js."""
import hashlib
import json
import math

ROLES = ('start', 'foot', 'hand', 'assist', 'finish')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def quantize(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError('INVALID_GEOMETRY')
    return math.floor(value * 1000000 + .5)


def geometry(wall):
    by_id, by_hash = {}, {}
    for hold in wall.get('holds', []):
        hid = hold.get('id'); kind = hold.get('kind') or 'hold'
        if not isinstance(hid, str) or not hid or hid in by_id or kind not in ('hold', 'volume'):
            raise ValueError('INVALID_GEOMETRY')
        if hold.get('polygon') is not None:
            points = hold['polygon']
            if not isinstance(points, list) or len(points)>10000 or any(not isinstance(p, list) or len(p) != 2 for p in points):
                raise ValueError('INVALID_GEOMETRY')
            points = [[quantize(v) for v in p] for p in points]
            if len(points)>1 and points[0]==points[-1]: points.pop()
            if len(points)<3 or len({tuple(p) for p in points}) != len(points): raise ValueError('INVALID_GEOMETRY')
            if sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points))) == 0: raise ValueError('INVALID_GEOMETRY')
            # Linear number of rotations, no floating point serialization in the hash.
            start=min(range(len(points)),key=lambda i:canonical(points[i]))
            forward=points[start:]+points[:start]
            reverse=[forward[0]]+list(reversed(forward[1:]))
            rotations=[forward,reverse]
            shape = ['polygon', min(rotations, key=canonical)]
        else:
            shape = ['circle', quantize(hold.get('x')), quantize(hold.get('y')), quantize(hold.get('radius'))]
            if shape[-1] <= 0: raise ValueError('INVALID_GEOMETRY')
        fingerprint = digest(['hold-v1', kind, shape])
        if fingerprint in by_hash: raise ValueError('AMBIGUOUS_HOLDS')
        by_id[hid] = fingerprint; by_hash[fingerprint] = hid
    if len(by_id)<2: raise ValueError('INVALID_GEOMETRY')
    return {'geometryHash':digest(['wall-geometry-v1', sorted(by_hash)]), 'idToHash':by_id,'hashToId':by_hash}


def export_route(wall, problem, prepared=None):
    geo = prepared or geometry(wall)
    angle, grade, rule = problem.get('angle'), problem.get('grade'), problem.get('footRule') or 'feet_follow'
    if isinstance(angle,bool) or not isinstance(angle,(int,float)) or angle not in wall.get('angleOptions',[]) or angle not in (20,25,30,35,40,45) or grade not in [f'V{i}' for i in range(17)] or rule not in ('feet_follow','specified','all'):
        raise ValueError('INVALID_ROUTE_METADATA')
    assignments = problem.get('holds', {})
    if not isinstance(assignments,dict) or any(k not in ROLES for k in assignments): raise ValueError('INVALID_ROUTE_HOLDS')
    holds = {}; seen = set()
    for role in ROLES:
        ids = assignments.get(role, [])
        if not isinstance(ids,list): raise ValueError('INVALID_ROUTE_HOLDS')
        hashes = []
        for hid in ids:
            if not isinstance(hid,str) or hid not in geo['idToHash'] or hid in seen: raise ValueError('INVALID_ROUTE_HOLDS')
            seen.add(hid); hashes.append(geo['idToHash'][hid])
        holds[role] = sorted(hashes)
    if not holds['start'] or not holds['finish'] or rule=='specified' and not holds['foot']: raise ValueError('INVALID_ROUTE_HOLDS')
    name, description = problem.get('name') or '', problem.get('description') or ''
    if not isinstance(name,str) or len(name.encode('utf-16-le'))//2>80 or not isinstance(description,str) or len(description.encode('utf-16-le'))//2>500: raise ValueError('INVALID_ROUTE_METADATA')
    fp = digest(['route-v1',geo['geometryHash'],int(angle),grade,rule,[holds[r] for r in ROLES]])
    return {'fingerprint':fp,'angle':int(angle),'grade':grade,'footRule':rule,'holds':holds,'name':name,'description':description}


def import_route(wall, wire, prepared=None):
    geo=prepared or geometry(wall)
    try:
        draft={k:wire[k] for k in ('angle','grade','footRule','name','description')}
        if any(k not in ROLES for k in wire['holds']): raise ValueError('INVALID_ROUTE_HOLDS')
        draft['holds']={role:[geo['hashToId'][h] for h in wire['holds'].get(role,[])] for role in ROLES}
        if export_route(wall,draft,geo)['fingerprint'] != wire['fingerprint']: raise ValueError('FINGERPRINT_MISMATCH')
        return draft
    except (KeyError,TypeError) as error:
        raise ValueError('INVALID_ROUTE_HOLDS') from error


def export_routes(wall, problems):
    routes, invalid = {}, []
    prepared=geometry(wall)
    for p in sorted(problems,key=lambda p:str(p.get('id',''))):
        try:
            route=export_route(wall,p,prepared); routes.setdefault(route['fingerprint'],route)
        except ValueError as error: invalid.append({'id':p.get('id',''), 'message':str(error)})
    return routes, invalid


def prepare_import(wall, problems, wire, admin_id, expected_geometry):
    import secrets
    import time
    if not wall or wall.get('deleting') or not wall.get('published') or wall.get('visibility')!='public': raise ValueError('WALL_NOT_ROUTABLE')
    if geometry(wall)['geometryHash']!=expected_geometry: raise ValueError('WALL_CHANGED')
    draft=import_route(wall,wire)
    existing,_=export_routes(wall,problems)
    if wire['fingerprint'] in existing: return None
    seq=max([int(str(p.get('number',''))[-4:]) for p in problems if str(p.get('number',''))[-4:].isdigit()]+[0])+1
    if seq>9999: raise ValueError('ROUTE_NUMBER_EXHAUSTED')
    number=wall.get('wallNumber')
    if not isinstance(number,int) or number<=0: raise ValueError('WALL_NUMBER_MISSING')
    now=int(time.time()*1000)
    return {**draft,'id':'problem_'+secrets.token_hex(12),'wallId':wall['id'],'number':f'CS-{number:02d}{seq:04d}','createdBy':admin_id,'createdAt':now,'updatedAt':now}

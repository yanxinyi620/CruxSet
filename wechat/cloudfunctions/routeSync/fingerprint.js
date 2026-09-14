const roles = ['start', 'foot', 'hand', 'assist', 'finish']
const fail = message => { throw new Error(message) }
const q = value => Number.isFinite(value) && value >= 0 && value <= 1 ? Math.floor(value * 1e6 + .5) : fail('INVALID_GEOMETRY')
async function geometry(wall, hash) {
  if (!Array.isArray(wall?.holds) || wall.holds.length < 2) fail('INVALID_GEOMETRY')
  const byId = Object.create(null), byFingerprint = Object.create(null)
  for (const hold of wall.holds) {
    if (typeof hold.id !== 'string' || !hold.id || byId[hold.id]) fail('DUPLICATE_HOLD_ID')
    let shape
    if (hold.polygon != null) {
      if (!Array.isArray(hold.polygon) || hold.polygon.length < 3 || hold.polygon.length > 10000) fail('INVALID_GEOMETRY')
      const points = hold.polygon.map(p => Array.isArray(p) && p.length === 2 ? p.map(q) : fail('INVALID_GEOMETRY'))
      if (JSON.stringify(points[0]) === JSON.stringify(points.at(-1))) points.pop()
      if (points.length < 3 || new Set(points.map(p => JSON.stringify(p))).size !== points.length || points.reduce((sum,p,i)=>{const n=points[(i+1)%points.length];return sum+p[0]*n[1]-n[0]*p[1]},0) === 0) fail('INVALID_GEOMETRY')
      // Unique vertices mean the minimum point token fixes the start in both directions.
      const tokens = points.map(point => JSON.stringify(point))
      let first = 0
      for (let i=1;i<tokens.length;i++) if (tokens[i] < tokens[first]) first = i
      const forward = [...points.slice(first),...points.slice(0,first)]
      const reverse = [forward[0],...forward.slice(1).reverse()]
      shape = ['polygon',JSON.stringify(forward) < JSON.stringify(reverse) ? forward : reverse]
    } else {
      if (!(hold.radius > 0) || q(hold.radius) === 0) fail('INVALID_GEOMETRY')
      shape = ['circle',q(hold.x),q(hold.y),q(hold.radius)]
    }
    const kind = hold.kind || 'hold'
    if (!['hold','volume'].includes(kind)) fail('INVALID_GEOMETRY')
    const fingerprint = await hash(JSON.stringify(['hold-v1',kind,shape]))
    if (byFingerprint[fingerprint]) fail('DUPLICATE_HOLD_GEOMETRY')
    byId[hold.id] = fingerprint; byFingerprint[fingerprint] = hold.id
  }
  const fingerprint = await hash(JSON.stringify(['wall-geometry-v1',Object.keys(byFingerprint).sort()]))
  return {geometryHash:fingerprint,idToHash:byId,hashToId:byFingerprint}
}
function metadata(wall, route) {
  if (!route || !Number.isInteger(route.angle) || route.angle < 0 || route.angle > 70 || route.angle % 5 !== 0 || !/^V(?:[0-9]|1[0-6])$/.test(route.grade)) fail('INVALID_ROUTE_METADATA')
  for (const [key,max] of [['name',80],['description',500]]) if (route[key] != null && (typeof route[key] !== 'string' || route[key].length > max)) fail('INVALID_ROUTE_METADATA')
  if (!route.holds || typeof route.holds !== 'object' || Array.isArray(route.holds) || Object.keys(route.holds).some(key=>!roles.includes(key))) fail('INVALID_ROUTE_HOLDS')
  const footRule = route.footRule || 'feet_follow'
  if (!['feet_follow','specified','all'].includes(footRule)) fail('INVALID_FOOT_RULE')
  return {angle:route.angle,grade:route.grade,footRule,name:route.name || '',description:route.description || ''}
}
async function exportRoute(wall, route, hash, preparedGeometry) {
  const g = preparedGeometry || await geometry(wall,hash), data = metadata(wall,route), holds = {}, seen = new Set()
  for (const role of roles) {
    const ids = route.holds?.[role] || []
    if (!Array.isArray(ids)) fail('INVALID_ROUTE_HOLDS')
    holds[role] = ids.map(id => {
      if (typeof id !== 'string' || !g.idToHash[id] || seen.has(id)) fail('INVALID_HOLD_ID')
      seen.add(id); return g.idToHash[id]
    }).sort()
  }
  if (!holds.start.length || !holds.finish.length || data.footRule === 'specified' && !holds.foot.length) fail('INVALID_ROUTE_HOLDS')
  const fingerprint = await hash(JSON.stringify(['route-v1',g.geometryHash,data.angle,data.grade,data.footRule,roles.map(role=>holds[role])]))
  return {fingerprint,...data,holds}
}
async function importRoute(wall, wire, hash, preparedGeometry) {
  const g = preparedGeometry || await geometry(wall,hash), data = metadata(wall,wire), holds = {}
  for (const role of roles) {
    if (!Array.isArray(wire.holds?.[role])) fail('INVALID_ROUTE_HOLDS')
    holds[role] = wire.holds[role].map(fp => typeof fp === 'string' && g.hashToId[fp] ? g.hashToId[fp] : fail('INVALID_HOLD_FINGERPRINT'))
  }
  const draft = {...data,holds}, computed = await exportRoute(wall,draft,hash,g)
  if (wire.fingerprint !== computed.fingerprint) fail('ROUTE_FINGERPRINT_MISMATCH')
  return draft
}
module.exports = {geometry,exportRoute,importRoute,roles}

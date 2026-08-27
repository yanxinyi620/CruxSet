const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const writeActions = new Set(['createWall', 'updateWall', 'createLayout', 'updateLayout', 'publishLayout', 'deleteLayout', 'deleteWall', 'deleteProblem'])
const validVisibility = value => value === 'public' ? 'public' : 'private'
const validHolds = holds => Array.isArray(holds) && holds.every(hold => hold && /^H\d{3,}$/.test(hold.id) && ['hold', 'volume'].includes(hold.kind) && Number.isFinite(hold.x) && hold.x >= 0 && hold.x <= 1 && Number.isFinite(hold.y) && hold.y >= 0 && hold.y <= 1 && Number.isFinite(hold.radius) && hold.radius > 0)

async function identity(db) {
  const { OPENID: openid } = cloud.getWXContext()
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const user = users.data[0]
  const admins = await db.collection('admins').where({ userId: user.id }).limit(1).get()
  return { user, isAdmin: admins.data.length > 0 }
}

async function wallAccess(db, id, actor) {
  const wall = (await db.collection('walls').doc(id).get()).data
  if (!wall) throw new Error('WALL_NOT_FOUND')
  if (wall.visibility === 'public' || wall.ownerId === actor.user.id || actor.isAdmin) return wall
  throw new Error('FORBIDDEN')
}

const owner = (wall, actor) => {
  if (wall.ownerId !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
}

exports.main = async event => {
  const db = cloud.database()
  const actor = await identity(db)
  const data = event.data || {}
  const action = event.action
  const now = Date.now()
  if (!action) throw new Error('INVALID_ACTION')

  if (action === 'listBrowseWalls') return (await db.collection('walls').where({ visibility: 'public' }).orderBy('name', 'asc').get()).data
  if (action === 'listMyWalls') return (await db.collection('walls').where({ ownerId: actor.user.id }).orderBy('updatedAt', 'desc').get()).data
  if (action === 'getWall') return wallAccess(db, data.id, actor)
  if (action === 'getLayout') {
    const rows = await db.collection('layouts').where(data.version === undefined ? { id: data.id } : { id: data.id, version: data.version }).orderBy('version', 'desc').limit(1).get()
    const layout = rows.data[0]
    if (!layout) throw new Error('LAYOUT_NOT_FOUND')
    await wallAccess(db, layout.wallId, actor)
    return layout
  }
  if (action === 'listLayouts') {
    const wall = await wallAccess(db, data.wallId, actor)
    const rows = await db.collection('layouts').where({ wallId: wall.id }).get()
    const latest = {}
    rows.data.forEach(layout => { if (!latest[layout.id] || latest[layout.id].version < layout.version) latest[layout.id] = layout })
    return Object.values(latest).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }
  if (action === 'listProblems') {
    const wall = await wallAccess(db, data.wallId, actor)
    const filter = { ...data }
    delete filter.wallId
    return (await db.collection('problems').where({ wallId: wall.id, ...filter }).orderBy('number', 'asc').get()).data
  }
  if (action === 'listMyProblems') return (await db.collection('problems').where({ createdBy: actor.user.id }).orderBy('createdAt', 'desc').get()).data
  if (action === 'getProblem') {
    const problem = (await db.collection('problems').doc(data.id).get()).data
    if (!problem) throw new Error('PROBLEM_NOT_FOUND')
    await wallAccess(db, problem.wallId, actor)
    return problem
  }
  if (!writeActions.has(action)) throw new Error('INVALID_ACTION')

  if (action === 'createWall') {
    if (!data.name) throw new Error('INVALID_WALL_DATA')
    const id = `wall_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const wall = { id, name: data.name, description: data.description || '', activeLayoutId: '', angleOptions: data.angleOptions || [20, 25, 30, 35, 40, 45], ownerId: actor.user.id, visibility: validVisibility(data.visibility), createdAt: now, updatedAt: now }
    await db.collection('walls').doc(id).set({ data: wall })
    return { id }
  }

  if (action === 'deleteProblem') {
    const problem = (await db.collection('problems').doc(data.id).get()).data
    if (!problem) throw new Error('PROBLEM_NOT_FOUND')
    if (problem.createdBy !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
    await db.collection('problems').doc(data.id).remove()
    return { ok: true }
  }
  const wall = await wallAccess(db, data.wallId || '', actor)
  owner(wall, actor)
  if (action === 'deleteLayout') {
    const rows = await db.collection('layouts').where({ id: data.layoutId, wallId: wall.id }).get()
    if (!rows.data.length) throw new Error('LAYOUT_NOT_FOUND')
    await db.collection('problems').where({ wallId: wall.id, layoutId: data.layoutId }).remove()
    await db.collection('layouts').where({ id: data.layoutId, wallId: wall.id }).remove()
    if (wall.activeLayoutId === data.layoutId) await db.collection('walls').doc(wall.id).update({ data: { activeLayoutId: '', updatedAt: now } })
    return { ok: true }
  }
  if (action === 'deleteWall') {
    await db.collection('problems').where({ wallId: wall.id }).remove()
    await db.collection('layouts').where({ wallId: wall.id }).remove()
    await db.collection('walls').doc(wall.id).remove()
    return { ok: true }
  }
  if (action === 'updateWall') {
    await db.collection('walls').doc(wall.id).update({ data: { name: data.name || wall.name, description: data.description ?? wall.description, visibility: data.visibility === undefined ? wall.visibility : validVisibility(data.visibility), updatedAt: now } })
    return { id: wall.id }
  }
  if (action === 'createLayout') {
    if (!data.name || !data.imageFileId || !Number.isFinite(data.imageWidth) || !Number.isFinite(data.imageHeight) || !validHolds(data.holds)) throw new Error('INVALID_LAYOUT_DATA')
    const id = `layout_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    await db.collection('layouts').doc(id).set({ data: { ...data, id, wallId: wall.id, version: 1, published: false, createdAt: now, updatedAt: now } })
    return { id, version: 1 }
  }
  const rows = await db.collection('layouts').where({ id: data.id }).orderBy('version', 'desc').limit(1).get()
  const layout = rows.data[0]
  if (!layout || layout.wallId !== wall.id || !validHolds(data.holds)) throw new Error('INVALID_LAYOUT_DATA')
  if (layout.published) throw new Error('LAYOUT_LOCKED')
  const update = { ...layout, ...data, id: layout.id, wallId: wall.id, version: (layout.version || 1) + 1, updatedAt: now, published: action === 'publishLayout' }
  await db.collection('layouts').add({ data: update })
  if (action === 'publishLayout') await db.collection('walls').doc(wall.id).update({ data: { visibility: 'public', updatedAt: now } })
  return { id: layout.id, version: update.version }
}

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const actions = new Set(['createWall', 'updateWallHolds', 'publishWall'])
const kinds = new Set(['hold', 'volume'])
const normalized = value => Number.isFinite(value) && value >= 0 && value <= 1
const holdsAreValid = holds => Array.isArray(holds) && new Set(holds.map(hold => hold?.id)).size === holds.length && holds.every(hold => hold && /^H\d{3,}$/.test(hold.id) && kinds.has(hold.kind) && normalized(hold.x) && normalized(hold.y) && Number.isFinite(hold.radius) && hold.radius > 0 && hold.radius <= 1)
const completeWall = data => data && typeof data === 'object' && typeof data.name === 'string' && data.name && typeof data.imageFileId === 'string' && data.imageFileId && Number.isFinite(data.imageWidth) && data.imageWidth > 0 && Number.isFinite(data.imageHeight) && data.imageHeight > 0 && ['circle', 'polygon'].includes(data.geometryType) && holdsAreValid(data.holds)

async function identity (db) {
  const { OPENID: openid } = cloud.getWXContext()
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const user = users.data[0]
  const admins = await db.collection('admins').where({ userId: user.id }).limit(1).get()
  return { user, isAdmin: admins.data.length > 0 }
}

const owner = (wall, actor) => {
  if (wall.ownerId !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
}

exports.main = async event => {
  const { action, data = {} } = event || {}
  if (!actions.has(action)) throw new Error('INVALID_ACTION')
  const db = cloud.database()
  const actor = await identity(db)
  const now = Date.now()

  if (action === 'createWall') {
    if (!completeWall(data)) throw new Error('INVALID_WALL_DATA')
    const id = `wall_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const wall = { ...data, id, description: data.description || '', angleOptions: data.angleOptions || [20, 25, 30, 35, 40, 45], ownerId: actor.user.id, visibility: 'private', createdAt: now, updatedAt: now }
    await db.collection('walls').doc(id).set({ data: wall })
    return { id }
  }

  const wall = (await db.collection('walls').doc(data.wallId).get()).data
  if (!wall) throw new Error('WALL_NOT_FOUND')
  owner(wall, actor)
  if (wall.visibility !== 'private') throw new Error('WALL_LOCKED')

  if (action === 'updateWallHolds') {
    if (!holdsAreValid(data.holds)) throw new Error('INVALID_WALL_HOLDS')
    await db.collection('walls').doc(wall.id).update({ data: { holds: data.holds, updatedAt: now } })
    return { id: wall.id }
  }
  if (!holdsAreValid(wall.holds) || wall.holds.length < 2) throw new Error('WALL_NOT_ROUTABLE')
  await db.collection('walls').doc(wall.id).update({ data: { visibility: 'public', updatedAt: now } })
  return { id: wall.id }
}

const cloud = require('wx-server-sdk')
const { completeWall, holdsAreValid, validateWallUpdate } = require('./validation')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const actions = new Set(['createWall', 'updateWall', 'updateWallHolds', 'publishWall'])

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
    const id = `wall_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const wall = { ...data, id, description: data.description || '', angleOptions: data.angleOptions || [20, 25, 30, 35, 40, 45], ownerId: actor.user.id, visibility: 'private', createdAt: now, updatedAt: now }
    if (!completeWall(wall)) throw new Error('INVALID_WALL_DATA')
    await db.collection('walls').doc(id).set({ data: wall })
    return wall
  }

  const wallId = data.wallId || data.id
  const wall = (await db.collection('walls').doc(wallId).get()).data
  if (!wall) throw new Error('WALL_NOT_FOUND')
  owner(wall, actor)
  if (wall.visibility !== 'private') throw new Error('WALL_LOCKED')

  if (action === 'updateWall' || action === 'updateWallHolds') {
    const patch = action === 'updateWallHolds' ? { holds: data.holds } : Object.fromEntries(['name', 'description', 'imageFileId', 'displayImageFileId', 'imageWidth', 'imageHeight', 'geometryType', 'holds', 'angleOptions'].filter(key => data[key] !== undefined).map(key => [key, data[key]]))
    const next = { ...wall, ...patch, id: wall.id, ownerId: wall.ownerId, visibility: 'private', createdAt: wall.createdAt, updatedAt: now }
    validateWallUpdate(wall, patch, action)
    await db.collection('walls').doc(wall.id).update({ data: next })
    return next
  }
  if (!holdsAreValid(wall.holds) || wall.holds.length < 2) throw new Error('WALL_NOT_ROUTABLE')
  const published = { ...wall, visibility: 'public', updatedAt: now }
  await db.collection('walls').doc(wall.id).update({ data: published })
  return published
}

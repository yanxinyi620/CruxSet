const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const allowedActions = new Set(['createWall', 'createLayout', 'updateLayout', 'publishLayout'])
const holdKinds = new Set(['hold', 'volume'])
const isNormalized = value => Number.isFinite(value) && value >= 0 && value <= 1
const validateHolds = holds => {
  if (!Array.isArray(holds)) throw new Error('INVALID_LAYOUT_HOLDS')
  const ids = new Set()
  holds.forEach(hold => {
    if (!hold || !/^H\d{3,}$/.test(hold.id) || ids.has(hold.id) || !holdKinds.has(hold.kind) || !isNormalized(hold.x) || !isNormalized(hold.y) || !Number.isFinite(hold.radius) || hold.radius <= 0 || hold.radius > 1) throw new Error('INVALID_LAYOUT_HOLDS')
    ids.add(hold.id)
  })
}
const validateLayoutData = data => {
  if (!data || typeof data !== 'object' || !data.wallId || !data.name || !data.imageFileId) throw new Error('INVALID_LAYOUT_DATA')
  validateHolds(data.holds)
}

exports.main = async event => {
  const db = cloud.database()
  const { OPENID: openid } = cloud.getWXContext()
  const user = await db.collection('users').where({ openid }).limit(1).get()
  if (!user.data.length) throw new Error('LOGIN_REQUIRED')
  const admin = await db.collection('admins').where({ userId: user.data[0].id }).limit(1).get()
  if (!admin.data.length) throw new Error('FORBIDDEN')
  if (!allowedActions.has(event.action)) throw new Error('INVALID_ACTION')
  const data = event.data || {}
  const now = Date.now()

  if (event.action === 'createWall') {
    if (!data.name) throw new Error('INVALID_WALL_DATA')
    const id = `wall_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    await db.collection('walls').doc(id).set({ data: { ...data, id, createdAt: now, updatedAt: now } })
    return { id }
  }
  if (event.action === 'createLayout') {
    validateLayoutData(data)
    const id = `layout_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    await db.collection('layouts').doc(id).set({ data: { ...data, id, version: 1, published: false, createdAt: now, updatedAt: now } })
    return { id, version: 1 }
  }

  validateLayoutData(data)
  if (!data.id) throw new Error('INVALID_LAYOUT_DATA')
  const layout = await db.collection('layouts').doc(data.id).get()
  if (!layout.data) throw new Error('LAYOUT_NOT_FOUND')
  const version = (layout.data.version || 1) + 1
  const update = { ...data, id: data.id, wallId: layout.data.wallId, version, updatedAt: now }
  if (event.action === 'publishLayout') update.published = true
  await db.collection('layouts').doc(data.id).update({ data: update })
  return { id: data.id, version, published: Boolean(update.published || layout.data.published) }
}

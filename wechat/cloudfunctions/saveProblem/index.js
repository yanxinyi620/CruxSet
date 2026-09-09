const cloud = require('wx-server-sdk')
const { validateRouteMetadata } = require('./validation.js')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const validGrades = new Set(Array.from({ length: 17 }, (_, i) => `V${i}`))
const roles = ['start', 'foot', 'hand', 'assist', 'finish']

exports.main = async event => {
  const { OPENID: openid } = cloud.getWXContext()
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const actor = users.data[0]
  const { draft = {}, wallId } = event || {}
  validateRouteMetadata(draft)
  const wall = (await db.collection('walls').doc(wallId).get()).data
  if (!wall || wall.visibility !== 'public' || !Array.isArray(wall.holds) || wall.holds.length < 2) throw new Error('WALL_NOT_ROUTABLE')
  if (!Array.isArray(wall.angleOptions) || !wall.angleOptions.includes(draft.angle) || !validGrades.has(draft.grade)) throw new Error('INVALID_ROUTE_METADATA')
  const footRule = draft.footRule || 'feet_follow'
  if (!['feet_follow', 'specified', 'all'].includes(footRule)) throw new Error('INVALID_FOOT_RULE')
  const holds = Object.fromEntries(roles.map(role => [role, [...(draft.holds?.[role] || [])]]))
  if (!holds.start.length || !holds.finish.length || (footRule === 'specified' && !holds.foot.length)) throw new Error('INVALID_ROUTE_HOLDS')
  const ids = Object.values(holds).flat()
  const known = new Set(wall.holds.map(hold => hold.id))
  if (new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) throw new Error('INVALID_HOLD_ID')
  const id = `problem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  let number
  await db.runTransaction(async transaction => {
    const walls = (await transaction.collection('walls').get()).data
    const numbered = walls.filter(item => Number.isInteger(item.wallNumber) && item.wallNumber > 0)
    const missing = walls.filter(item => !Number.isInteger(item.wallNumber) || item.wallNumber <= 0).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)))
    let nextWallNumber = Math.max(0, ...numbered.map(item => item.wallNumber)) + 1
    for (const item of missing) {
      item.wallNumber = nextWallNumber
      await transaction.collection('walls').doc(item.id).update({ data: { wallNumber: nextWallNumber } })
      nextWallNumber += 1
    }
    const targetWallNumber = walls.find(item => item.id === wallId)?.wallNumber
    if (!targetWallNumber) throw new Error('WALL_NUMBER_UNAVAILABLE')
    const problems = (await transaction.collection('problems').where({ wallId }).get()).data
    const routeNumber = Math.max(0, ...problems.map(item => Number(String(item.number || '').slice(-4))).filter(Number.isInteger)) + 1
    number = `CS-${String(targetWallNumber).padStart(2, '0')}${String(routeNumber).padStart(4, '0')}`
    await transaction.collection('problems').doc(id).set({ data: { ...draft, id, number, wallId, footRule, holds, createdBy: actor.id, createdAt: now, updatedAt: now } })
  })
  return { id, number }
}

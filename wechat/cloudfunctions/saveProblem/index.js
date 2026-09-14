const { all, find, nextWallNumber, bootstrapWallNumbers } = require('./database.js')
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
  if (!wall || wall.deleting || wall.visibility !== 'public' || !Array.isArray(wall.holds) || wall.holds.length < 2) throw new Error('WALL_NOT_ROUTABLE')
  if (!Number.isInteger(draft.angle) || draft.angle < 0 || draft.angle > 70 || draft.angle % 5 !== 0 || !validGrades.has(draft.grade)) throw new Error('INVALID_ROUTE_METADATA')
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
  const observedMax = await bootstrapWallNumbers(db)
  await db.runTransaction(async transaction => {
    const currentWall = await find(transaction, 'walls', wallId)
    if (!currentWall || currentWall.deleting || currentWall.visibility !== 'public') throw new Error('WALL_NOT_ROUTABLE')
    const problems = await all(db.collection('problems').where({ wallId }))
    const observedRouteMax = Math.max(0, ...problems.map(item => Number(String(item.number || '').slice(-4))).filter(Number.isInteger))
    let targetWallNumber = currentWall.wallNumber
    if (!targetWallNumber) {
      targetWallNumber = await nextWallNumber(transaction, observedMax, db)
      await transaction.collection('walls').doc(wallId).update({ data: { wallNumber: targetWallNumber } })
    }
    // Both deletion and route writes change this document, creating a transaction conflict.
    await transaction.collection('walls').doc(wallId).update({ data: { routeRevision: (currentWall.routeRevision || 0) + 1 } })
    const counterId = `routes_${wallId}`
    const routeNumber = observedRouteMax + 1
    if (routeNumber > 9999) throw new Error('ROUTE_NUMBER_EXHAUSTED')
    await transaction.collection('counters').doc(counterId).set({ data: { id: counterId, value: routeNumber } })
    number = `CS-${String(targetWallNumber).padStart(2, '0')}${String(routeNumber).padStart(4, '0')}`
    await transaction.collection('problems').doc(id).set({ data: { name: draft.name || '', description: draft.description || '', angle: draft.angle, grade: draft.grade, id, number, wallId, footRule, holds, createdBy: actor.id, createdAt: now, updatedAt: now } })
  })
  return { id, number }
}

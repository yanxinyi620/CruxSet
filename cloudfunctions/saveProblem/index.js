const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const validGrades = new Set(Array.from({ length: 13 }, (_, i) => `V${i}`))
const roles = ['start', 'foot', 'hand', 'assist', 'finish']

exports.main = async event => {
  const { OPENID: openid } = cloud.getWXContext()
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const actor = users.data[0]
  const { draft = {}, wallId } = event || {}
  const wall = (await db.collection('walls').doc(wallId).get()).data
  if (!wall || wall.visibility !== 'public' || !Array.isArray(wall.holds) || wall.holds.length < 2) throw new Error('WALL_NOT_ROUTABLE')
  if (!Array.isArray(wall.angleOptions) || !wall.angleOptions.includes(draft.angle) || !validGrades.has(draft.grade) || (draft.description && draft.description.length > 500)) throw new Error('INVALID_ROUTE_METADATA')
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
    const counter = await transaction.collection('counters').doc('problem_number').get()
    const next = (counter.data?.value || 0) + 1
    number = `CS-${String(next).padStart(6, '0')}`
    await transaction.collection('counters').doc('problem_number').set({ data: { value: next } })
    await transaction.collection('problems').doc(id).set({ data: { ...draft, id, number, wallId, footRule, holds, createdBy: actor.id, createdAt: now, updatedAt: now } })
  })
  return { id, number }
}

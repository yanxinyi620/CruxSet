const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const validGrades = new Set(Array.from({ length: 13 }, (_, i) => `V${i}`))
const roles = ['start', 'foot', 'hand', 'assist', 'finish']
exports.main = async event => {
  const { OPENID: openid } = cloud.getWXContext()
  const user = await db.collection('users').where({ openid }).limit(1).get()
  if (!user.data.length) throw new Error('LOGIN_REQUIRED')
  const actor = user.data[0]; const { draft, wallId, layoutId } = event
  const [wallResult, layoutResult] = await Promise.all([db.collection('walls').doc(wallId).get(), db.collection('layouts').where({ id: layoutId }).orderBy('version', 'desc').limit(1).get()])
  const wall = wallResult.data; const layout = layoutResult.data[0]
  if (!wall || !layout || layout.wallId !== wallId) throw new Error('INVALID_WALL_LAYOUT')
  if (!layout.published || layout.holds.length < 2) throw new Error('LAYOUT_NOT_ROUTABLE')
  const admins = await db.collection('admins').where({ userId: actor.id }).limit(1).get()
  if (wall.ownerId !== actor.id && wall.visibility !== 'public' && !admins.data.length) throw new Error('FORBIDDEN')
  if (!wall.angleOptions.includes(draft.angle) || !validGrades.has(draft.grade) || (draft.description && draft.description.length > 500)) throw new Error('INVALID_ROUTE_METADATA')
  if (!['feet_follow', 'specified', 'all'].includes(draft.footRule || 'feet_follow')) throw new Error('INVALID_FOOT_RULE')
  const holds = Object.fromEntries(roles.map(role => [role, [...(draft.holds?.[role] || [])]]))
  if (!holds.start.length || !holds.finish.length || (draft.footRule === 'specified' && !holds.foot.length)) throw new Error('INVALID_ROUTE_HOLDS')
  const ids = Object.values(holds).flat(); const known = new Set(layout.holds.map(hold => hold.id))
  if (new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) throw new Error('INVALID_HOLD_ID')
  const id = `problem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; const now = Date.now(); let number
  await db.runTransaction(async transaction => { const counter = await transaction.collection('counters').doc('problem_number').get(); const next = (counter.data?.value || 0) + 1; number = `CS-${String(next).padStart(6, '0')}`; await transaction.collection('counters').doc('problem_number').set({ data: { value: next } }); await transaction.collection('problems').doc(id).set({ data: { ...draft, id, number, wallId, layoutId, layoutVersion: layout.version, footRule: draft.footRule || 'feet_follow', holds, createdBy: actor.id, createdAt: now, updatedAt: now } }) })
  return { id, number }
}

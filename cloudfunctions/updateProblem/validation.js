const validGrades = new Set(Array.from({ length: 13 }, (_, i) => `V${i}`))
const roles = ['start', 'foot', 'hand', 'assist', 'finish']

function fail (code) { throw new Error(code) }

/** Validate and normalize an owner update without allowing immutable fields through. */
function validateProblemUpdate (existing, wall, draft, actorId) {
  if (!existing || existing.createdBy !== actorId) fail('FORBIDDEN')
  if (!wall || wall.visibility !== 'public' || !Array.isArray(wall.holds) || wall.holds.length < 2) fail('WALL_NOT_ROUTABLE')
  if (!draft || !Array.isArray(wall.angleOptions) || !wall.angleOptions.includes(draft.angle) || !validGrades.has(draft.grade) || (draft.description !== undefined && (typeof draft.description !== 'string' || draft.description.length > 500))) fail('INVALID_ROUTE_METADATA')
  if (draft.name !== undefined && (typeof draft.name !== 'string' || draft.name.length > 80)) fail('INVALID_ROUTE_METADATA')
  const footRule = draft.footRule || 'feet_follow'
  if (!['feet_follow', 'specified', 'all'].includes(footRule)) fail('INVALID_FOOT_RULE')
  const holds = Object.fromEntries(roles.map(role => [role, [...(draft.holds?.[role] || [])]]))
  if (!holds.start.length || !holds.finish.length || (footRule === 'specified' && !holds.foot.length)) fail('INVALID_ROUTE_HOLDS')
  if (roles.some(role => !Array.isArray(draft.holds?.[role])) || Object.values(holds).some(ids => ids.some(id => typeof id !== 'string'))) fail('INVALID_ROUTE_HOLDS')
  const ids = Object.values(holds).flat()
  const known = new Set(wall.holds.map(hold => hold && hold.id).filter(Boolean))
  if (new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) fail('INVALID_HOLD_ID')
  return {
    id: existing.id, number: existing.number, wallId: existing.wallId,
    name: draft.name || '', description: draft.description || '', angle: draft.angle,
    grade: draft.grade, footRule, holds, createdBy: existing.createdBy,
    createdAt: existing.createdAt, updatedAt: Date.now()
  }
}

module.exports = { validateProblemUpdate }

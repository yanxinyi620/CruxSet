const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

async function identity (db) {
  const { OPENID: openid } = cloud.getWXContext()
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const user = users.data[0]
  const admins = await db.collection('admins').where({ userId: user.id }).limit(1).get()
  return { user, isAdmin: admins.data.length > 0 }
}

async function wallAccess (db, id, actor) {
  const wall = (await db.collection('walls').doc(id).get()).data
  if (!wall) throw new Error('WALL_NOT_FOUND')
  if (wall.visibility === 'public' || wall.ownerId === actor.user.id || actor.isAdmin) return wall
  throw new Error('FORBIDDEN')
}

exports.main = async event => {
  const db = cloud.database()
  const actor = await identity(db)
  const { action, data = {} } = event || {}
  if (action === 'listBrowseWalls') return (await db.collection('walls').where({ visibility: 'public' }).orderBy('name', 'asc').get()).data.filter(wall => Array.isArray(wall.holds) && wall.holds.length >= 2)
  if (action === 'listMyWalls') return (await db.collection('walls').where({ ownerId: actor.user.id }).orderBy('updatedAt', 'desc').get()).data
  if (action === 'getWall') return wallAccess(db, data.id, actor)
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
  if (action === 'deleteProblem') {
    const problem = (await db.collection('problems').doc(data.id).get()).data
    if (!problem) throw new Error('PROBLEM_NOT_FOUND')
    if (problem.createdBy !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
    await db.collection('problems').doc(data.id).remove()
    return { ok: true }
  }
  if (action !== 'deleteWall') throw new Error('INVALID_ACTION')
  const wall = await wallAccess(db, data.wallId, actor)
  if (wall.ownerId !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
  const problems = await db.collection('problems').where({ wallId: wall.id }).limit(1).get()
  if (problems.data.length) throw new Error('WALL_IN_USE')
  await db.collection('walls').doc(wall.id).remove()
  return { ok: true }
}

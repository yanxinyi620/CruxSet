const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function makeSafeSession (user, isAdmin) {
  return { userId: user.id, isAdmin: isAdmin === true, displayName: user.displayName || '' }
}

function validateDisplayName (displayName) {
  const value = typeof displayName === 'string' ? displayName.trim() : ''
  if (!value || value.length > 40) throw new Error('INVALID_INPUT')
  return value
}

function withSafeSetterName (problem, user) {
  const { createdBy, openid, unionid, setterName, ...publicProblem } = problem
  return { ...publicProblem, setterName: user && user.displayName ? user.displayName.trim() : '用户' }
}

module.exports.makeSafeSession = makeSafeSession
module.exports.validateDisplayName = validateDisplayName
module.exports.withSafeSetterName = withSafeSetterName

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

async function imageStillReferenced (db, fileId) {
  if (!fileId || !fileId.startsWith('cloud://')) return false
  const [primary, display] = await Promise.all([
    db.collection('walls').where({ imageFileId: fileId }).limit(1).get(),
    db.collection('walls').where({ displayImageFileId: fileId }).limit(1).get(),
  ])
  return primary.data.length > 0 || display.data.length > 0
}

exports.main = async event => {
  const db = cloud.database()
  const actor = await identity(db)
  const { action, data = {} } = event || {}
  if (action === 'getSession') return makeSafeSession(actor.user, actor.isAdmin)
  if (action === 'updateProfile') {
    const displayName = validateDisplayName(data.displayName)
    const updatedAt = Date.now()
    await db.collection('users').where({ id: actor.user.id }).update({ data: { displayName, updatedAt } })
    return makeSafeSession({ ...actor.user, displayName }, actor.isAdmin)
  }
  if (action === 'listBrowseWalls') return (await db.collection('walls').where({ visibility: 'public' }).orderBy('name', 'asc').get()).data.filter(wall => Array.isArray(wall.holds) && wall.holds.length >= 2)
  if (action === 'listMyWalls') return (await db.collection('walls').where({ ownerId: actor.user.id }).orderBy('updatedAt', 'desc').get()).data
  if (action === 'listAdminWalls') {
    if (!actor.isAdmin) throw new Error('FORBIDDEN')
    return (await db.collection('walls').orderBy('updatedAt', 'desc').get()).data
  }
  if (action === 'getWall') return wallAccess(db, data.id, actor)
  if (action === 'listProblems') {
    const wall = await wallAccess(db, data.wallId, actor)
    const filter = { ...data }
    delete filter.wallId
    const problems = (await db.collection('problems').where({ wallId: wall.id, ...filter }).orderBy('number', 'asc').get()).data
    return Promise.all(problems.map(async problem => withSafeSetterName(problem, await findUser(db, problem.createdBy))))
  }
  if (action === 'listMyProblems') return (await db.collection('problems').where({ createdBy: actor.user.id }).orderBy('createdAt', 'desc').get()).data
  if (action === 'getProblem') {
    const problem = (await db.collection('problems').doc(data.id).get()).data
    if (!problem) throw new Error('PROBLEM_NOT_FOUND')
    await wallAccess(db, problem.wallId, actor)
    return withSafeSetterName(problem, await findUser(db, problem.createdBy))
  }
  if (action === 'deleteProblem') {
    const problem = (await db.collection('problems').doc(data.id).get()).data
    if (!problem) throw new Error('PROBLEM_NOT_FOUND')
    if (problem.createdBy !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
    await db.collection('problems').doc(data.id).remove()
    return { ok: true }
  }
  if (action !== 'deleteWall') throw new Error('INVALID_ACTION')
  if (!actor.isAdmin) throw new Error('FORBIDDEN')
  const wall = await wallAccess(db, data.wallId, actor)
  const problems = await db.collection('problems').where({ wallId: wall.id }).limit(1).get()
  if (problems.data.length) throw new Error('WALL_IN_USE')
  const files = [...new Set([wall.imageFileId, wall.displayImageFileId].filter(fileId => typeof fileId === 'string' && fileId.startsWith('cloud://')))]
  await db.collection('walls').doc(wall.id).remove()
  const orphaned = []
  for (const fileId of files) if (!(await imageStillReferenced(db, fileId))) orphaned.push(fileId)
  if (orphaned.length) await cloud.deleteFile({ fileList: orphaned })
  return { ok: true }
}

async function findUser (db, id) {
  if (!id) return null
  return (await db.collection('users').where({ id }).limit(1).get()).data[0] || null
}

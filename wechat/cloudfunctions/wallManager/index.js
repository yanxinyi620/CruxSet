const { all, find } = require('./database.js')
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
  const { createdBy, openid, _openid, unionid, setterName, ...publicProblem } = problem
  return { ...publicProblem, setterName: user && user.displayName ? user.displayName.trim() : '用户' }
}

module.exports.makeSafeSession = makeSafeSession
module.exports.validateDisplayName = validateDisplayName
module.exports.withSafeSetterName = withSafeSetterName

function managementWallSummary(wall) {
  return {
    id: wall.id, name: wall.name, wallNumber: wall.wallNumber,
    ownerId: wall.ownerId, visibility: wall.visibility,
    holdCount: Array.isArray(wall.holds) ? wall.holds.length : 0,
    deleting: !!wall.deleting, createdAt: wall.createdAt, updatedAt: wall.updatedAt,
  }
}

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
  if (!wall || wall.deleting) throw new Error('WALL_NOT_FOUND')
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
  if (action === 'listBrowseWalls') {
    const walls = (await all(db.collection('walls').where({ visibility: 'public' }).orderBy('name', 'asc'))).filter(wall => !wall.deleting && Array.isArray(wall.holds) && wall.holds.length >= 2)
    // Count in the database so pagination never truncates the displayed total.
    for (let offset = 0; offset < walls.length; offset += 10) {
      await Promise.all(walls.slice(offset, offset + 10).map(async wall => {
        const result = await db.collection('problems').where({ wallId: wall.id }).count()
        wall.problemCount = result.total
      }))
    }
    return walls.map(wall => ({
      id: wall.id, name: wall.name, wallNumber: wall.wallNumber,
      visibility: wall.visibility, holdCount: wall.holds.length,
      problemCount: wall.problemCount,
    }))
  }
  if (action === 'listMyWalls') return (await all(db.collection('walls').where({ ownerId: actor.user.id }).orderBy('updatedAt', 'desc'))).map(managementWallSummary)
  if (action === 'listAdminWalls') {
    if (!actor.isAdmin) throw new Error('FORBIDDEN')
    return (await all(db.collection('walls').orderBy('updatedAt', 'desc'))).map(managementWallSummary)
  }
  if (action === 'getWall') return wallAccess(db, data.id, actor)
  if (action === 'listProblems') {
    const wall = await wallAccess(db, data.wallId, actor)
    const filter = {}
    for (const key of ['angle', 'grade']) if (data[key] !== undefined && data[key] !== '') filter[key] = data[key]
    const problems = await all(db.collection('problems').where({ wallId: wall.id, ...filter }).orderBy('number', 'asc'))
    return Promise.all(problems.map(async problem => withSafeSetterName(problem, await findUser(db, problem.createdBy))))
  }
  if (action === 'listMyProblems') {
    const problems = await all(db.collection('problems').where({ createdBy: actor.user.id }).orderBy('createdAt', 'desc'))
    return problems.map(problem => withSafeSetterName(problem, actor.user))
  }
  if (action === 'listUsers') {
    if (!actor.isAdmin) throw new Error('FORBIDDEN')
    const admins = new Set((await all(db.collection('admins'))).map(a => a.userId))
    return (await all(db.collection('users'))).map(u => ({ id: u.id, displayName: u.displayName || '', isAdmin: admins.has(u.id), createdAt: u.createdAt }))
  }
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
  if (action === 'retryCleanup') {
    if (!actor.isAdmin) throw new Error('FORBIDDEN')
    const jobs = await all(db.collection('wallDeletionJobs'))
    for (const job of jobs) if (!job.completed) await finishDeletion(db, job)
    return { ok: true }
  }
  if (!['deleteWall', 'inspectWallDeletion'].includes(action)) throw new Error('INVALID_ACTION')
  const wall = await find(db, 'walls', data.wallId)
  const previousJob = await find(db, 'wallDeletionJobs', data.wallId)
  if (!wall && !previousJob) throw new Error('WALL_NOT_FOUND')
  if ((wall || previousJob).ownerId !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
  if (action === 'inspectWallDeletion') return { problemCount: (await all(db.collection('problems').where({ wallId: data.wallId }))).length }
  let job = previousJob
  await db.runTransaction(async tx => {
    const current = await find(tx, 'walls', data.wallId)
    if (!current) {
      job = await find(tx, 'wallDeletionJobs', data.wallId)
      if (!job) throw new Error('WALL_NOT_FOUND')
      if (job.ownerId !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
      return
    }
    if (current.ownerId !== actor.user.id && !actor.isAdmin) throw new Error('FORBIDDEN')
    await tx.collection('walls').doc(current.id).update({ data: { deleting: true } })
    job = { id: current.id, ownerId: current.ownerId, files: [...new Set([current.imageFileId, current.displayImageFileId].filter(f => typeof f === 'string' && f.startsWith('cloud://')))], completed: false, createdAt: Date.now() }
    await tx.collection('wallDeletionJobs').doc(job.id).set({ data: job })

  })
  return finishDeletion(db, job)
}

async function finishDeletion (db, job) {
  if (job.completed) return { ok: true }
  let wallRemoved = false
  try {
    // Always restart at the first page: removing rows shifts later offsets.
    for (let batch = 0; batch < 20; batch++) {
      const problems = (await db.collection('problems').where({ wallId: job.id }).limit(100).get()).data
      if (!problems.length) break
      for (const problem of problems) await db.collection('problems').doc(problem.id || problem._id).remove()
    }
    if ((await db.collection('problems').where({ wallId: job.id }).limit(1).get()).data.length) return { ok: true, cleanupPending: true, deletionPending: true }
    for (const receipt of await all(db.collection('segmentationPublishes').where({ wallId: job.id }))) {
      await db.collection('segmentationPublishes').doc(receipt.id || receipt._id).update({ data: { deleted: true } })
    }
    await db.collection('walls').doc(job.id).remove()
    wallRemoved = true
    for (const fileId of job.files) {
      if (await imageStillReferenced(db, fileId)) continue
      const result = await cloud.deleteFile({ fileList: [fileId] })
      if (result.fileList?.some(file => file.status !== 0 && file.status !== -503003)) throw new Error('FILE_CLEANUP_FAILED')
    }
    await db.collection('wallDeletionJobs').doc(job.id).update({ data: { completed: true, completedAt: Date.now() } })
    return { ok: true }
  } catch (error) {
    await db.collection('wallDeletionJobs').doc(job.id).update({ data: { lastError: String(error.message || error).slice(0, 200), updatedAt: Date.now() } })
    return { ok: true, cleanupPending: true, ...(!wallRemoved ? { deletionPending: true } : {}) }
  }
}

async function findUser (db, id) {
  if (!id) return null
  return (await db.collection('users').where({ id }).limit(1).get()).data[0] || null
}

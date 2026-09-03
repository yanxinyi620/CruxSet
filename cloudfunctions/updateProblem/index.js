const cloud = require('wx-server-sdk')
const { validateProblemUpdate } = require('./validation.js')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async event => {
  const { OPENID: openid } = cloud.getWXContext()
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const actor = users.data[0]
  const { id, draft = {} } = event || {}
  const existing = (await db.collection('problems').doc(id).get()).data
  if (!existing) throw new Error('PROBLEM_NOT_FOUND')
  const wall = (await db.collection('walls').doc(existing.wallId).get()).data
  const updated = validateProblemUpdate(existing, wall, draft, actor.id)
  await db.collection('problems').doc(existing.id).update({ data: updated })
  return { id: updated.id, number: updated.number }
}

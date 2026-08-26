const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext()
  const existing = await db.collection('users').where({ openid }).limit(1).get()
  if (existing.data.length) return { userId: existing.data[0].id }
  const now = Date.now(); const user = { id: `usr_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`, openid, createdAt: now, updatedAt: now }
  await db.collection('users').add({ data: user })
  return { userId: user.id }
}

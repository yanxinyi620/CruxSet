const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const findLayoutByImage = async (db, fileID) => {
  const primary = await db.collection('layouts').where({ imageFileId: fileID }).orderBy('version', 'desc').limit(1).get()
  if (primary.data.length) return primary.data[0]
  const display = await db.collection('layouts').where({ displayImageFileId: fileID }).orderBy('version', 'desc').limit(1).get()
  return display.data[0]
}

const identity = async (db, openid) => {
  const users = await db.collection('users').where({ openid }).limit(1).get()
  if (!users.data.length) throw new Error('LOGIN_REQUIRED')
  const user = users.data[0]
  const admins = await db.collection('admins').where({ userId: user.id }).limit(1).get()
  return { user, isAdmin: admins.data.length > 0 }
}

exports.main = async event => {
  const fileID = event?.fileID
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://')) throw new Error('INVALID_FILE_ID')

  const db = cloud.database()
  const layout = await findLayoutByImage(db, fileID)
  if (!layout) throw new Error('LAYOUT_IMAGE_NOT_FOUND')

  if (!layout.published) {
    const { OPENID: openid } = cloud.getWXContext()
    const actor = await identity(db, openid)
    const wall = (await db.collection('walls').doc(layout.wallId).get()).data
    if (!actor.isAdmin && wall?.ownerId !== actor.user.id) throw new Error('FORBIDDEN')
  }

  const result = await cloud.getTempFileURL({ fileList: [fileID] })
  const url = result.fileList?.[0]?.tempFileURL
  if (!url) throw new Error('TEMP_URL_UNAVAILABLE')
  return { url }
}

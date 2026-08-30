const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const findWallByImage = async (db, fileID) => {
  const primary = await db.collection('walls').where({ imageFileId: fileID }).limit(1).get()
  if (primary.data.length) return primary.data[0]
  const display = await db.collection('walls').where({ displayImageFileId: fileID }).limit(1).get()
  return display.data[0]
}

exports.main = async event => {
  const fileID = event?.fileID
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://')) throw new Error('INVALID_FILE_ID')
  const db = cloud.database()
  const wall = await findWallByImage(db, fileID)
  if (!wall) throw new Error('WALL_IMAGE_NOT_FOUND')
  if (wall.visibility !== 'public') {
    const { OPENID: openid } = cloud.getWXContext()
    const users = await db.collection('users').where({ openid }).limit(1).get()
    if (!users.data.length) throw new Error('LOGIN_REQUIRED')
    const admins = await db.collection('admins').where({ userId: users.data[0].id }).limit(1).get()
    if (!admins.data.length && wall.ownerId !== users.data[0].id) throw new Error('FORBIDDEN')
  }
  const result = await cloud.getTempFileURL({ fileList: [fileID] })
  const url = result.fileList?.[0]?.tempFileURL
  if (!url) throw new Error('TEMP_URL_UNAVAILABLE')
  return { url }
}

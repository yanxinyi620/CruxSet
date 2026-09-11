const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const findWallsByImage = async (db, fileID) => {
  const walls = []
  for (const field of ['imageFileId', 'displayImageFileId']) {
    for (let offset = 0; ; offset += 100) {
      const page = (await db.collection('walls').where({ [field]: fileID }).skip(offset).limit(100).get()).data
      walls.push(...page.filter(wall => !wall.deleting))
      if (page.length < 100) break
    }
  }
  return walls
}

exports.main = async event => {
  const fileID = event?.fileID
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://')) throw new Error('INVALID_FILE_ID')
  const db = cloud.database()
  const walls = await findWallsByImage(db, fileID)
  if (!walls.length) throw new Error('WALL_IMAGE_NOT_FOUND')
  if (!walls.some(wall => wall.visibility === 'public')) {
    const { OPENID: openid } = cloud.getWXContext()
    const users = await db.collection('users').where({ openid }).limit(1).get()
    if (!users.data.length) throw new Error('LOGIN_REQUIRED')
    const admins = await db.collection('admins').where({ userId: users.data[0].id }).limit(1).get()
    if (!admins.data.length && !walls.some(wall => wall.ownerId === users.data[0].id)) throw new Error('FORBIDDEN')
  }
  const result = await cloud.getTempFileURL({ fileList: [fileID] })
  const url = result.fileList?.[0]?.tempFileURL
  if (!url) throw new Error('TEMP_URL_UNAVAILABLE')
  return { url }
}

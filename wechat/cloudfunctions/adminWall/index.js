const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { all, find, nextWallNumber, bootstrapWallNumbers } = require('./database.js')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const fail = code => { throw new Error(code) }
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const requestKey = (owner, request) => {
  if (typeof request !== 'string' || !request || request.length > 128) fail('INVALID_REQUEST_ID')
  return digest(`${owner}:${request}`)
}
function imageInfo (data) {
  if (!['image/png', 'image/jpeg'].includes(data.contentType) || typeof data.base64 !== 'string' || data.base64.length > Math.ceil(2 * 1024 * 1024 / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)) fail('INVALID_IMAGE')
  const bytes = Buffer.from(data.base64, 'base64')
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) fail('INVALID_IMAGE')
  let width, height
  if (data.contentType === 'image/png') {
    if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString() !== 'IHDR') fail('INVALID_IMAGE')
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
  } else {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) fail('INVALID_IMAGE')
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) fail('INVALID_IMAGE')
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 218 || marker === 217) break
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) fail('INVALID_IMAGE')
      if ([192, 193, 194].includes(marker)) { if (length < 8) fail('INVALID_IMAGE'); height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break }
      offset += length
    }
  }
  if (!width || !height || width > 10000 || height > 10000 || width * height > 16000000) fail('INVALID_IMAGE')
  try {
    if (data.contentType === 'image/png') require('pngjs').PNG.sync.read(bytes, { checkCRC: true })
    else {
      const orientation = require('exif-parser').create(bytes).parse().tags.Orientation
      if (orientation !== undefined && orientation !== 1) fail('INVALID_IMAGE_ORIENTATION')
      require('jpeg-js').decode(bytes, { maxResolutionInMP: 16, maxMemoryUsageInMB: 128, tolerantDecoding: false })
    }
  } catch (error) {
    if (error.message === 'INVALID_IMAGE_ORIENTATION') throw error
    fail('INVALID_IMAGE')
  }
  return { bytes, imageWidth: width, imageHeight: height }
}
function holdsFor (holds) {
  if (!Array.isArray(holds) || holds.length > 2000) fail('INVALID_HOLDS')
  const ids = new Set()
  return holds.map(h => {
    if (!h || typeof h.id !== 'string' || !/^H\d{3,}$/.test(h.id) || ids.has(h.id) || ![h.x, h.y, h.radius].every(Number.isFinite) || h.x < 0 || h.x > 1 || h.y < 0 || h.y > 1 || h.radius <= 0 || h.radius > 1) fail('INVALID_HOLDS')
    if (h.kind !== undefined && !['hold', 'volume'].includes(h.kind)) fail('INVALID_HOLDS')
    ids.add(h.id)
    const result = { id: h.id, x: h.x, y: h.y, radius: h.radius, kind: h.kind || 'hold' }
    if (h.polygon !== undefined) {
      if (!Array.isArray(h.polygon) || h.polygon.length < 3 || h.polygon.length > 256 || h.polygon.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1))) fail('INVALID_HOLDS')
      const area = Math.abs(h.polygon.reduce((sum, point, index) => {
        const next = h.polygon[(index + 1) % h.polygon.length]
        return sum + point[0] * next[1] - next[0] * point[1]
      }, 0)) / 2
      if (area < 1e-8) fail('INVALID_HOLDS')
      const xs = h.polygon.map(point => point[0])
      const ys = h.polygon.map(point => point[1])
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      if (h.bbox !== undefined && (!Array.isArray(h.bbox) || h.bbox.length !== 4 || h.bbox.some((value, index) => !Number.isFinite(value) || Math.abs(value - bbox[index]) > 1e-9))) fail('INVALID_HOLDS')
      result.polygon = h.polygon.map(point => [...point])
      result.bbox = bbox
    } else if (h.bbox !== undefined) fail('INVALID_HOLDS')
    return result
  })
}
exports.main = async event => {
  const db = cloud.database()
  const { OPENID } = cloud.getWXContext()
  const actor = (await db.collection('users').where({ openid: OPENID }).limit(1).get()).data[0]
  if (!actor) fail('LOGIN_REQUIRED')
  if (!(await db.collection('admins').where({ userId: actor.id }).limit(1).get()).data.length) fail('FORBIDDEN')
  const { action, data = {} } = event || {}
  if (action === 'listDrafts') return (await all(db.collection('walls').where({ ownerId: actor.id, visibility: 'private' }).orderBy('updatedAt', 'desc'))).filter(w => !w.deleting && !w.published)
  if (action === 'uploadImage') {
    const id = requestKey(actor.id, data.requestId)
    const info = imageInfo(data)
    const fingerprint = digest(info.bytes)
    let existing
    const cloudPath = `admin-wall-images/${id}.${data.contentType === 'image/png' ? 'png' : 'jpg'}`
    await db.runTransaction(async tx => {
      existing = await find(tx, 'adminUploads', id)
      if (existing) {
        if (existing.fingerprint !== fingerprint) fail('UPLOAD_REQUEST_CONFLICT')
        if (existing.reclaiming || existing.expiresAt < Date.now()) fail('UPLOAD_EXPIRED')
        return
      }
      await tx.collection('adminUploads').doc(id).set({ data: { id, ownerId: actor.id, fingerprint, cloudPath, expiresAt: Date.now() + 86400000, imageWidth: info.imageWidth, imageHeight: info.imageHeight } })
    })
    if (existing?.fileID) return { fileID: existing.fileID, imageWidth: existing.imageWidth, imageHeight: existing.imageHeight }
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: info.bytes })
    let expired = false
    await db.runTransaction(async tx => {
      const current = await find(tx, 'adminUploads', id)
      if (!current || current.reclaiming || current.expiresAt < Date.now()) { expired = true; return }
      await tx.collection('adminUploads').doc(id).update({ data: { fileID: uploaded.fileID } })
    })
    if (expired) {
      // Persist the returned identity before attempting cleanup: network failure is retryable.
      await db.collection('adminUploads').doc(id).update({ data: { fileID: uploaded.fileID, reclaiming: true, reclaimed: false } })
      try {
        const deletion = await cloud.deleteFile({ fileList: [uploaded.fileID] })
        if (deletion.fileList?.some(f => f.status !== 0 && f.status !== -503003)) throw new Error('FILE_CLEANUP_FAILED')
        await db.collection('adminUploads').doc(id).update({ data: { reclaimed: true } })
      } catch (error) {
        await db.collection('adminUploads').doc(id).update({ data: { lastError: String(error.message || error).slice(0, 200) } })
      }
      fail('UPLOAD_EXPIRED')
    }
    return { fileID: uploaded.fileID, imageWidth: info.imageWidth, imageHeight: info.imageHeight }
  }
  if (action === 'reclaimUploads') {
    for (const upload of await all(db.collection('adminUploads'))) {
      if (upload.expiresAt >= Date.now() || upload.wallId || upload.reclaimed) continue
      let reclaim = false
      await db.runTransaction(async tx => {
        const current = await find(tx, 'adminUploads', upload.id)
        if (current.wallId || current.reclaimed || current.expiresAt >= Date.now()) return
        await tx.collection('adminUploads').doc(upload.id).update({ data: { reclaiming: true } }); reclaim = true
      })
      if (!reclaim) continue
      try {
        // An expired, transactionally locked receipt cannot be attached to a wall.
        // Overwrite only its server-chosen path to recover a lost upload response.
        if (!upload.fileID) {
          upload.fileID = (await cloud.uploadFile({ cloudPath: upload.cloudPath, fileContent: Buffer.alloc(0) })).fileID
          await db.collection('adminUploads').doc(upload.id).update({ data: { fileID: upload.fileID } })
        }
        const references = (await all(db.collection('walls'))).some(w => w.imageFileId === upload.fileID || w.displayImageFileId === upload.fileID)
        if (!references) {
          const result = await cloud.deleteFile({ fileList: [upload.fileID] })
          if (result.fileList?.some(f => f.status !== 0 && f.status !== -503003)) throw new Error('FILE_CLEANUP_FAILED')
        }
        await db.collection('adminUploads').doc(upload.id).update({ data: { reclaimed: true } })
      } catch (error) { await db.collection('adminUploads').doc(upload.id).update({ data: { lastError: String(error.message).slice(0, 200) } }) }
    }
    return { ok: true }
  }
  let result
  if (action === 'createWall') {
    const id = `wall_admin_${requestKey(actor.id, data.requestId)}`
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    const angles = data.angleOptions || [20, 25, 30, 35, 40, 45]
    if (!name || name.length > 80 || !Array.isArray(angles) || !angles.length || angles.some(a => ![20,25,30,35,40,45].includes(a))) fail('INVALID_INPUT')
    const observedMax = await bootstrapWallNumbers(db)
    const candidate = (await db.collection('adminUploads').where({ fileID: data.imageFileId, ownerId: actor.id }).limit(1).get()).data[0]
    await db.runTransaction(async tx => {
      if (await find(tx, 'wallDeletionJobs', id)) fail('WALL_DELETED')
      const existing = await find(tx, 'walls', id)
      if (existing) {
        if (existing.name !== name || existing.imageFileId !== data.imageFileId) fail('CREATE_REQUEST_CONFLICT')
        result = existing; return
      }
      const upload = candidate ? await find(tx, 'adminUploads', candidate.id || candidate._id) : null
      if (!upload || upload.ownerId !== actor.id || upload.fileID !== data.imageFileId || upload.reclaiming || upload.expiresAt < Date.now() || upload.wallId || upload.imageWidth !== data.imageWidth || upload.imageHeight !== data.imageHeight) fail('INVALID_UPLOAD_RECEIPT')
      const wallNumber = await nextWallNumber(tx, observedMax)
      result = { id, wallNumber, name, imageFileId: upload.fileID, imageWidth: upload.imageWidth, imageHeight: upload.imageHeight, ownerId: actor.id, visibility: 'private', published: false, geometryType: 'circle', holds: [], angleOptions: angles, createdAt: Date.now(), updatedAt: Date.now() }
      await tx.collection('walls').doc(id).set({ data: result })
      await tx.collection('adminUploads').doc(upload.id).update({ data: { wallId: id } })
    })
    return result
  }
  if (!['updateWallHolds', 'publishWall'].includes(action)) fail('INVALID_ACTION')
  await db.runTransaction(async tx => {
    const wall = await find(tx, 'walls', data.wallId)
    if (!wall || wall.deleting) fail('WALL_NOT_FOUND')
    if (wall.ownerId !== actor.id) fail('FORBIDDEN')
    if (wall.published || wall.visibility === 'public') {
      if (action === 'publishWall' && wall.visibility === 'public') { result = wall; return }
      fail('WALL_IMMUTABLE')
    }
    const changes = action === 'updateWallHolds' ? { holds: holdsFor(data.holds) } : { published: true, visibility: 'public' }
    if (action === 'updateWallHolds') changes.geometryType = changes.holds.some(hold => hold.polygon) ? 'polygon' : 'circle'
    if (action === 'publishWall' && holdsFor(wall.holds).length < 2) fail('WALL_NOT_ROUTABLE')
    result = { ...wall, ...changes, updatedAt: Date.now() }
    await tx.collection('walls').doc(wall.id).update({ data: { ...changes, updatedAt: result.updatedAt } })
  })
  return result
}

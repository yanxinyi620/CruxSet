const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const HOLD_KINDS = new Set(['hold', 'volume'])
const ANGLES = new Set([20, 25, 30, 35, 40, 45])
const SIGNATURE_MAX_AGE_SECONDS = 300

const canonicalize = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

const fail = code => { throw new Error(code) }

const signedPayload = event => {
  const payload = { ...(event || {}) }
  delete payload.signature
  return payload
}

const verifySignature = (event, secret) => {
  if (!secret || typeof event?.signature !== 'string') fail('UNAUTHORIZED')
  const timestamp = Number(event.timestamp)
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_MAX_AGE_SECONDS) fail('REQUEST_EXPIRED')
  const expected = crypto.createHmac('sha256', secret).update(canonicalize(signedPayload(event))).digest('hex')
  const supplied = Buffer.from(event.signature, 'utf8')
  const calculated = Buffer.from(expected, 'utf8')
  if (supplied.length !== calculated.length || !crypto.timingSafeEqual(supplied, calculated)) fail('UNAUTHORIZED')
}

const payloadFrom = event => {
  if (event?.metadata && typeof event.metadata === 'object') return { ...event.metadata, imageFileId: event.imageFileId, ownerOpenid: event.ownerOpenid, timestamp: event.timestamp, signature: event.signature }
  return event || {}
}

const polygonArea = polygon => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length]
  return sum + point[0] * next[1] - next[0] * point[1]
}, 0) / 2)

const validatePayload = payload => {
  const required = ['publishRequestId', 'sourceExperimentId', 'sourceCalibrationId', 'wallName', 'imageWidth', 'imageHeight', 'imageFileId', 'ownerOpenid', 'holds']
  if (required.some(field => typeof payload[field] !== 'string' && !['imageWidth', 'imageHeight', 'holds'].includes(field)) || required.some(field => payload[field] === undefined || payload[field] === null)) fail('INVALID_METADATA')
  if (!Number.isInteger(payload.imageWidth) || payload.imageWidth <= 0 || !Number.isInteger(payload.imageHeight) || payload.imageHeight <= 0 || !payload.publishRequestId || !payload.sourceExperimentId || !payload.sourceCalibrationId || !payload.wallName) fail('INVALID_METADATA')
  if (!payload.imageFileId.startsWith('cloud://') || !payload.ownerOpenid || !Array.isArray(payload.holds) || !payload.holds.length) fail('INVALID_METADATA')
  if (payload.ownerId !== undefined || payload.description !== undefined && typeof payload.description !== 'string' || (payload.description || '').length > 500) fail('INVALID_METADATA')
  const angles = payload.angleOptions || [20, 25, 30, 35, 40, 45]
  if (!Array.isArray(angles) || !angles.length || angles.some(angle => !Number.isFinite(angle) || !ANGLES.has(angle))) fail('INVALID_METADATA')
  const ids = new Set()
  const sourceIds = new Set()
  payload.holds.forEach((hold, index) => {
    if (!hold || typeof hold.id !== 'string' || !/^H\d{3,}$/.test(hold.id) || ids.has(hold.id) || !HOLD_KINDS.has(hold.kind)) fail('INVALID_HOLDS')
    if (hold.id !== `H${String(index + 1).padStart(3, '0')}` || typeof hold.sourceId !== 'string' || !hold.sourceId || sourceIds.has(hold.sourceId)) fail('INVALID_HOLDS')
    ids.add(hold.id)
    sourceIds.add(hold.sourceId)
    if (!Array.isArray(hold.polygon) || hold.polygon.length < 3 || hold.polygon.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1)) || polygonArea(hold.polygon) <= 0) fail('INVALID_HOLDS')
    if (![hold.x, hold.y, hold.radius].every(Number.isFinite) || hold.x < 0 || hold.x > 1 || hold.y < 0 || hold.y > 1 || hold.radius <= 0 || hold.radius > 1) fail('INVALID_HOLDS')
  })
  return { ...payload, angleOptions: angles }
}

const fingerprintFor = payload => crypto.createHash('sha256').update(canonicalize({
  publishRequestId: payload.publishRequestId,
  sourceExperimentId: payload.sourceExperimentId,
  sourceCalibrationId: payload.sourceCalibrationId,
  wallName: payload.wallName,
  description: payload.description || '',
  imageWidth: payload.imageWidth,
  imageHeight: payload.imageHeight,
  angleOptions: payload.angleOptions,
  holds: payload.holds,
})).digest('hex')

const receiptIdFor = requestId => `segmentation_${crypto.createHash('sha256').update(requestId).digest('hex')}`

const ownerFor = async (db, ownerOpenid) => {
  const users = await db.collection('users').where({ openid: ownerOpenid }).limit(1).get()
  if (!users.data.length || !users.data[0].id) fail('OWNER_NOT_FOUND')
  return users.data[0]
}

exports.main = async event => {
  const secret = process.env.CRUXSET_CLOUDBASE_SEGMENTATION_SIGNING_KEY || process.env.CRUXSET_SEGMENTATION_CLOUDBASE_SIGNING_KEY || ''
  verifySignature(event, secret)
  const payload = validatePayload(payloadFrom(event))
  const db = cloud.database()
  const owner = await ownerFor(db, payload.ownerOpenid)
  const fingerprint = fingerprintFor(payload)
  const receiptId = receiptIdFor(payload.publishRequestId)
  const wallId = `wall_seg_${crypto.createHash('sha256').update(payload.publishRequestId).digest('hex').slice(0, 24)}`
  let result
  await db.runTransaction(async transaction => {
    const existing = (await transaction.collection('segmentationPublishes').doc(receiptId).get()).data
    if (existing) {
      if (existing.fingerprint !== fingerprint) fail('PUBLISH_REQUEST_CONFLICT')
      result = { wallId: existing.wallId, wallName: existing.wallName, holdCount: existing.holdCount, browsePath: `/wall/${existing.wallId}`, created: false }
      return
    }
    const now = Date.now()
    await transaction.collection('walls').doc(wallId).set({ data: {
      id: wallId,
      name: payload.wallName,
      description: payload.description || '',
      imageFileId: payload.imageFileId,
      imageWidth: payload.imageWidth,
      imageHeight: payload.imageHeight,
      geometryType: 'polygon',
      holds: payload.holds,
      angleOptions: payload.angleOptions,
      ownerId: owner.id,
      visibility: 'public',
      published: true,
      source: { type: 'segmentation_lab', experimentId: payload.sourceExperimentId, calibrationId: payload.sourceCalibrationId, publishRequestId: payload.publishRequestId },
      createdAt: now,
      updatedAt: now,
    } })
    await transaction.collection('segmentationPublishes').doc(receiptId).set({ data: {
      id: receiptId,
      publishRequestId: payload.publishRequestId,
      wallId,
      wallName: payload.wallName,
      holdCount: payload.holds.length,
      fingerprint,
      createdAt: now,
    } })
    result = { wallId, wallName: payload.wallName, holdCount: payload.holds.length, browsePath: `/wall/${wallId}`, created: true }
  })
  return result
}

// Exported for lightweight unit tests that do not load the CloudBase runtime.
exports._validatePayload = validatePayload
exports._canonicalize = canonicalize

const crypto = require('crypto')
// Keep pure validation importable by local contract tests. CloudBase always
// provides wx-server-sdk at deployment time.
let cloud
try {
  cloud = require('wx-server-sdk')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  cloud = null
}

if (cloud) cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const HOLD_KINDS = new Set(['hold', 'volume'])
const ANGLES = new Set([20, 25, 30, 35, 40, 45])
const SIGNATURE_MAX_AGE_SECONDS = 300
const MAX_PAYLOAD_FILE_BYTES = 5 * 1024 * 1024

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

const polygonArea = polygon => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length]
  return sum + point[0] * next[1] - next[0] * point[1]
}, 0) / 2)

const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const onSegment = (a, b, point) => point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0]) && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])
const segmentsIntersect = (a, b, c, d) => {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  const epsilon = 1e-12
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true
  return (Math.abs(abC) <= epsilon && onSegment(a, b, c)) || (Math.abs(abD) <= epsilon && onSegment(a, b, d)) || (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) || (Math.abs(cdB) <= epsilon && onSegment(c, d, b))
}
const hasSelfIntersection = polygon => {
  for (let i = 0; i < polygon.length; i += 1) {
    for (let j = i + 1; j < polygon.length; j += 1) {
      if (j === i || j === (i + 1) % polygon.length || (i === 0 && j === polygon.length - 1)) continue
      if (segmentsIntersect(polygon[i], polygon[(i + 1) % polygon.length], polygon[j], polygon[(j + 1) % polygon.length])) return true
    }
  }
  return false
}
const pointInPolygon = (point, polygon) => {
  let inside = false
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    if ((current[1] > point[1]) !== (previous[1] > point[1]) && point[0] < (previous[0] - current[0]) * (point[1] - current[1]) / (previous[1] - current[1]) + current[0]) inside = !inside
  }
  return inside
}

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
    if (!Array.isArray(hold.polygon) || hold.polygon.length < 3 || hold.polygon.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1)) || polygonArea(hold.polygon) < 1e-6 || hasSelfIntersection(hold.polygon)) fail('INVALID_HOLDS')
    if (!Array.isArray(hold.bbox) || hold.bbox.length !== 4 || hold.bbox.some(value => !Number.isFinite(value) || value < 0 || value > 1) || hold.bbox[0] > hold.bbox[2] || hold.bbox[1] > hold.bbox[3]) fail('INVALID_HOLDS')
    const xs = hold.polygon.map(point => point[0])
    const ys = hold.polygon.map(point => point[1])
    const expectedBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    if (expectedBbox.some((value, bboxIndex) => Math.abs(value - hold.bbox[bboxIndex]) > 1e-9)) fail('INVALID_HOLDS')
    if (!pointInPolygon([hold.x, hold.y], hold.polygon)) fail('INVALID_HOLDS')
    const expectedRadius = Math.sqrt(polygonArea(hold.polygon) / Math.PI)
    if (Math.abs(hold.radius - expectedRadius) > Math.max(1e-6, expectedRadius * 1e-6)) fail('INVALID_HOLDS')
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

const payloadFromHttpEvent = event => {
  if (!event || typeof event !== 'object' || event.body === undefined) return event || {}
  if (typeof event.body === 'object' && event.body !== null) return event.body
  if (typeof event.body !== 'string') fail('INVALID_METADATA')
  try {
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('INVALID_METADATA')
    return parsed
  } catch (error) {
    if (error.message === 'INVALID_METADATA') throw error
    fail('INVALID_METADATA')
  }
}

const payloadFileIdFromHttpEvent = event => {
  const payload = payloadFromHttpEvent(event)
  const fileID = payload?.payloadFileId
  if (fileID === undefined) return undefined
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://') || !fileID.includes('/segmentation-payloads/')) fail('INVALID_METADATA_FILE')
  return fileID
}

const payloadFromStorage = async fileID => {
  let downloaded
  try {
    downloaded = await cloud.downloadFile({ fileID })
  } catch (error) {
    fail('PAYLOAD_DOWNLOAD_FAILED')
  }
  const content = downloaded?.fileContent
  if (!Buffer.isBuffer(content) || !content.length || content.length > MAX_PAYLOAD_FILE_BYTES) fail('INVALID_METADATA_FILE')
  try {
    const payload = JSON.parse(content.toString('utf8'))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('INVALID_METADATA_FILE')
    return payload
  } catch (error) {
    if (error.message === 'INVALID_METADATA_FILE') throw error
    fail('INVALID_METADATA_FILE')
  }
}

exports.main = async event => {
  if (!cloud) fail('CLOUDBASE_RUNTIME_MISSING')
  const secret = process.env.CRUXSET_CLOUDBASE_SIGNING_KEY || process.env.CRUXSET_CLOUDBASE_SEGMENTATION_SIGNING_KEY || process.env.CRUXSET_SEGMENTATION_CLOUDBASE_SIGNING_KEY || ''
  const fileID = payloadFileIdFromHttpEvent(event)
  const parsedEvent = fileID ? await payloadFromStorage(fileID) : payloadFromHttpEvent(event)
  const headerSignature = event?.headers?.['x-cruxset-signature'] || event?.headers?.['X-CruxSet-Signature']
  const payload = { ...parsedEvent, signature: parsedEvent.signature || headerSignature }
  verifySignature(payload, secret)
  const validated = validatePayload(payload)
  const db = cloud.database()
  const owner = await ownerFor(db, validated.ownerOpenid)
  const fingerprint = fingerprintFor(validated)
  const receiptId = receiptIdFor(validated.publishRequestId)
  const wallId = `wall_seg_${crypto.createHash('sha256').update(validated.publishRequestId).digest('hex').slice(0, 24)}`
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
      name: validated.wallName,
      description: validated.description || '',
      imageFileId: validated.imageFileId,
      imageWidth: validated.imageWidth,
      imageHeight: validated.imageHeight,
      geometryType: 'polygon',
      holds: validated.holds,
      angleOptions: validated.angleOptions,
      ownerId: owner.id,
      visibility: 'public',
      published: true,
      source: { type: 'segmentation_lab', experimentId: validated.sourceExperimentId, calibrationId: validated.sourceCalibrationId, publishRequestId: validated.publishRequestId },
      createdAt: now,
      updatedAt: now,
    } })
    await transaction.collection('segmentationPublishes').doc(receiptId).set({ data: {
      id: receiptId,
      publishRequestId: validated.publishRequestId,
      wallId,
      wallName: validated.wallName,
      holdCount: validated.holds.length,
      fingerprint,
      createdAt: now,
    } })
    result = { wallId, wallName: validated.wallName, holdCount: validated.holds.length, browsePath: `/wall/${wallId}`, created: true }
  })
  return result
}

// Exported for lightweight unit tests that do not load the CloudBase runtime.
exports._validatePayload = validatePayload
exports._canonicalize = canonicalize
exports._payloadFromHttpEvent = payloadFromHttpEvent
exports._payloadFileIdFromHttpEvent = payloadFileIdFromHttpEvent
exports._setCloudForTests = value => { cloud = value }

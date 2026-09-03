const crypto = require('crypto')

// CloudBase supplies wx-server-sdk when this function is deployed. Keeping the
// optional require makes the parsing and signing contract testable locally.
let cloud
try {
  cloud = require('wx-server-sdk')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  cloud = null
}

if (cloud) cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// CloudBase Storage is a service API, not a WeChat OpenAPI.  The node SDK
// obtains the function's CloudBase credentials automatically when deployed.
let storage
try {
  const tcb = require('@cloudbase/node-sdk')
  storage = tcb.init({})
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  storage = null
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_MULTIPART_OVERHEAD = 1024 * 1024
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD
const SIGNATURE_MAX_AGE_SECONDS = 300
const SIGNATURE_FUTURE_SKEW_SECONDS = 30
const CONTENT_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
])

const fail = code => { throw new Error(code) }

const header = (headers, name) => {
  if (!headers || typeof headers !== 'object') return undefined
  const wanted = name.toLowerCase()
  const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === wanted)
  if (!key) return undefined
  const value = headers[key]
  return Array.isArray(value) ? value[0] : value
}

const bodyBufferFrom = event => {
  if (!event || typeof event !== 'object' || event.body === undefined || !event.headers || typeof event.headers !== 'object' || event.httpMethod === undefined) fail('CLIENT_CALL_FORBIDDEN')
  if (event.httpMethod !== 'POST') fail('METHOD_NOT_ALLOWED')
  let body
  if (Buffer.isBuffer(event.body)) body = event.body
  else if (typeof event.body === 'string') {
    try {
      body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8')
    } catch (error) {
      fail('INVALID_MULTIPART')
    }
  } else fail('INVALID_MULTIPART')
  const declaredLength = header(event.headers, 'content-length')
  if (body.length > MAX_REQUEST_BYTES || (declaredLength !== undefined && /^\d+$/.test(String(declaredLength)) && Number(declaredLength) > MAX_REQUEST_BYTES)) fail('INVALID_FILE_SIZE')
  if (declaredLength !== undefined && (!/^\d+$/.test(String(declaredLength)) || Number(declaredLength) !== body.length)) fail('INVALID_MULTIPART')
  return body
}

const jsonBodyFrom = event => {
  if (!event || typeof event !== 'object' || event.body === undefined || !event.headers || typeof event.headers !== 'object' || event.httpMethod === undefined) fail('CLIENT_CALL_FORBIDDEN')
  if (event.httpMethod !== 'POST') fail('METHOD_NOT_ALLOWED')
  if (typeof event.body !== 'string') fail('INVALID_METADATA')
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('INVALID_METADATA')
    return parsed
  } catch (error) {
    if (error.message === 'INVALID_METADATA') throw error
    fail('INVALID_METADATA')
  }
}

const canonicalize = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

const imageSignatureValid = (content, contentType) => {
  if (contentType === 'image/png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (contentType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
  return content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP'
}

const safeFilename = filename => String(filename || 'upload').split(/[\\/]/).pop() || 'upload'

const signedMetadataFor = (file, timestamp) => ({
  timestamp: String(timestamp),
  filename: file.filename,
  contentType: file.contentType,
  contentSha256: crypto.createHash('sha256').update(file.content).digest('hex'),
  contentLength: file.content.length,
})

const verifySignature = (file, headers, secret) => {
  const signature = header(headers, 'x-cruxset-signature')
  const timestamp = header(headers, 'x-cruxset-timestamp')
  if (!secret || typeof signature !== 'string' || !signature) fail('UNAUTHORIZED')
  if (typeof timestamp !== 'string' || !/^\d+$/.test(timestamp)) fail('UNAUTHORIZED')
  const timestampNumber = Number(timestamp)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(timestampNumber)) fail('UNAUTHORIZED')
  if (timestampNumber > now) fail('REQUEST_IN_FUTURE')
  if (now - timestampNumber > SIGNATURE_MAX_AGE_SECONDS) fail('REQUEST_EXPIRED')

  const metadata = signedMetadataFor(file, timestamp)
  const expectedHeaders = {
    'x-cruxset-filename': metadata.filename,
    'x-cruxset-content-type': metadata.contentType,
    'x-cruxset-content-sha256': metadata.contentSha256,
    'x-cruxset-content-length': String(metadata.contentLength),
  }
  for (const [name, expected] of Object.entries(expectedHeaders)) {
    if (header(headers, name) !== expected) fail('UNAUTHORIZED')
  }
  const expected = crypto.createHmac('sha256', secret).update(canonicalize(metadata)).digest('hex')
  const normalizedSignature = signature.replace(/^sha256=/i, '')
  const supplied = Buffer.from(normalizedSignature, 'utf8')
  const calculated = Buffer.from(expected, 'utf8')
  if (supplied.length !== calculated.length || !crypto.timingSafeEqual(supplied, calculated)) fail('UNAUTHORIZED')
}

const validateImage = file => {
  if (!imageSignatureValid(file.content, file.contentType)) fail('INVALID_IMAGE_SIGNATURE')
  return file
}

const boundaryFrom = contentType => {
  if (typeof contentType !== 'string') fail('INVALID_MULTIPART')
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const boundary = match?.[1] || match?.[2]
  if (!boundary || boundary.length > 200) fail('INVALID_MULTIPART')
  return boundary
}

const dispositionValue = (disposition, name) => {
  const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(disposition || '')
  return match ? match[1] : undefined
}

const parsePartHeaders = bytes => {
  const text = bytes.toString('utf8')
  const values = {}
  for (const line of text.split('\r\n')) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    values[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
  }
  return values
}

const parseMultipart = (body, contentType) => {
  const boundary = boundaryFrom(contentType)
  const marker = Buffer.from(`--${boundary}`)
  const nextMarker = Buffer.from(`\r\n--${boundary}`)
  if (!body.subarray(0, marker.length).equals(marker)) fail('INVALID_MULTIPART')

  let cursor = marker.length
  let file
  while (cursor <= body.length) {
    if (body.subarray(cursor, cursor + 2).toString() === '--') {
      cursor += 2
      if (cursor < body.length && body.subarray(cursor).toString() !== '\r\n') fail('INVALID_MULTIPART')
      break
    }
    if (body.subarray(cursor, cursor + 2).toString() !== '\r\n') fail('INVALID_MULTIPART')
    cursor += 2
    const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor)
    if (headersEnd < 0) fail('INVALID_MULTIPART')
    const partHeaders = parsePartHeaders(body.subarray(cursor, headersEnd))
    cursor = headersEnd + 4
    const dataEnd = body.indexOf(nextMarker, cursor)
    if (dataEnd < 0) fail('INVALID_MULTIPART')
    const data = body.subarray(cursor, dataEnd)
    const disposition = partHeaders['content-disposition']
    const fieldName = dispositionValue(disposition, 'name')
    if (fieldName !== 'file' || file) fail('INVALID_MULTIPART')
    const filename = safeFilename(dispositionValue(disposition, 'filename') || 'upload')
    const type = String(partHeaders['content-type'] || '').split(';', 1)[0].trim().toLowerCase()
    const extension = CONTENT_TYPES.get(type)
    if (!extension) fail('INVALID_FILE_TYPE')
    if (data.length > MAX_UPLOAD_BYTES) fail('INVALID_FILE_SIZE')
    if (!data.length) fail('INVALID_FILE_SIZE')
    file = { content: data, contentType: type, extension, filename }
    cursor = dataEnd + 2 + marker.length
  }
  if (!file) fail('INVALID_MULTIPART')
  return file
}

const secretFromEnvironment = () => process.env.CRUXSET_CLOUDBASE_SIGNING_KEY || process.env.CRUXSET_CLOUDBASE_STORAGE_SIGNING_KEY || ''

const objectKeys = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : []

const uploadMetadata = async (cloudPath) => {
  if (!storage || typeof storage.getUploadMetadata !== 'function') fail('CLOUDBASE_RUNTIME_MISSING')
  let result
  try {
    result = await storage.getUploadMetadata({ cloudPath })
  } catch (error) {
    console.log('storageUpload metadata diagnostic', {
      callErrorCode: typeof error?.code === 'string' ? error.code : undefined,
      callErrorMessage: typeof error?.message === 'string' ? error.message.slice(0, 200) : undefined,
    })
    fail('STORAGE_UPLOAD_METADATA_FAILED')
  }
  const value = result?.data || result
  const uploadUrl = value?.url || value?.uploadUrl || value?.upload_url
  const authorization = value?.authorization
  const token = value?.token
  const cloudObjectMeta = value?.cosFileId || value?.cosFileID || value?.cloudObjectMeta || value?.cos_file_id
  const fileID = value?.fileId || value?.fileID || value?.file_id
  if (![uploadUrl, authorization, token, cloudObjectMeta, fileID].every(item => typeof item === 'string' && item)) {
    console.log('storageUpload metadata diagnostic', {
      resultKeys: objectKeys(result),
      dataKeys: objectKeys(value),
    })
    fail('STORAGE_UPLOAD_METADATA_FAILED')
  }
  return { fileID, uploadUrl, authorization, token, cloudObjectMeta, cloudPath }
}

const main = async event => {
  const contentType = header(event?.headers, 'content-type') || ''
  if (/^application\/json\s*(;|$)/i.test(contentType)) {
    const metadata = jsonBodyFrom(event)
    const filename = safeFilename(metadata.filename)
    const type = String(metadata.contentType || '').toLowerCase()
    const extension = CONTENT_TYPES.get(type)
    if (!secretFromEnvironment()) fail('UNAUTHORIZED')
    const timestamp = String(metadata.timestamp || '')
    const required = { timestamp, filename, contentType: type, contentSha256: metadata.contentSha256, contentLength: metadata.contentLength }
    if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(String(required.contentSha256 || '')) || !Number.isSafeInteger(Number(required.contentLength)) || Number(required.contentLength) <= 0 || Number(required.contentLength) > MAX_UPLOAD_BYTES || !extension) fail('INVALID_METADATA')
    const now = Math.floor(Date.now() / 1000)
    console.log('storageUpload clock diagnostic', {
      receivedTimestamp: Number(timestamp),
      serverTimestamp: now,
      differenceSeconds: Number(timestamp) - now,
    })
    if (Number(timestamp) - now > SIGNATURE_FUTURE_SKEW_SECONDS) fail('REQUEST_IN_FUTURE')
    if (now - Number(timestamp) > SIGNATURE_MAX_AGE_SECONDS) fail('REQUEST_EXPIRED')
    const signature = header(event.headers, 'x-cruxset-signature')
    const expected = crypto.createHmac('sha256', secretFromEnvironment()).update(canonicalize(required)).digest('hex')
    if (typeof signature !== 'string' || signature.replace(/^sha256=/i, '') !== expected) fail('UNAUTHORIZED')
    const cloudPath = `segmentation/${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${extension}`
    return await uploadMetadata(cloudPath)
  }
  const body = bodyBufferFrom(event)
  const file = parseMultipart(body, header(event.headers, 'content-type'))
  verifySignature(file, event.headers, secretFromEnvironment())
  validateImage(file)
  if (!cloud || typeof cloud.uploadFile !== 'function') fail('CLOUDBASE_RUNTIME_MISSING')

  const cloudPath = `segmentation/${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${file.extension}`
  let uploaded
  try {
    uploaded = await cloud.uploadFile({ cloudPath, fileContent: file.content })
  } catch (error) {
    fail('STORAGE_UPLOAD_FAILED')
  }
  if (!uploaded || typeof uploaded.fileID !== 'string' || !uploaded.fileID.startsWith('cloud://')) fail('STORAGE_UPLOAD_FAILED')
  return { fileID: uploaded.fileID }
}

exports.main = main
exports.MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES
exports.MAX_MULTIPART_OVERHEAD = MAX_MULTIPART_OVERHEAD
exports.MAX_REQUEST_BYTES = MAX_REQUEST_BYTES
exports._canonicalize = canonicalize
exports._parseMultipart = parseMultipart
exports._verifySignature = verifySignature
exports._bodyBufferFrom = bodyBufferFrom
exports._signedMetadataFor = signedMetadataFor
exports._setCloudForTests = value => { cloud = value }
exports._setStorageForTests = value => { storage = value }

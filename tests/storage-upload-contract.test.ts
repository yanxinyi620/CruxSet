import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, it, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)

const boundary = '----cruxset-storage-contract'
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const multipart = (content: Buffer, contentType = 'image/png', filename = 'wall.png') => Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
  content,
  Buffer.from(`\r\n--${boundary}--\r\n`),
])

const canonical = (metadata: Record<string, string | number>) => JSON.stringify(Object.fromEntries(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right))))
const metadataFor = (content: Buffer, timestamp: string, filename = 'wall.png', contentType = 'image/png') => ({
  timestamp,
  filename,
  contentType,
  contentSha256: crypto.createHash('sha256').update(content).digest('hex'),
  contentLength: content.length,
})
const sign = (metadata: Record<string, string | number>, secret: string) => crypto
  .createHmac('sha256', secret)
  .update(canonical(metadata))
  .digest('hex')

const secret = 'storage-contract-secret'
const timestamp = String(Math.floor(Date.now() / 1000))

beforeEach(() => {
  process.env.CRUXSET_CLOUDBASE_SIGNING_KEY = secret
})

afterEach(() => {
  delete process.env.CRUXSET_CLOUDBASE_SIGNING_KEY
})

it('accepts a signed multipart file and returns the CloudBase fileID', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<{ fileID: string }>
    _setCloudForTests: (cloud: { uploadFile: (input: { cloudPath: string; fileContent: Buffer }) => Promise<{ fileID: string }> }) => void
  }
  const uploaded: { cloudPath?: string; fileContent?: Buffer } = {}
  storageUpload._setCloudForTests({
    uploadFile: async input => {
      uploaded.cloudPath = input.cloudPath
      uploaded.fileContent = input.fileContent
      return { fileID: 'cloud://cruxset/segmentation/wall.png' }
    },
  })
  const body = multipart(pngBytes)
  const metadata = metadataFor(pngBytes, timestamp)

  await expect(storageUpload.main({
    body: body.toString('base64'),
    isBase64Encoded: true,
    httpMethod: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'x-cruxset-timestamp': timestamp,
      'x-cruxset-filename': metadata.filename,
      'x-cruxset-content-type': metadata.contentType,
      'x-cruxset-content-sha256': metadata.contentSha256,
      'x-cruxset-content-length': String(metadata.contentLength),
      'x-cruxset-signature': sign(metadata, secret),
    },
  })).resolves.toEqual({ fileID: 'cloud://cruxset/segmentation/wall.png' })
  expect(uploaded.cloudPath).toMatch(/^segmentation\/[a-z0-9-]+\.png$/)
  expect(uploaded.fileContent).toEqual(pngBytes)
})

it('rejects an invalid signature before calling CloudBase Storage', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
    _setCloudForTests: (cloud: { uploadFile: () => Promise<never> }) => void
  }
  let calls = 0
  storageUpload._setCloudForTests({ uploadFile: async () => { calls += 1; throw new Error('must not upload') } })
  const body = multipart(pngBytes)
  const metadata = metadataFor(pngBytes, timestamp)

  await expect(storageUpload.main({
    body: body.toString('base64'),
    isBase64Encoded: true,
    httpMethod: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'x-cruxset-timestamp': timestamp,
      'x-cruxset-filename': metadata.filename,
      'x-cruxset-content-type': metadata.contentType,
      'x-cruxset-content-sha256': metadata.contentSha256,
      'x-cruxset-content-length': String(metadata.contentLength),
      'x-cruxset-signature': 'invalid',
    },
  })).rejects.toThrow('UNAUTHORIZED')
  expect(calls).toBe(0)
})

it('rejects unsupported image types and files larger than 50MB', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
    _setCloudForTests: (cloud: { uploadFile: () => Promise<never> }) => void
  }
  storageUpload._setCloudForTests({ uploadFile: async () => { throw new Error('must not upload') } })
  const makeEvent = (body: Buffer, content: Buffer, filename = 'wall.png', contentType = 'image/png', extraHeaders: Record<string, string> = {}) => {
    const metadata = metadataFor(content, timestamp, filename, contentType)
    return {
    body: body.toString('base64'),
    isBase64Encoded: true,
    httpMethod: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'x-cruxset-timestamp': timestamp,
      'x-cruxset-filename': metadata.filename,
      'x-cruxset-content-type': metadata.contentType,
      'x-cruxset-content-sha256': metadata.contentSha256,
      'x-cruxset-content-length': String(metadata.contentLength),
      'x-cruxset-signature': sign(metadata, secret),
      ...extraHeaders,
    },
    }
  }

  await expect(storageUpload.main(makeEvent(multipart(Buffer.from('gif bytes'), 'image/gif', 'wall.gif'), Buffer.from('gif bytes'), 'wall.gif', 'image/gif')))
    .rejects.toThrow('INVALID_FILE_TYPE')
  await expect(storageUpload.main(makeEvent(multipart(Buffer.alloc(50 * 1024 * 1024 + 1, 0x00), 'image/png', 'wall.png'), Buffer.alloc(50 * 1024 * 1024 + 1, 0x00))))
    .rejects.toThrow('INVALID_FILE_SIZE')
  await expect(storageUpload.main(makeEvent(multipart(Buffer.from('not an image')), Buffer.from('not an image'))))
    .rejects.toThrow('INVALID_IMAGE_SIGNATURE')
})

it('accepts JPEG and WebP files only when their magic bytes match the MIME type', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<{ fileID: string }>
    _setCloudForTests: (cloud: { uploadFile: () => Promise<{ fileID: string }> }) => void
  }
  storageUpload._setCloudForTests({ uploadFile: async () => ({ fileID: 'cloud://cruxset/segmentation/image' }) })
  const files: Array<[string, string, Buffer]> = [
    ['image/jpeg', 'wall.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ['image/webp', 'wall.webp', Buffer.from('RIFF0000WEBP')],
  ]
  for (const [contentType, filename, content] of files) {
    const body = multipart(content, contentType, filename)
    const metadata = metadataFor(content, timestamp, filename, contentType)
    await expect(storageUpload.main({
      body: body.toString('base64'), isBase64Encoded: true, httpMethod: 'POST', headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-cruxset-timestamp': timestamp,
        'x-cruxset-filename': metadata.filename,
        'x-cruxset-content-type': metadata.contentType,
        'x-cruxset-content-sha256': metadata.contentSha256,
        'x-cruxset-content-length': String(metadata.contentLength),
        'x-cruxset-signature': sign(metadata, secret),
      },
    })).resolves.toEqual({ fileID: 'cloud://cruxset/segmentation/image' })
  }
})

it('rejects direct client invocation without an HTTP request body and headers', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
  }
  await expect(storageUpload.main({ file: Buffer.from('png bytes') })).rejects.toThrow('CLIENT_CALL_FORBIDDEN')
})

it('rejects HTTP events without an explicit POST method', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
  }
  const body = multipart(pngBytes)
  const headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'x-cruxset-timestamp': timestamp,
    'x-cruxset-filename': 'wall.png',
    'x-cruxset-content-type': 'image/png',
    'x-cruxset-content-sha256': crypto.createHash('sha256').update(pngBytes).digest('hex'),
    'x-cruxset-content-length': String(pngBytes.length),
    'x-cruxset-signature': sign(metadataFor(pngBytes, timestamp), secret),
  }
  await expect(storageUpload.main({ body: body.toString('base64'), isBase64Encoded: true, headers }))
    .rejects.toThrow('CLIENT_CALL_FORBIDDEN')
  await expect(storageUpload.main({ body: body.toString('base64'), isBase64Encoded: true, httpMethod: 'GET', headers }))
    .rejects.toThrow('METHOD_NOT_ALLOWED')
  await expect(storageUpload.main({ body: body.toString('base64'), isBase64Encoded: true, httpMethod: 'post', headers }))
    .rejects.toThrow('METHOD_NOT_ALLOWED')
})

it('rejects a request whose declared multipart body exceeds the request limit', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
  }
  const body = multipart(pngBytes)
  const metadata = metadataFor(pngBytes, timestamp)
  await expect(storageUpload.main({
    body: body.toString('base64'),
    isBase64Encoded: true,
    httpMethod: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(51 * 1024 * 1024 + 1),
      'x-cruxset-timestamp': timestamp,
      'x-cruxset-filename': metadata.filename,
      'x-cruxset-content-type': metadata.contentType,
      'x-cruxset-content-sha256': metadata.contentSha256,
      'x-cruxset-content-length': String(metadata.contentLength),
      'x-cruxset-signature': sign(metadata, secret),
    },
  })).rejects.toThrow('INVALID_FILE_SIZE')
})

it('rejects expired and future signatures, and reports CloudBase upload failures', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
    _setCloudForTests: (cloud: { uploadFile: () => Promise<never> }) => void
  }
  storageUpload._setCloudForTests({ uploadFile: async () => { throw new Error('storage down') } })
  const body = multipart(pngBytes)
  const makeSignedEvent = (signedTimestamp: string) => {
    const metadata = metadataFor(pngBytes, signedTimestamp)
    return {
      body: body.toString('base64'), isBase64Encoded: true, httpMethod: 'POST', headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-cruxset-timestamp': signedTimestamp,
        'x-cruxset-filename': metadata.filename,
        'x-cruxset-content-type': metadata.contentType,
        'x-cruxset-content-sha256': metadata.contentSha256,
        'x-cruxset-content-length': String(metadata.contentLength),
        'x-cruxset-signature': sign(metadata, secret),
      },
    }
  }
  await expect(storageUpload.main(makeSignedEvent(String(Math.floor(Date.now() / 1000) - 301))))
    .rejects.toThrow('REQUEST_EXPIRED')
  await expect(storageUpload.main(makeSignedEvent(String(Math.floor(Date.now() / 1000) + 1))))
    .rejects.toThrow('REQUEST_IN_FUTURE')
  await expect(storageUpload.main(makeSignedEvent(String(Math.floor(Date.now() / 1000)))))
    .rejects.toThrow('STORAGE_UPLOAD_FAILED')
})

it('rejects multipart bodies with trailing data after the closing boundary', async () => {
  const storageUpload = require(resolve(process.cwd(), 'cloudfunctions/storageUpload/index.js')) as {
    main: (event: Record<string, unknown>) => Promise<unknown>
  }
  const body = Buffer.concat([multipart(pngBytes), Buffer.from('trailing data')])
  const metadata = metadataFor(pngBytes, timestamp)
  await expect(storageUpload.main({
    body: body.toString('base64'), isBase64Encoded: true, httpMethod: 'POST', headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'x-cruxset-timestamp': timestamp,
      'x-cruxset-filename': metadata.filename,
      'x-cruxset-content-type': metadata.contentType,
      'x-cruxset-content-sha256': metadata.contentSha256,
      'x-cruxset-content-length': String(metadata.contentLength),
      'x-cruxset-signature': sign(metadata, secret),
    },
  })).rejects.toThrow('INVALID_MULTIPART')
})

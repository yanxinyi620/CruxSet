import { candidates, digest, fail, type ReadyEnv, type Row } from './common.js'
export const canonical = (v: any): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v)
async function signature(v: any, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(canonical(v)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}
function inside(q: number[], p: number[][]) {
  let yes = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if (
      p[i][1] > q[1] !== p[j][1] > q[1] &&
      q[0] <
        ((p[j][0] - p[i][0]) * (q[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]
    )
      yes = !yes
  return yes
}
// Match the CloudBase receiver's tolerance and non-adjacent edge checks.
function selfIntersects(p: number[][]) {
  const orientation = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const onSegment = (a: number[], b: number[], q: number[]) =>
    q[0] >= Math.min(a[0], b[0]) &&
    q[0] <= Math.max(a[0], b[0]) &&
    q[1] >= Math.min(a[1], b[1]) &&
    q[1] <= Math.max(a[1], b[1])
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === (i + 1) % p.length || (i === 0 && j === p.length - 1)) continue
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[j],
        d = p[(j + 1) % p.length]
      const abC = orientation(a, b, c),
        abD = orientation(a, b, d),
        cdA = orientation(c, d, a),
        cdB = orientation(c, d, b),
        epsilon = 1e-12
      if (
        ((abC > epsilon && abD < -epsilon) ||
          (abC < -epsilon && abD > epsilon)) &&
        ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
      )
        return true
      if (
        (Math.abs(abC) <= epsilon && onSegment(a, b, c)) ||
        (Math.abs(abD) <= epsilon && onSegment(a, b, d)) ||
        (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) ||
        (Math.abs(cdB) <= epsilon && onSegment(c, d, b))
      )
        return true
    }
  return false
}
export function normalizedHolds(items: Row[], width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    fail('INVALID_CANDIDATES', '图片尺寸无效。')
  candidates(items, width, height)
  if (!items.length) fail('INVALID_CANDIDATES', '请至少保存一个岩点。')
  const holds = items
    .map((h) => {
      const p = h.polygon.map((q: number[]) => [
          q[0] / width,
          q[1] / height,
        ]) as number[][],
        xs = p.map((q) => q[0]),
        ys = p.map((q) => q[1]),
        bbox = [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ]
      if (selfIntersects(p))
        fail('INVALID_CANDIDATES', '岩点多边形不能自相交。')
      let twice = 0,
        cx = 0,
        cy = 0
      p.forEach((q, i) => {
        const r = p[(i + 1) % p.length],
          cross = q[0] * r[1] - r[0] * q[1]
        twice += cross
        cx += (q[0] + r[0]) * cross
        cy += (q[1] + r[1]) * cross
      })
      let point = [cx / (3 * twice), cy / (3 * twice)]
      if (Math.abs(twice) / 2 < 1e-6)
        fail('INVALID_CANDIDATES', '岩点多边形面积过小。')
      if (!inside(point, p)) {
        // Scan horizontal slices; the midpoint of any interior interval is strictly inside.
        const levels = [...new Set(ys)].sort((a, b) => a - b)
        outer: for (let k = 1; k < levels.length; k++) {
          const y = (levels[k - 1] + levels[k]) / 2,
            cuts: number[] = []
          p.forEach((q, i) => {
            const r = p[(i + 1) % p.length]
            if (q[1] > y !== r[1] > y)
              cuts.push(q[0] + ((y - q[1]) * (r[0] - q[0])) / (r[1] - q[1]))
          })
          cuts.sort((a, b) => a - b)
          for (let j = 1; j < cuts.length; j += 2) {
            point = [(cuts[j - 1] + cuts[j]) / 2, y]
            if (inside(point, p)) break outer
          }
        }
      }
      const radius = Math.sqrt(Math.abs(twice) / 2 / Math.PI)
      if (
        !inside(point, p) ||
        ![...point, radius].every(Number.isFinite) ||
        point.some((v) => v < 0 || v > 1) ||
        radius <= 0 ||
        radius > 1
      )
        fail('INVALID_CANDIDATES', '岩点多边形无效。')
      return {
        sourceId: h.id,
        kind: h.kind ?? 'hold',
        polygon: p,
        bbox,
        x: point[0],
        y: point[1],
        radius,
      }
    })
    .sort(
      (a, b) =>
        a.bbox[1] - b.bbox[1] ||
        a.bbox[0] - b.bbox[0] ||
        String(a.sourceId).localeCompare(String(b.sourceId)),
    )
  const bands: (typeof holds)[] = []
  for (const h of holds) {
    if (!bands.length || (h.bbox[1] - bands.at(-1)![0].bbox[1]) * height > 4)
      bands.push([h])
    else bands.at(-1)!.push(h)
  }
  return bands
    .flatMap((b) =>
      b.sort(
        (a, b) =>
          a.bbox[0] - b.bbox[0] ||
          String(a.sourceId).localeCompare(String(b.sourceId)),
      ),
    )
    .map((h, i) => ({ ...h, id: `H${String(i + 1).padStart(3, '0')}` }))
}
export async function publishCloudbase(
  env: ReadyEnv,
  snapshot: Row,
  image: ArrayBuffer,
) {
  const endpoint = env.CRUXSET_CLOUDBASE_FUNCTION_URL,
    storage = env.CRUXSET_CLOUDBASE_STORAGE_URL,
    secret = env.CRUXSET_CLOUDBASE_SIGNING_KEY,
    owner = env.CRUXSET_CLOUDBASE_OWNER_OPENID
  if (!endpoint || !storage || !secret || !owner)
    fail('NOT_CONFIGURED', 'CloudBase 发布服务尚未配置。', 503)
  const send = async (url: string, init: RequestInit) => {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) })
    if (!r.ok) throw new Error('CloudBase 服务请求失败，请管理员重试。')
    return r
  }
  const upload = async (
    data: ArrayBuffer,
    filename: string,
    type: string,
    purpose?: string,
  ) => {
    const metadata = {
      timestamp: String(Math.floor(Date.now() / 1000)),
      filename,
      contentType: type,
      contentSha256: await digest(data),
      contentLength: data.byteLength,
      ...(purpose ? { purpose } : {}),
    }
    const grant = (await (
      await send(storage, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cruxset-signature': await signature(metadata, secret),
        },
        body: JSON.stringify(metadata),
      })
    ).json()) as Row
    const file = grant.fileID ?? grant.fileId ?? grant.file_id,
      url = grant.uploadUrl ?? grant.upload_url,
      meta = grant.cloudObjectMeta ?? grant.cosFileID ?? grant.cosFileId
    if (
      typeof file !== 'string' ||
      !file.startsWith('cloud://') ||
      !url ||
      !grant.authorization ||
      !grant.token ||
      !meta ||
      !grant.cloudPath
    )
      throw new Error('CloudBase 上传授权无效。')
    await send(url, {
      method: 'PUT',
      headers: {
        Signature: grant.authorization,
        Authorization: grant.authorization,
        'X-Cos-Security-Token': grant.token,
        'X-Cos-Meta-Fileid': meta,
        key: encodeURIComponent(grant.cloudPath),
        'Content-Type': type,
      },
      body: data,
    })
    return file
  }
  const imageFileId = await upload(image, 'display.webp', 'image/webp')
  const payload = {
    ...snapshot,
    holds: normalizedHolds(
      snapshot.holds,
      snapshot.imageWidth,
      snapshot.imageHeight,
    ),
    imageFileId,
    ownerOpenid: owner,
    timestamp: Math.floor(Date.now() / 1000),
    description: '',
    angleOptions: [20, 25, 30, 35, 40, 45],
    geometryType: 'polygon',
    visibility: 'public',
  }
  const signed = { ...payload, signature: await signature(payload, secret) }
  const payloadFileId = await upload(
    new TextEncoder().encode(JSON.stringify(signed)).buffer as ArrayBuffer,
    'segmentation-publish.json',
    'application/json',
    'segmentation-payload',
  )
  const result = (await (
    await send(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payloadFileId }),
    })
  ).json()) as Row
  if (typeof result.wallId !== 'string' || !result.wallId)
    throw new Error('CloudBase 发布结果无效。')
  return {
    wallId: result.wallId,
    ...(typeof result.browseUrl === 'string'
      ? { browseUrl: result.browseUrl }
      : {}),
  }
}

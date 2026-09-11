export interface LabEnv {
  DB?: D1Database
  MEDIA?: R2Bucket
  LAB_RUNNER_KEY?: string
  LAB_GITHUB_TOKEN?: string
  LAB_GITHUB_REPOSITORY?: string
  LAB_GITHUB_REF?: string
  LAB_GITHUB_WORKFLOW?: string
}
export type ReadyEnv = LabEnv & { DB: D1Database; MEDIA: R2Bucket }
export type Row = Record<string, any>
export const BASE = '/api/v1/segmentation-lab'
export const MiB = 1024 * 1024
export class LabError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}
export function fail(code: string, message: string, status = 422): never {
  throw new LabError(code, message, status)
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
export async function digest(value: string | ArrayBuffer) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof value === 'string' ? new TextEncoder().encode(value) : value,
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}
export async function equalSecret(a: string, b: string) {
  const x = await digest(a),
    y = await digest(b)
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return d === 0
}
export const bearer = (r: Request) =>
  r.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? ''
export async function bytes(
  request: Request,
  limit: number,
): Promise<ArrayBuffer> {
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (length > limit) fail('TOO_LARGE', '文件或请求超过大小限制。', 413)
  if (!request.body) return new ArrayBuffer(0)
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        fail('TOO_LARGE', '文件或请求超过大小限制。', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    result.set(c, at)
    at += c.length
  }
  return result.buffer
}
export async function body(request: Request, limit = MiB): Promise<Row> {
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await bytes(request, limit)),
    )
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('INVALID_INPUT', '需要 JSON 对象。')
    return value
  } catch (e) {
    if (e instanceof LabError) throw e
    return fail('INVALID_INPUT', 'JSON 格式无效。')
  }
}
export function imageSize(data: ArrayBuffer, type: string) {
  const b = new Uint8Array(data),
    v = new DataView(data)
  let width = 0,
    height = 0
  if (
    type === 'image/png' &&
    b.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => b[i] === x) &&
    v.getUint32(12) === 0x49484452
  ) {
    width = v.getUint32(16)
    height = v.getUint32(20)
  } else if (type === 'image/jpeg' && b[0] === 255 && b[1] === 216) {
    let p = 2
    while (p + 4 <= b.length) {
      if (b[p++] !== 255) break
      while (b[p] === 255) p++
      const marker = b[p++]
      if (marker === 217 || marker === 218) break
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue
      if (p + 2 > b.length) break
      const n = v.getUint16(p)
      if (n < 2 || p + n > b.length) break
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        n >= 8
      ) {
        height = v.getUint16(p + 3)
        width = v.getUint16(p + 5)
        break
      }
      p += n
    }
  }
  if (!width || !height) fail('INVALID_IMAGE', '图片无效，请上传 JPEG 或 PNG。')
  if (width > 4096 || height > 4096 || width * height > 16777216)
    fail('IMAGE_TOO_LARGE', '图片最长边不能超过 4096 像素，请先裁剪或缩小。')
  return { width, height }
}
export function parameters(value: unknown) {
  const defaults: Row = {
    points_per_side: 48,
    points_per_batch: 8,
    pred_iou_thresh: 0.85,
    stability_score_thresh: 0.9,
    crop_n_layers: 0,
  }
  if (value === undefined) return defaults
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('INVALID_PARAMETERS', '分割参数无效。')
  const p = { ...defaults, ...value }
  for (const k of Object.keys(p)) {
    if (!(k in defaults) || typeof p[k] !== 'number' || !Number.isFinite(p[k]))
      fail('INVALID_PARAMETERS', '包含不支持的分割参数。')
  }
  if (
    !Number.isInteger(p.points_per_side) ||
    p.points_per_side < 8 ||
    p.points_per_side > 64 ||
    !Number.isInteger(p.points_per_batch) ||
    p.points_per_batch < 1 ||
    p.points_per_batch > 8 ||
    p.pred_iou_thresh < 0 ||
    p.pred_iou_thresh > 1 ||
    p.stability_score_thresh < 0 ||
    p.stability_score_thresh > 1 ||
    p.crop_n_layers !== 0
  )
    fail(
      'INVALID_PARAMETERS',
      '点密度须为 8–64，批量为 1–8，裁剪层为 0，阈值为 0–1。',
    )
  return p
}
export function candidates(
  value: unknown,
  width: number,
  height: number,
): Row[] {
  if (!Array.isArray(value) || value.length > 5000)
    fail('INVALID_CANDIDATES', '候选数量不能超过 5000。')
  const ids = new Set<string>()
  let vertices = 0
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !/^[\w-]{1,120}$/.test(item.id) ||
      ids.has(item.id)
    )
      fail('INVALID_CANDIDATES', '候选编号无效或重复。')
    ids.add(item.id)
    if (item.kind !== undefined && !['hold', 'volume'].includes(item.kind))
      fail('INVALID_CANDIDATES', '岩点类型无效。')
    if (
      !Array.isArray(item.polygon) ||
      item.polygon.length < 3 ||
      item.polygon.length > 10000
    )
      fail('INVALID_CANDIDATES', '每个轮廓至少需要三个点。')
    vertices += item.polygon.length
    if (vertices > 200000) fail('INVALID_CANDIDATES', '轮廓顶点过多。')
    let twiceArea = 0
    for (let i = 0; i < item.polygon.length; i++) {
      const p = item.polygon[i]
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v)) ||
        p[0] < 0 ||
        p[1] < 0 ||
        p[0] > width ||
        p[1] > height
      )
        fail('INVALID_CANDIDATES', '轮廓坐标超出图片范围。')
    }
    for (let i = 0; i < item.polygon.length; i++) {
      const p = item.polygon[i],
        prev = item.polygon[(i + item.polygon.length - 1) % item.polygon.length]
      twiceArea += prev[0] * p[1] - p[0] * prev[1]
    }
    if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) < 0.001)
      fail('INVALID_CANDIDATES', '轮廓面积不能为零。')
  }
  return value
}
export async function objectResponse(
  env: ReadyEnv,
  key: string,
  type?: string,
) {
  const object = await env.MEDIA.get(key)
  if (!object) fail('NOT_FOUND', '文件不存在。', 404)
  return new Response(object.body, {
    headers: {
      'Content-Type':
        type ?? object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
export async function experiment(
  env: ReadyEnv,
  id: string,
  owner?: string,
): Promise<Row> {
  const row = await env.DB.prepare(
    'SELECT * FROM lab_experiments WHERE id=? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<Row>()
  if (!row || (owner && row.owner_id !== owner))
    fail('NOT_FOUND', '实验不存在。', 404)
  return row
}
export function configured(env: LabEnv) {
  return Boolean(
    env.LAB_GITHUB_TOKEN &&
      env.LAB_RUNNER_KEY &&
      env.LAB_GITHUB_REPOSITORY &&
      env.LAB_GITHUB_REF,
  )
}

import { it, expect } from 'vitest'
import { handleLab } from '../src/lab/index.js'
import { database } from './helpers/database.js'

it('advertises cross-platform review permissions and limits request listing to the applicant', async () => {
  const { db, sqlite } = database()
  sqlite.exec(
    "INSERT INTO lab_publish_requests (id,applicant_id,experiment_id,calibration_id,wall_name,target,status,snapshot_key,created_at) VALUES ('r','other','e','c','Wall','cloudbase','pending','snapshot',1000)",
  )
  const env = { DB: db, MEDIA: {} as R2Bucket },
    user = { id: 'member', role: 'user', lab_enabled: 1 }
  const call = (path: string, u = user) =>
    handleLab(
      new Request('https://example.test/api/v1/segmentation-lab' + path),
      env,
      u,
    )
  expect(await (await call('/models')).json()).toMatchObject({
    isAdmin: false,
    publishTargets: ['cloudflare', 'cloudbase'],
    requestTargets: ['cloudbase'],
  })
  expect(await (await call('/publish-requests')).json()).toEqual({
    isAdmin: false,
    items: [],
  })
  expect((await call('/publish-requests/r/preview')).status).toBe(404)
  expect(
    (
      (await (
        await call('/publish-requests', {
          id: 'admin',
          role: 'admin',
          lab_enabled: 1,
        })
      ).json()) as any
    ).items,
  ).toHaveLength(1)
})

import { vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'
import {
  createPublishRequest,
  approvePublishRequest,
} from '../src/lab/publish-requests.js'
import { canonical } from '../src/lab/cloudbase.js'
const cloudbase = createRequire(import.meta.url)(
  '../../wechat/cloudfunctions/segmentationPublish/index.js',
)
afterEach(() => vi.unstubAllGlobals())
function fixture() {
  const { db, sqlite } = database(),
    objects = new Map<string, string | ArrayBuffer>()
  const media = {
    put: async (k: string, v: any) => {
      objects.set(
        k,
        typeof v === 'string' ? v : await new Response(v).arrayBuffer(),
      )
    },
    get: async (k: string) => {
      const v = objects.get(k)
      return v === undefined
        ? null
        : {
            body: new Response(v).body,
            text: async () => new Response(v).text(),
          }
    },
    delete: async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k)
    },
  } as unknown as R2Bucket
  objects.set(
    'candidates',
    JSON.stringify({
      items: [
        {
          id: 'a',
          kind: 'hold',
          polygon: [
            [0, 0],
            [80, 0],
            [80, 80],
            [0, 80],
          ],
        },
      ],
    }),
  )
  objects.set('display', 'RIFF-original-WEBP')
  const env = {
    DB: db,
    MEDIA: media,
    CRUXSET_CLOUDBASE_FUNCTION_URL: 'https://mock/publish',
    CRUXSET_CLOUDBASE_STORAGE_URL: 'https://mock/storage',
    CRUXSET_CLOUDBASE_SIGNING_KEY: 'test-key',
    CRUXSET_CLOUDBASE_OWNER_OPENID: 'admin-openid',
  }
  const user = { id: 'member', role: 'user', lab_enabled: 1 },
    admin = { id: 'admin', role: 'admin', lab_enabled: 1 }
  const call = (path: string, u = user, body?: any) =>
    handleLab(
      new Request('https://example.test/api/v1/segmentation-lab' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Origin: 'https://example.test',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      u,
    )
  const create = () =>
    createPublishRequest(
      env,
      { id: 'e', name: 'source', width: 100, height: 100 },
      { id: 'c', candidates_key: 'candidates', display_key: 'display' },
      user,
      { target: 'cloudbase', wallName: '<Wall>' },
    )
  return { env, sqlite, objects, call, create, user, admin }
}
it('lists only review applications, retaining direct publication records for retries', async () => {
  const f = fixture()
  const application = await f.create()
  const direct = await createPublishRequest(
    f.env,
    { id: 'admin-e', name: 'Admin source', width: 100, height: 100 },
    { id: 'admin-c', candidates_key: 'candidates', display_key: 'display' },
    f.admin,
    { target: 'cloudbase', wallName: 'Direct wall' },
    false,
  )
  const adminList = await (await f.call('/publish-requests', f.admin)).json() as any
  expect(adminList.items.map((item: any) => item.id)).toEqual([application.id])
  expect(f.sqlite.prepare('SELECT id FROM lab_publish_requests WHERE id=?').get(direct.id)).toBeTruthy()
  expect((await f.call(`/publish-requests/${direct.id}/preview`, f.admin)).status).toBe(404)
  expect((await f.call(`/publish-requests/${direct.id}/approve`, f.admin, {})).status).toBe(404)
})
it('copies an immutable request snapshot, deduplicates, authorizes preview and rejects with reason', async () => {
  const f = fixture(),
    r = await f.create()
  expect((await f.create()).id).toBe(r.id)
  f.objects.delete('display')
  f.objects.delete('candidates')
  const preview = await f.call(`/publish-requests/${r.id}/preview`)
  expect(preview.status).toBe(200)
  expect(await preview.text()).toContain('&lt;Wall&gt;')
  expect(await (await f.call(`/publish-requests/${r.id}/image`)).text()).toBe(
    'RIFF-original-WEBP',
  )
  expect(
    (await f.call(`/publish-requests/${r.id}/approve`, f.user, {})).status,
  ).toBe(403)
  expect(
    (
      await f.call(`/publish-requests/${r.id}/reject`, f.admin, {
        reason: 'Needs correction',
      })
    ).status,
  ).toBe(200)
  expect(
    (await f.call(`/publish-requests/${r.id}/approve`, f.admin, {})).status,
  ).toBe(409)
})
it('validates CloudBase protocol, persists failures and safely retries one stable request after a lease', async () => {
  const f = fixture(),
    r = await f.create(),
    signed: any[] = [],
    uploads = new Map<string, ArrayBuffer>()
  let grantCount = 0,
    failPublish = true
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === 'https://mock/storage') {
        const metadata = JSON.parse(String(init.body))
        expect(new Headers(init.headers).get('x-cruxset-signature')).toBe(
          createHmac('sha256', 'test-key')
            .update(canonical(metadata))
            .digest('hex'),
        )
        const id = String(++grantCount)
        return Response.json({
          fileID: `cloud://env/${metadata.purpose ? 'segmentation-payloads' : 'images'}/${id}`,
          uploadUrl: 'https://mock/upload/' + id,
          authorization: 'auth',
          token: 'token',
          cloudObjectMeta: 'meta',
          cloudPath: 'path/' + id,
        })
      }
      if (url.startsWith('https://mock/upload/')) {
        const id = url.split('/').at(-1)!
        expect(new Headers(init.headers).get('key')).toBe('path%2F' + id)
        uploads.set(id, init.body as ArrayBuffer)
        return new Response('')
      }
      const { payloadFileId } = JSON.parse(String(init.body)),
        payload = JSON.parse(
          new TextDecoder().decode(
            uploads.get(payloadFileId.split('/').at(-1)),
          ),
        )
      const { signature, ...unsigned } = payload
      expect(signature).toBe(
        createHmac('sha256', 'test-key')
          .update(cloudbase._canonicalize(unsigned))
          .digest('hex'),
      )
      cloudbase._validatePayload(payload)
      signed.push(payload)
      expect(payload.ownerOpenid).toBe('admin-openid')
      expect(payload.holds[0].bbox).toEqual([0, 0, 0.8, 0.8])
      expect(payload.imageWidth).toBe(100)
      return failPublish
        ? new Response('failed', { status: 503 })
        : Response.json({ wallId: 'published-wall' })
    }),
  )
  expect((await approvePublishRequest(f.env, r.id, 'admin')).status).toBe(
    'failed',
  )
  expect((await f.create()).id).toBe(r.id)
  f.sqlite
    .prepare(
      "UPDATE lab_publish_requests SET status='publishing',lease_until=? WHERE id=?",
    )
    .run(Date.now() + 100000, r.id)
  await expect(approvePublishRequest(f.env, r.id, 'admin')).rejects.toThrow(
    '正在处理',
  )
  f.sqlite
    .prepare('UPDATE lab_publish_requests SET lease_until=0 WHERE id=?')
    .run(r.id)
  failPublish = false
  const result = await approvePublishRequest(f.env, r.id, 'admin')
  expect(result.status).toBe('published')
  expect(JSON.parse(result.result)).toEqual({ wallId: 'published-wall' })
  expect(signed[0].publishRequestId).toBe(signed[1].publishRequestId)
  const count = grantCount
  expect((await approvePublishRequest(f.env, r.id, 'admin')).status).toBe(
    'published',
  )
  expect(grantCount).toBe(count)
})
it('concurrent submissions retain one snapshot and failed requests cannot be rejected or replaced', async () => {
  const f = fixture(),
    rows = await Promise.all([f.create(), f.create()])
  expect(rows[0].id).toBe(rows[1].id)
  expect(
    [...f.objects.keys()].filter((k) => k.startsWith('lab-publish-requests/')),
  ).toHaveLength(2)
  f.sqlite
    .prepare("UPDATE lab_publish_requests SET status='failed' WHERE id=?")
    .run(rows[0].id)
  expect(
    (
      await f.call(`/publish-requests/${rows[0].id}/reject`, f.admin, {
        reason: 'No',
      })
    ).status,
  ).toBe(409)
  expect((await f.create()).id).toBe(rows[0].id)
})

import { normalizedHolds } from '../src/lab/cloudbase.js'
it('normalizes concave holds to CloudBase interior points, area radii and stable reading order', () => {
  const holds = normalizedHolds(
    [
      {
        id: 'right',
        polygon: [
          [60, 1],
          [90, 1],
          [90, 30],
          [60, 30],
        ],
      },
      {
        id: 'concave',
        polygon: [
          [0, 0],
          [50, 0],
          [50, 10],
          [10, 10],
          [10, 50],
          [0, 50],
        ],
      },
    ],
    100,
    100,
  )
  expect(holds.map((h) => h.sourceId)).toEqual(['concave', 'right'])
  expect(() =>
    cloudbase._validatePayload({
      publishRequestId: 'r',
      sourceExperimentId: 'e',
      sourceCalibrationId: 'c',
      wallName: 'Wall',
      imageWidth: 100,
      imageHeight: 100,
      imageFileId: 'cloud://image',
      ownerOpenid: 'admin',
      holds,
    }),
  ).not.toThrow()
})

it.each([
  {
    label: 'small normalized area',
    polygon: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    size: 2000,
  },
  {
    label: 'self-intersection with nonzero area',
    polygon: [
      [0, 0],
      [80, 80],
      [0, 80],
      [60, 0],
    ],
    size: 100,
  },
])(
  'rejects $label before retaining a request or uploading a snapshot',
  async ({ polygon, size }) => {
    const f = fixture()
    f.objects.set(
      'candidates',
      JSON.stringify({ items: [{ id: 'bad', polygon }] }),
    )
    await expect(
      createPublishRequest(
        f.env,
        { id: 'e', name: 'source', width: size, height: size },
        { id: 'c', candidates_key: 'candidates', display_key: 'display' },
        f.user,
        { target: 'cloudbase', wallName: 'Wall' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CANDIDATES' })
    expect(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM lab_publish_requests').get()
        .n,
    ).toBe(0)
    expect(
      [...f.objects.keys()].filter((k) =>
        k.startsWith('lab-publish-requests/'),
      ),
    ).toEqual([])
  },
)
it('accepts a valid concave polygon when creating an immutable request', async () => {
  const f = fixture()
  f.objects.set(
    'candidates',
    JSON.stringify({
      items: [
        {
          id: 'concave',
          polygon: [
            [0, 0],
            [50, 0],
            [50, 10],
            [10, 10],
            [10, 50],
            [0, 50],
          ],
        },
      ],
    }),
  )
  expect((await f.create()).status).toBe('pending')
})

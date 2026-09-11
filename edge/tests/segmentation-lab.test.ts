import { describe, it, expect, vi, afterEach } from 'vitest'
import worker from '../src/index.js'
import { database } from './helpers/database.js'

afterEach(() => vi.unstubAllGlobals())
async function fixture() {
  const { db, sqlite } = database()
  sqlite.exec(
    "INSERT INTO users VALUES ('admin','Admin',1,1); INSERT INTO admins (user_id,role,created_at,updated_at,email_normalized,password_hash) VALUES ('admin','admin',1,1,'admin@example.com','x')",
  )
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('session'),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
  sqlite
    .prepare('INSERT INTO sessions VALUES (?,?,?,?)')
    .run(hash, 'admin', Date.now() + 3600000, Date.now())
  const objects = new Map<string, { bytes: Uint8Array; type: string }>()
  const media = {
    put: async (key: string, value: any, options: any) => {
      if (options?.onlyIf && objects.has(key)) return null
      objects.set(key, {
        bytes: new Uint8Array(await new Response(value).arrayBuffer()),
        type: options?.httpMetadata?.contentType ?? 'application/octet-stream',
      })
      return {}
    },
    get: async (key: string) => {
      const o = objects.get(key)
      return o
        ? {
            body: new Blob([o.bytes]).stream(),
            size: o.bytes.length,
            httpMetadata: { contentType: o.type },
            text: async () => new TextDecoder().decode(o.bytes),
          }
        : null
    },
    head: async (key: string) =>
      objects.has(key) ? { size: objects.get(key)!.bytes.length } : null,
    delete: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
    },
    list: async ({ prefix }: { prefix: string }) => ({
      objects: [...objects.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key })),
      truncated: false,
    }),
  } as unknown as R2Bucket
  const env = {
    DB: db,
    MEDIA: media,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    LAB_RUNNER_KEY: 'runner-secret',
    LAB_GITHUB_TOKEN: 'dispatch-secret',
    LAB_GITHUB_REPOSITORY: 'owner/repo',
    LAB_GITHUB_REF: 'main',
    LAB_GITHUB_WORKFLOW: 'segmentation-lab.yml',
  }
  const call = (path: string, init: RequestInit = {}, auth = 'session') =>
    worker.fetch!(
      new Request(
        'https://cruxset.xinyilab.top/api/v1/segmentation-lab' + path,
        {
          ...init,
          headers: {
            ...(auth === 'session' || auth.startsWith('cookie:')
              ? { Cookie: 'cruxset_session=' + (auth === 'session' ? 'session' : auth.slice(7)) }
              : auth
                ? { Authorization: 'Bearer ' + auth }
                : {}),
            ...(init.method && init.method !== 'GET'
              ? { Origin: 'https://cruxset.xinyilab.top' }
              : {}),
            ...init.headers,
          },
        },
      ),
      env,
      {} as any,
    ) as Promise<Response>
  const post = (path: string, body: any, auth = 'session') =>
    call(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      auth,
    )
  const upload = async () => {
    const form = new FormData()
    form.set(
      'image',
      new File(
        [
          Uint8Array.from(
            atob(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
            ),
            (c) => c.charCodeAt(0),
          ),
        ],
        'wall.png',
        { type: 'image/png' },
      ),
    )
    const r = await call('/experiments', { method: 'POST', body: form })
    expect(r.status).toBe(201)
    return (await r.json()) as any
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  )
  const addAccount = async (id: string, role = 'user') => {
    sqlite.prepare('INSERT INTO users VALUES (?,?,1,1)').run(id, id)
    sqlite.prepare('INSERT INTO admins (user_id,role,created_at,updated_at,email_normalized,password_hash) VALUES (?,?,1,1,?,?)').run(id, role, id + '@example.com', 'x')
    const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)))].map(n => n.toString(16).padStart(2, '0')).join('')
    sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(tokenHash, id, Date.now() + 3600000, Date.now())
    return 'cookie:' + id
  }
  const apiCall = (path: string, method = 'GET', body?: unknown, token = 'session', origin: string | null = 'https://cruxset.xinyilab.top') => worker.fetch!(new Request('https://cruxset.xinyilab.top/api/v1' + path, {
    method, headers: { ...(token ? {Cookie: 'cruxset_session=' + token} : {}), ...(origin ? {Origin: origin} : {}), 'Content-Type': 'application/json' },
    ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
  }), env, {} as any) as Promise<Response>
  return { env, sqlite, objects, call, post, upload, addAccount, apiCall }
}
describe('cloud segmentation lab', () => {
  it('grants and revokes lab access on an existing member session without administrator powers', async () => {
    const f = await fixture()
    await f.addAccount('member')
    expect((await f.call('/experiments', {}, 'cookie:member')).status).toBe(403)
    const before = await (await f.apiCall('/bootstrap', 'GET', undefined, 'member')).json() as any
    expect(before.capabilities).toMatchObject({segmentationLab:false,manageLabAccess:false})
    expect((await f.apiCall('/auth/admin/users/member/lab-access', 'PATCH', {enabled:true})).status).toBe(200)
    const response = await f.apiCall('/bootstrap', 'GET', undefined, 'member')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({user:{isAdmin:false,labEnabled:true},capabilities:{segmentationLab:true,manageLabAccess:false,wallAuthoring:false,imageUpload:false}})
    expect(await (await f.apiCall('/auth/me', 'GET', undefined, 'member')).json()).toMatchObject({user:{labEnabled:true}})
    expect((await f.call('/experiments', {}, 'cookie:member')).status).toBe(200)
    expect((await f.apiCall('/auth/admin/users', 'GET', undefined, 'member')).status).toBe(403)
    expect((await f.apiCall('/walls', 'POST', {}, 'member')).status).toBe(403)
    expect((await f.apiCall('/auth/admin/users/member/lab-access', 'PATCH', {enabled:false})).status).toBe(200)
    expect((await f.call('/experiments', {}, 'cookie:member')).status).toBe(403)
    expect((await f.call('/models', {}, 'cookie:member')).status).toBe(403)
    expect(await (await f.apiCall('/bootstrap', 'GET', undefined, 'member')).json()).toMatchObject({capabilities:{segmentationLab:false}})
    const users = await (await f.apiCall('/auth/admin/users')).json() as any
    expect(users.users.find((u:any) => u.id === 'member')).toMatchObject({role:'user',labEnabled:false})
    expect(await (await f.apiCall('/bootstrap')).json()).toMatchObject({capabilities:{segmentationLab:true,manageLabAccess:true}})
  })
  it('allows only administrators to change strict boolean grants from the same origin', async () => {
    const f = await fixture()
    await f.addAccount('member')
    const path = '/auth/admin/users/member/lab-access'
    expect((await f.apiCall(path, 'PATCH', {enabled:true}, '')).status).toBe(401)
    expect((await f.apiCall(path, 'PATCH', {enabled:true}, 'member')).status).toBe(403)
    for (const body of [{}, {enabled:'false'}, {enabled:1}, null, {enabled:true,role:'admin'}]) {
      expect((await f.apiCall(path, 'PATCH', body)).status).toBe(422)
    }
    for (const origin of [null, 'https://evil.example', 'https://api.cruxset.xinyilab.top']) {
      expect((await f.apiCall(path, 'PATCH', {enabled:true}, 'session', origin)).status).toBe(403)
    }
    expect((await f.apiCall('/auth/admin/users/missing/lab-access', 'PATCH', {enabled:true})).status).toBe(404)
    expect((await f.apiCall('/auth/admin/users/admin/lab-access', 'PATCH', {enabled:false})).status).toBe(409)
    expect((await f.call('/experiments', {}, 'cookie:member')).status).toBe(403)
  })
  it('requires a session and keeps input objects out of public media routes', async () => {
    const f = await fixture()
    expect((await f.call('/experiments', {}, '')).status).toBe(401)
    await f.upload()
    const key = [...f.objects.keys()][0]
    const response = await worker.fetch!(
      new Request(
        'https://cruxset.xinyilab.top/api/v1/media/' + encodeURIComponent(key),
      ),
      f.env,
      {} as any,
    )
    expect(response.status).toBe(404)
  })
  it.each(['admin', 'creator'])('runs upload through public publication as %s', async (role) => {
    const f = await fixture()
    if (role === 'creator') {
      await f.addAccount('manager', 'admin')
      f.sqlite.exec("UPDATE admins SET role='user' WHERE user_id='admin'")
      expect((await f.apiCall('/auth/admin/users/admin/lab-access', 'PATCH', {enabled: true}, 'manager')).status).toBe(200)
    }
    const e = await f.upload()
    const r = await f.post(`/experiments/${e.id}/runs`, {
      model: 'sam2',
      parameters: { points_per_side: 48, points_per_batch: 8 },
    })
    expect(r.status).toBe(202)
    const { taskId } = (await r.json()) as any
    const dispatched = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as any).body,
    )
    expect(dispatched.inputs.task_id).toBe(taskId)
    const claim = await f.post(
      '/runner/claim',
      { taskId, attemptId: dispatched.inputs.attempt_id, runId: '123:1' },
      'runner-secret',
    )
    expect(claim.status).toBe(200)
    const { token } = (await claim.json()) as any
    expect(
      (
        await f.post(
          '/runner/claim',
          { taskId, attemptId: dispatched.inputs.attempt_id, runId: '456:1' },
          'runner-secret',
        )
      ).status,
    ).toBe(409)
    const route = `/runner/tasks/${taskId}`
    expect((await f.call(route + '/input', {}, token)).status).toBe(200)
    expect(
      (await f.post(route + '/complete', { status: 'succeeded' }, token))
        .status,
    ).toBe(409)
    const items = [
      {
        id: 'h1',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        area: 1,
        bbox: { x1: 0, y1: 0, x2: 1, y2: 1 },
        score: 0.9,
        metadata: {},
      },
    ]
    for (const [name, body] of [
      ['candidates.json', JSON.stringify({ items })],
      ['display.webp', 'RIFFxxxxWEBPVP8 x'],
      ['masks.zip', 'PK\u0003\u0004data'],
    ])
      expect(
        (
          await f.call(
            route + '/outputs/' + name,
            {
              method: 'PUT',
              body,
              headers: {
                'Content-Length': String(new TextEncoder().encode(body).length),
              },
            },
            token,
          )
        ).status,
      ).toBe(200)
    expect(
      (await f.post(route + '/complete', { status: 'succeeded' }, token))
        .status,
    ).toBe(200)
    expect(
      (await f.post(route + '/complete', { status: 'succeeded' }, token))
        .status,
    ).toBe(200)
    expect(
      (
        await f.call(
          route + '/outputs/candidates.json',
          { method: 'PUT', body: JSON.stringify({ items: [] }) },
          token,
        )
      ).status,
    ).toBe(409)
    const c = await f.post(`/experiments/${e.id}/calibrations`, {
      sourceTaskId: taskId,
      candidates: items,
      changes: {},
    })
    expect(c.status).toBe(201)
    const calibration = (await c.json()) as any
    const p = `/experiments/${e.id}/calibrations/${calibration.id}/publish`
    const first = await f.post(p, { wallName: 'Wall', target: 'cloudflare' })
    expect(first.status).toBe(201)
    const second = await f.post(p, { wallName: 'Wall', target: 'cloudflare' })
    expect(second.status).toBe(200)
    expect(f.sqlite.prepare('SELECT owner_id,visibility,published FROM walls').get()).toMatchObject({owner_id:'admin',visibility:'public',published:1})
    await f.addAccount('other')
    const manager = role === 'creator' ? 'manager' : 'session'
    expect((await f.apiCall('/auth/admin/users/other/lab-access', 'PATCH', {enabled:true}, manager)).status).toBe(200)
    for (const path of [`/experiments/${e.id}`, `/experiments/${e.id}/image`, `/experiments/${e.id}/candidates?source=${taskId}`, `/experiments/${e.id}/calibrations/${calibration.id}`]) {
      expect((await f.call(path, {}, 'cookie:other')).status).toBe(404)
    }
    expect((await f.post(p, {wallName:'Stolen',target:'cloudflare'}, 'cookie:other')).status).toBe(404)
    if (role === 'creator') {
      expect((await f.apiCall('/auth/admin/users/admin/lab-access', 'PATCH', {enabled:false}, manager)).status).toBe(200)
      expect((await f.post(p, {wallName:'Wall',target:'cloudflare'})).status).toBe(403)
      expect(f.sqlite.prepare('SELECT COUNT(*) n FROM walls').get().n).toBe(1)
      expect((await f.apiCall('/auth/admin/users/admin/lab-access', 'PATCH', {enabled:true}, manager)).status).toBe(200)
    }
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM walls').get().n).toBe(1)
    expect(
      (
        await f.call(
          `/experiments/${e.id}/calibrations/${calibration.id}/export.svg`,
        )
      ).headers.get('Content-Type'),
    ).toContain('image/svg+xml')
    expect(
      (
        await f.call(`/experiments/${e.id}/runs/${taskId}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(204)
    const saved = (await (await f.call('/calibrations')).json()) as any
    expect(saved.items[0].sourceTaskId).toBeNull()
    expect(
      (await f.call(`/experiments/${e.id}/calibrations/${calibration.id}`))
        .status,
    ).toBe(200)
    expect(
      (
        await f.post(`/experiments/${e.id}/calibrations`, {
          sourceTaskId: null,
          candidates: items,
          changes: {},
        })
      ).status,
    ).toBe(201)
    expect(
      (await f.call(`/experiments/${e.id}`, { method: 'DELETE' })).status,
    ).toBe(204)
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM walls').get().n).toBe(1)
    expect(
      (await f.post(route + '/complete', { status: 'succeeded' }, token))
        .status,
    ).toBe(401)
  })
  it('limits parameters and pending tasks and records dispatch failures', async () => {
    const f = await fixture(),
      e = await f.upload()
    expect(
      (
        await f.post(`/experiments/${e.id}/runs`, {
          model: 'sam2',
          parameters: { points_per_batch: 1000 },
        })
      ).status,
    ).toBe(422)
    for (let i = 0; i < 2; i++)
      expect(
        (await f.post(`/experiments/${e.id}/runs`, { model: 'sam2' })).status,
      ).toBe(202)
    expect(
      (await f.post(`/experiments/${e.id}/runs`, { model: 'sam2' })).status,
    ).toBe(429)
  })
  it('rejects cross-origin changes, invalid files and unknown parameters', async () => {
    const f = await fixture(),
      e = await f.upload()
    expect(
      (
        await f.call('/experiments', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await worker.fetch!(
          new Request(
            'https://cruxset.xinyilab.top/api/v1/segmentation-lab/experiments',
            { method: 'POST', headers: { Cookie: 'cruxset_session=session' } },
          ),
          f.env,
          {} as any,
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await f.post(`/experiments/${e.id}/runs`, {
          model: 'sam2',
          parameters: { model: 'evil' },
        })
      ).status,
    ).toBe(422)
    const form = new FormData()
    form.set('image', new File(['hello'], 'fake.png', { type: 'image/png' }))
    expect(
      (await f.call('/experiments', { method: 'POST', body: form })).status,
    ).toBe(422)
  })
  it('records failed dispatch and expires queued tasks without accepting late claims', async () => {
    const f = await fixture(),
      e = await f.upload()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('private upstream error', { status: 403 }),
      ),
    )
    const failed = await f.post(`/experiments/${e.id}/runs`, { model: 'sam2' })
    expect(((await failed.json()) as any).status).toBe('failed')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )
    const { taskId } = (await (
      await f.post(`/experiments/${e.id}/runs`, { model: 'sam2' })
    ).json()) as any
    const t = f.sqlite.prepare('SELECT * FROM lab_tasks WHERE id=?').get(taskId)
    f.sqlite.prepare('UPDATE lab_tasks SET deadline=1 WHERE id=?').run(taskId)
    const list = (await (await f.call('/experiments')).json()) as any
    expect(list.items[0].runs[taskId].status).toBe('timed_out')
    expect(
      (
        await f.post(
          '/runner/claim',
          { taskId, attemptId: t.attempt_id, runId: '12:1' },
          'runner-secret',
        )
      ).status,
    ).toBe(409)
    expect(JSON.stringify(list)).not.toContain('private upstream error')
  })
  it('allows only one claimant and invalidates tokens on deletion', async () => {
    const f = await fixture(),
      e = await f.upload(),
      { taskId } = (await (
        await f.post(`/experiments/${e.id}/runs`, { model: 'sam2' })
      ).json()) as any
    const t = f.sqlite.prepare('SELECT * FROM lab_tasks WHERE id=?').get(taskId)
    const claims = await Promise.all(
      [1, 2].map((i) =>
        f.post(
          '/runner/claim',
          { taskId, attemptId: t.attempt_id, runId: `12:${i}` },
          'runner-secret',
        ),
      ),
    )
    expect(claims.map((r) => r.status).sort()).toEqual([200, 409])
    const { token } = (await claims
      .find((r) => r.status === 200)!
      .json()) as any
    expect(
      (
        await f.call(`/experiments/${e.id}/runs/${taskId}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(204)
    expect(
      (
        await f.post(
          `/runner/tasks/${taskId}/progress`,
          { progress: 0.5, message: 'working' },
          token,
        )
      ).status,
    ).toBe(401)
  })
  it('rejects degenerate or hostile calibration polygons', async () => {
    const f = await fixture(),
      e = await f.upload()
    expect(
      (
        await f.post(`/experiments/${e.id}/calibrations`, {
          sourceTaskId: 'missing',
          candidates: [
            {
              id: '<script>',
              polygon: [
                [0, 0],
                [1, 0],
                [1, 1],
              ],
            },
          ],
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await f.post(`/experiments/${e.id}/calibrations`, {
          sourceTaskId: 'missing',
          candidates: [
            {
              id: 'h1',
              polygon: [
                [0, 0],
                [0, 0],
                [0, 0],
              ],
            },
          ],
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await f.post(`/experiments/${e.id}/calibrations`, {
          sourceTaskId: 'missing',
          candidates: [{ id: 'h1', polygon: [[0, 0], [1, 0], null] }],
        })
      ).status,
    ).toBe(422)
  })
  it('does not replace an already uploaded candidate result', async () => {
    const f = await fixture(),
      e = await f.upload(),
      { taskId } = (await (
        await f.post(`/experiments/${e.id}/runs`, { model: 'sam2' })
      ).json()) as any
    const t = f.sqlite.prepare('SELECT * FROM lab_tasks WHERE id=?').get(taskId)
    const { token } = (await (
      await f.post(
        '/runner/claim',
        { taskId, attemptId: t.attempt_id, runId: '12:1' },
        'runner-secret',
      )
    ).json()) as any
    const path = `/runner/tasks/${taskId}/outputs/candidates.json`
    await f.call(
      path,
      { method: 'PUT', body: JSON.stringify({ items: [] }) },
      token,
    )
    await f.call(
      path,
      {
        method: 'PUT',
        body: JSON.stringify({
          items: [
            {
              id: 'h',
              polygon: [
                [0, 0],
                [1, 0],
                [1, 1],
              ],
            },
          ],
        }),
      },
      token,
    )
    expect(
      new TextDecoder().decode(
        f.objects.get(t.output_prefix + 'candidates.json')!.bytes,
      ),
    ).toBe(JSON.stringify({ items: [] }))
  })
  it('routes cloud result and calibration navigation to shared static pages', async () => {
    const f = await fixture(),
      seen: string[] = []
    f.env.ASSETS = {
      fetch: async (r: Request) => {
        seen.push(new URL(r.url).pathname)
        return new Response('lab')
      },
    } as unknown as Fetcher
    for (const path of [
      '/segmentation-lab/results/abc',
      '/segmentation-lab/calibrations',
    ])
      await worker.fetch!(
        new Request('https://cruxset.xinyilab.top' + path),
        f.env,
        {} as any,
      )
    expect(seen).toEqual([
      '/segmentation-lab/results',
      '/segmentation-lab/calibration',
    ])
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import worker from '../src/index.js'
import { database } from './helpers/database.js'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
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
    ).toBe(200)
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

describe('creator quotas', () => {
  async function creator() {
    const f = await fixture()
    f.sqlite.exec("UPDATE admins SET role='user',lab_enabled=1 WHERE user_id='admin'")
    return f
  }
  it('limits retained images and releases capacity after deletion', async () => {
    const f = await creator()
    const images = []
    for (let i=0;i<10;i++) images.push(await f.upload())
    const count = f.objects.size
    const form = new FormData()
    form.set('image',new File([f.objects.values().next().value!.bytes],'extra.png',{type:'image/png'}))
    const rejected = await f.call('/experiments',{method:'POST',body:form})
    expect(rejected.status).toBe(429)
    expect(f.objects.size).toBe(count)
    await f.call(`/experiments/${images[0].id}`,{method:'DELETE'})
    await f.upload()
  })
  it('keeps daily usage when tasks are deleted and resets at Beijing midnight', async () => {
    const f = await creator(), e = await f.upload()
    f.sqlite.exec('UPDATE sessions SET expires_at=9999999999999')
    const now = Date.UTC(2026,8,11,15,59)
    const clock = vi.spyOn(Date,'now').mockReturnValue(now)
    try {
      for(let i=0;i<20;i++) {
        const response = await f.post(`/experiments/${e.id}/runs`,{})
        expect(response.status).toBe(202)
        const task:any = await response.json()
        await f.call(`/experiments/${e.id}/runs/${task.taskId}`,{method:'DELETE'})
      }
      expect((await f.post(`/experiments/${e.id}/runs`,{})).status).toBe(429)
      clock.mockReturnValue(Date.UTC(2026,8,11,16,0))
      expect((await f.post(`/experiments/${e.id}/runs`,{})).status).toBe(202)
    } finally {clock.mockRestore()}
  })
  it('limits retained tasks independently of daily usage and preserves two active slots', async () => {
    const f = await creator(), e = await f.upload()
    for(let i=0;i<20;i++) {
      const response = await f.post(`/experiments/${e.id}/runs`,{})
      expect(response.status).toBe(202)
      f.sqlite.exec("UPDATE lab_tasks SET status='succeeded'")
    }
    // Move the day ledger away to isolate the retained-task quota.
    f.sqlite.exec("UPDATE lab_daily_usage SET day='2000-01-01'")
    const rejected = await f.post(`/experiments/${e.id}/runs`,{})
    expect(rejected.status).toBe(429)
    expect(await rejected.json()).toMatchObject({code:'LAB_TASK_QUOTA'})
    const task = f.sqlite.prepare('SELECT id FROM lab_tasks LIMIT 1').get() as any
    await f.call(`/experiments/${e.id}/runs/${task.id}`,{method:'DELETE'})
    expect((await f.post(`/experiments/${e.id}/runs`,{})).status).toBe(202)
    await f.call(`/experiments/${e.id}`,{method:'DELETE'})
    const fresh = await f.upload()
    const results = await Promise.all([1,2,3].map(()=>f.post(`/experiments/${fresh.id}/runs`,{})))
    expect(results.map(r=>r.status).sort()).toEqual([202,202,429])
  })

  it('limits public walls and lets the owner delete walls with their routes and media', async () => {
    const f = await creator(), e = await f.upload()
    const items = [{id:'h1',kind:'hold',polygon:[[0,0],[1,0],[1,1]],score:1,area:0.5,bbox:{x1:0,y1:0,x2:1,y2:1}}]
    for(let i=0;i<11;i++) {
      f.sqlite.prepare("INSERT INTO lab_calibrations(id,experiment_id,candidates_key,display_key,candidate_count,changes,created_at) VALUES(?,?,?,?,1,'{}',1)").run('c'+i,e.id,'candidates'+i,'display'+i)
      f.objects.set('candidates'+i,{bytes:new TextEncoder().encode(JSON.stringify({items})),type:'application/json'})
      f.objects.set('display'+i,{bytes:new Uint8Array([1]),type:'image/webp'})
    }
    const responses = await Promise.all(Array.from({length:11},(_,i)=>f.post(`/experiments/${e.id}/calibrations/c${i}/publish`,{})))
    expect(responses.filter(r=>r.status===201)).toHaveLength(10)
    expect(responses.filter(r=>r.status===429)).toHaveLength(1)
    expect([...f.objects.keys()].filter(k=>k.startsWith('media_lab_'))).toHaveLength(10)
    const wall:any = f.sqlite.prepare('SELECT id FROM walls LIMIT 1').get()
    const usage:any = await (await f.call('/experiments')).json()
    expect(usage.usage.used.publicWalls).toBe(10)
    await f.addAccount('other')
    f.sqlite.exec("UPDATE admins SET lab_enabled=1 WHERE user_id='other'")
    expect((await f.apiCall(`/walls/${wall.id}`,'DELETE',undefined,'other')).status).toBe(404)
    expect((await f.apiCall(`/walls/${wall.id}`,'DELETE',undefined,'')).status).toBe(401)
    expect((await f.apiCall(`/walls/${wall.id}`,'DELETE',undefined,'session','https://evil.example')).status).toBe(403)
    f.sqlite.prepare("INSERT INTO problems(id,number,wall_id,angle,grade,foot_rule,created_by,created_at,updated_at) VALUES('route','1',?,20,'V0','feet_follow','other',1,1)").run(wall.id)
    f.sqlite.prepare("INSERT INTO problem_holds VALUES('route',?,'H001','start')").run(wall.id)
    expect((await f.apiCall(`/walls/${wall.id}`,'DELETE')).status).toBe(200)
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM problems').get().n).toBe(0)
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM problem_holds').get().n).toBe(0)
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM holds WHERE wall_id=?').get(wall.id).n).toBe(0)
    expect(f.objects.has(`media_lab_${wall.id.replace('wall_lab_','')}.webp`)).toBe(false)
    expect(f.objects.has('candidates0')).toBe(true)
    const missing:any = f.sqlite.prepare('SELECT id FROM lab_calibrations WHERE publish IS NULL').get()
    expect((await f.post(`/experiments/${e.id}/calibrations/${missing.id}/publish`,{})).status).toBe(201)
    const oldCalibration = wall.id.replace('wall_lab_','')
    expect((await f.post(`/experiments/${e.id}/calibrations/${oldCalibration}/publish`,{})).status).toBe(404)
    // Revoking lab access must not prevent the owner from cleaning up published walls.
    f.sqlite.exec("UPDATE admins SET lab_enabled=0 WHERE user_id='admin'")
    const another:any = f.sqlite.prepare('SELECT id FROM walls LIMIT 1').get()
    expect((await f.apiCall(`/walls/${another.id}`,'DELETE')).status).toBe(200)
    f.sqlite.exec("UPDATE admins SET lab_enabled=1 WHERE user_id='admin'")
    await f.call(`/experiments/${e.id}`,{method:'DELETE'})
    expect((await (await f.call('/experiments')).json() as any).usage.used).toMatchObject({images:0,tasks:0,publicWalls:9})

  })

  it('keeps a durable cleanup entry if wall media deletion temporarily fails', async () => {
    const f=await creator()
    f.sqlite.exec("INSERT INTO walls VALUES('wall_lab_cleanup',1,'Cleanup','','/api/v1/media/media_lab_cleanup.webp',1,1,'polygon','[20]','admin','public',1,1,1)")
    f.objects.set('media_lab_cleanup.webp',{bytes:new Uint8Array([1]),type:'image/webp'})
    const deletion=vi.spyOn(f.env.MEDIA,'delete').mockRejectedValueOnce(new Error('temporary storage failure'))
    expect((await f.apiCall('/walls/wall_lab_cleanup','DELETE')).status).toBe(200)
    expect(f.sqlite.prepare('SELECT prefix FROM lab_gc').get()).toMatchObject({prefix:'media_lab_cleanup.webp'})
    deletion.mockRestore()
    const {sweep}=await import('../src/lab/tasks.js')
    await sweep(f.env)
    expect(f.objects.has('media_lab_cleanup.webp')).toBe(true)
    const next = f.sqlite.prepare('SELECT next_attempt_at FROM lab_gc').get().next_attempt_at
    vi.spyOn(Date, 'now').mockReturnValue(Number(next))
    const list = vi.spyOn(f.env.MEDIA, 'list')
    await sweep(f.env)
    expect(list).not.toHaveBeenCalled()
    expect(f.objects.has('media_lab_cleanup.webp')).toBe(false)
  })

  it('atomically admits only the last daily slot and leaves rejected attempts uncounted', async () => {
    const f=await creator(), e=await f.upload()
    const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
    f.sqlite.prepare('INSERT INTO lab_daily_usage VALUES(?,?,19)').run('admin',day)
    const responses=await Promise.all([1,2].map(()=>f.post(`/experiments/${e.id}/runs`,{})))
    expect(responses.map(r=>r.status).sort()).toEqual([202,429])
    expect(f.sqlite.prepare('SELECT task_count FROM lab_daily_usage').get().task_count).toBe(20)
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_tasks').get().n).toBe(1)
  })

})

it('deleting an experiment cleans only its target, leaving unrelated due cleanup for the scheduler', async () => {
  const f = await fixture(), e = await f.upload()
  f.sqlite.prepare('INSERT INTO lab_gc(prefix,created_at) VALUES (?,?)').run('lab/unrelated/', Date.now())
  f.objects.set('lab/unrelated/file', {bytes: new Uint8Array([1]), type: 'image/webp'})
  const list = vi.spyOn(f.env.MEDIA, 'list')
  expect((await f.call(`/experiments/${e.id}`, {method: 'DELETE'})).status).toBe(204)
  expect(f.objects.has('lab/unrelated/file')).toBe(true)
  expect(list).toHaveBeenCalledTimes(1)
  expect(list).toHaveBeenCalledWith({prefix: `lab/${e.id}/`, limit: 500})
})

it('reawakens cleanup when an authenticated upload finishes after its task was deleted', async () => {
  const f = await fixture(), e = await f.upload()
  const {taskId} = await (await f.post(`/experiments/${e.id}/runs`, {model: 'sam2'})).json() as any
  const task = f.sqlite.prepare('SELECT * FROM lab_tasks WHERE id=?').get(taskId)
  const claim = await f.post('/runner/claim', {taskId, attemptId: task.attempt_id, runId: '123:1'}, 'runner-secret')
  const {token} = await claim.json() as any
  const put = f.env.MEDIA.put.bind(f.env.MEDIA)
  vi.spyOn(f.env.MEDIA, 'put').mockImplementationOnce(async (key, value, options) => {
    expect((await f.call(`/experiments/${e.id}/runs/${taskId}`, {method: 'DELETE'})).status).toBe(204)
    return put(key, value, options)
  })
  const response = await f.call(`/runner/tasks/${taskId}/outputs/display.webp`, {
    method: 'PUT', body: 'RIFFxxxxWEBPVP8 x',
  }, token)
  expect(response.status).toBe(409)
  expect(f.objects.has(task.output_prefix + 'display.webp')).toBe(true)
  expect(f.sqlite.prepare('SELECT * FROM lab_gc WHERE prefix=?').get(task.output_prefix)).toMatchObject({version: 2, phase: 0})
  const {sweep} = await import('../src/lab/tasks.js')
  await sweep(f.env)
  expect(f.objects.has(task.output_prefix + 'display.webp')).toBe(false)
})

async function calibrationFixture() {
  const f = await fixture(), e = await f.upload()
  const items = [{id:'h1',polygon:[[0,0],[1,0],[1,1]],kind:'hold'}]
  f.sqlite.prepare("INSERT INTO lab_tasks(id,experiment_id,owner_id,attempt_id,model,parameters,status,output_prefix,created_at,updated_at,deadline) VALUES('source',?,'admin','attempt','sam2','{}','succeeded','lab/source/',1,1,9999999999999)").run(e.id)
  f.objects.set('lab/source/display.webp',{bytes:new TextEncoder().encode('RIFFxxxxWEBPVP8 x'),type:'image/webp'})
  const save = (candidates = items, extra = {}) => f.post(`/experiments/${e.id}/calibrations`,{sourceTaskId:'source',candidates,changes:{},...extra})
  return {...f,e,items,save}
}

it('reuses unchanged calibration saves without writing another image or JSON', async () => {
  const f=await calibrationFixture(), put=vi.spyOn(f.env.MEDIA,'put')
  const first=await f.save(); expect(first.status).toBe(201)
  const saved:any=await first.json()
  const second=await f.save(); expect(second.status).toBe(200)
  expect(await second.json()).toMatchObject({id:saved.id,reused:true})
  expect(put).toHaveBeenCalledTimes(2)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_calibrations').get().n).toBe(1)
  const changed=await f.save([{...f.items[0],kind:'volume'}])
  expect(changed.status).toBe(201)
  expect(put).toHaveBeenCalledTimes(4)
})

it('prevents concurrent identical saves from writing duplicate calibration files', async () => {
  const f=await calibrationFixture(), put=vi.spyOn(f.env.MEDIA,'put')
  const responses=await Promise.all([f.save(),f.save()])
  expect(responses.filter(r=>r.status===201)).toHaveLength(1)
  expect(responses.every(r=>[200,201,409].includes(r.status))).toBe(true)
  expect(put).toHaveBeenCalledTimes(2)
  expect((await f.save()).status).toBe(200)
})

it('rejects a full image quota before attempting an R2 write', async () => {
  const f=await fixture()
  f.sqlite.exec("UPDATE admins SET role='user',lab_enabled=1 WHERE user_id='admin'")
  for(let i=0;i<10;i++)await f.upload()
  const put=vi.spyOn(f.env.MEDIA,'put')
  for(let i=0;i<2;i++) {
    const form=new FormData()
    form.set('image',new File([f.objects.values().next().value!.bytes],'extra.png',{type:'image/png'}))
    expect((await f.call('/experiments',{method:'POST',body:form})).status).toBe(429)
  }
  expect(put).not.toHaveBeenCalled()
})

it('rejects a full wall quota before reading or writing calibration media', async () => {
  const f=await calibrationFixture(), saved:any=await(await f.save()).json()
  for(let i=0;i<10;i++) f.sqlite.prepare("INSERT INTO walls VALUES(?,?,'Wall','','existing',1,1,'polygon','[20]','admin','public',1,1,1)").run(`wall${i}`,i+1)
  f.sqlite.exec("UPDATE admins SET role='user',lab_enabled=1 WHERE user_id='admin'")
  const put=vi.spyOn(f.env.MEDIA,'put'), get=vi.spyOn(f.env.MEDIA,'get')
  const response=await f.post(`/experiments/${f.e.id}/calibrations/${saved.id}/publish`,{})
  expect(response.status).toBe(429)
  expect(await response.json()).toMatchObject({code:'LAB_WALL_QUOTA'})
  expect(put).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled()
})

it('reuses an explicit calibration after its original task is deleted', async () => {
  const f=await calibrationFixture(), saved:any=await(await f.save()).json()
  expect((await f.call(`/experiments/${f.e.id}/runs/source`,{method:'DELETE'})).status).toBe(204)
  const put=vi.spyOn(f.env.MEDIA,'put')
  const response=await f.save(f.items,{sourceTaskId:null,sourceCalibrationId:saved.id})
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({id:saved.id,sourceTaskId:null})
  expect(put).not.toHaveBeenCalled()
  const changed=await f.save([{...f.items[0],kind:'volume'}],{sourceTaskId:null,sourceCalibrationId:saved.id})
  expect(changed.status).toBe(201)
  expect(put).toHaveBeenCalledTimes(2)
})

it('normalizes JSON object key order when identifying identical calibrations',async()=>{
  const f=await calibrationFixture(), first:any=await(await f.save()).json()
  const put=vi.spyOn(f.env.MEDIA,'put')
  const second=await f.save([{polygon:f.items[0].polygon,kind:'hold',id:'h1'}])
  expect(second.status).toBe(200);expect(await second.json()).toMatchObject({id:first.id})
  expect(put).not.toHaveBeenCalled()
})

it('reuses a legacy calibration without rewriting its snapshot',async()=>{
  const f=await calibrationFixture()
  f.sqlite.prepare("INSERT INTO lab_calibrations(id,experiment_id,source_task_id,candidates_key,display_key,candidate_count,changes,created_at,image_source_key) VALUES('legacy',?,'source','legacy.json','legacy.webp',1,'{}',1,'lab/source/display.webp')").run(f.e.id)
  f.objects.set('legacy.json',{bytes:new TextEncoder().encode(JSON.stringify({items:f.items})),type:'application/json'})
  f.objects.set('legacy.webp',{bytes:new Uint8Array([7]),type:'image/webp'})
  const put=vi.spyOn(f.env.MEDIA,'put')
  const response=await f.save(f.items,{sourceCalibrationId:'legacy'})
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({id:'legacy',reused:true})
  expect(put).not.toHaveBeenCalled()
  expect(f.sqlite.prepare("SELECT content_hash FROM lab_calibrations WHERE id='legacy'").get().content_hash).toMatch(/^[a-f0-9]{64}$/)
})

it('cleans partial writes and releases the save lease so retry can succeed',async()=>{
  const f=await calibrationFixture(), original=f.env.MEDIA.put.bind(f.env.MEDIA)
  const put=vi.spyOn(f.env.MEDIA,'put').mockImplementationOnce(original).mockRejectedValueOnce(new Error('storage unavailable'))
  const failed=await f.save();expect(failed.status).toBe(500)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_calibration_save_locks').get().n).toBe(0)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_calibrations').get().n).toBe(0)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_gc').get().n).toBe(1)
  put.mockRestore();expect((await f.save()).status).toBe(201)
})

it('does not publish a calibration result after its lease is superseded',async()=>{
  const f=await calibrationFixture(), original=f.env.MEDIA.put.bind(f.env.MEDIA)
  vi.spyOn(f.env.MEDIA,'put').mockImplementationOnce(async(key,value,options)=>{
    const result=await original(key,value,options)
    f.sqlite.exec("UPDATE lab_calibration_save_locks SET token='new-owner'")
    return result
  })
  expect((await f.save()).status).toBe(409)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_calibrations').get().n).toBe(0)
  expect(f.sqlite.prepare('SELECT token FROM lab_calibration_save_locks').get().token).toBe('new-owner')
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_gc').get().n).toBe(1)
})

it('does not reuse deleted calibrations or snapshots from another experiment',async()=>{
  const f=await calibrationFixture(), saved:any=await(await f.save()).json()
  const another=await f.upload()
  const invalid=await f.post(`/experiments/${another.id}/calibrations`,{sourceCalibrationId:saved.id,candidates:f.items})
  expect(invalid.status).toBe(404)
  await f.call(`/experiments/${f.e.id}/calibrations/${saved.id}`,{method:'DELETE'})
  const next=await f.save();expect(next.status).toBe(201)
  expect((await next.json() as any).id).not.toBe(saved.id)
})

it('allows a new unchanged snapshot after its published wall was deleted',async()=>{
  const f=await calibrationFixture(), saved:any=await(await f.save()).json()
  const published:any=await(await f.post(`/experiments/${f.e.id}/calibrations/${saved.id}/publish`,{})).json()
  expect((await f.apiCall(`/walls/${published.wallId}`,'DELETE')).status).toBe(200)
  const next=await f.save();expect(next.status).toBe(201)
  expect((await next.json() as any).id).not.toBe(saved.id)
})

it('recovers expired save leases without rewriting an already completed result',async()=>{
  const f=await calibrationFixture(), saved:any=await(await f.save()).json()
  const row=f.sqlite.prepare('SELECT content_hash FROM lab_calibrations WHERE id=?').get(saved.id)
  f.sqlite.prepare('INSERT INTO lab_calibration_save_locks VALUES (?,?,?,?)').run(f.e.id,row.content_hash,'crashed',1)
  const put=vi.spyOn(f.env.MEDIA,'put')
  expect((await f.save()).status).toBe(200)
  expect(put).not.toHaveBeenCalled()
  // Deleted result requires a new attempt; the expired lock must be reclaimable.
  await f.call(`/experiments/${f.e.id}/calibrations/${saved.id}`,{method:'DELETE'})
  expect((await f.save()).status).toBe(201)
  expect(put).toHaveBeenCalledTimes(2)
})

it('replays one submission identity without dispatching or counting another model task',async()=>{
  const f=await fixture(),e=await f.upload()
  const payload={model:'sam2',submissionId:'submit-one'}
  const responses=await Promise.all([f.post(`/experiments/${e.id}/runs`,payload),f.post(`/experiments/${e.id}/runs`,payload)])
  expect(responses.map(r=>r.status)).toEqual([202,202])
  const rows=await Promise.all(responses.map(r=>r.json())) as any[]
  expect(rows[0].taskId).toBe(rows[1].taskId)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM lab_tasks').get().n).toBe(1)
  expect(f.sqlite.prepare('SELECT task_count FROM lab_daily_usage').get().task_count).toBe(1)
  expect((await f.post(`/experiments/${e.id}/runs`,{...payload,parameters:{points_per_side:32}})).status).toBe(409)
  expect((await f.post(`/experiments/${e.id}/runs`,{...payload,submissionId:'submit-two'})).status).toBe(202)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('replays submissions at the daily quota and refuses to recreate deleted submission IDs',async()=>{
  const f=await fixture(),e=await f.upload()
  f.sqlite.exec("UPDATE admins SET role='user',lab_enabled=1 WHERE user_id='admin'")
  const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
  f.sqlite.prepare('INSERT INTO lab_daily_usage VALUES(?,?,19)').run('admin',day)
  const payload={submissionId:'last-slot'}
  const first=await f.post(`/experiments/${e.id}/runs`,payload), created:any=await first.json()
  expect(first.status).toBe(202)
  expect((await f.post(`/experiments/${e.id}/runs`,payload)).status).toBe(202)
  expect(f.sqlite.prepare('SELECT task_count FROM lab_daily_usage').get().task_count).toBe(20)
  await f.call(`/experiments/${e.id}/runs/${created.taskId}`,{method:'DELETE'})
  expect((await f.post(`/experiments/${e.id}/runs`,payload)).status).toBe(410)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('does not dispatch again when a failed dispatch is replayed with the same submission ID',async()=>{
  const f=await fixture(),e=await f.upload()
  vi.mocked(fetch).mockResolvedValue(new Response('failure',{status:503}))
  const payload={submissionId:'failed-dispatch'}
  const first:any=await(await f.post(`/experiments/${e.id}/runs`,payload)).json()
  expect(first.status).toBe('failed')
  const replay:any=await(await f.post(`/experiments/${e.id}/runs`,payload)).json()
  expect(replay).toMatchObject({taskId:first.taskId,status:'failed',reused:true})
  expect(fetch).toHaveBeenCalledTimes(1)
})

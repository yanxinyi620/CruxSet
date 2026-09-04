// @ts-nocheck
import { describe, expect, it, vi } from 'vitest'
const mockCloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init: vi.fn(),
  database: vi.fn(),
  getWXContext: vi.fn(() => ({ OPENID: 'openid' })),
}

async function loadMainWithCloudMock () {
  const Module = await import('node:module')
  const originalLoad = Module.default._load
  Module.default._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'wx-server-sdk') return mockCloud
    return originalLoad.call(this, request, parent, isMain)
  } as typeof Module.default._load
  try {
    return await import('../wechat/cloudfunctions/wallManager/index.js')
  } finally {
    Module.default._load = originalLoad
  }
}

const implementation = await loadMainWithCloudMock()
const { makeSafeSession, validateDisplayName, withSafeSetterName } = implementation

describe('mini program profile and setter contracts', () => {
  it('exposes only the safe session fields', () => {
    expect(makeSafeSession({ id: 'u1', displayName: 'Cruxer' }, true)).toEqual({
      userId: 'u1',
      isAdmin: true,
      displayName: 'Cruxer',
    })
  })

  it('trims valid names and rejects empty or overlong names', () => {
    expect(validateDisplayName('  Cruxer  ')).toBe('Cruxer')
    expect(() => validateDisplayName('   ')).toThrow('INVALID_INPUT')
    expect(() => validateDisplayName('a'.repeat(41))).toThrow('INVALID_INPUT')
  })

  it('adds a public setter name without leaking identity fields', () => {
    expect(withSafeSetterName(
      { id: 'p1', createdBy: 'u1', name: 'Blue' },
      { id: 'u1', displayName: '  Setter  ', openid: 'openid', unionid: 'unionid' },
    )).toEqual({ id: 'p1', name: 'Blue', setterName: 'Setter' })

    expect(withSafeSetterName(
      { id: 'p2', createdBy: 'u2', name: 'Red' },
      { id: 'u2', openid: 'openid' },
    )).toEqual({ id: 'p2', name: 'Red', setterName: '用户' })
  })

  it('updates the user document by its application id field', async () => {
    const update = vi.fn().mockResolvedValue({})
    const users = {
      where: vi.fn(() => ({
        limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ data: [{ id: 'u1', openid: 'openid' }] }) })),
        update,
      })),
      doc: vi.fn(() => ({ update })),
    }
    const admins = { where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ data: [] }) })) })) }
    mockCloud.database.mockReturnValue({ collection: (name: string) => name === 'users' ? users : admins })
    const { main } = await loadMainWithCloudMock()
    await main({ action: 'updateProfile', data: { displayName: ' Setter ' } })
    expect(users.where).toHaveBeenCalledWith({ id: 'u1' })
    expect(update).toHaveBeenCalledWith({ data: expect.objectContaining({ displayName: 'Setter' }) })
    expect(users.doc).not.toHaveBeenCalled()
  })

  it('looks up setter users by application id and returns a safe public problem', async () => {
    const users = {
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ data: [{ id: 'u1', openid: 'openid' }] }) })) })),
      doc: vi.fn(),
    }
    const admins = { where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ data: [] }) })) })) }
    const walls = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ data: { id: 'w1', visibility: 'public' } }) })) }
    const problems = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ data: { id: 'p1', wallId: 'w1', createdBy: 'u1' } }) })) }
    mockCloud.database.mockReturnValue({ collection: (name: string) => ({ users, admins, walls, problems } as Record<string, unknown>)[name] })
    const { main } = await loadMainWithCloudMock()
    const result = await main({ action: 'getProblem', data: { id: 'p1' } })
    expect(users.where).toHaveBeenCalledWith({ id: 'u1' })
    expect(result).toEqual({ id: 'p1', wallId: 'w1', setterName: '用户' })
  })
})

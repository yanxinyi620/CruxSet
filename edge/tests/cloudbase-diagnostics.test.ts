import { afterEach, expect, it, vi } from 'vitest'
import { publishCloudbase } from '../src/lab/cloudbase.js'
afterEach(() => vi.restoreAllMocks())
it('records safe stage diagnostics and preserves useful failure details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'FUNCTIONS_INVOCATION_FAILED',requestId:'request-123',message:'secret-upload-credential'}),{status:400})))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(publishCloudbase({CRUXSET_CLOUDBASE_FUNCTION_URL:'https://example.com/publish',CRUXSET_CLOUDBASE_STORAGE_URL:'https://example.com/storage',CRUXSET_CLOUDBASE_SIGNING_KEY:'secret-key',CRUXSET_CLOUDBASE_OWNER_OPENID:'private-owner'} as any,{publishRequestId:'cloudflare:test'},new ArrayBuffer(1))).rejects.toThrow('image_authorization')
  const output=JSON.stringify(log.mock.calls)
  expect(output).toContain('request-123')
  expect(output).toContain('FUNCTIONS_INVOCATION_FAILED')
  expect(output).toContain('cloudflare:test')
  expect(output).not.toContain('secret-upload-credential')
  expect(output).not.toContain('secret-key')
  expect(output).not.toContain('private-owner')
  vi.unstubAllGlobals()
})

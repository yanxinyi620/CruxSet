import { describe, expect, it, vi } from 'vitest'
import { confirmAndDelete, escapeHtml, guardedAction, isWallLockedError, problemEditorState, wallEditorState } from '../web/src/ui-behavior.js'
import { ApiError, LocalApiClient } from '../web/src/api.js'

describe('web interaction safety', () => {
  it('escapes user and server supplied HTML', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')"> & ok`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; ok')
  })

  it('locks every mutating wall action once published', () => {
    expect(wallEditorState({ published: true, dirty: true, holdCount: 4 })).toEqual({ canEdit: false, canSave: false, canPublish: false })
  })

  it('prevents duplicate problem submission after success', () => {
    expect(problemEditorState({ submitting: false, saved: true, hasStart: true, hasFinish: true }).canSubmit).toBe(false)
    expect(problemEditorState({ submitting: true, saved: false, hasStart: true, hasFinish: true }).canSubmit).toBe(false)
  })

  it('guards repeated async actions and exposes failures', async () => {
    let busy = false
    const action = vi.fn(async () => { throw new Error('<server>') })
    const first = await guardedAction(() => busy, value => { busy = value }, action)
    expect(first).toEqual({ ok: false, message: '<server>' })
    busy = true
    expect(await guardedAction(() => busy, value => { busy = value }, action)).toEqual({ ok: false, skipped: true })
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('preserves and recognizes the wall lock code from an actual API error envelope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'WALL_LOCKED', message: 'Published wall geometry is locked' } }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const api = new LocalApiClient('http://local.test', fetcher)
    const error = await api.saveWallHolds('wall_1', []).catch(cause => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'WALL_LOCKED', message: 'Published wall geometry is locked' })
    expect(isWallLockedError(error)).toBe(true)
    expect(isWallLockedError(new Error('network unavailable'))).toBe(false)
  })

  it('requires confirmation and reports problem deletion failures', async () => {
    const remove = vi.fn(async () => { throw new Error('DELETE_DENIED') })
    expect(await confirmAndDelete(() => false, remove)).toEqual({ ok: false, cancelled: true })
    expect(remove).not.toHaveBeenCalled()
    expect(await confirmAndDelete(() => true, remove)).toEqual({ ok: false, message: 'DELETE_DENIED' })
  })
})

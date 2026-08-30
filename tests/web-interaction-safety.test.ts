import { describe, expect, it, vi } from 'vitest'
import { confirmAndDelete, escapeHtml, guardedAction, isWallLockedError, problemEditorState, wallEditorState } from '../web/src/ui-behavior.js'

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

  it('recognizes a server-side wall lock as final', () => {
    expect(isWallLockedError(new Error('WALL_LOCKED'))).toBe(true)
    expect(isWallLockedError(new Error('network unavailable'))).toBe(false)
  })

  it('requires confirmation and reports problem deletion failures', async () => {
    const remove = vi.fn(async () => { throw new Error('DELETE_DENIED') })
    expect(await confirmAndDelete(() => false, remove)).toEqual({ ok: false, cancelled: true })
    expect(remove).not.toHaveBeenCalled()
    expect(await confirmAndDelete(() => true, remove)).toEqual({ ok: false, message: 'DELETE_DENIED' })
  })
})

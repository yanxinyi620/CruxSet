export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export const wallEditorState = (state: { published: boolean; dirty: boolean; holdCount: number }) => ({
  canEdit: !state.published,
  canSave: !state.published && state.dirty,
  canPublish: !state.published && state.holdCount >= 2,
})

export const problemEditorState = (state: { submitting: boolean; saved: boolean; hasStart: boolean; hasFinish: boolean }) => ({
  canSubmit: !state.submitting && !state.saved && state.hasStart && state.hasFinish,
})

export const isWallLockedError = (error: unknown) => (error instanceof Error ? error.message : String(error)).includes('WALL_LOCKED')

export async function confirmAndDelete(confirmDelete: () => boolean, action: () => Promise<unknown>): Promise<{ ok: true } | { ok: false; cancelled: true } | { ok: false; message: string }> {
  if (!confirmDelete()) return { ok: false, cancelled: true }
  try { await action(); return { ok: true } }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
}

export async function guardedAction<T>(isBusy: () => boolean, setBusy: (value: boolean) => void, action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; skipped: true } | { ok: false; message: string }> {
  if (isBusy()) return { ok: false, skipped: true }
  setBusy(true)
  try { return { ok: true, value: await action() } }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  finally { setBusy(false) }
}

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export const wallEditorState = (state: { published: boolean; dirty: boolean; holdCount: number }) => ({
  canEdit: !state.published,
  canSave: !state.published && state.dirty,
  canPublish: !state.published && state.holdCount >= 2,
})

export const problemEditorState = (state: { submitting: boolean; saved: boolean; hasStart: boolean; hasFinish: boolean }) => ({
  canSubmit: !state.submitting && !state.saved && state.hasStart && state.hasFinish,
})

export const isWallLockedError = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'WALL_LOCKED'

export async function confirmAndDelete(confirmDelete: () => boolean, action: () => Promise<unknown>): Promise<{ ok: true } | { ok: false; cancelled: true } | { ok: false; message: string }> {
  if (!confirmDelete()) return { ok: false, cancelled: true }
  try { await action(); return { ok: true } }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
}

export const confirmWallDeletion = (confirmDelete: (message: string) => boolean, action: () => Promise<unknown>) =>
  confirmAndDelete(
    () => confirmDelete('确定删除这面墙？'),
    async () => {
      if (!confirmDelete('二次确认：删除后将同时删除该墙面、所有相关线路及原始关联图片文件，且无法恢复。确定继续吗？')) throw new Error('DELETE_CANCELLED')
      await action()
    },
  )

export async function guardedAction<T>(isBusy: () => boolean, setBusy: (value: boolean) => void, action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; skipped: true } | { ok: false; message: string }> {
  if (isBusy()) return { ok: false, skipped: true }
  setBusy(true)
  try { return { ok: true, value: await action() } }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
  finally { setBusy(false) }
}

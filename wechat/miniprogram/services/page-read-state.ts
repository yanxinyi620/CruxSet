// @ts-nocheck
import { confirmedUserId } from './cloud.js'
import { cloudErrorMessage } from './errors.js'
import { isReadRevoked } from './read-cache.js'

export function pageReadError(page, error, empty, background = false) {
  const noticeKey = page.readNoticeKey || 'notice'
  if (isReadRevoked(error)) {
    if (background && !page._browsePullPromise) page._browseRequest = (page._browseRequest || 0) + 1
    page._hasRead = false
    page.setData({ ...empty, loading: false, refreshing: false, [noticeKey]: '', error: cloudErrorMessage(error) })
  } else page.setData(page._hasRead ? { [noticeKey]: cloudErrorMessage(error) } : { error: cloudErrorMessage(error) })
}

/** Empty successful results count as loaded; only identity changes discard them. */
export function beginPageRead(page, empty, cached) {
  const user = confirmedUserId()
  if (page._readUser !== user) { page._hasRead = false; page.setData(empty) }
  page._readUser = user
  if (cached !== undefined) { page._hasRead = true; page.setData(cached) }
  const request = page._browseRequest = (page._browseRequest || 0) + 1
  const current = () => request === page._browseRequest
  page.setData({ loading: !page._hasRead, refreshing: !!page._hasRead, error: '', [page.readNoticeKey || 'notice']: '' })
  return {
    current,
    success(patch) {
      if (!current()) return
      page._hasRead = true; page._readUser = confirmedUserId()
      page.setData({ ...patch, error: '' })
    },
    failure(error) { if (current()) pageReadError(page, error, empty) },
    finish() { if (current()) page.setData({ loading: false, refreshing: false }) },
  }
}

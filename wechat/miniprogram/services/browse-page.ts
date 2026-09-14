// @ts-nocheck
import { subscribeBrowseCache, subscribeBrowseCacheErrors } from './cloud.js'
/** Refresh visible pages only; retain the existing view during background work. */
export function browsePage(definition) {
  const load = definition.onLoad, show = definition.onShow
  const reload = page => {
    if (page._browseTimer) clearTimeout(page._browseTimer)
    page._browseTimer = setTimeout(() => {
      page._browseTimer = undefined
      if (page._browseVisible) void (load ? load.call(page, page._browseOptions || {}) : show?.call(page))
    }, 0)
  }
  const stop = page => {
    page._browseVisible = false
    if (page._browsePullPromise) wx.stopPullDownRefresh?.()
    page._browsePullPromise = undefined
    page._browsePullDirty = false
    page._browseUnsubscribe?.(); page._browseUnsubscribe = undefined
    page._browseErrorUnsubscribe?.(); page._browseErrorUnsubscribe = undefined
    if (page._browseTimer) clearTimeout(page._browseTimer)
    page._browseTimer = undefined
    page._browseRequest = (page._browseRequest || 0) + 1
  }
  return {
    ...definition,
    onLoad(options) { this._browseOptions = options; return load?.call(this, options) },
    onShow() {
      this._browseVisible = true
      this._browseUnsubscribe?.()
      const matches = key => !definition.cacheMatches || definition.cacheMatches.call(this, key)
      this._browseUnsubscribe = subscribeBrowseCache(key => {
        if (!matches(key)) return
        if (!this._browsePullPromise) reload(this)
        else if (key === '*') {
          // A completed mutation supersedes the response already in flight.
          this._browseRequest = (this._browseRequest || 0) + 1
          this._browsePullDirty = true
        }
      })
      this._browseErrorUnsubscribe?.()
      this._browseErrorUnsubscribe = definition.onCacheError ? subscribeBrowseCacheErrors((key, error) => {
        if (matches(key)) definition.onCacheError.call(this, key, error)
      }) : undefined
      const result = show?.call(this)
      if (this._browseShown && load) reload(this)
      this._browseShown = true
      return result
    },
    onPullDownRefresh() {
      if (this._browsePullPromise) return this._browsePullPromise
      if (this._browseTimer) clearTimeout(this._browseTimer)
      this._browseTimer = undefined
      this.setData({ refreshing: true })
      const pending = Promise.resolve().then(async () => {
        do {
          if (this._browsePullPromise !== pending || !this._browseVisible) return
          this._browsePullDirty = false
          await (load ? load.call(this, this._browseOptions || {}, { force: true }) : show?.call(this, { force: true }))
        } while (this._browsePullDirty)
      })
        .finally(() => {
          if (this._browsePullPromise !== pending) return
          this._browsePullPromise = undefined
          this.setData({ refreshing: false })
          wx.stopPullDownRefresh?.()
        })
      this._browsePullPromise = pending
      return pending
    },
    onHide() { stop(this); definition.onHide?.call(this) },
    onUnload() { stop(this); definition.onUnload?.call(this) },
  }
}

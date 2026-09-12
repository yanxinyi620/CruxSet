// @ts-nocheck
import { subscribeBrowseCache } from './cloud.js'
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
    page._browseUnsubscribe?.(); page._browseUnsubscribe = undefined
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
      this._browseUnsubscribe = subscribeBrowseCache(() => reload(this))
      const result = show?.call(this)
      if (this._browseShown && load) reload(this)
      this._browseShown = true
      return result
    },
    onHide() { stop(this); definition.onHide?.call(this) },
    onUnload() { stop(this); definition.onUnload?.call(this) },
  }
}

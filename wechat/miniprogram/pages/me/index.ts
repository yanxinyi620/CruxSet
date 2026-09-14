// @ts-nocheck
import { listMyProblems, peekMyProblems, personalCacheMatches } from '../../services/personal-data.js'
import { confirmedUserId } from '../../services/cloud.js'
import { browsePage } from '../../services/browse-page.js'
import { isReadRevoked } from '../../services/read-cache.js'
import { currentUserIsAdmin } from '../../services/users.js'
import { syncTabBar } from '../../services/tab-bar.js'
import { cloudErrorMessage } from '../../services/errors.js'

Page(browsePage({
  data: { loading: true, problemCount: 0, isAdmin: false, error: '', notice: '', permissionError: '' },
  cacheMatches(key) { return personalCacheMatches(key) },
  onShow(options = {}) { syncTabBar(this, 2); return this.reload(options) },
  async reload(options = {}) {
    const request = this._browseRequest = (this._browseRequest || 0) + 1
    const current = () => request === this._browseRequest
    const user = confirmedUserId()
    if (this._personalUser !== user) {
      this._personalLoaded = false
      this.setData({ problemCount: 0, isAdmin: false })
    }
    this._personalUser = user
    const cached = peekMyProblems()
    if (cached) { this._personalLoaded = true; this.setData({ problemCount: cached.length }) }
    this.setData({ loading: !this._personalLoaded, error: '', notice: '', permissionError: '' })
    // Permissions remain a strict read and do not block the route count.
    void currentUserIsAdmin().then(isAdmin => {
      if (current()) this.setData({ isAdmin, permissionError: '' })
    }, error => {
      if (current()) this.setData({ isAdmin: false, permissionError: cloudErrorMessage(error) })
    })
    try {
      const problems = await listMyProblems(options)
      if (!current()) return
      this._personalUser = confirmedUserId(); this._personalLoaded = true
      this.setData({ problemCount: problems.length, error: '' })
    } catch (error) {
      if (!current()) return
      if (isReadRevoked(error)) { this._personalLoaded = false; this.setData({ problemCount: 0 }) }
      this.setData(this._personalLoaded ? { notice: cloudErrorMessage(error) } : { error: cloudErrorMessage(error) })
    } finally { if (current()) this.setData({ loading: false }) }
  },
  onCacheError(key, error) {
    if (isReadRevoked(error)) {
      if (!this._browsePullPromise) this._browseRequest++
      this._personalLoaded = false
      this.setData({ problemCount: 0, loading: false, error: cloudErrorMessage(error) })
    } else this.setData({ notice: cloudErrorMessage(error) })
  },
  openProfile() { wx.navigateTo({ url: '/pages/profile/index' }) },
  openWalls() { wx.navigateTo({ url: '/pages/me/walls/index' }) },
  openProblems() { wx.navigateTo({ url: '/pages/me/problems/index' }) },
  openManagement() { if (this.data.isAdmin) wx.navigateTo({ url: '/pages/admin/management/index' }) },
}))

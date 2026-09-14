// @ts-nocheck
import { deleteProblem } from '../../../services/problems.js'
import { listMyProblemGroups, peekMyProblemGroups, personalCacheMatches } from '../../../services/personal-data.js'
import { confirmedUserId } from '../../../services/cloud.js'
import { browsePage } from '../../../services/browse-page.js'
import { isReadRevoked } from '../../../services/read-cache.js'
import { cloudErrorMessage } from '../../../services/errors.js'

Page(browsePage({
  data: { loading: true, groups: [], error: '', notice: '' },
  cacheMatches(key) { return personalCacheMatches(key, true) },
  onShow(options = {}) { return this.reload(options) },
  async reload(options = {}) {
    const request = this._browseRequest = (this._browseRequest || 0) + 1
    const current = () => request === this._browseRequest
    const user = confirmedUserId()
    if (this._personalUser !== user) { this._personalLoaded = false; this.setData({ groups: [] }) }
    this._personalUser = user
    const expanded = () => new Set(this.data.groups.filter(group => group.expanded).map(group => group.id))
    const cached = peekMyProblemGroups(expanded())
    if (cached) { this._personalLoaded = true; this.setData({ groups: cached }) }
    this.setData({ loading: !this._personalLoaded, error: '', notice: '' })
    try {
      const groups = await listMyProblemGroups(expanded(), options)
      if (!current()) return
      const open = expanded()
      this._personalUser = confirmedUserId(); this._personalLoaded = true
      this.setData({ groups: groups.map(group => ({ ...group, expanded: open.has(group.id) })), error: '' })
    } catch (error) {
      if (!current()) return
      if (isReadRevoked(error)) { this._personalLoaded = false; this.setData({ groups: [] }) }
      this.setData(this._personalLoaded ? { notice: cloudErrorMessage(error) } : { error: cloudErrorMessage(error) })
    } finally { if (current()) this.setData({ loading: false }) }
  },
  onCacheError(key, error) {
    if (isReadRevoked(error)) {
      if (!this._browsePullPromise) this._browseRequest++
      const [, action, args] = JSON.parse(key)
      if (action === 'getWall') {
        const id = Object.fromEntries(args).id
        this.setData({ groups: this.data.groups.filter(group => group.id !== id), loading: false, notice: cloudErrorMessage(error) })
      } else {
        this._personalLoaded = false
        this.setData({ groups: [], loading: false, error: cloudErrorMessage(error) })
      }
    } else this.setData({ notice: cloudErrorMessage(error) })
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ groups: this.data.groups.map(group => group.id === id ? { ...group, expanded: !group.expanded } : group) })
  },
  open(e) { wx.navigateTo({ url: `/pages/problem/detail/index?id=${e.currentTarget.dataset.id}` }) },
  edit(e) { wx.navigateTo({ url: `/pages/problem/editor/index?problemId=${e.currentTarget.dataset.id}` }) },
  remove(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '删除线路？', content: '此操作不可恢复。', success: result => {
      if (result.confirm) void deleteProblem(id).then(() => {
        if (this._browseVisible) return this.reload()
      }).catch(error => wx.showToast({ title: cloudErrorMessage(error), icon: 'none' }))
    } })
  },
}))

// @ts-nocheck
import { demoLayout } from '../../data/demo.js'
import { demoProblems } from '../../data/demo-problems.js'
import { browseProblems } from '../../domain/browse.js'
import { RandomSession } from '../../domain/random.js'
import { getLayout } from '../../services/layouts.js'
import { listProblems } from '../../services/problems.js'
import { getWall } from '../../services/walls.js'

let randomSession
const defaultAngles = [20, 25, 30, 35, 40, 45]
const grades = ['全部', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
const contextKey = wallId => `browseContext:${wallId}`

Page({
  data: { wallId: 'wall_demo', wallName: '日坛 Spraywall', layoutName: '2026-08 Layout', layout: demoLayout, layoutId: 'layout_demo', angles: defaultAngles, grades, angle: 35, grade: 'V4', query: '', problems: [] },
  onLoad(options) {
    const wallId = options.id || 'wall_demo'
    const saved = wx.getStorageSync(contextKey(wallId)) || {}
    this.setData({ wallId, angle: saved.angle || 35, grade: saved.grade || 'V4', query: saved.query || '' })
    getWall(wallId).then(wall => {
      const angles = wall.angleOptions || defaultAngles
      const angle = angles.includes(this.data.angle) ? this.data.angle : angles[0]
      this.setData({ wallName: wall.name, angles, angle, layoutId: wall.activeLayoutId })
      return getLayout(wall.activeLayoutId)
    }).then(layout => {
      this.setData({ layout, layoutName: layout.name })
      return listProblems({ wallId, layoutId: layout.id })
    }).then(problems => { this.remoteProblems = problems; this.refresh() }).catch(() => {
      getLayout('layout_demo').then(layout => this.setData({ layout, layoutName: layout.name })).catch(() => {})
      this.refresh()
    })
  },
  persistContext() { wx.setStorageSync(contextKey(this.data.wallId), { angle: this.data.angle, grade: this.data.grade, query: this.data.query }) },
  refresh() {
    const source = this.remoteProblems || demoProblems
    const problems = browseProblems(source, { wallId: this.data.wallId, layoutId: this.data.layoutId, angle: this.data.angle, grade: this.data.grade }, this.data.query)
    randomSession = new RandomSession(problems)
    this.setData({ problems })
  },
  selectAngle(e) { this.setData({ angle: e.currentTarget.dataset.value }, () => { this.persistContext(); this.refresh() }) },
  selectGrade(e) { this.setData({ grade: e.currentTarget.dataset.value }, () => { this.persistContext(); this.refresh() }) },
  setQuery(e) { this.setData({ query: e.detail.value }, () => { this.persistContext(); this.refresh() }) },
  openProblem(e) { wx.navigateTo({ url: `/pages/problem/detail/index?id=${e.currentTarget.dataset.id}` }) },
  randomProblem() { if (this.data.problems.length) wx.navigateTo({ url: `/pages/problem/detail/index?id=${randomSession.next().id}` }) },
  createProblem() { wx.navigateTo({ url: `/pages/problem/editor/index?wallId=${this.data.wallId}&layoutId=${this.data.layoutId}` }) }
})

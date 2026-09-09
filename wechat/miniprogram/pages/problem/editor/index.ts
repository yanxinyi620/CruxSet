// @ts-nocheck
import ProblemEditor from '../../../domain/editor.js'
import { getProblem, saveProblem, updateProblem } from '../../../services/problems.js'
import { getWall } from '../../../services/walls.js'
import { currentUserId } from '../../../services/users.js'
import { cloudErrorMessage } from '../../../services/errors.js'

let wall = null, wallId = '', problemId = '', draftKey = '', editor = new ProblemEditor({})
const roles = [{ id: 'start', label: 'Start', color: '#39a96b' }, { id: 'foot', label: 'Foot', color: '#d7ad18' }, { id: 'hand', label: 'Hand', color: '#316eea' }, { id: 'assist', label: 'Assist', color: '#ef8f39' }, { id: 'finish', label: 'Finish', color: '#8b55c7' }]
const footRules = ['feet_follow', 'specified', 'all'], grades = Array.from({ length: 17 }, (_, i) => `V${i}`)
const labels = { feet_follow: '跟随手点', specified: '指定脚点', all: '全墙脚点' }, hints = { feet_follow: '手类点可踩，黄色 Foot 只能脚踩', specified: '脚只能踩线路中的黄色 Foot', all: '当前墙面所有允许踩的岩点均可作为脚点' }
const persist = page => wx.setStorageSync(draftKey, { angle: page.data.angle, grade: page.data.grade, footRule: page.data.footRule, holds: editor.value().holds })

Page({
  data: { wall: null, loading: true, problemId: '', problemNumber: '', editing: false, angles: [], grades, angle: 35, angleIndex: 0, grade: 'V4', gradeIndex: 4, roles, selectedRole: 'start', footRules, footRuleIndex: 0, footRule: 'feet_follow', footRuleLabel: labels.feet_follow, footRuleHint: hints.feet_follow, selected: {}, error: '', loadError: false, saving: false, saveDialogVisible: false, dialogName: '', dialogDescription: '' },
  async onLoad(options) { try { problemId = options.problemId || options.id || ''; const loadedProblem = problemId ? await getProblem(problemId) : null; wallId = loadedProblem?.wallId || options.wallId || ''; draftKey = `problemDraft:${problemId || wallId}`; const stored = wx.getStorageSync(draftKey) || {}; const saved = loadedProblem ? { ...loadedProblem, ...stored } : stored; editor = new ProblemEditor(saved.holds || {}); wall = await getWall(wallId); const angle = saved.angle ?? wall.angleOptions[0], grade = saved.grade ?? 'V4', footRule = saved.footRule ?? 'feet_follow'; this.setData({ wall, loading: false, problemId, problemNumber: saved.number || '', editing: Boolean(problemId), angles: wall.angleOptions, selected: editor.value().holds, footRule, footRuleIndex: footRules.indexOf(footRule), footRuleLabel: labels[footRule], footRuleHint: hints[footRule], angle, angleIndex: wall.angleOptions.indexOf(angle), grade, gradeIndex: grades.indexOf(grade), dialogName: saved.name || '', dialogDescription: saved.description || '' }) } catch (error) { this.setData({ loading: false, error: cloudErrorMessage(error), loadError: true }) } },
  selectRole(e) { this.setData({ selectedRole: e.currentTarget.dataset.role }) },
  onHoldTap(e) { editor.toggle(e.detail.holdId, this.data.selectedRole); this.setData({ selected: editor.value().holds }); persist(this) },
  undo() { editor.undo(); this.setData({ selected: editor.value().holds }); persist(this) },
  clear() { editor.clear(); this.setData({ selected: editor.value().holds }); persist(this) },
  selectAngle(e) { const index = Number(e.detail.value); this.setData({ angle: Number(this.data.angles[index]), angleIndex: index }); persist(this) },
  selectGrade(e) { const index = Number(e.detail.value); this.setData({ grade: grades[index], gradeIndex: index }); persist(this) },
  selectFootRule(e) { const index = Number(e.detail.value), footRule = footRules[index]; this.setData({ footRule, footRuleIndex: index, footRuleLabel: labels[footRule], footRuleHint: hints[footRule] }); persist(this) },
  save() { if (this.data.loadError || this.data.saving || !this.data.selected.start.length || !this.data.selected.finish.length) return; this.setData({ saveDialogVisible: true }) },
  closeSaveDialog() { if (!this.data.saving) this.setData({ saveDialogVisible: false }) },
  setDialogName(e) { this.setData({ dialogName: e.detail.value }) },
  setDialogDescription(e) { this.setData({ dialogDescription: e.detail.value }) },
  async confirmSave() { if (this.data.loadError || this.data.saving || !this.data.selected.start.length || !this.data.selected.finish.length) return; if (!currentUserId()) return wx.showToast({ title: '登录中，请稍后再试', icon: 'none' }); this.setData({ saving: true }); const draft = { name: this.data.dialogName.trim(), description: this.data.dialogDescription, angle: this.data.angle, grade: this.data.grade, footRule: this.data.footRule, holds: editor.value().holds }; try { const result = problemId ? await updateProblem(problemId, draft) : await saveProblem(wallId, draft); wx.removeStorageSync(draftKey); wx.showToast({ title: `${problemId ? '已更新' : '已保存'} ${result.number}` }); this.setData({ saveDialogVisible: false }); setTimeout(() => problemId ? wx.navigateBack() : wx.redirectTo({ url: `/pages/problem/editor/index?wallId=${encodeURIComponent(wallId)}` }), 500) } catch (error) { wx.showToast({ title: `${cloudErrorMessage(error)}，草稿已保留`, icon: 'none' }) } finally { this.setData({ saving: false }) } },
  back() { wx.navigateBack() },
})

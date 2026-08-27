// @ts-nocheck
import ProblemEditor from '../../../domain/editor.js'
import { demoLayout } from '../../../data/demo.js'
import { saveProblem } from '../../../services/problems.js'
import { currentUserId } from '../../../services/users.js'
import { getLayout } from '../../../services/layouts.js'

let layout = demoLayout; let wallId = 'wall_demo'; let layoutId = demoLayout.id; let draftKey = `problemDraft:${layoutId}`
let saved = wx.getStorageSync(draftKey) || {}; let editor = new ProblemEditor(saved.holds || saved)
const angles = [20, 25, 30, 35, 40, 45]; const grades = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12']
const roles = [{ id: 'start', label: 'Start', color: '#39a96b' }, { id: 'foot', label: 'Foot', color: '#d7ad18' }, { id: 'hand', label: 'Hand', color: '#316eea' }, { id: 'assist', label: 'Assist', color: '#ef8f39' }, { id: 'finish', label: 'Finish', color: '#8b55c7' }]
const footRules = ['feet_follow', 'specified', 'all']; const labels = { feet_follow: '手脚同点', specified: '指定脚点', all: '全墙脚点' }; const hints = { feet_follow: '手类点可踩，黄色 Foot 只能脚踩', specified: '脚只能踩黄色 Foot', all: '当前 Layout 所有岩点均可作为脚点' }

Page({
  data: { layout, angles, grades, angle: 35, angleIndex: 3, grade: 'V4', gradeIndex: 4, layoutId, roles, selectedRole: 'hand', footRules, footRuleIndex: 0, footRule: 'feet_follow', footRuleLabel: labels.feet_follow, footRuleHint: hints.feet_follow, name: saved.name || '', description: saved.description || '', selected: editor.value().holds },
  onLoad(options) { wallId = options.wallId || wallId; layoutId = options.layoutId || layoutId; draftKey = `problemDraft:${layoutId}`; saved = wx.getStorageSync(draftKey) || {}; const angle = saved.angle || 35; const grade = saved.grade || 'V4'; getLayout(layoutId).then(next => { layout = next; editor = new ProblemEditor(saved.holds || {}); this.setData({ layout, selected: editor.value().holds, name: saved.name || '', description: saved.description || '', footRule: saved.footRule || 'feet_follow', angle, angleIndex: Math.max(0, angles.indexOf(angle)), grade, gradeIndex: Math.max(0, grades.indexOf(grade)) }) }).catch(() => {}) },
  onReady() { if (!Object.keys(saved).length) return; wx.showModal({ title: '恢复线路草稿？', content: '检测到上次未完成的线路设置。', confirmText: '继续编辑', cancelText: '丢弃草稿', success: result => { if (!result.confirm) { saved = {}; editor.clear(); wx.removeStorageSync(draftKey); this.setData({ selected: editor.value().holds, name: '', description: '', footRule: 'feet_follow', angle: 35, angleIndex: 3, grade: 'V4', gradeIndex: 4, footRuleLabel: labels.feet_follow, footRuleHint: hints.feet_follow }) } } }) },
  selectAngle(e) { const index = Number(e.detail.value); this.setData({ angleIndex: index, angle: angles[index] }); this.persist() }, selectGrade(e) { const index = Number(e.detail.value); this.setData({ gradeIndex: index, grade: grades[index] }); this.persist() },
  selectRole(e) { this.setData({ selectedRole: e.currentTarget.dataset.role }) }, onHoldTap(e) { editor.toggle(e.detail.holdId, this.data.selectedRole); this.persist(); this.setData({ selected: editor.value().holds }) }, selectHold(e) { this.onHoldTap({ detail: { holdId: e.currentTarget.dataset.id } }) },
  selectFootRule(e) { const index = Number(e.detail.value); this.setData({ footRuleIndex: index, footRule: footRules[index], footRuleLabel: labels[footRules[index]], footRuleHint: hints[footRules[index]] }); this.persist() }, setName(e) { this.setData({ name: e.detail.value }); this.persist() }, setDescription(e) { this.setData({ description: e.detail.value }); this.persist() },
  undo() { editor.undo(); this.persist(); this.setData({ selected: editor.value().holds }) }, clear() { wx.showModal({ title: '清空线路？', content: '将移除当前线路的全部角色设置。', success: result => { if (result.confirm) { editor.clear(); this.persist(); this.setData({ selected: editor.value().holds }) } } }) },
  persist() { wx.setStorageSync(draftKey, { holds: editor.value().holds, name: this.data.name, description: this.data.description, footRule: this.data.footRule, angle: this.data.angle, grade: this.data.grade }) },
  save() { if (!currentUserId()) return wx.showToast({ title: '登录中，请稍后再试', icon: 'none' }); saveProblem(wallId, layoutId, { name: this.data.name, description: this.data.description, angle: this.data.angle, grade: this.data.grade, footRule: this.data.footRule, holds: editor.value().holds }).then(result => { wx.removeStorageSync(draftKey); wx.showToast({ title: `已保存 ${result.number}` }); setTimeout(() => wx.navigateBack(), 500) }).catch(() => wx.showToast({ title: '保存失败，草稿已保留', icon: 'none' })) }
})

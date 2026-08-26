// @ts-nocheck
import { ProblemEditor } from '../../../../src/domain/editor.js'
import { demoLayout } from '../../../../src/data/demo.js'
const draftKey=`problemDraft:${demoLayout.id}`
const roles=[{id:'start',label:'Start',color:'#39a96b'},{id:'foot',label:'Foot',color:'#d7ad18'},{id:'hand',label:'Hand',color:'#316eea'},{id:'assist',label:'Assist',color:'#ef8f39'},{id:'finish',label:'Finish',color:'#8b55c7'}]
const editor=new ProblemEditor(wx.getStorageSync(draftKey)||{start:[],foot:[],hand:[],assist:[],finish:[]})
Page({data:{layout:demoLayout,roles,selectedRole:'hand',footRule:'feet_follow',selected:editor.value().holds},selectRole(e){this.setData({selectedRole:e.currentTarget.dataset.role})},selectHold(e){editor.toggle(e.currentTarget.dataset.id,this.data.selectedRole);this.persist();this.setData({selected:editor.value().holds})},undo(){editor.undo();this.persist();this.setData({selected:editor.value().holds})},clear(){wx.showModal({title:'清空线路？',content:'将移除当前线路的全部角色设置。',success:result=>{if(result.confirm){editor.clear();this.persist();this.setData({selected:editor.value().holds})}}})},persist(){wx.setStorageSync(draftKey,JSON.parse(editor.serialize()))},save(){wx.showToast({title:'请先连接 CloudBase',icon:'none'})}})

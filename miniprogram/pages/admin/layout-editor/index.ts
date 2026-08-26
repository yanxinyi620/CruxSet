// @ts-nocheck
import { LayoutEditor } from '../../../../src/domain/layout-editor.js'
const editor=new LayoutEditor([])
Page({data:{holds:[],kind:'hold',continuous:true},setContinuous(e){this.setData({continuous:e.detail.value})},setKind(e){this.setData({kind:e.detail.value?'volume':'hold'})},addHold(e){editor.add({x:Number(e.currentTarget.dataset.x),y:Number(e.currentTarget.dataset.y),kind:this.data.kind});this.setData({holds:editor.value()})},undo(){editor.undo();this.setData({holds:editor.value()})},remove(e){editor.remove(e.currentTarget.dataset.id);this.setData({holds:editor.value()})},publish(){wx.showToast({title:'请先连接 CloudBase',icon:'none'})}})

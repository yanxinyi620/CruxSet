// @ts-nocheck
import { getProfile, updateProfile } from '../../services/users.js'
import { cloudErrorMessage } from '../../services/errors.js'
Page({data:{displayName:'',saving:false,error:''},onShow(){getProfile().then(p=>this.setData({displayName:p.displayName||''})).catch(e=>this.setData({error:cloudErrorMessage(e)}))},onInput(e){this.setData({displayName:e.detail.value})},save(){const value=this.data.displayName.trim();if(!value)return wx.showToast({title:'请输入昵称',icon:'none'});if(value.length>40)return wx.showToast({title:'昵称不能超过40个字',icon:'none'});this.setData({saving:true});updateProfile(value).then(()=>wx.showToast({title:'已保存'})).catch(e=>this.setData({error:cloudErrorMessage(e)})).finally(()=>this.setData({saving:false}))}})

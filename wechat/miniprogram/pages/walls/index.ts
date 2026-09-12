// @ts-nocheck
import { browsePage } from '../../services/browse-page.js'
import { listWalls } from '../../services/browse-data.js'
import { syncTabBar } from '../../services/tab-bar.js'
Page(browsePage({
  data:{walls:[],loading:true,error:''},
  async onShow(){
    syncTabBar(this, 0)
    const request=this._browseRequest=(this._browseRequest||0)+1
    this.setData({loading:!this.data.walls.length,error:''})
    try { const walls=await listWalls(); if(request===this._browseRequest)this.setData({walls,error:''}) }
    catch(error){if(request===this._browseRequest)this.setData({walls:[],error:error.message||'加载失败，请稍后重试'})}
    finally{if(request===this._browseRequest)this.setData({loading:false})}
  },
  openWall(e){wx.navigateTo({url:`/pages/wall/index?wallId=${e.currentTarget.dataset.id}`})}
}))

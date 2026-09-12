// @ts-nocheck
import { browsePage } from '../../services/browse-page.js'
import { getWall } from '../../services/browse-data.js'
Page(browsePage({
 data:{wallId:'',wallName:'',wall: null,canvasHeight:480,loading:true,error:''},
 async onLoad(options){
  const wallId=options.wallId||'', request=this._browseRequest=(this._browseRequest||0)+1
  this.setData({wallId})
  try{const wall=await getWall(wallId);if(request===this._browseRequest)this.setData({wall,error:'',wallName:wall.name,canvasHeight:Math.max(320,Math.min(900,678*wall.imageHeight/wall.imageWidth))})}
  catch(error){if(request===this._browseRequest)this.setData({wall: null,error:error.message||'墙面加载失败，请稍后重试'})}
  finally{if(request===this._browseRequest)this.setData({loading:false})}
 },
 openRouteBrowser(){if(this.data.wall)wx.navigateTo({url:`/pages/route-browser/index?wallId=${this.data.wallId}`})}
}))

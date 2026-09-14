// @ts-nocheck
import { browsePage } from '../../services/browse-page.js'
import { getWall } from '../../services/browse-data.js'
import { beginPageRead, pageReadError } from '../../services/page-read-state.js'
Page(browsePage({
 data:{wallId:'',wallName:'',wall: null,canvasHeight:480,loading:true,refreshing:false,error:'',notice:''},
 cacheMatches(key){if(key==='*')return true;const [,action,args]=JSON.parse(key);return action==='getWall'&&Object.fromEntries(args).id===this.data.wallId},
 onCacheError(key,error){pageReadError(this,error,{wall:null,wallName:''},true)},
 async onLoad(options,readOptions={}){
  const wallId=options.wallId||''
  this.setData({wallId})
  const read=beginPageRead(this,{wall:null,wallName:''})
  try{const wall=await getWall(wallId,readOptions);read.success({wall,wallName:wall.name,canvasHeight:Math.max(320,Math.min(900,678*wall.imageHeight/wall.imageWidth))})}
  catch(error){read.failure(error)}
  finally{read.finish()}
 },
 openRouteBrowser(){if(this.data.wall)wx.navigateTo({url:`/pages/route-browser/index?wallId=${this.data.wallId}`})}
}))

// @ts-nocheck
import { browsePage } from '../../services/browse-page.js'
import { listWalls } from '../../services/browse-data.js'
import { syncTabBar } from '../../services/tab-bar.js'
import { peekBrowse } from '../../services/cloud.js'
import { beginPageRead, pageReadError } from '../../services/page-read-state.js'
Page(browsePage({
  data:{walls:[],loading:true,refreshing:false,error:'',notice:''},
  cacheMatches(key){return key==='*'||JSON.parse(key)[1]==='listBrowseWalls'},
  onCacheError(key,error){pageReadError(this,error,{walls:[]},true)},
  async onShow(options={}){
    syncTabBar(this, 0)
    const cached=peekBrowse('listBrowseWalls')
    const read=beginPageRead(this,{walls:[]},cached ? {walls:cached}:undefined)
    try { read.success({walls:await listWalls(options)}) }
    catch(error){read.failure(error)}
    finally{read.finish()}
  },
  openWall(e){wx.navigateTo({url:`/pages/wall/index?wallId=${e.currentTarget.dataset.id}`})}
}))

// @ts-nocheck
import { WallEditor } from '../../../domain/wall-editor.js'
import { detectFromPixels } from '../../../domain/auto-detect.js'
import { currentUserIsAdmin, currentUserId } from '../../../services/users.js'
import { getWall, saveWallHolds, publishWall } from '../../../services/walls.js'
import { wallImagePath } from '../../../services/image-cache.js'
import { drawImagePixels } from '../../../services/image-processing.js'
import { cloudErrorMessage } from '../../../services/errors.js'
const hints={view:'单指拖动，双指缩放。',add:'点击墙图添加岩点。',move:'先点击一个岩点，再点击它的新位置。',delete:'点击要删除的岩点。'}
Page({
  data:{allowed:false,loading:true,wall:null,holdCount:0,locked:false,mode:'view',hint:hints.view,canUndo:false,canRedo:false,saving:false,detecting:false,error:'',notice:'',selected:{},radius:18,kind:'hold',dirty:false},
  async onLoad(options){this.options=options;this.generation=0;try{
    const allowed=await currentUserIsAdmin();this.setData({allowed});if(!allowed)return
    const wall=await getWall(options.wallId), locked=wall.visibility==='public' || wall.published===true
    this.draftKey=`wallDraft:${currentUserId()}:${wall.id}`
    const stored=wx.getStorageSync(this.draftKey)
    this.editor=new WallEditor(!locked && stored && stored.baseUpdatedAt===wall.updatedAt && Array.isArray(stored.holds) ? stored.holds : wall.holds)
    this.setData({wall,locked,notice:locked?'墙面已公开，岩点已锁定。':stored && stored.baseUpdatedAt===wall.updatedAt?'已恢复未保存的标注。':''})
    this.sync()
  }catch(error){this.setData({error:cloudErrorMessage(error)})}finally{this.setData({loading:false})}},
  onUnload(){this.generation++;this.persist()},
  onHide(){this.generation++;this.setData({detecting:false});this.persist()},
  persist(){if(!this.editor || this.data.locked || !this.draftKey || !this.data.dirty)return;try{wx.setStorageSync(this.draftKey,{baseUpdatedAt:this.data.wall.updatedAt,holds:this.editor.value()})}catch{this.setData({error:'草稿空间不足，请保存标注。'})}},
  editable(){return this.data.allowed && !this.data.locked && !this.data.saving && !this.data.detecting && !!this.editor},
  sync(dirty=false){const holds=this.editor.value();this.setData({wall:{...this.data.wall,holds},holdCount:holds.length,canUndo:this.editor.canUndo(),canRedo:this.editor.canRedo(),dirty:dirty||this.data.dirty});if(dirty)this.persist()},
  setMode(e){if(!this.editable())return;const mode=e.currentTarget.dataset.mode;if(!hints[mode])return;this.movingId=null;this.setData({mode,hint:hints[mode],selected:{}})},
  setRadius(e){this.setData({radius:Number(e.detail.value)})},
  setKind(e){this.setData({kind:e.currentTarget.dataset.kind})},
  onPoint(e){if(!this.editable())return;const {x,y,holdId}=e.detail
    if(this.data.mode==='add')this.editor.add({x,y,radius:this.data.radius/1000,kind:this.data.kind})
    else if(this.data.mode==='delete' && holdId)this.editor.remove(holdId)
    else if(this.data.mode==='move'){
      if(!this.movingId){if(holdId){this.movingId=holdId;this.setData({selected:{finish:[holdId]},hint:'点击岩点的新位置。'})}return}
      this.editor.move(this.movingId,x,y);this.movingId=null;this.setData({selected:{},hint:hints.move})
    }else return
    this.sync(true)
  },
  undo(){if(this.editable()){this.editor.undo();this.movingId=null;this.setData({selected:{}});this.sync(true)}},
  redo(){if(this.editable()){this.editor.redo();this.movingId=null;this.setData({selected:{}});this.sync(true)}},
  clear(){if(!this.editable())return;wx.showModal({title:'清空岩点？',content:'清空后可通过撤销恢复。',success:r=>{if(r.confirm && this.editable()){this.editor.clear();this.movingId=null;this.setData({selected:{}});this.sync(true)}}})},
  async save(){if(!this.editable())return;this.setData({saving:true,error:''});try{const wall=await saveWallHolds(this.data.wall.id,this.editor.value());this.setData({wall,dirty:false,notice:'草稿已保存。'});wx.removeStorageSync(this.draftKey)}catch(error){this.setData({error:cloudErrorMessage(error)});this.persist()}finally{this.setData({saving:false})}},
  async publish(){if(!this.editable() || this.data.holdCount<2)return
    this.setData({saving:true,error:''})
    try{
      const confirmed=await new Promise<boolean>(resolve=>wx.showModal({title:'发布墙面？',content:'发布后所有用户都可浏览和定线，墙图与岩点将锁定，不能继续修改。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
      if(!confirmed)return
      const savedWall = await saveWallHolds(this.data.wall.id,this.editor.value())
      this.setData({wall:savedWall})
      const wall=await publishWall(this.data.wall.id)
      this.setData({wall,locked:true,dirty:false,mode:'view',notice:'墙面已发布，现在可以创建线路。'})
      wx.removeStorageSync(this.draftKey)
    }catch(error){
      try { const remote = await getWall(this.data.wall.id); if (remote.visibility==='public' || remote.published) { this.setData({wall:remote,locked:true,dirty:false,mode:'view',notice:'墙面已发布，现在可以创建线路。'}); wx.removeStorageSync(this.draftKey); return } } catch {}
      this.setData({error:cloudErrorMessage(error)});this.persist()
    }finally{this.setData({saving:false})}
  },
  async detect(){if(!this.editable())return
    const confirmed=await new Promise<boolean>(resolve=>wx.showModal({title:'自动识别岩点',content:'识别结果将替换当前标注，可通过撤销恢复。识别后请手动检查。',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
    if(!confirmed || !this.editable())return
    const generation=++this.generation;this.setData({detecting:true,error:'',notice:''})
    try{
      const path=await wallImagePath(this.data.wall.displayImageFileId||this.data.wall.imageFileId)
      const {ctx,width,height}=await drawImagePixels(this,path,640)
      await new Promise(resolve=>setTimeout(resolve,30))
      if(generation!==this.generation)return
      const pixels=ctx.getImageData(0,0,width,height).data
      const holds=detectFromPixels(width,height,pixels)
      if(generation!==this.generation)return
      this.editor.replace(holds);this.movingId=null;this.setData({selected:{},hint:hints[this.data.mode]});this.sync(true)
      this.setData({notice:holds.length?`已识别 ${holds.length} 个岩点，请手动检查。`:'未识别到岩点，可撤销恢复或手动添加。'})
    }catch(error){if(generation===this.generation)this.setData({error:cloudErrorMessage(error)})}finally{if(generation===this.generation)this.setData({detecting:false})}
  },
  cancelDetect(){this.generation++;this.setData({detecting:false,notice:'已取消识别。'})},
  browse(){wx.navigateTo({url:`/pages/wall/index?wallId=${encodeURIComponent(this.data.wall.id)}`})},
  retry(){this.setData({loading:true,error:''});return this.onLoad(this.options)},
})

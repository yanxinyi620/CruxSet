export interface SyncResult {
  localWall?: {id:string;name:string;wallNumber?:number}
  remoteWall?: {id:string;name:string;wallNumber?:number}
  missingLocal:number;missingRemote:number;common:number
  invalid:Array<{id?:string;message:string}>
  addedLocal:number;addedRemote:number;skipped:number
  failed:Array<{direction?:string;message:string}>
  remainingLocal:number;remainingRemote:number
}
export async function runSyncBatches(call:()=>Promise<SyncResult>,progress:(result:SyncResult)=>void):Promise<SyncResult> {
  let total:SyncResult={missingLocal:0,missingRemote:0,common:0,invalid:[],addedLocal:0,addedRemote:0,skipped:0,failed:[],remainingLocal:0,remainingRemote:0}
  for(let i=0;i<2000;i++) {
    let page:SyncResult
    try {page=await call()} catch(error) {total.failed.push({message:`请求失败，部分线路可能已导入；可重新检查并重试。${(error as Error).message}`});return total}
    total={...page,addedLocal:total.addedLocal+page.addedLocal,addedRemote:total.addedRemote+page.addedRemote,skipped:total.skipped+page.skipped,failed:[...total.failed,...page.failed]}
    progress(total)
    if(total.failed.length||!page.remainingLocal&&!page.remainingRemote) return total
    if(!page.addedLocal&&!page.addedRemote&&!page.skipped) {total.failed.push({message:'本轮未能新增线路，请重新检查两端状态。'});return total}
  }
  total.failed.push({message:'本次同步已达到批次上限，请重新检查后继续。'})
  return total
}
const escapeHtml=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function openRouteSync(wall:{id:string;name:string},call:(action:'preview'|'sync')=>Promise<SyncResult>,refresh:()=>Promise<void>) {
  const dialog=document.createElement('dialog')
  dialog.className='route-sync-dialog'
  dialog.innerHTML=`<h2 tabindex="-1">同步线路</h2><p class="route-sync-wall">${escapeHtml(wall.name)}</p><p>目标平台：小程序</p><p class="route-sync-note">双向补齐缺少的线路。只新增，不覆盖，不同步删除；导入线路归目标平台管理员。</p><div data-sync-status role="status" aria-live="polite">正在检查两端线路…</div><div class="route-sync-actions"><button data-sync-check>重新检查</button><button data-sync-run disabled>双向补齐</button><button data-sync-close>关闭</button></div>`
  document.body.append(dialog)
  const status=dialog.querySelector<HTMLElement>('[data-sync-status]')!,check=dialog.querySelector<HTMLButtonElement>('[data-sync-check]')!,run=dialog.querySelector<HTMLButtonElement>('[data-sync-run]')!,close=dialog.querySelector<HTMLButtonElement>('[data-sync-close]')!
  let busy=false,ready=false
  const lock=(value:boolean)=>{busy=value;check.disabled=value;run.disabled=value||!ready;close.disabled=value;dialog.setAttribute('aria-busy',String(value))}
  const differences=(r:SyncResult)=>`<p>对应墙面：${escapeHtml(r.remoteWall?.name)}${r.remoteWall?.wallNumber?`（#${r.remoteWall.wallNumber}）`:''}</p><div class="route-sync-counts"><span>本端缺少<b>${r.missingLocal}</b></span><span>小程序缺少<b>${r.missingRemote}</b></span><span>两端已有<b>${r.common}</b></span></div>${r.invalid.length?`<p class="route-sync-warning">${r.invalid.length} 条线路未通过校验，暂不导入。</p>`:''}`
  const inspect=async()=>{
    ready=false;lock(true);status.textContent='正在检查两端线路…'
    try {const r=await call('preview');if(!dialog.isConnected)return;ready=!!(r.missingLocal+r.missingRemote);status.innerHTML=differences(r)+(ready?'':'<p>两端可同步的线路已齐全。</p>')}
    catch(error){status.textContent=(error as Error).message}
    finally{lock(false)}
  }
  check.onclick=()=>void inspect()
  run.onclick=async()=>{
    ready=false;lock(true)
    const total=await runSyncBatches(()=>call('sync'),r=>{status.textContent=`正在补齐…本端已新增 ${r.addedLocal} 条，小程序已新增 ${r.addedRemote} 条。`})
    status.innerHTML=`<p>${total.failed.length?'同步未全部完成':'补齐完成'}：本端新增 ${total.addedLocal} 条，小程序新增 ${total.addedRemote} 条。</p>${total.skipped?`<p>已跳过 ${total.skipped} 条重复线路。</p>`:''}${total.invalid.length?`<p>${total.invalid.length} 条线路未通过校验，未导入。</p>`:''}${total.failed.map(f=>`<p class="route-sync-warning">${escapeHtml(f.message)}</p>`).join('')}${total.failed.length?'<p>点击“重新检查”后可重试，已导入线路不会重复新增。</p>':''}`
    try{await refresh()}catch{status.insertAdjacentHTML('beforeend','<p>列表刷新失败，请关闭弹窗后刷新页面。</p>')}
    lock(false)
  }
  close.onclick=()=>dialog.close()
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()})
  dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy)dialog.close()})
  dialog.addEventListener('close',()=>dialog.remove(),{once:true})
  dialog.showModal();dialog.querySelector<HTMLElement>('h2')!.focus();void inspect()
}

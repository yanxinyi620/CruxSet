// @ts-nocheck
const STORAGE = 'cruxset:saved-images:v1'
const AGE = 7 * 24 * 60 * 60 * 1000, LIMIT = 12, BYTES = 30 * 1024 * 1024
const directory = () => `${wx.env.USER_DATA_PATH}/cruxset-images`
let rows, saving = Promise.resolve()
const owned = path => typeof path === 'string' && path.startsWith(directory() + '/') && !path.includes('/../')
function remove(path) { try { if(owned(path))wx.getFileSystemManager().unlinkSync(path) } catch {} }
function write() { try { wx.setStorageSync(STORAGE, rows);return true } catch { return false } }
function load() {
 if(rows)return
 try{const stored=wx.getStorageSync(STORAGE);rows=Array.isArray(stored)?stored.filter(r=>r&&typeof r.key==='string'&&owned(r.path)&&Number.isFinite(r.created)&&Number.isFinite(r.used)&&Number.isFinite(r.size)&&r.size>0):[]}catch{rows=[]}
 prune()
}
function prune() {
 const now=Date.now();let bytes=0
 rows.sort((a,b)=>b.used-a.used)
 rows=rows.filter((r,i)=>{const keep=now-r.created<AGE&&r.created<=now&&i<LIMIT&&bytes+r.size<=BYTES;if(keep)bytes+=r.size;else remove(r.path);return keep})
 write()
}
export function savedImage(key) {
 load();prune()
 const row=rows.find(r=>r.key===key)
 if(!row)return
 try{wx.getFileSystemManager().accessSync(row.path);row.used=Date.now();write();return row.path}
 catch{forgetSavedImage(key)}
}
export function forgetSavedImage(key) {load();for(const r of rows.filter(r=>r.key===key))remove(r.path);rows=rows.filter(r=>r.key!==key);write()}
export function saveImage(key, tempPath, current=()=>true) {
 // Serialize copies so simultaneous downloads cannot exceed the disk budget.
 const task=saving.then(async()=>{
  load()
  if(!current())return tempPath
  const info=await new Promise((resolve,reject)=>wx.getFileInfo({filePath:tempPath,success:resolve,fail:reject}))
  if(!info.size||info.size>BYTES)return tempPath
  const fs=wx.getFileSystemManager(),dir=directory()
  try{fs.mkdirSync(dir,true)}catch{}
  const path=`${dir}/${Date.now()}-${Math.random().toString(36).slice(2)}.img`
  // Free least-recently-used files before copying the next one.
  rows.sort((a,b)=>b.used-a.used)
  while(rows.length&&(rows.length>=LIMIT||rows.reduce((n,r)=>n+r.size,0)+info.size>BYTES)){remove(rows.pop().path)}
  write()
  try { await new Promise((resolve,reject)=>fs.copyFile({srcPath:tempPath,destPath:path,success:resolve,fail:reject})) }
  catch(error){remove(path);throw error}
  if(!current()){remove(path);return tempPath}
  forgetSavedImage(key)
  rows.push({key,path,size:info.size,created:Date.now(),used:Date.now()});prune()
  if(!write()){remove(path);rows=rows.filter(r=>r.path!==path);return tempPath}
  return path
 })
 saving=task.catch(()=>{})
 return task.catch(()=>tempPath)
}

import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const html = () => readFileSync('tools/segmentation-lab/static/index.html', 'utf8')
function page() {
  const nodes = new Map<string, any>()
  const $ = (key: string) => {
    if (!nodes.has(key)) nodes.set(key, {value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,classList:{add:vi.fn(),remove:vi.fn()},focus:vi.fn()})
    return nodes.get(key)
  }
  const request = vi.fn(async () => new Response(JSON.stringify({id:'r',status:'pending',items:[],isAdmin:false})))
  const context = vm.createContext({$,Lab:{request,api:(p:string)=>'/api/v1/segmentation-lab'+p,report:(e:Error,n:any)=>{n.textContent=e.message}},defaultPublishTarget:'web',load:vi.fn(),Response,URL,console,
    escapeText:(v:unknown)=>String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)),time:()=> '日期'})
  const script = html().split('// Publish request interactions start')[1]?.split('// Publish request interactions end')[0]
  expect(script).toBeTruthy()
  context.requestsPoll = {refresh: () => vm.runInContext("fetchPublishRequests()", context)}
  vm.runInContext(script!,context)
  return {$,request,run:(s:string)=>vm.runInContext(s,context)}
}

describe('lab cross-platform publication interactions', () => {
  it('places applications between calibrations and the lab explanation', () => {
    expect(html().indexOf('id="publishRequestsSection"')).toBeGreaterThan(html().indexOf('id="calibrations"'))
    expect(html().indexOf('id="publishRequestsSection"')).toBeLessThan(html().indexOf('id="quotaSection"'))
  })
  it('confirms creator requests with target-admin ownership before submitting through the request endpoint', async () => {
    const p=page()
    p.run('requestTargets = ["cloudbase", "cloudflare"]; publishCapabilitiesReady=true; publishCalibration("e", "c", {disabled:false})')
    p.$('#publishName').value='测试墙'
    p.$('#publishTarget').value='cloudbase'
    p.run('updatePublishIntent()')
    expect(p.$('#publishDescription').textContent).toContain('管理员')
    expect(p.$('#publishDescription').textContent).toContain('不占用')
    expect(p.$('#publishSubmit').textContent).toBe('确认提交申请')
    expect(p.request).not.toHaveBeenCalled()
    await p.run('submitPublish()')
    expect(p.request).toHaveBeenCalledWith('/experiments/e/calibrations/c/publish-requests',expect.objectContaining({method:'POST',body:JSON.stringify({wallName:'测试墙',target:'cloudbase'})}))
    expect(p.$('#publishMessage').textContent).toContain('已提交')
  })
  it('keeps direct local publication for creators and direct cross-platform publication for admins', async () => {
    for(const [targets,target] of [[['cloudbase','cloudflare'],'web'],[[],'cloudbase']] as const){
      const p=page()
      p.run(`requestTargets=${JSON.stringify(targets)};publishCapabilitiesReady=true;publishCalibration("e","c",{disabled:false})`)
      p.$('#publishName').value='墙';p.$('#publishTarget').value=target
      await p.run('submitPublish()')
      expect(p.request).toHaveBeenCalledWith('/experiments/e/calibrations/c/publish',expect.objectContaining({method:'POST'}))
    }
  })
  it('does not submit while capabilities are unavailable', async () => {
    const p=page();p.run('publishCalibration("e","c",{disabled:false})');p.$('#publishName').value='墙'
    await p.run('submitPublish()')
    expect(p.request).not.toHaveBeenCalled()
  })
  it('shows the applicant name without exposing their user ID in the table', () => {
    const p=page()
    const item={id:'r',applicantId:'internal-user-id',applicantName:'岩友 <A>',wallName:'墙',target:'cloudbase',status:'pending'}
    expect(p.run(`requestRow(${JSON.stringify(item)},true)`)).toContain('岩友 &lt;A&gt;')
    expect(p.run(`requestRow(${JSON.stringify(item)},true)`)).not.toContain('internal-user-id')
    delete (item as any).applicantName
    expect(p.run(`requestRow(${JSON.stringify(item)},true)`)).not.toContain('internal-user-id')
  })
  it('renders escaped status and links, and only gives admins pending or failed review actions', () => {
    const p=page()
    const item={id:'r',applicantId:'member',wallName:'<img onerror=alert(1)>',target:'cloudbase',createdAt:1,status:'pending',reason:'<script>',result:{browseUrl:'javascript:alert(1)'}}
    const member=p.run(`requestRow(${JSON.stringify(item)},false)`)
    expect(member).toContain('&lt;img');expect(member).not.toContain('data-review-action')
    expect(member).not.toContain('javascript:');expect(member).toContain('/publish-requests/r/preview')
    const admin=p.run(`requestRow(${JSON.stringify(item)},true)`)
    expect(admin).toContain('data-review-action="approve"');expect(admin).toContain('data-review-action="reject"')
    expect(p.run(`requestRow(${JSON.stringify({...item,status:'published'})},true)`)).not.toContain('data-review-action')
  })
  it('prevents duplicate approval clicks and sends rejection reasons', async () => {
    const p=page()
    let finish!: (r:Response)=>void
    p.request.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve}))
    const first=p.run('reviewRequest("r","approve")')
    await p.run('reviewRequest("r","approve")')
    expect(p.request).toHaveBeenCalledTimes(1)
    finish(new Response(JSON.stringify({status:'published'})));await first
    await p.run('reviewRequest("r","reject","岩点需要调整")')
    expect(p.request).toHaveBeenCalledWith('/publish-requests/r/reject',expect.objectContaining({body:JSON.stringify({reason:'岩点需要调整'})}))
  })
})

it('offers matching danger delete buttons only for completed requests and hides wall IDs in status tooltips', () => {
  const p=page()
  for (const admin of [true,false]) {
    for (const status of ['published','rejected','pending','publishing','failed']) {
      const row=p.run(`requestRow(${JSON.stringify({id:'r',status,result:{wallId:'wall-123'}})},${admin})`)
      expect(row.includes('data-delete-request-id="r"')).toBe(['published','rejected'].includes(status))
      if (['published','rejected'].includes(status)) expect(row).toContain('class="danger"')
      if (status==='published') {
        expect(row).toContain('title="墙面编号：wall-123"')
        expect(row.replace(/<[^>]*>/g,'')).not.toContain('wall-123')
      }
    }
  }
})

it('uses confirmation for applicant deletion and refreshes only the request list afterward', async () => {
  const nodes=new Map<string,any>()
  const $=(key:string)=>{
    if(!nodes.has(key)) nodes.set(key,{textContent:'',disabled:false,classList:{add:vi.fn(),remove:vi.fn()}})
    return nodes.get(key)
  }
  const request=vi.fn().mockResolvedValue({}), refresh=vi.fn(), load=vi.fn()
  const context=vm.createContext({$,Lab:{request,report:vi.fn()},load,loadPublishRequests:refresh})
  const confirmFunctions=html().slice(html().indexOf('      function del(url)'),html().indexOf('      // Publish request interactions start'))
  vm.runInContext('let pendingDelete;'+confirmFunctions,context)
  vm.runInContext('del("/publish-requests/r")',context)
  expect(request).not.toHaveBeenCalled()
  expect($('#deleteDescription').textContent).toContain('已发布的墙面不受影响')
  const deleteHandler=html().slice(html().indexOf('      $("#confirmDelete").onclick'),html().indexOf('      async function fetchExperiments'))
  vm.runInContext(deleteHandler,context)
  await $('#confirmDelete').onclick()
  expect(request).toHaveBeenCalledWith('/publish-requests/r',{method:'DELETE'})
  expect(refresh).toHaveBeenCalledOnce()
  expect(load).not.toHaveBeenCalled()
  vm.runInContext('del("/experiments/e")',context)
  expect($('#deleteDescription').textContent).toContain('相关结果与文件将一并移除')
})

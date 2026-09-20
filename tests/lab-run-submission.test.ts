import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {expect,it,vi} from 'vitest'

function page(){
  const html=readFileSync('tools/segmentation-lab/static/index.html','utf8')
  const nodes=new Map<string,any>()
  const $=(key:string)=>{
    if(!nodes.has(key))nodes.set(key,{value:({ '#runImage':'e','#runPoints':'48','#runBatch':'8','#runIou':'0.85','#runStable':'0.9','#runCrop':'0'} as any)[key]||'',disabled:false,textContent:'确认并运行'})
    return nodes.get(key)
  }
  const request=vi.fn(async(..._args:any[])=>new Response('{}',{status:202})),load=vi.fn(async()=>{}),closeRun=vi.fn(),report=vi.fn()
  const context=vm.createContext({$,Lab:{request,report},load,closeRun,selectedModel:'sam2',isCloud:true,crypto})
  const code=html.includes('// Model submission interactions start')
    ?html.split('// Model submission interactions start')[1].split('// Model submission interactions end')[0]
    :html.slice(html.indexOf('      $("#runConfirm").onclick='),html.indexOf('      let cropImage'))
  vm.runInContext(code,context)
  return {$,request,load,closeRun,report,context,run:()=>$('#runConfirm').onclick(),retry:(button:any)=>{context.retryButton=button;return vm.runInContext('retryRun("e","sam2",{},retryButton)',context)}}
}

it('locks the run button while submitting and sends only one request for repeated clicks',async()=>{
  const f=page();let finish!:(r:Response)=>void
  f.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  const first=f.run();await f.run()
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.$('#runConfirm').disabled).toBe(true)
  finish(new Response('{}',{status:202}));await first
  expect(f.$('#runConfirm').disabled).toBe(false)
  expect(f.load).toHaveBeenCalledTimes(1)
})

it('keeps a submission ID after a lost response but uses a new ID for a later deliberate run',async()=>{
  const f=page();f.request.mockRejectedValueOnce(new Error('network'))
  await f.run();await f.run();await f.run()
  const ids=f.request.mock.calls.map(call=>JSON.parse(call[1].body).submissionId)
  expect(ids[0]).toEqual(expect.any(String))
  expect(ids[1]).toBe(ids[0]);expect(ids[2]).not.toBe(ids[1])
})

it('also blocks duplicate retry clicks and re-enables a failed retry button',async()=>{
  const f=page(),button={disabled:false,textContent:'重试'};let reject!:(e:Error)=>void
  f.request.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r}))
  const first=f.retry(button);await f.retry(button)
  expect(f.request).toHaveBeenCalledTimes(1);expect(button.disabled).toBe(true)
  reject(new Error('network'));await first
  expect(button.disabled).toBe(false)
  await f.retry(button)
  expect(JSON.parse(f.request.mock.calls[0][1].body).submissionId).toBe(JSON.parse(f.request.mock.calls[1][1].body).submissionId)
})

it('starts a new submission after the previously accepted task was deleted',async()=>{
  const f=page()
  f.request.mockRejectedValueOnce(new Error('lost response')).mockRejectedValueOnce(Object.assign(new Error('deleted'),{status:410}))
  await f.run();await f.run();await f.run()
  const ids=f.request.mock.calls.map(call=>JSON.parse(call[1].body).submissionId)
  expect(ids[1]).toBe(ids[0]);expect(ids[2]).not.toBe(ids[1])
})

it('does not create another task if submission succeeded but refreshing the list failed',async()=>{
  const f=page();f.load.mockRejectedValueOnce(new Error('refresh failed'))
  await f.run();await f.run()
  expect(JSON.parse(f.request.mock.calls[1][1].body).submissionId).toBe(JSON.parse(f.request.mock.calls[0][1].body).submissionId)
})

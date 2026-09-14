import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {afterEach, expect, it, vi} from 'vitest'

function setup() {
  vi.useFakeTimers()
  const listeners: Record<string, () => void> = {}
  const document = {hidden:false, addEventListener:(name:string, fn:()=>void) => {listeners[name]=fn}}
  const window:any = {}
  vm.runInNewContext(readFileSync('tools/segmentation-lab/static/runtime.js','utf8'), {
    window, document, setTimeout, clearTimeout, fetch:vi.fn(),
  })
  return {Lab:window.Lab, document, listeners}
}
afterEach(() => vi.useRealTimers())
it('uses the returned interval and pauses hidden pages, refreshing on return', async () => {
  const {Lab, document, listeners} = setup()
  const run = vi.fn().mockResolvedValueOnce(5000).mockResolvedValue(60000)
  const poll = Lab.createPoller(run)
  await poll.refresh()
  await vi.advanceTimersByTimeAsync(5000)
  expect(run).toHaveBeenCalledTimes(2)
  document.hidden=true; listeners.visibilitychange()
  await vi.advanceTimersByTimeAsync(120000)
  expect(run).toHaveBeenCalledTimes(2)
  document.hidden=false; listeners.visibilitychange()
  await vi.advanceTimersByTimeAsync(0)
  expect(run).toHaveBeenCalledTimes(3)
})
it('serializes requests and retains a refresh requested during an in-flight read', async () => {
  const {Lab} = setup()
  let finish!: (value:number)=>void
  const run=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue(60000)
  const poll=Lab.createPoller(run)
  const first=poll.refresh()
  poll.refresh(); poll.refresh()
  expect(run).toHaveBeenCalledTimes(1)
  finish(60000); await first
  await vi.advanceTimersByTimeAsync(0)
  expect(run).toHaveBeenCalledTimes(2)
})
it('backs off transient failures and stops all pollers on authorization failure', async () => {
  const {Lab} = setup()
  const report=vi.fn()
  const run=vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(5000)
  const poll=Lab.createPoller(run, report)
  await poll.refresh()
  await vi.advanceTimersByTimeAsync(9999); expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1); expect(run).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(20000); expect(run).toHaveBeenCalledTimes(3)
  const denied=Lab.createPoller(async()=>{throw Object.assign(new Error('denied'),{status:403})},report)
  await denied.refresh()
  await vi.advanceTimersByTimeAsync(120000)
  expect(run).toHaveBeenCalledTimes(3)
})

it.each(['local','cloud'])('integrates independent polling and stable list rendering in %s mode', async mode => {
  const {Lab, document, listeners} = setup()
  Lab.config.mode=mode
  const nodes=new Map<string, any>()
  const querySelector=(key:string)=>{
    if (!nodes.has(key)) {
      let html=''
      const node:any={value:'',style:{},classList:{contains:()=>false,add:()=>{},remove:()=>{}},getContext:()=>({}),writes:0}
      Object.defineProperty(node,'innerHTML',{get:()=>html,set:(v:string)=>{html=v;node.writes++}})
      nodes.set(key,node)
    }
    return nodes.get(key)
  }
  let status='running'
  Lab.request=vi.fn(async(path:string)=>({json:async()=>path==='/experiments'
    ? {items:[{id:'e',image:{name:'wall.png',width:10,height:10},runs:{t:{status}}}]}
    : {items:[]}}))
  const context=vm.createContext({Lab,document:{...document,querySelector},URL,console})
  const script=readFileSync('tools/segmentation-lab/static/index.html','utf8').match(/<script>\s*([\s\S]*?)<\/script>/)![1]
  vm.runInContext(script,context)
  await vi.advanceTimersByTimeAsync(0)
  const count=(path:string)=>Lab.request.mock.calls.filter(([p]:string[])=>p===path).length
  expect(count('/experiments')).toBe(1)
  status='succeeded'
  await vi.advanceTimersByTimeAsync(5000)
  expect(count('/experiments')).toBe(2)
  expect(count('/calibrations')).toBe(1)
  expect(count('/publish-requests')).toBe(1)
  expect(querySelector('#images').writes).toBe(1)
  await vi.advanceTimersByTimeAsync(5000)
  expect(count('/experiments')).toBe(2)
})

it('defers automatic reads during dialogs but permits explicit mutation refreshes', async () => {
  const {Lab}=setup()
  let paused=false
  const run=vi.fn().mockResolvedValue(5000)
  const poll=Lab.createPoller(run,vi.fn(),()=>paused)
  await poll.refresh()
  paused=true
  await vi.advanceTimersByTimeAsync(10000)
  expect(run).toHaveBeenCalledTimes(1)
  await poll.refresh()
  expect(run).toHaveBeenCalledTimes(2)
  paused=false
  await vi.advanceTimersByTimeAsync(5000)
  expect(run).toHaveBeenCalledTimes(3)
})
it('caps repeated failures at two minutes and resets backoff after recovery', async () => {
  const {Lab}=setup()
  const run=vi.fn().mockRejectedValue(new Error('offline'))
  const poll=Lab.createPoller(run)
  await poll.refresh()
  for (const delay of [10000,20000,40000,80000,120000,120000]) {
    const before=run.mock.calls.length
    await vi.advanceTimersByTimeAsync(delay-1)
    expect(run).toHaveBeenCalledTimes(before)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(before+1)
  }
  run.mockResolvedValueOnce(5000)
  await vi.advanceTimersByTimeAsync(120000)
  await vi.advanceTimersByTimeAsync(5000)
  const before=run.mock.calls.length
  await vi.advanceTimersByTimeAsync(10000)
  expect(run).toHaveBeenCalledTimes(before+1)
})

it('keeps queued explicit refreshes immediate even while a dialog is open', async () => {
  const {Lab}=setup()
  let finish!: (delay:number)=>void
  const run=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValue(60000)
  const poll=Lab.createPoller(run,vi.fn(),()=>true)
  const first=poll.refresh()
  poll.refresh()
  finish(60000); await first
  await vi.advanceTimersByTimeAsync(0)
  expect(run).toHaveBeenCalledTimes(2)
})
it('allows a manual retry after reauthentication but never retries on visibility alone', async () => {
  const {Lab,listeners}=setup()
  const run=vi.fn().mockRejectedValueOnce(Object.assign(new Error('login'),{status:401})).mockResolvedValue(5000)
  const poll=Lab.createPoller(run)
  await poll.refresh()
  listeners.visibilitychange()
  await vi.advanceTimersByTimeAsync(60000)
  expect(run).toHaveBeenCalledTimes(1)
  await poll.refresh()
  expect(run).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(5000)
  expect(run).toHaveBeenCalledTimes(3)
})
it('resumes other stopped lists after a successful manual authorization retry', async () => {
  const {Lab}=setup()
  const experiments=vi.fn().mockResolvedValue(5000)
  await Lab.createPoller(experiments).refresh()
  const requests=vi.fn().mockRejectedValueOnce(Object.assign(new Error('login'),{status:401})).mockResolvedValue(60000)
  const poll=Lab.createPoller(requests)
  await poll.refresh()
  await vi.advanceTimersByTimeAsync(10000)
  expect(experiments).toHaveBeenCalledTimes(1)
  await poll.refresh()
  await vi.advanceTimersByTimeAsync(0)
  expect(experiments).toHaveBeenCalledTimes(2)
})

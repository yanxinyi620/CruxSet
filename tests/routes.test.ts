import { describe, expect, it } from 'vitest'
import { createProblem, filterProblems, searchProblems } from '../src/domain/routes.js'
import type { Wall } from '../src/domain/types.js'

const wall: Wall = { id:'wall_1', name:'日坛', description:'', imageFileId:'cloud://wall', imageWidth:1000, imageHeight:800, geometryType:'circle', holds:[{id:'H001',x:.1,y:.1,radius:.02,kind:'hold'},{id:'H002',x:.2,y:.2,radius:.02,kind:'hold'},{id:'H003',x:.3,y:.3,radius:.02,kind:'hold'}], angleOptions:[25,35], ownerId:'usr_1', visibility:'public', createdAt:1, updatedAt:1 }
const valid = { id:'problem_1', number:'CS-000001', wallId:'wall_1', angle:35, grade:'V4', holds:{start:['H001'],finish:['H002']}, createdBy:'usr_1', now:100 }

describe('routes', () => {
  it('defaults to feet_follow and keeps id distinct from number',()=>{const p=createProblem(valid,wall);expect(p.footRule).toBe('feet_follow');expect(p.id).not.toBe(p.number);expect(p.createdAt).toBe(100)})
  it.each([[{...valid,wallId:'another'},'wall'],[{...valid,holds:{finish:['H002']}},'start'],[{...valid,holds:{start:['H001']}},'finish'],[{...valid,angle:30},'angle'],[{...valid,grade:'V4+'},'grade'],[{...valid,footRule:'specified',holds:{start:['H001'],finish:['H002']}},'foot'],[{...valid,holds:{start:['missing'],finish:['H002']}},'unknown']])('rejects invalid draft %#',(draft,message)=>expect(()=>createProblem(draft as any,wall)).toThrow(message as string))
  it('filters, sorts and searches current results',()=>{const a=createProblem({...valid,id:'problem_2',number:'CS-000002',name:'左侧动态'},wall);const b=createProblem({...valid,id:'problem_1',number:'CS-000001',angle:25},wall);expect(filterProblems([a,b],{wallId:'wall_1',angle:35,grade:'V4'})).toEqual([a]);expect(searchProblems([b,a],'动态')).toEqual([a])})
  it('applies all three foot rules exactly',()=>{expect(createProblem(valid,wall).holds.foot).toEqual([]);expect(createProblem({...valid,holds:{start:['H001'],foot:['H003'],finish:['H002']}},wall).footRule).toBe('feet_follow');expect(createProblem({...valid,footRule:'all'},wall).footRule).toBe('all')})
})

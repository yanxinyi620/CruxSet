import { demoDraftWall, demoWall } from '../data/demo.js'
import { demoProblems } from '../data/demo-problems.js'
import type { Problem, ProblemHolds, Wall } from '../domain/types.js'
export const mockCurrentUserId = 'usr_mock_owner'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const roles = (holds?: Partial<ProblemHolds>): ProblemHolds => ({ start: holds?.start || [], foot: holds?.foot || [], hand: holds?.hand || [], assist: holds?.assist || [], finish: holds?.finish || [] })
export class MockRepository {
  private walls = clone([demoWall, demoDraftWall]); private problems = clone(demoProblems)
  private admin = false
  setAdmin(value: boolean){ this.admin = value }
  async listWalls(){return clone(this.walls.filter(w=>w.visibility==='public'&&w.holds.length>=2))}
  async listMyWalls(){return clone(this.walls.filter(w=>w.ownerId===mockCurrentUserId))}
  async listAdminWalls(){if(!this.admin)throw new Error('FORBIDDEN');return clone(this.walls)}
  async getWall(id:string){const wall=this.walls.find(w=>w.id===id);if(!wall)throw new Error('WALL_NOT_FOUND');return clone(wall)}
  async createWall(data:Partial<Wall>){const now=Date.now(),wall:Wall={id:`wall_mock_${now}_${this.walls.length}`,name:data.name||'未命名墙面',description:data.description||'',imageFileId:data.imageFileId||'',imageWidth:data.imageWidth||0,imageHeight:data.imageHeight||0,geometryType:data.geometryType||'circle',holds:clone(data.holds||[]),angleOptions:data.angleOptions||[20,25,30,35,40,45],ownerId:mockCurrentUserId,visibility:'private',createdAt:now,updatedAt:now};this.walls.push(wall);return clone(wall)}
  async updateWall(id:string,patch:Partial<Wall>){const wall=this.walls.find(w=>w.id===id);if(!wall||wall.ownerId!==mockCurrentUserId)throw new Error('FORBIDDEN');if(wall.visibility==='public')throw new Error('WALL_LOCKED');Object.assign(wall,clone(patch),{id:wall.id,ownerId:wall.ownerId,visibility:'private',updatedAt:Date.now()});return clone(wall)}
  async publishWall(id:string){const wall=this.walls.find(w=>w.id===id);if(!wall||wall.ownerId!==mockCurrentUserId)throw new Error('FORBIDDEN');if(wall.visibility==='public')throw new Error('WALL_LOCKED');if(wall.holds.length<2)throw new Error('WALL_NOT_ROUTABLE');wall.visibility='public';wall.updatedAt=Date.now();return clone(wall)}
  async listProblems(filter:Partial<Pick<Problem,'wallId'|'angle'|'grade'>>={}){return clone(this.problems.filter(p=>Object.entries(filter).every(([k,v])=>v===undefined||p[k as keyof Problem]===v)).sort((a,b)=>a.number.localeCompare(b.number)))}
  async listMyProblems(){return clone(this.problems.filter(p=>p.createdBy===mockCurrentUserId).sort((a,b)=>b.createdAt-a.createdAt))}
  async getProblem(id:string){const problem=this.problems.find(p=>p.id===id);if(!problem)throw new Error('PROBLEM_NOT_FOUND');return clone(problem)}
  async createProblem(wallId:string,draft:Partial<Problem>){const wall=await this.getWall(wallId);if(wall.visibility!=='public'||wall.holds.length<2)throw new Error('WALL_NOT_ROUTABLE');const now=Date.now(),problem:Problem={id:`problem_mock_${now}`,number:`CS-${String(this.problems.length+1).padStart(6,'0')}`,wallId,name:draft.name,description:draft.description,angle:draft.angle||wall.angleOptions[0],grade:draft.grade||'V0',footRule:draft.footRule||'feet_follow',holds:roles(draft.holds),createdBy:mockCurrentUserId,createdAt:now,updatedAt:now};this.problems.push(problem);return{id:problem.id,number:problem.number}}
  async updateProblem(id:string,draft:Partial<Problem>){const problem=this.problems.find(p=>p.id===id);if(!problem)throw new Error('PROBLEM_NOT_FOUND');if(problem.createdBy!==mockCurrentUserId)throw new Error('FORBIDDEN');Object.assign(problem,clone(draft),{id:problem.id,number:problem.number,wallId:problem.wallId,createdBy:problem.createdBy,createdAt:problem.createdAt,updatedAt:Date.now()});return{id:problem.id,number:problem.number}}
  async deleteProblem(id:string){const i=this.problems.findIndex(p=>p.id===id);if(i<0)throw new Error('PROBLEM_NOT_FOUND');if(this.problems[i].createdBy!==mockCurrentUserId)throw new Error('FORBIDDEN');this.problems.splice(i,1);return{ok:true as const}}
  async deleteWall(id:string){if(!this.admin)throw new Error('FORBIDDEN');const wall=await this.getWall(id);if(this.problems.some(p=>p.wallId===id))throw new Error('WALL_IN_USE');this.walls=this.walls.filter(w=>w.id!==id);return{ok:true as const}}
  async uploadWallImage(filePath:string){return{fileID:filePath}} async getWallImageUrl(fileID:string){return fileID}
}
export const createMockRepository=()=>new MockRepository();const activeRepository=createMockRepository();export const repositoryForMode=(mode:'mock'|'cloudbase')=>mode==='mock'?activeRepository:undefined;export const mockRepository=activeRepository

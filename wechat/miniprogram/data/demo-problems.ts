import type { Problem } from '../domain/types.js'
const route = (number: string, name: string, angle = 35): Problem => ({ id: `problem_${number}`, number, name, wallId: 'wall_demo', angle, grade: 'V4', footRule: 'feet_follow', holds: { start: ['H001'], foot: [], hand: ['H007','H013'], assist: [], finish: ['H024'] }, createdBy: 'usr_mock_owner', createdAt: 0, updatedAt: 0 })
export const demoProblems: Problem[] = [route('CS-000121','左侧动态'),route('CS-000122','中间平衡'),route('CS-000123','右侧压身'),route('CS-000124','高步转换',25)]

import type {Problem} from './types.js'; import {filterProblems,searchProblems} from './routes.js'
export const browseProblems=(problems:Problem[],filter:Partial<Pick<Problem,'wallId'|'layoutId'|'angle'|'grade'>>,query='')=>searchProblems(filterProblems(problems,filter),query)

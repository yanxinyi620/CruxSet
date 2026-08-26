import type { Problem } from '../domain/types.js'
export interface ProblemRepository { create(problem: Problem): Promise<Problem>; getAll(): Promise<Problem[]>; getByNumber(number: string): Promise<Problem | undefined> }

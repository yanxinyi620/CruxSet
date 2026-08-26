export type HoldType = 'start' | 'hand' | 'assist' | 'foot' | 'finish'
export type FootRule = 'feet_follow' | 'specified' | 'all'
export interface Hold { id: string; layoutId: string; type: HoldType; x: number; y: number; radius: number; polygon?: Array<[number, number]> }
export interface Problem { id: string; number: string; name?: string; wallId: string; layoutId: string; angle: number; grade: string; footRule: FootRule; holds: Record<HoldType, string[]>; createdAt: string }

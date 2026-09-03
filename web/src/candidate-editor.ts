import type { Hold, HoldKind, Point } from '../../wechat/miniprogram/domain/types.js'

export interface CandidateState {
  confirmed: Hold[]
  candidates: Hold[]
}

export const holdsForPersistence = (confirmed: readonly Hold[], _candidates: readonly Hold[] = []): Hold[] => cloneHolds(confirmed)

const cloneHold = (hold: Hold): Hold => ({
  ...hold,
  bbox: hold.bbox ? [...hold.bbox] as Hold['bbox'] : undefined,
  polygon: hold.polygon ? hold.polygon.map(([x, y]) => [x, y] as Point) : undefined,
})

const cloneHolds = (holds: readonly Hold[]): Hold[] => holds.map(cloneHold)
const cloneState = (state: CandidateState): CandidateState => ({
  confirmed: cloneHolds(state.confirmed),
  candidates: cloneHolds(state.candidates),
})

const nextId = (holds: readonly Hold[]): string => {
  const used = new Set(holds.map(hold => hold.id))
  let number = holds.reduce((max, hold) => {
    const match = /^H(\d+)$/.exec(hold.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  let id = `H${String(number).padStart(3, '0')}`
  while (used.has(id)) id = `H${String(++number).padStart(3, '0')}`
  return id
}

export function replaceCandidates(state: CandidateState, candidates: readonly Hold[]): CandidateState {
  return { confirmed: cloneHolds(state.confirmed), candidates: cloneHolds(candidates) }
}

export function confirmCandidate(state: CandidateState, candidateId: string): CandidateState {
  const candidate = state.candidates.find(hold => hold.id === candidateId)
  if (!candidate) return cloneState(state)
  const next = cloneState(state)
  next.confirmed.push({ ...cloneHold(candidate), id: nextId([...state.confirmed, ...state.candidates]) })
  next.candidates = next.candidates.filter(hold => hold.id !== candidateId)
  return next
}

export function confirmCandidates(state: CandidateState): CandidateState {
  const next = cloneState(state)
  const all = [...state.confirmed, ...state.candidates]
  for (const candidate of state.candidates) {
    next.confirmed.push({ ...cloneHold(candidate), id: nextId(all) })
    all.push(next.confirmed[next.confirmed.length - 1])
  }
  next.candidates = []
  return next
}

export function removeCandidate(state: CandidateState, candidateId: string): CandidateState {
  const next = cloneState(state)
  next.candidates = next.candidates.filter(hold => hold.id !== candidateId)
  return next
}

export function clearCandidates(state: CandidateState): CandidateState {
  return { confirmed: cloneHolds(state.confirmed), candidates: [] }
}

export function changeCandidateKind(state: CandidateState, candidateId: string, kind: HoldKind): CandidateState {
  const next = cloneState(state)
  next.candidates = next.candidates.map(hold => hold.id === candidateId ? { ...hold, kind } : hold)
  return next
}

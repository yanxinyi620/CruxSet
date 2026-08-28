import { describe, expect, it } from 'vitest'
import type { Hold } from '../miniprogram/domain/types.js'
import {
  changeCandidateKind,
  clearCandidates,
  confirmCandidate,
  confirmCandidates,
  removeCandidate,
  replaceCandidates,
  type CandidateState,
} from '../web/src/candidate-editor.js'
import { candidateHitTest, candidateStyle } from '../web/src/draft-canvas.js'

const confirmed: Hold[] = [{ id: 'H001', x: .1, y: .2, radius: .02, kind: 'hold' }]
const candidate: Hold = {
  id: 'detected-1', x: .4, y: .5, radius: .06, kind: 'volume',
  bbox: [.35, .45, .45, .55], polygon: [[.35, .45], [.45, .45], [.45, .55]],
}
const state = (): CandidateState => ({ confirmed, candidates: [] })

describe('candidate editor', () => {
  it('hits an overlapping candidate before a confirmed hold', () => {
    const confirmed = { id: 'H001', x: .5, y: .5, radius: .1, kind: 'hold' as const }
    const candidate = { id: 'detected-1', x: .5, y: .5, radius: .1, kind: 'hold' as const }

    expect(candidateHitTest([.5, .5], [confirmed], [candidate])).toEqual(candidate)
  })

  it('uses a translucent amber dashed style for candidates', () => {
    expect(candidateStyle(false)).toEqual({ color: '#f59e0b', alpha: 0.55, dashed: true })
  })

  it('replaces candidates without modifying confirmed or input arrays', () => {
    const next = replaceCandidates(state(), [candidate])

    expect(next.confirmed).toEqual(confirmed)
    expect(next.candidates).toEqual([candidate])
    expect(next).not.toBe(state)
    expect(next.confirmed).not.toBe(confirmed)
  })

  it('confirms one candidate with a unique H### id and preserves geometry', () => {
    const original = replaceCandidates(state(), [candidate])
    const next = confirmCandidate(original, candidate.id)

    expect(next.confirmed).toHaveLength(2)
    expect(next.confirmed[1]).toMatchObject({ ...candidate, id: 'H002' })
    expect(next.confirmed[1].bbox).toEqual(candidate.bbox)
    expect(next.confirmed[1].polygon).toEqual(candidate.polygon)
    expect(next.candidates).toEqual([])
    expect(original.confirmed).toEqual(confirmed)
    expect(original.candidates).toEqual([candidate])
  })

  it('confirms all candidates without colliding with existing ids', () => {
    const existing = [{ ...candidate, id: 'H003', kind: 'hold' as const }]
    const next = confirmCandidates({ confirmed: [...confirmed, { ...candidate, id: 'H002' }], candidates: existing })

    expect(next.confirmed.map(hold => hold.id)).toEqual(['H001', 'H002', 'H004'])
    expect(next.confirmed[2].kind).toBe('hold')
    expect(next.candidates).toEqual([])
  })

  it('removes or clears candidates without modifying confirmed', () => {
    const original = replaceCandidates(state(), [candidate, { ...candidate, id: 'detected-2' }])

    expect(removeCandidate(original, candidate.id).candidates.map(hold => hold.id)).toEqual(['detected-2'])
    expect(clearCandidates(original).candidates).toEqual([])
    expect(original.confirmed).toEqual(confirmed)
    expect(original.candidates).toHaveLength(2)
  })

  it('changes only the selected candidate kind', () => {
    const original = replaceCandidates(state(), [candidate])
    const next = changeCandidateKind(original, candidate.id, 'hold')

    expect(next.candidates[0]).toMatchObject({ ...candidate, kind: 'hold' })
    expect(next.confirmed).toEqual(confirmed)
    expect(original.candidates[0].kind).toBe('volume')
  })
})

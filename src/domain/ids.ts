export type IdPrefix = 'usr' | 'wall' | 'problem'

let sequence = 0

export function createId(prefix: IdPrefix, now: () => number = Date.now): string {
  sequence = (sequence + 1) % 0x100000
  return `${prefix}_${now().toString(36)}_${sequence.toString(36).padStart(4, '0')}`
}

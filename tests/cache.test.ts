import { expect, it } from 'vitest'
import { layoutCacheKey, shouldUseLayoutCache } from '../src/domain/cache.js'
it('keys layout cache by immutable layout id and version', () => { expect(layoutCacheKey('layout_1', 3)).toBe('layout:layout_1:3'); expect(shouldUseLayoutCache(3, 3)).toBe(true); expect(shouldUseLayoutCache(3, 4)).toBe(false) })

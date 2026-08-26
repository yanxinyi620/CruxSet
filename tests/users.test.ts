import { expect, it } from 'vitest'
import { createUserRecord } from '../src/domain/users.js'
it('maps an OpenID to a CruxSet user without exposing it as a business id', () => { const user=createUserRecord('openid-a', 1000, () => 'usr_fixed'); expect(user).toMatchObject({ id:'usr_fixed', openid:'openid-a', createdAt:1000, updatedAt:1000 }); expect(user.id).not.toBe(user.openid) })

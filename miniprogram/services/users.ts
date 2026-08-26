// @ts-nocheck
import { call } from './cloud.js'
export const login = () => call<{ userId: string }>('login')

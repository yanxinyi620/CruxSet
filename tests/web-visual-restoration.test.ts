import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../web/src/main.ts', import.meta.url), 'utf8')

describe('Wall-only visual restoration', () => {
  it('contains the original workspace shell vocabulary without Layout leakage', () => {
    expect(source).toContain('hero-card')
    expect(source).toContain('action-card')
    expect(source).toContain('hub-card')
    expect(source).toContain('wall-card')
    expect(source).toContain('login-page')
    expect(source).not.toMatch(/\bLayout\b|layoutId|activeLayoutId|data-layout|\/layouts/)
  })

  it('contains the restored Wall annotation controls', () => {
    expect(source).toContain('自动识别')
    expect(source).toContain('确认全部')
    expect(source).toContain('识别区域')
    expect(source).toContain('candidate-list')
    expect(source).toContain('roi-grid')
  })

  it('does not show gesture instructions in the wall annotation toolbar', () => {
    expect(source).not.toContain('双指缩放 · 单指平移')
  })

  it('keeps the login screen focused on sign in and registration choices', () => {
    expect(source).toContain('<h1>CRUXSET <span>创作工作台</span></h1>')
    expect(source).toContain('data-login')
    expect(source).toContain('data-register')
    expect(source).not.toContain('<small>CRUXSET</small><h1>本地创作工作台</h1>')
  })

  it('contains the restored problem editor presentation', () => {
    expect(source).toContain('class="field"')
    expect(source).toContain('class="role-toolbar"')
    expect(source).toMatch(/class="role-btn\s/)
    expect(source).toContain('class="legend"')
    expect(source).toContain('data-choice-open="angle"')
  })
})

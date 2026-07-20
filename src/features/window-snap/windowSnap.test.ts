import { describe, expect, it } from 'vitest'
import { windowSnapNotice } from './windowSnap'

describe('window snap notices', () => {
  it('describes the explicit target half after a native success', () => {
    expect(windowSnapNotice('left', { performed: true })).toContain('左半区')
    expect(windowSnapNotice('right', { performed: true })).toContain('右半区')
  })

  it('does not pretend a browser preview can reposition the system window', () => {
    expect(windowSnapNotice('left', { performed: false, reason: 'browser' })).toContain('无法控制 Windows 窗口位置')
  })
})

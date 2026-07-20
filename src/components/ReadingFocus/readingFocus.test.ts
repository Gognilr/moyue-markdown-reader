import { describe, expect, it } from 'vitest'
import { AUTO_SCROLL_DEFAULT_SPEED, AUTO_SCROLL_MAX_SPEED, AUTO_SCROLL_MIN_SPEED, clampAutoScrollSpeed } from './readingFocusUtils'

describe('阅读专注工具', () => {
  it('将自动滚动速度限制在舒适范围内', () => {
    expect(clampAutoScrollSpeed(0)).toBe(AUTO_SCROLL_MIN_SPEED)
    expect(clampAutoScrollSpeed(999)).toBe(AUTO_SCROLL_MAX_SPEED)
    expect(clampAutoScrollSpeed(AUTO_SCROLL_DEFAULT_SPEED)).toBe(AUTO_SCROLL_DEFAULT_SPEED)
  })
})

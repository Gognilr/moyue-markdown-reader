import { describe, expect, it } from 'vitest'
import { containedStartScrollTop, nextBlockIndex } from './containedScroll'

describe('contained document scrolling', () => {
  it('keeps a target below a stable toolbar inset without scrolling ancestors', () => {
    expect(containedStartScrollTop({ currentScrollTop: 600, clientHeight: 700, scrollHeight: 4000, containerTop: 100, targetTop: 260, topInset: 52 })).toBe(708)
  })

  it('clamps document edges and finds only the next block below the guide', () => {
    expect(containedStartScrollTop({ currentScrollTop: 3900, clientHeight: 700, scrollHeight: 4000, containerTop: 0, targetTop: 900, topInset: 40 })).toBe(3300)
    expect(nextBlockIndex([80, 160, 250, 410], 250)).toBe(3)
    expect(nextBlockIndex([80, 160, 250], 250)).toBe(-1)
  })
})
